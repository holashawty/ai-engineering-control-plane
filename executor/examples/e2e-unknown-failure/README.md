# End-to-end run: unknown-failure workflow (ambiguous "membership feels weird" → routed to regression)

**This is the ninth e2e proof point** in the repo, alongside
`executor/examples/e2e-membership-bug/` (bug-report),
`executor/examples/e2e-feature-request/` (feature-request),
`executor/examples/e2e-code-review/` (code-review),
`executor/examples/e2e-refactor/` (refactor),
`executor/examples/e2e-change-request/` (change-request),
`executor/examples/e2e-chat-adapter/` (chat adapter),
`executor/examples/e2e-project-onboarding/` (project-onboarding),
`executor/examples/e2e-regression/` (regression), and
`executor/examples/e2e-performance-problem/` (performance-problem).
The first eight proved the executor handles eight structurally
distinct workflows (reactive, constructive, gatekeeping,
behavior-preserving, behavior-modifying, onboarding, prior-context-
aware, cost-shaped) plus a chat-LLM text-protocol adapter. This one
proves the executor handles the **fallback workflow** of the
catalog: the one that, unlike every other workflow, *routes to
another workflow* rather than producing an applied change.

## What makes unknown-failure structurally different

Every other workflow in the catalog has a clear target outcome:
`bug-report` produces a fix, `feature-request` produces a new
capability, `code-review` produces an approval/block, `refactor`
produces behavior-preserving restructure, `change-request` produces
a behavior modification, `project-onboarding` produces initial
memory entries, `regression` produces a re-fix, `performance-problem`
produces a perf improvement. `unknown-failure` produces none of
these — its terminal `report` state emits a `Decision` whose `what`
field names the *target workflow to reroute to* (e.g.,
`workflow_routed:regression`), and its terminal `blocked` state
surfaces the specific reason no routing could be derived.

This is structurally distinct from every other workflow in three
ways:

1. **It WRITES NO MEMORY anywhere.** Every other e2e driver in this
   repo writes memory at the terminal `report` state (a `project`
   entry for feature-request / refactor / code-review; a
   `known-failure` entry for bug-report and change-request; a
   `project` entry for regression and performance-problem) or at
   dedicated pre-report states (project-onboarding writes `project`
   + `environment` at two pre-report states). `unknown-failure`
   writes **zero** memory entries anywhere — its `report` state's
   `writes_memory: []` declaration is honored, and the driver
   asserts that no `memory/` directory is created at all. This is
   the only workflow in the catalog whose terminal states both
   write nothing.
2. **It has no safety gate.** Like `code-review` and
   `project-onboarding`, `unknown-failure` declares no `safety_gates`
   — but for a different reason. `code-review` is read-only by
   design. `project-onboarding` writes only to `.aiecp/`. 
   `unknown-failure` writes **nothing at all** — no source code, no
   memory, no `.aiecp/project-intelligence.json`. It is purely
   diagnostic at every layer. The `broad-refactor` gate is not
   appropriate (no refactor happens). The `edit_source` gate is not
   appropriate (no source files are edited). The e2e driver asserts
   this by checking the run log has zero `gate-check` entries and
   that every `advance()` call returned `gateDecision: undefined`.
3. **Its terminal `Decision` names a routing target, not an
   applied change.** Every other workflow's terminal `Decision`
   names an applied change: `root_cause_candidate:X`,
   `ai_proposal:apply_patch`, `regression_recorded`, etc. 
   `unknown-failure`'s `route-or-block` state emits a `Decision`
   whose `what` field uses the form `workflow_routed:<workflow-name>`
   (e.g., `workflow_routed:regression`) — the routing artifact the
   router (or the user) will act on. The `Decision.evidence_refs`
   array MUST contain both the `triage` Decision id AND at least
   one corroborating `event` from `gather-context` — a routing
   with no corroborating event is a hollow routing, the same
   hollow-evidence failure mode `evidence-engineering` step 2
   exists to prevent across all workflows.

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state of
`unknown-failure.sm.yaml`. Every `emitEvidence` call writes a JSON
file to disk that the executor's `EvidenceStore` validates against
the actual `evidence/schema/*.schema.json` files — a schema violation
would throw before the file is written. Every transition goes through
the real `StateMachine.advance` and `WorkflowRun.advance`.

**Isn't:** a recording of a live multi-turn agent session, AND it
isn't an actual cross-workflow routing (the routed-to workflow
`regression` is not actually invoked from this driver — the driver
proves the routing Decision is emitted correctly, not that the
routed-to workflow runs as a follow-up). The scenario data (the
git log output, the prior known-failure entry, the grep results) is
realistic but scripted. A live cross-workflow routing integration
test (where `unknown-failure`'s `workflow_routed` Decision actually
triggers `regression`'s run) is tracked as future work in
`STATUS.md`. The same honest scope note as
`executor/examples/e2e-feature-request/README.md` applies: a driver
script assembling realistic data is not yet a live agent session.

## What the run proves

Run `node executor/examples/e2e-unknown-failure/drive-run.mjs` and
observe 35+ assertions passing across four scenarios. The
interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every
   transition's `from`/`to` is in `states[]`, no non-terminal state
   is a dead end, all states are reachable from `intake`.
2. **End-to-end walk (happy path).** A single `WorkflowRun` walks
   `intake → classify → gather-context → triage → route-or-block →
   report`, emitting schema-valid evidence at every emitting state.
   Five transitions; four non-terminal emitting states + one
   terminal.
3. **No safety gate fires.** The workflow declares no `safety_gates`
   (writes nothing — diagnostic-only at every layer). The run log
   has zero `gate-check` entries AND every `advance()` call
   returned `gateDecision: undefined` — proving the executor's gate
   logic correctly skips enforcement when no gates are declared.
   This is the same structural property `code-review` and
   `project-onboarding` exercise, for a different reason (see
   "What makes unknown-failure structurally different" above).
4. **Question economy with two allowed states.** The budget is
   `max_questions: 2, allowed_states: [classify, gather-context]`.
   The happy-path scenario asks one question in `classify` ("is
   this about the calculation or the UI?") — accepted, and no
   second question is needed because the prior known-failure
   match is disambiguating. The failure-path scenario asks both
   allowed questions (one in `classify`, one in `gather-context`)
   — both accepted, budget exhausted. A third question, attempted
   in `triage` (NOT in `allowed_states`), is rejected with
   `question-economy-wrong-state`. A fourth assertion (in a
   fresh run) confirms a third question in `gather-context` IS
   rejected as `question-economy-exceeded` (budget exhausted) —
   the wrong-state rejection only fires when the state itself is
   disallowed, not when the budget is exhausted.
5. **`route-or-block` emits a `workflow_routed:<workflow>` Decision.**
   The terminal `Decision` in the happy path has
   `what: "workflow_routed:regression"`, `validated: true`,
   `result: "accepted"`. Its `evidence_refs` array contains BOTH
   the `triage` Decision id AND the corroborating `event` id from
   `gather-context` (the prior known-failure match). A routing
   Decision with no corroborating event in `evidence_refs` would
   be a hollow routing — the driver asserts the confirmation
   threshold is met.
6. **Failure path emits a `no_workflow_match` Decision with a precise
   gap.** The terminal `Decision` in the failure path has
   `what: "no_workflow_match"`, `result: "rejected"`, and a `why`
   field that names (a) which workflows were considered, (b) why
   each was rejected, (c) what information would have routed the
   request successfully, (d) what the user should do next. A
   blocked outcome with a vague "could not route" gap would be a
   process violation of the `unknown-failure` skill — the driver
   asserts all four clauses are present.
7. **ZERO memory written anywhere.** The run log has zero
   `memory`-store entries, and no `memory/` directory is created
   at all. This is the only workflow in the catalog whose terminal
   states both write nothing — every other workflow either writes
   memory at `report` or at dedicated pre-report states.
8. **Three evidence kinds emitted (not six).** Unlike the
   `bug-report` / `feature-request` / `code-review` / `refactor` /
   `change-request` / `regression` / `performance-problem` drivers
   (which emit six evidence kinds: trace, event, decision,
   expected, actual, validation), `unknown-failure` emits only
   three: `trace`, `event`, `decision`. This is because
   `unknown-failure` is diagnostic, not a verification workflow —
   it produces no `Expected`/`Actual` pair because it makes no
   behavioral claim to verify. The routing Decision is the
   workflow's primary output; no Validation entity is emitted
   because there is nothing to validate against (the routing is
   either confirmed with evidence, or refused with a precise gap).
9. **Disk persistence.** Evidence files actually land on disk under
   `evidence/<kind>/*.json` — the driver spot-checks the persisted
   routing Decision (`workflow_routed:regression` with
   `evidence_refs` containing the triage Decision + corroborating
   event), the triage candidate Decision (`routing_candidate:regression`
   with `validated: false`), the classify signal-shape Decision
   (`signal_shape:reactive` with rejected `alternatives`), and the
   gather-context Trace (with 3 `event_refs` for the three
   context-gathering commands).

## The scenarios

### Scenario 1 (happy path): "membership feels weird" → routes to regression

A realistic fallback: the router cannot confidently classify the
request "something weird is happening with the membership service —
I think members are seeing weird expiry dates, but it might also be
a UI display issue, I'm not sure." The request mentions a possible
bug (`bug-report` / `regression` candidate) and a possible UI
display issue (no specific workflow), and the uncertainty itself
warrants a clarifying question. Routes to `unknown-failure`. The
driver models:

- **classify:** reads the request, asks the one allowed question
  ("is this about the calculation or the UI?"), user answers
  "the calculation — members are seeing wrong dates." Emits a
  `signal_shape:reactive` Decision with rejected alternatives
  (constructive, behavior-modifying).
- **gather-context:** runs `git log --oneline -10` (finds a recent
  refactor that touched the membership boundary code), `rg -n
  'expiry' --include='*.py' .` (finds the `is_active` function
  and a docstring about the boundary, plus evidence the boundary
  check was reverted to `<`), `ls .aiecp/memory/known-failure/`
  (finds a prior `mem-known-failure-membership-expiry-boundary`
  entry whose symptom matches the current report verbatim). Emits
  one `Event` per command, wrapped in a `Trace`. No second
  question needed — the prior known-failure match is a strong
  signal.
- **triage:** emits a `routing_candidate:regression` Decision
  (`validated: false`, `result: "pending"`) with `evidence_refs`
  pointing at all three gather-context events and `alternatives`
  naming `bug-report` and `performance-problem` as rejected
  candidates.
- **route-or-block:** confirms the candidate (the prior
  known-failure match is direct corroboration). Emits the final
  `workflow_routed:regression` Decision (`validated: true`,
  `result: "accepted"`) with `evidence_refs` containing both
  the triage Decision id AND the corroborating event ids.
- **report:** terminal. Summarizes the chain. Writes no memory —
  `regression`'s own `report` state will write whatever memory
  is appropriate for that workflow's outcome.

### Scenario 2 (failure path — blocked with precise gap): "the system feels off"

A realistic failure: the request is too vague to route even after
the full question budget is consumed. The driver models:

- **classify:** reads the request, asks the one allowed question
  ("is this about something broken, or something you want to add?"),
  user answers "broken, I think, but I'm not sure where." Emits
  a `signal_shape:reactive` Decision (tentatively).
- **gather-context:** runs the standard context-gathering commands
  — all return negative findings (no obvious culprit in git log,
  no prior known-failure matches "feels off", no source code
  self-reports as broken). Asks the second allowed question
  ("can you name a specific surface, action, or error message?"),
  user answers "no, it's just a general sense." Budget exhausted.
- **triage:** cannot produce a candidate routing target — no
  corroborating event supports any candidate. Emits a
  `routing_candidate:none` Decision with `evidence_refs: []` and
  `alternatives` naming every candidate considered (bug-report,
  regression, performance-problem) and why each was rejected.
- **route-or-block:** cannot confirm any candidate (confirmation
  threshold not met for any workflow). Emits a `no_workflow_match`
  Decision (`validated: true`, `result: "rejected"`) with a `why`
  field naming all four clauses (which workflows were considered,
  why each was rejected, what information would have routed the
  request, what the user should do next). Transitions to
  `blocked` on `no_workflow_match`.
- **blocked:** terminal. The blocked report is actionable — the
  user can see exactly what was missing and what to supply next.

### Scenario 3 (question-economy wrong-state): fresh run

A minimal scenario: walk the workflow to `triage` (which is NOT in
`allowed_states`), then attempt to ask a question there. The
question is rejected with `question-economy-wrong-state`. A fresh
run is used so the budget-exhausted check (which fires first in
scenario 2's third question, if it were attempted in `classify` or
`gather-context`) does not mask the wrong-state check.

### Scenario 4 (question-economy exceeded): fresh run

Another minimal scenario: walk the workflow with two questions
already asked (one in `classify`, one in `gather-context` — both
accepted), then attempt a third question in `gather-context`. The
third question is rejected with `question-economy-exceeded` (budget
exhausted — `gather-context` IS in `allowed_states`, so the
wrong-state check does not fire first). This is the alternative
third-question rejection path the spec mentions ("third rejected")
— here rejected for the budget reason rather than the wrong-state
reason exercised in scenario 3.

## Why this matters (beyond "another test passes")

The eight prior e2e proof points covered eight workflow shapes:
reactive diagnostic (`bug-report`), constructive (`feature-request`),
gatekeeping (`code-review`), behavior-preserving (`refactor`),
behavior-modifying (`change-request`), onboarding
(`project-onboarding`), prior-context-aware (`regression`),
cost-shaped (`performance-problem`).

`unknown-failure` covers the **ninth** shape — the **fallback
shape**: the workflow that runs when no other workflow's intent
signal matches with confidence. This is structurally distinct
from every other workflow because its output is not a change but
a *routing recommendation*. The router (or the user) acts on the
`workflow_routed:<workflow>` Decision by invoking the named target
workflow; `unknown-failure` itself applies no change.

The structural features this driver proves that no prior driver
proved:

1. **The same executor that runs workflows which WRITE memory can
   also run a workflow that writes NOTHING.** The `EvidenceStore`
   only writes memory when `writeMemory` is called; the
   `WorkflowRun.writeMemory` API is symmetric with `emitEvidence`,
   but `unknown-failure` calls neither `writeMemory` nor emits any
   `Expected`/`Actual`/`Validation`. The fact that this works
   without code changes to the executor is the empirical proof
   that the executor's write path is opt-in per state, not
   mandatory per workflow.

2. **A workflow can declare no safety gates AND produce a
   meaningful terminal artifact (a routing Decision) without
   writing anything to disk.** The `code-review` workflow is the
   other no-gate workflow that produces a meaningful terminal
   artifact (a `Validation` Decision), but it writes a `project`
   memory entry at `report`. `project-onboarding` writes two
   memory entries at pre-report states. `unknown-failure` writes
   nothing — its terminal `report` state's `writes_memory: []`
   declaration is honored, and the driver asserts that no
   `memory/` directory is created at all.

3. **The `route-or-block` state's confirmation threshold (at least
   one corroborating event in `evidence_refs`) is enforceable via
   the evidence schema alone.** The `Decision` schema permits any
   string in `evidence_refs`, but the `unknown-failure` skill's
   procedure is explicit: a `workflow_routed` Decision with no
   corroborating event is a hollow routing. The driver
   spot-checks the persisted Decision's `evidence_refs` to confirm
   it contains BOTH the triage Decision id AND a corroborating
   event id — proving the threshold is met, not just declared.

4. **A `blocked` outcome with a precise gap is a successful
   `unknown-failure` run, not a failure.** The router spec names
   "refuse safely" as the fallback's correct behavior when no
   routing can be derived. The failure-path scenario proves the
   executor handles this correctly: the `blocked` state is
   reachable, the `no_workflow_match` Decision records the
   refusal with all four clauses (which workflows, why rejected,
   what's needed, what to do next), and the run terminates cleanly
   without writing any spurious memory or evidence. A `blocked`
   outcome with a vague "could not route" gap would be a process
   violation of the `unknown-failure` skill — the driver asserts
   all four clauses are present in the persisted Decision's `why`
   field.

## Running it yourself

```bash
cd executor
npm install && npm run build
cd examples/e2e-unknown-failure
node drive-run.mjs
```

The "host repo" being routed from (the `membership-service`
Python+pytest repo) is described in the script's comments and
`Event.payload.finding` strings — it is not actually created on disk
in this driver (a live cross-workflow routing integration test
that does create it on disk and actually invokes `regression`'s
run as a follow-up is tracked as future work in `STATUS.md`). The
scenario data is realistic enough to exercise every state and every
evidence schema the real run would exercise.
