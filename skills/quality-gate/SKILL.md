---
name: quality-gate
description: Use after any code is written (at the `implement` / `migrate` / `apply-fix` states) and before `verify` — runs the project's own linters, type-checkers, and formatters, plus a self-review checklist. Catches quality issues that tests do not catch (test pass ≠ code quality). Distinct from `behavioral-verification` (which checks behavior) and `behavioral-simulation` (which probes for behavioral bugs in untested usage paths); this skill checks code quality — linting, types, formatting, complexity, dead code, naming conventions.
license: MIT
allowed-tools: [shell_exec, test_runner, filesystem_read]
---

# Quality Gate

## When to use this skill

Use after any code is written and before that code is verified.
Specifically:

- **`feature-request` workflow**: between `implement` and `test`
  (or directly before `verify` if no separate `test` state).
- **`change-request` workflow**: between `migrate` and `verify`.
- **`refactor` workflow**: between `implement` and
  `verify-equivalence`.
- **`bug-report` workflow**: between `apply-fix` and `verify`.

This skill is what stands between "the code was written" and "the
code is ready for behavioral verification." `verify` is for
*behavioral* correctness; this skill is for *code-quality*
correctness. Shipping low-quality code to `verify` wastes a
verification cycle on code that will need to be rewritten for
quality reasons anyway — a type error caught at quality-gate costs
one re-implement; the same type error caught at `verify` costs a
re-implement *plus* a wasted `verify` cycle *plus* the cognitive
overhead of context-switching back from verification to
implementation.

**Don't use as a substitute for `behavioral-verification`:** a
quality-gate pass does not mean the code is *behaviorally* correct.
Linters pass on code that has correct syntax but wrong behavior. Use
both: quality-gate first (catches quality issues cheaply), then
behavioral-verification (catches behavior issues expensively).

**Don't use as a substitute for `behavioral-simulation`:** that
skill probes for behavioral bugs in untested usage paths (empty
inputs, concurrent calls, retry-after-timeout). This skill probes
for *quality* issues (linting, types, complexity, conventions). Use
both — they catch different classes of problems at the same point
in the workflow.

## Procedure

### 1. Identify the project's quality tooling

Read `.aiecp/project-intelligence.json` (per `skills/testing/SKILL.md`
step 1 — same stack-native discipline). The file's
`project.test_system`, `project.build_system`, and (if present)
`project.lint_system` / `project.format_system` fields declare what
the project actually uses. If the file does not exist, run
`discovery/cli` first (`node dist/cli.js <repo-path>`) rather than
guessing.

If the project has ESLint configured (`eslint.config.js`,
`.eslintrc.*`), use ESLint. If it has Ruff (`ruff.toml`,
`[tool.ruff]` in `pyproject.toml`), use Ruff. If it has
golangci-lint (`.golangci.yml`), use that. If it has Clippy
(`[lints]` in `Cargo.toml`), use Clippy. **Never impose a linter
the project doesn't already use** — per
`constitution/engineering-principles.md` "Stack-native tooling, not
framework-imposed tooling," introducing a parallel toolchain
requires an ADR justifying it.

Record the identified tooling as an `Event` of `kind: "observation"`
with `payload.tools: ["eslint", "tsc", "prettier:check"]` and
`payload.source: ".aiecp/project-intelligence.json"`. This `Event`
anchors the rest of the procedure — every later check will cite it.

If the project has no quality tooling configured (a fresh repo, a
script-only project, a project that has explicitly opted out):
record that as `payload.tools: []` and proceed to step 3 (the
self-review checklist) as the only quality check. Do not silently
skip the gate.

### 2. Run the project's quality tooling

Invoke each identified tool via `shell_exec`. Capture each
invocation as an `Event` of `kind: "test_result"` (`event.schema.json`'s
`kind` enum includes `test_result`, which covers any tool that
reports pass/fail with structured output — not just unit-test
runners), `source: "<adapter_id>:shell_exec:<tool>"`, with
`payload` containing:

- `payload.command` — the exact command run
- `payload.exit_code` — `0` (pass) or non-zero (fail)
- `payload.errors` — the structured error output, if any
  (truncated to the first 50 lines per `evidence-engineering`
  step 4's redaction discipline — long error logs are noise, not
  signal)
- `payload.warnings` — non-fatal warnings, if any

Typical invocations by stack:

- **TypeScript:** `npx tsc --noEmit` (type check) + `npm run lint`
  (if defined) + `npm run format:check` (if defined).
- **Python:** `ruff check .` + `mypy .` (if configured) +
  `black --check .` (if configured).
- **Go:** `go vet ./...` + `golangci-lint run` (if configured) +
  `gofmt -l .` (should output nothing).
- **Rust:** `cargo clippy -- -D warnings` + `cargo fmt --check`.

### 3. Self-review checklist

Always run, even if no linters are configured (step 1's
`payload.tools: []` case). Each item below is a question the agent
asks of the code it just wrote. Record the answer as an `Event` of
`kind: "observation"` with `payload.check: "<item>"`,
`payload.passed: true|false`, and (if `false`) `payload.gap`
describing what failed.

- **Empty / null / undefined inputs.** Does the code handle the
  empty string, the empty array, `null` / `None` / `undefined`,
  `0`, `false`, and `NaN` for every input parameter? An input that
  "shouldn't be empty" must be rejected explicitly, not silently
  mis-handled. (This checklist item partially overlaps with
  `behavioral-simulation`'s input-shape dimension — the difference
  is that `behavioral-simulation` *runs* the input to see what
  happens; this checklist item *reasons* about what would happen.)
- **Concurrent calls.** If the code can be called concurrently
  (any shared state, any global, any mutable default argument), is
  it safe? If not, is the documented contract clear about it?
- **Actionable error messages.** Error messages tell the user *what
  to do*, not just what went wrong. "Invalid input" is not
  actionable; "input must be a non-empty string, got ''" is.
- **Complexity.** No function exceeds ~50 lines or ~3 levels of
  nesting (rough thresholds; the project's own linter may have
  stricter ones, in which case the linter wins). Long functions and
  deep nesting are readability debt, not bugs, but they cause bugs
  later — the next person to edit the file will not understand the
  full state.
- **TODOs / FIXMEs.** No `TODO` / `FIXME` / `XXX` comments left in
  code that should be resolved before commit. If a TODO is
  genuinely for later, it must reference an issue
  (`TODO(#1234): ...`); bare TODOs are debt without a plan.
- **Conventions.** The code follows the project's existing
  conventions — naming, file placement, import style, error
  handling pattern. Read 2-3 nearby files (via `filesystem_read`)
  to learn the conventions; do not impose a new style. A reviewer
  who sees "this code looks like a different author wrote it" has
  to spend extra attention to verify it isn't wrong — that
  attention tax is the cost of convention violations.

### 4. Emit a `Validation`

Aggregate the step-2 tool results and step-3 checklist into a
single `Validation` (`evidence/schema/validation.schema.json`):

- **`expected_ref`** — points at an `Expected` that says "the code
  passes the project's own quality checks (step 2) and the
  self-review checklist (step 3)." (The `Expected` is created
  here, in-workflow — there is no pre-existing spec for code
  quality, so this skill authors one and validates against it. The
  `Expected.predicate_kind` is `"static_assertion"` — quality is a
  property of the code, not a behavior over time.)
- **`actual_ref`** — points at the most recent `Event` from step 2
  (the last tool result) or step 3 (the last checklist item),
  whichever was emitted last.
- **`method: "app_validation"`** if any linter ran (step 2
  produced at least one `Event` with a non-null `exit_code`); this
  is the preferred method because the linter is the project's own
  external validator, not the agent's own judgment.
- **`method: "manual_review"`** if only the self-review ran (no
  linters configured). The method choice is honest — a self-review
  by the same agent that wrote the code is real work, but its
  conclusions are reviewable, not independently reproducible.
- **`result: "match"`** only if ALL step-2 tools exited `0` AND
  ALL step-3 checklist items passed.
- **`result: "mismatch"`** if any tool exited non-zero OR any
  checklist item failed. `evidence_refs` lists the failing
  `Event`s.
- **`result: "inconclusive"`** if a step-2 tool could not be run
  (e.g. the project's `lint` script is broken, or `npx tsc --noEmit`
  reports an internal error unrelated to the code under review).
  Treat as `mismatch` for safety: transition back to the
  code-changing state with `on: quality_gate_failed` and a precise
  gap statement that the linter itself errored.

### 5. If `result: "mismatch"`

Transition back to the code-changing state (`implement` /
`migrate` / `apply-fix`) with `on: quality_gate_failed`. Do NOT
proceed to `verify` — `verify` is for behavioral verification, not
quality verification. Shipping low-quality code to `verify` wastes
a verification cycle on code that will need to be rewritten anyway.

The re-entry to the code-changing state carries the failing
`Event`s as `evidence_refs` so the next iteration of the
implementation knows exactly what to fix. The agent must address
*every* failing check, not just the first one — fixing one and
re-running only to fail the next is the slow path; fixing all and
re-running is the fast path.

After re-implementing, the quality-gate runs again from step 1.
The new `Validation` *supersedes* the old one — the old
`mismatch` `Validation` is preserved in memory (per the workflow's
`report` state's decision-trace requirement), but the *current*
quality state of the code is whatever the most recent `Validation`
says.

## Tool integration

- **`shell_exec`**: invoke linters, type-checkers, formatters.
  Prefer one-shot commands (`npx tsc --noEmit`, `ruff check .`,
  `golangci-lint run`, `cargo clippy -- -D warnings`) over
  interactive tools — the output must be captured as `Event.payload`
  and replayable by a future `Replay` step.
- **`filesystem_read`**: read the project's existing code for style
  conventions (step 3's "Conventions" checklist item); read
  `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` for
  the project's configured quality tooling (step 1's discovery).
- **`test_runner`**: NOT for running tests (that's
  `skills/testing/SKILL.md`'s job, in the `test` state) — but for
  parsing test coverage reports if the project generates them, to
  check that the new code is actually covered. A line of code with
  no test coverage is a quality gap, even if it lints clean.

## Validation

This skill is considered successful for a given run only if:

- Every code-changing state in the run (`implement`, `migrate`,
  `apply-fix`) has a `quality-gate` `Validation` emitted *before*
  transitioning to the next state. A code-changing state that
  transitions to `verify` (or `test`, or `verify-equivalence`)
  without an intervening `quality-gate` `Validation` is a process
  violation.
- The `Validation.method` is `"app_validation"` if any project
  linter ran (step 2 produced at least one `Event` with a
  non-null `exit_code`), or `"manual_review"` if only the
  self-review checklist ran (the project has no configured quality
  tooling).
- No `result: "mismatch"` `Validation` is left without a workflow
  transition back to the code-changing state with
  `on: quality_gate_failed`. A mismatch that is "noted but
  ignored" is the failure mode this skill exists to prevent.
- For chat LLMs (no `shell_exec`): the self-review checklist
  (step 3) still runs as `method: "manual_review"`; the linter
  step (step 2) is replaced by an explicit note in the
  `Validation.why` (or an `alternatives` entry on the
  `Decision`) that "linters did not run because the chat adapter
  has no `shell_exec` capability — the user must run linters
  locally before merging."

## Examples

**Happy path:** `feature-request` workflow reaches `implement` →
code written → this skill runs → step 1 reads
`.aiecp/project-intelligence.json` showing
`lint_system: ["eslint", "tsc"]` → step 2 runs `npx tsc --noEmit`
(exit `0`) and `npm run lint` (exit `0`) → step 3 self-review: all
6 checklist items pass → step 4: emit `Validation` with
`result: "match"`, `method: "app_validation"`,
`expected_ref` pointing at the quality-gate `Expected`,
`actual_ref` pointing at the last step-2 `Event` → proceed to
`test`. Without this skill, the code might have type errors or lint
violations that `verify` would surface later, wasting a
verification cycle on code that should have been caught at the
quality gate.

**Failure mode:** `refactor` workflow reaches `implement` → code
refactored → this skill runs → step 2: `npx tsc --noEmit` exits
non-zero (a type error was introduced by the refactor — the
extracted helper has a narrower type than callers expect) → step 3:
checklist item "Conventions" also fails (the new helper file is in
`src/utils/` but the project's convention is `src/helpers/`) →
step 4: emit `Validation` with `result: "mismatch"`,
`evidence_refs` listing both failing `Event`s, `method:
"app_validation"` → step 5: transition back to `implement` with
`on: quality_gate_failed`, the failing `Event`s attached as
`evidence_refs` so the next iteration knows exactly what to fix
(type narrowing + file relocation). Without this skill, the type
error would have propagated to `verify-equivalence` where the test
suite might still pass (if the type error is in untested code), and
the refactor would have shipped a type regression that surfaces
only when a downstream consumer hits the narrowed type.
