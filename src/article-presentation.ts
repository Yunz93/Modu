import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import katex from "katex";
import { httpUrl } from "./model";

for (const [name, grammar] of Object.entries({
  bash, cpp, css, go, java, javascript, json, python, rust, sql, swift, typescript, xml, yaml,
})) hljs.registerLanguage(name, grammar);

function formatCode(body: DocumentFragment, copyLabel: string) {
  let highlightBudget = 80_000;
  for (const pre of body.querySelectorAll("pre")) {
    const code = pre.querySelector("code");
    const node = code ?? pre;
    const language = [...node.classList, ...pre.classList]
      .map((name) => name.match(/^(?:language|lang)-([\w+-]+)$/i)?.[1])
      .find((name) => name && hljs.getLanguage(name.toLowerCase()))?.toLowerCase();
    const source = node.textContent ?? "";
    if (!source.trim()) continue;
    if (language && source.length <= Math.min(12_000, highlightBudget)) {
      node.innerHTML = hljs.highlight(source, { language }).value;
      highlightBudget -= source.length;
    }
    const box = body.ownerDocument.createElement("div");
    box.className = "reader-code";
    const copy = body.ownerDocument.createElement("button");
    copy.type = "button";
    copy.className = "reader-copy-code";
    copy.textContent = copyLabel;
    pre.replaceWith(box);
    box.append(copy, pre);
  }
}

function bindLocalLinks(body: DocumentFragment, base?: string) {
  const ids = new Map<string, string>();
  for (const target of body.querySelectorAll("[id], a[name]")) {
    const id = target.getAttribute("id") || target.getAttribute("name");
    if (!id) continue;
    const scoped = ids.get(id) ?? `modu-reader-anchor-${ids.size}`;
    if (ids.has(id)) target.removeAttribute("id");
    else target.id = scoped;
    ids.set(id, scoped);
    if (target.localName === "a") target.removeAttribute("name");
  }
  const baseUrl = base && httpUrl(base);
  for (const link of body.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href") ?? "";
    const hashIndex = href.indexOf("#");
    if (hashIndex < 0 || (hashIndex > 0 && httpUrl(href) !== baseUrl)) continue;
    const fragment = href.slice(hashIndex + 1);
    let decoded = fragment;
    try { decoded = decodeURIComponent(fragment); } catch { /* Keep the literal ID. */ }
    const target = ids.get(decoded);
    if (target) {
      link.setAttribute("href", `#${target}`);
      link.removeAttribute("target");
    } else if (hashIndex === 0) {
      if (baseUrl) {
        link.setAttribute("href", `${baseUrl}#${fragment}`);
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      } else link.removeAttribute("href");
    }
  }
}

function formatMath(body: DocumentFragment) {
  const nodes = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const candidates: Text[] = [];
  let scanBudget = 64_000;
  for (let node = nodes.nextNode(); node && candidates.length < 128; node = nodes.nextNode()) {
    if (!(node instanceof Text) || node.length > Math.min(16_000, scanBudget)) continue;
    if (!/[$\\]/.test(node.data) || node.parentElement?.closest("pre, code, kbd, samp, math, a, .feed-plain-text")) continue;
    candidates.push(node);
    scanBudget -= node.length;
    if (scanBudget === 0) break;
  }
  let remaining = 128;
  for (const node of candidates) {
    if (!remaining) break;
    const rendered = body.ownerDocument.createDocumentFragment();
    let end = 0;
    for (const match of node.data.matchAll(/(\\[\\$])|\$\$([\s\S]{1,2000}?)\$\$|\\\[([\s\S]{1,2000}?)\\\]|\\\(([^\n]{1,2000}?)\\\)|\$([^$\n]{1,2000}?)\$/g)) {
      if (!remaining) break;
      const [, escaped, dollars, brackets, parens, inline] = match;
      if (escaped) continue;
      const formula = dollars ?? brackets ?? parens ?? inline;
      if (!formula.trim()) continue;
      // Avoid taking a price range such as "$10 and $20" for an inline formula.
      if (inline && /^\s*\d/.test(inline) && !/[=+*/^_\\]/.test(inline)) continue;
      remaining--;
      const span = body.ownerDocument.createElement("span");
      span.className = "reader-formula";
      try {
        katex.render(formula, span, {
          output: "mathml", displayMode: Boolean(dollars ?? brackets), throwOnError: true,
          strict: "ignore", trust: false, maxExpand: 100, maxSize: 8,
        });
      } catch {
        continue;
      }
      rendered.append(node.data.slice(end, match.index), span);
      end = match.index + match[0].length;
    }
    if (end) {
      rendered.append(node.data.slice(end));
      node.replaceWith(rendered);
    }
  }
}

export function presentArticle(
  html: string,
  base: string | undefined,
  labels: { copy: string; embed: string; attachment: string },
) {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const element of template.content.querySelectorAll("[class]")) {
    const classes = [...element.classList].filter((name) =>
      (element.localName === "div" && name === "feed-plain-text") ||
      ((element.localName === "code" || element.localName === "pre") && /^(?:language|lang)-[\w+-]+$/i.test(name)),
    );
    if (classes.length) element.setAttribute("class", classes.join(" "));
    else element.removeAttribute("class");
  }
  bindLocalLinks(template.content, base);
  formatCode(template.content, labels.copy);
  formatMath(template.content);
  for (const link of template.content.querySelectorAll("a[data-modu-embed][href]"))
    link.textContent = labels.embed;
  for (const link of template.content.querySelectorAll("a[data-modu-attachment][href]"))
    link.textContent = labels.attachment;
  return template.innerHTML;
}
