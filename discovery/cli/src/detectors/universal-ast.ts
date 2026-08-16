// ADR-0033 / Roadmap 2026 Item 2 — Universal AST detector.
//
// Parses ANY language that has a Tree-sitter grammar and emits a
// language-agnostic structural model: symbols (functions, classes,
// methods, interfaces, types, variables), call-graph edges, imports,
// and cyclomatic-complexity hotspots.
//
// ADR-0022 compliance — ZERO runtime npm dependencies:
//   - We do NOT `import "web-tree-sitter"` at runtime. That package
//     is devDependency-only (build-time types).
//   - The Tree-sitter runtime WASM + JS glue is VENDORED at
//     `discovery/cli/vendor/web-tree-sitter.wasm` + `.js` (per
//     ADR-0021's committed-dist exception, applied to vendor/).
//   - Language grammar WASMs live at
//     `discovery/cli/vendor/grammars/<lang>.wasm` and are loaded by
//     `grammar-loader.ts::loadGrammar()` via `fs.readFileSync`.
//   - At runtime the JS glue is dynamically imported from the vendor
//     directory by absolute file URL — no node_modules lookup.
//
// What this does NOT replace: `python.ts` and `typescript.ts` stay as
// fallback detectors (they read package manifests, framework hints,
// entrypoint conventions — things AST analysis alone cannot recover).
// universal-ast.ts is a structural-analysis companion, not a
// replacement. Per roadmap-2026-pro.md Item 2 "What does NOT change".

import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { grammarForFile, getGrammarConfig } from "./grammar-loader.js";

// ---------------------------------------------------------------------------
// Minimal Tree-sitter type stubs (inline).
//
// The real `web-tree-sitter` package exposes these types; we replicate
// just enough of the surface to type-check our walking logic without
// importing the package at runtime. If the runtime shape of the vendored
// glue ever drifts, these stubs need updating — they are the contract.
// ---------------------------------------------------------------------------

interface TsPoint {
  row: number;
  column: number;
}

interface TsSyntaxNode {
  type: string;
  isNamed: boolean;
  startPosition: TsPoint;
  endPosition: TsPoint;
  startIndex: number;
  endIndex: number;
  readonly text: string;
  readonly parent: TsSyntaxNode | null;
  readonly children: TsSyntaxNode[];
  readonly namedChildren: TsSyntaxNode[];
  childForFieldName(fieldName: string): TsSyntaxNode | null;
  fieldNameForChild(child: TsSyntaxNode): string | null;
  child(count: number): TsSyntaxNode | null;
  namedChild(count: number): TsSyntaxNode | null;
  childCount: number;
  namedChildCount: number;
}

interface TsTree {
  rootNode: TsSyntaxNode;
  delete(): void;
}

interface TsLanguage {
  // Opaque handle returned by `new Language(wasmBuffer)`.
}

interface TsParser {
  setLanguage(language: TsLanguage): void;
  parse(input: string, oldTree?: TsTree): TsTree | null;
  delete(): void;
}

interface TsRuntimeModule {
  Parser: { new (): TsParser };
  Language: { new (data: Buffer | ArrayBuffer | Uint8Array): TsLanguage };
  init?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Public result types. These are the contract `ProjectIntelligence`
// (types.ts) will eventually consume — see the projection notes below.
// ---------------------------------------------------------------------------

export type SymbolKind =
  | "function"
  | "class"
  | "method"
  | "variable"
  | "interface"
  | "type";

export interface Symbol {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number; // 1-indexed, matches existing detectors
  endLine: number;
}

export interface CallEdge {
  caller: string; // function name, or "<module>" for top-level calls
  callee: string;
  file: string;
  line: number;
}

export interface Import {
  file: string;
  module: string;
  isLocal: boolean;
}

export interface Hotspot {
  function: string;
  file: string;
  line: number;
  cyclomatic_complexity: number;
}

export interface UniversalAstResult {
  symbols: Symbol[];
  call_graph: CallEdge[];
  imports: Import[];
  complexity_hotspots: Hotspot[];
  // ADR-0033 follow-up (Phase 2.5 wiring sprint): when the Tree-sitter
  // runtime glue or a language grammar WASM is missing on disk (offline
  // CI/CD, fresh clone pre-`download-grammars`, corrupt vendor/), the
  // detector falls back to a regex-based naive parse rather than
  // throwing. The result carries `fallback: true` and a human-readable
  // `fallback_reason` so callers (and chat-LLM agents) can flag the
  // degraded-accuracy path in their UI / evidence. When unset / false,
  // the result is the high-fidelity AST path.
  fallback?: boolean;
  fallback_reason?: string;
}

// Standard reason string used by `naiveParse` when WASM/grammar is
// unavailable. Centralised here so callers can match on the exact text
// (see e2e-universal-ast/drive-run.mjs fallback assertions).
export const UNIVERSAL_AST_FALLBACK_REASON =
  "WASM grammar not available — using regex-based naive parse (degraded accuracy)";

// ---------------------------------------------------------------------------
// Per-grammar node-type map.
//
// Tree-sitter grammars use slightly different node names for the same
// concept (e.g., Go uses `function_declaration`, Rust uses `function_item`,
// Java uses `method_declaration`). We declare which node types to treat
// as function/class/method/interface/type/call/import for each grammar.
//
// `tree-sitter-grammars.json` already carries the basics (function/call/
// import); this map layers on the remaining kinds that the manifest
// doesn't enumerate (class/method/interface/type) plus a per-grammar
// list of decision-point node types used for complexity scoring.
// ---------------------------------------------------------------------------

interface GrammarNodeTypes {
  function: string;
  call: string;
  import: string;
  class?: string[];
  method?: string[];
  interface?: string[];
  type?: string[];
  variable?: string[];
}

const DEFAULT_DECISION_NODES = [
  "if_statement",
  "for_statement",
  "while_statement",
  "do_statement",
  "switch_statement",
  "match_expression", // Rust
  "match_arm",
  "case_clause",
  "try_statement",
  "catch_clause",
  "ternary_expression",
  "binary_expression", // && / || counted below
];

// Per-grammar kind overrides. Falls back to sensible cross-grammar
// defaults (most grammars reuse the same node names).
const GRAMMAR_NODE_TYPES: Record<string, GrammarNodeTypes> = {
  go: {
    function: "function_declaration",
    method: ["method_declaration"],
    call: "call_expression",
    import: "import_declaration",
    class: ["type_declaration"],
    interface: ["type_declaration"],
    type: ["type_spec"],
  },
  rust: {
    function: "function_item",
    call: "call_expression",
    import: "use_declaration",
    class: ["struct_item", "enum_item", "union_item"],
    interface: ["trait_item"],
    type: ["type_item"],
    variable: ["let_declaration", "const_item", "static_item"],
  },
  java: {
    function: "method_declaration",
    call: "method_invocation",
    import: "import_declaration",
    class: ["class_declaration", "record_declaration", "enum_declaration"],
    interface: ["interface_declaration"],
    type: [],
    variable: ["field_declaration", "local_variable_declaration"],
  },
  cpp: {
    function: "function_definition",
    call: "call_expression",
    import: "preproc_include",
    class: ["class_specifier", "struct_specifier"],
    method: ["function_definition"],
    interface: [],
    type: ["type_definition"],
    variable: ["declaration"],
  },
  c: {
    function: "function_definition",
    call: "call_expression",
    import: "preproc_include",
    class: ["struct_specifier", "union_specifier", "enum_specifier"],
    interface: [],
    type: ["type_definition"],
    variable: ["declaration"],
  },
  // Fallbacks for grammars listed in the manifest but not enumerated
  // here. We use the manifest's function/call/import + a generic
  // `class_definition`/`interface_declaration` heuristic.
};

function nodeTypesForGrammar(grammarName: string): GrammarNodeTypes {
  const explicit = GRAMMAR_NODE_TYPES[grammarName];
  if (explicit) return explicit;
  const cfg = getGrammarConfig(grammarName);
  return {
    function: cfg.node_types.function,
    call: cfg.node_types.call,
    import: cfg.node_types.import,
    class: ["class_definition", "class_declaration"],
    interface: ["interface_declaration"],
    type: ["type_declaration"],
    variable: ["variable_declaration"],
  };
}

// ---------------------------------------------------------------------------
// Tree-walking helpers.
// ---------------------------------------------------------------------------

/** Extract a name from a node by looking at the `name` field, then the
 *  first named identifier child, then the first string-literal child. */
function extractName(node: TsSyntaxNode): string {
  const nameField = node.childForFieldName("name");
  if (nameField && nameField.text) return nameField.text;
  // Fall back to first identifier-typed child.
  for (const child of node.namedChildren) {
    if (child.type === "identifier" || child.type === "type_identifier") {
      return child.text;
    }
  }
  // Fall back to first string literal (e.g., C preproc includes use this).
  for (const child of node.namedChildren) {
    if (child.type === "string_literal" || child.type === "raw_string_literal") {
      return stripQuotes(child.text);
    }
  }
  return "<anonymous>";
}

/** Strip surrounding quotes from a string-literal node's text. */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' || first === "'" || first === "`") && last === first) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/** Walk the tree depth-first and yield every node. */
function* walk(node: TsSyntaxNode): Iterable<TsSyntaxNode> {
  yield node;
  for (const child of node.children) {
    yield* walk(child);
  }
}

/** Find the name of the nearest enclosing function-like node. */
function findEnclosingFunctionName(node: TsSyntaxNode, funcTypes: Set<string>): string {
  let current: TsSyntaxNode | null = node.parent;
  while (current) {
    if (funcTypes.has(current.type)) {
      return extractName(current);
    }
    current = current.parent;
  }
  return "<module>";
}

/** Count decision points within a function body for a cyclomatic-complexity
 *  proxy (1 + decision-points). Conservative — counts nodes by type name. */
function countDecisionPoints(funcNode: TsSyntaxNode): number {
  let count = 0;
  for (const n of walk(funcNode)) {
    if (DEFAULT_DECISION_NODES.includes(n.type)) {
      // For binary_expression, only count && / || operators.
      if (n.type === "binary_expression") {
        // heuristic: text-contains check on the operator
        const txt = n.text;
        if (txt.includes("&&") || txt.includes("||") || txt.includes(" and ") || txt.includes(" or ")) {
          count++;
        }
        // else: arithmetic, not a decision.
      } else {
        count++;
      }
    }
  }
  return count;
}

/** Extract a module string from an import node. Grammar-dependent:
 *  - Go `import_declaration`: `"path"` literals inside.
 *  - Rust `use_declaration`: text like `use foo::bar;`.
 *  - Java `import_declaration`: `import foo.Bar;`.
 *  - C `preproc_include`: `#include <foo.h>` or `"foo.h"`. */
function extractImportModule(node: TsSyntaxNode, grammarName: string): { module: string; isLocal: boolean } | null {
  if (grammarName === "go") {
    // Go: import_declaration has `import_spec` children with `path` field.
    for (const child of walk(node)) {
      if (child.type === "import_spec") {
        const path = child.childForFieldName("path");
        if (path) {
          return { module: stripQuotes(path.text), isLocal: false };
        }
      }
    }
    // Multi-import form: import_declaration with a single `path` child.
    const path = node.childForFieldName("path");
    if (path) return { module: stripQuotes(path.text), isLocal: false };
    return null;
  }
  if (grammarName === "rust") {
    // use_declaration text: `use foo::bar;` → strip leading `use ` and trailing `;`
    const txt = node.text.trim();
    const m = txt.replace(/^use\s+/, "").replace(/;$/, "").replace(/\s+as\s+.*$/, "").trim();
    return { module: m, isLocal: m.startsWith("crate::") || m.startsWith("self::") || m.startsWith("super::") };
  }
  if (grammarName === "java") {
    const txt = node.text.trim(); // `import foo.Bar;`
    const m = txt.replace(/^import\s+(static\s+)?/, "").replace(/;$/, "").trim();
    return { module: m, isLocal: false };
  }
  if (grammarName === "cpp" || grammarName === "c") {
    // preproc_include: `#include <stdio.h>` or `#include "foo.h"`
    const path = node.childForFieldName("path");
    if (path) {
      const txt = stripQuotes(path.text);
      return { module: txt, isLocal: !txt.startsWith("<") && txt.includes("/") === false ? false : txt.startsWith(".") };
    }
    return null;
  }
  // Generic fallback: try `path` field, then strip quotes from text.
  const path = node.childForFieldName("path");
  if (path) return { module: stripQuotes(path.text), isLocal: false };
  return null;
}

// ---------------------------------------------------------------------------
// Vendor runtime loader.
//
// Loads the vendored `web-tree-sitter.js` glue from
// `discovery/cli/vendor/web-tree-sitter.js`. This file is committed
// per ADR-0021 (committed-dist exception) — it must be downloaded by
// `make download-grammars` (see vendor/README.md) before the detector
// can actually parse. If the file is missing, we throw a clear,
// actionable error so callers (and chat-LLM agents) know what to do.
// ---------------------------------------------------------------------------

const VENDOR_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "vendor",
);

let cachedRuntime: TsRuntimeModule | null = null;

async function loadTreeSitterRuntime(): Promise<TsRuntimeModule> {
  if (cachedRuntime) return cachedRuntime;
  const gluePath = join(VENDOR_DIR, "web-tree-sitter.js");
  if (!existsSync(gluePath)) {
    throw new Error(
      `universal-ast: Tree-sitter runtime glue not vendored.\n` +
      `  Expected: ${gluePath}\n` +
      `  Per ADR-0033 + ADR-0022, the web-tree-sitter runtime is VENDORED\n` +
      `  (not npm-installed) to keep discovery/cli at zero runtime deps.\n` +
      `  Run \`make download-grammars\` (see discovery/cli/vendor/README.md)\n` +
      `  to fetch the runtime + grammar WASMs from tree-sitter GitHub releases.`,
    );
  }
  // Dynamic import by absolute file URL — no node_modules resolution.
  // TypeScript cannot statically resolve this, so the result is `any`
  // and we assert the shape via the cast below.
  const url = pathToFileURL(gluePath).href;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import(/* @vite-ignore */ url)) as unknown as TsRuntimeModule;
  if (!mod.Parser || !mod.Language) {
    throw new Error(
      `universal-ast: vendored Tree-sitter glue at ${gluePath} did not export Parser/Language.`,
    );
  }
  if (typeof mod.init === "function") {
    await mod.init();
  }
  cachedRuntime = mod;
  return mod;
}

// ---------------------------------------------------------------------------
// The detector.
// ---------------------------------------------------------------------------

/**
 * Parse `content` of `filePath` using the supplied pre-loaded grammar
 * WASM buffer and emit a language-agnostic structural model.
 *
 * The caller is responsible for:
 *   1. Calling `grammarForFile(filePath)` to determine the grammar name.
 *   2. Calling `loadGrammar(grammarName)` to read the grammar WASM
 *      buffer from `vendor/grammars/<name>.wasm`.
 *   3. Passing the resulting buffer here.
 *
 * ADR-0033 follow-up (Phase 2.5 wiring sprint) — GRACEFUL DEGRADATION:
 * If the Tree-sitter runtime glue is not vendored, the grammar WASM is
 * missing/empty/malformed, or the parser returns null, this function
 * does NOT throw. Instead it falls back to `naiveParse()` — a
 * regex-based parser using language-specific patterns (functions,
 * classes, imports). The returned `UniversalAstResult` carries
 * `fallback: true` and a human-readable `fallback_reason` so callers
 * can flag the degraded-accuracy path in their UI / evidence.
 *
 * The ONLY case that still throws is when neither a manifest grammar
 * NOR a regex-inferable language can be determined for `filePath`
 * (e.g., `foo.xyz`) — there is genuinely nothing useful we can do
 * without knowing the language.
 */
export async function detectUniversalAst(
  filePath: string,
  content: string,
  grammarWasm: Buffer,
): Promise<UniversalAstResult> {
  const grammarName = grammarForFile(filePath);
  const regexLang = inferLanguageForRegex(filePath);

  // Neither manifest nor inference knows the language → throw.
  // (We deliberately keep this throw: regex-fallback for a totally
  // unknown language would silently return empty symbols, masking
  // the configuration error from the caller. Better to surface it.)
  if (!grammarName && !regexLang) {
    throw new Error(
      `universal-ast: no grammar registered for file ${filePath}`,
    );
  }

  // If the manifest has no grammar for this extension BUT the regex
  // inferrer knows the language (e.g. `.js`/`.ts` — JS-family files
  // are NOT in the tree-sitter-grammars.json manifest because the
  // dedicated `typescript.ts` detector handles them, but they're
  // trivially regex-parseable), short-circuit straight to naive parse
  // rather than attempting a WASM load we know will fail.
  if (!grammarName && regexLang) {
    return naiveParse(filePath, content, regexLang);
  }

  // grammarName is non-null here (the only path that reaches this point).
  // Try the full WASM-backed AST path; on ANY failure (missing glue,
  // missing grammar WASM, malformed WASM, parser null tree, etc.) fall
  // back to regex-based naive parse so callers in offline / pre-download
  // environments still get a usable (if degraded) result.
  try {
    const nt = nodeTypesForGrammar(grammarName!);
    const runtime = await loadTreeSitterRuntime();

    // Build the language + parser. The `web-tree-sitter` API expects an
    // ArrayBuffer / Uint8Array view of the grammar WASM.
    const language = new runtime.Language(grammarWasm);
    const parser = new runtime.Parser();
    parser.setLanguage(language);
    const tree = parser.parse(content);
    if (!tree) {
      parser.delete();
      throw new Error(`universal-ast: parser returned null tree for ${filePath}`);
    }

    const funcTypes = new Set<string>([nt.function, ...(nt.method ?? [])]);
    const classTypes = new Set<string>(nt.class ?? []);
    const interfaceTypes = new Set<string>(nt.interface ?? []);
    const typeTypes = new Set<string>(nt.type ?? []);
    const variableTypes = new Set<string>(nt.variable ?? []);
    const callTypes = new Set<string>([nt.call]);
    const importTypes = new Set<string>([nt.import]);

    const symbols: Symbol[] = [];
    const callGraph: CallEdge[] = [];
    const imports: Import[] = [];
    const hotspotByFunc = new Map<string, Hotspot>();

    // First pass: collect symbols + hotspots (so call-edge resolution can
    // look up the caller name from the enclosing function node).
    const funcNameByStartIndex = new Map<number, string>();

    for (const node of walk(tree.rootNode)) {
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;

      if (funcTypes.has(node.type)) {
        // Disambiguate method vs function — Go has both function_declaration
        // (top-level) and method_declaration (in a receiver). Java's only
        // method_declaration; treat top-level as function, nested-in-class
        // as method.
        let kind: SymbolKind = "function";
        const isInClass = isWithinClass(node, classTypes);
        if (nt.method?.includes(node.type) || (isInClass && node.type === nt.function)) {
          kind = "method";
        }
        const name = extractName(node);
        symbols.push({ name, kind, file: filePath, line: startLine, endLine });
        funcNameByStartIndex.set(node.startIndex, name);
        const decisions = countDecisionPoints(node);
        hotspotByFunc.set(`${filePath}::${name}::${startLine}`, {
          function: name,
          file: filePath,
          line: startLine,
          cyclomatic_complexity: 1 + decisions,
        });
      } else if (classTypes.has(node.type)) {
        symbols.push({ name: extractName(node), kind: "class", file: filePath, line: startLine, endLine });
      } else if (interfaceTypes.has(node.type)) {
        symbols.push({ name: extractName(node), kind: "interface", file: filePath, line: startLine, endLine });
      } else if (typeTypes.has(node.type)) {
        symbols.push({ name: extractName(node), kind: "type", file: filePath, line: startLine, endLine });
      } else if (variableTypes.has(node.type)) {
        symbols.push({ name: extractName(node), kind: "variable", file: filePath, line: startLine, endLine });
      } else if (callTypes.has(node.type)) {
        const caller = findEnclosingFunctionName(node, funcTypes);
        const callee = extractCallee(node, grammarName!);
        callGraph.push({ caller, callee, file: filePath, line: startLine });
      } else if (importTypes.has(node.type)) {
        const mod = extractImportModule(node, grammarName!);
        if (mod) imports.push({ file: filePath, module: mod.module, isLocal: mod.isLocal });
      }
    }

    // Top-N hotspots by complexity. Default N = 10 (caller can slice).
    const complexity_hotspots = Array.from(hotspotByFunc.values())
      .sort((a, b) => b.cyclomatic_complexity - a.cyclomatic_complexity)
      .slice(0, 10);

    tree.delete();
    parser.delete();

    return { symbols, call_graph: callGraph, imports, complexity_hotspots };
  } catch (err) {
    // WASM not available — fall back to regex-based naive parse.
    // `naiveParse` always returns a UniversalAstResult with fallback=true
    // and a human-readable fallback_reason. We deliberately swallow the
    // error here (after letting it log nothing — the caller inspects
    // `fallback` on the result to detect degraded mode) per the
    // "graceful degradation" contract documented at the top of this
    // function. Partial coverage beats no coverage in offline CI/CD.
    const lang = grammarName ?? regexLang!;
    return naiveParse(filePath, content, lang);
  }
}

/** Is `node` lexically inside a class-like node? Used to disambiguate
 *  method vs function for grammars (Java) that use one node type. */
function isWithinClass(node: TsSyntaxNode, classTypes: Set<string>): boolean {
  let current = node.parent;
  while (current) {
    if (classTypes.has(current.type)) return true;
    current = current.parent;
  }
  return false;
}

/** Extract the callee name from a call_expression / method_invocation. */
function extractCallee(node: TsSyntaxNode, grammarName: string): string {
  // Java's method_invocation has a `name` field for the method name.
  const nameField = node.childForFieldName("name");
  if (nameField && nameField.text) return nameField.text;
  // Go / Rust / C / C++: `function` field.
  const funcField = node.childForFieldName("function");
  if (funcField) {
    // For chained calls (e.g., obj.method()), the function field is a
    // `field_expression` / `member_expression` — return its text whole
    // so the caller can see `obj.method`. For bare identifier calls
    // (e.g., `foo()`), the field is an `identifier` and we return its
    // text.
    return funcField.text;
  }
  // Fallback: first identifier-typed child.
  for (const child of node.namedChildren) {
    if (child.type === "identifier" || child.type === "type_identifier") {
      return child.text;
    }
  }
  // Last resort: the node's own text, truncated.
  void grammarName;
  return node.text.slice(0, 40);
}

// ---------------------------------------------------------------------------
// WASM-missing fallback: regex-based naive parser.
//
// When `loadTreeSitterRuntime()` throws (no vendored `web-tree-sitter.js`)
// OR `new runtime.Language(grammarWasm)` throws (empty / malformed grammar
// WASM buffer — typically because `loadGrammar()` was never called or the
// caller passed `Buffer.alloc(0)` to bypass the missing WASM), the
// detector falls back to `naiveParse` rather than re-throwing.
//
// The naive parser extracts three things per-language using anchored
// `^...` multiline regexes (so it only catches top-level declarations,
// not nested locals — same scope as Tree-sitter's function_declaration
// would surface):
//
//   1. Functions  — language-specific declaration keyword + name.
//   2. Classes     — `class <Name>` (universal-ish; covers JS/TS/Python
//                    `class X:`, Java/Kotlin/Scala/PHP `class X {`).
//   3. Imports     — language-specific `import`/`use`/`#include` form.
//
// What the naive parser does NOT recover (degraded accuracy):
//   - Call-graph edges (would need function-body scope tracking).
//   - Cyclomatic-complexity hotspots (would need AST walk to count
//     decision nodes). Each function is reported with complexity 1.
//   - Methods vs top-level functions (no scope info — everything is
//     reported as `kind: "function"`).
//   - Variables / interfaces / types (regex cannot reliably distinguish
//     these from other constructs across all languages).
//
// The returned `UniversalAstResult` carries `fallback: true` and
// `fallback_reason` so callers (and chat-LLM agents reading the result)
// can flag the degraded path in their UI / evidence.
// ---------------------------------------------------------------------------

interface NaivePatterns {
  functions: RegExp;
  classes: RegExp;
  imports: RegExp;
  // Suffix appended to `UNIVERSAL_AST_FALLBACK_REASON` when this language
  // has no specific patterns (so the caller sees *which* language was
  // unmatched). Optional — when absent, the standard reason is used.
  note?: string;
}

// Per-language regex patterns. Patterns use the `g` + `m` flags so
// `^` matches at the start of any line (not just the start of input)
// and `exec` can be called repeatedly to iterate matches.
//
// Capture group 1 is always the symbol/module name being extracted.
//
// IMPORTANT: regexes are stateful (they track `lastIndex` across calls).
// `naiveParse` resets `lastIndex = 0` before iterating each pattern.
const NAIVE_PATTERNS: Record<string, NaivePatterns> = {
  // JS/TS share syntax for function/class/import — we treat them
  // uniformly as "typescript" for regex purposes (JS is a syntactic
  // subset of TS at this level of analysis).
  typescript: {
    functions: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
    classes: /^class\s+(\w+)/gm,
    imports: /^import\s+.*?from\s+['"](.+?)['"]/gm,
  },
  go: {
    functions: /^func\s+(\w+)/gm,
    classes: /^type\s+(\w+)\s+struct\b/gm, // Go has no `class` keyword; structs are closest.
    imports: /^import\s+"(.+?)"/gm,
  },
  rust: {
    functions: /^fn\s+(\w+)/gm,
    classes: /^(?:struct|enum)\s+(\w+)/gm, // Rust uses struct/enum, not `class`.
    imports: /^use\s+(.+)/gm,
  },
  python: {
    functions: /^def\s+(\w+)/gm,
    classes: /^class\s+(\w+)/gm,
    imports: /^from\s+(\S+)\s+import|^import\s+(\S+)/gm,
  },
  java: {
    functions:
      /^\s*(?:public|private|protected)?\s*(?:static\s+)?\w+(?:\[\])?\s+(\w+)\s*\(/gm,
    classes: /^class\s+(\w+)/gm,
    imports: /^import\s+(.+);/gm,
  },
  cpp: {
    functions: /^\w[\w\s\*]*\s+(\w+)\s*\([^)]*\)\s*{/gm,
    classes: /^class\s+(\w+)/gm,
    imports: /^#include\s+[<"]([^>"]+)[>"]/gm,
  },
  c: {
    functions: /^\w[\w\s\*]*\s+(\w+)\s*\([^)]*\)\s*{/gm,
    classes: /^struct\s+(\w+)\s*{/gm, // C has no `class` keyword; structs are closest.
    imports: /^#include\s+[<"]([^>"]+)[>"]/gm,
  },
};

// Map file extensions to a regex-friendly language name. Used when:
//   - The extension is NOT in `tree-sitter-grammars.json` (e.g., `.js`,
//     `.ts` — JS/TS files are handled by the dedicated `typescript.ts`
//     detector, not the universal-ast manifest, but they're trivially
//     regex-parseable).
//   - The Tree-sitter manifest grammar is missing its WASM on disk
//     (e.g., `foo.go` when `vendor/grammars/go.wasm` hasn't been
//     downloaded yet) — the manifest grammar name is passed straight
//     to `naiveParse`, which looks it up in `NAIVE_PATTERNS` instead.
//
// Returns `null` for truly unknown extensions (e.g., `.xyz`) — the
// caller (`detectUniversalAst`) treats this as a hard error since
// there's no language to regex-parse AS.
function inferLanguageForRegex(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  if (!ext) return null;
  const map: Record<string, string> = {
    // JS/TS family — all regex-parsed as "typescript" (JS subset of TS).
    ".js": "typescript",
    ".jsx": "typescript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mjs": "typescript",
    ".cjs": "typescript",
    // Go.
    ".go": "go",
    // Rust.
    ".rs": "rust",
    // Python.
    ".py": "python",
    // Java.
    ".java": "java",
    // C / C++.
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
  };
  return map[ext] ?? null;
}

// Map manifest grammar names to regex-language names. Most are 1:1
// (`go` → `go`, `rust` → `rust`); `kotlin`/`swift`/`ruby`/`php`/
// `scala`/`clojure` have no regex patterns defined and fall through to
// `null`, which `naiveParse` handles by returning an empty result with
// `fallback: true` (better than nothing — the caller still sees the
// degraded-mode marker).
function regexLangForGrammar(grammarName: string): string | null {
  // Manifest names that map 1:1 to NAIVE_PATTERNS keys.
  if (grammarName in NAIVE_PATTERNS) return grammarName;
  // Aliases: none currently (manifest uses `cpp` and `c` directly,
  // matching NAIVE_PATTERNS keys).
  return null;
}

/** Convert a character index `index` into `content` to a 1-indexed
 *  line number. (Used by `naiveParse` to convert regex match offsets
 *  to the same 1-indexed `line` field the AST path emits.) */
function charIndexToLine(content: string, index: number): number {
  let line = 1;
  const limit = Math.min(index, content.length);
  for (let i = 0; i < limit; i++) {
    if (content.charCodeAt(i) === 0x0a /* '\n' */) line++;
  }
  return line;
}

/**
 * Regex-based naive parse — the WASM-missing fallback path.
 *
 * Extracts functions, classes, and imports from `content` using
 * language-specific regex patterns. Always returns a `UniversalAstResult`
 * with `fallback: true` and a human-readable `fallback_reason`.
 *
 * `language` should be a key into `NAIVE_PATTERNS` (e.g., `"typescript"`,
 * `"go"`, `"rust"`, `"python"`, `"java"`, `"cpp"`, `"c"`). If the
 * language is unknown or has no patterns, an empty result is returned
 * with `fallback: true` and a reason noting no patterns were available
 * — this is the most graceful possible degradation (the caller still
 * sees the degraded-mode marker, rather than getting a thrown error).
 *
 * Returned shape (always present, even when empty):
 *   { symbols: [], call_graph: [], imports: [], complexity_hotspots: [],
 *     fallback: true, fallback_reason: "..." }
 */
function naiveParse(
  filePath: string,
  content: string,
  language: string,
): UniversalAstResult {
  const lang = regexLangForGrammar(language) ?? language;
  const patterns = NAIVE_PATTERNS[lang];

  // No patterns for this language — return an empty fallback result
  // with an extended reason noting which language was unmatched.
  if (!patterns) {
    return {
      symbols: [],
      call_graph: [],
      imports: [],
      complexity_hotspots: [],
      fallback: true,
      fallback_reason:
        `${UNIVERSAL_AST_FALLBACK_REASON} [no regex patterns for language "${language}"]`,
    };
  }

  const symbols: Symbol[] = [];
  const imports: Import[] = [];

  // --- Functions ---
  patterns.functions.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = patterns.functions.exec(content)) !== null) {
    // Python's import regex has two alternates (group 1 for `from X import`,
    // group 2 for `import X`); for the function regex, group 1 is always
    // the function name. (See `python.imports` below for the dual case.)
    const name = m[1];
    if (!name) continue;
    const line = charIndexToLine(content, m.index);
    symbols.push({
      name,
      kind: "function",
      file: filePath,
      line,
      endLine: line,
    });
  }

  // --- Classes ---
  patterns.classes.lastIndex = 0;
  while ((m = patterns.classes.exec(content)) !== null) {
    const name = m[1];
    if (!name) continue;
    const line = charIndexToLine(content, m.index);
    symbols.push({
      name,
      kind: "class",
      file: filePath,
      line,
      endLine: line,
    });
  }

  // --- Imports ---
  patterns.imports.lastIndex = 0;
  while ((m = patterns.imports.exec(content)) !== null) {
    // Python's import regex has two alternates; pick whichever group
    // matched (group 1 for `from X import Y`, group 2 for `import X`).
    const mod = m[1] ?? m[2];
    if (!mod) continue;
    const line = charIndexToLine(content, m.index);
    // Local import heuristic: starts with `.` or `/` (relative path),
    // or starts with `@/` (common JS/TS alias). Bare module names
    // (e.g., `"react"`, `"fmt"`, `<stdio.h>`) are treated as non-local.
    const isLocal =
      mod.startsWith(".") ||
      mod.startsWith("/") ||
      mod.startsWith("@/") ||
      mod.startsWith("./") ||
      mod.startsWith("../");
    imports.push({ file: filePath, module: mod, isLocal });
  }

  // --- Complexity hotspots (degraded: 1 per function, no decision counting) ---
  const complexity_hotspots: Hotspot[] = symbols
    .filter((s) => s.kind === "function" || s.kind === "method")
    .map((s) => ({
      function: s.name,
      file: s.file,
      line: s.line,
      cyclomatic_complexity: 1,
    }));

  return {
    symbols,
    call_graph: [], // not recoverable from regex alone
    imports,
    complexity_hotspots,
    fallback: true,
    fallback_reason: UNIVERSAL_AST_FALLBACK_REASON,
  };
}
