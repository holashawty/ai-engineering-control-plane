# End-to-end run: feature-request workflow (additive tag filtering)

**This is the second e2e proof point** in the repo, alongside
`executor/examples/e2e-membership-bug/`. The first proved
`bug-report.sm.yaml` works end-to-end against a real (non-scripted)
bug. This one proves the executor is **workflow-agnostic** —
`feature-request.sm.yaml` is a structurally different workflow
(10 states, no Incident entity, two question states, a `design`
state that authors a new `Expected` rather than reading an existing
one), and it runs through the same `WorkflowRun` engine with zero
code changes to the executor.

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state of
`feature-request.sm.yaml`. Every `emitEvidence` call writes a JSON
file to disk that the executor's `EvidenceStore` validates against
the actual `evidence/schema/*.schema.json` files — a schema violation
would throw before the file is written. Every transition goes through
the real `StateMachine.advance` and `WorkflowRun.advance` (with safety
gate enforcement).

**Isn't:** a recording of a live multi-turn agent session issuing one
tool call at a time through an actual agent adapter. The scenario data
(the grep output, the test counts, the request/response descriptions)
is realistic but scripted. The same honest scope note as
`e2e-membership-bug/README.md` applies: a driver script assembling
realistic data is not yet a live agent session.

## What the run proves

Run `node executor/examples/e2e-feature-request/drive-run.mjs` and
observe 23 assertions passing. The interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every transition's
   `from`/`to` is in `states[]`, no non-terminal state is a dead end.
2. **End-to-end walk.** A single `WorkflowRun` walks
   `intake → classify → understand-existing-behavior → design →
   implement → test → verify → document → report`, emitting
   schema-valid evidence at every emitting state.
3. **Safety gate is workflow-agnostic.** The `broad-refactor` gate at
   the `implement` state blocks an un-confirmed advance out of
   `implement` (the executor throws `safety-gate-needs-confirmation`),
   then allows the same advance once `advanceWithConfirmation` is
   called. This is the same gate code `bug-report` exercises at its
   `propose-fix` and `apply-fix` states — proving the gate logic
   is keyed off the workflow's `safety_gates` declaration, not
   hardcoded to bug-report's specific states.
4. **Question economy with 2 allowed states.** The budget is
   `max_questions: 2, allowed_states: [classify, design]`. The driver
   asks one question in `classify` and one in `design` — both accepted.
   A third question, attempted in `test` (not in `allowed_states`), is
   rejected with `question-economy-wrong-state`. This is a stricter
   test than `bug-report`'s single-state budget (1 question, only in
   `classify`).
5. **AI-output validation pattern holds.** The implementation
   `Decision` is emitted with `validated: false, result: "pending"` —
   an AI proposal, not a self-confirmed claim. It only becomes
   trustworthy after `verify` emits a `Validation` with
   `method: "app_validation"` (per ADR-0010, `unit_test` alone would
   be insufficient — the direct behavioral check on the additive AND
   semantics is what makes the validation meaningful).
6. **Decision trace preserved.** The design `Decision` records
   alternatives (any-match OR, separate endpoint) with rejection
   reasons — the eventual `report` state can cite these for the
   decision trace `constitution/engineering-principles.md` requires.
7. **Memory update at terminal.** The `report` state writes a real
   `project` memory entry recording the new capability, so a future
   workflow run doesn't re-derive that the tag-filtering feature
   exists.
8. **Disk persistence.** Evidence files actually land on disk under
   `evidence/<kind>/*.json` and `memory/<kind>/*.json` — the driver
   spot-checks one (the AI-proposal `Decision`) to confirm
   `validated: false` round-tripped through `JSON.stringify` without
   mutation.

## The scenario

A realistic feature request: *"users should be able to filter the
`/items` list by tag."* The driver models:

- **classify:** asks one decision-changing question ("additive OR
  any-match?") — exactly the kind of question that can't be answered
  by repo inspection because the feature doesn't exist yet.
- **understand-existing-behavior:** greps the current `/items` route,
  runs the existing test suite, emits an `Expected` describing the
  baseline contract the new feature must not break.
- **design:** asks one more question ("empty tag= → 400 or no-op?"),
  emits a design `Decision` with two rejected alternatives and an
  `Expected` for the new behavior.
- **implement:** blocked by safety gate until confirmed; emits the
  AI-proposal `Decision` (`validated: false`) and a `file_change`
  `Event`.
- **test:** runs the test suite, observes `15 passed` (12 existing +
  3 new for tag filtering).
- **verify:** directly checks the additive AND semantics against
  `expected-new-tag-filtering`, emits `Actual` + `Validation` with
  `method: "app_validation"`.
- **document:** records the API doc update.
- **report:** writes the project memory entry, terminal.

## Why this matters (beyond "another test passes")

Before this run, the repo's only e2e proof was `bug-report`-shaped:
diagnose → fix → verify. That shape covers the *reactive* half of
agent work. `feature-request` covers the *constructive* half: design
→ implement → verify. The two together exercise meaningfully different
parts of the Evidence Model (no `Incident` here; `Decision` is the
anchor entity, and `Expected` is authored in-workflow rather than
read from a pre-existing spec). The fact that the same executor
runs both without code changes is the empirical proof of the
"workflow-agnostic executor" claim that was, until now, an
architectural assertion in `DECISIONS.md` / `STATUS.md` without a
second concrete demonstration.
