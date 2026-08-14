# End-to-end run: refactor workflow (extract `parseExpiryDate` helper)

**This is the third e2e proof point** in the repo, alongside
`executor/examples/e2e-membership-bug/` and
`executor/examples/e2e-feature-request/`. The first proved
`bug-report.sm.yaml` works end-to-end against a real (non-scripted)
bug. The second proved the executor is workflow-agnostic by running
`feature-request.sm.yaml` through it with zero code changes. This
one proves the same workflow-agnosticism for a structurally
different shape: `refactor.sm.yaml`, which is *behavior-preserving*
— its defining contract is the negative one ("do NOT change
behavior"), where `bug-report` and `feature-request` both have
positive contracts ("fix this" / "add that").

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state of
`refactor.sm.yaml`. Every `emitEvidence` call writes a JSON file to
disk that the executor's `EvidenceStore` validates against the
actual `evidence/schema/*.schema.json` files — a schema violation
would throw before the file is written. Every transition goes
through the real `StateMachine.advance` and `WorkflowRun.advance`
(with safety gate enforcement).

**Isn't:** a recording of a live multi-turn agent session issuing
one tool call at a time through an actual agent adapter. The
scenario data (the test names, the diff summary, the equivalence
observation) is realistic but scripted. The same honest scope note
as `executor/examples/e2e-feature-request/README.md` applies: a
driver script assembling realistic data is not yet a live agent
session.

## What the run proves

Run `node executor/examples/e2e-refactor/drive-run.mjs` and observe
28+ assertions passing. The interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every
   transition's `from`/`to` is in `states[]`, no non-terminal state
   is a dead end, all states reachable from `intake`.
2. **End-to-end walk.** A single `WorkflowRun` walks `intake →
   classify → capture-baseline → design-refactor → implement →
   verify-equivalence → document → report`, emitting schema-valid
   evidence at every emitting state.
3. **Safety gate is workflow-agnostic — and matters most for
   refactor.** The `broad-refactor` gate at the `implement` state
   blocks an un-confirmed advance out of `implement` (the executor
   throws `safety-gate-needs-confirmation`), then allows the same
   advance once `advanceWithConfirmation` is called. This is the same
   gate code `bug-report` exercises at `propose-fix`/`apply-fix` and
   `feature-request` exercises at `implement` — proving the gate
   logic is keyed off the workflow's `safety_gates` declaration, not
   hardcoded. **But the gate matters more for refactor than for the
   other two workflows:** a "refactor" that exceeds
   `broad_refactor_threshold` (per `constitution/autonomy-policy.
   schema.json`) is no longer a refactor — it is a rewrite, and
   should be reclassified as `feature-request` or `change-request`
   rather than pressed through. The skill (`skills/refactor/SKILL.md`)
   makes this explicit: a human confirming the gate is not a license
   to bypass the classification.
4. **Question economy with 1 allowed state.** The budget is
   `max_questions: 1, allowed_states: [classify]`. The driver asks
   one decision-changing question in `classify` ("is this refactor
   for readability, performance, or maintainability?") — accepted. A
   second question, attempted in `verify-equivalence` (not in
   `allowed_states`), is rejected with
   `question-economy-wrong-state`. A second question in `classify`
   itself (in a fresh run, the budget already at 1) is rejected
   with `question-economy-exceeded`. This is a stricter budget than
   `feature-request`'s 2 questions across 2 states — refactor
   should be based on the code itself, not on questions to the
   user; the one allowed question is reserved for the refactor's
   *goal*, which the code cannot always answer.
5. **AI-output validation pattern holds.** The implementation
   `Decision` is emitted with `validated: false, result: "pending"`
   — an AI proposal, not a self-confirmed claim. It only becomes
   trustworthy after `verify-equivalence` emits a `Validation`.
6. **Decision trace preserved.** The design `Decision` records
   alternatives (extract-method, extract-to-class) with rejection
   reasons — the eventual `report` state can cite these for the
   decision trace `constitution/engineering-principles.md` requires.
7. **Two distinct `Expected` entities coexist.** Unlike
   `feature-request` (which authors one new-behavior `Expected` in
   `design`), refactor has *two* `Expected` entities in flight: the
   baseline behavioral contract (authored in `capture-baseline`,
   `predicate_kind: "behavioral"`) and the new internal structure's
   properties (authored in `design-refactor`, `predicate_kind:
   "state_property"`). The driver spot-checks both persisted files
   to confirm they round-tripped with the distinct predicate kinds.
8. **`replay_comparison` is the canonical validation method for
   refactor.** The `verify-equivalence` state emits a `Validation`
   with `method: "replay_comparison"` and `result: "match"`. This
   is the only workflow in the catalog that uses
   `replay_comparison` as its validation method — `bug-report`
   uses `app_validation`, `feature-request` uses `app_validation`,
   and `unit_test` alone is explicitly insufficient for refactor
   (per ADR-0010). The driver spot-checks the persisted Validation
   to confirm `method: "replay_comparison"` round-tripped.
9. **The `Validation.evidence_refs[]` references both baseline AND
   post-refactor events.** Per `skills/refactor/SKILL.md`, a
   `Validation` with only post-refactor evidence has nothing to
   compare against and is unverifiable. The driver spot-checks that
   the persisted `evidence_refs[]` array includes both
   `event-baseline-test-*` and `event-post-refactor-test-*` entries
   — the comparison the `Validation` exists to make is actually
   citable.
10. **Memory update at terminal.** The `report` state writes a real
    `project` memory entry recording the new structural fact
    ("parseExpiryDate is now a pure helper in
    `src/membership/parsing.ts`"), so a future workflow run doesn't
    re-derive or re-propose the same extraction.
11. **Disk persistence.** Evidence files actually land on disk under
    `evidence/<kind>/*.json` and `memory/<kind>/*.json` — the driver
    spot-checks several (the AI-proposal `Decision`, the
    `replay_comparison` `Validation`, both `Expected` entities) to
    confirm the persisted JSON matches what was emitted.

## The scenario

A realistic refactor request: *"clean up `validateMembership` — the
date parsing should be its own helper."* The driver models:

- **classify:** asks one decision-changing question ("readability,
  performance, or maintainability?") — exactly the kind of
  question that cannot be answered by repo inspection, because
  different goals produce different refactors from the same starting
  code.
- **capture-baseline:** runs the existing 8-test suite, captures each
  test result as its own `event` (not a single "8 passed" event —
  per-test names matter for equivalence detection), authors the
  baseline behavioral `Expected`.
- **design-refactor:** emits a design `Decision` (extract to module
  `src/membership/parsing.ts`) with two rejected alternatives
  (extract-method in-place; extract-to-class), plus a structural
  `Expected` describing the new module's properties (pure function,
  no side effects, ≤ 20 lines, re-exported from
  `src/membership.ts` to preserve the public API).
- **implement:** blocked by safety gate until confirmed; emits the
  AI-proposal `Decision` (`validated: false`) and a `file_change`
  `Event` recording the structural diff and noting the public API
  surface is unchanged.
- **verify-equivalence:** re-runs the 8 baseline tests against the
  refactored code, observes identical results, emits `Actual` +
  `Validation` with `method: "replay_comparison"`,
  `result: "match"`, `evidence_refs[]` pointing at both baseline and
  post-refactor test-run events.
- **document:** records the internal-architecture doc update
  (module map).
- **report:** writes the project memory entry, terminal.

## What makes refactor different (the architectural point)

Before this run, the repo's two e2e proofs were both
*positive-contract* workflows:

- `bug-report` proves a fix resolved an incident (positive:
  behavior was wrong, now it's right).
- `feature-request` proves a new capability was added (positive:
  behavior didn't exist, now it does).

`refactor` is the first *negative-contract* workflow: behavior was
correct before, behavior must be correct after, the contract is
"did NOT change." This requires:

1. A baseline-capture state (`capture-baseline`) that runs the
   existing suite BEFORE any code is touched and authors an
   `Expected` describing the baseline behavior. `feature-request`
   has a similar `understand-existing-behavior` state, but there
   the baseline `Expected` describes behavior the new feature must
   not silently regress; in refactor, the baseline `Expected`
   describes the *entire* behavior surface the refactor must
   preserve.
2. A `verify-equivalence` state that uses `replay_comparison` as
   its `Validation.method` — not `unit_test`, not
   `app_validation`. The reason is structural: a passing test suite
   only proves the suite still passes; it does not prove behavior
   is unchanged for inputs the tests don't cover. A refactor can
   tighten an input validation in a way the existing tests don't
   notice, "pass" the suite, and silently break a caller the tests
   don't cover. `replay_comparison` is the only validation method
   that directly answers the refactor's defining question: "did the
   behavior change?"
3. The `broad-refactor` safety gate matters MORE here than in
   `feature-request`. In `feature-request`, a refactor that grows
   beyond `broad_refactor_threshold` is a wider-than-expected
   feature implementation — annoying, but the work is still on-task.
   In `refactor`, a refactor that grows beyond the threshold is no
   longer a refactor at all — it is a rewrite, and rewrites belong
   in `feature-request` or `change-request` (with their own
   positive contracts, not a negative-equivalence one). The gate
   is what catches the drift.

The fact that the same executor runs all three (bug-report,
feature-request, refactor) without code changes is the empirical
proof of the "workflow-agnostic executor" claim — now demonstrated
across three structurally distinct workflow shapes: reactive
diagnostic, constructive feature, and behavior-preserving
restructure. That's the architectural point of this proof.
