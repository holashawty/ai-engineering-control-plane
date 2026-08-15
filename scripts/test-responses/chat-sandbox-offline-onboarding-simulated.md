# Simulated chat-sandbox onboarding of the AIECP repo (Path B fallback)

**Self-identification (per `CHAT-ENTRYPOINT-SANDBOX.md` Step 0):** I am a
`chat-sandbox` LLM — specifically, I am simulating ChatGPT Code Interpreter
(Advanced Data Analysis) in an offline, Python-only sandbox. I have:

- `filesystem_read` (I can read files in the sandbox — the AIECP repo has
  been uploaded as a zip and unpacked into the sandbox).
- `filesystem_write` (I can write files in the sandbox, including
  `.aiecp/project-intelligence.json` and memory entries — but see the
  caveat at the `report` state: these artifacts live in *my* sandbox, not
  on the user's real filesystem unless they copy them out).
- `shell_exec` (Python only — `python3` is available; **`node` and `npm`
  are NOT available in this simulation**, which is the failure mode ADR-0021
  was written to fix).
- `web_search`: **unavailable** (no network in this sandbox).

This is the exact environment that failed the real ChatGPT test on
2026-08-14 (per ADR-0021's problem statement): the chat-sandbox correctly
routed to `project-onboarding` per `_router.md` rule 1, but couldn't proceed
because `discovery/cli/dist/` was .gitignored AND `npm install` timed out.
ADR-0021's two fixes — committing `dist/` (Path A) and the text
discovery-fallback procedure (Path B) — are what I am exercising now. Because
my sandbox has **no Node.js runtime at all**, Path A is unavailable to me
and I must use Path B.

Today's date: I have no `web_search`. Per constitution §8 and
`skills/recency-verification/SKILL.md` step 4 (honest fallback for LLMs
without web search), I will not assert today's date from training data. I
derive `2026-08-14T12:58:14Z` from the sandbox's own `date -u` (Python
`datetime.now(timezone.utc)`), which is the sandbox clock, not the user's
wall clock. This is acceptable because ADR-0021's test date is
`2026-08-14` and the sandbox clock agrees.

---

## Step 0.5 (per `workflows/_router.md` rule 1): check `.aiecp/project-intelligence.json`

Per `CHAT-ENTRYPOINT-SANDBOX.md` "CRITICAL: per _router.md rule 1, if
`.aiecp/project-intelligence.json` does not exist, you MUST run
project-onboarding FIRST before any other workflow." I checked:

```python
import os
print(os.path.exists('.aiecp/project-intelligence.json'))
# → False
print(os.path.exists('.aiecp'))
# → False  (the entire .aiecp/ directory is absent)
```

The file does not exist; the directory does not exist. This is a fresh
onboarding case (not a stale-but-present case that would route to the
future `discovery-refresh` workflow per ADR-0015). I route to
`project-onboarding`.

```aiecp:evidence
kind: event
data:
  id: event-pi-absence-check
  trace_ref: trace-onboarding-run-1
  schema_version: "1.0.0"
  ts: 2026-08-14T12:58:14Z
  kind: observation
  source: "chat-sandbox:router-rule-1-check"
  payload:
    path: ".aiecp/project-intelligence.json"
    exists: false
    dot_aiecp_dir_exists: false
    decision: "route to project-onboarding (fresh case — not a refresh)"
    rule: "workflows/_router.md rule 1 (per CHAT-ENTRYPOINT-SANDBOX.md 'CRITICAL' callout)"
```

---

## Walking the `project-onboarding` workflow (`workflows/project-onboarding.sm.yaml`)

### State: `intake`

Per `state_detail.intake.purpose`: "Capture the user's onboarding request
verbatim." The user (this simulation's task description) asked me to:

> "Walk the `project-onboarding` workflow's `run-discovery` state using
> Path B (fallback) — because in this simulation, you have no Node.js
> (only Python). … The repo you're 'onboarding' is the AIECP repo itself."

`intake` emits no evidence (`emits_evidence: []`) and asks no questions
(per `question_economy.allowed_states: [classify, validate-discovery]`).
Proceed to `classify`.

```aiecp:advance
on: intent_classified
```

### State: `classify`

Per `state_detail.classify.purpose`: classify the onboarding class via
filesystem inspection only (no Project Intelligence yet — `run-discovery`
has not run). I inspected the repo root and the workspace layout:

- Root `package.json` declares `"workspaces": ["discovery/cli", "executor",
  "adapters/agents"]` → npm workspaces monorepo.
- Each of those three subdirectories has its own `package.json` with a
  distinct `name` (`@aiecp/discovery`, `@aiecp/executor`,
  `@aiecp/adapters-agents`), distinct `bin` entrypoints, and a distinct
  `tsconfig.json`. These are three real sub-packages, not stubs.
- All four `package.json` files are TypeScript (`devDependencies.typescript`
  is present in all three workspaces).
- No `pyproject.toml`, `setup.py`, `requirements.txt`, `Cargo.toml`,
  `go.mod`, `Gemfile`, `composer.json`, `Package.swift`, or `*.csproj`
  anywhere in the repo (verified by glob).

**Onboarding class: single-language TypeScript npm-workspaces monorepo.**
This is unambiguous from the filesystem layout alone — three sub-package
`package.json`s, all TypeScript, orchestrated by a root `package.json`
declaring `workspaces`. The fallback Step 5 heuristic ("If repo has multiple
top-level `package.json` or `pyproject.toml` in subdirectories → monorepo")
fires deterministically.

**Question budget consideration:** `question_economy.allowed_states:
[classify, validate-discovery]` and `max_questions: 2`. The legitimate
`classify`-state question is "is this a monorepo?" when filesystem layout
is ambiguous. Here, the layout is unambiguous (root `package.json`
explicitly declares `workspaces` with 3 entries, all of which exist as
real sub-packages). I will not spend a question here — preserving the
budget for `validate-discovery` if needed.

```aiecp:evidence
kind: decision
data:
  id: decision-onboarding-class-monorepo-ts
  schema_version: "1.0.0"
  trace_ref: trace-onboarding-run-1
  made_at: 2026-08-14T12:58:14Z
  made_by: agent
  what: "onboarding_class: single-language TypeScript npm-workspaces monorepo (3 workspaces: discovery/cli, executor, adapters/agents)"
  why: >
    Filesystem inspection is unambiguous: root package.json declares
    workspaces=[discovery/cli, executor, adapters/agents]; each subdirectory
    contains its own package.json with a distinct @aiecp/* name, its own
    tsconfig.json (identical compilerOptions: target ES2022, module NodeNext,
    strict true), and its own bin entrypoint. No Python/Rust/Go/etc. marker
    files present (verified by glob). The fallback Step 5 'monorepo if multiple
    top-level package.jsons in subdirectories' heuristic fires deterministically.
    No classify-state question is needed — the legitimate question ('is this a
    monorepo?') is answerable by inspection here because the root package.json
    explicitly declares 'workspaces' rather than relying on layout inference
    alone.
  alternatives:
    - option: "polyglot monorepo"
      rejected_because: "no non-TypeScript marker files found anywhere in the repo (glob for pyproject.toml/setup.py/requirements.txt/Cargo.toml/go.mod/Gemfile/composer.json/Package.swift/*.csproj all returned empty)"
    - option: "single-language greenfield"
      rejected_because: "rejected on 'greenfield' — three sub-packages with MIT license, NOTICE file, DECISIONS.md with prior ADRs, and STATUS.md indicating an active phase are not greenfield. The 'single-language' part is correct; 'greenfield' is not."
    - option: "ask the user 'is this a monorepo?' as the allowed classify question"
      rejected_because: "filesystem layout is unambiguous (root package.json explicitly declares workspaces); the question would not be decision-changing per question_economy.rule"
  validated: false
  result: accepted
```

```aiecp:advance
on: class_known
```

### State: `run-discovery`

Per `state_detail.run-discovery.purpose` and `CHAT-ENTRYPOINT-SANDBOX.md`
"Discovery: two paths": try Path A first, fall back to Path B if Path A fails.

#### Path A attempt: `node discovery/cli/dist/cli.js .`

Per `CHAT-ENTRYPOINT-SANDBOX.md`: "The `dist/` directory is committed to
the repo (per ADR-0021), so this works **without `npm install`**." I
verified `discovery/cli/dist/cli.js` IS present in the repo (the LS
returned `discovery/cli/dist/cli.js`, `discover.js`, `types.js`, and
`detectors/typescript.js` / `detectors/python.js`). So Path A's prerequisite
(committed `dist/`) is satisfied. However, my sandbox has no Node.js
runtime:

```python
import shutil
print(shutil.which('node'))   # → None
print(shutil.which('npm'))    # → None
```

Path A cannot execute. Documenting the failure precisely (not vaguely):

```aiecp:evidence
kind: event
data:
  id: event-path-a-node-unavailable
  trace_ref: trace-onboarding-run-1
  schema_version: "1.0.0"
  ts: 2026-08-14T12:58:14Z
  kind: error
  source: "chat-sandbox:run-discovery:path-a-attempt"
  payload:
    path: "Path A (canonical discovery/cli)"
    command: "node discovery/cli/dist/cli.js ."
    prerequisite_check:
      dist_committed: true
      dist_files_present: ["discovery/cli/dist/cli.js", "discovery/cli/dist/discover.js", "discovery/cli/dist/types.js", "discovery/cli/dist/detectors/typescript.js", "discovery/cli/dist/detectors/python.js"]
    failure_reason: "no Node.js runtime in sandbox (Python-only sandbox — shutil.which('node') returned None)"
    adr_reference: "ADR-0021 (committing dist/ fixed the 'dist was .gitignored' half; this simulation exercises the 'no node runtime at all' half, which is what Path B was written for)"
    next_action: "fall back to Path B per skills/project-onboarding/discovery-fallback.md"
```

#### Path B: follow `skills/project-onboarding/discovery-fallback.md` (8 steps)

Per the workflow spec, the FALLBACK PATH emits "one `Event` per step of
the discovery-fallback procedure (8 steps)." I will additionally wrap
these in a `Trace` so the 8-step sequence is citable as a unit (per the
`run-discovery.emits_evidence: [trace, event]` declaration).

```aiecp:evidence
kind: trace
data:
  id: trace-discovery-fallback-8-steps
  schema_version: "1.0.0"
  started_at: 2026-08-14T12:58:14Z
  source: agent_adapter
  event_refs:
    - event-fallback-step-1-languages
    - event-fallback-step-2-frameworks
    - event-fallback-step-3-build-system
    - event-fallback-step-4-test-system
    - event-fallback-step-5-layers
    - event-fallback-step-6-entrypoints
    - event-fallback-step-7-version-probes
    - event-fallback-step-8-write-json
```

##### Step 1: Identify the language(s) via marker files

Per discovery-fallback.md Step 1's marker table. I checked the repo root
for every marker in the table.

| Marker file            | Present? | Language(s) detected |
|------------------------|----------|-----------------------|
| `package.json`         | yes      | TypeScript (root + 3 workspaces all have `devDependencies.typescript`) |
| `pyproject.toml`       | no       | — |
| `setup.py`             | no       | — |
| `requirements.txt`     | no       | — |
| `Cargo.toml`           | no       | — |
| `go.mod`               | no       | — |
| `pom.xml`/`build.gradle` | no    | — |
| `Gemfile`              | no       | — |
| `composer.json`        | no       | — |
| `Package.swift`        | no       | — |
| `*.csproj`/`*.fsproj`  | no       | — |

The fallback doc says: "check `package.json`'s `devDependencies` for
`typescript` — if present, TypeScript; else JavaScript." All three
workspaces declare `"typescript": "^5.6.0"` in `devDependencies`. So:
**TypeScript** (not JavaScript).

```aiecp:evidence
kind: event
data:
  id: event-fallback-step-1-languages
  trace_ref: trace-discovery-fallback-8-steps
  schema_version: "1.0.0"
  ts: 2026-08-14T12:58:14Z
  kind: observation
  source: "discovery-fallback:step-1"
  payload:
    step: 1
    step_name: "identify-languages-via-marker-files"
    markers_checked: ["package.json", "pyproject.toml", "setup.py", "requirements.txt", "Cargo.toml", "go.mod", "pom.xml", "build.gradle", "Gemfile", "composer.json", "Package.swift", "*.csproj", "*.fsproj"]
    markers_present: ["package.json"]
    markers_absent: ["pyproject.toml", "setup.py", "requirements.txt", "Cargo.toml", "go.mod", "pom.xml", "build.gradle", "Gemfile", "composer.json", "Package.swift", "*.csproj", "*.fsproj"]
    package_json_locations:
      - "package.json (root)"
      - "discovery/cli/package.json"
      - "executor/package.json"
      - "adapters/agents/package.json"
    typescript_in_devdeps:
      "package.json (root)": "n/a (root has no devDependencies — workspaces do)"
      "discovery/cli/package.json": "typescript@^5.6.0"
      "executor/package.json": "typescript@^5.6.0"
      "adapters/agents/package.json": "typescript@^5.6.0"
    detected_stack: ["typescript"]
    is_javascript_or_typescript: "typescript (per fallback doc rule: typescript in devDependencies → TypeScript, not JavaScript)"
    python_check: "no pyproject.toml, no setup.py, no requirements.txt — AIECP is NOT a Python project (despite the discovery/cli/src/detectors/python.ts file existing, which is a TypeScript detector FOR Python projects, not Python code itself)"
```

##### Step 2: Identify the framework(s)

Per discovery-fallback.md Step 2's framework table. For JavaScript/
TypeScript, the table checks `package.json` `dependencies` for `express`,
`next`, `react`. None of those are present in any of the four
`package.json` files. The actual runtime dependencies are:
- `ajv@^8.17.1` (JSON Schema validator — a library, not a framework)
- `ajv-formats@^3.0.1` (ajv formats plugin — library)
- `js-yaml@^4.1.0` (YAML parser — library, only in executor + adapters/agents)

None of these are "frameworks" in the fallback doc's sense (web/app
frameworks like Express/Next/React). So `frameworks: []`.

```aiecp:evidence
kind: event
data:
  id: event-fallback-step-2-frameworks
  trace_ref: trace-discovery-fallback-8-steps
  schema_version: "1.0.0"
  ts: 2026-08-14T12:58:14Z
  kind: observation
  source: "discovery-fallback:step-2"
  payload:
    step: 2
    step_name: "identify-frameworks"
    framework_markers_checked_for: ["express", "next", "react", "vue"]
    found_in_dependencies: "none"
    actual_runtime_dependencies:
      "discovery/cli": ["ajv@^8.17.1", "ajv-formats@^3.0.1"]
      "executor": ["ajv@^8.17.1", "ajv-formats@^3.0.1", "js-yaml@^4.1.0"]
      "adapters/agents": ["ajv@^8.17.1", "ajv-formats@^3.0.1", "js-yaml@^4.1.0"]
    classification_note: "ajv / ajv-formats / js-yaml are libraries, not application frameworks per the fallback doc's table sense. The fallback table only enumerates web/app frameworks (express/next/react/vue); it does not have entries for build-time libraries. Detecting zero frameworks is accurate, not a gap."
    detected_frameworks: []
```

##### Step 3: Identify the build system

Per discovery-fallback.md Step 3: "JavaScript/TypeScript | `package.json`
`scripts.build` (e.g., `tsc`, `webpack`, `vite build`)". Each workspace's
`scripts.build` is `"tsc -p tsconfig.json"`. The root's `scripts.build`
chains them via `npm run build --workspace=...` (npm workspaces
orchestration).

```aiecp:evidence
kind: event
data:
  id: event-fallback-step-3-build-system
  trace_ref: trace-discovery-fallback-8-steps
  schema_version: "1.0.0"
  ts: 2026-08-14T12:58:14Z
  kind: observation
  source: "discovery-fallback:step-3"
  payload:
    step: 3
    step_name: "identify-build-system"
    scripts_build_per_package:
      "package.json (root)": "npm run build --workspace=discovery/cli && npm run build --workspace=executor && npm run build --workspace=adapters/agents"
      "discovery/cli/package.json": "tsc -p tsconfig.json"
      "executor/package.json": "tsc -p tsconfig.json"
      "adapters/agents/package.json": "tsc -p tsconfig.json"
    detected_build_system: ["tsc", "npm-workspaces"]
    tsconfig_compilerOptions:
      target: "ES2022"
      module: "NodeNext"
      moduleResolution: "NodeNext"
      outDir: "dist"
      rootDir: "src"
      strict: true
      esModuleInterop: true
      skipLibCheck: true
      declaration: false
      resolveJsonModule: true
    note: "tsc is the actual TypeScript compiler; npm-workspaces is the orchestration layer that runs tsc once per workspace. Both are listed because the schema's build_system field is an array and accepts multiple."
```

##### Step 4: Identify the test system

Per discovery-fallback.md Step 4: "JavaScript/TypeScript |
`devDependencies` includes `jest` → Jest; `vitest` → Vitest; `mocha` →
Mocha". None of those are in any workspace's `devDependencies`. Instead,
each workspace's `scripts.test` is `"node dist/cli.js --self-test"` — a
custom self-test pattern where each CLI exposes a `--self-test` flag that
runs its own internal assertions.

```aiecp:evidence
kind: event
data:
  id: event-fallback-step-4-test-system
  trace_ref: trace-discovery-fallback-8-steps
  schema_version: "1.0.0"
  ts: 2026-08-14T12:58:14Z
  kind: observation
  source: "discovery-fallback:step-4"
  payload:
    step: 4
    step_name: "identify-test-system"
    jest_in_devdeps: false
    vitest_in_devdeps: false
    mocha_in_devdeps: false
    scripts_test_per_package:
      "discovery/cli/package.json": "node dist/cli.js --self-test"
      "executor/package.json": "node dist/cli.js --self-test"
      "adapters/agents/package.json": "node dist/cli.js --self-test"
    detected_test_system: ["node-self-test"]
    classification_note: >
      The fallback doc's table only enumerates jest/vitest/mocha for
      JavaScript/TypeScript. AIECP uses none of those — it uses a custom
      '--self-test' flag pattern on each CLI. This is a real gap in the
      fallback doc's table: it doesn't cover the 'custom CLI self-test'
      pattern. I am recording 'node-self-test' as the test system label
      (rather than leaving it empty) because has_test_suite=true is
      clearly intended (each workspace has a 'test' script that exits
      non-zero on failure). A future canonical discovery/cli detector
      should refine this label — possibly to 'node-custom-self-test' or
      to distinguish per-workspace. I am NOT spending a validate-discovery
      question on this because the schema accepts any string for
      test_system, the pattern is unambiguous from inspection, and asking
      the user 'is node-self-test correct?' would not be decision-changing
      (the answer is yes by definition — that's what scripts.test runs).
```

##### Step 5: Identify the layer(s)

Per discovery-fallback.md Step 5: heuristic table. The repo has multiple
top-level `package.json`s in subdirectories → `monorepo`. Each workspace
declares a `bin` entrypoint → `cli`. None of the workspaces declare
`express`/`fastapi`/etc. → not `backend` or `api` in the runtime-HTTP
sense. No `ios/` or `android/` directory → not `mobile`. No `Dockerfile`
→ no containerization hint. No `react`/`next`/`vue` → not `frontend`.

```aiecp:evidence
kind: event
data:
  id: event-fallback-step-5-layers
  trace_ref: trace-discovery-fallback-8-steps
  schema_version: "1.0.0"
  ts: 2026-08-14T12:58:14Z
  kind: observation
  source: "discovery-fallback:step-5"
  payload:
    step: 5
    step_name: "identify-layers"
    heuristic_fired:
      - "multiple top-level package.jsons in subdirectories (discovery/cli/, executor/, adapters/agents/) → monorepo"
      - "each workspace declares a 'bin' entrypoint (aiecp-discover, aiecp-run, aiecp-sync-entrypoints, aiecp-write-entrypoints) → cli"
    heuristic_did_not_fire:
      - "express/fastapi/axum in dependencies → would have added 'backend' + 'api' (none present)"
      - "react/next/vue in dependencies → would have added 'frontend' (none present)"
      - "ios/ or android/ directory → would have added 'mobile' (none present)"
      - "Dockerfile present → would have hinted 'backend' or 'api' (none present — verified by glob)"
    detected_layers: ["monorepo", "cli"]
    layers_rejected: ["backend", "frontend", "mobile", "desktop", "api", "database"]
    api_layer_question: "AIECP defines API contracts (evidence/schema/*.schema.json, workflows/*.sm.yaml) but does not implement a running HTTP API service. I am NOT including 'api' in layers because the schema's layer enum appears to mean 'this repo serves an HTTP API', not 'this repo defines API schemas'. If the canonical discovery/cli has a different interpretation, that would be a validate-discovery question — but it is not, because the schema does not constrain layer semantics beyond the enum, and 'cli' + 'monorepo' is sufficient to route subsequent workflows."
```

##### Step 6: Identify the entrypoint(s)

Per discovery-fallback.md Step 6: "JavaScript/TypeScript | `package.json`
`main` field, or `bin` field, or `scripts.start`". The root `package.json`
has no `main` and no `bin`, but its `scripts` invoke the sub-package bins
(`node adapters/agents/dist/bin/write-entrypoints.js . .` for
`sync-entrypoints`, `node scripts/validate-chat-output.mjs` for
`validate:chat-output`, etc.). Each workspace's `bin` field declares the
real entrypoints.

```aiecp:evidence
kind: event
data:
  id: event-fallback-step-6-entrypoints
  trace_ref: trace-discovery-fallback-8-steps
  schema_version: "1.0.0"
  ts: 2026-08-14T12:58:14Z
  kind: observation
  source: "discovery-fallback:step-6"
  payload:
    step: 6
    step_name: "identify-entrypoints"
    root_package_json_main: "absent"
    root_package_json_bin: "absent"
    root_package_json_scripts_start: "absent"
    workspace_bin_entrypoints:
      "discovery/cli/package.json":
        aiecp-discover: "./dist/cli.js"
      "executor/package.json":
        aiecp-run: "./dist/cli.js"
      "adapters/agents/package.json":
        aiecp-sync-entrypoints: "./dist/sync-entrypoints-cli.js"
        aiecp-write-entrypoints: "./dist/bin/write-entrypoints.js"
    detected_entrypoints:
      - {path: "discovery/cli/dist/cli.js", kind: "cli"}
      - {path: "executor/dist/cli.js", kind: "cli"}
      - {path: "adapters/agents/dist/cli.js", kind: "cli"}
      - {path: "adapters/agents/dist/bin/write-entrypoints.js", kind: "build_script"}
    note_on_dist_paths: "These dist/ paths are the COMPILED output of `tsc -p tsconfig.json`. The TS source files are in discovery/cli/src/cli.ts, executor/src/cli.ts, adapters/agents/src/cli.ts, adapters/agents/src/bin/write-entrypoints.ts. The schema's entrypoints field wants the runnable path; for an ESM TypeScript project compiled with outDir=dist, that's the .js file in dist/."
    note_on_adapters_agents_bin: "adapters/agents declares TWO bin entries (aiecp-sync-entrypoints and aiecp-write-entrypoints). The root package.json's `sync-entrypoints` script invokes the latter (write-entrypoints.js), not the former (sync-entrypoints-cli.js). I include both as 'cli' kind because both are declared bin entrypoints in the package.json — the canonical discovery/cli would do the same. Marking write-entrypoints.js as kind=build_script because that's its actual role (it generates CLAUDE.md/GEMINI.md/etc. from AGENTS.md per ADR-0006); the sync-entrypoints-cli.js is the user-facing CLI."
```

##### Step 7: Probe runtime versions

Per discovery-fallback.md Step 7: run `python --version`, `node --version`,
etc. In this Python-only sandbox, I can run `python3 --version` and probe
`platform.system()` / `platform.machine()`. I cannot run `node --version`
(no Node.js runtime — that's the whole reason I'm on Path B). I infer the
declared Node.js version from `package.json`'s `engines` field, but the
root `package.json` has no `engines` field, and neither do the workspaces
(verified by reading all four). So the declared Node.js version is
unconstrained.

```python
import platform, sys
print(sys.version)              # → 3.12.13
print(platform.system())        # → Linux
print(platform.machine())       # → x86_64
print(platform.python_implementation())  # → CPython
```

```aiecp:evidence
kind: event
data:
  id: event-fallback-step-7-version-probes
  trace_ref: trace-discovery-fallback-8-steps
  schema_version: "1.0.0"
  ts: 2026-08-14T12:58:14Z
  kind: observation
  source: "discovery-fallback:step-7"
  payload:
    step: 7
    step_name: "probe-runtime-versions"
    python_probe:
      command: "python3 --version"
      result: "Python 3.12.13"
      implementation: "CPython"
    platform_probe:
      os: "Linux"
      arch: "x86_64"
      via: "platform.system() / platform.machine()"
    node_probe:
      command: "node --version"
      result: "command not found (no Node.js runtime in sandbox)"
      inference_from_engines_field: "absent (no package.json in the repo declares an 'engines' field — verified by reading all four)"
      declared_node_version: "unconstrained"
    npm_probe:
      command: "npm --version"
      result: "command not found (no npm in sandbox — same root cause as node)"
    git_probe:
      command: "git rev-parse HEAD"
      result: "425725313303194cb977d77928cbae59704b228e"
      commit_timestamp: "2026-08-14T12:05:23Z (from git log -1 --format=%cI)"
    declared_dependency_versions:
      typescript: "^5.6.0 (declared in devDependencies of all 3 workspaces)"
      ajv: "^8.17.1 (declared in dependencies + devDependencies of all 3 workspaces)"
      ajv-formats: "^3.0.1 (declared in dependencies + devDependencies of all 3 workspaces)"
      js-yaml: "^4.1.0 (declared in dependencies + devDependencies of executor and adapters/agents only)"
      "@types/node": "^22.0.0 (declared in devDependencies of all 3 workspaces — implies Node.js 22.x target runtime)"
      "@types/js-yaml": "^4.0.9 (declared in devDependencies of executor and adapters/agents)"
    note: "Per skills/recency-verification/SKILL.md, the dependency versions declared in package.json are 'declared, not actual' — I cannot verify they resolve to those exact versions without npm install (which is unavailable offline). The git_commit is actual (I ran git rev-parse HEAD in the sandbox). The Python version is actual (I ran python3 --version). The os/arch are actual (platform.system/machine)."
```

##### Step 8: Write `.aiecp/project-intelligence.json`

Per discovery-fallback.md Step 8: produce the JSON document, set
`discovery_method: "chat-sandbox-fallback-procedure"`.

**IMPORTANT schema-vs-doc discrepancy I detected while constructing this
document** (documenting honestly, per tool-use-discipline): the fallback
doc's Step 8 example JSON uses fields `discovered_at`, `discovery_method`,
and `environment_fingerprint`, but the actual
`discovery/schema/project-intelligence.schema.json` does NOT declare any
of those properties, and the schema sets `additionalProperties: false` at
the root. The schema's actual required fields are `schema_version`,
`generated_at`, `generated_by`, `project`, `capabilities`, `entrypoints`.
Following the doc's own principle ("the schema... is the contract, not
the tool that produced it"), I am honoring the **schema** over the doc's
prose template. Specifically:

- I use `generated_at` (schema field) instead of `discovered_at` (doc
  field) — same semantic.
- I encode the fallback-method audit trail in `generated_by` (schema
  field, description: "Which discovery detector pipeline version produced
  this.") — set to
  `"chat-sandbox-fallback-procedure (ADR-0021 + skills/project-onboarding/discovery-fallback.md; canonical discovery/cli unavailable: no Node.js runtime in sandbox)"`.
  This preserves the audit-trail intent of the doc's `discovery_method`
  field without violating `additionalProperties: false`.
- I do NOT include `environment_fingerprint` at the root (the schema
  has no such field); the environment fingerprint is captured separately
  in the `environment` memory entry written by the
  `write-environment-memory` state (which IS where it belongs per
  `memory/schemas/environment.schema.json`).
- I add `capabilities` and `entrypoints` (schema-required) which the
  doc's template omits entirely.

The full document I am "writing to `.aiecp/project-intelligence.json` in
my sandbox":

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-08-14T12:58:14Z",
  "generated_by": "chat-sandbox-fallback-procedure (ADR-0021 + skills/project-onboarding/discovery-fallback.md; canonical discovery/cli unavailable: no Node.js runtime in sandbox)",
  "stale": false,
  "project": {
    "stack": ["typescript"],
    "layer": ["monorepo", "cli"],
    "domain_summary": "AI Engineering Control Plane (AIECP) framework — pure-TypeScript npm-workspaces monorepo. Root orchestrator tying discovery/cli, executor, and adapters/agents into one install/build/test flow. This is the framework's own repository, not a host project it's been installed into.",
    "build_system": ["tsc", "npm-workspaces"],
    "test_system": ["node-self-test"],
    "frameworks": []
  },
  "capabilities": {
    "has_test_suite": true,
    "has_ci": false,
    "has_containerization": false,
    "database_detected": null,
    "external_integrations": []
  },
  "conventions": {
    "module_system": "ESM (\"type\": \"module\" in discovery/cli, executor, and adapters/agents package.json)",
    "typescript_strict": true,
    "typescript_target": "ES2022",
    "typescript_module_resolution": "NodeNext",
    "license": "MIT",
    "test_pattern": "node dist/cli.js --self-test (custom self-test flag pattern, not jest/vitest/mocha)",
    "bootstrap_script": "npm run bootstrap (install:all + build + test in one command)"
  },
  "constraints": [
    {
      "constraint": "discovery/cli/dist/ is committed to the repo (per ADR-0021) so offline chat-sandbox agents can run the canonical CLI without npm install",
      "source": "ADR-0021",
      "scope": "discovery/cli"
    },
    {
      "constraint": "AGENTS.md is the canonical agent-agnostic entrypoint; CLAUDE.md, GEMINI.md, .cursor/rules/*, .windsurfrules, .github/copilot-instructions.md are generated from it by sync-entrypoints (ADR-0006) and must never be hand-edited directly",
      "source": "AGENTS.md",
      "scope": "adapters/agents"
    },
    {
      "constraint": "skills/project-onboarding/discovery-fallback.md is the Path B procedure for producing this file when no Node.js runtime is available (ADR-0021); the produced document's generated_by field MUST distinguish fallback-produced from canonical-CLI-produced Project Intelligence",
      "source": "ADR-0021 + discovery-fallback.md",
      "scope": "project-onboarding workflow"
    }
  ],
  "dependencies": {
    "root": {
      "workspaces": ["discovery/cli", "executor", "adapters/agents"],
      "bootstrap_script": "npm run bootstrap"
    },
    "discovery/cli": {
      "name": "@aiecp/discovery",
      "dependencies": ["ajv@^8.17.1", "ajv-formats@^3.0.1"],
      "devDependencies": ["typescript@^5.6.0", "@types/node@^22.0.0", "ajv@^8.17.1", "ajv-formats@^3.0.1"],
      "bin": {"aiecp-discover": "./dist/cli.js"}
    },
    "executor": {
      "name": "@aiecp/executor",
      "dependencies": ["ajv@^8.17.1", "ajv-formats@^3.0.1", "js-yaml@^4.1.0"],
      "devDependencies": ["typescript@^5.6.0", "@types/node@^22.0.0", "ajv@^8.17.1", "js-yaml@^4.1.0", "@types/js-yaml@^4.0.9"],
      "bin": {"aiecp-run": "./dist/cli.js"}
    },
    "adapters/agents": {
      "name": "@aiecp/adapters-agents",
      "dependencies": ["ajv@^8.17.1", "ajv-formats@^3.0.1", "js-yaml@^4.1.0"],
      "devDependencies": ["typescript@^5.6.0", "@types/node@^22.0.0", "ajv@^8.17.1", "ajv-formats@^3.0.1", "js-yaml@^4.1.0", "@types/js-yaml@^4.0.9"],
      "bin": {
        "aiecp-sync-entrypoints": "./dist/sync-entrypoints-cli.js",
        "aiecp-write-entrypoints": "./dist/bin/write-entrypoints.js"
      }
    }
  },
  "entrypoints": [
    {"path": "discovery/cli/dist/cli.js", "kind": "cli"},
    {"path": "executor/dist/cli.js", "kind": "cli"},
    {"path": "adapters/agents/dist/cli.js", "kind": "cli"},
    {"path": "adapters/agents/dist/bin/write-entrypoints.js", "kind": "build_script"}
  ],
  "environments": ["local", "ci"]
}
```

The "file write" event (the document above is the payload content):

```aiecp:evidence
kind: event
data:
  id: event-fallback-step-8-write-json
  trace_ref: trace-discovery-fallback-8-steps
  schema_version: "1.0.0"
  ts: 2026-08-14T12:58:14Z
  kind: state_write
  source: "discovery-fallback:step-8-write-json"
  payload:
    step: 8
    step_name: "write-project-intelligence-json"
    target_path: ".aiecp/project-intelligence.json"
    sandbox_only: true
    persistence_caveat: "This file is written to MY sandbox, not the user's real filesystem. Per CHAT-ENTRYPOINT-SANDBOX.md: 'artifacts you write (.aiecp/, evidence JSON, etc.) live in your sandbox, NOT on the user's real filesystem.' The user must copy this file out of the sandbox at the report state to persist it."
    schema_validation_status: "pending — see validate-discovery state below"
    discovery_method_audit_trail:
      doc_intended_field: "discovery_method"
      doc_intended_value: "chat-sandbox-fallback-procedure"
      schema_reality: "discovery_method is NOT a schema field; the schema sets additionalProperties:false at root"
      actual_encoding: "encoded into generated_by field (which IS in the schema and whose description is 'Which discovery detector pipeline version produced this.') — value: 'chat-sandbox-fallback-procedure (ADR-0021 + skills/project-onboarding/discovery-fallback.md; canonical discovery/cli unavailable: no Node.js runtime in sandbox)'"
      rationale: "the fallback doc itself says 'the schema is the contract, not the tool that produced it' — so when the doc's prose template conflicts with the actual schema, the schema wins"
    schema_doc_discrepancies_recorded:
      - "doc template uses 'discovered_at'; schema requires 'generated_at' — I used generated_at"
      - "doc template uses 'discovery_method' (top-level); schema does not allow it (additionalProperties:false) — encoded into generated_by instead"
      - "doc template uses 'environment_fingerprint' (top-level); schema does not allow it — environment fingerprint is captured separately in the environment memory entry per memory/schemas/environment.schema.json (which is where the workflow's write-environment-memory state puts it)"
      - "doc template omits 'capabilities' (schema-required) — I added it with has_test_suite/has_ci/has_containerization/database_detected/external_integrations"
      - "doc template omits 'entrypoints' (schema-required) — I added it with the 4 entrypoints from Step 6"
      - "doc template omits 'generated_by' (schema-required) — I added it"
      - "doc template's project sub-object includes 'name'/'domain'/'entrypoints' fields; schema's project sub-object has stack/layer/domain_summary/build_system/test_system (no name, no entrypoints — entrypoints is top-level) — I followed the schema's project sub-object shape"
    gap_disclosures:
      - "fallback does not run language-specific linters (ruff/eslint) — canonical discovery/cli might; not relevant here because no Python linter would fire and the TS linter (eslint) is not configured in the repo (no .eslintrc found)"
      - "fallback does not parse CI/CD config — has_ci=false is a presence check (no .github/workflows directory exists, verified by glob); the canonical CLI would also check .gitlab-ci.yml, .circleci/, etc. — I checked those too (none present)"
      - "fallback does not distinguish integration tests from unit tests — AIECP's test_system is 'node-self-test' which conflates both; not a problem here because there are no separate integration test directories"
```

#### State transition out of `run-discovery`

All 8 fallback steps completed; the JSON document is "written" to the
sandbox (it lives in my sandbox filesystem, not the user's — I'll surface
the persistence caveat again at the `report` state). Transition on the
**NEW** transition added by ADR-0021:

```aiecp:advance
on: discovery_complete_via_fallback
```

(The OLD transition `discovery_complete` is reserved for Path A. ADR-0021
adds `discovery_complete_via_fallback` so the audit trail distinguishes
which path produced the document. The workflow's `transitions` array at
lines 40-41 of `workflows/project-onboarding.sm.yaml` declares both:
`{ from: run-discovery, to: validate-discovery, on: discovery_complete }`
and
`{ from: run-discovery, to: validate-discovery, on: discovery_complete_via_fallback }`.)

### State: `validate-discovery`

Per `state_detail.validate-discovery.purpose`: validate the produced
Project Intelligence against the schema and against expectations. Emit
`Expected`, `Actual`, `Validation` (with `method: "contract_validation"`).

I cannot run `npx ajv validate` (no Node.js runtime). Per the fallback
doc's "If `ajv` is not available (offline sandbox), do a structural
check" — that is the path I take.

**Question budget consideration:** the legitimate `validate-discovery`-
state question is "is the detected test runner correct?" — asked when
the language detector found both `pytest` and `unittest` and the schema
accepts both. Here, the test_system is `["node-self-test"]` — only one
test runner detected, no ambiguity. I will not spend a question.

#### Expected (what a schema-valid PI for this repo should contain)

```aiecp:evidence
kind: expected
data:
  id: expected-pi-schema-valid-for-aiecp-monorepo
  schema_version: "1.0.0"
  source_ref: "discovery/schema/project-intelligence.schema.json + workflows/project-onboarding.sm.yaml#state_detail.validate-discovery"
  predicate: >
    A schema-valid Project Intelligence document for the AIECP repo (a
    single-language TypeScript npm-workspaces monorepo, onboarding class
    decided at classify state) MUST: (a) have schema_version="1.0.0";
    (b) have a non-empty project.stack containing "typescript" and ONLY
    "typescript" (no other language marker files exist); (c) have a
    non-empty project.layer containing "monorepo" (3 workspaces declared
    in root package.json) and "cli" (each workspace declares a bin
    entrypoint); (d) have project.build_system including "tsc" (all 3
    workspaces' scripts.build run tsc); (e) have project.test_system
    non-empty (each workspace has a scripts.test); (f) have capabilities
    with has_test_suite=true; (g) have entrypoints non-empty (4 bin
    entrypoints declared across the 3 workspaces); (h) have generated_at
    in ISO 8601 date-time format; (i) have generated_by indicating the
    fallback procedure (because Path A was unavailable — see
    event-path-a-node-unavailable); (j) PASS JSON Schema validation
    against discovery/schema/project-intelligence.schema.json (no
    additionalProperties violations, all required fields present).
  predicate_kind: invariant
```

#### Actual (what the fallback produced)

```aiecp:evidence
kind: actual
data:
  id: actual-pi-produced-by-fallback
  schema_version: "1.0.0"
  expected_ref: expected-pi-schema-valid-for-aiecp-monorepo
  observation_ref: event-fallback-step-8-write-json
  observed_value:
    schema_version: "1.0.0"
    generated_at: "2026-08-14T12:58:14Z"
    generated_by: "chat-sandbox-fallback-procedure (ADR-0021 + skills/project-onboarding/discovery-fallback.md; canonical discovery/cli unavailable: no Node.js runtime in sandbox)"
    stale: false
    project:
      stack: ["typescript"]
      layer: ["monorepo", "cli"]
      domain_summary: "AI Engineering Control Plane (AIECP) framework — pure-TypeScript npm-workspaces monorepo..."
      build_system: ["tsc", "npm-workspaces"]
      test_system: ["node-self-test"]
      frameworks: []
    capabilities:
      has_test_suite: true
      has_ci: false
      has_containerization: false
      database_detected: null
      external_integrations: []
    entrypoints_count: 4
    environments: ["local", "ci"]
    document_path_in_sandbox: ".aiecp/project-intelligence.json"
  observed_at: 2026-08-14T12:58:14Z
```

#### Validation (contract check)

Structural check (offline — `ajv` not available, per fallback doc):

- ✅ All 6 required top-level fields present:
  `schema_version`, `generated_at`, `generated_by`, `project`,
  `capabilities`, `entrypoints`.
- ✅ `schema_version == "1.0.0"` (const).
- ✅ `generated_at` parses as ISO 8601 date-time.
- ✅ `project.stack` is a non-empty array containing only `"typescript"`
  (string type, matches schema).
- ✅ `project.layer` is a non-empty array; all values
  (`"monorepo"`, `"cli"`) are in the schema's enum
  `["backend", "frontend", "mobile", "desktop", "cli", "api", "database",
  "monorepo"]`.
- ✅ `project.build_system` and `project.test_system` are arrays of
  strings.
- ✅ `capabilities.has_test_suite` is boolean (true).
- ✅ `entrypoints` is a non-empty array; each item has `path` (string)
  and `kind` (enum `["main", "cli", "api_route", "test_entry",
  "build_script"]`) — all 4 entrypoints' kinds (`cli`, `cli`, `cli`,
  `build_script`) are valid enum values.
- ✅ `additionalProperties: false` at root: I verified no top-level field
  is outside the schema's properties list. Present top-level fields:
  `schema_version`, `generated_at`, `generated_by`, `stale`, `project`,
  `capabilities`, `conventions`, `constraints`, `dependencies`,
  `entrypoints`, `environments` — all 11 are in the schema's properties.

```aiecp:evidence
kind: validation
data:
  id: validation-pi-schema-structural-check
  schema_version: "1.0.0"
  expected_ref: expected-pi-schema-valid-for-aiecp-monorepo
  actual_ref: actual-pi-produced-by-fallback
  result: match
  method: contract_validation
  evidence_refs:
    - event-fallback-step-8-write-json
  validated_at: 2026-08-14T12:58:14Z
  decision_ref: null
  # note: full ajv-based JSON Schema validation was not run because the
  # sandbox has no Node.js runtime to invoke `npx ajv validate`. Per
  # discovery-fallback.md's "If ajv is not available (offline sandbox),
  # do a structural check" — that is what this Validation records. The
  # structural check verified all required fields present, all enum
  # values valid, all type constraints satisfied, and no
  # additionalProperties violations. method=contract_validation is the
  # correct enum value per evidence/schema/validation.schema.json (the
  # alternatives app_validation/unit_test/replay_comparison/manual_review
  # do not fit a schema-structure check). A future run with Node.js
  # available should re-validate with ajv for full format-validation
  # (e.g., date-time format strictness on generated_at).
```

**Question budget final tally:** 0 of 2 questions spent. The two allowed
states (`classify`, `validate-discovery`) both had unambiguous answers
derivable from inspection. I am NOT asking a question just to pad the
budget — per `question_economy.rule`, each question must be "necessary,
specific, decision-changing." Neither state had a decision-changing
ambiguity.

```aiecp:advance
on: discovery_valid
```

### State: `write-project-memory`

Per `state_detail.write-project-memory.purpose`: write the initial
`project` memory entry per `memory/schemas/project.schema.json`. This is
the FIRST `project` memory entry for this repo; every future workflow
that declares `reads_memory: [project]` in its `intake` state depends on
this entry existing.

The schema requires: `id`, `type`, `created_at`, `source`,
`schema_version`, `stack`, `layer`. Optional: `updated_at`, `domain`.
Pattern: `id` must match `^mem-project-[a-zA-Z0-9_-]+$`. The schema sets
`additionalProperties: false` — so I cannot include fields like
`build_system` or `test_system` (those live in the Project Intelligence
document, not the project memory entry).

```aiecp:memory
type: project
data:
  id: mem-project-aiecp-framework-repo
  schema_version: "1.0.0"
  type: project
  created_at: 2026-08-14T12:58:14Z
  updated_at: null
  source: "chat-sandbox-fallback-procedure (project-onboarding run, ADR-0021 fallback path; Path A unavailable — no Node.js runtime in sandbox)"
  stack: ["typescript"]
  layer: ["monorepo", "cli"]
  domain: "AI Engineering Control Plane (AIECP) framework — pure-TypeScript npm-workspaces monorepo tying discovery/cli, executor, and adapters/agents into one install/build/test flow. This is the framework's own repository, not a host project it's been installed into."
```

Persistence caveat (per `CHAT-ENTRYPOINT-SANDBOX.md`): this memory entry
is "written" to my sandbox (e.g., to `.aiecp/memory/project.json` or
wherever the future memory-store implementation expects it). It does not
persist to the user's real filesystem unless they copy it out. The user
will be reminded at the `report` state.

```aiecp:advance
on: project_memory_written
```

### State: `write-environment-memory`

Per `state_detail.write-environment-memory.purpose`: write the initial
`environment` memory entry per `memory/schemas/environment.schema.json`.
The schema requires: `id`, `type`, `created_at`, `source`,
`schema_version`, `runtime`, `versions`. Optional: `os`, `arch`,
`fingerprint_hash`, `updated_at`. Pattern: `id` must match
`^mem-environment-[a-zA-Z0-9_-]+$`. `additionalProperties: false`.

Per the workflow purpose: "REDACT any secret-shaped env var before
writing — the `environment` schema does not have an `env_vars` field,
but if version probes would capture secret values (e.g., via `printenv`),
redact them before emitting." I did not run `printenv` (no need — version
probes via `python3 --version` and `platform.*` don't touch env vars), so
there is nothing to redact.

```aiecp:memory
type: environment
data:
  id: mem-environment-chat-sandbox-offline-2026-08-14
  schema_version: "1.0.0"
  type: environment
  created_at: 2026-08-14T12:58:14Z
  source: "chat-sandbox-fallback-procedure (project-onboarding run, ADR-0021 fallback path)"
  runtime: "python3.12 (sandbox); node unavailable — this is the constraint that forced Path B"
  versions:
    python: "3.12.13 (CPython — actual, probed via python3 --version)"
    typescript_declared: "^5.6.0 (declared in devDependencies of all 3 workspaces — NOT actual, because npm install cannot run offline)"
    ajv_declared: "^8.17.1 (declared — not actual)"
    ajv-formats_declared: "^3.0.1 (declared — not actual)"
    js-yaml_declared: "^4.1.0 (declared in executor + adapters/agents — not actual)"
    "@types/node_declared": "^22.0.0 (declared — implies Node.js 22.x target runtime, but no Node.js is actually installed in this sandbox)"
    git_commit: "425725313303194cb977d77928cbae59704b228e (actual, probed via git rev-parse HEAD)"
  os: "Linux"
  arch: "x86_64"
  fingerprint_hash: "TODO — not computed in fallback procedure; the schema marks this optional, so its absence is valid. A future canonical discovery/cli run with Node.js available should compute sha256 of (runtime + sorted(versions) + os + arch) and populate this field."
```

Persistence caveat (same as the project memory entry): this is written
to my sandbox, not the user's real filesystem.

```aiecp:advance
on: environment_memory_written
```

### State: `report` (terminal)

Per `state_detail.report.purpose`: "Summarize the onboarding outcome ...
Must include the Decision Trace (docs/architecture.md), not just
'onboarded.' Unlike other workflows' `report` states that write a
`project` memory entry recording the run's outcome, project-onboarding's
`report` writes NO new memory — the `project` and `environment` entries
were already written by the preceding two states. Writing a third here
would duplicate the `project` entry this run just created."

The `report` state writes no new memory and emits no new evidence per
its `emits_evidence: []` (not explicitly declared, but inherited from
the terminal-state convention). The Decision Trace is the sequence of
states and transitions walked above, which is already captured in the
evidence trail.

#### Decision trace (per `docs/architecture.md`)

1. **`intake`** — captured the user's onboarding request; no evidence
   emitted (`emits_evidence: []`); no question asked (not in
   `allowed_states`); transitioned `on: intent_classified`.
2. **`classify`** — inspected filesystem (root `package.json` declares
   3 workspaces, each TypeScript); determined onboarding class = single-
   language TypeScript npm-workspaces monorepo; considered asking "is
   this a monorepo?" but layout is unambiguous (root `package.json`
   explicitly declares `workspaces`); emitted `decision-onboarding-class-
   monorepo-ts`; transitioned `on: class_known`.
3. **`run-discovery`** — tried Path A (`node discovery/cli/dist/cli.js .`);
   `dist/cli.js` IS committed (ADR-0021 fix verified) but `node` is not
   available in this Python-only sandbox (Path A's other half of the
   ADR-0021 failure mode); fell back to Path B; followed all 8 steps of
   `discovery-fallback.md`; produced a schema-valid Project Intelligence
   document; emitted one event per fallback step + a trace wrapping
   them; transitioned `on: discovery_complete_via_fallback` (the NEW
   transition added by ADR-0021).
4. **`validate-discovery`** — performed a structural check against
   `discovery/schema/project-intelligence.schema.json` (ajv not
   available offline, per fallback doc's allowance); emitted `expected`
   + `actual` + `validation` (method=`contract_validation`,
   result=`match`); considered asking "is the detected test runner
   correct?" but only one runner detected (no ambiguity); transitioned
   `on: discovery_valid`.
5. **`write-project-memory`** — wrote `mem-project-aiecp-framework-repo`
   per `memory/schemas/project.schema.json` (stack=typescript,
   layer=[monorepo,cli], domain=AIECP framework); transitioned
   `on: project_memory_written`.
6. **`write-environment-memory`** — wrote `mem-environment-chat-sandbox-
   offline-2026-08-14` per `memory/schemas/environment.schema.json`
   (runtime=python3.12 + node-unavailable note, os=Linux, arch=x86_64);
   transitioned `on: environment_memory_written`.
7. **`report`** — terminal state. This summary. No new memory written.

#### What was discovered

- **Stack:** `["typescript"]` (single language; no Python/Rust/Go/etc.
  marker files anywhere).
- **Layer:** `["monorepo", "cli"]` (3 npm workspaces; each declares bin
  entrypoints).
- **Build system:** `["tsc", "npm-workspaces"]` (each workspace:
  `tsc -p tsconfig.json`; root: chains via `npm run build --workspace=...`).
- **Test system:** `["node-self-test"]` (each workspace's `scripts.test`
  is `node dist/cli.js --self-test` — a custom pattern, NOT
  jest/vitest/mocha).
- **Frameworks:** `[]` (ajv/ajv-formats/js-yaml are libraries, not
  application frameworks per the fallback doc's table).
- **Entrypoints (4):** `discovery/cli/dist/cli.js` (cli),
  `executor/dist/cli.js` (cli),
  `adapters/agents/dist/cli.js` (cli),
  `adapters/agents/dist/bin/write-entrypoints.js` (build_script).
- **Capabilities:** has_test_suite=true, has_ci=false (no
  `.github/workflows/`), has_containerization=false (no Dockerfile),
  database_detected=null, external_integrations=[].

#### What was written

1. `.aiecp/project-intelligence.json` — the schema-valid Project
   Intelligence document (full content in `event-fallback-step-8-write-json`).
2. `.aiecp/memory/project.json` (or wherever the future memory-store
   implementation places it) — the `mem-project-aiecp-framework-repo`
   entry.
3. `.aiecp/memory/environment.json` (same caveat) — the
   `mem-environment-chat-sandbox-offline-2026-08-14` entry.

#### ⚠ Sandbox persistence caveat (per `CHAT-ENTRYPOINT-SANDBOX.md`)

**All three artifacts above live in MY sandbox, NOT on your real
filesystem.** Per `CHAT-ENTRYPOINT-SANDBOX.md`: "artifacts you write
(`.aiecp/`, evidence JSON, etc.) live in your sandbox, NOT on the user's
real filesystem. If the user wants to persist them, they must manually
copy the files out of your sandbox at the end of the session. Tell the
user this honestly at the report state."

To persist this onboarding run, you (the user) need to copy these three
files out of my sandbox:

1. `.aiecp/project-intelligence.json`
2. The `project` memory entry (`mem-project-aiecp-framework-repo`)
3. The `environment` memory entry (`mem-environment-chat-sandbox-offline-
   2026-08-14`)

Paste the JSON content I emitted in `event-fallback-step-8-write-json`
and the two `aiecp:memory` blocks into the corresponding files on your
real repo, then run `node scripts/validate-chat-output.mjs` locally to
re-validate against the schema with `ajv` (which I could not do offline).

#### What the next workflow to run against this repo would be

Per `workflows/_router.md`'s classification method — now that
`.aiecp/project-intelligence.json` exists, the router can route intent.
The next workflow depends on what task you bring me:

- If you report a bug → `bug-report` (per `_router.md`'s intent signals).
- If you request a new feature → `feature-request`.
- If you want a code change reviewed → `code-review`.
- If you want to refactor without changing behavior → `refactor`.
- If you report a regression → `regression`.
- If you report a performance problem → `performance-problem`.
- If you request a broader change with planning → `change-request`.

#### Honest UX feedback on the discovery-fallback procedure

While walking Path B honestly, I encountered three real UX issues with
`skills/project-onboarding/discovery-fallback.md` that a future ADR or
doc revision should address:

1. **The Step 8 example JSON does NOT match the actual schema.** The
   doc's template uses `discovered_at`, `discovery_method`, and
   `environment_fingerprint` at the root level, but
   `discovery/schema/project-intelligence.schema.json` does not declare
   any of those properties and sets `additionalProperties: false`. The
   schema's actual required fields are `schema_version`, `generated_at`,
   `generated_by`, `project`, `capabilities`, `entrypoints` — none of
   which (except `schema_version` and `project`) appear in the doc's
   template. A chat-sandbox LLM that copies the template verbatim would
   produce a document that FAILS schema validation. I followed the
   schema (the contract) and encoded the `discovery_method` audit-trail
   intent into the `generated_by` field instead. The doc should be
   updated to show the schema's actual field names, OR the schema
   should be updated to add `discovery_method` as an optional field (the
   latter would be a cleaner audit-trail solution).

2. **Step 2's framework table is incomplete for TypeScript CLI/library
   projects.** The table only enumerates web/app frameworks (express,
   next, react, vue). AIECP uses ajv/ajv-formats/js-yaml — none are in
   the table. The fallback doc should either (a) explicitly say
   "frameworks is empty for projects that use only libraries, not
   application frameworks — that is correct, not a gap," OR (b) extend
   the table to include common TypeScript libraries (ajv, js-yaml,
   zod, etc.) classified as "library" vs "framework."

3. **Step 4's test-system table doesn't cover the "custom CLI self-test"
   pattern.** The table only enumerates jest/vitest/mocha for
   JavaScript/TypeScript. AIECP uses `node dist/cli.js --self-test` —
   none of the table's entries apply. I recorded `"node-self-test"` as
   the test_system value, but the doc should add a row: "JS/TS |
   `scripts.test` runs `node <path> --self-test` | custom self-test
   pattern (record as 'node-self-test' or per-project name)" — otherwise
   a future chat-sandbox LLM might leave test_system empty, which would
   be wrong (it would imply has_test_suite=false when in fact every
   workspace has a test script).

None of these issues blocked me — I worked around all three honestly.
But they are real friction points that the next chat-sandbox LLM hitting
this procedure would also hit.

---

**End of simulated chat-sandbox onboarding run.** Workflow complete at
the `report` terminal state. 23 `aiecp:*` blocks emitted (1 trace, 10
events, 1 decision, 1 expected, 1 actual, 1 validation, 2 memory, 6
advance). Question budget spent: 0 of 2. No memory entries duplicated
(per `report` state's purpose).
