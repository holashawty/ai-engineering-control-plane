# End-to-end run: user-complaint workflow (third-party /orders null-shipping-address 500 ticket)

**This is the tenth e2e proof point** in the repo, alongside the
nine existing proofs (`e2e-membership-bug`, `e2e-feature-request`,
`e2e-code-review`, `e2e-refactor`, `e2e-change-request`,
`e2e-chat-adapter`, `e2e-project-onboarding`, `e2e-regression`,
`e2e-performance-problem`). The first proved `bug-report.sm.yaml`
works end-to-end against a real (non-scripted) bug. The second
through ninth proved the executor is **workflow-agnostic** —
structurally different workflows run through the same `WorkflowRun`
engine with zero code changes to the executor. This one proves
the same workflow-agnosticism for the **user-complaint** shape —
the only workflow in the catalog whose triggering condition is
"someone other than the engineer first observed the symptom."

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state of
`user-complaint.sm.yaml`. Every `emitEvidence` call writes a JSON
file to disk that the executor's `EvidenceStore` validates against
the actual `evidence/schema/*.schema.json` files — a schema violation
would throw before the file is written. Every transition goes through
the real `StateMachine.advance` and `WorkflowRun.advance` (with
safety gate enforcement).

**Isn't:** a recording of a live multi-turn agent session issuing one
tool call at a time through an actual agent adapter. The scenario
data (the external ticket text, the curl reproduction, the stack
trace) is realistic but scripted. The same honest scope note as
`executor/examples/e2e-feature-request/README.md` applies: a driver
script assembling realistic data is not yet a live agent session.

## What makes user-complaint structurally different

`user-complaint` is triggered when a third party (a customer, another
team, a QA engineer, a security reviewer) files a bug report against
the engineer's system. This is distinct from:

- `bug-report` — the engineer observed their own system misbehaving.
- `change-request` — the engineer wants new behavior, nothing is
  broken.
- `feature-request` — the engineer wants a new capability added.

The structural distinction that makes `user-complaint` a separate
workflow is **who first observed the symptom**. The third-party
report may be incomplete, may be mis-stated, may apply to a different
version, or may describe expected behavior the reporter simply
didn't expect. The engineer's first job is not to locate a root
cause; it is to *understand what the reporter is claiming*, *triage
whether the claim is well-founded*, and *only then* investigate the
codebase.

Three structural consequences follow from this distinction:

1. **Two `Expected` entities in `understand-complaint`.**
   `user-complaint` emits an `Expected` for the *reporter-stated*
   expectation (drawn from their own words, with `source_ref`
   explicitly labeled `"reporter-stated-expectation:..."`) AND an
   `Expected` for the *documented-contract* expectation (drawn from
   the repo's own specs/docs). This paired-Expected shape is unique
   to `user-complaint` and is the workflow's structural signature:
   the disagreement between the reporter's mental model and the
   system's actual contract becomes a first-class artifact, not a
   hidden assumption. (`change-request` also emits two Expecteds —
   OLD and NEW replacement — but both describe the system's own
   contract evolving. `user-complaint`'s two Expecteds describe a
   reporter's belief vs. the system's contract, which may or may not
   agree.)
2. **The `investigate` state has THREE valid outcomes, not two.**
   Like `bug-report`'s `locate-evidence`, it can transition forward
   on `evidence_located` or to `blocked` on `no_evidence_found`. But
   it adds a third outcome unique to user-complaint:
   `complaint_invalid_per_contract` — when the engineer reproduces
   the reported scenario and the system behaves per its documented
   contract, the complaint is invalid (not necessarily wrong about
   the symptom, but wrong about the contract). Transitioning to
   `blocked` here saves the engineer from fixing a non-defect, and
   the blocked state's report is structured so the engineer can
   paste it back into the original ticket as the reply.
3. **The `report` state's deliverable includes a draft reply to the
   original reporter.** In `bug-report`, the report is for the
   engineer. In `user-complaint`, the report is for the engineer
   AND a third party who filed the ticket — the deliverable is the
   fix AND a response the engineer can send back. The reply cites
   the validation evidence (`Validation.result: "match"` with
   `method: "app_validation"`), not just "we fixed it."

## What the run proves

Run `node executor/examples/e2e-user-complaint/drive-run.mjs` and
observe the assertions passing. The interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every
   transition's `from`/`to` is in `states[]`, no non-terminal state
   is a dead end, all states are reachable from `intake`.
2. **End-to-end walk.** A single `WorkflowRun` walks `intake →
   classify → understand-complaint → investigate → diagnose →
   propose-fix → apply-fix → verify → regression-protect → report`,
   emitting schema-valid evidence at every emitting state (7
   evidence kinds including `Incident`).
3. **Safety gate is workflow-agnostic.** The `broad-refactor` gate
   at the `apply-fix` state blocks an un-confirmed advance out of
   `apply-fix` (the executor throws `safety-gate-needs-
   confirmation`), then allows the same advance once
   `advanceWithConfirmation` is called. This is the same gate code
   `bug-report` exercises at `propose-fix`/`apply-fix`,
   `feature-request` exercises at `implement`, `refactor` exercises
   at `implement`, `change-request` exercises at `migrate`, and
   `regression` exercises at `re-fix` — proving the gate logic is
   keyed off the workflow's `safety_gates` declaration, not
   hardcoded to any one workflow's specific states.
4. **Question economy with 1 allowed state.** The budget is
   `max_questions: 1, allowed_states: [classify]`. The driver asks
   one question in `classify` — accepted. A second question
   attempted in `verify` (not in `allowed_states`) is rejected with
   `question-economy-wrong-state`. This is the same budget shape as
   `bug-report` and `regression`, but for a different structural
   reason: user-complaint is externally triaged, so further
   clarifying questions should be routed back through the original
   ticket channel rather than consumed from this workflow's budget.
5. **AI-output validation pattern holds.** The implementation
   `Decision` is emitted with `validated: false, result: "pending"`
   — an AI proposal, not a self-confirmed claim. It only becomes
   trustworthy after `verify` emits a `Validation` with
   `method: "app_validation"` (per ADR-0010, `unit_test` alone
   would be insufficient — the direct behavioral check via curl
   against the running service is what makes the validation
   meaningful).
6. **Decision trace preserved.** The `propose-fix` `Decision`
   records two alternatives (throw 400 on null, refactor
   `computeShippingCost` into a separate module) with rejection
   reasons — the eventual `report` state can cite these for the
   decision trace `constitution/engineering-principles.md` requires.
7. **TWO Expected entities — user-complaint's unique structural
   feature.** Both the reporter-stated `Expected` (predicate drawn
   from the reporter's words, `source_ref` explicitly labeled
   `"reporter-stated-expectation:external-ticket:#4827"`) and the
   documented-contract `Expected` (predicate drawn from the spec,
   `source_ref` pointing at `specs/spec.md#orders-create`) persist
   to disk with their `source_ref`s intact. They have DIFFERENT
   `source_ref`s — confirming the workflow captured both the
   reporter's belief and the system's actual contract as first-class
   artifacts. In this happy-path scenario the two `Expected`s agree
   (the reporter was correct about the contract), so the
   `diagnose` `Validation` references the documented-contract
   `Expected` directly.
8. **`investigate`'s third outcome (`complaint_invalid_per_contract`)
   is declared but not exercised in this run.** The happy path
   corroborates the complaint. A failure-path scenario (where the
   reporter's stated expectation disagrees with the documented
   contract) would transition to `blocked` on this event; for
   narrative simplicity this driver runs only the happy path, but
   the workflow's transition table includes the third outcome and
   the skill documents the procedure for it.
9. **Memory updates at terminal and pre-terminal.** The
   `regression-protect` state writes a `known-failure` memory entry
   referencing the `Incident` emitted at `classify` (per
   `memory/schemas/known-failure.schema.json`'s `incident_ref`
   requirement). The `report` state writes a `project` memory
   entry recording the resolution AND containing the draft reply
   to the original reporter in its `domain` field.
10. **Disk persistence.** Evidence files actually land on disk
    under `evidence/<kind>/*.json` and `memory/<kind>/*.json` —
    the driver spot-checks several (the two `Expected`s, the
    AI-proposal `Decision`, the `known-failure` memory entry) to
    confirm they round-tripped through `JSON.stringify` without
    mutation.

## The scenario

A realistic user-complaint: *"an external customer (acme-corp) filed
ticket #4827 saying POST /orders with shipping_address=null returns
500 instead of the documented 201."* The driver models:

- **classify:** asks one decision-changing question ("is null
  shipping_address documented as allowed, or invalid?") — the
  answer determines whether `investigate` looks for a defect or
  for a contract-clarification. Emit the `Incident` + acceptance
  `Decision`.
- **understand-complaint:** emits the verbatim complaint `Event`
  (with `ts` = the filing time, NOT the engineer's read time),
  a reporter-stated `Expected`, and a documented-contract
  `Expected` pointing at `specs/spec.md#orders-create`. The two
  `Expected`s agree (the reporter was correct about the contract).
- **investigate:** runs the reporter's reproduction via curl,
  captures the 500 response with a stack trace, and reads the
  offending line in `src/orders/handler.ts:42`. The complaint is
  corroborated.
- **diagnose:** walks the debugging chain — root-cause candidate
  is "handler dereferences nullable field without null check";
  `validated: false` until verify. `Validation` references the
  documented-contract `Expected` with `method: "app_validation"`,
  `result: "mismatch"`.
- **propose-fix:** emits the AI-proposal `Decision` (`validated:
  false`) with two rejected alternatives (throw 400, refactor into
  separate module).
- **apply-fix:** blocked by safety gate until confirmed; emits
  the implementation `Decision` and a `file_change` `Event` after
  the confirmed advance.
- **verify:** re-runs the curl reproduction (now returns 201 with
  the digital-fulfillment order per spec) and the test suite (23
  passed, +1 new regression test). `Validation` with
  `method: "app_validation"`, `result: "match"`.
- **regression-protect:** writes the `known-failure` memory entry
  whose `symptom` is the *corroborated* symptom (the curl-repro'd
  500 + stack trace), NOT the original complaint text — so a
  future regression match isn't missed because a future reporter
  words it differently.
- **report:** writes the `project` memory entry containing the
  draft reply to the original reporter. Terminal.

## Why this matters (beyond "another test passes")

Before this run, the repo's nine e2e proofs covered workflows
triggered by the engineer's own observations (`bug-report`,
`regression`, `performance-problem`), the engineer's own
intentions (`feature-request`, `change-request`, `refactor`,
`code-review`, `project-onboarding`), and the chat adapter's
text-in/text-out path (`chat-adapter`). None of them exercised
the case where the triggering condition is *an external third
party's report* — which is one of the most common shapes of real
engineering work (every customer-filed ticket, every QA-filed
regression, every cross-team bug report).

`user-complaint` covers this shape and exercises a structural
feature the first nine did not: emitting two `Expected` entities
in one state where one is the reporter's belief and the other is
the documented contract, where the disagreement between them is
itself a first-class finding. The fact that the same executor
runs all ten workflows without code changes is the empirical
proof that the Evidence Model's `Expected` entity is flexible
enough to represent (a) a constraint-to-preserve
(`feature-request`), (b) a baseline-being-replaced
(`change-request`), and (c) a reporter's-belief-vs-document's-
contract pair (`user-complaint`) — three semantically distinct
uses of the same schema, across three structurally distinct
workflows.
