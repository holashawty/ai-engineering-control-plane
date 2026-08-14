---
name: project-onboarding
description: Use at the run-discovery, validate-discovery, write-project-memory, and write-environment-memory states of workflows/project-onboarding.sm.yaml — the FIRST workflow that runs against any new repo, producing the .aiecp/project-intelligence.json artifact and the initial project + environment memory entries that every other workflow depends on. Novel to AIECP; no upstream equivalent found in docs/research.md.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec]
---

# Project Onboarding

## When to use this skill

At the `run-discovery`, `validate-discovery`, `write-project-memory`,
and `write-environment-memory` states of
`workflows/project-onboarding.sm.yaml`. This skill is what stands
between "the agent has been pointed at a fresh repository" and "every
subsequent workflow can trust that `.aiecp/project-intelligence.json`
exists and the `project` / `environment` memory entries are written."

This is the **entry-point workflow** of the AIECP catalog. Every other
workflow that declares `reads_memory: [project]` in its `intake` state
(per `workflows/bug-report.sm.yaml`, `feature-request.sm.yaml`,
`code-review.sm.yaml`, `refactor.sm.yaml`, `change-request.sm.yaml`) is
depending on this skill having already run successfully against the
repo. There is no prior memory to read here — the project is new — and
this skill's job is to *write* the initial memory entries that future
runs will read. That is the structural property that makes
project-onboarding distinct from all other workflows.

Per `workflows/_router.md`'s classification method step 1: "Check
whether `.aiecp/project-intelligence.json` exists and is not `stale:
true`. If missing/stale → route to `project-onboarding` first."

## Procedure

### 1. Run discovery (state: `run-discovery`)

**TWO discovery paths (per ADR-0021):** the canonical CLI tool,
and a text-based fallback procedure for offline-sandbox environments
where `npm install` is not possible (chat-sandbox agents per
ADR-0020). Both produce schema-valid
`.aiecp/project-intelligence.json` documents.

#### Path A (PRIMARY) — canonical `discovery/cli` tool

Invoke `discovery/cli` (ADR-0016's existing Python + TypeScript CLI)
against the repo being onboarded. **The `dist/` directory is
committed to the repo** (per ADR-0021, against Node.js convention)
so this works without `npm install`:

```bash
# Run against the host repo — writes .aiecp/project-intelligence.json
# to the host repo's .aiecp/ directory. Works in offline sandboxes
# because dist/ is committed (per ADR-0021).
node discovery/cli/dist/cli.js /path/to/host/repo

# Dry run — validate and print, don't write (useful for validate-discovery
# when you want to inspect the produced document before persisting)
node discovery/cli/dist/cli.js /path/to/host/repo --dry-run

# If dist/ is missing OR you've modified discovery/cli/src/*.ts:
npm run build --workspace=discovery/cli
node scripts/check-discovery-freshness.mjs --update
git add -f discovery/cli/dist/   # only if you're committing the rebuild
```

The CLI runs ADR-0009's detector pipeline: language, framework, build,
test, entrypoint, layer, integration, cicd — each detector is a small
file under `discovery/cli/src/detectors/` registered in `src/discover.ts`'s
`REGISTRY`, with stack-specific implementations behind a stable
interface (per `discovery/cli/src/types.ts`). The orchestrator never
branches on stack name; it just runs every registered detector.

For each detector that ran, emit one `Event`
(`evidence/schema/event.schema.json`) with:

- `kind: "action"` (the agent did something — `event.schema.json`'s
  `kind` enum includes `action` for exactly this case)
- `source: "discovery/cli:<detector_name>"` (e.g.,
  `discovery/cli:language`, `discovery/cli:test-runner`,
  `discovery/cli:entrypoint`)
- `payload.finding` describing what was detected, e.g.,
  `{"language": "python", "evidence": "pyproject.toml found at repo
  root"}`

Wrap these `Event`s in a single `Trace`
(`evidence/schema/trace.schema.json`) covering the discovery run, so
the detector sequence is citable as a unit and the eventual `report`
state can include the discovery trail in the decision trace.

Transition to `validate-discovery` on `discovery_complete` after
this path.

#### Path B (FALLBACK) — text discovery procedure (per ADR-0021)

**Use this path when Path A fails or is unavailable:**
- The sandbox has no Node.js runtime (e.g., a Python-only ChatGPT
  Code Interpreter sandbox).
- `discovery/cli/dist/` is missing or stale (verify via
  `node scripts/check-discovery-freshness.mjs`).
- `node discovery/cli/dist/cli.js` errored for any reason.

Follow the procedure in
[`discovery-fallback.md`](discovery-fallback.md) — a sibling file in
this skill's directory. The procedure has 8 steps:

1. Identify the language(s) via marker files (`package.json` →
   Node.js/TypeScript, `pyproject.toml` → Python, `Cargo.toml` →
   Rust, etc.).
2. Identify the framework(s) via framework markers in
   `package.json`/`pyproject.toml`/etc.
3. Identify the build system.
4. Identify the test system.
5. Identify the layer(s) (backend, frontend, mobile, etc.).
6. Identify the entrypoint(s).
7. Probe runtime versions via `python --version`, `node --version`,
   etc. (or via `platform.*` in a Python-only sandbox).
8. Write `.aiecp/project-intelligence.json` with
   `discovery_method: "chat-sandbox-fallback-procedure"` for
   audit-trail distinction.

For each step of the fallback procedure, emit one `Event` with:
- `kind: "action"`
- `source: "discovery-fallback:step-N"` (e.g.,
  `discovery-fallback:step-1-language-markers`)
- `payload.finding` describing what was detected

Transition to `validate-discovery` on
`discovery_complete_via_fallback` after this path.

#### Failure handling

If neither path succeeds (Path A errored AND Path B cannot complete
because essential marker files are missing), transition to
`blocked` with `on: discovery_failed` and a precise gap statement
— never a vague "discovery didn't work." The blocked report should
name which path was tried, what error occurred, and what essential
information is missing.

**Per `skills/tool-use-discipline/SKILL.md`**: discovery is a
tool-driven activity. Do not guess at the stack from memory of "similar
repos" — invoke the CLI (Path A) or follow the procedure (Path B)
and let the detectors/markers tell you. Per
`skills/recency-verification/SKILL.md` step 2, the version probes the
CLI runs (`python --version`, `node --version`,
language-appropriate equivalents) are time-sensitive claims about the
current environment — let the tool produce them, do not assert them
from memory.

### 2. Validate discovery (state: `validate-discovery`)

Per ADR-0009, each detector's output is a fragment of Project
Intelligence that must validate against
`discovery/schema/project-intelligence.schema.json` (ADR-0015's
finalized schema, validated in code via ajv on every CLI run). The
CLI itself validates before writing — if the document failed schema
validation, `run-discovery` would have transitioned to `blocked`
already. This state's job is the *semantic* validation: did the
detectors pick up the *right* tools, not just *any* tools?

Emit three evidence artifacts:

1. **`Expected`** (`evidence/schema/expected.schema.json`) describing
   what a schema-valid Project Intelligence document for this repo's
   class (per the `classify` decision) should contain. For a
   single-language Python repo detected at `classify`: `project.stack
   == ["python"]`, `project.test_system` is non-empty if a test suite
   exists, `entrypoints` is non-empty (the CLI must have found at
   least one entry point), `capabilities.has_test_suite` matches
   whether a test directory was detected. The `source_ref` should
   point at the schema (`discovery/schema/project-intelligence.schema
   .json`) since this Expected is derived from the contract the
   document must honor. `predicate_kind: "behavioral"` is fine here —
   the schema describes behavioral properties of the document (which
   fields are required, what enums are valid).

2. **`Actual`** (`evidence/schema/actual.schema.json`) describing
   what `discovery/cli` actually produced. The `observed_value` is a
   summary of the persisted `.aiecp/project-intelligence.json`:
   detected stack, detected test system, detected entrypoints,
   detected capabilities. The `observation_ref` should point at the
   `Event` from `run-discovery` whose `payload.finding` corroborates
   the observation (e.g., the `discovery/cli:test-runner` event's id).

3. **`Validation`** (`evidence/schema/validation.schema.json`)
   comparing `Actual` against `Expected` with `method:
   "contract_validation"`. This is a schema/contract check, not a
   behavioral check — `app_validation` is for behavior (per
   `behavioral-verification`), `unit_test` is for a test suite, and
   `manual_review` is for human review. `contract_validation` is the
   method specifically named for "checking against a declared
   contract," which is exactly what this state does (the contract
   being `discovery/schema/project-intelligence.schema.json`). Set
   `result: "match"` if the produced document validates against both
   the JSON Schema AND the per-class Expected (the detected tools are
   the right tools); set `result: "mismatch"` if a detector picked up
   the wrong tool (e.g., detected `unittest` when the project
   actually uses `pytest`, or detected `express` when the project
   actually uses `fastify`).

May ask at most ONE necessary, specific, decision-changing question if
the produced Project Intelligence is ambiguous in a way the schema
cannot adjudicate — typically "is the detected test runner correct?"
when the language detector found both `pytest` and `unittest` and the
schema accepts both. This is the second of the `max_questions: 2`
budget.

**Failure handling:** if the produced document fails the per-class
Expected (a detector picked up the wrong tool), transition back to
`run-discovery` with `on: discovery_invalid_needs_rerun` rather than
accepting a wrong Project Intelligence document. A wrong Project
Intelligence poisons every downstream workflow — `bug-report`'s
`reproduce` state would run the wrong test runner, `feature-request`'s
`test` state would write tests in the wrong framework. Catching the
mismatch here, in `validate-discovery`, is structurally cheaper than
discovering it three workflows later.

### 3. Write project memory (state: `write-project-memory`)

Write the initial `project` memory entry
(`memory/schemas/project.schema.json` shape: `id`, `type: "project"`,
`schema_version`, `created_at`, `source`, `stack`, `layer`, `domain`).
This is the FIRST `project` memory entry for this repo; every future
workflow that declares `reads_memory: [project]` in its `intake`
state is depending on this entry existing.

- `id` follows the `^mem-project-[a-zA-Z0-9_-]+$` pattern (per
  schema). Suggested format: `mem-project-<repo-slug>-<iso-date>`,
  e.g., `mem-project-membership-service-2026-08-14`.
- `stack` and `layer` are copied directly from the validated Project
  Intelligence (`project.stack`, `project.layer`).
- `domain` is a one-line description derived from the repo's
  structure — what it does, not how. For a Python+pytest+Express
  polyglot repo: "Python service with pytest test suite and an
  Express frontend layer". For a single-language TypeScript API:
  "Express API service with /items endpoint and vitest test suite".
- `source` records which run produced this entry (e.g.,
  `project-onboarding-run-1`).

Per `docs/memory-model.md`, entries are *small* (target < 500 tokens
each). The `domain` field is the only free-form field — keep it a
single sentence, not a paragraph. Future structural changes (a new
language added, a layer removed) update this entry's `updated_at` and
the relevant fields; this entry is *set on onboarding, versioned on
structural change* per `docs/memory-model.md`'s lifecycle rule.

### 4. Write environment memory (state: `write-environment-memory`)

Write the initial `environment` memory entry
(`memory/schemas/environment.schema.json` shape: `id`, `type:
"environment"`, `schema_version`, `created_at`, `source`, `runtime`,
`versions`). Captures the fingerprint for future replay per
`docs/memory-model.md` ("refreshed on env change").

- `id` follows the `^mem-environment-[a-zA-Z0-9_-]+$` pattern. Suggested
  format: `mem-environment-<repo-slug>-<iso-date>`.
- `runtime` is the language runtime the project runs on, e.g.,
  `"python3.11"`, `"node20"`. Derived from the version probes
  (`python --version`, `node --version`).
- `versions` is an object mapping key dependency names to their
  pinned versions, e.g., `{"pytest": "8.1.2", "express": "4.19.2"}`.
  Derived from the host repo's lockfile (`pyproject.toml`,
  `package.json`, etc.).
- `os` and `arch` are optional but useful for replay reproducibility
  (e.g., `"linux-x64"`).
- `fingerprint_hash` is optional — a stable hash of the above fields
  for quick equality checks against
  `evidence/environment_fingerprint` entries (per schema description).

**REDACT any secret-shaped env var before writing.** The
`environment` schema does not have an `env_vars` field (unlike the
Evidence Model's `environment_fingerprint`), but if version probes
would capture secret values (e.g., via `printenv` or a shell
expansion), redact them per `evidence-engineering` step 4 before
writing. The `versions` field is for reproducibility, never for
secret capture — same rule as `evidence/schema/event.schema.json`'s
`payload` redaction.

This entry is kept separate from `project` memory because the two
have different change rates: `project` records what the repo IS
(structural, slow-changing — stack, layer, domain), while
`environment` records HOW it was built this run (versions, runtime —
fast-changing, refreshed on every environment change). A future
`discovery-refresh` workflow (per ADR-0015, planned) will update
`environment`'s `versions` and `runtime` when versions drift, but
leave `project` untouched unless the repo's structure itself changed.

## Tool integration

- **`shell_exec`**: invoke `discovery/cli` (`node dist/cli.js
  <repo-path>` from `discovery/cli/`), invoke version probes
  (`python --version`, `node --version`, `pip show <package>`,
  `npm ls <package>`, `go version`, `cargo --version`, etc.). The
  CLI's stdout/stderr is captured as `Event.payload.finding`
  verbatim — do not paraphrase it, the next state's `Actual` needs
  to cite what the CLI actually said.
- **`filesystem_read`**: read the host repo's structure (manifest
  files, `package.json` / `pyproject.toml` / `go.mod` / `Cargo.
  toml`, `Dockerfile`, CI configs) before invoking the CLI — the
  `classify` state uses this inspection to determine onboarding class
  (single-language vs. polyglot monorepo vs. legacy). Also used to
  read the validated `.aiecp/project-intelligence.json` after
  `run-discovery` writes it, so `validate-discovery` can compare the
  Actual against the Expected.
- **`filesystem_write`**: write `.aiecp/project-intelligence.json`
  (the CLI does this itself when not in `--dry-run` mode, but this
  capability is still declared because the workflow could
  conceivably produce the document via a different path in a future
  adapter that doesn't shell out to the CLI). Write the `project`
  and `environment` memory entries to `.aiecp/memory/<type>/` (per
  `docs/memory-model.md` "Storage"). All writes are to `.aiecp/`,
  never to source code.

## Validation (of this skill itself)

A `run-discovery` / `validate-discovery` / `write-project-memory` /
`write-environment-memory` step using this skill is done correctly
only if:

- At least one `Event` of `kind: "action"` with `source: "discovery/
  cli:<detector_name>"` was emitted for each detector that ran
  (per `tool-use-discipline`, no detector result is asserted from
  memory).
- The `validate-discovery` `Validation.method` is
  `"contract_validation"` (NOT `"unit_test"` — that would be wrong
  for a schema/contract check; NOT `"app_validation"` — that's for
  behavior; NOT `"manual_review"` — that's for human review). The
  schema permits other values, but this skill's procedure is
  explicit: contract validation is the method that matches what this
  state actually does.
- The `write-project-memory` step wrote a `project` memory entry
  whose `stack` and `layer` fields exactly match the validated
  Project Intelligence's `project.stack` and `project.layer` (no
  transcription drift between the discovery output and the memory
  entry).
- The `write-environment-memory` step wrote an `environment` memory
  entry whose `versions` object contains no secret-shaped values (per
  `evidence-engineering` step 4's redaction rule).
- No question was asked during `run-discovery`, `write-project-memory`,
  or `write-environment-memory` — these states are not in
  `project-onboarding.sm.yaml`'s `question_economy.allowed_states`
  (only `classify` and `validate-discovery` are). Asking a question
  here is a constitution violation, not a stylistic choice (per
  `constitution/constitution.md` §4).

## Examples

**Happy path:** onboarding a clean Python+pytest repo at
`/path/to/membership-service` — `classify` inspects the filesystem,
sees `pyproject.toml` + `tests/` + `src/membership.py` + a single
GitHub Actions workflow, classifies as "single-language greenfield,
Python, backend layer", no question needed (filesystem unambiguous)
→ `run-discovery` invokes `node dist/cli.js /path/to/membership-
service` from `discovery/cli/`, the CLI's Python detector matches on
`pyproject.toml`, the test detector matches on `pytest` config, the
entrypoint detector finds `src/membership.py`, the integration
detector finds no external services, the cicd detector finds
`.github/workflows/ci.yml`; one `Event` per detector emitted, wrapped
in a `Trace` → `validate-discovery` emits `Expected` (Python stack,
pytest test system, main entrypoint), `Actual` (what the CLI produced
— Python, pytest, src/membership.py), `Validation` with `result:
"match"`, `method: "contract_validation"` (no question needed —
detectors agree and match the schema) → `write-project-memory` writes
`mem-project-membership-service-2026-08-14` with `stack: ["python"]`,
`layer: ["backend"]`, `domain: "Python membership service with
pytest test suite"` → `write-environment-memory` writes `mem-
environment-membership-service-2026-08-14` with `runtime:
"python3.11"`, `versions: {"pytest": "8.1.2", "python": "3.11.7"}` →
`report` summarizes the discovery trail and the two memory writes,
terminal.

**Failure mode:** onboarding a polyglot repo (Python+pytest in
`backend/`, TypeScript+vitest in `frontend/`) — `classify` sees two
manifest files (`backend/pyproject.toml`, `frontend/package.json`),
asks the one allowed question ("is this a monorepo, or two unrelated
tools?") — user confirms monorepo → `run-discovery` invokes the CLI,
both the Python and TypeScript detectors run and produce merged
Project Intelligence; `validate-discovery` emits `Expected` (stack
should be `["python", "typescript"]`, BOTH `pytest` AND `vitest` in
`test_system`), but the `Actual` shows `test_system: ["pytest"]` only
— the test detector picked up pytest but missed vitest (the
TypeScript test runner). The `Validation` `result: "mismatch"` → ask
the one allowed `validate-discovery` question ("is pytest the only
test runner, or is there a TS test runner too?") — user confirms
vitest exists → transition back to `run-discovery` with `on:
discovery_invalid_needs_rerun`, the CLI re-runs (perhaps with an
explicit hint or with a freshly registered vitest detector), the
second `Actual` shows `test_system: ["pytest", "vitest"]`,
`Validation` `result: "match"` → proceed to memory writes. Without
this skill, the wrong Project Intelligence would have been written
to disk, and every downstream workflow (`bug-report`'s `reproduce`
state, `feature-request`'s `test` state) would have used `pytest`-
shaped tests against a repo that also has vitest, producing
confusing failures three workflows later with no obvious root cause.
