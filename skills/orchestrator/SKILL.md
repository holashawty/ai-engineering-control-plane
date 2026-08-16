---
name: orchestrator
description: Use when a user's request spans multiple workflows or requires autonomous goal pursuit — the orchestrator chains workflows (bug-report → feature-request → verify, etc.) in a loop until the goal is met or blocked. Implements "loop engineering" (LangChain, June 2026) where the agent prompts itself, iterates until done, and reports findings. Distinct from unknown-failure (which triages a single ambiguous intent); this skill drives multi-workflow autonomous execution.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Orchestrator

## When to use this skill

At the `classify-goal`, `route`, `execute-workflow`, and
`evaluate-result` states of `workflows/orchestrator.sm.yaml`.
This skill is what stands between "the user's request is too
large for any one workflow" and "the goal is met, or refused
safely with a precise gap."

This is the **loop engineering** workflow of the AIECP catalog.
Per `docs/controller-audit-and-roadmap-2026.md` §3.3, the 2026
industry progression is `prompt engineering → context
engineering → harness engineering → loop engineering`. AIECP
already implements the first three: skills prompt the agent,
the Evidence Model anchors context, and the workflow state
machine + safety gates + question economy constitute the
harness. This skill adds the fourth layer — the agent prompts
*itself* between iterations, selects the next workflow, runs
it, evaluates whether the goal is met, and loops back or
terminates without asking the user between workflows.

**Anti-patterns that mean: stop and return to `classify-goal`.**

- Routing to a workflow that has not yet been implemented. The
  routing table in `workflows/_router.md` marks some workflows
  as "Planned" rather than "MVP — implemented." Routing to a
  planned workflow would produce a `workflow_routed` Decision
  the executor cannot act on; the `route` state must surface
  this as `no_workflow_matches` with a precise gap ("the sub-
  goal matches the user-complaint shape, but
  `user-complaint.sm.yaml` is not yet implemented; the user
  should rephrase as `bug-report` or wait for user-complaint to
  ship") rather than emit a routing Decision to a non-existent
  workflow. (Same anti-pattern as `unknown-failure`'s, applied
  per-iteration rather than once.)
- Asking more than one question. The budget is 1 (in
  `classify-goal` only) because the orchestrator operates
  autonomously after `classify-goal` — the entire point of
  loop engineering is that the agent prompts ITSELF between
  iterations, not the user. If a question would be decision-
  changing mid-loop (after `classify-goal`), the correct
  outcome is `blocked` with a precise gap, not a second
  question. The agent does not get to interrupt the user
  mid-loop; the user delegated the goal at `intake`, and the
  orchestrator's job is to either achieve it or refuse safely.
- Silently retrying the same workflow for the same sub-goal
  after a `blocked` outcome. `evaluate-result` MUST cite the
  prior `blocked` outcome in its `Decision.why` when
  transitioning back to `route` for a sub-goal that the
  just-executed workflow blocked on — and `route` MUST select
  a DIFFERENT workflow for that sub-goal, not the same one. A
  loop that retries the same workflow for the same sub-goal
  forever is an infinite loop; the decomposition's finite sub-
  goal count bounds the loop only if each iteration strictly
  advances the set of remaining sub-goals OR the set of
  workflows tried per sub-goal.
- Treating the back-edge as a free retry. The
  `evaluate-result → route` back-edge exists to chain workflows
  for a MULTI-WORKFLOW goal, not to retry a single workflow
  that produced a `blocked` outcome. If the goal was a single-
  workflow goal that the router mis-classified as multi-
  workflow, the orchestrator's `classify-goal` should have
  detected this and emitted a single-sub-goal decomposition;
  if it didn't, the first `evaluate-result` should transition
  to `blocked` rather than loop back for a "different angle."
- Routing Decisions with no `evidence_refs`. A `workflow_routed`
  Decision whose `evidence_refs` is empty is a guess, not a
  routing — same hollow-evidence failure mode `unknown-failure`'s
  skill exists to prevent. The `route` state's Decision MUST
  reference both the `classify-goal` decomposition Decision id
  AND (for iterations after the first) the most recent
  `evaluate-result` Decision id. (Same anti-pattern as
  `unknown-failure`'s, applied per-iteration.)

## Procedure

### 1. Classify-goal (state: `classify-goal`)

Decompose the user's high-level goal into an ordered list of
sub-goals, each addressable by ONE workflow from the routing
table in `workflows/_router.md`. The decomposition is the
orchestrator's analytical core — get this right, and the loop
runs cleanly; get this wrong, and every iteration is wasted.

**Decomposition method.**

1. Read the request verbatim. Identify each distinct intent
   (a "fix", an "add", a "change", a "clean up", a "release",
   an "audit", etc.). Each intent is one sub-goal.
2. For each sub-goal, identify the candidate target workflow
   using the routing table in `workflows/_router.md`:
   - Reactive ("X doesn't work") → `bug-report` (or
     `regression` if a `known-failure` memory entry's symptom
     matches, or `incident` if a production alert, or
     `security-problem` if a vulnerability report).
   - Constructive ("add a feature") → `feature-request`.
   - Behavior-modifying ("change how X works") →
     `change-request`.
   - Behavior-preserving ("clean up", "refactor") → `refactor`.
   - Gatekeeping ("review this PR") → `code-review`.
   - Onboarding-shaped (no prior memory) → `project-onboarding`.
   - Cost-shaped ("it's slow") → `performance-problem`.
   - Release-shaped ("ship this") → `release`.
3. Inspect the codebase + prior memory to validate each
   candidate. Emit one `Event` per inspection command (e.g.,
   `git log --oneline -20`, `ls .aiecp/memory/known-failure/`,
   `rg -n '<keyword>' .`, `cat .aiecp/project-intelligence.json`)
   wrapped in a `Trace`. These events are the evidence the
   decomposition Decision cites.
4. Determine the ordering. Some orderings are forced (a bug
   must be fixed before a feature that depends on the buggy
   code); some are free (a refactor can happen before or after
   an unrelated bug fix). The forced orderings are derivable
   from the inspection events (which code paths each sub-goal
   names); the free orderings are not.
5. Emit the decomposition `Decision` with `what:
   "goal_decomposition:<sub-goal-1>;<sub-goal-2>;..."`,
   `validated: false`, `result: "pending"`, `evidence_refs`
   pointing at the inspection events, `alternatives` naming
   any rejected orderings and why (e.g., "fix bug first vs.
   add feature first — chose fix-first because the feature's
   test depends on the bug being fixed").

**Single-workflow degenerate case.** If the request names only
ONE intent (the router mis-classified it as multi-workflow),
emit a single-sub-goal decomposition. The orchestrator will
run one workflow → one evaluate-result → `report` (no loop).
This is correct — the orchestrator does not refuse a single-
workflow goal; it runs it as the one-iteration degenerate
case. But the `classify-goal` `Decision.why` MUST note this
("the request was routed to the orchestrator but names only
one intent; running as a single-iteration loop") so the
`report` state can summarize accurately.

May ask at most ONE necessary, specific, decision-changing
question — typically about sub-goal ordering ("should the
bug be fixed before the feature is added?") when the
ordering is genuinely ambiguous (both orderings are valid,
and the choice affects the outcome). This is the ONLY
allowed question in the entire orchestrator run; after
`classify-goal`, the agent operates autonomously.

**Failure handling:** if the goal cannot be decomposed even
after the one allowed question (the request is too vague to
identify even one workflow that contributes), transition to
`blocked` with `goal_too_ambiguous` and a precise gap naming
what information would have made the goal decomposable. Do
NOT proceed to `route` against an empty decomposition — a
loop with no sub-goals is structurally an infinite loop, and
the only correct outcome is `blocked`.

**Project scale detection (mandatory, in addition to the
decomposition above).** `classify-goal` MUST also determine a
`project_scale: small | medium | large` classification and emit
it as a SEPARATE `Decision` with `what: "project_scale:small"`
(or `:medium` / `:large`), `validated: false`, `result:
"pending"`. This Decision is distinct from the
`goal_decomposition:...` Decision — the decomposition says WHAT
sub-goals to chain; the scale says HOW MANY planning phases to
insert before the execution workflows. The four planning skills
(`skills/requirements-gathering/`, `skills/project-planning/`,
`skills/architecture-design/`, `skills/ux-design/`) exist to
serve the `large` case; for `small` and `medium` they are
skipped to avoid over-process on self-specifying requests.

**Scale signals (inspected, not recalled — per `tool-use-
discipline` and constitution §8):**

- **small** — user word count < 20, no `--yarat` flag present,
  no multi-platform mention, single existing-repo surface
  named. Example: "fix the shipping bug" (5 words, no --yarat,
  one surface). Routing: SKIP all planning phases; go directly
  to the execution workflow (`bug-report` / `feature-request` /
  `change-request` / `refactor`) the decomposition's single
  sub-goal dictates. The request is self-specifying.
- **medium** — user word count 20-100, no `--yarat` flag, no
  multi-platform mention. Example: "add a CSV export endpoint
  for the items table with date-range filtering and async
  generation for large exports" (~25 words, no --yarat, one
  surface, existing repo). Routing: `requirements-gathering`
  → execution workflow (typically `feature-request` or
  `change-request`). SKIP `project-planning`, `architecture-
  design`, and `ux-design` — the existing repo's architecture
  and design system already constrain the work, and a medium-
  scale feature does not warrant re-planning them.
- **large** — user word count > 100, OR `--yarat` flag present,
  OR multi-platform mention ("web and mobile", "iOS and
  Android"). Example: a `--yarat` session "build me a plant-
  tracking app with web + mobile, photo log, watering schedule,
  and household sharing" (~20 words but --yarat + multi-platform
  → large). Routing: the FULL planning chain — `requirements-
  gathering` → `project-planning` → `architecture-design` →
  `ux-design` → execution workflows (`feature-request` for
  each MVP user story) → ...

The scale Decision's `evidence_refs` MUST point at the
inspection events that informed the classification (the word-
count probe `echo "$GOAL" | wc -w`, the `--yarat` flag check
`echo "$ARGS" | grep -- '--yarat'`, the multi-platform mention
scan `echo "$GOAL" | grep -iE 'mobile|ios|android|web.*and'`).
A scale classification asserted from "this feels like a small
request" is a constitution §8 violation — the signals must be
inspected, not recalled.

The scale is recorded so that downstream `evaluate-result`
iterations and the terminal `report` state can cite which
planning phases were (or were not) invoked. A `large` goal
that skipped `architecture-design` is a routing bug this
Decision makes auditable.

### 2. Route (state: `route`)

Select the next workflow to execute, from the remaining
sub-goals in the decomposition. This state is structurally
identical to `unknown-failure`'s `route-or-block` state —
both emit a `workflow_routed:<workflow>` Decision — but with
two distinctions:

1. The orchestrator's `route` PROCEEDS to `execute-workflow`
   (it runs the workflow); `unknown-failure`'s `route-or-block`
   transitions to `report` (it hands the routing back to the
   user). The orchestrator is the loop-engineering shape;
   `unknown-failure` is the single-workflow triage shape.
2. The orchestrator's `route` is called MULTIPLE times (once
   per loop iteration); `unknown-failure`'s `route-or-block`
   is called ONCE.

Emit a `Decision` with `what: "workflow_routed:<workflow-name>"`,
`validated: true`, `result: "accepted"`. The `evidence_refs`
array MUST contain:

- The `classify-goal` decomposition Decision id (the plan
  this routing is executing against). Required for every
  iteration.
- The most recent `evaluate-result` Decision id (the result
  of the prior iteration). Required for every iteration AFTER
  the first; the first iteration has no prior result, so its
  `evidence_refs` contains only the decomposition Decision.

A routing Decision with no `evidence_refs` is a hollow routing,
the same hollow-evidence failure mode `evidence-engineering`
step 2 exists to prevent across all workflows.

**Selection rule.** Pick the sub-goal at the head of the
remaining-sub-goals list (the decomposition's ordering, minus
any sub-goals already addressed by prior iterations). If
multiple workflows could address the same sub-goal (e.g., a
reactive sub-goal could go to `bug-report` OR `regression` if
a prior `known-failure` matches), prefer the more specific
workflow (`regression` over `bug-report`) — same preference
order the router uses at intake time. Cite the disambiguating
event in the Decision's `why` (e.g., "prior known-failure
entry `mem-known-failure-X` matches the sub-goal's symptom
verbatim → `regression` over `bug-report`").

**Failure handling:** if no workflow matches the next sub-goal
(the sub-goal names a workflow not yet implemented, OR no
workflow in the catalog addresses this kind of sub-goal),
transition to `blocked` with `no_workflow_matches` and a
precise gap naming (a) which sub-goal could not be addressed,
(b) which workflows were considered, (c) why each was rejected,
(d) what the user should do next (rephrase, supply more
context, manually invoke a specific workflow, or wait for a
planned workflow to ship). Same four clauses as
`unknown-failure`'s `no_workflow_match` blocked report.

### 3. Execute-workflow (state: `execute-workflow`)

Spawn the child `WorkflowRun` for the workflow selected by
`route`. Pass it the sub-goal extracted from the decomposition
(narrowed to the child workflow's intake-level scope). Wait for
the child to terminate. Propagate the child's terminal state
and emitted evidence into the orchestrator's own evidence
chain.

In the MVP executor (which has no cross-workflow spawning
yet — see `STATUS.md`), the e2e driver at
`executor/examples/e2e-orchestrator/drive-run.mjs exercises
this state through a script that simulates the child workflow's
outcome: the driver emits the evidence the child would have
emitted (a `Decision` recording the child's terminal outcome,
an `Event` recording what the child did, optionally a
`Validation` if the child workflow was a verification
workflow like bug-report or refactor) and then advances on
`workflow_complete` or `workflow_failed`.

**Safety gate.** This state declares `safety_gate:
broad-refactor`, mapped to the `edit_source` capability per
`executor/src/run.ts`'s `GATE_TO_CAPABILITY` map. The default
autonomy policy sets `edit_source: "ask"`, so an un-confirmed
`advance("workflow_complete")` is rejected with
`safety-gate-needs-confirmation`. The driver (or a real agent
driving the run) must use `advanceWithConfirmation` to
proceed, simulating a human confirming the delegation. This
is the orchestrator's UNIQUE safety property: no other
workflow in the catalog declares a gate whose purpose is to
bound delegation to another workflow. The orchestrator's own
code does not modify source — it CAUSES other workflows to
modify source, and "causes" must be gated just as "applies"
is gated, per `constitution/safety-rules.md`.

**Failure handling:** if the child WorkflowRun itself crashes
(distinguished from the child terminating in its own `blocked`
state — a crash is an executor-level failure, a `blocked`
termination is a workflow-level outcome), transition to
`blocked` with `workflow_failed` and a precise gap naming
the child workflow, the executor-level error, and the
sub-goal that was being executed. If the child terminates in
its own `blocked` state, that is NOT `workflow_failed` — the
child's `blocked` outcome is a valid completion; the
orchestrator's `evaluate-result` state will decide whether
the goal is unachievable given the child's `blocked` outcome,
or whether a different workflow could address the same
sub-goal.

### 4. Evaluate-result (state: `evaluate-result`)

Evaluate whether the original goal (from `classify-goal`'s
decomposition) is fully met after the just-executed workflow.
This is the analytical step where the loop either terminates
(goal met / unachievable) or loops back (goal not yet met).

Emit a `Decision` with `what:
"goal_evaluation:<achieved|not_yet_met|unachievable>"`,
`validated: false` (the evaluation is the orchestrator's
self-assessment — `validated: true` would require an external
Validation, which is the child workflow's responsibility, not
the orchestrator's), `result: "pending"`. The `evidence_refs`
array MUST contain:

- The `route` Decision id that selected the just-executed
  workflow (the routing being evaluated).
- The `execute-workflow` Decision id (the child workflow's
  outcome being evaluated).

**Three outcomes:**

- **`goal_achieved`** — ALL sub-goals in the decomposition
  have been addressed by workflows that terminated in `report`
  (not `blocked`). Transition to `report`.
- **`goal_not_yet_met`** — at least one sub-goal remains
  unaddressed. Transition BACK to `route` on the
  `goal_not_yet_met` event (the LOOP BACK EDGE — the
  structural feature that makes this workflow distinct from
  every other in the catalog). The `Decision.why` MUST name
  which sub-goal was just addressed and which remain; if the
  just-executed workflow terminated in `blocked`, the
  `Decision.why` MUST cite the prior `blocked` outcome and
  name which DIFFERENT workflow could address the same sub-
  goal (the loop cannot silently retry the same workflow for
  the same sub-goal).
- **`goal_unachievable`** — the just-executed workflow
  terminated in `blocked`, AND the blocked state's gap names
  a sub-goal that cannot be addressed by any remaining
  workflow in the catalog (every candidate was tried and
  blocked, OR the sub-goal names a workflow not yet
  implemented and no alternative exists). Transition to
  `blocked` on `goal_unachievable` with a precise gap naming
  which sub-goal could not be addressed.

**Plan revision handling (the LIVING PLAN feedback loop).** In
ADDITION to the three goal-evaluation outcomes above, this
state MUST check whether the just-executed workflow emitted a
`Decision` whose `what` field is `architecture_constraint_conflict`
(the `architecture-design` skill's canonical conflict signal,
encoding the logical `conflicts_with_requirements: true` intent
— see `skills/architecture-design/SKILL.md` step 7 for why this
is encoded in the `what` field rather than as a separate boolean
field, due to `decision.schema.json`'s `additionalProperties:
false`). If such a Decision was emitted, transition to `route`
on `plan_revision_needed` INSTEAD OF `goal_not_yet_met` — the
goal is not "not yet met" in the sense of a remaining sub-goal;
the goal's PLAN needs revision to account for the architectural
constraint that conflicted with a requirement. `route` will then
select `project-planning` (re-invoked per its LIVING PLAN rule,
see `skills/project-planning/SKILL.md`) to update `specs/plan.md`,
after which `architecture-design` re-runs to confirm the revised
plan has no further conflicts.

This back-edge is the structural feature that makes planning +
architecture a *co-evolution* rather than a waterfall: when
architecture surfaces a constraint the requirements did not
account for, the plan is revised, and architecture re-evaluates
against the revised plan. Without this back-edge, an
architectural conflict would force a `blocked` outcome and a
human re-plan; with it, the orchestrator drives the revision
loop autonomously (the "loop engineering" pattern applied to
the planning/architecture boundary, not just the workflow-
execution boundary).

**Maximum plan revision loops: 3 (the three-failure rule,
mirrored from `systematic-debugging` Phase 4.5).** After the
3rd `plan_revision_needed` transition, transition to `blocked`
on `plan_revision_limit_reached` INSTEAD of routing back to
`route` for a 4th revision. Three rejected architectural
candidates is the empirical signal that the problem is
structural (the requirements are internally contradictory, or
the architectural constraints are mutually exclusive), not
local. The blocked report MUST name (a) the three conflicts
that triggered the revisions, (b) why each revised plan did
not resolve the conflict, (c) what the user should do next
(rephrase the requirements to remove the contradiction, or
relax one of the conflicting constraints, or accept that the
goal is unachievable with the available stack).

This mirrors `systematic-debugging`'s three-failure rule
exactly: that skill stops emitting new root-cause candidates
after three have been tested and rejected, because three
failures in a row is the empirical signal that the problem is
architectural, not local. Here, three plan-revision failures
in a row is the empirical signal that the requirements/
architecture conflict is structural, not a planning bug.
Continuing past 3 is the failure mode the
`plan_revision_limit_reached` transition exists to prevent —
exactly as `systematic-debugging`'s three-failure rule prevents
a 4th speculative fix layered on top of 3 already-failed ones.

**Loop boundedness.** The back-edge to `route` is bounded by
the decomposition's finite sub-goal count: each pass through
`route` consumes one sub-goal (the one whose workflow was
just executed), so the loop runs at most N+1 times (N
sub-goals + 1 final evaluation that confirms `goal_achieved`).
An infinite loop is structurally impossible because `route`
only selects a workflow for a REMAINING sub-goal, and the set
of remaining sub-goals strictly decreases per iteration. The
only way the loop could exceed N+1 iterations is if a sub-
goal's workflow blocked and a DIFFERENT workflow is selected
for the same sub-goal — in that case, the loop iterates once
more per additional workflow tried per sub-goal, but the
total iteration count is bounded by N + (number of distinct
workflows that could address each sub-goal).

## Tool integration

- **`filesystem_read`**: read the user's goal (if filed as a
  file), read the repo's `.aiecp/memory/` directories to look
  for prior orchestrator runs that decomposed a similar goal
  (per `docs/memory-model.md`), read the repo's
  `.aiecp/project-intelligence.json` to determine which
  workflows are implementable for the sub-goals, read prior
  `Trace`/`Event` artifacts when building the evidence chain
  for the decomposition. Per `tool-use-discipline` and
  constitution §8, no routing decision is asserted from
  memory — every signal must be inspected, not recalled.
- **`filesystem_write`**: write the terminal `project` memory
  entry at `report` recording the orchestrator run (the goal,
  the decomposition, the chain of workflows executed). Also
  required because the orchestrator CAUSES child workflows to
  modify source (bug-report's apply-fix, feature-request's
  implement, refactor's implement, change-request's migrate),
  and the capability must be declared even if the orchestrator
  itself only writes the terminal memory entry — the
  `safety_gates` declaration at `execute-workflow` enforces
  the bound, but the capability must be in the workflow's
  `capabilities_required` for the gate to map correctly.
- **`shell_exec`**: run context-gathering commands (`git log`,
  `git diff`, `rg`, `grep`, `ls`, language-appropriate
  test/build commands) whose output becomes `Event.payload.finding`
  verbatim — never paraphrased. Also used to spawn child
  workflows in the real (non-MVP) executor: each child
  WorkflowRun is a process spawn that reads the child
  workflow's `.sm.yaml`, executes it, and returns its
  terminal state.
- **`test_runner`**: declared because child workflows
  (bug-report's `verify`, refactor's `verify-equivalence`,
  feature-request's `test`) require it; the orchestrator
  declares it so child spawns inherit the capability. The
  orchestrator itself does not run tests directly, but it
  must declare the capability for child spawns to receive
  it.

## Validation (of this skill itself)

A `classify-goal` / `route` / `execute-workflow` /
`evaluate-result` step using this skill is done correctly
only if:

- The `classify-goal` `Decision.what` field uses the
  `goal_decomposition:<sub-goal-1>;<sub-goal-2>;...` form
  (NOT a single workflow name — classify-goal produces a
  plan, not a routing; the routing is `route`'s job).
- The `classify-goal` `Decision.evidence_refs` points at
  concrete `event`s from the inspection trace. A
  decomposition Decision with no `evidence_refs` is a hollow
  plan, the same hollow-evidence failure mode
  `evidence-engineering` step 2 exists to prevent.
- The `classify-goal` state ALSO emits a separate
  `project_scale:small|medium|large` Decision with
  `validated: false`, `result: "pending"`, and
  `evidence_refs` pointing at the inspection events that
  informed the scale classification (word-count probe,
  `--yarat` flag check, multi-platform mention scan). A
  scale Decision with no `evidence_refs` (classification
  asserted from "this feels small") is a constitution §8
  violation.
- The scale classification drives routing: a `small` goal
  skips all four planning skills; a `medium` goal invokes
  only `requirements-gathering` before the execution
  workflow; a `large` goal invokes the full planning chain
  (`requirements-gathering` → `project-planning` →
  `architecture-design` → `ux-design` → execution). A `large`
  goal routed without the planning chain is a routing bug.
- The `route` `Decision.what` field uses the
  `workflow_routed:<workflow-name>` form (the same form
  `unknown-failure`'s `route-or-block` uses — but here the
  Decision is followed by execution, not a transition to
  `report`).
- The `route` `Decision.evidence_refs` array contains BOTH
  the `classify-goal` decomposition Decision id AND (for
  iterations after the first) the most recent
  `evaluate-result` Decision id. A routing Decision with no
  `evidence_refs` is a hollow routing.
- The `execute-workflow` state's `safety_gate: broad-refactor`
  declaration is enforced: an un-confirmed `advance` is
  rejected with `safety-gate-needs-confirmation`, and a
  confirmed `advanceWithConfirmation` proceeds. The e2e
  driver at `executor/examples/e2e-orchestrator/drive-run.mjs`
  asserts both.
- The `evaluate-result` `Decision.what` field uses the
  `goal_evaluation:<achieved|not_yet_met|unachievable>` form.
  The `evidence_refs` array contains BOTH the `route` Decision
  id AND the `execute-workflow` Decision id.
- The `evaluate-result` state checks for the
  `architecture_constraint_conflict` what-field on the just-
  executed workflow's emitted Decision, and if present,
  transitions on `plan_revision_needed` (NOT `goal_not_yet_met`)
  — the LIVING PLAN feedback loop. After the 3rd
  `plan_revision_needed`, it transitions on
  `plan_revision_limit_reached` to `blocked` rather than emit
  a 4th revised plan — mirroring `systematic-debugging`'s
  three-failure rule (Phase 4.5).
- If the workflow terminates in `report`, the `report` state
  emits a final `Decision` with `what:
  "goal_achieved:<summary>"`, `validated: true`, `result:
  "accepted"`, and `evidence_refs` pointing at the chain of
  routing + execute-workflow + evaluate-result Decisions
  across all iterations. The chain length is at least 3
  (decomposition + first routing + first evaluation) and at
  most 3N+2 (N sub-goals × 3 Decisions each + final goal-
  achieved Decision).
- If the workflow terminates in `blocked`, the blocked
  transition's gap statement names (a) which sub-goal could
  not be addressed, (b) which workflows were considered for
  it, (c) why each was rejected, (d) what the user should do
  next. Same four clauses as `unknown-failure`'s blocked
  report.
- No question was asked during `intake`, `route`,
  `execute-workflow`, or `evaluate-result` — these states
  are not in `orchestrator.sm.yaml`'s
  `question_economy.allowed_states` (only `classify-goal`
  is). Asking a question here is a constitution violation,
  not a stylistic choice (per `constitution/constitution.md`
  §4).
- No more than 1 question was asked across the entire run.
  A second question is `question-economy-exceeded` — the
  orchestrator must `blocked` rather than consume an
  unbounded interview. The agent prompts ITSELF between
  iterations; it does not prompt the user.
- The loop-back edge (`evaluate-result → route` on
  `goal_not_yet_met`) is traversed at least once for any
  multi-workflow goal (a goal with 2+ sub-goals in the
  decomposition). The e2e driver asserts this by checking
  the state machine's `history` array contains at least two
  `route → execute-workflow` transitions.

## Examples

**Happy path (multi-workflow goal):** User reports "fix the
shipping bug where labels print on the wrong label slot, and
add a feature for batch label printing." The router detects
two intents: a bug ("fix the shipping bug") and a feature
("add a feature for batch label printing"). Routes to
`orchestrator`. → `classify-goal` reads the request, runs
`git log --oneline -20` (finds a recent commit touching
`src/shipping/labels.py`), `rg -n 'label' --include='*.py' .`
(finds the `print_label` function and the slot calculation),
`ls .aiecp/memory/known-failure/` (no prior entry matching
the shipping bug). Emits one `event` per command, wrapped in
a `Trace`. Emits a `Decision` with `what:
"goal_decomposition:bug-report(shipping-label-slot);feature-
request(batch-label-printing)"`, `validated: false`, `result:
"pending"`, `evidence_refs` pointing at the inspection events,
`alternatives` naming the rejected ordering ("feature-first
vs. bug-first — chose bug-first because the feature's test
depends on the slot calculation being correct"). Asks the one
allowed question: "should the bug be fixed before the feature
is added?" → user answers "yes, the feature depends on the
bug being fixed." → `route` selects `bug-report` as the first
workflow (emits `workflow_routed:bug-report` Decision with
`evidence_refs` containing only the decomposition Decision,
since this is the first iteration). → `execute-workflow`
spawns `bug-report` (gated by `broad-refactor` — driver uses
`advanceWithConfirmation`). The child `bug-report` run
walks its own states (`intake → classify → locate-evidence
→ reproduce → diagnose → propose-fix → apply-fix → verify →
regression-protect → replay → report`), terminating in
`report` with a `known-failure` memory entry written. The
orchestrator's `execute-workflow` state emits a `Decision`
recording the child's terminal outcome (`what:
"child_workflow_complete:bug-report(report)"`) and an
`Event` recording what the child did. → `evaluate-result`
checks: is the original goal met? The bug is fixed (sub-goal
1 addressed), but the feature is not yet added (sub-goal 2
unaddressed). Emits `goal_evaluation:not_yet_met` Decision
with `evidence_refs` containing the route + execute-workflow
Decisions. Transitions BACK to `route` on
`goal_not_yet_met`. → `route` selects `feature-request` as
the second workflow (emits `workflow_routed:feature-request`
Decision with `evidence_refs` containing BOTH the
decomposition Decision AND the prior `evaluate-result`
Decision). → `execute-workflow` spawns `feature-request`
(gated again — `advanceWithConfirmation`). The child
`feature-request` run walks its own states, terminating in
`report` with a `project` memory entry written. →
`evaluate-result` checks: is the original goal met? The bug
is fixed AND the feature is added — all sub-goals addressed.
Emits `goal_evaluation:achieved` Decision. Transitions to
`report` on `goal_achieved`. → `report` emits the final
`goal_achieved:<summary>` Decision with `evidence_refs`
pointing at the chain (decomposition + 2 route + 2 execute-
workflow + 2 evaluate-result Decisions = 7 Decisions).
Writes a `project` memory entry recording the orchestrator
run.

**Failure mode (blocked with precise gap):** User reports
"make the system better." The router cannot confidently
classify this — too vague. Routes to `orchestrator` (the
router's policy for genuinely multi-intent-or-too-vague
requests). → `classify-goal` reads the request, runs the
standard inspection commands — all return vague findings
(no specific surface named, no prior known-failure matches
"better", no source code self-reports as needing
improvement). Asks the one allowed question: "can you name
a specific surface, behavior, or quality you'd like
improved?" → user answers "no, just make it better in
general." Budget exhausted. → `classify-goal` cannot
decompose the goal into any sub-goals — there is no
recognizable intent to match against the routing table.
Emits a `Decision` with `what: "goal_decomposition:none"`,
`validated: false`, `result: "pending"`, `evidence_refs:
[]`, `alternatives` naming every workflow considered
(bug-report, feature-request, refactor, etc.) and why each
was rejected (no specific intent matches any routing-table
signal). Transitions to `blocked` with `goal_too_ambiguous`
and a precise gap statement: "the request 'make the system
better' was considered against every workflow in the routing
table, but no specific intent matches any routing-table
signal with confidence. To decompose this goal, the request
would need at least one of: (a) a specific surface (endpoint,
UI route, CLI command), (b) a specific behavior (broken,
missing, slow, insecure), (c) a specific quality dimension
(readability, performance, security, accessibility). The user
should rephrase with at least one of these, or manually
invoke a specific workflow if they have a strong prior on
which dimension to improve."

**Single-workflow degenerate case:** User reports "fix the
shipping bug." The router mis-classifies this as multi-
workflow (perhaps because the request mentions "shipping"
which has a feature-adjacent connotation). Routes to
`orchestrator`. → `classify-goal` reads the request, runs
the inspection commands, identifies ONE intent (reactive —
something broken). Emits a `Decision` with `what:
"goal_decomposition:bug-report(shipping)"` (single sub-goal),
`validated: false`, `result: "pending"`, `why` noting "the
request was routed to the orchestrator but names only one
intent; running as a single-iteration loop." → `route`
selects `bug-report`. → `execute-workflow` spawns
`bug-report`. → `evaluate-result` checks: is the goal met?
Yes (the only sub-goal is addressed). Emits
`goal_evaluation:achieved` on the FIRST evaluation. Transitions
to `report` — NO LOOP BACK EDGE TRAVERSED. The orchestrator
correctly handles the single-workflow case as the degenerate
one-iteration loop; it does not refuse a single-workflow
goal, but it does not loop unnecessarily either.
