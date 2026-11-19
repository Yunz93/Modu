import DOMPurify from "dompurify";
import { httpUrl, type Article, type Source } from "./model";
import { folderPath } from "./source-layout";

const children = (element: Element, name: string) =>
  Array.from(element.children).filter((child) => child.localName === name);
const text = (element: Element, name: string) =>
  children(element, name)[0]?.textContent?.trim() ?? "";
const identity = (input: string) => encodeURIComponent(input);

const mediaSourceSelector = "img[src], audio[src], video[src], audio source[src], video source[src]";
const mediaRssNamespace = "http://search.yahoo.com/mrss/";
type Attachment = { url: string; mime: string };

function mediaTag(url: string, mime: string) {
  const kind = mime.toLowerCase().split("/")[0];
  if (kind === "image") return "img";
  if (kind === "audio" || kind === "video") return kind;

  const path = new URL(url).pathname.toLowerCase();
  if (/\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/.test(path)) return "img";
  if (/\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/.test(path)) return "audio";
  if (/\.(m3u8|m4v|mov|mp4|ogv|webm)$/.test(path)) return "video";
}

function articleMarkup(html: string, base?: string, attachments: Attachment[] = []) {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true },
    ADD_ATTR: ["data-src"],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "iframe", "form", "input", "button", "object", "embed", "track"],
    FORBID_ATTR: ["style", "srcset", "autoplay", "ping"],
  });
  // Keep sanitized markup detached until the reader mounts the article.
  const body = fragment.ownerDocument.createElement("div");
  body.append(fragment);
  const resolve = (value: string | null) => {
    const input = value?.trim();
    return input ? httpUrl(input, base) : undefined;
  };

  for (const anchor of body.querySelectorAll("a")) {
    const url = resolve(anchor.getAttribute("href"));
    if (url) {
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    } else anchor.removeAttribute("href");
  }

  const seen = new Set(
    Array.from(body.querySelectorAll(`${mediaSourceSelector}, img[data-src]`), (media) =>
      resolve(media.getAttribute("src")) ?? resolve(media.getAttribute("data-src")),
    ),
  );
  for (const attachment of attachments) {
    const url = resolve(attachment.url);
    if (!url || seen.has(url)) continue;
    const tag = mediaTag(url, attachment.mime);
    if (!tag) continue;
    const element = body.ownerDocument.createElement(tag);
    element.setAttribute("src", url);
    if (tag === "img") element.setAttribute("alt", "");
    body.append(element);
    seen.add(url);
  }
  for (const image of body.querySelectorAll("img")) {
    const url = resolve(image.getAttribute("src")) ?? resolve(image.getAttribute("data-src"));
    if (!url) {
      image.remove();
      continue;
    }
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
    image.setAttribute("referrerpolicy", "no-referrer");
    image.setAttribute("src", url);
    image.removeAttribute("data-src");
  }
  for (const source of body.querySelectorAll("source")) {
    const url = resolve(source.getAttribute("src"));
    if (url && source.parentElement?.matches("audio, video")) {
      source.setAttribute("src", url);
    } else source.remove();
  }
  for (const media of body.querySelectorAll("audio, video")) {
    const url = resolve(media.getAttribute("src"));
    if (url) media.setAttribute("src", url);
    else media.removeAttribute("src");
    if (!url && !media.querySelector(":scope > source[src]")) {
      media.replaceWith(...media.childNodes);
      continue;
    }
    const poster = resolve(media.getAttribute("poster"));
    if (media.tagName === "VIDEO" && poster) media.setAttribute("poster", poster);
    else media.removeAttribute("poster");
    media.setAttribute("controls", "");
    media.setAttribute("preload", "none");
    media.removeAttribute("loop");
    if (media.tagName === "VIDEO") media.setAttribute("playsinline", "");
  }
  return body;
}

export function cleanArticleHtml(html: string, base?: string): string {
  return articleMarkup(html, base).innerHTML;
}

const indexedText = new WeakMap<Article, string>();

export function cachedArticleText(article: Article): string {
  const cached = indexedText.get(article);
  if (cached !== undefined) return cached;
  const template = document.createElement("template");
  template.innerHTML = article.html;
  if (article.fullTextHtml) {
    const fullText = document.createElement("template");
    fullText.innerHTML = article.fullTextHtml;
    template.content.append(" ", fullText.content);
  }
  template.content.querySelectorAll("script, style, iframe").forEach((node) => node.remove());
  template.content.querySelectorAll("address, blockquote, br, dd, div, dl, dt, figcaption, h1, h2, h3, h4, h5, h6, li, p, pre, section, td, th, tr")
    .forEach((element) => element.after(" "));
  const value = (template.content.textContent ?? "").replace(/\s+/g, " ").toLocaleLowerCase();
  indexedText.set(article, value);
  return value;
}

function feedMarkup(item: Element, name: string): string {
  const element = children(item, name).find((child) => child.namespaceURI !== mediaRssNamespace);
  if (element?.getAttribute("type") === "xhtml") {
    const serializer = new XMLSerializer();
    return Array.from(element.children, (child) => serializer.serializeToString(child)).join("");
  }
  return element?.textContent?.trim() ?? "";
}

function feedAttachments(item: Element, atom: boolean, base?: string): Attachment[] {
  const elements = atom
    ? children(item, "link").filter((link) => link.getAttribute("rel") === "enclosure")
    : children(item, "enclosure");
  const media = Array.from(item.getElementsByTagNameNS(mediaRssNamespace, "content"));
  return [...elements, ...media].slice(0, 32).flatMap((element) => {
    const value = (element.getAttribute("url") || element.getAttribute("href"))?.trim();
    const url = value ? httpUrl(value, base) : undefined;
    return url ? [{ url, mime: element.getAttribute("type") ?? "" }] : [];
  });
}

export function parseFeedFile(xml: string): {
  sources: Source[];
  articles: Article[];
} {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror"))
    throw new Error("文件内容不是有效的 XML，请检查后重新导入。");
  const root = document.documentElement;
  if (root.localName === "opml") {
    const entry = children(root, "body")[0];
    const sources = new Map<string, Source>();
    function collect(parent: Element, path: string[], depth: number) {
      if (depth > 32) throw new Error("OPML 分组层级过深。");
      for (const outline of children(parent, "outline")) {
        const address = outline.getAttribute("xmlUrl");
        const url = address ? httpUrl(address) : undefined;
        const name = (outline.getAttribute("title") || outline.getAttribute("text") || "").trim();
        if (url && !sources.has(url)) {
          sources.set(url, {
            id: `feed:${identity(url)}`, name: name || new URL(url).hostname,
            url, kind: "pending", folderPath: path,
          });
        }
        const nested = !address && name ? [...path, name] : path;
        if (outline.childElementCount) collect(outline, nested, depth + 1);
      }
    }
    if (entry) collect(entry, [], 0);
    if (!sources.size)
      throw new Error("这个 OPML 文件中没有可用的订阅地址。");
    return { sources: [...sources.values()], articles: [] };
  }
  const atom = root.localName === "feed";
  const channel = atom ? root : children(root, "channel")[0];
  if (!channel || (!atom && root.localName !== "rss"))
    throw new Error("请导入 RSS 2.0、Atom 或 OPML 文件。");
  const link =
    children(channel, "link")
      .find((link) => link.getAttribute("rel") === "self")
      ?.getAttribute("href") ||
    children(channel, "link")
      .find(
        (link) =>
          !link.getAttribute("rel") || link.getAttribute("rel") === "alternate",
      )
      ?.getAttribute("href") ||
    text(channel, "link");
  const name = text(channel, "title") || "导入的订阅";
  const feedUrl = httpUrl(link ?? "");
  const url = feedUrl ?? `https://imported.invalid/${identity(name)}`;
  const source: Source = {
    id: `feed:${identity(url)}`,
    name,
    url,
    kind: "imported",
  };
  const seenKeys = new Set<string>();
  const articles: Article[] = children(channel, atom ? "entry" : "item").flatMap(
    (item) => {
      const rawHtml =
        feedMarkup(item, "encoded") ||
        feedMarkup(item, "content") ||
        feedMarkup(item, "description") ||
        feedMarkup(item, "summary");
      const rawLink = atom
        ? children(item, "link")
            .find(
              (link) =>
                !link.getAttribute("rel") ||
                link.getAttribute("rel") === "alternate",
            )
            ?.getAttribute("href")
        : text(item, "link");
      const articleUrl = rawLink ? httpUrl(rawLink, url) : undefined;
      const body = articleMarkup(rawHtml, articleUrl ?? feedUrl, feedAttachments(item, atom, feedUrl));
      const content = body.textContent ?? "";
      const title = text(item, "title") || content.slice(0, 40) || "无标题文章";
      const dateInput =
        text(item, "published") ||
        text(item, "pubDate") ||
        text(item, "updated");
      const date = Number.isFinite(Date.parse(dateInput))
        ? new Date(dateInput).toISOString()
        : "";
      const key =
        text(item, "id") ||
        text(item, "guid") ||
        articleUrl ||
        `${title}:${date}`;
      if (seenKeys.has(key)) return [];
      seenKeys.add(key);
      return [{
        id: `${source.id}:${identity(key)}`,
        sourceId: source.id,
        externalId: key,
        title,
        excerpt: content.slice(0, 220),
        html: body.innerHTML,
        date,
        url: articleUrl,
      }];
    },
  );
  if (!articles.length)
    throw new Error("已识别订阅格式，但文件中没有文章。请尝试其他文件。");
  return { sources: [source], articles };
}

export function exportOpml(sources: Source[]): string {
  const document = new DOMParser().parseFromString(
    '<opml version="2.0"><head><title>墨牍订阅</title></head><body/></opml>',
    "application/xml",
  );
  const body = document.getElementsByTagName("body")[0];
  const groups = new Map<string, Element>([["[]", body]]);
  sources
    .filter((source) => source.kind !== "demo")
    .forEach((source) => {
      let parent: Element = body;
      const path = folderPath(source);
      for (let depth = 0; depth < path.length; depth++) {
        const key = JSON.stringify(path.slice(0, depth + 1));
        let group = groups.get(key);
        if (!group) {
          group = document.createElement("outline");
          group.setAttribute("text", path[depth]);
          group.setAttribute("title", path[depth]);
          parent.appendChild(group);
          groups.set(key, group);
        }
        parent = group;
      }
      const outline = document.createElement("outline");
      Object.entries({
        type: "rss",
        text: source.name,
        title: source.name,
        xmlUrl: source.url,
      }).forEach(([key, value]) => outline.setAttribute(key, value));
      parent.appendChild(outline);
    });
  return new XMLSerializer().serializeToString(document);
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
