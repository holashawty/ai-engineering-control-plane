# End-to-end run: incident workflow (production /orders 78% error rate, SEV2, rollback mitigation)

**This is the thirteenth e2e proof point** in the repo, alongside
the twelve existing proofs. The first proved `bug-report.sm.yaml`
works end-to-end against a real (non-scripted) bug. The second
through twelfth proved the executor is **workflow-agnostic** —
structurally different workflows run through the same
`WorkflowRun` engine with zero code changes to the executor.
This one proves the same workflow-agnosticism for the
**incident** shape — the only workflow in the catalog whose
triggering condition is "the system is currently failing in
production and the priority is mitigation FIRST, root-cause
SECOND, postmortem THIRD."

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state
of `incident.sm.yaml`. Every `emitEvidence` call writes a JSON
file to disk that the executor's `EvidenceStore` validates
against the actual `evidence/schema/*.schema.json` files. Every
transition goes through the real `StateMachine.advance` and
`WorkflowRun.advance` (with safety gate enforcement).

**Isn't:** a recording of a live multi-turn agent session, AND
isn't an actual `kubectl rollout undo` against a real production
cluster. The PagerDuty alert text, the deploy log, the metrics,
and the rollback output are realistic but scripted. The same
honest scope note as `executor/examples/e2e-feature-request/
README.md` applies: a driver script assembling realistic data is
not yet a live agent session.

## What makes incident structurally different

`incident` is triggered by a production alert, on-call page, or
live-outage report. This is distinct from:

- `bug-report` — a defect that may or may not be in production.
  `bug-report` has time; `incident` doesn't.
- `security-problem` — a vulnerability that may or may not be
  currently exploited. `security-problem` has a disclosure clock;
  `incident` has a user-impact clock.
- `user-complaint` — a third-party report of an externally-
  observed functional bug. `user-complaint` has a reply clock;
  `incident` has a mitigation clock.

The structural distinction that makes `incident` a separate
workflow is **what is at risk**. In the other workflows, the
priority is correctness (find the right answer). In `incident`,
the priority is **mitigation FIRST, root-cause SECOND,
postmortem THIRD** — reordering the usual engineering priority
under time pressure.

Five structural consequences follow from this distinction:

1. **The `assess-impact` state produces a SEV score with five
   fields.** Severity (SEV1/SEV2/SEV3/SEV4), blast radius,
   affected-user estimate, SLO-breach status, customer-facing
   impact — each cited with evidence. The point is not just the
   SEV number; it's the discipline of justifying each field with
   metrics so the postmortem can cite the impact precisely.
2. **The `triage` state identifies the PROXIMATE TRIGGER, not
   the root cause.** The proximate trigger is the most recent
   change that correlates with the incident's start time (a
   deploy, a config flip, a traffic spike). The root cause (the
   underlying defect the trigger exposed) is for the postmortem.
   Conflating the two is a common incident-management mistake —
   rolling back the proximate trigger stops the bleeding, but
   if you don't separate it from the root cause, the postmortem
   misidentifies what to fix.
3. **The `mitigate` state applies a MITIGATION, not a fix.** A
   fix addresses the root cause (which may require a deploy and
   won't help right now); a mitigation stops the bleeding
   (rollback, scale-out, fail-over, block the triggering
   traffic, disable the buggy feature flag). The postmortem
   addresses the root cause; this state addresses the user
   impact. The `Decision` records the chosen mitigation AND
   alternatives (rollback vs. forward-fix vs. scale-out vs.
   fail-over) with tradeoffs — the on-call must weigh these
   under time pressure, and recording the tradeoff in the
   decision trace is what makes the postmortem's "why did we
   roll back instead of forward-fixing?" answerable.
4. **The `verify-mitigation` state uses `method:
   "app_validation"`, NOT `unit_test`.** Tests don't run in
   production. The verification is: did SLOs recover? Did alerts
   clear? Did the user-facing impact end? The validation is the
   production system's own behavior, not a test suite. Per
   ADR-0010, `unit_test` would be wrong here — it would be
   asserting the wrong thing entirely.
5. **The `postmortem` state is BLAMELESS.** The `Decision.why`
   field identifies systemic gaps (missing alerting, insufficient
   rollback automation, a deploy process that bypassed canary),
   not individual mistakes. The driver spot-checks that the
   persisted postmortem mentions "root cause AND contributing
   factors AND action items" and that it does NOT name
   "engineer X" as the cause — only systemic gaps.

## What the run proves

Run `node executor/examples/e2e-incident/drive-run.mjs` and
observe the assertions passing. The interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every
   transition's `from`/`to` is in `states[]`, no non-terminal
   state is a dead end, all states are reachable from `intake`.
2. **End-to-end walk.** A single `WorkflowRun` walks `intake →
   classify → assess-impact → triage → mitigate → verify-
   mitigation → postmortem → report`, emitting schema-valid
   evidence at every emitting state (7 evidence kinds including
   `Incident`).
3. **Safety gate is workflow-agnostic.** The `broad-refactor`
   gate at the `mitigate` state blocks an un-confirmed advance
   out of `mitigate` (the executor throws
   `safety-gate-needs-confirmation`), then allows the same
   advance once `advanceWithConfirmation` is called. This is
   the same gate code `bug-report` exercises at `propose-fix`/
   `apply-fix`, `feature-request` exercises at `implement`,
   `refactor` exercises at `implement`, `change-request`
   exercises at `migrate`, `regression` exercises at `re-fix`,
   `user-complaint` exercises at `apply-fix`, `security-problem`
   exercises at `apply-mitigation`, and `release` exercises at
   `tag` — proving the gate logic is keyed off the workflow's
   `safety_gates` declaration, not hardcoded to any one
   workflow's specific states.
4. **Question economy with 2 allowed states.** The budget is
   `max_questions: 2, allowed_states: [classify, assess-impact]`.
   The driver asks one question in `classify` (was there a recent
   deploy?) and one in `assess-impact` (tier-1 or tier-2?) — both
   accepted. A third question, attempted in `mitigate` (not in
   `allowed_states`), is rejected with
   `question-economy-wrong-state`.
5. **SEV-scored impact assessment — unique structural feature
   #1.** The `assess-impact` state emits a `Decision` whose
   `what` starts with `"impact_assessment:SEV2:"` and includes
   `blast=`, `affected=`, `slo_burn=`, and `status_page=` fields.
   The driver spot-checks that the persisted `Decision.what`
   starts with `"impact_assessment:SEV2:"` and includes the
   `blast=`, `affected=`, and `slo_burn=` substrings.
6. **Mitigation with alternatives — unique structural feature
   #2.** The `mitigate` `Decision` records the chosen
   mitigation (rollback to v1.4.0) AND at least three
   alternatives (forward-fix / scale-out / fail-over) with
   rejection reasons. The driver spot-checks that the persisted
   `Decision.alternatives` has `>= 3` entries. The
   `Decision.validated` is `false` until `verify-mitigation`
   confirms SLO recovery — the AI-output validation pattern.
7. **`verify-mitigation` uses `method: "app_validation"`** —
   NOT `unit_test`. The validation is the production system's
   own behavior (error rate dropped from 78% to 0.2%, latency
   p99 returned to baseline, SLO burn rate back to 1.0x). The
   driver spot-checks that the persisted `Validation.method` is
   `"app_validation"` and `result` is `"match"`.
8. **Blameless postmortem — unique structural feature #3.** The
   `postmortem` `Decision.why` mentions "root cause" AND
   "contributing factors" AND "action items" AND identifies
   systemic gaps (canary script optional, code review missing,
   status-page automation absent) — not individual mistakes. The
   driver spot-checks that the persisted `Decision.why` includes
   all three phrases AND does NOT include "engineer X" AND
   includes "systemic."
9. **Memory updates at terminal.** The `report` state writes a
   `known-failure` memory entry whose `symptom` is the
   *alert-observed symptom* (the PagerDuty alert that fired,
   with the threshold that triggered it) — NOT the root-cause
   description. So a future regression is detected by alert, not
   by code structure (which a refactor could obscure). The
   `report` state also writes a `project` memory entry recording
   the incident for the project's incident history.
10. **Disk persistence.** Evidence files actually land on disk
    under `evidence/<kind>/*.json` and `memory/<kind>/*.json` —
    the driver spot-checks several (the SEV-scored `Decision`,
    the mitigation `Decision` with alternatives, the
    `verify-mitigation` `Validation` with `method:
    "app_validation"`, the blameless `postmortem` `Decision`,
    the `known-failure` memory with the alert-observed symptom)
    to confirm they round-tripped through `JSON.stringify`
    without mutation.

## The scenario

A realistic incident: *"PagerDuty fires — /orders error rate
spiked to 78% (baseline 0.2%) 14 minutes ago, on-call paged,
tier-1 revenue-critical service."* The driver models:

- **classify:** asks one decision-changing question ("was there
  a recent deploy in the /orders service's window?") — the
  answer routes `triage` to look at deploy logs vs.
  infrastructure metrics. Emit the `Incident` + acceptance
  `Decision`.
- **assess-impact:** asks one more question ("tier-1 or
  tier-2?") — the answer determines the mitigation budget. Emits
  the SEV2 score with all five fields (severity / blast radius /
  affected-user estimate / SLO-breach / customer-facing).
- **triage:** emits 4 `Event`s (deploy log shows v1.4.1 deployed
  T-16m with a null-deref; config flips none; traffic shows the
  error rate spike correlates with deploy timestamp; dependency
  health all green). The proximate trigger is the v1.4.1 deploy.
- **mitigate:** emits the rollback-to-v1.4.0 `Decision` with
  3 alternatives (forward-fix / scale-out / fail-over) and
  rejection reasons. The broad-refactor gate fires (tier-1 prod
  change requires confirmation); confirmed via
  `advanceWithConfirmation`. Emits an `Event` with the `kubectl
  rollout undo` command and its output.
- **verify-mitigation:** emits 2 `Event`s (SLO-recovery metrics:
  error rate 78% → 0.2%, latency p99 4500ms → 180ms, SLO burn
  14x → 1.0x; alerts cleared). `Validation` with `method:
  "app_validation"`, `result: "match"`.
- **postmortem:** emits a blameless `Decision` with root cause
  (null-deref at handler.ts:42), contributing factors (canary
  optional, code review missing, status-page automation absent),
  action items (4 with owners/due-dates/severities), and an
  `Event` recording the postmortem at `docs/postmortems/
  2026-08-14-orders-null-deref.md`.
- **report:** writes the `known-failure` memory entry (symptom =
  alert-observed behavior, not code structure) AND the `project`
  memory entry recording the incident. Terminal.

## Why this matters (beyond "another test passes")

Before this run, the repo's twelve e2e proofs covered workflows
whose priority order was the usual engineering one: understand
the problem, find the cause, apply the fix, verify. None of
them exercised the *reordered* priority that real incidents
demand: mitigate first, triage under time pressure, root-cause
after the bleeding stops, postmortem blameless.

`incident` covers this shape and exercises structural features
the first twelve did not: (a) the SEV-scored impact assessment
with five fields, (b) the proximate-trigger-vs-root-cause
distinction in `triage`, (c) the mitigation-vs-fix distinction
in `mitigate` with alternatives recorded, (d) the
production-behavior-not-test-suite validation in
`verify-mitigation`, and (e) the blameless postmortem pattern.

The fact that the same executor runs all thirteen workflows
without code changes is the empirical proof that the Evidence
Model's `Decision` entity is flexible enough to represent (a) a
root-cause hypothesis (`bug-report`), (b) a CVSS severity
assessment (`security-problem`), (c) an impact assessment with
SEV scoring (`incident`'s `assess-impact`), (d) a mitigation with
alternatives (`incident`'s `mitigate`), and (e) a blameless
postmortem with action items (`incident`'s `postmortem`) — five
semantically distinct uses of the same schema, across structurally
distinct workflows. The `Validation` entity similarly flexes:
`unit_test` for code changes, `app_validation` for behavioral
checks AND for production-behavior checks (the same method, two
very different contexts), `contract_validation` for spec/divergence
checks, `manual_review` for human-judged comparisons.
