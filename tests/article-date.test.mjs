import assert from "node:assert/strict";
import test from "node:test";
import { createArticleDateFormatter } from "../src/article-date.ts";

test("publication dates distinguish today, older articles, and past years", () => {
  const now = new Date(2026, 10, 19, 12);
  const format = createArticleDateFormatter("zh-CN", now);
  const date = (...parts) => new Date(...parts).toISOString();
  assert.equal(format(date(2026, 10, 19, 8, 30))?.label, "08:30");
  assert.equal(format(date(2026, 10, 18, 8, 30))?.label, "11月18日");
  assert.equal(format(date(2025, 10, 19, 8, 30))?.label, "2025年11月19日");
  assert.equal(format("no publication date"), null);
  assert.equal(format(""), null);
});

test("publication dates use the interface language and retain the machine-readable date", () => {
  const value = new Date(2026, 9, 17, 9).toISOString();
  const format = createArticleDateFormatter("en", new Date(2026, 10, 19));
  assert.deepEqual(format(value), { label: "Oct 17", dateTime: value });
});
