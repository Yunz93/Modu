import test from "node:test";
import assert from "node:assert/strict";
import {
  filterArticles,
  httpUrl,
  isLibrary,
  mergeImport,
} from "../src/model.ts";
import { createLibrary } from "../src/data.ts";
import { groupSources, orderSources, reorderedSourceIds } from "../src/source-layout.ts";
import { discardImportedUpdates } from "../src/feed-updates.ts";

test("an import supersedes only overlapping pending articles", () => {
  const library = createLibrary();
  const [source] = library.sources;
  const visible = library.articles[0];
  const introduced = { ...visible, id: "introduced" };
  const remaining = { ...visible, id: "remaining" };
  const queued = [{ source, articles: [visible, introduced, remaining], newCount: 2 }];
  assert.deepEqual(discardImportedUpdates(queued, [visible, introduced], [visible]), [
    { source, articles: [remaining], newCount: 1 },
  ]);
});

test("cached body search respects the current feed and can expand to all feeds", () => {
  const library = createLibrary();
  const target = library.articles[0];
  const other = library.sources.find((source) => source.id !== target.sourceId);
  const text = (item) => item.id === target.id ? "正文里的独立句子" : "";
  assert.deepEqual(filterArticles(library, "all", other.id, "正文里的独立句子", null, text), []);
  assert.deepEqual(filterArticles(library, "all", null, "正文里的独立句子", null, text), [target]);
});

test("refresh keeps cached full text for the same article URL only", () => {
  const library = createLibrary();
  const article = { ...library.articles[0], url: "https://example.org/one", fullTextHtml: "<p>Cached</p>" };
  library.articles[0] = article;
  const update = { ...article, fullTextHtml: undefined };
  assert.equal(mergeImport(library, [], [update]).articles[0].fullTextHtml, article.fullTextHtml);
  assert.equal(mergeImport(library, [], [{ ...update, url: "https://example.org/two" }]).articles[0].fullTextHtml, undefined);
});

test("legacy imports preserve declared feed content only for the same body", () => {
  const library = createLibrary();
  const article = { ...library.articles[0], hasInlineContent: true };
  library.articles[0] = article;
  const legacy = { ...article, hasInlineContent: undefined };
  assert.equal(mergeImport(library, [], [legacy]).articles[0].hasInlineContent, true);
  const changed = { ...legacy, html: "<p>Summary</p>" };
  assert.equal(mergeImport(library, [], [changed]).articles[0].hasInlineContent, undefined);
  const declaredSummary = { ...article, hasInlineContent: false };
  assert.equal(mergeImport(library, [], [declaredSummary]).articles[0].hasInlineContent, false);
});

test("feed ordering and nested folders keep feed identities", () => {
  const library = createLibrary();
  const [one, two, three] = library.sources;
  const sources = [
    { ...one, name: "Zulu", folderPath: ["Tech", "Rust"] },
    { ...two, name: "Between", folderPath: ["Other"] },
    { ...three, name: "Alpha", folderPath: ["Tech", "Rust"] },
  ];
  const order = reorderedSourceIds(sources, one.id, 1);
  assert.deepEqual(order, [three.id, two.id, one.id]);
  const sorted = orderSources(sources, { ...library.preferences, feedOrder: order }, "en");
  assert.deepEqual(groupSources(sorted).groups.get("Tech").groups.get("Rust").sources.map((s) => s.id), [three.id, one.id]);
  const alphabetical = orderSources(sources, { ...library.preferences, sortFeedsByName: true }, "en");
  assert.deepEqual(alphabetical.map((s) => s.id), [three.id, two.id, one.id]);
});

test("refreshing the same article keeps read, saved and reading position", () => {
  const library = createLibrary();
  const article = library.articles[0];
  library.read = [article.id];
  library.saved = [article.id];
  library.positions[article.id] = 347;
  const updated = mergeImport(
    library,
    [library.sources[0]],
    [{ ...article, html: "<p>Updated text</p>" }],
  );
  const repeated = mergeImport(
    updated,
    [library.sources[0]],
    [{ ...article, html: "<p>Updated text</p>" }],
  );
  assert.equal(repeated.articles.length, library.articles.length);
  assert.equal(repeated.articles[0].html, "<p>Updated text</p>");
  assert.deepEqual(repeated.read, [article.id]);
  assert.deepEqual(repeated.saved, [article.id]);
  assert.equal(repeated.positions[article.id], 347);
});

test("unread selection stays visible until the reader leaves it", () => {
  const library = createLibrary();
  const id = library.articles[0].id;
  library.read = [id];
  assert.ok(
    filterArticles(library, "unread", null, "", id).some(
      (article) => article.id === id,
    ),
  );
  assert.ok(
    !filterArticles(library, "unread", null, "", null).some(
      (article) => article.id === id,
    ),
  );
});

test("import merges an existing pending subscription by URL", () => {
  const library = createLibrary();
  const source = {
    id: "pending",
    name: "Letters",
    url: "https://letters.example/feed.xml",
    kind: "pending",
  };
  library.sources.push(source);
  const result = mergeImport(
    library,
    [{ ...source, id: "imported", kind: "imported" }],
    [
      {
        id: "letter",
        sourceId: "imported",
        title: "Letter",
        excerpt: "",
        html: "<p>Hi</p>",
        date: "",
      },
    ],
  );
  assert.equal(
    result.sources.filter((item) => item.url === source.url).length,
    1,
  );
  assert.equal(
    result.sources.find((item) => item.id === "pending").kind,
    "imported",
  );
  assert.equal(
    result.articles.find((item) => item.id === "letter").sourceId,
    "pending",
  );
});

test("unsafe URLs never become article or subscription links", () => {
  assert.equal(httpUrl("javascript:alert(1)"), undefined);
  assert.equal(httpUrl("file:///etc/passwd"), undefined);
  assert.equal(httpUrl("https://name:password@example.com/feed"), undefined);
  assert.equal(
    httpUrl("/post#heading", "https://example.com/feed"),
    "https://example.com/post",
  );
});

test("bad backups are rejected before replacing the current library", () => {
  assert.equal(isLibrary(createLibrary()), true);
  const badDate = createLibrary();
  badDate.articles = [{ ...badDate.articles[0], date: "not-a-date" }];
  assert.equal(isLibrary(badDate), false);
  const badUrl = createLibrary();
  badUrl.articles = [{ ...badUrl.articles[0], url: "javascript:alert(1)" }];
  assert.equal(isLibrary(badUrl), false);
});
