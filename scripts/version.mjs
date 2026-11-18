import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function syncVersion(tag) {
  const version = tag.replace(/^v/, "");
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw Error("正式版必须使用 vX.Y.Z 格式。");
  for (const name of ["package.json", "src-tauri/tauri.conf.json"]) {
    const file = path.join(root, name);
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    value.version = version;
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
  }
  const lock = path.join(root, "package-lock.json");
  const data = JSON.parse(fs.readFileSync(lock, "utf8"));
  data.name = "modu";
  data.version = version;
  data.packages[""].name = "modu";
  data.packages[""].version = version;
  fs.writeFileSync(lock, JSON.stringify(data, null, 2) + "\n");
  const cargo = path.join(root, "src-tauri/Cargo.toml");
  fs.writeFileSync(
    cargo,
    fs
      .readFileSync(cargo, "utf8")
      .replace(
        /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/,
        `$1${version}$2`,
      ),
  );
  return version;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(syncVersion(process.argv[2] ?? ""));
}
