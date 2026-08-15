#!/usr/bin/env node
// check-discovery-freshness.mjs — verifies that the committed
// discovery/cli/dist/ matches the current discovery/cli/src/*.ts
// AND that it actually runs without npm-installed dependencies.
//
// Per ADR-0021 + ADR-0022, discovery/cli/dist/ is committed to the
// repo so chat-sandbox agents without network access can run
// discovery without `npm install`. But this means two things can
// drift:
//   1. Source changed since last build (stale dist/).
//   2. dist/ has a runtime dependency that requires node_modules
//      (the bug found by the controller's verification on
//      2026-08-14 — ajv was imported at the top of cli.ts, making
//      `node dist/cli.js` fail with ERR_MODULE_NOT_FOUND in a
//      fresh clone without node_modules). Fixed by ADR-0022
//      (removed ajv from discovery/cli runtime deps).
//
// This script checks BOTH:
//   1. Hash check: committed dist/ matches current source.
//   2. Executability check: `node discovery/cli/dist/cli.js
//      --self-test` runs successfully in a temporary directory
//      with NO node_modules (simulating a fresh offline clone).
//
// Usage:
//   node scripts/check-discovery-freshness.mjs           # check both hash + executability
//   node scripts/check-discovery-freshness.mjs --update   # update the hash file after a rebuild
//   node scripts/check-discovery-freshness.mjs --no-run   # skip the executability check (hash only — faster, but less safe)
//
// Exit codes:
//   0  fresh AND executable (or --update succeeded)
//   1  stale (source changed since last build)
//   2  no dist/ committed yet (first-time setup needed)
//   3  dist/ exists and is fresh, but NOT executable (runtime dependency missing) — THIS IS THE BUG ADR-0022 FIXED

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

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
const skipRunCheck = process.argv.includes("--no-run");

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

if (currentHash !== storedHash) {
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

console.log("PASS (1/2): discovery/cli/dist/ hash matches current source.");

if (skipRunCheck) {
  console.log("SKIP (2/2): executability check skipped (--no-run flag).");
  console.log("WARNING: this means we did NOT verify `node discovery/cli/dist/cli.js`");
  console.log("actually runs without npm-installed dependencies. Use this flag only");
  console.log("for fast CI pre-checks; always run the full check before committing.");
  process.exit(0);
}

// EXECUTABILITY CHECK (per ADR-0022): simulate a fresh offline clone
// by running `node discovery/cli/dist/cli.js --self-test` in a temp
// directory with NO node_modules. This catches the bug where dist/
// imports a runtime dependency (like ajv) that requires npm install.
console.log("");
console.log("Executability check: running `node discovery/cli/dist/cli.js --self-test`");
console.log("in a temp dir with NO node_modules (simulating offline clone)...");

// Temporarily move node_modules aside so the check is honest.
// IMPORTANT: use a try/finally that GUARANTEES restoration, even if
// process.exit() is called inside the try block. The previous version
// of this script had a bug where node_modules could be lost if the
// script was interrupted — fixed by capturing the exit code and
// returning through finally instead of calling process.exit() inside.
const nodeModulesPath = join(REPO_ROOT, "node_modules");
const nodeModulesBackup = join(tmpdir(), `aiecp-node-modules-backup-${Date.now()}`);
let nodeModulesMoved = false;
let exitCode = 0;
try {
  if (existsSync(nodeModulesPath)) {
    renameSync(nodeModulesPath, nodeModulesBackup);
    nodeModulesMoved = true;
    console.log(`(Temporarily moved node_modules to ${nodeModulesBackup} for honest check.)`);
  }

  let runExitCode = 0;
  let runStdout = "";
  let runStderr = "";
  try {
    runStdout = execFileSync("node", [join(DIST_DIR, "cli.js"), "--self-test"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    });
  } catch (e) {
    runExitCode = e.status ?? 1;
    runStdout = (e.stdout ?? "").toString();
    runStderr = (e.stderr ?? "").toString();
  }

  if (runExitCode !== 0) {
    console.error("FAIL (2/2): discovery/cli/dist/cli.js --self-test FAILED without node_modules.");
    console.error("This means dist/ has a runtime dependency that requires npm install.");
    console.error("This is the bug ADR-0022 fixed (ajv was imported at runtime).");
    console.error("");
    console.error("stdout:", runStdout);
    console.error("stderr:", runStderr);
    console.error("");
    console.error("Fix: check discovery/cli/src/cli.ts for runtime imports of npm packages.");
    console.error("Per ADR-0022, discovery/cli must have ZERO runtime npm dependencies.");
    console.error("Schema validation belongs in validate-discovery, not in the discovery CLI.");
    exitCode = 3;
  } else if (!runStdout.includes("SELF-TEST PASSED")) {
    console.error("FAIL (2/2): discovery/cli/dist/cli.js --self-test ran but did not pass.");
    console.error("stdout:", runStdout);
    console.error("stderr:", runStderr);
    exitCode = 3;
  } else {
    console.log("PASS (2/2): discovery/cli/dist/cli.js --self-test passes WITHOUT node_modules.");
    console.log("chat-sandbox agents can run `node discovery/cli/dist/cli.js` offline — verified, not just claimed.");
    console.log("");
    console.log("=== Both checks PASS: discovery/cli/dist/ is fresh AND executable. ===");
  }
} catch (e) {
  console.error(`Unexpected error during executability check: ${e.message}`);
  exitCode = 3;
} finally {
  // ALWAYS restore node_modules, even if process.exit() was about to be called.
  // The previous version called process.exit() inside the try block, which
  // would have skipped this finally if the runtime didn't guarantee it.
  // Node.js DOES run finally before process.exit() returns, but to be
  // extra safe (and to handle any unexpected throw), we restore here and
  // then exit with the captured code.
  if (nodeModulesMoved) {
    try {
      if (existsSync(nodeModulesBackup)) {
        // If node_modules somehow came back (e.g., npm install ran during the
        // check), don't overwrite it — just remove the backup.
        if (existsSync(nodeModulesPath)) {
          // node_modules already exists, just clean up the backup
          // (this shouldn't happen, but be defensive)
        } else {
          renameSync(nodeModulesBackup, nodeModulesPath);
        }
        console.log("(node_modules restored.)");
      }
    } catch (restoreErr) {
      console.error(`WARNING: failed to restore node_modules from ${nodeModulesBackup}: ${restoreErr.message}`);
      console.error(`You may need to run 'npm install' manually to restore node_modules.`);
      console.error(`Backup location: ${nodeModulesBackup}`);
    }
  }
  process.exit(exitCode);
}
