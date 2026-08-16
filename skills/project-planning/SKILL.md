---
name: project-planning
description: "Use after requirements-gathering — converts requirements into a phased development plan with modular task breakdown, dependency graph, risk assessment, and timeline estimate. Produces a LIVING plan that gets updated after each phase (orchestrator's evaluate-result state). Distinct from specification (which provides spec TEMPLATES per ADR-0002); this skill FILLS those templates with content. Writes: specs/plan.md + specs/tasks.md. Reads: specs/requirements.md + specs/contracts.md + specs/invariants.md. Novel to AIECP; no upstream equivalent found in docs/research.md."
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec]
---

# Project Planning

## When to use this skill

After `requirements-gathering` has produced `specs/requirements.md`
and before `architecture-design` selects the technical stack. This
skill is the **decomposition** layer: it converts a set of human
requirements (user stories, MVP scope, personas) into an ordered,
phased, dependency-graphed, risk-assessed plan that subsequent
skills (`architecture-design`, `ux-design`, then the implementation
workflows `feature-request` / `change-request` / `bug-report`) can
execute against.

**Distinct from `specification`** (per
`skills/specification/SKILL.md`): specification provides spec
TEMPLATES per ADR-0002 (the `specs/spec.md` / `contracts.md` /
`invariants.md` / `state-machines.md` family) and emits `Expected`
entities with `source_ref` pointing at spec sections. That skill is
for authoring a *behavioral contract* — what the system must do.
This skill is for filling the `plan.md` and `tasks.md` templates
with *executable content* — which phases, which tasks, which file
paths, which dependencies, which risks. A spec says "the system
must support CSV export"; a plan says "Phase 2, Task 4: implement
`src/export/csv.py` depending on Task 3 (the items-query module),
complexity M, blocked-by nothing." The two artifacts are
complementary: the spec is the contract, the plan is the schedule
for honoring it. Per ADR-0002 the family is "spec evolves, plan
accrues, tasks complete" — this skill drives the *plan accrues*
and *tasks complete* halves.

**Distinct from `requirements-gathering`** (per
`skills/requirements-gathering/SKILL.md`): requirements-gathering
discovers HUMAN intent (who, what, why) and writes
`specs/requirements.md`. This skill reads that file and produces
the WORK decomposition. A plan written without prior requirements
is a schedule for building the wrong thing — this skill refuses to
proceed if `specs/requirements.md` is missing (see step 1 failure
handling).

**Distinct from `architecture-design`** (per
`skills/architecture-design/SKILL.md`): architecture-design makes
TECHNICAL decisions (stack, pattern, database schema, API
contracts, deployment topology) and writes `specs/contracts.md` +
`specs/invariants.md` + `specs/architecture.md`. This skill reads
those files (when they exist) as *constraints* on the plan — if
the architecture declares a PostgreSQL database, the plan's
data-model task must target PostgreSQL, not MongoDB. This creates
a feedback loop: planning reads architecture, but architecture
also reads planning (`architecture-design` reads
`specs/plan.md`). The orchestrator's `evaluate-result` state
detects when architectural constraints conflict with requirements
(via the `conflicts_with_requirements: true` flag on the
architecture-design Decision) and routes back to this skill via
the `plan_revision_needed` transition — this is the **LIVING
PLAN** rule (see below).

**Distinct from `project-scaffolding`** (per
`skills/project-scaffolding/SKILL.md`): scaffolding creates the
repo skeleton and manifest files. That skill runs ONCE at repo
creation. This skill runs initially to produce the plan, AND is
re-invoked (per the LIVING PLAN rule) every time a phase completes
or an architectural conflict is detected. Scaffolding is a one-
shot; planning is iterative.

## Procedure

### 1. Read specs/requirements.md (and contracts/invariants if present)

Open `specs/requirements.md`. This file is the **primary input**;
this skill cannot proceed without it. If the file is missing,
transition to a blocked-equivalent state with the precise gap
"specs/requirements.md not found — run `requirements-gathering`
first." A plan written without requirements is a schedule for the
wrong thing, exactly the failure mode the file-level contract
(file: `specs/requirements.md`, written by `requirements-gathering`,
read by `project-planning`) exists to prevent.

While reading, extract:

- The list of user stories (`US-N` ids + their Given/When/Then
  acceptance criteria) — these become tasks.
- The MVP scope (in / out / Phase 2+) — these become the phase
  boundaries.
- The personas — these inform which tasks are MVP-critical (a
  task that serves no persona is out of scope).
- The monetization model — if subscription/freemium, the auth +
  tier-boundary tasks must be in MVP, not Phase 2.

If `specs/contracts.md` and/or `specs/invariants.md` exist
(written by a prior `architecture-design` run — see the feedback
loop above), read them as **constraints**. A contract that
declares "GET /items returns 200 with JSON body" means the plan's
API task must produce that endpoint. An invariant that declares
"every persisted User has a non-null `created_at`" means the
data-model task must include that column constraint.

### 2. Decompose into phases

Under `## Phases` in `specs/plan.md`, write one `### Phase N: <name>`
section per phase. The phase sequence is conventionally:

- **Phase 0: Foundation** — repo scaffolding (if not already done
  by `project-scaffolding`), CI setup, test runner integration.
  Often trivial for a `--yarat` session where scaffolding already
  ran; substantial for an existing repo adding a major feature.
- **Phase 1: MVP** — the in-scope user stories from
  `specs/requirements.md`, in dependency order. This is the phase
  that produces a usable product for the primary persona.
- **Phase 2: v1.0** — hardening, performance, the highest-
  priority Phase-2+ items from requirements.
- **Phase 3+: v1.1, v1.2, ...** — subsequent feature phases.

Each phase names:

- **Goal** — one sentence; what does "done" mean for this phase?
- **User stories addressed** — the `US-N` ids this phase delivers.
- **Entry criteria** — what must be true to START this phase
  (Phase 1's entry criteria is "Phase 0 complete"; Phase 2's is
  "Phase 1 complete AND MVP user stories validated by
  `behavioral-verification`").
- **Exit criteria** — what must be true to END this phase
  (testable, observable — not "it's basically done").
- **Estimated effort** — S / M / L / XL (rough T-shirt sizing;
  do NOT estimate in hours, hours-estimates are false precision
  at this stage).

### 3. For each phase, list tasks with file paths, dependencies, complexity

In `specs/tasks.md`, write one `### Task N.M: <title>` block per
task (where N is the phase number, M is the task-within-phase
number — so Task 1.3 is the 3rd task of Phase 1). Each task
block contains:

- **Title** — imperative mood ("Implement items CSV export
  endpoint"), not a noun phrase ("CSV export").
- **File path(s)** — the concrete file(s) this task will create
  or modify (e.g., `src/export/csv.py`, `tests/export/test_csv.py`).
  Per `skills/README.md`'s "Ready for Development" checklist item
  1 ("Actionable — every task has a file path and specific
  action"), a task without a file path is not actionable.
- **Depends-on** — the `Task N.M` ids of tasks that MUST complete
  before this one starts (e.g., "Task 1.3 depends-on Task 1.1
  (items-query module) and Task 1.2 (auth middleware)"). This is
  the dependency graph (step 4) expressed inline.
- **Complexity** — S / M / L (T-shirt; S = <1 session, M = 1-2
  sessions, L = multi-day). Do not estimate in hours.
- **Acceptance criteria** — copied/adapted from the user story's
  Given/When/Then (so a task is "done" when its acceptance
  criteria pass `behavioral-verification`). A task without
  acceptance criteria is unverifiable.
- **Skill(s) to invoke** — which skill drives the implementation
  (e.g., `implementation` for code, `testing` for test
  scaffolding, `frontend` if the task touches UI, `database` if
  it touches the schema). This is the bridge from plan to
  workflow: a task names the skill, the orchestrator's `route`
  state selects the workflow that cites that skill.

### 4. Draw the dependency graph

Under `## Dependency Graph` in `specs/plan.md`, render the task
dependencies as an ASCII graph (or, for large plans, a DOT-graph
description in a fenced code block). The format:

```
Task 1.1 (items-query) ──┬──> Task 1.3 (CSV export)
                         └──> Task 1.4 (JSON export)
Task 1.2 (auth) ─────────────> Task 1.3 (CSV export, needs auth)
                              Task 1.5 (admin dashboard) [Phase 2]
```

The graph's purpose is to surface the **critical path** — the
longest chain of dependent tasks that determines the phase's
minimum duration. A phase whose critical path runs 6 tasks deep
cannot ship faster than 6 task-durations no matter how many
engineers are added; this is the planning analogue of Amdahl's
law. Naming the critical path explicitly lets the orchestrator's
`route` state prioritize critical-path tasks over parallelizable
ones.

If the graph has a cycle (Task A depends on Task B which depends
on Task A), that is a planning bug — transition to blocked with
the precise cycle named. Do not ship a plan with a cyclic
dependency graph; the orchestrator's loop would never terminate.

### 5. Risk assessment

Under `## Risks` in `specs/plan.md`, list 3-7 risks (fewer is
fine if the project is small; more than 7 means the plan is
under-specified and should be re-decomposed). Each risk:

- **Risk** — one sentence naming what could go wrong.
- **Likelihood** — Low / Medium / High.
- **Impact** — Low / Medium / High.
- **Mitigation** — one sentence naming the preventive action
  (a task, a spike, a contract, an invariant). If the mitigation
  is "hope it doesn't happen," that is not a mitigation —
  either add a concrete preventive task or accept the risk
  explicitly in the Decision's `alternatives`.

Common risks this skill looks for by default:

- **Auth not in MVP** but monetization is subscription → blocker;
  add auth to MVP.
- **No backup strategy** for a data-persistence app → add a
  Phase-2 backup task.
- **Single-persona assumption** but the requirements named 2+
  personas → either narrow to 1 persona or split the MVP.
- **External API dependency** (Stripe, Twilio, etc.) → the task
  that integrates it should be marked L complexity and have a
  fallback (mock / sandbox) for development.
- **Untested framework choice** → if the team has no prior
  experience with the chosen stack, add a Phase-0 spike task.

### 6. Modular structure: each module independently testable

For each module the plan introduces (a module = a directory or a
cohesive set of files), assert in the task block that the module
is **independently testable** — i.e., its tests run without
requiring other modules' runtimes. A module whose tests require
the whole app to boot is not independently testable; refactor the
task boundary until it is.

This rule exists because the orchestrator's loop iterates over
tasks, and a task whose verification requires a different task's
runtime creates a hidden cross-task dependency the dependency
graph (step 4) does not capture. The graph says "Task 1.3
depends-on Task 1.1" — meaning 1.1 must be DONE before 1.3
starts. But if Task 1.3's TESTS also require Task 1.5's runtime
(even though 1.5 is not a dependency), the test will fail
spuriously when 1.5 isn't built yet. Independent testability
makes the graph honest.

Concretely: each task's acceptance criteria must include "tests
pass in isolation (`npm test -- Task1.3` / `pytest tests/
test_csv.py`), not only as part of the full suite." If the
module cannot be tested in isolation, that is a design smell —
either decouple the module or merge the task with the one that
provides its test runtime.

### 7. Write specs/plan.md (phases) + specs/tasks.md (task list)

Write `specs/plan.md` containing: Summary, Phases (step 2),
Dependency Graph (step 4), Risks (step 5). Write `specs/tasks.md`
containing: the full task list (step 3) grouped by phase.

Both files follow the ADR-0002 family templates
(`specs/plan.template.md` and `specs/tasks.template.md`) — fill
the template's placeholders with concrete content. Do NOT modify
the templates themselves (they are spec-kit's verbatim upstream
artifacts per ADR-0018, with their own attribution HTML comment
that must be preserved). The `plan.md` and `tasks.md` you write
are project-specific instances, not template changes.

If `specs/plan.md` or `specs/tasks.md` already exists (a prior
planning run), APPEND a new `## Plan Revision — <iso-date>`
section rather than overwriting — per ADR-0002 "plan accrues."
Prior plan sections are historical artifacts that downstream
`Expected` entities may reference via `source_ref`; overwriting
would dangle them, the same failure mode `specification`'s step 1
exists to prevent. The LIVING PLAN rule (below) governs when
appending vs. amending is correct.

### 8. Emit a Decision

Emit a `Decision` (`evidence/schema/decision.schema.json`) with:

- `what: "plan_created"` — the canonical what-field for the
  initial plan. For revisions (LIVING PLAN rule), use
  `what: "plan_revised:<phase-just-completed>"`.
- `why` — one paragraph summarizing the decomposition: how many
  phases, how many tasks, the critical path length, the top 1-2
  risks.
- `validated: false` — the plan is a proposal, not a verified
  outcome. It becomes `validated: true` only when every phase's
  exit criteria are confirmed by `behavioral-verification` at
  each phase's `verify` state. This matches the AI-output
  validation pattern in `docs/evidence-model.md`.
- `result: "pending"`.
- `made_by: "agent"`.
- `evidence_refs` — pointing at (a) the `requirements_gathered`
  Decision from `requirements-gathering` (the plan exists to
  deliver those requirements), (b) any prior `plan_created` /
  `plan_revised` Decision if this is a revision, (c) the
  `architecture_designed` Decision if `architecture-design` has
  already run and its contracts/invariants constrained this
  plan.
- `alternatives` — naming at least one rejected phase-ordering
  alternative and why (e.g., "could have built auth before items-
  query — rejected because items-query is on the critical path
  for US-1 and auth is only on the path for US-3, so items-query
  first minimizes critical-path length").

The `Decision.trace_ref` MUST point at the `Trace` wrapping the
inspection events (reading `specs/requirements.md`, reading
`specs/contracts.md` / `specs/invariants.md` if present).

## LIVING PLAN rule

This skill is **re-invoked** when the orchestrator's
`evaluate-result` state detects `plan_revision_needed`. That
detection happens in two cases:

1. **Architectural conflict** — `architecture-design` emitted a
   Decision with `what: "architecture_constraint_conflict"` and
   `conflicts_with_requirements: true`. The architectural
   constraints (e.g., "PostgreSQL only, no MongoDB") conflict
   with a requirement (e.g., "must support embedded offline
   sync, which MongoDB does natively"). The orchestrator
   transitions `evaluate-result → route on: plan_revision_needed`
   → `route` selects `project-planning` → this skill re-runs,
   reads the conflict reason from the architecture-design
   Decision, and updates `specs/plan.md` to account for it (e.g.,
   add a Phase-0 spike task "evaluate offline-sync library for
   PostgreSQL" or re-scope the offline requirement to Phase 3).
2. **Phase completion** — a phase just completed
   (`goal_evaluation:not_yet_met` with the next phase's entry
   criteria now satisfiable). This skill is re-invoked to update
   `specs/plan.md` with: (a) mark the completed phase's tasks as
   done, (b) incorporate any new information from the completed
   phase (a task that revealed an unexpected dependency, a risk
   that materialized and was mitigated, a user-story that
   turned out to need splitting). This keeps the plan honest
   about what was actually learned, not just what was predicted.

**Plan revision loop limit: 3.** Per the orchestrator's
`evaluate-result` state_detail, after the 3rd
`plan_revision_needed` transition, the orchestrator transitions
to `blocked` on `plan_revision_limit_reached`. This mirrors
`systematic-debugging`'s three-failure rule (Phase 4.5 of that
skill): if three successive plan revisions have not produced a
plan that `architecture-design` can accept without conflict, the
problem is not local — it is structural (the requirements
themselves are internally contradictory, or the architectural
constraints are mutually exclusive). At that point the right
move is to step out of planning and question the requirements,
not emit a fourth revised plan. See `systematic-debugging`'s
three-failure rule for the empirical justification.

When re-invoked for revision, this skill:

- Reads the prior `specs/plan.md` and `specs/tasks.md` (the
  plan being revised).
- Reads the triggering Decision (the architecture-design
  `conflicts_with_requirements: true` Decision, OR the
  evaluate-result `goal_evaluation:not_yet_met` Decision naming
  the completed phase).
- APPENDS a `## Plan Revision — <iso-date>` section to
  `specs/plan.md` (per the "plan accrues" rule) rather than
  rewriting prior sections. The revision section names: what
  changed, why, which tasks were added/removed/re-sequenced,
  and which prior `Expected` entities are affected (their
  `source_ref`s may now point at superseded plan sections —
  emit a supersession note rather than silently dangling them).
- Emits a `Decision` with `what: "plan_revised:<reason>"`,
  `validated: false`, `evidence_refs` pointing at both the prior
  `plan_created`/`plan_revised` Decision AND the triggering
  architecture-design or evaluate-result Decision.

## Tool integration

- **`filesystem_read`**: read `specs/requirements.md` (required
  input), `specs/contracts.md` and `specs/invariants.md` (if
  architecture-design has run — they constrain the plan), prior
  `specs/plan.md` and `specs/tasks.md` (if this is a revision —
  the plan accrues), and the triggering Decision (the
  architecture-design `conflicts_with_requirements` Decision or
  the evaluate-result `goal_evaluation` Decision). Also read
  `.aiecp/project-intelligence.json` if it exists (the technical
  stack discovered by `project-onboarding` informs which tasks
  are trivial vs. complex — a Python+FastAPI repo's "add
  endpoint" task is M; a Python+no-framework repo's "add
  endpoint" task is L because it includes building the HTTP
  server).
- **`filesystem_write`**: write `specs/plan.md` and
  `specs/tasks.md`. For revisions, append the `## Plan Revision`
  section rather than overwriting. All writes are to `specs/`,
  never to source code.
- **`shell_exec`**: declared because the skill MAY invoke
  commands to inspect the repo state when planning (e.g., `git
  log --oneline -10` to see recent momentum, `ls src/` to
  understand existing module boundaries, `wc -l src/**/*.py` to
  gauge existing code size for complexity estimates). No code
  is executed, no tests are run — but the tool is available
  for the inspection that produces a defensible plan.

## Validation

This skill is considered successful for a given run only if:

- `specs/requirements.md` was read and its user stories + MVP
  scope + personas were extracted. If the file was missing, the
  skill transitioned to blocked with a precise gap rather than
  fabricating requirements.
- `specs/plan.md` contains at least one `### Phase N` section
  with goal, user stories addressed, entry/exit criteria, and
  estimated effort.
- `specs/tasks.md` contains at least one `### Task N.M` block per
  MVP user story, each with a file path, dependencies, complexity,
  and acceptance criteria. A task without a file path is not
  actionable and fails this skill's validation.
- The dependency graph in `specs/plan.md` has no cycles. A cyclic
  graph would cause the orchestrator's loop to never terminate.
- The risk assessment lists at least one risk with a concrete
  mitigation (not "hope it doesn't happen").
- Every task asserts independent testability (its tests run in
  isolation, not only as part of the full suite).
- A `Decision` with `what: "plan_created"` (initial) or
  `what: "plan_revised:<reason>"` (revision), `validated: false`,
  `result: "pending"` was emitted, with `evidence_refs` pointing
  at the `requirements_gathered` Decision and (for revisions) the
  triggering Decision.
- For revisions: no more than 3 `plan_revision_needed` loops were
  consumed. The 4th would trigger `plan_revision_limit_reached`
  in the orchestrator; this skill must not silently emit a 4th
  revised plan if the orchestrator has not yet blocked — it
  should instead emit a Decision noting the structural conflict
  and let the orchestrator transition to blocked.
- No question was asked during this skill's execution — planning
  is a decomposition activity, not an elicitation. If a genuine
  ambiguity in the requirements is discovered, the skill notes it
  in the Decision's `alternatives` and proceeds with a defensible
  default; it does NOT ask the user (the question budget belongs
  to `requirements-gathering`, not this skill).

## Examples

**Happy path (initial plan):** `requirements-gathering` produced
`specs/requirements.md` with 4 user stories (US-1 add plant, US-2
log watering, US-3 see schedule, US-4 photo timeline), MVP scope =
all 4, 1 persona (Maya), free/no-monetization, weekend timeline.
→ Step 1 reads requirements, extracts 4 stories + MVP scope. →
Step 2 decomposes into 2 phases: Phase 1 (MVP = all 4 stories),
Phase 2 (v1.0 hardening: backup, perf). → Step 3 lists 6 tasks:
1.1 (data model: Plant, WateringEvent tables), 1.2 (plant CRUD
endpoint), 1.3 (watering log endpoint), 1.4 (schedule calculation),
1.5 (photo upload + storage), 1.6 (web UI: dashboard + photo
timeline). Each has a file path (`src/models/plant.py`,
`src/routes/plants.py`, etc.), dependencies, complexity, and
acceptance criteria copied from the user stories' Given/When/Then.
→ Step 4 draws the dependency graph: 1.1 → 1.2 → 1.3 → 1.4 (the
critical path), 1.5 in parallel, 1.6 depends on 1.2+1.3+1.5. →
Step 5 lists 3 risks: photo storage cost (mitigation: Phase-0
spike on free-tier S3 alternatives), schedule-calculation
correctness (mitigation: unit-test the date math against 100
fixtures), single-persona assumption (mitigation: if a second
persona emerges in user testing, split US-3 into "basic schedule"
and "expert schedule"). → Step 6 asserts each module is
independently testable (e.g., `pytest tests/test_plant.py` runs
without booting the web server). → Step 7 writes `specs/plan.md`
+ `specs/tasks.md`. → Step 8 emits Decision with `what:
"plan_created"`, `validated: false`, `evidence_refs` pointing at
the `requirements_gathered` Decision.

**LIVING PLAN — architectural conflict revision:** Architecture-
design ran after the initial plan, selected PostgreSQL + S3 for
photo storage, but emitted a Decision with `what:
"architecture_constraint_conflict"`, `conflicts_with_requirements:
true`, `conflict_reason: "S3 free-tier requires credit card; the
'weekend + free' persona constraint from requirements.md
section #monetization conflicts with S3's billing requirement."`
The orchestrator's `evaluate-result` transitions to `route` on
`plan_revision_needed` → `route` selects `project-planning` →
this skill re-runs. Step 1 reads `specs/requirements.md` (the
'free/no-monetization' constraint) AND `specs/contracts.md` (the
S3 contract from architecture-design) AND the triggering
architecture-design Decision. Step 2-7 append a `## Plan Revision
— <date>` section: Task 1.5 (photo upload + storage) is re-
scoped from S3 to local filesystem for MVP, with a Phase-2 task
(2.3) "migrate to S3 when credit-card constraint is lifted." The
revision Decision is emitted with `what: "plan_revised:s3-billing-
conflict"`, `validated: false`, `evidence_refs` pointing at both
the prior `plan_created` Decision AND the architecture-design
`conflicts_with_requirements` Decision. The orchestrator re-
routes to `architecture-design` to confirm the local-filesystem
approach has no further conflicts.

**Failure mode (plan revision limit reached):** After 3 plan
revisions (S3 conflict → local-filesystem conflict → no viable
storage within the 'free/no-monetization' constraint → third
revision proposes deferring photos to Phase 2 entirely, but that
removes US-4 from MVP, which violates the requirements). On the
4th `plan_revision_needed`, this skill does NOT emit a 4th
revised plan. Instead it emits a Decision noting "3 plan
revisions have not produced a plan consistent with both the
requirements (US-4 in MVP, free/no-monetization) and the
architectural constraints (no credit-card-required service). The
conflict is structural: the requirements are internally
contradictory (free MVP with photo upload requires a free-tier
storage provider that does not require a credit card, which does
not exist as of <date> per recency-verification)." The orchestrator
transitions to `blocked` on `plan_revision_limit_reached`. This
mirrors `systematic-debugging`'s three-failure rule: three
rejected candidates is the empirical signal that the problem is
architectural, not local. Without the limit, the loop would
produce a 5th, 6th, 7th revised plan — the failure mode the
`plan_revision_limit_reached` transition exists to prevent.
