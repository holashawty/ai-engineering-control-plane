// ADR-0033 / Roadmap 2026 Item 2 — Grammar loader.
//
// Loads Tree-sitter language grammar WASM binaries from the vendored
// directory `discovery/cli/vendor/grammars/<name>.wasm` (per ADR-0022,
// zero-runtime-deps — no npm install at runtime).
//
// Also exposes `grammarForFile(filePath)` which reads the manifest
// `tree-sitter-grammars.json` (sibling file) to map file extensions to
// grammar names. The manifest is read via `fs.readFileSync` so it
// works identically whether we're running from `src/detectors/` (test)
// or `dist/detectors/` (production build).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// Manifest search order:
//   1. Same directory as this .js file (works when running from src/
//      or from dist/ when the JSON was copied alongside).
//   2. The sibling src/detectors/ directory (fallback for dist/
//      builds where tsc didn't copy the .json — `resolveJsonModule`
//      does not emit a copy).
// This dual lookup keeps the loader robust across dev (src/) and
// production (dist/) without needing a separate postbuild copy step.
const MANIFEST_PATHS = [
  join(HERE, "tree-sitter-grammars.json"),
  join(HERE, "..", "..", "src", "detectors", "tree-sitter-grammars.json"),
];
// From src/detectors/grammar-loader.ts or dist/detectors/grammar-loader.js,
// `../../vendor` resolves to `discovery/cli/vendor`.
const VENDOR_DIR = join(HERE, "..", "..", "vendor");

// --- Manifest shape (mirrors tree-sitter-grammars.json) -------------------

export interface GrammarManifestEntry {
  wasm_file: string;
  node_types: {
    function: string;
    call: string;
    import: string;
  };
}

interface GrammarManifest {
  schema_version: string;
  extensions: Record<string, string>;
  grammars: Record<string, GrammarManifestEntry>;
}

let cachedManifest: GrammarManifest | null = null;

/** Load and cache the grammar manifest. Reads synchronously to keep the
 *  call site simple — the file is small (~3KB) and read once per process.
 *
 *  Tries `MANIFEST_PATHS` in order; the first one that exists wins. */
function loadManifest(): GrammarManifest {
  if (cachedManifest) return cachedManifest;
  let manifestPath: string | null = null;
  for (const candidate of MANIFEST_PATHS) {
    if (existsSync(candidate)) {
      manifestPath = candidate;
      break;
    }
  }
  if (!manifestPath) {
    throw new Error(
      `grammar-loader: manifest not found in any of:\n` +
      MANIFEST_PATHS.map((p) => `  - ${p}`).join("\n") +
      `\nThis file is committed source; if it is missing the repo is in a\n` +
      `corrupt state — re-run from a clean checkout.`,
    );
  }
  const raw = readFileSync(manifestPath, "utf-8");
  cachedManifest = JSON.parse(raw) as GrammarManifest;
  return cachedManifest;
}

// --- Public API -----------------------------------------------------------

/**
 * Returns the grammar name (e.g., "go", "rust") for a given file path,
 * or `null` if no grammar is registered for the file's extension.
 *
 * Example:
 *   grammarForFile("foo.go")      → "go"
 *   grammarForFile("bar.rs")      → "rust"
 *   grammarForFile("baz.xyz")     → null
 *   grammarForFile("no_ext")      → null
 */
export function grammarForFile(filePath: string): string | null {
  const manifest = loadManifest();
  const ext = extname(filePath).toLowerCase();
  if (!ext) return null;
  return manifest.extensions[ext] ?? null;
}

/**
 * Returns the per-grammar config (wasm_file path + node_types map) for
 * a grammar name, or throws if the grammar is not in the manifest.
 */
export function getGrammarConfig(grammarName: string): GrammarManifestEntry {
  const manifest = loadManifest();
  const entry = manifest.grammars[grammarName];
  if (!entry) {
    throw new Error(
      `grammar-loader: grammar "${grammarName}" is not in the manifest.\n` +
      `Known grammars: ${Object.keys(manifest.grammars).join(", ")}.`,
    );
  }
  return entry;
}

/**
 * Loads a Tree-sitter grammar WASM binary from
 * `discovery/cli/vendor/grammars/<grammarName>.wasm`.
 *
 * Per ADR-0033 + ADR-0022, the WASM binary is VENDORED (committed to
 * the repo) rather than `npm install`-ed. If the file is missing, this
 * throws with a clear message pointing the caller at the
 * `make download-grammars` ops step documented in `vendor/README.md`.
 *
 * Example:
 *   const buf = loadGrammar("go");  // Buffer of vendor/grammars/go.wasm
 */
export function loadGrammar(grammarName: string): Buffer {
  // Verify the grammar exists in the manifest first — this throws a
  // clear "unknown grammar" error if the name is bogus.
  const config = getGrammarConfig(grammarName);
  // config.wasm_file is "vendor/grammars/<name>.wasm" — relative to
  // discovery/cli/. We resolve via VENDOR_DIR's parent
  // (discovery/cli/) + the stored path, which lands at the same file
  // as `join(VENDOR_DIR, "grammars", <name>.wasm)`.
  const wasmPath = join(VENDOR_DIR, "..", config.wasm_file);
  if (!existsSync(wasmPath)) {
    throw new Error(
      `grammar-loader: grammar WASM not vendored for "${grammarName}".\n` +
      `  Expected: ${wasmPath}\n` +
      `  Per ADR-0033 + ADR-0022, grammar WASMs are VENDORED into\n` +
      `  discovery/cli/vendor/grammars/ (not npm-installed) to keep\n` +
      `  discovery/cli at zero runtime deps.\n` +
      `  Run \`make download-grammars\` (see discovery/cli/vendor/README.md)\n` +
      `  to fetch the WASM from tree-sitter GitHub releases.\n` +
      `  Known grammars: ${Object.keys(loadManifest().grammars).join(", ")}.`,
    );
  }
  return readFileSync(wasmPath);
}

// Exposed for tests / inspection — returns the absolute vendor dir path.
export function vendorDir(): string {
  return VENDOR_DIR;
}
