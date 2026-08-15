---
name: unknown-failure
description: Use at the classify, gather-context, triage, and route-or-block states of workflows/unknown-failure.sm.yaml — the fallback workflow that runs when the router cannot confidently classify the user's intent into any specific workflow. The skill's job is to triage the ambiguous request into the correct target workflow (bug-report, feature-request, change-request, refactor, code-review, regression, performance-problem, project-onboarding, or the planned user-complaint / security-problem / release / incident) OR refuse safely via blocked with a precise gap. Novel to AIECP; no upstream equivalent found in docs/research.md.
license: MIT
allowed-tools: [filesystem_read, shell_exec]
---

# Unknown Failure

## When to use this skill

At the `classify`, `gather-context`, `triage`, and `route-or-block`
states of `workflows/unknown-failure.sm.yaml`. This skill is what
stands between "the router couldn't confidently classify this
request" and "the user has either been routed to the correct
specific workflow, or has been told precisely why no routing was
possible and what to do next."

This is the **fallback workflow** of the AIECP catalog. Per
`workflows/_router.md`'s classification method step 3: "If no
confident match → `unknown-failure` (fallback), never silently
guess a workflow." Every other workflow in the catalog assumes
the router has already classified the intent correctly;
`unknown-failure` is the workflow that runs when that assumption
fails. Its job is not to fix anything, change anything, or record
anything — it is purely diagnostic. The terminal `report` state
emits a `Decision` whose `what` field names the target workflow to
reroute to (e.g., `workflow_routed:bug-report`), and the terminal
`blocked` state surfaces the specific reason no routing could be
derived.

**Anti-patterns that mean: stop and return to `classify`.**

- Routing without evidence. A routing Decision whose `evidence_refs`
  is empty is a guess, not a diagnosis. The whole reason this
  workflow exists separately from a direct "pick a workflow"
  heuristic is to force the routing to be evidence-anchored —
  each candidate must be supported by at least one `event` from
  `gather-context`'s trace whose `payload.finding` directly
  corroborates the candidate.
- Asking more than two questions. The budget is 2 (one in
  `classify`, one in `gather-context`) because the router already
  failed to classify confidently from the request text alone; the
  workflow's job is to resolve the ambiguity with up to two
  targeted questions, not to conduct an unbounded interview. If
  two questions are insufficient, the correct outcome is `blocked`
  with a precise gap, not a third question.
- Routing to a workflow that has not yet been implemented. The
  routing table in `workflows/_router.md` marks some workflows
  (user-complaint, security-problem, release, incident) as
  "Planned" rather than "MVP — implemented." Routing to a planned
  workflow would produce a routing Decision the executor cannot
  act on; the `route-or-block` state must surface this as
  `no_workflow_match` with a precise gap ("the request matches
  the user-complaint shape, but `user-complaint.sm.yaml` is not
  yet implemented; the user should rephrase as `bug-report` or
  wait for user-complaint to ship") rather than emit a routing
  Decision to a non-existent workflow.
- Treating `blocked` as a failure of the workflow. `blocked` is
  the workflow working correctly when no routing can be derived
  safely — exactly the "refuse safely" mode the router spec
  names. A `blocked` outcome with a precise gap (which workflows
  were considered, why each was rejected, what the user should do
  next) is a successful `unknown-failure` run; a `workflow_routed`
  Decision with no `evidence_refs` is the actual failure mode.

## Procedure

### 1. Classify (state: `classify`)

Attempt an initial signal-shape classification. Unlike other
workflows' `classify` states (which classify the *type* of work
into one of bug / feature / refactor / etc.),
`unknown-failure`'s `classify` classifies the *signal shape* of
the ambiguous request into one of the routing-table categories
in `workflows/_router.md`:

- **Reactive** (something broken): candidate targets are
  `bug-report`, `regression` (if a `known-failure` memory entry's
  symptom matches), `user-complaint` (planned — if a third party
  filed the report), `incident` (planned — if it's a production
  alert), `security-problem` (planned — if it's a vulnerability
  report).
- **Constructive** (something to add): candidate target is
  `feature-request`.
- **Behavior-modifying** (change how X works, X not broken):
  candidate target is `change-request`.
- **Behavior-preserving** (cleanup, simplify, no behavior change
  intended): candidate target is `refactor`.
- **Gatekeeping** (review this PR / diff): candidate target is
  `code-review`.
- **Onboarding-shaped** (no prior memory): candidate target is
  `project-onboarding`. This is checked first, per the router's
  classification method step 1.
- **Cost-shaped** (slow, latency, throughput): candidate target
  is `performance-problem`.
- **Release-shaped** ("ship this", "cut a release"): candidate
  target is `release` (planned).

Emit a `Decision` recording the candidate signal shape, with
`what: "signal_shape:<reactive|constructive|behavior-modifying|
behavior-preserving|gatekeeping|onboarding-shaped|cost-shaped|
release-shaped>"`, `validated: false`, `result: "pending"`. The
`why` field should cite which signal in the request text (or the
repo's state, for onboarding-shaped) led to the candidate shape.
The `alternatives` array should name any other shape that was a
close second and why it was rejected.

May ask at most ONE necessary, specific, decision-changing
question if the signal shape cannot be determined from inspection.
The question should be the highest-leverage one available —
typically "is this about something broken, or something you want
to add?" when the request is genuinely ambiguous between reactive
and constructive intent. This is the first of the `max_questions:
2` budget.

**Failure handling:** if classification cannot determine a
candidate signal shape even after the one allowed question,
transition to `gather-context` rather than `blocked` — the
context-gathering state may surface signals that resolve the
shape (e.g., a recent commit that reveals the request is about a
regression). Only if `gather-context` also fails to surface
clarifying signals should the workflow fall through to `blocked`
via `context_insufficient` or, if the second question is also
insufficient, via `intent_ambiguous_after_two_questions`.

### 2. Gather context (state: `gather-context`)

Gather corroborating context from the repo and prior memory that
would disambiguate the candidate signal shapes from `classify`.
The structural distinction from `bug-report`'s `locate-evidence`
is **exploration vs. confirmation**: `bug-report`'s
`locate-evidence` assumes a defect exists and looks for evidence
of it; `gather-context` here treats the request as an ambiguous
signal to be resolved by *any* corroborating context — a recent
commit, a log line, a prior `known-failure` entry, an existing
test failure — that tips the routing toward a specific target.

Emit:

1. A `Trace` (`evidence/schema/trace.schema.json`) covering the
   exploration, with `source: "agent_adapter"` and an
   `event_refs` array that will be populated by the events below.
2. For each piece of context found, an `Event`
   (`evidence/schema/event.schema.json`) with `kind:
   "observation"`, `source` naming the inspection command, and
   `payload.finding` describing what was found. Append each
   event's id to the trace's `event_refs`.

**Concrete context-gathering commands.** The exact set depends on
the candidate signal shape from `classify`, but the standard
arsenal is:

```bash
# Always: recent commits may reveal the request's actual subject
git log --oneline -10

# If reactive candidate: look for prior known-failures whose
# symptom matches the report
ls .aiecp/memory/known-failure/ 2>/dev/null || echo "(no known-failure memory yet)"

# If onboarding-shaped candidate: check whether Project
# Intelligence exists at all
ls .aiecp/project-intelligence.json 2>/dev/null || echo "(no project-intelligence.json — route to project-onboarding)"

# If constructive / behavior-modifying / behavior-preserving
# candidate: search the codebase for the surface the request names
rg -n '<keyword-from-request>' --type=ts --type=py 2>/dev/null || \
  grep -rn '<keyword-from-request>' --include='*.ts' --include='*.py' .

# If cost-shaped candidate: look for recent perf-related changes
git log --oneline --since='1 week ago' -- '**/perf*' '**/benchmark*'
```

Each command's stdout becomes its own `Event.payload.finding` —
verbatim, not paraphrased.

May ask at most ONE necessary, specific, decision-changing
question if the gathered context is still ambiguous between two
candidate workflows — typically "is this about a regression of a
previously-fixed bug, or a new symptom that looks similar?" when
both `bug-report` and `regression` are plausible candidates.
This is the second of the `max_questions: 2` budget; the budget
is now exhausted.

**Failure handling:** if no corroborating context can be located
even after the second allowed question, transition to `blocked`
with `context_insufficient` and a precise gap statement naming
which workflows could not be disambiguated and what information
would have resolved them. Do NOT proceed to `triage` against an
empty context — a triage built on no evidence is a guess.

### 3. Triage (state: `triage`)

Weigh the gathered context against the routing table to produce
a candidate routing target. This is the analytical step where the
exploratory `event`s from `gather-context` are matched against
the routing-table intent signals in `workflows/_router.md`.

Emit a `Decision` recording the candidate routing target, with
`what: "routing_candidate:<workflow-name>"` (e.g.,
`routing_candidate:bug-report`), `validated: false`, `result:
"pending"`. The `why` field should cite the specific `event`s
from `gather-context`'s trace whose `payload.finding` directly
supports the candidate. The `evidence_refs` array should point
at those event ids — a triage Decision with no `evidence_refs` is
a hollow candidate, exactly the failure mode this workflow
exists to prevent.

If multiple candidates are equally plausible, the `Decision`'s
`alternatives` array should name each rejected candidate and why
it was rejected — the `route-or-block` state will then either
pick the strongest candidate (the one with the most direct
corroboration) or fall through to `blocked`.

**The back-edge to `gather-context`.** If triage determines the
gathered context is genuinely insufficient to weigh (e.g., the
request names no surface the codebase owns, or the signal shape
conflicts across `event`s), transition back to `gather-context`
with `context_insufficient_after_triage` rather than forcing a
candidate through. This back-edge is bounded by the question
budget: the workflow cannot loop forever because each pass
through `gather-context` either consumes the budget (already at
2 after the first pass) or transitions to `blocked`. If the
budget is already exhausted and triage still cannot weigh,
proceed to `route-or-block` with the best available candidate
(or no candidate) — the `route-or-block` state will then
correctly fall through to `blocked`.

### 4. Route-or-block (state: `route-or-block`)

Either confirm the candidate routing target OR refuse safely.
This is the workflow's primary output state.

**Confirmation path.** If the candidate from `triage` has at
least one corroborating `event` from `gather-context` whose
`payload.finding` directly supports the routing (the
confirmation threshold), emit a final `Decision` with:

- `what: "workflow_routed:<workflow-name>"` (e.g.,
  `workflow_routed:bug-report`)
- `validated: true`, `result: "accepted"`
- `evidence_refs` pointing at the `triage` Decision id AND the
  corroborating `event` id(s) from `gather-context`
- `why` summarizing the chain: "request signal shape X (from
  `classify` Decision Y), corroborated by `gather-context`
  event Z (finding: ...), matches the routing-table intent
  signal for `<workflow-name>` per `workflows/_router.md`"

Then transition to `report` on `workflow_routed`.

**Block path.** If the candidate from `triage` has no
corroborating event, OR no candidate survived triage, OR the
candidate target is a "Planned" workflow not yet implemented
(per `workflows/_router.md`'s Status column), transition to
`blocked` with `no_workflow_match` and a precise gap
statement. The gap statement should name:

1. Which workflows were considered (cite the `triage` Decision
   and any rejected `alternatives`).
2. Why each was rejected (no corroborating event, or the
   candidate target is "Planned" and not yet runnable).
3. What information would have routed the request successfully
   (a more specific keyword, a reproduction step, a version, a
   surface name).
4. What the user should do next (rephrase, supply more context,
   or manually invoke a specific workflow if they have a
   strong prior on which one applies).

A `blocked` outcome with these four clauses is a successful
`unknown-failure` run — the workflow refused safely, which is
exactly the router spec's requirement for the fallback case.

**The confirmation threshold is non-negotiable.** A candidate
with no corroborating event is not a route, it is a guess — and
guessing is exactly the failure mode the `unknown-failure`
workflow exists to prevent. If the threshold is not met, the
correct outcome is `blocked`, not a `workflow_routed` Decision
with empty `evidence_refs`. Per `evidence-engineering` step 2,
hollow evidence is the same hazard across every workflow in the
catalog; `route-or-block` is where that hazard would most
temptingly be cut, because the temptation is high to "just route
to the most likely workflow and let it sort out the ambiguity."
That temptation is what makes the threshold non-negotiable:
the routed-to workflow's `intake` state assumes the router has
already classified the intent, and routing an ambiguous request
to a specific workflow exports the ambiguity rather than
resolving it.

## Tool integration

- **`filesystem_read`**: read the user's request (if filed as a
  file, e.g., a `BUGS/` entry, an issue template, a
  `TODO.md` line); read the repo's `.aiecp/memory/known-failure/`
  directory to look for prior symptoms matching the request; read
  the repo's `.aiecp/project-intelligence.json` to determine
  whether the onboarding-shaped candidate applies; read prior
  `Trace`/`Event` artifacts when building the evidence chain.
  Per `tool-use-discipline` and constitution §8, no routing
  decision is asserted from memory — every signal must be
  inspected, not recalled.
- **`shell_exec`**: run context-gathering commands (`git log`,
  `git diff`, `rg`, `grep`, `ls`, language-appropriate
  test/build commands) whose output becomes `Event.payload.finding`
  verbatim — never paraphrased. The routing Decision's
  `evidence_refs` will point at these events, so the events
  must capture the command output exactly.
- (`filesystem_write` is NOT required and NOT declared — this
  workflow writes nothing. The `report` state's `writes_memory:
  []` declaration makes this structural; the workflow is
  purely diagnostic. This is also why no safety gate is
  declared — there is no source mutation to gate.)
- (`test_runner` is NOT required — running the project's test
  suite is `bug-report`'s `reproduce` state's job, not
  `unknown-failure`'s. If the request mentions a test failure,
  the workflow routes to `bug-report`, which then runs the
  suite; `unknown-failure` itself only gathers signals, it
  does not reproduce them.)

## Validation (of this skill itself)

A `classify` / `gather-context` / `triage` / `route-or-block`
step using this skill is done correctly only if:

- The `classify` `Decision.what` field uses the
  `signal_shape:<shape>` form (NOT a workflow name — classify
  produces a signal shape, not a routing target; the routing
  target is produced by `triage` and confirmed by `route-or-block`).
- The `gather-context` state emitted at least one `Event` of
  `kind: "observation"` per context-gathering command that ran
  (per `tool-use-discipline`, no signal is asserted from
  memory — every signal that informs the routing must be
  captured as an event whose `payload.finding` quotes the
  command output verbatim, not paraphrased).
- The `gather-context` `Trace.event_refs` array is non-empty —
  a `gather-context` state that ran no commands produced no
  context to weigh, and `triage` against an empty trace is a
  guess.
- The `triage` `Decision.what` field uses the
  `routing_candidate:<workflow-name>` form (NOT a final
  routing Decision — that is `route-or-block`'s job; `triage`
  produces a candidate, `route-or-block` confirms it).
- The `triage` `Decision.evidence_refs` array points at
  concrete `event`s from `gather-context`'s trace. A triage
  Decision with no `evidence_refs` is a hollow candidate, the
  same hollow-evidence failure mode `evidence-engineering`
  step 2 exists to prevent across all workflows.
- If the workflow terminates in `report`, the `route-or-block`
  state emitted a final `Decision` with `what:
  "workflow_routed:<workflow-name>"`, `validated: true`,
  `result: "accepted"`, AND `evidence_refs` containing both the
  `triage` Decision id AND at least one corroborating `event`
  id from `gather-context`. A `workflow_routed` Decision with
  no corroborating `event` in `evidence_refs` is a hollow
  routing — the confirmation threshold was not met.
- If the workflow terminates in `blocked`, the blocked
  transition's gap statement names (a) which workflows were
  considered, (b) why each was rejected, (c) what information
  would have routed the request successfully, (d) what the user
  should do next. A blocked outcome with a vague "could not
  route" gap is a process violation of this skill — the
  workflow exists to refuse safely with a precise gap, not
  to refuse vaguely.
- No question was asked during `intake`, `triage`, or
  `route-or-block` — these states are not in
  `unknown-failure.sm.yaml`'s `question_economy.allowed_states`
  (only `classify` and `gather-context` are). Asking a question
  here is a constitution violation, not a stylistic choice (per
  `constitution/constitution.md` §4).
- No more than 2 questions were asked across the entire run
  (one in `classify`, one in `gather-context`). A third question
  is `question-economy-exceeded` — the workflow must `blocked`
  rather than consume an unbounded interview.

## Examples

**Happy path (routed to bug-report):** User reports "something
weird is happening with the membership service — I think members
are seeing weird expiry dates, but it might also be a UI display
issue, I'm not sure." The router cannot confidently classify
this: it mentions a possible bug (`bug-report` candidate), a
possible UI display issue (no workflow directly targets UI
display bugs as distinct from any other bug), and uncertainty
that might warrant a clarifying question. Routes to
`unknown-failure`. → `classify` reads the request, sees the
word "weird" appears twice and "members" suggests a domain
entity; signal shape is *reactive* (something is wrong), but
the surface is unclear (membership backend? UI display?).
Asks the one allowed question: "is this about the membership
*expiry calculation* (backend), or about how the expiry *is
displayed in the UI* (frontend)?" → user answers "the
calculation — members are seeing wrong dates." → `gather-context`
runs `git log --oneline -10` (finds a recent commit touching
`src/membership.py`), runs `rg -n 'expiry' --include='*.py' .`
(finds the `is_active` function and a docstring about the
expiry boundary), runs `ls .aiecp/memory/known-failure/`
(finds a prior `mem-known-failure-membership-expiry-boundary`
entry whose symptom is "members report membership expiring one
day early" — matching the current request closely). Emits one
`event` per command, wrapped in a `Trace`. No second question
needed — the prior known-failure match is a strong signal.
→ `triage` emits a `Decision` with `what:
"routing_candidate:regression"` (the prior known-failure
match makes `regression` the strongest candidate; `bug-report`
is the close alternative, named in `alternatives` and
rejected because the prior known-failure's symptom matches
the current report verbatim). `evidence_refs` points at the
`gather-context` event for the `ls .aiecp/memory/known-failure/`
command. → `route-or-block` confirms the candidate: the prior
known-failure match is direct corroboration. Emits a final
`Decision` with `what: "workflow_routed:regression"`,
`validated: true`, `result: "accepted"`, `evidence_refs`
containing both the `triage` Decision id and the corroborating
`event` id. Transitions to `report`. → `report` summarizes
the chain: original ambiguous request, signal-shape
classification (reactive, scoped to backend via the classify
question), corroborating context (recent commit + prior
known-failure match), confirmed route (`regression`). Writes
no memory — `regression`'s own `report` state will write
whatever memory is appropriate. The user reruns the request
as `regression`, which reads the prior known-failure and
proceeds with prior context.

**Failure mode (blocked with precise gap):** User reports
"the system feels off." The router has no signal to
classify confidently — there is no surface named, no error
mentioned, no specific behavior described. Routes to
`unknown-failure`. → `classify` reads the request, cannot
determine a signal shape even with inspection (the request
names no surface, no error, no behavior). Asks the one
allowed question: "is this about something broken, or
something you want to add?" → user answers "broken, I think,
but I'm not sure where." → `gather-context` runs `git log
--oneline -10` (recent commits are routine dependency bumps,
no obvious culprit), runs `ls .aiecp/memory/known-failure/`
(no prior known-failures match — none exist), runs `rg -n
'broken\|bug\|wrong' .` (no obvious matches in source code
comments). Emits one `event` per command, all reporting
negative findings. Asks the second allowed question: "can you
name a specific surface, action, or error message where you
noticed the system feeling off?" → user answers "no, it's
just a general sense." → `triage` cannot produce a
candidate routing target — there is no corroborating event
to support any candidate. Emits a `Decision` with `what:
"routing_candidate:none"`, `validated: false`, `result:
"pending"`, `evidence_refs: []`, `alternatives` naming every
candidate considered (bug-report, regression, performance-
problem) and why each was rejected (no specific symptom to
triage). → `route-or-block` cannot confirm any candidate —
the confirmation threshold (at least one corroborating event)
is not met for any workflow. Transitions to `blocked` with
`no_workflow_match` and a precise gap statement: "the
request 'the system feels off' was considered against the
following workflows: `bug-report` (rejected — no specific
broken behavior named), `regression` (rejected — no prior
known-failure matches a 'feels off' symptom), `performance-
problem` (rejected — no latency/throughput signal cited).
To route this successfully, the request would need at least
one of: (a) a specific surface (endpoint, UI route, CLI
command), (b) a specific behavior (error message, wrong
result, slow response), (c) a specific reproduction step
(URL + action + observed + expected). The user should
rephrase with at least one of these, or manually invoke
`bug-report` if they have a strong prior that the system
is misbehaving in a way they cannot yet describe." The
blocked report is actionable — the user can see exactly
what was missing and what to supply next.
