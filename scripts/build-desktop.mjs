import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { root } from "./version.mjs";
const key =
  process.env.TAURI_SIGNING_PRIVATE_KEY_PATH ??
  path.join(os.homedir(), ".config/modu/updater.key");
if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !fs.existsSync(key))
  throw Error("缺少墨牍更新私钥，请按 docs/UPDATER.md 准备。");
const env = {
  ...process.env,
  TAURI_SIGNING_PRIVATE_KEY: process.env.TAURI_SIGNING_PRIVATE_KEY ?? key,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD:
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "",
};
execFileSync(
  path.join(root, "node_modules/.bin/tauri"),
  ["build", ...process.argv.slice(2)],
  { cwd: root, env, stdio: "inherit" },
);
