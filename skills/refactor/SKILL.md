---
name: refactor
description: 'Use at the capture-baseline, design-refactor, implement, and verify-equivalence states of workflows/refactor.sm.yaml — performs behavior-preserving code restructuring where the contract is "do not change externally-observable behavior." Specialized: the verify-equivalence step uses Validation.method="replay_comparison" (the only workflow that does), because unit_test alone cannot prove equivalence. Novel to AIECP; no upstream equivalent found in docs/research.md.'
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Refactor

## When to use this skill

At the `capture-baseline`, `design-refactor`, `implement`, and
`verify-equivalence` states in `workflows/refactor.sm.yaml`. Do not
apply this skill to a request that includes any intended behavior
change — that is a `feature-request` or `change-request`, not a
refactor, and routing it through this workflow will silently produce
the wrong artifact (a `Validation` claiming equivalence when the
user actually wanted new behavior).

**Refactor is behavior-preserving by definition.** If the user wants
behavior change — even small, even "while you're at it" — route to
`feature-request.sm.yaml` or `change-request` instead. A refactor
that smuggles in a behavior change is not a refactor that failed
verification; it is a refactor that was mis-classified, and the
mis-classification is the bug. The `verify-equivalence` step exists
to catch this — but catching it there is late. The earlier it is
caught (ideally at `intake` / `classify`), the smaller the wasted
work.

**When NOT to use this skill:**
- The request includes "and also make it do X" → `feature-request`.
- The request describes broken behavior → `bug-report`.
- The request describes modifying existing (not-broken) behavior →
  `change-request`.
- The user wants a performance improvement that changes the
  timing profile but not the I/O contract → still a refactor, but
  the equivalence check is now "did the timing change beyond the
  allowed tolerance" — see the `verify-equivalence` subsection
  below; if the timing change is the *point* of the work, it's a
  `performance-problem`, not a refactor.

## Procedure

### 1. Capture baseline (state: `capture-baseline`)

Before touching any code, capture what the code currently does. The
baseline is the contract the refactor must preserve.

1. Run the project's existing test suite via `test_runner` (per
   Project Intelligence `project.test_system`). Capture each test
   result as its own `event` with `kind: "test_result"`
   (`evidence/schema/event.schema.json`), grouped under a `trace`
   (`evidence/schema/trace.schema.json`) with `source:
   "test_runner"`. Do not collapse the suite output into a single
   "X passed" event — individual test names matter: a future
   `verify-equivalence` step needs to know *which* tests passed,
   not just the count, so a per-test delta is detectable.
2. Author an `expected` (`evidence/schema/expected.schema.json`)
   describing the baseline behavioral contract: "the test suite
   covers the following behaviors, all currently green." This is
   NOT the new-behavior `Expected` (refactor has no new behavior);
   it is the contract the refactor must not break. The
   `predicate_kind` is `"behavioral"`.
3. If no test suite exists, transition to `blocked` with
   `baseline_unknowable` and a precise gap ("no `project.test_system`
   detected; cannot capture baseline without one"). Do NOT attempt
   to refactor without a baseline — a refactor with no behavioral
   baseline is not a refactor, it is a guess.

### 2. Design refactor (state: `design-refactor`)

Author the refactor design as a `decision`
(`evidence/schema/decision.schema.json`) with `validated: false`
(it is a proposal until `verify-equivalence` proves equivalence).

1. Pick the refactoring approach (extract-method, extract-module,
   rename, simplify-control-flow, restructure-data). The choice
   should follow from the goal captured in `classify`
   (readability → extract-method; maintainability → extract-module;
   performance → restructure-data, often).
2. Record at least two alternatives in `decision.alternatives[]`
   with concrete rejection reasons. Per
   `constitution/engineering-principles.md` "Report the decision
   trace, not just the outcome" — the rejected alternatives are
   part of the artifact, not a courtesy.
3. Author an `expected` for the new internal structure's properties
   (e.g., "the new `src/membership/parsing.ts` module exports
   `parseExpiryDate(s: string): Date | null`, a pure function with
   no side effects and no module-level mutable state"). This is a
   structural `Expected`, distinct from the baseline behavioral
   `Expected` from step 1 — both exist simultaneously, and
   `verify-equivalence` checks the *behavioral* one.
4. If the design would touch a code path the baseline didn't cover
   (test gap), transition back to `capture-baseline` with
   `design_needs_more_baseline` to widen the baseline first —
   designing against a gap is designing blind.

### 3. Implement (state: `implement`)

Apply the approved refactor. The `broad-refactor` safety gate fires
here — a refactor that exceeds `broad_refactor_threshold` (per
`constitution/autonomy-policy.schema.json`) is no longer a refactor,
it is a rewrite. When the gate trips:

- If the refactor grew because the design was incomplete → transition
  back to `design-refactor` with `implementation_blocked_by_design`.
- If the refactor grew because the codebase is more entangled than
  the design assumed → still `implementation_blocked_by_design`,
  with a precise note about the entanglement.
- If the refactor is *genuinely* broad (a large restructure that's
  legitimately a rewrite) → do NOT press through with
  `advanceWithConfirmation`. Stop. The right move is to reclassify
  as `feature-request` or `change-request`, not to call a refactor a
  refactor while doing a rewrite's worth of work. A human confirming
  the gate is not a license to bypass the classification.

The implementation `Decision` is emitted with `validated: false`,
`result: "pending"` per the AI-output validation pattern
(`docs/evidence-model.md`) — implementation is a candidate for
success, not success itself. The `event` emitted here has `kind:
"file_change"` with a `payload.diff_summary` describing what changed
structurally (files added/removed/renamed, function signatures
changed, exports added/removed). Do NOT claim behavior preservation
in this `event` — that is what `verify-equivalence` is for.

### 4. Verify equivalence (state: `verify-equivalence`)

This is the state that distinguishes refactor from every other
workflow. Per ADR-0010 and `constitution/constitution.md` §2
("no exception ≠ success"): a passing test suite alone is *not*
verification of equivalence. The test suite still passing proves
only that the tests still pass; it does not prove that behavior is
unchanged for inputs the tests don't cover.

1. Re-run the captured baseline test suite (the same `test_runner`
   invocation from `capture-baseline`, against the now-refactored
   code). Capture each test result as a new `event` under a new
   `trace`.
2. Emit an `actual` (`evidence/schema/actual.schema.json`) recording
   the observed post-refactor behavior, with `observation_ref`
   pointing at the post-refactor test-run `event`.
3. Emit a `validation` (`evidence/schema/validation.schema.json`)
   with `method: "replay_comparison"` and `result: "match"` (or
   `"mismatch"`) — this is the canonical validation method for
   refactor. `method: "unit_test"` alone is INSUFFICIENT for refactor
   (per ADR-0010), because:
   - The test suite passing only proves the suite passes; it does
     not prove behavior is unchanged for un-tested inputs.
   - A refactor can tighten an input validation in a way the
     existing tests don't notice (e.g., reject an input the old code
     silently accepted), "pass" the suite, and silently break a
     caller the tests don't cover. `unit_test` cannot catch this.
   - `replay_comparison` *can*: replay the captured baseline inputs
     against the new code, observe identical outputs, and only then
     claim equivalence.
4. The `validation.evidence_refs[]` array should reference BOTH the
   baseline test-run `event`(s) from `capture-baseline` AND the
   post-refactor test-run `event`(s) — the comparison is between
   these two, and the `Validation` exists to make that comparison
   citable.
5. If `result: "mismatch"` — transition back to `implement` with
   `equivalence_violated`. This is the workflow correctly catching
   a behavior change; do not paper over it. The `mismatch` is the
   single most important output of this state: it is the signal
   that what was called a refactor was actually a behavior change,
   and the design needs to be re-checked (or the request re-routed
   to `feature-request`).
6. If equivalence cannot be verified at all (no baseline to replay
   against, test environment drifted) — transition to `blocked`
   with `equivalence_unverifiable`. An unprovable refactor is, by
   ADR-0010, not verified — even if the suite happens to be green.

**Why `replay_comparison` specifically (not `contract_validation`).**
Both are valid per `evidence/schema/validation.schema.json`'s enum
(`app_validation`, `contract_validation`, `unit_test`,
`manual_review`, `replay_comparison`). For refactor,
`replay_comparison` is the canonical choice because:
- It directly answers the refactor's defining question ("did the
  behavior change?") by replaying the captured baseline against the
  new code and observing identical outputs.
- `contract_validation` (proving the public API surface is
  unchanged) is *also* acceptable, but is a weaker check — a
  refactor can preserve the API surface while changing the
  observable behavior of an existing input (e.g., by tightening
  input validation, changing error messages, reordering side
  effects). `replay_comparison` catches these; `contract_validation`
  alone does not.
- `app_validation` (an application-level check) is appropriate for
  `feature-request` and `bug-report`, where the question is "does
  the new behavior match the spec?" For refactor, there is no new
  spec — the question is "does the new behavior match the OLD
  behavior?" — and `replay_comparison` is the method named for
  exactly that question.

### 5. Document (state: `document`)

Update internal-architecture docs. For refactor, this is usually
more important than user-facing docs (which describe behavior, and
behavior didn't change). Emit an `event` with `kind: "file_change"`
recording what internal docs changed (module map, ADR updates,
dependency graph). The consumers of refactor docs are future
maintainers reading the architecture map, not users reading an API
reference — a refactor that restructures the code but leaves the
architecture map stale has done half the work.

## Tool integration

- `filesystem_read`: read the code being refactored (to design the
  refactor against the actual structure, not a guessed one); read
  prior `Trace`/`Event`/`Decision`/`Expected` artifacts when
  building the reference chain in `verify-equivalence`.
- `filesystem_write`: write the refactored code; update internal-
  architecture docs in `document`.
- `shell_exec`: run the project's test runner (preferred path is
  `test_runner` when available, but `shell_exec` is the fallback
  for bisecting test pollution or running non-test-runner commands
  like `git diff` to capture structural-change evidence).
- `test_runner`: structured access to test results for the baseline
  capture AND the post-refactor equivalence check. This is the
  tool that produces the `event`s with `kind: "test_result"` that
  both `capture-baseline` and `verify-equivalence` consume.

## Validation (of this skill itself)

A refactor run using this skill is done correctly only if:

1. A `Trace` of `test_result` `Event`s was captured in
   `capture-baseline` BEFORE any code was modified — evidence-
   before-explanation, enforced structurally.
2. The `design-refactor` `Decision` has `alternatives[]` with at
   least two rejected alternatives, each with a concrete
   `rejected_because` reason — not a placeholder.
3. The `implement` `Decision` has `validated: false` and `result:
   "pending"` (AI proposal, awaiting `verify-equivalence`).
4. The `verify-equivalence` `Validation` has `method:
   "replay_comparison"` — NOT `"unit_test"` alone. A refactor run
   that closes with `method: "unit_test"` and `result: "match"` is a
   process violation of this skill, even if the JSON Schema itself
   doesn't forbid it (the schema can't express "was the comparison
   actually meaningful," only this skill's procedure can).
5. The `validation.evidence_refs[]` array references events from
   BOTH the baseline run and the post-refactor run — a `Validation`
   with only post-refactor evidence is unverifiable, because it has
   nothing to compare against.
6. No question was asked outside `classify` (per the workflow's
   `question_economy.allowed_states: [classify]`) and at most one
   question total was asked across the whole run.

**The non-negotiable check:** if any of (1)–(6) is missing, the
refactor is not done — it is incomplete, regardless of how green the
test suite is. A green suite with no baseline replay is, for
refactor, the same hazard ADR-0010 names for `bug-report`: technical
success masking unverifiable correctness.

## Examples

**Happy path:** User says "extract `parseExpiryDate` from
`validateMembership` into its own helper" → `classify` asks one
question ("is the goal readability or maintainability?"), user says
"maintainability" → `capture-baseline` runs the existing 8 tests,
all green, captured as a `Trace` of 8 `test_result` `Event`s, plus
an `Expected` describing the baseline behavior contract →
`design-refactor` emits a `Decision` choosing extract-to-module
(`src/membership/parsing.ts`) with alternatives (extract-method
into the same file rejected because the file is already 600 lines;
extract-to-class rejected because there's no shared state to
justify a class) and an `Expected` for the new structure (pure
function, no side effects, ≤ 20 lines) → `implement` gate trips
(`broad-refactor`, confirmation granted), applies the refactor,
emits a `Decision` (validated=false) + `file_change` `Event` →
`verify-equivalence` re-runs the 8 tests, observes identical
results, emits `Actual` + `Validation` with `method:
"replay_comparison"`, `result: "match"`, `evidence_refs` pointing
at both baseline and post-refactor test-run events → `document`
updates `docs/architecture.md` module map → `report` writes a
`project` memory entry recording the new structural fact.

**Failure mode handled correctly:** Same scenario, but the refactor
accidentally tightens `parseExpiryDate` to reject the previously-
accepted ISO format `"2026-06-01T00:00:00Z"` (the original
implementation accepted both ISO and RFC2822; the refactor only
handles ISO via `Date.parse`, which rejects RFC2822). The 8
existing tests pass (none cover RFC2822 input). The
`verify-equivalence` step's `replay_comparison` includes a captured
RFC2822 input from production logs (captured during
`capture-baseline` as an additional `event`), and the post-refactor
run produces `Invalid Date` where the baseline produced a valid
`Date` → `result: "mismatch"` → transition back to `implement` with
`equivalence_violated`. The refactor is fixed to handle both
formats, and the second `verify-equivalence` pass produces `result:
"match"`. Without `replay_comparison`, this drift would have
shipped: the suite was green, the contract was violated, and only
replay against the captured baseline caught it. This is exactly the
ADR-0010 hazard ("no exception ≠ success"), specialized to
refactor's defining question.
