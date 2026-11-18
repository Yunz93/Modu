import test from "node:test";
import assert from "node:assert/strict";
import {
  filterArticles,
  httpUrl,
  isLibrary,
  mergeImport,
} from "../src/model.ts";
import { createLibrary } from "../src/data.ts";

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
