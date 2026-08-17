# discovery/cli/vendor — Tree-sitter WASM binaries (ADR-0033 + ADR-0022)

## Why this directory exists

Per **ADR-0022**, `discovery/cli` has **ZERO runtime npm dependencies** —
the discovery CLI must run in a fresh clone without `npm install` (so a
chat-sandbox LLM can execute it offline, per ADR-0021's committed-dist
exception).

Per **ADR-0033** (Roadmap 2026 Item 2), `discovery/cli/src/detectors/
universal-ast.ts` uses Tree-sitter to parse ANY language with a grammar
and emit symbols + call graph + imports + complexity hotspots. Tree-
sitter's runtime + grammar WASMs cannot be `npm install`-ed without
breaking ADR-0022, so we **VENDOR** them into this directory instead.

This directory is committed to the repo, the same way
`discovery/cli/dist/` is committed per ADR-0021's committed-dist
exception. The expected on-disk layout after `make download-grammars`
runs is:

```
discovery/cli/vendor/
  README.md                      <-- this file
  web-tree-sitter.js             <-- Tree-sitter runtime JS glue (~40 KB)
  web-tree-sitter.wasm           <-- Tree-sitter runtime WASM (~1.5 MB)
  grammars/
    go.wasm                      <-- ~200 KB per language
    rust.wasm
    java.wasm
    cpp.wasm
    c.wasm
    kotlin.wasm
    swift.wasm
    ruby.wasm
    php.wasm
    scala.wasm
    clojure.wasm
```

Total committed size: ~4 MB (1.5 MB runtime + 11 × ~200 KB grammars).
This is acceptable per ADR-0021's "committed binaries are OK if they
enable offline execution" exception.

## How the code uses these files

`discovery/cli/src/detectors/grammar-loader.ts::loadGrammar(name)`:
reads `vendor/grammars/<name>.wasm` via `fs.readFileSync` and returns a
`Buffer`. Throws a clear error if missing.

`discovery/cli/src/detectors/universal-ast.ts::loadTreeSitterRuntime()`:
dynamically `import()`s `vendor/web-tree-sitter.js` by absolute file
URL (no `node_modules` resolution), then instantiates `Parser` +
`Language` to parse content.

## How to download the WASM binaries (ops step)

The download is a **separate ops step**, NOT part of `npm install`.
Run `make download-grammars` (Makefile target TBD — see the "TBD"
note at the bottom of this file) or run the curl commands below
manually.

### 1. Tree-sitter runtime (web-tree-sitter.js + .wasm)

The runtime is shipped as an npm package `web-tree-sitter`. We extract
the two files from it without adding it to `package.json` (it stays a
devDependency for build-time types; runtime uses the vendored copy).

```sh
# Download from the npm tarball (no install, just extract two files).
cd discovery/cli/vendor
curl -fsSL https://registry.npmjs.org/web-tree-sitter/-/web-tree-sitter-0.22.0.tgz \
  | tar -xz --strip-components=1 -C . package/dist/web-tree-sitter.js package/dist/web-tree-sitter.wasm
# Move into place.
mv dist/web-tree-sitter.js dist/web-tree-sitter.wasm .
rmdir dist
```

If the npm tarball URL changes, find the latest version at
<https://www.npmjs.com/package/web-tree-sitter> and substitute the
version in the URL.

### 2. Language grammar WASMs

Each grammar lives in its own GitHub repo at
`https://github.com/tree-sitter/tree-sitter-<lang>`. Pre-built WASM
binaries are published on the **Releases** page of each repo.

```sh
cd discovery/cli/vendor/grammars

# Go
curl -fsSL -o go.wasm \
  https://github.com/tree-sitter/tree-sitter-go/releases/download/v0.21.0/tree-sitter-go.wasm

# Rust
curl -fsSL -o rust.wasm \
  https://github.com/tree-sitter/tree-sitter-rust/releases/download/v0.21.0/tree-sitter-rust.wasm

# Java
curl -fsSL -o java.wasm \
  https://github.com/tree-sitter/tree-sitter-java/releases/download/v0.21.0/tree-sitter-java.wasm

# C++
curl -fsSL -o cpp.wasm \
  https://github.com/tree-sitter/tree-sitter-cpp/releases/download/v0.22.0/tree-sitter-cpp.wasm

# C
curl -fsSL -o c.wasm \
  https://github.com/tree-sitter/tree-sitter-c/releases/download/v0.21.0/tree-sitter-c.wasm

# Kotlin
curl -fsSL -o kotlin.wasm \
  https://github.com/tree-sitter/tree-sitter-kotlin/releases/download/v0.21.0/tree-sitter-kotlin.wasm

# Swift
curl -fsSL -o swift.wasm \
  https://github.com/alex-pinkus/tree-sitter-swift/releases/download/v0.5.0/tree-sitter-swift.wasm

# Ruby
curl -fsSL -o ruby.wasm \
  https://github.com/tree-sitter/tree-sitter-ruby/releases/download/v0.21.0/tree-sitter-ruby.wasm

# PHP
curl -fsSL -o php.wasm \
  https://github.com/tree-sitter/tree-sitter-php/releases/download/v0.22.0/tree-sitter-php.wasm

# Scala
curl -fsSL -o scala.wasm \
  https://github.com/tree-sitter/tree-sitter-scala/releases/download/v0.21.0/tree-sitter-scala.wasm

# Clojure
curl -fsSL -o clojure.wasm \
  https://github.com/sogaiu/tree-sitter-clojure/releases/download/v0.0.11/tree-sitter-clojure.wasm
```

> **Note on URLs:** The exact version numbers and asset paths above are
> best-effort based on each repo's release history as of 2026-08-16. If
> a 404 is returned, browse the Releases page of the corresponding repo
> (the URL pattern `https://github.com/tree-sitter/tree-sitter-<lang>/
> releases`) and copy the direct download URL for the `.wasm` asset.
> Some grammars publish the WASM under `tree-sitter-<lang>.wasm`,
> others under `dist/tree-sitter-<lang>.wasm` — adjust the `-o` name
> accordingly so the file lands as `<lang>.wasm` in this directory.

### 3. Verify the download

```sh
ls -lh discovery/cli/vendor/
# Expect: README.md, web-tree-sitter.js, web-tree-sitter.wasm, grammars/

ls -lh discovery/cli/vendor/grammars/
# Expect: go.wasm rust.wasm java.wasm cpp.wasm c.wasm kotlin.wasm
#         swift.wasm ruby.wasm php.wasm scala.wasm clojure.wasm

# Smoke-test the universal-ast detector on a tiny Go sample:
node executor/examples/e2e-universal-ast/drive-run.mjs
```

## `make download-grammars` (TBD)

A Makefile target wrapping the curl commands above is planned but NOT
yet implemented. Until it lands, run the curl commands manually from
the repo root. The Makefile target will:

1. Detect the host OS (Linux/macOS) and pick the right `curl`/`tar`
   flags.
2. Verify SHA-256 checksums against a `vendor/.checksums` file (so a
   tampered or truncated download is caught at download time, not at
   parse time).
3. Be idempotent: re-running skips files that already match their
   checksum.
4. Be safe to re-run after a `git clean -xdf` (the curl commands work
   from a pristine checkout).

Tracking issue: roadmap-2026-pro.md Item 2 follow-up (Phase 2).

## ADR-0022 / ADR-0021 cross-reference

- **ADR-0022**: discovery/cli has ZERO runtime npm deps. Vendoring the
  WASM binaries (rather than `npm install web-tree-sitter`) keeps this
  invariant intact. The `web-tree-sitter` npm package remains a
  devDependency for build-time TypeScript types only — it is NOT
  imported at runtime.
- **ADR-0021**: discovery is a procedure, not a tool. Committing
  binaries (the dist/ directory there; the vendor/ directory here) is
  the documented exception that enables offline execution from a fresh
  clone. The same exception applies.
