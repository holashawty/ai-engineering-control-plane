---
name: requirements-gathering
description: "Use at the very start of a --yarat session or when a user describes a new feature/project — gathers requirements through structured clarifying questions, writes user stories (Given/When/Then), defines MVP scope, identifies target personas, and suggests monetization angles. Distinct from project-onboarding (which discovers the TECHNICAL stack); this skill discovers the HUMAN intent. Output: user stories + MVP scope + personas → feeds into project-planning. Reads: user's verbal description. Writes: specs/requirements.md (new file). Novel to AIECP; no upstream equivalent found in docs/research.md."
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec]
---

# Requirements Gathering

## When to use this skill

At the very start of a `--yarat` (create-from-scratch) session, or any
time a user describes a new feature/project in human intent terms
("I want to build X", "users should be able to Y", "an app that does
Z") — before any technical decision is made. This skill is the
**human-intent discovery** layer; it stands *before*
`project-planning` (which converts intent into a phased plan) and
*before* `architecture-design` (which selects the technical stack).

**Distinct from `project-onboarding`** (per
`skills/project-onboarding/SKILL.md`): project-onboarding discovers
the **technical** stack of an *existing* repo (language, framework,
test runner, entrypoints) via `discovery/cli` and writes
`.aiecp/project-intelligence.json` + the initial `project` /
`environment` memory entries. That skill is for the case "the repo
already exists; tell me what it is." This skill is for the case
"the user has an idea; tell me what they actually want" — it
discovers HUMAN intent (who is the user, what do they do, what
should the system do for them, what is the MVP) and writes
`specs/requirements.md`. The two skills are complementary: for a
`--yarat` session, `requirements-gathering` runs first (what does
the user want), then `project-scaffolding` (create the repo
skeleton), then `project-onboarding` (discover what was just
created). For an existing-repo feature request, only
`requirements-gathering` runs (the repo is already discovered).

**Distinct from `specification`** (per
`skills/specification/SKILL.md`): specification provides spec
TEMPLATES per ADR-0002 (the `specs/spec.md` / `contracts.md` /
`invariants.md` family) and emits `Expected` entities with
`source_ref` pointing at spec sections. That skill is for the
moment a *behavioral contract* is being authored. This skill is
for the moment *upstream* of that: it gathers the human
requirements that the spec will eventually encode as contracts.
A spec section written without a prior `specs/requirements.md` is
a contract with no stated user — it dictates *what* the system
must do without ever having asked *for whom*.

**Distinct from `project-planning`** (per
`skills/project-planning/SKILL.md`): project-planning converts
requirements into a phased development plan with task breakdown,
dependency graph, and timeline. That skill is for *decomposition
into executable work*. This skill is for *understanding the
problem*. Planning reads `specs/requirements.md` (this skill's
output) as its primary input — a plan written without prior
requirements is a schedule for building the wrong thing.

**Distinct from `project-scaffolding`** (per
`skills/project-scaffolding/SKILL.md`): project-scaffolding creates
the directory structure and manifest files (`package.json` /
`pyproject.toml` / `Cargo.toml`), initializes git, and runs
`init-aiecp`. That skill is for *repo creation*. This skill is for
*idea elicitation*. Scaffolding without prior requirements picks a
stack before the user has said what they want; requirements-
gathering elicits the want, then scaffolding can pick a stack that
actually serves it.

## Procedure

### 1. Capture the user's idea verbatim

Record the user's description in `specs/requirements.md` under a
`## User's Idea (verbatim)` heading, quoted exactly as the user
phrased it. Do not paraphrase, correct, or silently extend — the
user's own words are the canonical statement of intent, and a
later phase may need to reconcile a refined spec against what the
user originally said. If the user said "an app to track my
plants," write exactly that, not "a plant-tracking mobile
application."

This step is the requirements-gathering analogue of
`systematic-debugging`'s "locate evidence before forming a
theory" (Phase 1): the user's words are the evidence; everything
downstream is interpretation of them. A requirements doc that
opens with the analyst's paraphrase rather than the user's
verbatim idea has already lost the single most citable artifact in
the chain.

### 2. Ask clarifying questions (within budget)

The skill's question budget is **3 questions** (see
`question_economy` below — larger than most AIECP skills because
requirements gathering is fundamentally an elicitation activity,
not a tool-driven one). The five dimensions every requirements
doc must eventually pin down:

1. **Target platform** — web / mobile (iOS, Android, cross-
   platform) / desktop / CLI / API / library / embedded. If the
   user said "app," this is genuinely ambiguous (web app vs.
   mobile app vs. both). If the user was specific ("a React web
   app"), skip.
2. **User type** — who is the primary user? Consumer / prosumer /
   internal-team / enterprise / developer / admin / child /
   accessibility-dependent. Each user type implies different
   default UX, accessibility level, and monetization.
3. **Scale** — single-user / small-team / medium-org /
   enterprise / public-internet-scale. Scale determines whether
   the architecture can be a single process or must shard, and
   whether MVP can ship without auth.
4. **Monetization model** — free / one-time-purchase /
   subscription / freemium / ads / enterprise-license / open-source-
   no-monetization / undecided. If undecided, say so explicitly
   rather than defaulting to "free" (the default shapes the MVP
   scope).
5. **Timeline** — weekend-project / sprint / quarter / multi-
   quarter / no-deadline. Timeline determines what fits in MVP
   vs. Phase 2+.

Each question must be necessary (the dimension is not derivable
from what the user already said), specific (names the dimension
and gives 2-4 concrete options, not an open-ended "tell me more"),
and decision-changing (the answer will reshape the MVP scope or
persona list). A question that does not change the requirements is
a constitution §4 violation, not a stylistic choice.

If the user's original description already pins down one or more
of these dimensions, do not re-ask — consume the budget only on
the genuinely-ambiguous dimensions. A user who said "a React web
app for plant hobbyists, free, weekend project" has answered 4 of
5 dimensions in their opening line; the skill asks at most the
scale question and proceeds.

### 3. Write user stories in Given/When/Then format

For each distinct user-facing capability the MVP must deliver,
write one user story. The format is the BDD standard (per
`skills/specification/SKILL.md`'s reference to spec-kit's
`spec.template.md`, which uses the same shape):

```
**US-<N>: <short title>**
As a <persona>,
I want <capability>,
so that <benefit>.

Given <precondition>
When <action>
Then <observable outcome>
```

Each user story is a separate `### US-N` heading in
`specs/requirements.md` — do not collapse multiple capabilities
into one story. A story that says "As a user I want to log in AND
view my dashboard AND edit my profile" is three stories, because
each will become a separate task in `project-planning`'s
`specs/tasks.md` and a separate `Expected` in `specification`'s
`specs/spec.md`. Collapsing them hides the dependency between
login and dashboard (you cannot view a dashboard without being
logged in) and forces the planner to rediscover it.

The `Given/When/Then` clauses are the testable acceptance criteria
— per `skills/README.md`'s "Ready for Development" checklist
item 3 ("Testable — all acceptance criteria use Given/When/Then").
A user story whose `Then` clause is "it works" or "the user is
happy" is untestable and therefore not a valid story; rewrite the
`Then` to name an observable system behavior ("the dashboard
displays the user's 5 most-recent items sorted by `updated_at`
descending").

### 4. Define Launch-Ready V1 scope (creation mode) or MVP scope (fix mode)

**Mode detection (per `constitution/engineering-principles.md`
"Mode-Dependent Virtues"):** the framing of this step depends on
the orchestrator's `classify-goal` outcome:

- If this is a `--yarat` / creation session (greenfield project,
  feature-request on a new codebase, orchestrator with
  `project_scale:large`) → use the **"Launch-Ready V1"** framing
  below. The term "MVP" is BANNED in creation mode because it
  triggers "minimum work" behavior in engineering culture;
  "Launch-Ready V1" triggers "complete first version" behavior.
- If this is a fix/maintenance task (bug-report, refactor,
  change-request, regression, performance-problem, incident,
  security-problem on an existing codebase) → use the traditional
  **"MVP"** framing: the three subsections below keep their
  original labels ("In scope (MVP)", "Out of scope (MVP)",
  "Phase 2+") and minimalism is the virtue.

**KEY PRINCIPLE (creation mode only):** "Launch-Ready V1" means
the product is COMPLETE enough that a user would be delighted,
not just "it works". A game without progression is not
Launch-Ready V1. An e-commerce without cart is not Launch-Ready
V1. If the `product-vision` skill found domain standards, those
standards are NON-NEGOTIABLE for Launch-Ready V1.

Under a `## Launch-Ready V1 Scope` (creation mode) or
`## MVP Scope` (fix mode) heading, write the following
subsections. The labels differ by mode:

- **Launch-Ready V1 Scope** (creation mode) / **In scope (MVP)**
  (fix mode) — the user stories from step 3 that MUST ship for
  the product to be usable by its target persona. Each story
  cites its `US-N` id. In creation mode, this is "everything
  needed for a DELIGHTFUL first release" — not the minimum that
  technically satisfies the literal request.
- **Post-Launch Enhancements** (creation mode) / **Out of scope
  (MVP)** (fix mode) — capabilities a stakeholder might *assume*
  are in scope but are explicitly NOT. Naming these prevents
  scope creep at planning time: when `project-planning`
  decomposes the work, it will not accidentally include these as
  tasks. In creation mode, these must be GENUINELY future work,
  NOT deferred core features — deferring a domain-standard
  feature here is the underwhelming-prototype failure mode (see
  below). The creation-mode "Phase 2+" subsection is MERGED into
  this one (both are "things that ship after Launch-Ready V1");
  in fix mode, "Phase 2+" remains a separate third subsection
  (see below).
- **Phase 2+** (fix mode ONLY) — capabilities deferred to a
  later phase. These are real future work, not rejections — they
  get re-prioritized when MVP ships and the team assesses what
  users actually used. In creation mode, this subsection does
  NOT exist; its content is merged into "Post-Launch
  Enhancements" above.

The scope boundary is the single most consequential decision this
skill makes. A common failure mode: a scope that includes
everything the user mentioned ("we'll just build it all") is not
a Launch-Ready V1 / MVP — it is a v1.0 with no priority ordering,
and `project-planning` cannot sequence what it cannot prioritize.
Conversely, a scope that is too narrow ("just login, nothing
else") is not a product — it is a feature demo. The test: can
the target persona achieve the benefit named in the top-priority
user story using ONLY the in-scope items? If yes, the scope is
coherent. If no, either narrow the story or widen the scope. In
creation mode, the OPPOSITE failure mode also exists: a
Launch-Ready V1 that omits domain-standard features ("the user
didn't explicitly ask for upgrades") is not a Launch-Ready V1 —
it is an underwhelming prototype. Domain standards discovered by
`product-vision` (via `recency-verification` + web search) are
non-negotiable for Launch-Ready V1; omitting them produces a
product that technically satisfies the letter of the request
while violating its spirit (per `constitution/engineering-
principles.md` "Why this matters").

### 5. Identify 1-3 user personas

Under a `## Personas` heading, write one `### Persona-N` block per
persona (at most 3). Each persona names:

- **Name** — a memorable label (not "User 1"); "Maya the
  part-time plant hobbyist" is more useful than "casual user"
  because subsequent design and UX decisions will reference the
  persona by name.
- **Goal** — what they want to achieve with the product.
- **Context** — when/where they use it (on the train, at a desk,
  in the field, once a week, hourly).
- **Skill level** — novice / intermediate / expert in the
  domain AND in software tools generally.
- **Accessibility needs** — visual / motor / cognitive /
  situational (per `skills/frontend/SKILL.md`'s WCAG discipline,
  accessibility is not a Phase-2 concern; personas name the needs
  now so `ux-design` and `frontend` can address them from the
  first wireframe).

More than 3 personas is a signal the MVP is trying to serve too
many audiences; narrow the MVP rather than enumerate personas. A
product with 5 personas has no primary user, and
`architecture-design` cannot make defensible tradeoffs (auth
model, offline support, i18n) without a primary user.

### 6. Suggest monetization angles (if applicable)

Under a `## Monetization` heading, suggest 1-3 monetization
angles IF the user's stated model (step 2, dimension 4) is not
"open-source-no-monetization" or "undecided." If the user said
"undecided," this section is REQUIRED and must list at least 2
candidate models with tradeoffs, because the model shapes the
MVP (a freemium MVP needs an account-tier boundary in auth; a
one-time-purchase MVP does not).

If the user explicitly said "free / open-source /
no-monetization," write a single line stating that and skip the
suggestions — do not push monetization onto a project that
declined it.

Each suggestion names the model and ONE structural implication
for the MVP (e.g., "subscription → MVP must include account
creation, tier boundary, and a payment-provider integration even
if the first tier is free"). Do not write a business plan; this
is requirements gathering, not a pitch deck.

### 7. Emit a Decision

Emit a `Decision` (`evidence/schema/decision.schema.json`) with:

- `what: "requirements_gathered"` — the canonical what-field for
  this skill's output. (If multiple requirements docs are produced
  in one session — e.g., a multi-feature request — append a
  suffix: `requirements_gathered:<feature-name>`.)
- `why` — one paragraph summarizing the elicitation: what the
  user asked for, what the MVP will deliver, and what was
  explicitly deferred.
- `validated: false` — the requirements are a proposal, not a
  verified outcome. They become `validated: true` only when
  downstream artifacts (`specs/plan.md`, `specs/spec.md`,
  `specs/contracts.md`) reference them and a workflow's `verify`
  state confirms the implementation honors the requirements. This
  matches the AI-output validation pattern in
  `docs/evidence-model.md`: every agent-produced artifact is a
  proposal until a `Validation` flips it.
- `result: "pending"`.
- `made_by: "agent"`.
- `evidence_refs` — pointing at any `Event`s emitted during
  elicitation (a verbatim-capture `Event` of `kind: "action"`
  recording the user's words, any clarifying-question `Event`s
  recording the user's answers). The Decision is not hollow
  per `evidence-engineering` step 2.
- `alternatives` — naming at least one rejected MVP scope
  alternative and why it was rejected (e.g., "MVP could have
  included social sharing — rejected because the primary persona
  is a solo hobbyist and sharing adds an auth-friend dependency
  that would push MVP past a weekend timeline").

The `Decision.trace_ref` MUST point at the `Trace` wrapping the
elicitation events, per `decision.schema.json`'s required
`trace_ref` field.

### 8. Write to specs/requirements.md

Write the complete requirements document to `specs/requirements.md`
at the project root (NOT inside a per-feature subdirectory —
`specs/requirements.md` is project-wide, the single source of
human-intent truth that `project-planning`,
`architecture-design`, and `ux-design` all read). If the file
already exists (a prior requirements-gathering run), APPEND a
new `## Requirements Run — <iso-date>` section rather than
overwriting — prior requirements are historical artifacts that
downstream `Expected` entities may still reference via
`source_ref`. Overwriting would dangle those references, the same
failure mode `specification`'s step 1 exists to prevent for
`specs/spec.md`.

If the `specs/` directory does not exist (a brand-new `--yarat`
project, before `project-scaffolding` has run), create it. This
is the one case where this skill writes a directory rather than
just a file — and it is correct, because `requirements-gathering`
may run BEFORE `project-scaffolding` (the user wants to know
what they're building before the scaffolder picks a stack).

## Tool integration

- **`filesystem_read`**: read prior `specs/requirements.md` if it
  exists (to append, not overwrite). Read `.aiecp/project-
  intelligence.json` if it exists (to detect whether this is an
  existing-repo feature request vs. a `--yarat` greenfield — the
  presence of the file means the repo was already onboarded, and
  the requirements should be scoped to the named feature, not the
  whole project). Read prior `Decision`/`Trace` artifacts when
  building the evidence chain for the elicitation.
- **`filesystem_write`**: write `specs/requirements.md` (creating
  `specs/` if needed). All writes are to `specs/`, never to source
  code or to `.aiecp/` (memory writes are `project-onboarding`'s
  job, not this skill's).
- **`shell_exec`**: not strictly required for elicitation, but
  declared because the skill MAY invoke a quick environment probe
  (e.g., `date -u +%Y-%m-%d` for the run-date stamp, or
  `git rev-parse --abbrev-ref HEAD` to record the branch the
  requirements were gathered on for traceability). No code is
  executed, no tests are run — this skill is conversational, not
  tool-driven, but the tool is available for the verbatim-capture
  `Event`s.

## Validation

This skill is considered successful for a given run only if:

- The user's idea was captured verbatim in
  `specs/requirements.md` under `## User's Idea (verbatim)`,
  not paraphrased.
- At least one user story was written in Given/When/Then format,
  with a testable `Then` clause (observable system behavior, not
  "it works").
- The MVP scope section has all three subsections: In scope, Out
  of scope, Phase 2+. Each in-scope item cites a `US-N` id.
- 1-3 personas were identified, each with a name (not "User N"),
  goal, context, skill level, and accessibility needs.
- The monetization section is either populated with 1-3 angles
  (if model ≠ free/oss) or explicitly notes the user declined
  monetization (if model = free/oss). "Undecided" triggers the
  ≥2-candidate-model requirement.
- A `Decision` with `what: "requirements_gathered"`,
  `validated: false`, `result: "pending"` was emitted, with
  `evidence_refs` pointing at the verbatim-capture `Event` and
  any clarifying-answer `Event`s.
- No more than 3 questions were asked across the entire run. A
  4th question is a constitution §4 violation — the skill must
  make a defensible default assumption and note it in the
  Decision's `why` rather than consume an unbounded interview.
- `specs/requirements.md` was written (or appended to) at the
  project root, not in a per-feature subdirectory.

## Examples

**Happy path (greenfield --yarat):** User opens a `--yarat`
session: "I want an app to track my houseplants — when I watered
them, when to water next, and a photo log." → Step 1 captures
the sentence verbatim. → Step 2 asks 2 questions (platform:
"web or mobile or both?" → "web for MVP, mobile Phase 2"; scale:
"just you, or shared with household?" → "just me for MVP,
household-sharing Phase 2"). Platform, user type (hobbyist),
monetization (free), and timeline (weekend) were either stated
or inferable; budget consumed = 2 of 3. → Step 3 writes 4 user
stories: US-1 (add a plant), US-2 (log a watering), US-3 (see
next-watering schedule), US-4 (view photo timeline). Each has
Given/When/Then with observable outcomes. → Step 4: MVP in-scope
= US-1..US-4; out-of-scope = social sharing, weather integration,
push notifications; Phase 2+ = mobile app, household sharing,
species auto-ID from photo. → Step 5: one persona ("Maya the
part-time plant hobbyist"). → Step 6: "free / no monetization"
noted, no suggestions. → Step 7 emits Decision with
`what: "requirements_gathered"`, `validated: false`,
`evidence_refs` pointing at the verbatim-capture Event + 2
clarifying-answer Events. → Step 8 writes `specs/requirements.md`
(creating `specs/` because this is a greenfield project). The
Decision's `trace_ref` points at the elicitation Trace.

**Existing-repo feature request:** A repo is already onboarded
(`.aiecp/project-intelligence.json` exists — a Python+FastAPI
backend with pytest). User files: "add CSV export of the items
table." → Step 1 captures verbatim. → Step 2 asks 0 questions —
the platform (existing API), user type (existing admins), scale
(existing), monetization (existing), and timeline (a sprint) are
all inferable from the existing repo. Budget consumed = 0 of 3.
→ Step 3 writes 1 user story: US-1 (export items as CSV). → Step
4: MVP in-scope = US-1; out-of-scope = PDF export, Excel format,
scheduled exports; Phase 2+ = none. → Step 5: 1 persona ("Admin
Anders"). → Step 6: existing monetization noted. → Step 7 emits
Decision. → Step 8 appends to `specs/requirements.md` under a
new `## Requirements Run — <date>` section. The skill ran
without consuming any question budget — the requirements were
fully derivable from the existing repo + the user's one-line
request.

**Failure mode (unbounded interview blocked at budget):** User
opens `--yarat`: "build me something." → Step 1 captures
verbatim. → Step 2 asks the platform question → "anything." →
Asks the user-type question → "everyone." → Asks the scale
question → "big." Budget exhausted (3 of 3). The skill does NOT
ask a 4th question about monetization or timeline; instead it
emits a Decision with `what: "requirements_gathered"`,
`validated: false`, `why` noting "the user declined to pin down
any of the 5 elicitation dimensions; MVP scope was set to a
single placeholder user story (US-1: hello-world) and the
monetization section flags 'undecided — needs human follow-up
before planning can proceed.'" The skill then transitions to a
blocked-equivalent state (returns the Decision to the caller with
a precise gap: "requirements too underspecified to feed into
project-planning; user must supply at least a target platform
and primary user type"). Without the budget cap, the skill would
have spiraled into a 6th, 7th, 8th question — the unbounded-
interview failure mode this skill's `question_economy.max_questions`
exists to prevent, mirroring `orchestrator`'s budget-of-1 rule
for the same reason.
