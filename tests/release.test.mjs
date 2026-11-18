import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyInventory } from "../scripts/release-manifest.mjs";
function candidate(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "modu-inventory-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const name = "Modu_0.1.1_aarch64.app.tar.gz";
  for (const file of [name, `${name}.sig`, "Modu_0.1.1_aarch64.dmg"])
    fs.writeFileSync(
      path.join(dir, file),
      file.endsWith(".sig") ? "signature" : "artifact",
    );
  const data = {
    version: "0.1.1",
    platforms: {
      "darwin-aarch64": {
        url: `https://github.com/Yunz93/Modu/releases/download/v0.1.1/${name}`,
        signature: "signature",
      },
    },
  };
  const write = () =>
    fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(data));
  write();
  return { dir, name, data, write };
}
test("release inventory rejects missing assets, wrong platform/version/source and mismatched sidecars", (t) => {
  for (const mutation of [
    (c) => (c.data.version = "0.1.2"),
    (c) => (c.data.platforms = {}),
    (c) =>
      (c.data.platforms["darwin-aarch64"].url =
        "https://example.com/update.app.tar.gz"),
    (c) => (c.data.platforms["darwin-aarch64"].signature = "other"),
    (c) => fs.unlinkSync(path.join(c.dir, c.name)),
  ]) {
    const c = candidate(t);
    mutation(c);
    c.write();
    assert.throws(() => verifyInventory(c.dir, "0.1.1"));
  }
});
test("release verifier accepts complete inventory but rejects a symlink substituted for an asset", (t) => {
  const c = candidate(t);
  assert.equal(verifyInventory(c.dir, "0.1.1"), c.name);
  const file = path.join(c.dir, c.name);
  fs.renameSync(file, `${file}.actual`);
  fs.symlinkSync(`${file}.actual`, file);
  assert.throws(() => verifyInventory(c.dir, "0.1.1"), /普通文件/);
});
