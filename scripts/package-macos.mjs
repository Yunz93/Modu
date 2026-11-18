import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const app = path.join(root, "src-tauri/target/release/bundle/macos/墨牍.app");
const run = (file, args) => execFileSync(file, args, { stdio: "inherit" });
const builtVersion = execFileSync(
  "/usr/libexec/PlistBuddy",
  [
    "-c",
    "Print:CFBundleShortVersionString",
    path.join(app, "Contents/Info.plist"),
  ],
  { encoding: "utf8" },
).trim();
if (builtVersion !== version)
  throw Error("应用版本与 package.json 不一致，请重新构建。");
run("codesign", ["--verify", "--deep", "--strict", app]);
const release = path.join(root, "release");
const staging = path.join(release, ".dmg-staging");
await fs.mkdir(release, { recursive: true });
await fs.rm(staging, { recursive: true, force: true });
await fs.mkdir(staging);
run("ditto", [app, path.join(staging, "墨牍.app")]);
await fs.symlink("/Applications", path.join(staging, "Applications"));
const stem = `墨牍-${version}-arm64`;
const dmg = path.join(release, `${stem}.dmg`);
const zip = path.join(release, `${stem}.zip`);
run("hdiutil", [
  "create",
  "-volname",
  "墨牍",
  "-srcfolder",
  staging,
  "-ov",
  "-format",
  "UDZO",
  "-fs",
  "HFS+",
  dmg,
]);
run("hdiutil", ["verify", dmg]);
run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, zip]);
const checks = [];
for (const file of [dmg, zip])
  checks.push(
    `${createHash("sha256")
      .update(await fs.readFile(file))
      .digest("hex")}  ${path.basename(file)}`,
  );
await fs.writeFile(
  path.join(release, "SHA256SUMS.txt"),
  checks.join("\n") + "\n",
);
await fs.rm(staging, { recursive: true, force: true });
process.stdout.write(`已生成 ${dmg}\n${zip}\n`);
