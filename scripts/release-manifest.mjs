import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { root } from "./version.mjs";
export function verifyInventory(directory, version) {
  const expected = `Modu_${version}_aarch64.app.tar.gz`;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, "latest.json"), "utf8"),
  );
  if (manifest.version !== version) throw Error("清单版本不一致。");
  const platform = manifest.platforms?.["darwin-aarch64"];
  if (!platform || Object.keys(manifest.platforms).length !== 1)
    throw Error("更新平台缺失或不受支持。");
  if (
    platform.url !==
    `https://github.com/Yunz93/Modu/releases/download/v${version}/${expected}`
  )
    throw Error("更新 URL 与仓库、版本或产物不匹配。");
  const signature = fs
    .readFileSync(path.join(directory, `${expected}.sig`), "utf8")
    .trim();
  if (!signature || signature !== platform.signature)
    throw Error("清单签名与实际签名不一致。");
  for (const name of [
    expected,
    `${expected}.sig`,
    `Modu_${version}_aarch64.dmg`,
    "latest.json",
  ]) {
    const stat = fs.lstatSync(path.join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink())
      throw Error(`发布资产不是普通文件：${name}`);
  }
  return expected;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ).version;
  const directory = path.resolve(
    process.argv[2] ?? path.join(root, "release", `v${version}`),
  );
  const bundle = path.join(root, "src-tauri/target/release/bundle/macos");
  const archive = `Modu_${version}_aarch64.app.tar.gz`;
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(
    path.join(bundle, "墨牍.app.tar.gz"),
    path.join(directory, archive),
  );
  fs.copyFileSync(
    path.join(bundle, "墨牍.app.tar.gz.sig"),
    path.join(directory, `${archive}.sig`),
  );
  fs.copyFileSync(
    path.join(root, "release", `墨牍-${version}-arm64.dmg`),
    path.join(directory, `Modu_${version}_aarch64.dmg`),
  );
  const notes = fs
    .readFileSync(path.join(root, "CHANGELOG.md"), "utf8")
    .split(`## ${version}`)[1]
    ?.split("\n## ")[0]
    ?.trim();
  if (!notes) throw Error("请先填写当前版本的更新日志。");
  const manifest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: {
      "darwin-aarch64": {
        url: `https://github.com/Yunz93/Modu/releases/download/v${version}/${archive}`,
        signature: fs
          .readFileSync(path.join(directory, `${archive}.sig`), "utf8")
          .trim(),
      },
    },
  };
  fs.writeFileSync(
    path.join(directory, "latest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  verifyInventory(directory, version);
  execFileSync(
    "cargo",
    [
      "run",
      "--quiet",
      "--manifest-path",
      path.join(root, "src-tauri/Cargo.toml"),
      "--example",
      "verify-update",
      "--",
      path.join(directory, archive),
      path.join(directory, `${archive}.sig`),
      version,
    ],
    { stdio: "inherit" },
  );
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "modu-release-"));
  try {
    const archivePath = path.join(directory, archive);
    const entries = execFileSync("tar", ["-tzf", archivePath], {
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    if (
      entries.some(
        (name) =>
          !name.startsWith("墨牍.app/") || name.split("/").includes(".."),
      )
    )
      throw Error("更新包包含不合法的路径。");
    execFileSync("tar", ["-xzf", archivePath, "-C", temporary]);
    const app = path.join(temporary, "墨牍.app");
    const plist = path.join(app, "Contents/Info.plist");
    const read = (key) =>
      execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print:${key}`, plist], {
        encoding: "utf8",
      }).trim();
    if (
      read("CFBundleIdentifier") !== "com.yunz.modu" ||
      read("CFBundleShortVersionString") !== version
    )
      throw Error("更新包的应用身份或版本不匹配。");
    if (
      execFileSync("lipo", ["-archs", path.join(app, "Contents/MacOS/modu")], {
        encoding: "utf8",
      }).trim() !== "arm64"
    )
      throw Error("更新包架构不匹配。");
    execFileSync("codesign", ["--verify", "--deep", "--strict", app]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  const checks = fs
    .readdirSync(directory)
    .filter((name) => name !== "SHA256SUMS.txt")
    .sort()
    .map(
      (name) =>
        `${createHash("sha256")
          .update(fs.readFileSync(path.join(directory, name)))
          .digest("hex")}  ${name}`,
    );
  fs.writeFileSync(
    path.join(directory, "SHA256SUMS.txt"),
    checks.join("\n") + "\n",
  );
  console.log(`Verified release candidate: ${directory}`);
}
