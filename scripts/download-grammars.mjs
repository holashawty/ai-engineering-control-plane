#!/usr/bin/env node
// scripts/download-grammars.mjs
//
// ADR-0033 + ADR-0022 — Tree-sitter WASM downloader.
//
// Downloads the Tree-sitter runtime (`web-tree-sitter.js` + `.wasm`)
// and each language grammar WASM listed in
// `discovery/cli/src/detectors/tree-sitter-grammars.json` into
// `discovery/cli/vendor/` and `discovery/cli/vendor/grammars/`.
//
// Why this script exists (Phase 2.5 wiring sprint follow-up):
//   The vendored binaries are committed per ADR-0021's committed-dist
//   exception, but the URLs in `discovery/cli/vendor/README.md` were
//   manual `curl` commands. In an offline CI/CD environment OR a fresh
//   clone pre-`npm install`, this script:
//     - Provides a single `npm run download-grammars` entry point.
//     - Reads the manifest so adding a new grammar doesn't require
//       touching this script (a missing-URL WARNING is printed instead
//       of a silent skip).
//     - Continues past individual download failures (partial coverage
//       is better than none — the universal-ast detector falls back
//       to regex-based naive parse for any missing grammar).
//     - Prints a clear summary so the operator knows which grammars
//       still need to be downloaded manually (e.g., if a release URL
//       404s because the version was bumped).
//
// Uses `curl` via `child_process.execSync` — same pattern as
// `scripts/init-aiecp.mjs`. No new runtime npm dependencies.
//
// Usage:
//   node scripts/download-grammars.mjs          # download everything
//   node scripts/download-grammars.mjs --check  # print what's missing without downloading
//   node scripts/download-grammars.mjs --help   # show usage
//
// Exit codes:
//   0  all downloads succeeded (or --check found no missing files)
//   1  one or more downloads failed (or files still missing after run)

import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  rmSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Paths.
// ---------------------------------------------------------------------------

const MANIFEST_PATH = join(
  REPO_ROOT,
  "discovery", "cli", "src", "detectors", "tree-sitter-grammars.json",
);
const VENDOR_DIR = join(REPO_ROOT, "discovery", "cli", "vendor");
const GRAMMARS_DIR = join(VENDOR_DIR, "grammars");

// ---------------------------------------------------------------------------
// URL table — kept in sync with `discovery/cli/vendor/README.md`.
//
// The README is the canonical source for the curl commands (and their
// version numbers); this script encodes the same URLs as a JS object so
// we can iterate over them programmatically. If you bump a grammar
// version in the README, bump it here too. (A future improvement could
// parse the README directly so there's a single source of truth —
// tracked as roadmap-2026-pro.md Item 2 Phase-2 follow-up.)
//
// Each entry: grammar name (key, matches manifest) → { url, version }.
// `version` is informational only (used in progress messages).
// ---------------------------------------------------------------------------

const RUNTIME_NPM_TARBALL_URL =
  "https://registry.npmjs.org/web-tree-sitter/-/web-tree-sitter-0.22.0.tgz";

const GRAMMAR_URLS = {
  go: {
    url: "https://github.com/tree-sitter/tree-sitter-go/releases/download/v0.21.0/tree-sitter-go.wasm",
    version: "v0.21.0",
  },
  rust: {
    url: "https://github.com/tree-sitter/tree-sitter-rust/releases/download/v0.21.0/tree-sitter-rust.wasm",
    version: "v0.21.0",
  },
  java: {
    url: "https://github.com/tree-sitter/tree-sitter-java/releases/download/v0.21.0/tree-sitter-java.wasm",
    version: "v0.21.0",
  },
  cpp: {
    url: "https://github.com/tree-sitter/tree-sitter-cpp/releases/download/v0.22.0/tree-sitter-cpp.wasm",
    version: "v0.22.0",
  },
  c: {
    url: "https://github.com/tree-sitter/tree-sitter-c/releases/download/v0.21.0/tree-sitter-c.wasm",
    version: "v0.21.0",
  },
  kotlin: {
    url: "https://github.com/tree-sitter/tree-sitter-kotlin/releases/download/v0.21.0/tree-sitter-kotlin.wasm",
    version: "v0.21.0",
  },
  swift: {
    url: "https://github.com/alex-pinkus/tree-sitter-swift/releases/download/v0.5.0/tree-sitter-swift.wasm",
    version: "v0.5.0",
  },
  ruby: {
    url: "https://github.com/tree-sitter/tree-sitter-ruby/releases/download/v0.21.0/tree-sitter-ruby.wasm",
    version: "v0.21.0",
  },
  php: {
    url: "https://github.com/tree-sitter/tree-sitter-php/releases/download/v0.22.0/tree-sitter-php.wasm",
    version: "v0.22.0",
  },
  scala: {
    url: "https://github.com/tree-sitter/tree-sitter-scala/releases/download/v0.21.0/tree-sitter-scala.wasm",
    version: "v0.21.0",
  },
  clojure: {
    url: "https://github.com/sogaiu/tree-sitter-clojure/releases/download/v0.0.11/tree-sitter-clojure.wasm",
    version: "v0.0.11",
  },
};

// ---------------------------------------------------------------------------
// Argument parsing (minimal, mirrors init-aiecp.mjs convention).
// ---------------------------------------------------------------------------

const HELP_TEXT = `Usage:
  node scripts/download-grammars.mjs
    Download the Tree-sitter runtime + every grammar WASM listed in
    discovery/cli/src/detectors/tree-sitter-grammars.json into
    discovery/cli/vendor/ and discovery/cli/vendor/grammars/.

  node scripts/download-grammars.mjs --check
    Print which grammar WASMs are missing without downloading anything.

  node scripts/download-grammars.mjs --help
    Show this help.

Exit codes:
  0  all downloads succeeded (or --check found no missing files)
  1  one or more downloads failed (or files still missing after run)`;

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log(HELP_TEXT);
  process.exit(0);
}
const wantCheck = args.has("--check");
// Reject unknown flags (security hygiene — same convention as init-aiecp.mjs).
for (const a of process.argv.slice(2)) {
  if (!["--check", "--help", "-h"].includes(a)) {
    process.stderr.write(`ERROR: unknown flag "${a}".\n`);
    process.stderr.write(`Run "node scripts/download-grammars.mjs --help" for usage.\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Read the manifest to get the list of grammars to download.
// ---------------------------------------------------------------------------

if (!existsSync(MANIFEST_PATH)) {
  process.stderr.write(`ERROR: manifest not found at ${MANIFEST_PATH}\n`);
  process.stderr.write(`The repo is in a corrupt state — re-run from a clean checkout.\n`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
const manifestGrammars = Object.keys(manifest.grammars ?? {});
if (manifestGrammars.length === 0) {
  process.stderr.write(`ERROR: manifest at ${MANIFEST_PATH} declares no grammars.\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// --check mode: just print what's missing.
// ---------------------------------------------------------------------------

if (wantCheck) {
  console.log("=== Tree-sitter grammar download status (check mode) ===\n");
  let missing = 0;
  let present = 0;

  // Runtime files.
  const runtimeJs = join(VENDOR_DIR, "web-tree-sitter.js");
  const runtimeWasm = join(VENDOR_DIR, "web-tree-sitter.wasm");
  if (existsSync(runtimeJs)) { console.log(`  OK    ${runtimeJs}`); present++; }
  else { console.log(`  MISS  ${runtimeJs}`); missing++; }
  if (existsSync(runtimeWasm)) { console.log(`  OK    ${runtimeWasm}`); present++; }
  else { console.log(`  MISS  ${runtimeWasm}`); missing++; }

  // Grammar files.
  for (const name of manifestGrammars) {
    const path = join(GRAMMARS_DIR, `${name}.wasm`);
    if (existsSync(path)) {
      const sz = statSync(path).size;
      console.log(`  OK    ${path}  (${(sz / 1024).toFixed(1)} KB)`);
      present++;
    } else {
      console.log(`  MISS  ${path}`);
      missing++;
    }
  }

  console.log(`\nSummary: ${present} present, ${missing} missing (of ${present + missing} total).`);
  process.exit(missing === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Download mode.
// ---------------------------------------------------------------------------

console.log("=== AIECP Tree-sitter grammar downloader ===");
console.log(`Manifest: ${MANIFEST_PATH}`);
console.log(`Vendor:   ${VENDOR_DIR}`);
console.log(`Grammars: ${manifestGrammars.length} declared (${manifestGrammars.join(", ")})`);
console.log("");

// Ensure target directories exist.
mkdirSync(GRAMMARS_DIR, { recursive: true });

// Track success/failure per download for the end-of-run summary.
const downloaded = [];
const failed = [];

// --- Helper: run a curl download, return true on success, false on failure.
//
// We use `execSync` with `stdio: "pipe"` so we can capture stderr without
// littering the console (curl prints progress meter to stderr by default,
// which is noisy). On failure we print a clean WARNING + the captured
// stderr excerpt (truncated) so the operator can see why it failed.
//
// `curl -fsSL`:
//   -f  fail silently on server errors (HTTP 404 etc.) — no HTML 404 page on stdout.
//   -s  silent (no progress meter).
//   -S  show error on failure.
//   -L  follow redirects (GitHub releases return 302 to CDN).
function curlDownload(url, destPath, label) {
  process.stdout.write(`  Downloading ${label}...\n`);
  process.stdout.write(`    URL:  ${url}\n`);
  process.stdout.write(`    Dest: ${destPath}\n`);
  try {
    // --retry 2   : retry twice on transient errors (DNS, 5xx).
    // --max-time 60: give up after 60s per attempt (avoid hanging in CI).
    // -o <dest>   : write to file (not stdout).
    execSync(
      `curl -fsSL --retry 2 --max-time 60 -o "${destPath}" "${url}"`,
      { stdio: "pipe" },
    );
    if (existsSync(destPath)) {
      const sz = statSync(destPath).size;
      process.stdout.write(`    OK   (${(sz / 1024).toFixed(1)} KB)\n\n`);
      return true;
    }
    // curl exited 0 but didn't write a file — treat as failure.
    process.stderr.write(`    WARN: curl exited 0 but ${destPath} not found\n\n`);
    return false;
  } catch (e) {
    const stderr = (e.stderr || "").toString().trim();
    const stdout = (e.stdout || "").toString().trim();
    const msg = (e.message || "").toString().trim();
    const detail = stderr || stdout || msg;
    process.stderr.write(`    WARN: download failed — ${detail.slice(0, 200)}\n\n`);
    // Clean up any partial file so --check doesn't think it succeeded.
    if (existsSync(destPath)) {
      try { rmSync(destPath, { force: true }); } catch { /* ignore */ }
    }
    return false;
  }
}

// --- 1. Download the Tree-sitter runtime (web-tree-sitter.js + .wasm).
//
// The runtime ships as an npm tarball containing both files under
// `package/dist/`. We extract just those two files (no node_modules
// pollution) using `tar -xz` with `--strip-components=1` to flatten
// the `package/dist/` prefix.
console.log("--- Step 1/2: Tree-sitter runtime (web-tree-sitter) ---");

const runtimeStaged = [];
const runtimeFilesOk = [];
const runtimeFilesMiss = [];

// We stage to a temp dir inside vendor/ to avoid clobbering the existing
// runtime (if any) until both files have been extracted successfully.
const STAGE_DIR = join(VENDOR_DIR, ".download-stage");
mkdirSync(STAGE_DIR, { recursive: true });

try {
  process.stdout.write(`  Downloading npm tarball...\n`);
  process.stdout.write(`    URL:  ${RUNTIME_NPM_TARBALL_URL}\n`);
  process.stdout.write(`    Dest: ${STAGE_DIR}/web-tree-sitter.tgz\n`);
  try {
    execSync(
      `curl -fsSL --retry 2 --max-time 60 -o "${join(STAGE_DIR, "web-tree-sitter.tgz")}" "${RUNTIME_NPM_TARBALL_URL}"`,
      { stdio: "pipe" },
    );
    // Extract the two files from the tarball. `tar -xz` reads gzip, and
    // `--strip-components=1` flattens `package/dist/<file>` → `dist/<file>`.
    // We then move them out of `dist/` into the vendor root.
    process.stdout.write(`  Extracting web-tree-sitter.js + .wasm from tarball...\n`);
    execSync(
      `tar -xzf "${join(STAGE_DIR, "web-tree-sitter.tgz")}" ` +
      `--strip-components=1 -C "${STAGE_DIR}" ` +
      `package/dist/web-tree-sitter.js package/dist/web-tree-sitter.wasm`,
      { stdio: "pipe" },
    );
    const jsSrc = join(STAGE_DIR, "dist", "web-tree-sitter.js");
    const wasmSrc = join(STAGE_DIR, "dist", "web-tree-sitter.wasm");
    const jsDst = join(VENDOR_DIR, "web-tree-sitter.js");
    const wasmDst = join(VENDOR_DIR, "web-tree-sitter.wasm");
    if (existsSync(jsSrc)) {
      execSync(`mv -f "${jsSrc}" "${jsDst}"`, { stdio: "pipe" });
      const sz = statSync(jsDst).size;
      process.stdout.write(`    OK   web-tree-sitter.js (${(sz / 1024).toFixed(1)} KB)\n`);
      runtimeFilesOk.push("web-tree-sitter.js");
    } else {
      process.stderr.write(`    WARN: web-tree-sitter.js not found in tarball\n`);
      runtimeFilesMiss.push("web-tree-sitter.js");
    }
    if (existsSync(wasmSrc)) {
      execSync(`mv -f "${wasmSrc}" "${wasmDst}"`, { stdio: "pipe" });
      const sz = statSync(wasmDst).size;
      process.stdout.write(`    OK   web-tree-sitter.wasm (${(sz / 1024).toFixed(1)} KB)\n`);
      runtimeFilesOk.push("web-tree-sitter.wasm");
    } else {
      process.stderr.write(`    WARN: web-tree-sitter.wasm not found in tarball\n`);
      runtimeFilesMiss.push("web-tree-sitter.wasm");
    }
    process.stdout.write("\n");
  } catch (e) {
    const detail = ((e.stderr || "") + " " + (e.message || "")).toString().trim();
    process.stderr.write(`    WARN: runtime download failed — ${detail.slice(0, 200)}\n\n`);
    runtimeFilesMiss.push("web-tree-sitter.js", "web-tree-sitter.wasm");
  }
} finally {
  // Always clean up the staging dir, even on failure.
  try { rmSync(STAGE_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
}

if (runtimeFilesMiss.length === 0) {
  downloaded.push("runtime (web-tree-sitter.js + .wasm)");
} else {
  failed.push(`runtime: ${runtimeFilesMiss.join(", ")}`);
}

// --- 2. Download each grammar WASM.
console.log("--- Step 2/2: Language grammar WASMs ---");

for (const name of manifestGrammars) {
  const entry = GRAMMAR_URLS[name];
  if (!entry) {
    process.stderr.write(`  WARN: no URL defined for grammar "${name}" — add it to scripts/download-grammars.mjs\n`);
    failed.push(`${name}.wasm (no URL defined in download-grammars.mjs)`);
    continue;
  }
  const destPath = join(GRAMMARS_DIR, `${name}.wasm`);
  const label = `${name}.wasm (${entry.version})`;
  if (curlDownload(entry.url, destPath, label)) {
    downloaded.push(`${name}.wasm`);
  } else {
    failed.push(`${name}.wasm`);
  }
}

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------

const totalExpected = manifestGrammars.length + 1; // grammars + runtime (counted as 1 unit)
const totalDownloaded = downloaded.length;
const totalFailed = failed.length;

console.log("=== Summary ===");
console.log(`Downloaded: ${totalDownloaded}/${totalExpected}`);
if (downloaded.length > 0) {
  console.log(`  ✓ ${downloaded.join(", ")}`);
}
if (failed.length > 0) {
  console.log(`Missing:   ${failed.length}`);
  console.log(`  ✗ ${failed.join(", ")}`);
  console.log("");
  console.log("Some downloads failed. The universal-ast detector will fall back");
  console.log("to regex-based naive parse for any missing grammar — see");
  console.log("discovery/cli/src/detectors/universal-ast.ts::naiveParse().");
  console.log("");
  console.log("To retry:  node scripts/download-grammars.mjs");
  console.log("To check:  node scripts/download-grammars.mjs --check");
  process.exit(1);
}
console.log("");
console.log("All downloads succeeded. The universal-ast detector can now use");
console.log("the full Tree-sitter WASM path. Verify with:");
console.log("  node executor/examples/e2e-universal-ast/drive-run.mjs");
process.exit(0);
