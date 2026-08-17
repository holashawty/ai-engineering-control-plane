// ADR-0033 / Roadmap 2026 Item 2 — universal AST detector e2e driver.
//
// Verifies the structural integrity of the universal-ast module without
// requiring the actual Tree-sitter WASM binaries to be downloaded
// (which is a separate ops step — see discovery/cli/vendor/README.md
// and `npm run download-grammars`).
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
//   7. (Phase 2.5 follow-up) Calling `detectUniversalAst` WITHOUT the
//      vendored runtime / grammar WASM does NOT throw — it falls back
//      to a regex-based naive parse, returning a result with
//      `fallback: true` and a human-readable `fallback_reason`. This
//      is the "graceful degradation" contract for offline CI/CD and
//      fresh-clone-pre-`download-grammars` environments.
//   8. The regex-based fallback actually extracts symbols (functions,
//      classes, imports) — verified against a tiny JS sample.
//   9. `vendorDir()` returns an absolute path ending in `/vendor`.
//
// What this driver does NOT prove (out of scope until WASMs land):
//   - Actual AST parsing on a real Go/Rust/Java/C++ file.
//   - Symbol/call-graph/import extraction correctness on the AST path.
//   - Cyclomatic-complexity hotspot ranking on the AST path.
// These are deferred to a Phase-2 driver that runs after
// `npm run download-grammars` populates `discovery/cli/vendor/`.

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

  // --- Section 6: detectUniversalAst WASM-missing fallback (Phase 2.5) ---
  //
  // Phase 2.5 follow-up (pro-LLM audit): `detectUniversalAst` MUST NOT
  // throw when the Tree-sitter runtime glue is missing, when the
  // grammar WASM buffer is empty / malformed, or when the parser
  // returns a null tree. Instead it falls back to `naiveParse()` — a
  // regex-based parser using language-specific patterns. The result
  // carries `fallback: true` and a human-readable `fallback_reason`.
  //
  // The ONE case that still throws is a truly unknown file extension
  // (no manifest entry, no regex-inferable language) — there's nothing
  // useful to do without knowing the language, so we surface the error
  // rather than silently returning empty symbols.
  console.log("\n--- detectUniversalAst WASM-missing fallback (Phase 2.5) ---");

  // 6a: foo.go with empty WASM buffer — used to throw, now returns fallback.
  // (grammarForFile('foo.go') → 'go' is in the manifest; loadTreeSitterRuntime
  // throws because vendor/web-tree-sitter.js is missing; we catch and fall back.)
  const fbGo = await detectUniversalAst("foo.go", "package main\n", Buffer.alloc(0));
  check("detectUniversalAst('foo.go', ..., Buffer.alloc(0)) does NOT throw — returns fallback result",
    fbGo.fallback === true,
    `got fallback=${fbGo.fallback}`);
  check("detectUniversalAst('foo.go') fallback result has fallback_reason string",
    typeof fbGo.fallback_reason === "string" && fbGo.fallback_reason.length > 0,
    `got reason: ${JSON.stringify(fbGo.fallback_reason)}`);
  check("detectUniversalAst('foo.go') fallback_reason mentions 'WASM grammar not available'",
    (fbGo.fallback_reason ?? "").includes("WASM grammar not available"),
    `got reason: ${JSON.stringify(fbGo.fallback_reason)}`);
  check("detectUniversalAst('foo.go') fallback result has symbols array (empty for 'package main')",
    Array.isArray(fbGo.symbols) && fbGo.symbols.length === 0,
    `got symbols: ${JSON.stringify(fbGo.symbols)}`);
  check("detectUniversalAst('foo.go') fallback result has call_graph array",
    Array.isArray(fbGo.call_graph),
    `got call_graph: ${typeof fbGo.call_graph}`);
  check("detectUniversalAst('foo.go') fallback result has imports array",
    Array.isArray(fbGo.imports),
    `got imports: ${typeof fbGo.imports}`);
  check("detectUniversalAst('foo.go') fallback result has complexity_hotspots array",
    Array.isArray(fbGo.complexity_hotspots),
    `got complexity_hotspots: ${typeof fbGo.complexity_hotspots}`);

  // 6b: foo.go with actual Go content — fallback should still extract
  // symbols via the Go regex patterns (functions only; classes are
  // `type X struct` which we don't trigger here).
  const fbGoWithFunc = await detectUniversalAst(
    "foo.go",
    "package main\nfunc main() {}\nfunc helper() {}\n",
    Buffer.alloc(0),
  );
  check("detectUniversalAst('foo.go' with funcs, empty WASM) returns fallback",
    fbGoWithFunc.fallback === true,
    `got fallback=${fbGoWithFunc.fallback}`);
  check("detectUniversalAst('foo.go' with funcs) extracts 'main' via Go regex",
    fbGoWithFunc.symbols.some((s) => s.name === "main" && s.kind === "function"),
    `got symbols: ${JSON.stringify(fbGoWithFunc.symbols)}`);
  check("detectUniversalAst('foo.go' with funcs) extracts 'helper' via Go regex",
    fbGoWithFunc.symbols.some((s) => s.name === "helper" && s.kind === "function"));
  check("detectUniversalAst('foo.go' with funcs) returns exactly 2 symbols",
    fbGoWithFunc.symbols.length === 2,
    `got ${fbGoWithFunc.symbols.length}`);
  check("detectUniversalAst('foo.go' with funcs) hotspots: 1 per function, complexity=1",
    fbGoWithFunc.complexity_hotspots.length === 2 &&
    fbGoWithFunc.complexity_hotspots.every((h) => h.cyclomatic_complexity === 1),
    `got: ${JSON.stringify(fbGoWithFunc.complexity_hotspots)}`);

  // 6c: foo.js — NOT in the manifest, but inferable from `.js` extension.
  // universal-ast should regex-parse it as "typescript" (JS is a subset of TS).
  // This is the explicit assertion requested in the task: a tiny JS sample
  // `function foo() {} class Bar {}` must yield a non-empty symbols array.
  const fbJs = await detectUniversalAst(
    "foo.js",
    "function foo() {}\nclass Bar {}\n",
    Buffer.alloc(0),
  );
  check("detectUniversalAst('foo.js', 'function foo() {} class Bar {}') returns fallback (manifest has no .js grammar)",
    fbJs.fallback === true,
    `got fallback=${fbJs.fallback}`);
  check("detectUniversalAst('foo.js' JS sample) symbols array is non-empty",
    Array.isArray(fbJs.symbols) && fbJs.symbols.length >= 1,
    `got ${fbJs.symbols.length} symbols`);
  check("detectUniversalAst('foo.js' JS sample) extracts 'foo' as a function",
    fbJs.symbols.some((s) => s.name === "foo" && s.kind === "function"),
    `got symbols: ${JSON.stringify(fbJs.symbols)}`);
  check("detectUniversalAst('foo.js' JS sample) extracts 'Bar' as a class",
    fbJs.symbols.some((s) => s.name === "Bar" && s.kind === "class"));
  check("detectUniversalAst('foo.js' JS sample) fallback_reason is set",
    typeof fbJs.fallback_reason === "string" && fbJs.fallback_reason.length > 0);

  // 6d: foo.js with imports — verify imports extraction works and that
  // the local-vs-external heuristic marks relative imports as local.
  const fbJsImports = await detectUniversalAst(
    "foo.js",
    "import foo from './local.js';\nimport bar from 'react';\n",
    Buffer.alloc(0),
  );
  check("detectUniversalAst('foo.js' with imports) returns fallback",
    fbJsImports.fallback === true);
  check("detectUniversalAst('foo.js' with imports) extracts 2 imports",
    Array.isArray(fbJsImports.imports) && fbJsImports.imports.length === 2,
    `got imports: ${JSON.stringify(fbJsImports.imports)}`);
  check("detectUniversalAst('foo.js' with imports) marks './local.js' as local",
    fbJsImports.imports.some((i) => i.module === "./local.js" && i.isLocal === true),
    `got: ${JSON.stringify(fbJsImports.imports)}`);
  check("detectUniversalAst('foo.js' with imports) marks 'react' as non-local",
    fbJsImports.imports.some((i) => i.module === "react" && i.isLocal === false));

  // 6e: foo.kt (Kotlin — manifest grammar, no regex patterns defined).
  // Naive parser returns an empty fallback with an extended reason noting
  // the unmatched language. This is the most graceful possible degradation
  // for languages we don't have regex patterns for (kotlin, swift, ruby,
  // php, scala, clojure).
  const fbKt = await detectUniversalAst(
    "foo.kt",
    "fun main() { println() }",
    Buffer.alloc(0),
  );
  check("detectUniversalAst('foo.kt', ...) returns fallback (WASM missing)",
    fbKt.fallback === true,
    `got fallback=${fbKt.fallback}`);
  check("detectUniversalAst('foo.kt') fallback_reason notes 'no regex patterns for language \"kotlin\"'",
    (fbKt.fallback_reason ?? "").includes("no regex patterns for language \"kotlin\""),
    `got reason: ${JSON.stringify(fbKt.fallback_reason)}`);
  check("detectUniversalAst('foo.kt') returns empty symbols (no regex patterns available)",
    Array.isArray(fbKt.symbols) && fbKt.symbols.length === 0,
    `got: ${JSON.stringify(fbKt.symbols)}`);

  // 6f: foo.xyz — truly unknown extension (no manifest, no inference).
  // This is the ONE case that still throws — better to surface the error
  // than silently return empty symbols (which would mask the misconfiguration).
  await expectRejects(
    "detectUniversalAst('foo.xyz', ...) STILL rejects with no-grammar message",
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
