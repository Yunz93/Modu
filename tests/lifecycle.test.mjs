import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closeAfterSaving, closeAfterExport } from "../src/close-flow.ts";
import { createAsyncSession } from "../src/async-session.ts";
import { queueUpdates, replaceContent } from "../src/feed-updates.ts";

test("quit waits for final save; rejection and timeout leave the application open", async () => {
  const events = [];
  let finish;
  const saving = new Promise((resolve) => {
    finish = resolve;
  });
  const run = closeAfterSaving({
    save: () => saving,
    exit: async () => events.push("exit"),
  });
  assert.deepEqual(events, []);
  finish();
  await run;
  assert.deepEqual(events, ["exit"]);
  for (const save of [
    async () => {
      throw Error("disk full");
    },
    () => new Promise(() => {}),
  ]) {
    let exited = false;
    await assert.rejects(
      closeAfterSaving({
        save,
        exit: async () => {
          exited = true;
        },
        timeoutMs: 5,
      }),
    );
    assert.equal(exited, false);
  }
});
test("only a completed export permits exit; cancelling and write failure retain the session", async () => {
  const events = [];
  const exit = async () => events.push("exit");
  assert.equal(
    await closeAfterExport({ export: async () => false, exit }),
    false,
  );
  await assert.rejects(
    closeAfterExport({
      export: async () => {
        throw Error("write failed");
      },
      exit,
    }),
  );
  assert.deepEqual(events, []);
  await closeAfterExport({
    export: async () => {
      events.push("export");
      return true;
    },
    exit,
  });
  assert.deepEqual(events, ["export", "exit"]);
});
test("cancelled work cannot commit after reopening and old completion cannot own the new task", async () => {
  const session = createAsyncSession();
  const old = session.start();
  session.cancel();
  const current = session.start();
  assert.equal(old(), false);
  assert.equal(current(), true);
  const commits = [];
  if (old()) commits.push("late result");
  if (current()) commits.push("current result");
  assert.deepEqual(commits, ["current result"]);
});
test("refresh batches keep articles pending across sources and repeated zero-new fetches", () => {
  const source = { id: "one" };
  const first = {
    source,
    articles: [{ id: "a", title: "old" }, { id: "b" }],
    newCount: 2,
  };
  const pending = queueUpdates(
    [first],
    [
      {
        source: { ...source, lastError: undefined },
        articles: [{ id: "a", title: "new" }],
        newCount: 0,
      },
      { source: { id: "two" }, articles: [{ id: "c" }], newCount: 1 },
    ],
  );
  assert.equal(
    pending.reduce((n, c) => n + c.newCount, 0),
    3,
  );
  assert.deepEqual(
    pending[0].articles.map((a) => a.id),
    ["a", "b"],
  );
  assert.equal(pending[0].articles[0].title, "new");
  assert.equal(pending[1].articles[0].id, "c");
});
test("content-only results retain newer reading facts, selection, positions and appearance", () => {
  const library = JSON.parse(
    readFileSync(new URL("./fixtures/demo-backup.json", import.meta.url)),
  );
  const current = {
    ...library,
    saved: ["local-first"],
    selectedId: "local-first",
    positions: { "local-first": 420 },
    preferences: { ...library.preferences, fontSize: 26 },
  };
  const canonical = { ...library, sources: [], articles: [], selectedId: null };
  const result = replaceContent(current, canonical);
  assert.equal(result.sources, canonical.sources);
  assert.equal(result.articles, canonical.articles);
  assert.equal(result.preferences, current.preferences);
  assert.equal(result.saved, current.saved);
  assert.equal(result.positions, current.positions);
  assert.equal(result.selectedId, "local-first");
});
