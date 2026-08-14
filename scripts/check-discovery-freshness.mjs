#!/usr/bin/env node
// check-discovery-freshness.mjs — verifies that the committed
// discovery/cli/dist/ matches the current discovery/cli/src/*.ts.
//
// Per ADR-0021, discovery/cli/dist/ is committed to the repo
// (despite Node.js convention) so chat-sandbox agents without
// network access can run discovery without `npm install`. But
// this means the committed dist/ can drift from source if someone
// edits discovery/cli/src/*.ts and forgets to rebuild + re-commit
// dist/. This script catches that drift.
//
// How it works:
//   1. Lists all .ts files in discovery/cli/src/ recursively.
//   2. For each, computes SHA-256 of the file's contents.
//   3. Computes a "source hash" by hashing the sorted concatenation
//      of all per-file hashes. This is the canonical "current source
//      state" fingerprint.
//   4. Compares against the "last-built source hash" stored in
//      discovery/cli/dist/.source-hash (a file written by this
//      script's --update mode, OR by `npm run build` if the build
//      script is updated to write it — for now, this script's
//      --update mode is the only writer).
//   5. If the hashes match: PASS (committed dist/ is fresh).
//      If they differ: FAIL (source changed since last build;
//      run `npm run build --workspace=discovery/cli` then
//      `node scripts/check-discovery-freshness.mjs --update` then
//      `git add -f discovery/cli/dist/`).
//
// Usage:
//   node scripts/check-discovery-freshness.mjs           # check
//   node scripts/check-discovery-freshness.mjs --update  # update the hash file after a rebuild
//
// Exit codes:
//   0  fresh (or --update succeeded)
//   1  stale (source changed since last build)
//   2  no dist/ committed yet (first-time setup needed)

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SRC_DIR = join(REPO_ROOT, "discovery", "cli", "src");
const DIST_DIR = join(REPO_ROOT, "discovery", "cli", "dist");
const HASH_FILE = join(DIST_DIR, ".source-hash");

function listTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out.sort();
}

function hashFile(path) {
  const content = readFileSync(path);
  return createHash("sha256").update(content).digest("hex");
}

function computeSourceHash() {
  const files = listTsFiles(SRC_DIR);
  if (files.length === 0) {
    return { hash: "no-source-files", files: [] };
  }
  const perFile = files.map((f) => {
    const rel = relative(SRC_DIR, f);
    const h = hashFile(f);
    return `${rel}\0${h}`;
  }).join("\n");
  const hash = createHash("sha256").update(perFile).digest("hex");
  return { hash, files: files.map((f) => relative(SRC_DIR, f)) };
}

const isUpdateMode = process.argv.includes("--update");

if (!existsSync(DIST_DIR)) {
  console.error("FAIL: discovery/cli/dist/ does not exist. Run `npm run build --workspace=discovery/cli` first.");
  process.exit(2);
}

const { hash: currentHash, files } = computeSourceHash();
console.log(`Source files hashed: ${files.length}`);
console.log(`Current source hash:  ${currentHash}`);

if (isUpdateMode) {
  writeFileSync(HASH_FILE, currentHash + "\n", "utf-8");
  console.log(`Updated ${HASH_FILE}`);
  console.log("Now run: git add -f discovery/cli/dist/");
  process.exit(0);
}

if (!existsSync(HASH_FILE)) {
  console.error(`FAIL: ${HASH_FILE} does not exist.`);
  console.error("This means discovery/cli/dist/ was committed without a freshness check.");
  console.error("Run: node scripts/check-discovery-freshness.mjs --update");
  console.error("Then: git add -f discovery/cli/dist/");
  process.exit(2);
}

const storedHash = readFileSync(HASH_FILE, "utf-8").trim();
console.log(`Stored source hash:   ${storedHash}`);
console.log("");

if (currentHash === storedHash) {
  console.log("PASS: discovery/cli/dist/ is fresh (matches current source).");
  console.log("chat-sandbox agents can run `node discovery/cli/dist/cli.js` without rebuild.");
  process.exit(0);
} else {
  console.error("FAIL: discovery/cli/dist/ is STALE (source changed since last build).");
  console.error("");
  console.error("The committed dist/ does not match the current discovery/cli/src/*.ts.");
  console.error("This means chat-sandbox agents running `node discovery/cli/dist/cli.js`");
  console.error("would get the OLD build, not the current source.");
  console.error("");
  console.error("Fix:");
  console.error("  npm run build --workspace=discovery/cli");
  console.error("  node scripts/check-discovery-freshness.mjs --update");
  console.error("  git add -f discovery/cli/dist/");
  console.error("  git commit -m 'rebuild discovery/cli/dist/ after source change'");
  process.exit(1);
}
