import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { root } from "./version.mjs";
import { verifyInventory } from "./release-manifest.mjs";
const version =
  process.argv[2] ??
  JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
  throw Error("Invalid stable version.");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "modu-published-"));
const names = [
  `Modu_${version}_aarch64.app.tar.gz`,
  `Modu_${version}_aarch64.app.tar.gz.sig`,
  `Modu_${version}_aarch64.dmg`,
  "latest.json",
  "SHA256SUMS.txt",
];
try {
  for (const name of names) {
    const url = `https://github.com/Yunz93/Modu/releases/download/v${version}/${name}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok)
      throw Error(`Public asset unavailable: ${name} HTTP ${response.status}`);
    fs.writeFileSync(
      path.join(dir, name),
      Buffer.from(await response.arrayBuffer()),
      { flag: "wx" },
    );
  }
  const archive = verifyInventory(dir, version);
  const checks = fs
    .readFileSync(path.join(dir, "SHA256SUMS.txt"), "utf8")
    .trim()
    .split("\n");
  const seen = new Set();
  for (const line of checks) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (
      !match ||
      !names.includes(match[2]) ||
      match[2] === "SHA256SUMS.txt" ||
      seen.has(match[2])
    )
      throw Error("Invalid published checksum inventory.");
    seen.add(match[2]);
    const actual = createHash("sha256")
      .update(fs.readFileSync(path.join(dir, match[2])))
      .digest("hex");
    if (actual !== match[1])
      throw Error(`Published bytes changed: ${match[2]}`);
  }
  if (seen.size !== 4)
    throw Error("Published checksum inventory is incomplete.");
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
      path.join(dir, archive),
      path.join(dir, `${archive}.sig`),
      version,
    ],
    { stdio: "inherit" },
  );
  const latest = await fetch(
    "https://github.com/Yunz93/Modu/releases/latest/download/latest.json",
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!latest.ok) throw Error("Stable update endpoint is unavailable.");
  const metadata = await latest.json();
  if (metadata.version !== version)
    throw Error("Stable endpoint does not identify the verified release.");
  console.log(
    `Verified unauthenticated GitHub assets, SHA-256, trusted signature, signed version and stable endpoint: v${version}`,
  );
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
