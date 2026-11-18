import DOMPurify from "dompurify";
import { httpUrl, type Article, type Source } from "./model";

const children = (element: Element, name: string) =>
  Array.from(element.children).filter((child) => child.localName === name);
const text = (element: Element, name: string) =>
  children(element, name)[0]?.textContent?.trim() ?? "";
const identity = (input: string) => encodeURIComponent(input);

export function cleanArticleHtml(html: string, base?: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "style",
      "iframe",
      "form",
      "input",
      "button",
      "video",
      "audio",
      "img",
    ],
    FORBID_ATTR: ["style", "srcset"],
  });
  const document = new DOMParser().parseFromString(sanitized, "text/html");
  document.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href")?.trim();
    const url = href ? httpUrl(href, base) : undefined;
    if (url) {
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    } else anchor.removeAttribute("href");
  });
  return document.body.innerHTML;
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
    const sources: Source[] = Array.from(
      document.getElementsByTagName("outline"),
    ).flatMap((outline) => {
      const url = httpUrl(outline.getAttribute("xmlUrl") ?? "");
      return url
        ? [
            {
              id: `feed:${identity(url)}`,
              name:
                outline.getAttribute("title") ||
                outline.getAttribute("text") ||
                new URL(url).hostname,
              url,
              kind: "pending" as const,
            },
          ]
        : [];
    });
    if (!sources.length)
      throw new Error("这个 OPML 文件中没有可用的订阅地址。");
    return { sources, articles: [] };
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
  const url =
    httpUrl(link ?? "") ?? `https://imported.invalid/${identity(name)}`;
  const source: Source = {
    id: `feed:${identity(url)}`,
    name,
    url,
    kind: "imported",
  };
  const articles: Article[] = children(channel, atom ? "entry" : "item").map(
    (item) => {
      const rawHtml =
        text(item, "encoded") ||
        text(item, "content") ||
        text(item, "description") ||
        text(item, "summary");
      const content =
        new DOMParser().parseFromString(
          DOMPurify.sanitize(rawHtml),
          "text/html",
        ).body.textContent ?? "";
      const title = text(item, "title") || content.slice(0, 40) || "无标题文章";
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
      return {
        id: `${source.id}:${identity(key)}`,
        sourceId: source.id,
        title,
        excerpt: content.slice(0, 220),
        html: cleanArticleHtml(rawHtml, articleUrl ?? url),
        date,
        url: articleUrl,
      };
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
  sources
    .filter((source) => source.kind !== "demo")
    .forEach((source) => {
      const outline = document.createElement("outline");
      Object.entries({
        type: "rss",
        text: source.name,
        title: source.name,
        xmlUrl: source.url,
      }).forEach(([key, value]) => outline.setAttribute(key, value));
      body.appendChild(outline);
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
