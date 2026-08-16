// ADR-0033 / Roadmap 2026 Item 2 — universal AST detector e2e driver.
//
// Verifies the structural integrity of the universal-ast module without
// requiring the actual Tree-sitter WASM binaries to be downloaded
// (which is a separate ops step — see discovery/cli/vendor/README.md).
//
// What this driver proves:
//   1. `discovery/cli` builds clean with the new module (zero new
//      runtime deps — ADR-0022 invariant intact).
//   2. `grammarForFile(filePath)` correctly maps file extensions to
//      grammar names per the manifest.
//   3. `loadGrammar(grammarName)` throws a clear, actionable error
//      when (a) the grammar name is unknown or (b) the WASM file is
//      not yet vendored.
//   4. `getGrammarConfig(grammarName)` returns the expected shape
//      (wasm_file + node_types.{function,call,import}).
//   5. The manifest JSON itself is well-formed (parses, has the
//      expected top-level keys, has at least 5 grammars).
//   6. `detectUniversalAst` is exported as an async function.
//   7. Calling `detectUniversalAst` without the vendored runtime
//      throws a clear error pointing at the download instructions.
//   8. `vendorDir()` returns an absolute path ending in `/vendor`.
//
// What this driver does NOT prove (out of scope until WASMs land):
//   - Actual AST parsing on a real Go/Rust/Java/C++ file.
//   - Symbol/call-graph/import extraction correctness.
//   - Cyclomatic-complexity hotspot ranking.
// These are deferred to a Phase-2 driver that runs after
// `make download-grammars` populates `discovery/cli/vendor/`.

import {
  grammarForFile,
  loadGrammar,
  getGrammarConfig,
  vendorDir,
} from "../../../discovery/cli/dist/detectors/grammar-loader.js";
import { detectUniversalAst } from "../../../discovery/cli/dist/detectors/universal-ast.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`  OK   ${label}`); passed++; }
  else { console.log(`  FAIL ${label} — ${detail}`); failed++; }
}

function expectThrows(label, fn, matcher) {
  try {
    fn();
    check(label, false, "did not throw");
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    if (matcher(msg)) check(label, true);
    else check(label, false, `threw but message did not match: ${msg.slice(0, 200)}`);
  }
}

async function expectRejects(label, fn, matcher) {
  try {
    await fn();
    check(label, false, "did not reject");
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    if (matcher(msg)) check(label, true);
    else check(label, false, `rejected but message did not match: ${msg.slice(0, 200)}`);
  }
}

async function scenario() {
  console.log("=== ADR-0033 universal-ast detector e2e ===\n");

  // --- Section 1: grammarForFile extension mapping ---
  console.log("--- grammarForFile extension mapping ---");
  check("grammarForFile('foo.go')     → 'go'",
    grammarForFile("foo.go") === "go");
  check("grammarForFile('foo.rs')     → 'rust'",
    grammarForFile("foo.rs") === "rust");
  check("grammarForFile('foo.java')   → 'java'",
    grammarForFile("foo.java") === "java");
  check("grammarForFile('foo.cpp')    → 'cpp'",
    grammarForFile("foo.cpp") === "cpp");
  check("grammarForFile('foo.cc')     → 'cpp'  (alias)",
    grammarForFile("foo.cc") === "cpp");
  check("grammarForFile('foo.cxx')    → 'cpp'  (alias)",
    grammarForFile("foo.cxx") === "cpp");
  check("grammarForFile('foo.c')      → 'c'",
    grammarForFile("foo.c") === "c");
  check("grammarForFile('foo.h')      → 'c'   (header → c grammar)",
    grammarForFile("foo.h") === "c");
  check("grammarForFile('foo.hpp')     → 'cpp' (header → cpp grammar)",
    grammarForFile("foo.hpp") === "cpp");
  check("grammarForFile('foo.kt')     → 'kotlin'",
    grammarForFile("foo.kt") === "kotlin");
  check("grammarForFile('foo.swift')  → 'swift'",
    grammarForFile("foo.swift") === "swift");
  check("grammarForFile('foo.rb')     → 'ruby'",
    grammarForFile("foo.rb") === "ruby");
  check("grammarForFile('foo.php')    → 'php'",
    grammarForFile("foo.php") === "php");
  check("grammarForFile('foo.scala')  → 'scala'",
    grammarForFile("foo.scala") === "scala");
  check("grammarForFile('foo.clj')     → 'clojure'",
    grammarForFile("foo.clj") === "clojure");

  // Unknown extension + no extension.
  check("grammarForFile('foo.xyz')    → null  (unknown ext)",
    grammarForFile("foo.xyz") === null);
  check("grammarForFile('no_ext')     → null  (no ext)",
    grammarForFile("no_ext") === null);
  check("grammarForFile('')           → null  (empty)",
    grammarForFile("") === null);
  // Case-insensitive extension match.
  check("grammarForFile('FOO.GO')     → 'go'  (case-insensitive)",
    grammarForFile("FOO.GO") === "go");

  // --- Section 2: loadGrammar error handling ---
  console.log("\n--- loadGrammar error handling ---");
  expectThrows("loadGrammar('nonexistent') throws",
    () => loadGrammar("nonexistent"),
    (m) => m.includes("not in the manifest"));
  expectThrows("loadGrammar('nonexistent') error mentions known grammars",
    () => loadGrammar("nonexistent"),
    (m) => m.includes("go") && m.includes("rust"));
  expectThrows("loadGrammar('go') throws because WASM not vendored yet",
    () => loadGrammar("go"),
    (m) => m.includes("not vendored") && m.includes("download-grammars"));
  expectThrows("loadGrammar('rust') throws because WASM not vendored yet",
    () => loadGrammar("rust"),
    (m) => m.includes("not vendored"));

  // --- Section 3: getGrammarConfig shape ---
  console.log("\n--- getGrammarConfig shape ---");
  const goCfg = getGrammarConfig("go");
  check("getGrammarConfig('go').wasm_file is 'vendor/grammars/go.wasm'",
    goCfg.wasm_file === "vendor/grammars/go.wasm", `got ${goCfg.wasm_file}`);
  check("getGrammarConfig('go').node_types.function = 'function_declaration'",
    goCfg.node_types.function === "function_declaration");
  check("getGrammarConfig('go').node_types.call = 'call_expression'",
    goCfg.node_types.call === "call_expression");
  check("getGrammarConfig('go').node_types.import = 'import_declaration'",
    goCfg.node_types.import === "import_declaration");
  const rustCfg = getGrammarConfig("rust");
  check("getGrammarConfig('rust').node_types.function = 'function_item'",
    rustCfg.node_types.function === "function_item");
  check("getGrammarConfig('rust').node_types.import = 'use_declaration'",
    rustCfg.node_types.import === "use_declaration");
  expectThrows("getGrammarConfig('nonexistent') throws",
    () => getGrammarConfig("nonexistent"),
    (m) => m.includes("not in the manifest"));

  // --- Section 4: manifest JSON is well-formed ---
  console.log("\n--- manifest JSON well-formedness ---");
  const manifestPath = join(
    __dirname, "..", "..", "..",
    "discovery", "cli", "src", "detectors", "tree-sitter-grammars.json",
  );
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    check("tree-sitter-grammars.json parses as valid JSON", true);
  } catch (e) {
    check("tree-sitter-grammars.json parses as valid JSON", false, e.message);
    manifest = {};
  }
  check("manifest has top-level 'extensions' object",
    typeof manifest.extensions === "object" && manifest.extensions !== null);
  check("manifest has top-level 'grammars' object",
    typeof manifest.grammars === "object" && manifest.grammars !== null);
  check("manifest declares at least 5 grammars",
    Object.keys(manifest.grammars ?? {}).length >= 5,
    `got ${Object.keys(manifest.grammars ?? {}).length}`);
  check("manifest declares all 5 core grammars (go, rust, java, cpp, c)",
    ["go", "rust", "java", "cpp", "c"].every((g) => g in (manifest.grammars ?? {})),
    `got ${Object.keys(manifest.grammars ?? {}).join(",")}`);
  check("manifest maps >= 10 file extensions",
    Object.keys(manifest.extensions ?? {}).length >= 10,
    `got ${Object.keys(manifest.extensions ?? {}).length}`);
  // Every grammar entry has the required shape.
  const grammarsOk = Object.entries(manifest.grammars ?? {}).every(([name, g]) => {
    const gg = g;
    return typeof gg.wasm_file === "string" &&
      typeof gg.node_types === "object" &&
      typeof gg.node_types.function === "string" &&
      typeof gg.node_types.call === "string" &&
      typeof gg.node_types.import === "string";
  });
  check("every grammar entry has wasm_file + node_types.{function,call,import}",
    grammarsOk);
  // Every extension maps to a real grammar in the manifest.
  const extMapsToGrammar = Object.entries(manifest.extensions ?? {}).every(([ext, name]) => {
    return name in (manifest.grammars ?? {});
  });
  check("every declared extension maps to a grammar in the manifest",
    extMapsToGrammar);

  // --- Section 5: universal-ast module exports ---
  console.log("\n--- universal-ast module exports ---");
  check("detectUniversalAst is exported as a function",
    typeof detectUniversalAst === "function");
  check("detectUniversalAst.length === 3 (filePath, content, grammarWasm)",
    detectUniversalAst.length === 3,
    `got length ${detectUniversalAst.length}`);

  // --- Section 6: detectUniversalAst error path (no runtime vendored) ---
  console.log("\n--- detectUniversalAst error path (runtime not vendored) ---");
  await expectRejects(
    "detectUniversalAst('foo.go', 'package main\\n', Buffer.alloc(0)) rejects with vendor-missing message",
    () => detectUniversalAst("foo.go", "package main\n", Buffer.alloc(0)),
    (m) => m.includes("Tree-sitter runtime glue not vendored") &&
           m.includes("download-grammars"),
  );
  await expectRejects(
    "detectUniversalAst('foo.xyz', ...) rejects with no-grammar message",
    () => detectUniversalAst("foo.xyz", "whatever", Buffer.alloc(0)),
    (m) => m.includes("no grammar registered"),
  );

  // --- Section 7: vendorDir() sanity ---
  console.log("\n--- vendorDir() sanity ---");
  const vDir = vendorDir();
  check("vendorDir() returns an absolute path",
    vDir.startsWith("/"),
    `got ${vDir}`);
  check("vendorDir() ends with 'vendor'",
    vDir.endsWith("/vendor"),
    `got ${vDir}`);

  // --- Section 8: zero-runtime-deps invariant (ADR-0022) ---
  console.log("\n--- ADR-0022 zero-runtime-deps invariant ---");
  const pkgPath = join(
    __dirname, "..", "..", "..",
    "discovery", "cli", "package.json",
  );
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  check("discovery/cli/package.json has no 'dependencies' key",
    !("dependencies" in pkg),
    `got dependencies: ${JSON.stringify(pkg.dependencies ?? null)}`);
  check("discovery/cli/package.json devDependencies has only typescript + @types/node",
    Object.keys(pkg.devDependencies ?? {}).sort().join(",") ===
      ["@types/node", "typescript"].sort().join(","),
    `got ${Object.keys(pkg.devDependencies ?? {}).join(",")}`);
  check("discovery/cli/package.json does NOT list web-tree-sitter at all (it's vendored)",
    !("web-tree-sitter" in (pkg.dependencies ?? {})) &&
    !("web-tree-sitter" in (pkg.devDependencies ?? {})),
    "web-tree-sitter is in package.json — must be vendored, not installed");

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
}

scenario().catch((e) => {
  console.error(`\nE2E DRIVER FAILED WITH UNCAUGHT ERROR: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
