# Discovery Fallback Procedure (for offline chat-sandbox agents)

**Purpose:** This procedure allows a `chat-sandbox` agent (per
ADR-0020 — ChatGPT Code Interpreter, Claude code execution, etc.)
to produce a valid `.aiecp/project-intelligence.json` WITHOUT
needing to run `discovery/cli` as a Node.js subprocess. This is
critical for offline sandbox environments where `npm install` is
not possible (no network access), which was the failure mode found
by the real ChatGPT test on 2026-08-14 (per ADR-0021).

**When to use this fallback:**

1. **PRIMARY PATH — run `discovery/cli` if available:**
   - Try `node discovery/cli/dist/cli.js .` (the dist/ is committed
     per ADR-0021, so this works without `npm install`).
   - If this succeeds, the Project Intelligence is produced by the
     canonical tool — use that, do not use this fallback.

2. **FALLBACK PATH — use this procedure:**
   - If `node discovery/cli/dist/cli.js .` fails (e.g., Node.js not
     available in the sandbox, or the sandbox is Python-only), OR
   - If the sandbox has no Node.js runtime at all (Python-only
     sandbox), OR
   - If `discovery/cli/dist/` is missing or stale (the
     `check-discovery-freshness.mjs` script flagged it).
   - Then follow this procedure to produce
     `.aiecp/project-intelligence.json` directly via filesystem
     reads + Python/shell probes.

**This procedure produces a schema-valid Project Intelligence.** It
is not a "second-class" output — the schema (`discovery/schema/
project-intelligence.schema.json`) is the contract, not the tool
that produced it. The canonical `discovery/cli` and this fallback
both produce documents that must validate against the same schema.

## The procedure (8 steps)

### Step 1: Identify the language(s) via marker files

List the root of the repo and check for these markers:

| Marker file | Language(s) detected |
|---|---|
| `package.json` | JavaScript / TypeScript (check `package.json`'s `devDependencies` for `typescript` — if present, TypeScript; else JavaScript) |
| `pyproject.toml` or `setup.py` or `requirements.txt` | Python |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `pom.xml` or `build.gradle` | Java / Kotlin |
| `Gemfile` | Ruby |
| `composer.json` | PHP |
| `Package.swift` | Swift |
| `*.csproj` or `*.fsproj` | C# / F# |

Record the detected language(s) in `project.stack`. A polyglot
repo may have multiple markers — record all of them.

### Step 2: Identify the framework(s)

For each detected language, check for framework markers:

| Language | Marker | Framework |
|---|---|---|
| JavaScript/TypeScript | `package.json` `dependencies` includes `express` | Express |
| JavaScript/TypeScript | `package.json` `dependencies` includes `next` | Next.js |
| JavaScript/TypeScript | `package.json` `dependencies` includes `react` | React |
| Python | `pyproject.toml` or `requirements.txt` includes `fastapi` | FastAPI |
| Python | `pyproject.toml` or `requirements.txt` includes `django` | Django |
| Python | `pyproject.toml` or `requirements.txt` includes `flask` | Flask |
| Rust | `Cargo.toml` `dependencies` includes `axum` | Axum |
| Go | `go.mod` requires `github.com/gin-gonic/gin` | Gin |

Record in `project.frameworks`. **Note: `frameworks` is NOT a field in
the schema** (`discovery/schema/project-intelligence.schema.json`
does not declare it, and sets `additionalProperties: false`). The
schema's `project` object has: `stack`, `layer`, `domain_summary`,
`build_system`, `test_system`. Framework detection is still useful
for the `domain_summary` one-liner ("Express API service" vs "Next.js
web app") and for future schema extensions, but for now record it in
`domain_summary` rather than a separate field. If no framework is
detected (library-only project), `frameworks` is correctly empty and
`domain_summary` should describe the library's purpose.

### Step 3: Identify the build system

| Language | Build system marker |
|---|---|
| JavaScript/TypeScript | `package.json` `scripts.build` (e.g., `tsc`, `webpack`, `vite build`) |
| JavaScript/TypeScript | Root `package.json` `workspaces` field → `npm-workspaces` (in addition to per-workspace build) |
| Python | `pyproject.toml` `[build-system]` (e.g., `setuptools`, `poetry-core`, `hatchling`) |
| Rust | `Cargo.toml` → cargo |
| Go | `go.mod` → go build |

Record in `project.build_system`.

### Step 4: Identify the test system

| Language | Test system marker |
|---|---|
| JavaScript/TypeScript | `package.json` `devDependencies` includes `jest` → Jest; `vitest` → Vitest; `mocha` → Mocha |
| JavaScript/TypeScript | `package.json` `scripts.test` is `node dist/cli.js --self-test` or similar custom pattern → record as the literal command (e.g., `node-self-test`) |
| Python | `pyproject.toml` `[tool.pytest...]` or `pytest.ini` → pytest; `unittest` if no marker but `import unittest` in source |
| Rust | `cargo test` (always, per Cargo convention) |
| Go | `go test` (always, per Go convention) |

Record in `project.test_system`. **Important:** if `scripts.test` is
a custom pattern (not a standard test runner), record it as-is so
downstream agents know what command to invoke. `has_test_suite` in
the `capabilities` object should be `true` if `scripts.test` is
defined, even if the runner is custom.

### Step 5: Identify the layer(s)

A repo can be one or more of: `backend`, `frontend`, `mobile`,
`desktop`, `cli`, `api`, `database`, `monorepo` (per the schema's
`enum`).

Heuristics:
- If `package.json` `dependencies` includes `express` / `fastapi` /
  `axum` → `backend` + `api`
- If `package.json` `dependencies` includes `react` / `next` / `vue`
  → `frontend`
- If repo has `ios/` or `android/` directory → `mobile`
- If repo has `Dockerfile` → likely `backend` or `api`
- If repo has multiple top-level `package.json` or `pyproject.toml`
  in subdirectories declared as `workspaces` → `monorepo`
- If repo has `bin` field in `package.json` or a CLI entrypoint → `cli`

Record in `project.layer`. The schema's enum is `["backend",
"frontend", "mobile", "desktop", "cli", "api", "database",
"monorepo"]` — only these values are accepted.

### Step 6: Identify the entrypoint(s)

| Language | Entrypoint marker |
|---|---|
| JavaScript/TypeScript | `package.json` `main` field, or `bin` field, or `scripts.start` |
| JavaScript/TypeScript | Each workspace's `bin` field (for monorepos) |
| Python | `pyproject.toml` `[project.scripts]`, or `[tool.poetry.scripts]`, or a `__main__.py` |
| Rust | `Cargo.toml` `[[bin]]` |
| Go | `package main` in `main.go` |

Record in `entrypoints` (a top-level field, an array of strings).
Each entrypoint is a path or a `package-name/bin-name` identifier.

### Step 7: Probe runtime versions

If your sandbox has a shell, run:

```bash
# Node.js
node --version
npm --version

# Python
python --version
python3 --version

# Rust
rustc --version
cargo --version

# Go
go version
```

If your sandbox is Python-only (no shell), use Python's built-in
introspection (NOT a subprocess call — `python` may not be on
PATH in a pure-Python sandbox):

```python
import sys, platform
print(f"Python: {sys.version}")              # → '3.11.5 (main, ...)'
print(f"Platform: {platform.system()}")      # → 'Linux'
print(f"Machine: {platform.machine()}")      # → 'x86_64'
print(f"Implementation: {platform.python_implementation()}")  # → 'CPython'
```

Record the relevant versions in `environment.versions` (a top-level
field — see step 8). These are used by the `environment` memory
entry (per `memory/schemas/environment.schema.json`).

If `git` is available, also run `git rev-parse HEAD` to capture the
commit hash for the `environment_fingerprint` (used by replay per
`docs/evidence-model.md`).

### Step 8: Write `.aiecp/project-intelligence.json`

The schema (`discovery/schema/project-intelligence.schema.json`)
requires these top-level fields:
- `schema_version` (must be `"1.0.0"`)
- `generated_at` (ISO 8601 date-time)
- `generated_by` (string — which discovery method produced this)
- `project` (object with `stack`, `layer`, `domain_summary`,
  `build_system`, `test_system`)
- `capabilities` (object with `has_test_suite`, `has_ci`,
  `has_containerization`, `database_detected`, `external_integrations`)
- `entrypoints` (array of strings)

**Important:** the schema sets `additionalProperties: false`, so you
cannot add custom fields like `discovery_method` or
`environment_fingerprint` at the root level. Encode the audit-trail
intent (which path produced this — canonical CLI vs fallback
procedure) in the `generated_by` field instead:

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-08-14T12:30:00Z",
  "generated_by": "chat-sandbox-fallback-procedure (per ADR-0021, skills/project-onboarding/discovery-fallback.md)",
  "project": {
    "stack": ["typescript"],
    "layer": ["monorepo", "cli"],
    "domain_summary": "AIECP framework — npm-workspaces monorepo with discovery/cli, executor, and adapters/agents packages",
    "build_system": ["tsc", "npm-workspaces"],
    "test_system": ["node-self-test"]
  },
  "capabilities": {
    "has_test_suite": true,
    "has_ci": false,
    "has_containerization": false,
    "database_detected": null,
    "external_integrations": []
  },
  "entrypoints": [
    "discovery/cli/dist/cli.js",
    "executor/dist/cli.js",
    "adapters/agents/dist/cli.js",
    "adapters/agents/dist/bin/write-entrypoints.js"
  ],
  "stale": false
}
```

**Field notes:**

- `generated_by`: encode the discovery method here, since the schema
  doesn't have a separate `discovery_method` field. Examples:
  - `"discovery/cli@<version>"` for canonical CLI output
  - `"chat-sandbox-fallback-procedure (per ADR-0021)"` for fallback output
  - `"manual"` for human-authored Project Intelligence
- `project.domain_summary`: a one-line description derived from the
  repo's structure. Include framework info here (since `frameworks`
  is not a schema field). E.g., "Express API service with /items
  endpoint" or "TypeScript CLI library for workflow orchestration".
- `project.layer`: must be from the schema's enum: `backend`,
  `frontend`, `mobile`, `desktop`, `cli`, `api`, `database`,
  `monorepo`. Multiple values allowed.
- `capabilities.has_test_suite`: `true` if `scripts.test` is
  defined in any `package.json` (or equivalent for other languages),
  even if the test runner is custom.
- `capabilities.has_ci`: `true` if `.github/workflows/` or
  `.gitlab-ci.yml` or similar CI config exists.
- `capabilities.has_containerization`: `true` if `Dockerfile` or
  `docker-compose.yml` exists.
- `stale`: `false` for a fresh discovery.

Do NOT add fields not in the schema — `additionalProperties: false`
will reject them.

## Validation

After writing the file, validate it against the schema. If your
sandbox has `ajv` available:

```bash
npx ajv validate -s discovery/schema/project-intelligence.schema.json -d .aiecp/project-intelligence.json
```

If `ajv` is not available (offline sandbox), do a structural check:
- All required top-level fields present
- `project.stack` is a non-empty array
- `project.layer` is a non-empty array
- `environment_fingerprint.runtime` is a non-empty string

If the structural check passes, emit a `Validation` entity with
`method: "contract_validation"` and `result: "match"` (the
contract being the schema). If it fails, fix the JSON and re-check.

## What this procedure does NOT do

- **Run language-specific linters or static analyzers.** The
  canonical `discovery/cli` may invoke `ruff` for Python or `eslint`
  for TypeScript to gather additional intelligence. This fallback
  procedure does not — it relies on marker files only, which is
  sufficient for the schema but may miss project-specific
  conventions. Document this gap in your run's `Event`s so a future
  agent knows the discovery was fallback-grade.
- **Detect CI/CD configuration.** The canonical CLI looks for
  `.github/workflows/*.yml`, `.gitlab-ci.yml`, etc. This fallback
  checks for their presence but does not parse them. Document.
- **Detect integration tests vs. unit tests.** The canonical CLI
  may distinguish; this fallback treats all tests as one category.

If any of these gaps are critical for the task at hand, transition
to `blocked` with `on: discovery_fallback_insufficient` and ask
the user to run `discovery/cli` locally.

## Why this procedure exists

Per ADR-0021: the canonical `discovery/cli` is a Node.js CLI that
requires `npm install` to build (the `dist/` is not committed by
default per Node.js convention). Chat-sandbox environments
(ChatGPT Code Interpreter, Claude code execution) often lack
network access for `npm install`. This procedure encodes discovery
as a *text procedure* rather than a *tool dependency* — consistent
with the framework's broader philosophy (chat LLMs follow
procedures encoded as text per `CHAT-ENTRYPOINT.md`, they don't
call subprocesses).

The committed `discovery/cli/dist/` (per ADR-0021) is the
primary fix — it lets chat-sandbox agents run the canonical CLI
without `npm install`. This fallback procedure is the secondary
fix — it lets chat-sandbox agents without a Node.js runtime at
all (Python-only sandboxes) still produce valid Project
Intelligence. Together, they make `project-onboarding` work in
any chat-sandbox environment.
