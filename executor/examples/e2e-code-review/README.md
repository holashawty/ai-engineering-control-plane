# End-to-end run: code-review workflow (clean `/health` endpoint addition)

**This is the third e2e proof point** in the repo, alongside
`executor/examples/e2e-membership-bug/` and
`executor/examples/e2e-feature-request/`. The first proved
`bug-report.sm.yaml` runs end-to-end against real captured data. The
second proved the executor is **workflow-agnostic** by running
`feature-request.sm.yaml` (a structurally different workflow with a
`design` state that authors a new `Expected`) through the same
`WorkflowRun` engine with zero code changes. This one proves the
executor handles a workflow with **no safety gates** — `code-review`
is read-only by design, producing a `Validation` but applying no patch.

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state of
`code-review.sm.yaml`. Every `emitEvidence` call writes a JSON file to
disk that the executor's `EvidenceStore` validates against the actual
`evidence/schema/*.schema.json` files — a schema violation would throw
before the file is written. Every transition goes through the real
`StateMachine.advance` and `WorkflowRun.advance`.

**Isn't:** a recording of a live multi-turn agent session issuing one
tool call at a time through an actual agent adapter. The scenario data
(the diff text, the test output, the validation verdict) is realistic
but scripted. The same honest scope note as
`executor/examples/e2e-feature-request/README.md` applies: a driver
script assembling realistic data is not yet a live agent session.

## What the run proves

Run `node executor/examples/e2e-code-review/drive-run.mjs` and observe
20+ assertions passing across three scenarios. The interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every
   transition's `from`/`to` is in `states[]`, no non-terminal state is
   a dead end, all states reachable from `intake`.
2. **End-to-end walk (happy path).** A single `WorkflowRun` walks
   `intake → classify → understand-change → assess → review → report`,
   emitting schema-valid evidence at every emitting state.
3. **No safety gate fires.** The workflow declares no `safety_gates`
   (read-only by design — there is no source edit to gate). The run
   log has zero `gate-check` entries, proving the executor correctly
   skips gate enforcement when no gates are declared. This is the
   structural inverse of `bug-report` (which exercises gates at
   `propose-fix` and `apply-fix`) and `feature-request` (which
   exercises the gate at `implement`) — proving the gate logic is
   workflow-declaration-driven, not unconditional.
4. **Question economy with one allowed state.** The budget is
   `max_questions: 1, allowed_states: [classify]`. The driver asks one
   question in `classify` (accepted), then asserts:
   - a *second* question in `classify` is rejected with
     `question-economy-exceeded` (budget exhausted); and
   - a question in `understand-change` (not in `allowed_states`) is
     rejected with `question-economy-wrong-state` (asserted in a fresh
     run so the budget-exhausted check doesn't fire first).
   Tighter than `feature-request`'s two-state budget (2); equal in
   count to `bug-report`'s (1) but applied to a different state
   shape (review-classification rather than incident-classification).
5. **Validation is the review's verdict.** The `review` state emits
   an `Actual` + `Validation` pair with `method: "manual_review"` (per
   ADR-0010, `unit_test` alone is never sufficient for a review
   verdict, the same bar `behavioral-verification` sets for fix
   verification). The `Validation.result` is `match` for the happy
   path.
6. **Decision trace preserved.** The `assess` `Decision` records
   concerns as `alternatives` with their dispositions (blocking /
   non-blocking with reasons) — the eventual `report` state can cite
   these for the decision trace
   `constitution/engineering-principles.md` "Report the decision
   trace, not just the outcome" requires.
7. **Memory update at terminal (happy path).** The `report` state
   writes a real `project` memory entry recording that the change was
   reviewed and accepted, so a future workflow does not re-review the
   same diff.
8. **Failure path demonstrated.** A second scenario walks the workflow
   to `blocked` via `review_blocked_by_unresolved_concern` after a
   `mismatch` validation — demonstrating that the failure terminal is
   reachable and the validation result is correctly emitted as
   `mismatch`, not silently `match`. No `project` memory is written
   in the failure path (the review did not approve).
9. **Disk persistence.** Evidence files actually land on disk under
   `evidence/<kind>/*.json` and `memory/<kind>/*.json` — the driver
   spot-checks one (the `Validation`) to confirm `result: "match"`
   and `method: "manual_review"` round-tripped through `JSON.stringify`
   without mutation.

## The scenarios

### Scenario 1 (happy path): clean `/health` endpoint addition

A realistic review request: *"review this PR — it adds a `GET /health`
endpoint to our Express app, plus a test file."* The driver models:

- **classify:** asks one decision-changing question ("hotfix or next
  release?" — answer: next release, which lowers the rollback-review
  bar) — exactly the kind of question that changes the review bar and
  that the diff itself can't answer.
- **understand-change:** captures the diff (route addition + app
  wiring + new test file) as a `file_change` `Event` with the
  verbatim diff in `payload`, wraps it in a `Trace` with a `git log`
  event for context, and emits a baseline `Expected` ("existing
  `/items` endpoint behavior unchanged").
- **assess:** emits a `Decision` recording concerns (none blocking
  for the happy path: small surface, new test covers the new path,
  no contract drift, no new security surface) and a new-contract
  `Expected` ("GET /health returns 200 with { status: 'ok' }").
- **review:** runs the new test, reads the diff, emits an `Actual`
  matching the `Expected`, and a `Validation` with `result: "match",
  method: "manual_review"`.
- **report:** writes the project memory entry, terminal.

### Scenario 2 (failure path): `/health` masks DB-down state

A second realistic review request: *"review this PR — it adds
`/health` returning `{ status: 'ok' }`."* The driver models:

- **classify:** proceeds without a question (intent clear from the
  diff).
- **understand-change:** captures the diff (a `/health` handler that
  unconditionally returns 200 with no DB-state check).
- **assess:** surfaces one blocking concern — the orchestrator is
  configured to use `/health` as a liveness probe, so an endpoint that
  always returns 200 would route traffic to a pod even when its DB
  connection is down. Emits a new-contract `Expected` reflecting what
  the change *should* do (return 503 when DB is unreachable).
- **review:** emits an `Actual` ("GET /health always returns 200
  regardless of DB connection state") and a `Validation` with
  `result: "mismatch", method: "manual_review"`.
- **blocked:** terminal — review did not approve. No `project`
  memory is written; the concern is preserved in the `blocked`
  state's report and the `Validation` artifact, both of which cite
  the `Decision` and `Actual` so a follow-up `bug-report` or
  `change-request` run can pick up the chain without re-deriving it.

### Scenario 3 (question-economy wrong-state): fresh run

A third, minimal scenario verifies that a question asked in
`understand-change` (not in `allowed_states`) is rejected with
`question-economy-wrong-state`. A fresh run is used so the
budget-exhausted check (which fires first in scenario 1's second
question test) does not mask the wrong-state check.

## Why this matters (beyond "another test passes")

`bug-report` covers the reactive half of agent work (diagnose → fix →
verify). `feature-request` covers the constructive half (design →
implement → verify). `code-review` covers the **gatekeeping** third:
decide whether a change should ship, without writing any code. This is
the first workflow in the repo with no `safety_gates` declaration,
proving the executor handles the no-gate case as cleanly as the gated
case — the gate logic is keyed off the workflow's declaration, not
unconditionally applied. It is also the first workflow whose terminal
memory write is conditional on the validation result (`project` for
approved; no memory write at `blocked` when the review surfaces a
blocking concern — the concern is left for a follow-up `bug-report` or
`change-request` run, since `code-review` itself does not diagnose a
root cause and therefore has no `Incident` to anchor a `known-failure`
memory entry against).

The `code-review` workflow also exercises a structural shape neither
prior workflow has: a `review` state that emits `Actual` + `Validation`
without any preceding `apply-fix`/`implement`/`verify` chain. The
`Actual` here is observed by reading the diff (and optionally running
its tests), not by running the fixed code — the SPEC/OBS separation
from `docs/architecture.md` still holds, but the "observation" is
reading rather than execution.

## Running it yourself

```bash
cd executor
npm install && npm run build
cd examples/e2e-code-review
node drive-run.mjs
```

The diffs under review (the Express `/health` endpoint additions) are
embedded as string constants in `drive-run.mjs` so the run is
reproducible without needing the original PR to still exist on disk.
