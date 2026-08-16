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

import { join, dirname } from "node:path";
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
}

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
 * Throws if the web-tree-sitter runtime glue is not vendored (see
 * `loadTreeSitterRuntime`), or if the grammar buffer is malformed.
 */
export async function detectUniversalAst(
  filePath: string,
  content: string,
  grammarWasm: Buffer,
): Promise<UniversalAstResult> {
  const grammarName = grammarForFile(filePath);
  if (!grammarName) {
    throw new Error(
      `universal-ast: no grammar registered for file ${filePath}`,
    );
  }
  const nt = nodeTypesForGrammar(grammarName);
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
      const callee = extractCallee(node, grammarName);
      callGraph.push({ caller, callee, file: filePath, line: startLine });
    } else if (importTypes.has(node.type)) {
      const mod = extractImportModule(node, grammarName);
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
