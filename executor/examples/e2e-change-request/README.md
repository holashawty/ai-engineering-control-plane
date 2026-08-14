# End-to-end run: change-request workflow (password reset email from-address change)

**This is the third e2e proof point** in the repo, alongside
`executor/examples/e2e-membership-bug/` (bug-report) and
`executor/examples/e2e-feature-request/` (feature-request). The first
proved `bug-report.sm.yaml` works end-to-end against a real (non-
scripted) bug. The second proved the executor is **workflow-agnostic**
— `feature-request.sm.yaml` is a structurally different workflow (no
Incident entity, two question states, a `design` state that authors a
new `Expected`) and it runs through the same `WorkflowRun` engine with
zero code changes to the executor. This one proves the same engine
handles a third, *structurally distinct* workflow — `change-request` —
whose distinguishing feature is that it emits **two** `Expected`
entities in a single run (OLD behavior + NEW behavior), where
`feature-request` emits only one (a baseline the new feature must not
break) and `bug-report` emits only one (the pre-existing contract that
was violated).

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state of
`change-request.sm.yaml`. Every `emitEvidence` call writes a JSON
file to disk that the executor's `EvidenceStore` validates against
the actual `evidence/schema/*.schema.json` files — a schema violation
would throw before the file is written. Every transition goes through
the real `StateMachine.advance` and `WorkflowRun.advance` (with
safety gate enforcement).

**Isn't:** a recording of a live multi-turn agent session issuing one
tool call at a time through an actual agent adapter. The scenario data
(the grep output, the test counts, the email-header observation) is
realistic but scripted. The same honest scope note as
`executor/examples/e2e-feature-request/README.md` applies: a driver
script assembling realistic data is not yet a live agent session.

## What makes change-request structurally different

`change-request` modifies existing behavior that was *by design* (not
broken). This is distinct from:

- `feature-request` — ADDS a new capability that did not exist.
- `bug-report` — FIXES behavior that diverged from its spec/contract.

The acid test: would the current behavior, left as-is, be considered a
defect by the spec/contract that governed it when it was written? If
yes, this is a `bug-report` (the spec was violated) or a
`feature-request` (the spec is being extended). If no — the spec was
honored, and is now being changed — this is a `change-request`.

Three structural consequences follow from this distinction:

1. **Two `Expected` entities in one run.** `change-request` emits an
   `Expected` for the OLD behavior (in `understand-current-behavior`,
   the baseline being superseded) AND an `Expected` for the NEW
   behavior (in `design-change`, the replacement contract).
   `feature-request`'s `understand-existing-behavior` state also
   emits an `Expected`, but it describes a baseline the new feature
   must NOT silently break (a constraint to preserve); the `Expected`
   emitted here describes a baseline that IS being replaced. That
   semantic difference is why the state is named differently
   (`understand-current-behavior` vs `understand-existing-behavior`)
   and why the transition out is `current_behavior_mapped` rather
   than `existing_behavior_mapped`.
2. **The `migrate` state (not `implement`).** The existing behavior is
   being migrated to new behavior; the semantic weight is on the
   *transition* between two valid states, not the *creation* of
   something new (which is `feature-request`'s `implement`). The
   same `broad-refactor` safety gate fires (the migration surface
   may require a DB migration, config flip, or multi-call-site
   refactor), and the same AI-output validation pattern applies
   (migration is a candidate for success, not success itself).
3. **A `known-failure` memory entry at `report`** (not a `project`
   entry, as in `feature-request`). `change-request` is the workflow
   MOST likely to introduce regressions in *existing* users — the old
   behavior was, by definition, the designed and shipped behavior, and
   any caller may have built on it. The `known-failure` entry's
   `symptom` documents the failure mode a downstream user might
   encounter (their code or workflow assuming the OLD behavior); the
   `fix` documents how to migrate to the new behavior. This practice
   is most important for `change-request` specifically and is not
   mirrored in `feature-request` (a new capability has no users to
   regress) or `bug-report` (the bug, not the change, is the known
   failure — and `bug-report` writes its `known-failure` entry in
   `regression-protect`, not `report`).

## What the run proves

Run `node executor/examples/e2e-change-request/drive-run.mjs` and
observe the assertions passing. The interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every
   transition's `from`/`to` is in `states[]`, no non-terminal state
   is a dead end, all states are reachable from `intake`.
2. **End-to-end walk.** A single `WorkflowRun` walks
   `intake → classify → understand-current-behavior → design-change →
   migrate → verify → document → report`, emitting schema-valid
   evidence at every emitting state.
3. **Safety gate is workflow-agnostic.** The `broad-refactor` gate at
   the `migrate` state blocks an un-confirmed advance out of `migrate`
   (the executor throws `safety-gate-needs-confirmation`), then
   allows the same advance once `advanceWithConfirmation` is called.
   This is the same gate code `bug-report` exercises at `propose-fix`
   /`apply-fix` and `feature-request` exercises at `implement` —
   proving the gate logic is keyed off the workflow's `safety_gates`
   declaration, not hardcoded to any one workflow's specific states.
4. **Question economy with 2 allowed states.** The budget is
   `max_questions: 2, allowed_states: [classify, design-change]`. The
   driver asks one question in `classify` and one in `design-change` —
   both accepted. A third question, attempted in `verify` (not in
   `allowed_states`), is rejected with `question-economy-wrong-state`.
5. **AI-output validation pattern holds.** The migration `Decision`
   is emitted with `validated: false, result: "pending"` — an AI
   proposal, not a self-confirmed claim. It only becomes trustworthy
   after `verify` emits a `Validation` with `method: "app_validation"`
   (per ADR-0010, `unit_test` alone would be insufficient — the
   direct behavioral check on the actually-emitted email's `From:`
   header is what makes the validation meaningful).
6. **Decision trace preserved.** The design-change `Decision` records
   three alternatives (keep `support@` as alias, feature-flag
   rollout, deprecate rather than replace) with rejection reasons —
   the eventual `report` state can cite these for the decision trace
   `constitution/engineering-principles.md` requires.
7. **TWO Expected entities — change-request's unique structural
   feature.** Both the OLD Expected (predicate mentions `support@`,
   baseline being superseded) and the NEW Expected (predicate
   mentions `noreply@`, replacement contract) persist to disk with
   their predicates intact. They share the same `source_ref` (the
   spec section evolved in place, rather than spawning a new section)
   but have different `predicate`s — confirming the workflow
   captured both the baseline and the replacement as first-class
   artifacts. `verify` later compares the post-migration `Actual`
   against the NEW `Expected` (the OLD `Expected` is the historical
   record, not the validation target).
8. **Memory update at terminal.** The `report` state writes a real
   `known-failure` memory entry documenting the regression risk to
   users who relied on the OLD behavior. This is the practice most
   specific to `change-request` — see "What makes change-request
   structurally different" above.
9. **Disk persistence.** Evidence files actually land on disk under
   `evidence/<kind>/*.json` and `memory/<kind>/*.json` — the driver
   spot-checks several (the OLD and NEW `Expected`s, the AI-proposal
   `Decision`, the design-change `Decision` with its alternatives,
   the `known-failure` memory entry) to confirm they round-tripped
   through `JSON.stringify` without mutation.

## The scenario

A realistic change-request: *"change the password reset email to come
from `noreply@` instead of `support@`."* Nothing is broken — the
current behavior was by design — the user just wants different
behavior going forward. The driver models:

- **classify:** asks one decision-changing question ("immediate
  cutover or feature-flag rollout?") — exactly the kind of question
  that can't be answered by repo inspection, because it depends on
  the user's rollout policy, not on the code. Emit the acceptance
  `Decision` (`proceed`).
- **understand-current-behavior:** greps the from-address constant,
  runs the existing test suite (which encodes the OLD behavior as
  the contract — one test asserts `From: support@example.com`), and
  emits the OLD `Expected` (predicate mentions `support@`, the
  baseline being superseded).
- **design-change:** asks one more question ("keep `support@` as an
  alias, or hard cutover?"), emits a design `Decision` with three
  rejected alternatives and the NEW `Expected` (predicate mentions
  `noreply@`, the replacement contract). Both `Expected`s share the
  same `source_ref` (the spec section evolved in place).
- **migrate:** blocked by safety gate until confirmed; emits the
  AI-proposal `Decision` (`validated: false`) and two `file_change`
  `Event`s (one for the constant change, one for the test assertion
  flip — the test encoded the OLD behavior as the contract, so it
  must be updated to encode the NEW behavior).
- **verify:** directly invokes the send path with a stubbed transport
  and reads the resulting MIME message's `From:` header — this is
  `method: "app_validation"` per `behavioral-verification`, NOT just
  "the test suite passed." Emits `Actual` + `Validation`
  (`result: "match"`).
- **document:** records the API doc update (`docs/api/email.md`) and
  the spec update (`specs/spec.md` — the spec section that
  documented `support@` now documents `noreply@`).
- **report:** writes the `known-failure` memory entry documenting
  the regression risk to downstream users who relied on
  `support@example.com`. Terminal.

## Schema note: `known-failure.incident_ref` in a non-bug-report workflow

The `known-failure` memory schema
(`memory/schemas/known-failure.schema.json`) requires `incident_ref` —
"References the evidence/Incident this entry was learned from — no
known-failure entry without a backing incident." This schema was
authored with `bug-report` in mind, where every `known-failure` is
backed by an `Incident`. `change-request` has no `Incident` entity
(only `bug-report` emits one — `Incident` is the "something diverged
from expected" entity, and in a change-request nothing diverged; the
behavior was by design).

The driver references the `design-change` `Decision`'s id as the
`incident_ref` — semantically, "the change described in this Decision
is what makes the OLD behavior unavailable to downstream users." This
is a known semantic stretch: the schema field's name suggests it must
be an `Incident`, but for `change-request` the closest meaningful
reference is the `Decision` that records what was changed and why. A
future schema revision should generalize `incident_ref` to
`source-of-failure-knowledge_ref` or similar, so it can reference a
`Decision` (not just an `Incident`) for non-`bug-report` workflows.
For now, the reference is to a real Evidence entity that captures the
root cause of the *user-facing* failure mode this entry documents.

## Why this matters (beyond "another test passes")

Before this run, the repo's two e2e proofs covered the *reactive* half
of agent work (`bug-report`: diagnose → fix → verify) and the
*constructive* half (`feature-request`: design → implement → verify).
Together they proved the executor handles two structurally different
workflows without code changes. `change-request` adds the
*transitional* half — modifying existing behavior that was by design —
and exercises a structural feature the first two did not: emitting two
`Expected` entities in one run, where one is the baseline being
superseded and the other is the replacement contract. The fact that
the same executor runs all three without code changes is the empirical
proof that the Evidence Model's `Expected` entity is flexible enough
to represent both a constraint-to-preserve (`feature-request`) and a
baseline-being-replaced (`change-request`) — two semantically distinct
uses of the same schema.
