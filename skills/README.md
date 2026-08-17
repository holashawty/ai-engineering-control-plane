# Skills (Agent Skills format)

**Status: 38 skills authored — 4 MVP + 5 workflow-driven + 3 meta + 3 tool-discipline + 3 new-workflow (project-onboarding, regression, performance-problem) + 3 new-domain (database, frontend, backend) + 2 new-verification (visual-regression, self-healing) + 4 planning (requirements-gathering, project-planning, architecture-design, ux-design) + 3 creation-mode-enrichment (product-vision, creative-expansion, self-red-team) + 9 other (orchestrator, incident, release, security-problem, discovery-refresh, unknown-failure, user-complaint, project-scaffolding, context-engineering).**

All skills are written as real, procedural Agent Skills
(`SKILL.md` + YAML frontmatter, per ADR-0001), not placeholders.

## MVP skills (ADR-0016, original vertical slice)

- [`systematic-debugging/`](systematic-debugging/SKILL.md) — locate
  evidence, reproduce, diagnose to a validated root cause. Adapted
  from obra/superpowers (MIT, see `NOTICE`); deepened with shell-level
  evidence commands, backward call-chain tracing, condition-based
  waiting, find-polluter bisection, three-failure rule, and
  defense-in-depth.
- [`evidence-engineering/`](evidence-engineering/SKILL.md) — how to
  correctly emit Evidence Model entities with proper reference
  chains. Novel to AIECP.
- [`behavioral-verification/`](behavioral-verification/SKILL.md) —
  operationalizes ADR-0010 ("no exception ≠ success") at the `verify`
  workflow state. Novel to AIECP.
- [`testing/`](testing/SKILL.md) — stack-native test execution
  discipline, feeding evidence into `behavioral-verification`.

## Post-MVP skills (workflow-driven)

- [`code-review/`](code-review/SKILL.md) — drives the `code-review`
  workflow's `understand-change` / `assess` / `review` states.
- [`refactor/`](refactor/SKILL.md) — drives the `refactor` workflow's
  `capture-baseline` / `design-refactor` / `implement` /
  `verify-equivalence` states; emphasizes
  `Validation.method: "replay_comparison"` as the only sufficient
  method for behavior-preserving changes.
- [`specification/`](specification/SKILL.md) — operationalizes
  ADR-0002 (spec-kit's spec/plan/tasks/constitution family); used by
  the `design` / `design-change` states of `feature-request` and
  `change-request`.
- [`implementation/`](implementation/SKILL.md) — operationalizes the
  AI-output validation pattern from `docs/evidence-model.md`; every
  code change is a `Decision` with `validated: false` until `verify`
  flips it. Used by the `implement` / `migrate` states of
  `feature-request`, `change-request`, `refactor`.
- [`documentation/`](documentation/SKILL.md) — operationalizes
  `constitution/engineering-principles.md`'s "Report the decision
  trace" rule for the `document` state.

## Meta-skills (cross-cutting)

- [`behavioral-simulation/`](behavioral-simulation/SKILL.md) —
  simulates plausible end-user interaction sequences (clicks, form
  submissions, edge-case inputs, accessibility paths) against the
  changed behavior. Catches behavioral bugs that unit tests miss
  because tests assert what the author thought to check, while
  simulation explores what users actually do. Works for chat LLMs
  (mental simulation, `method: "manual_review"`) as well as
  tool-using agents (`method: "app_validation"`).
- [`diverse-thinking/`](diverse-thinking/SKILL.md) — switches the
  agent to a different thinking style (first-principles, inverse,
  analogical, systems, lateral, adversarial, constraint-relaxation)
  when stuck, breaking out of cognitive loops. Triggers after 3+
  rejected hypotheses (per `systematic-debugging`'s three-failure
  rule) or after 10+ minutes without verifiable progress.
- [`tool-use-discipline/`](tool-use-discipline/SKILL.md) — the
  mandatory-tool-per-request-class table. Operationalizes
  constitution §8 ("Tool use is mandatory, not optional"). Skipping
  a mandatory tool emits a `Decision` with
  `what: "tool_use_skipped"`, `validated: false`, `result: "rejected"`.
- [`recency-verification/`](recency-verification/SKILL.md) —
  extends constitution §7 with a three-class taxonomy (static /
  slowly-evolving / time-sensitive) for time-sensitive claims
  specifically. Honest fallback to `blocked` for chat LLMs without
  `web_search`.
- [`quality-gate/`](quality-gate/SKILL.md) — code-quality checkpoint
  between `implement` and `verify`. Runs the project's own linters
  plus a 6-item self-review checklist. `result: "mismatch"` →
  transition back to the code-changing state.

## Creation-mode enrichment skills (ADR-0037/0038)

These skills are invoked by the orchestrator's `quality-gate` state
in **creation mode** (greenfield `--yarat` projects, per
`constitution/engineering-principles.md` ADR-0037 "Mode-Dependent
Virtues"). The quality-gate is a BLOCKING gate: in creation mode it
requires evidence from THREE enrichment processes before
transitioning to `report` — without all three, `quality_gate_passed`
cannot be emitted and the run loops back to `classify-goal` with an
enriched decomposition. In fix mode (bug fixes, refactors) the
quality-gate is a pass-through and these skills skip themselves.

- [`product-vision/`](product-vision/SKILL.md) — the **Product
  Owner perspective** (ADR-0037/0038): runs AFTER
  `requirements-gathering` and BEFORE `project-planning` in
  creation mode (`--yarat`). Researches domain standards via
  web search (`recency-verification`), builds a Domain Standards
  table marking every standard feature the user didn't mention
  as a GAP ("in creation mode, domain standards are EXPECTED,
  not optional"), defines the product's Core Loop, and writes a
  Launch-Ready V1 scope (the term "MVP" is BANNED in this
  skill's output) with four subsections: must-have features,
  Wow Factor Targets (1-3 specific delights), core-loop
  completeness, post-launch enhancements. Emits
  `Decision(what: "product_vision_defined")` with evidence_refs
  to the web_search Events. Writes `specs/product-vision.md`.
  Distinct from `requirements-gathering` (captures user intent;
  this skill enriches it with market awareness). Distinct from
  `ux-design` (decides HOW the product looks; this skill
  decides WHAT the product IS). Novel to AIECP; inspired by
  BMAD-METHOD's Product Owner persona.
- [`creative-expansion/`](creative-expansion/SKILL.md) — the
  **Visual Designer + End-User Advocate perspective**: runs
  DURING/AFTER implementation in creation mode. Audits the
  implemented product across three dimensions (visual feedback,
  interaction richness, domain-specific progression/
  completeness) and emits `Decision(what:
  "creative_expansion_suggested")` with four arrays:
  `suggestions` (each with priority must-have/should-have/
  nice-to-have and a target_surface file/component path),
  `implemented` (already present, with evidence), `missing`
  (actionable asks), and `rejected` (explicitly rejected with
  documented reason — unaddressed must-haves with no
  `rejected` entry cause `quality_gate_failed`). Every
  suggestion traces to a Wow Factor Target from
  `specs/product-vision.md` OR is a domain_standard. Distinct
  from `frontend` (code-writing discipline; this skill is
  CREATIVE IDEATION). Distinct from `self-red-team` (critical
  "what's missing?"; this skill is creative "what would make
  this more delightful?"). Novel to AIECP.
- [`self-red-team/`](self-red-team/SKILL.md) — the
  **competitor/critic perspective**: the agent puts on the hat of a
  harsh critic/competitor and asks "what's missing? what would a
  competitor have that this doesn't?" Runs minimum N tours based on
  `project_scale` (small:1, medium:2, large:3+ per ADR-0027's
  SCALE_RANGES). Tour 1 (competitor) is MANDATORY web-search-backed
  per `recency-verification`; Tour 2 (critic) inspects source for
  polish/completeness/accessibility/robustness gaps; Tour 3+
  (user perspective, large only) walks the first-time user journey.
  Each tour emits `Decision(what:
  "red_team_finding:<severity>:<slug>")`; the synthesis emits
  `red_team_complete` with `verdict: "pass" | "fail"`. Critical/high
  findings → `quality_gate_failed` → back to `classify-goal` with
  the findings cited in the enriched decomposition. Distinct from
  `behavioral-simulation` (which finds *bugs* at `verify`; this
  finds *product-completeness gaps* at `quality-gate`). Novel to
  AIECP; inspired by red-team testing methodology.

## New-workflow skills (D-sprint)

- [`project-onboarding/`](project-onboarding/SKILL.md) — drives the
  `project-onboarding` workflow's `run-discovery`,
  `validate-discovery`, `write-project-memory`,
  `write-environment-memory` states. The only workflow that WRITES
  initial memory entries (all others READ existing memory).
- [`regression/`](regression/SKILL.md) — drives the `regression`
  workflow's `match-known-failure`, `identify-reintroduction`,
  `re-diagnose`, `re-fix`, `verify`, `update-known-failure` states.
  The only workflow whose `re-diagnose` `Decision.why` field MUST
  cite the prior fix's blind spot.
- [`performance-problem/`](performance-problem/SKILL.md) — drives
  the `performance-problem` workflow's `capture-baseline`,
  `profile`, `diagnose-bottleneck`, `optimize`, `verify-
  improvement`, `regression-protect` states. Cites profiler-
  commands-per-language reference (Node `--prof`, Python `cProfile`,
  Go `pprof`, Swift Instruments, Rust `cargo-flamegraph`).

## Planning skills (SDLC gap-fill)

These four skills fill the "Requirements → Planning → Architecture → UX"
gap in AIECP's SDLC coverage. They are invoked by the orchestrator's
`classify-goal` state when it detects `project_scale: large` (per
`workflows/orchestrator.sm.yaml` and `skills/orchestrator/SKILL.md`):
a `small` goal skips all four; a `medium` goal invokes only
`requirements-gathering`; a `large` goal invokes the full chain. Each
follows the established skill format (frontmatter + When-to-use +
Procedure with real evidence-schema citations + Tool integration +
Validation criteria + Examples with happy path + failure mode) and
produces Evidence Model artifacts (`Decision`/`Trace`/`Event`) that
downstream skills cite. Novel to AIECP; no upstream equivalent found
in `docs/research.md`.

**File-level contract (non-negotiable):**

| File | Who WRITES | Who READS |
|---|---|---|
| `specs/requirements.md` | requirements-gathering | product-vision, planning, arch, ux |
| `specs/product-vision.md` | product-vision | planning, ux, creative-expansion, orchestrator quality-gate |
| `specs/plan.md` | project-planning | arch, ux |
| `specs/tasks.md` | project-planning | arch, ux |
| `specs/contracts.md` | architecture-design | planning |
| `specs/invariants.md` | architecture-design | planning |
| `specs/architecture.md` | architecture-design | (new file) |
| `specs/ux/` (new dir) | ux-design | arch, frontend |

- [`requirements-gathering/`](requirements-gathering/SKILL.md) —
  the **human-intent discovery** layer. Use at the very start of
  a `--yarat` session or when a user describes a new
  feature/project. Gathers requirements through structured
  clarifying questions (budget: 3), writes user stories in
  Given/When/Then format, defines MVP scope (in/out/Phase 2+),
  identifies 1-3 personas, suggests monetization angles. Writes
  `specs/requirements.md`. Distinct from `project-onboarding`
  (which discovers the TECHNICAL stack); this skill discovers the
  HUMAN intent.
- [`project-planning/`](project-planning/SKILL.md) — the
  **decomposition** layer. Use after requirements-gathering.
  Converts requirements into a phased development plan (MVP →
  v1.0 → v1.1 → ...) with modular task breakdown, dependency
  graph, risk assessment, and timeline estimate. Produces a
  LIVING plan that gets updated after each phase (orchestrator's
  `evaluate-result` state on `plan_revision_needed`). Writes
  `specs/plan.md` + `specs/tasks.md`. Distinct from
  `specification` (which provides spec TEMPLATES per ADR-0002);
  this skill FILLS those templates with content.
- [`architecture-design/`](architecture-design/SKILL.md) — the
  **technical-decision** layer. Use after project-planning.
  Selects technology stack based on requirements and plan,
  designs system architecture (monolith/microservice/serverless),
  database schema, API contracts, and deployment topology. Can
  trigger `plan_revision_needed` if architectural constraints
  conflict with requirements (emits Decision with
  `what: "architecture_constraint_conflict"`, encoding the
  logical `conflicts_with_requirements: true` intent in the
  `what` field because `decision.schema.json`'s
  `additionalProperties: false` forbids a separate boolean).
  Writes `specs/contracts.md` + `specs/invariants.md` +
  `specs/architecture.md` (new). Distinct from `specification`
  (which writes spec TEMPLATES); this skill makes architectural
  DECISIONS.
- [`ux-design/`](ux-design/SKILL.md) — the **design-decision**
  layer. Use after architecture-design (or in parallel for
  medium-scale projects). Designs user experience: wireframes
  (text-based ASCII art — diff-able, accessible, schema-checkable),
  user flows (entry → key actions → exit per persona), journey
  maps (emotional/functional journey across the product), design
  system basics (colors with WCAG contrast ratios, typography,
  spacing, component library). Writes `specs/ux/wireframes.md` +
  `specs/ux/flows.md` + `specs/ux/design-system.md`. Distinct
  from `frontend` (which is code-writing discipline: accessibility,
  responsive); this skill is DESIGN decision-making.

The four skills form a feedback loop with the orchestrator:
`architecture-design`'s `architecture_constraint_conflict`
Decision triggers the orchestrator's `evaluate-result → route on:
plan_revision_needed` transition → `project-planning` revises
`specs/plan.md` → `architecture-design` re-runs. Maximum 3 plan
revision loops (mirrors `systematic-debugging`'s three-failure
rule, Phase 4.5); on the 4th, the orchestrator transitions to
`blocked` on `plan_revision_limit_reached` — the empirical
signal that the requirements/architecture conflict is structural,
not local.

## Domain skills (cross-cutting)

These three skills are not tied to a specific workflow — they
are cross-cutting domain skills that any workflow may cite in its
`skills_required` list when the task touches that domain. Each is
modeled on `behavioral-verification/SKILL.md`'s format (frontmatter,
When-to-use, Procedure with real evidence-schema citations, Tool
integration, Validation criteria, Examples with happy path +
failure mode) and produces Evidence Model artifacts (`Decision`/
`Expected`/`Actual`/`Validation`/`Trace`/`Event`/`Replay`) that
`behavioral-verification` then judges.

- [`database/`](database/SKILL.md) — covers database-specific
  discipline: migration safety (every migration is a `Decision`
  with `validated: false` until verified), query validation,
  index impact (before/after `EXPLAIN` as a `Trace`), connection
  pool management (validated under load, not single-request).
  Covers SQL / NoSQL / NewSQL equally — the migration mechanism
  varies, the evidence shape does not. Irreversible migrations
  require a `Replay` against a production-shaped snapshot.
- [`frontend/`](frontend/SKILL.md) — covers frontend-specific
  discipline: accessibility checks (WCAG-level `axe` violations
  are blocking, not advisory), responsive design verification
  (viewport matrix as `predicate_kind: "state_property"`), visual
  regression awareness (snapshot updates are `Decision`s, not
  rubber-stamps), component prop validation. Composes with
  `behavioral-simulation` to verify the UI renders correctly for
  all user states, not just the author's happy path. Covers
  React / Vue / Svelte / Angular / Vanilla JS equally.
- [`backend/`](backend/SKILL.md) — covers backend-specific
  discipline: API contract validation (canonical home of
  `method: "contract_validation"`), error handling patterns
  (every error path checked, not just happy path), idempotency
  checking (same request twice yields same result without
  duplicate side effects), rate-limit awareness (429 +
  `Retry-After` when limit exceeded, not 500), inter-service
  resilience (bounded timeouts, bounded retries, circuit
  breaker behavior). Covers REST / GraphQL / gRPC / async-event
  equally.

Each ships with a concrete procedure, tool integration section,
validation criteria, and both a happy-path and a failure-mode
example — per the quality bar in `CONTRIBUTING.md` and
`docs/evaluations/evaluation-strategy.md`.

**Not yet verified:** these skills are unvalidated against a real
agent run — no eval scenarios exist yet (Phase 8). They are
internally consistent with the workflow `.sm.yaml` files and the
Phase 1 schemas by design/cross-reference, but "reads correctly"
is not the same as "an agent following it produces the claimed
behavior." See `docs/evaluations/evaluation-strategy.md`'s core
principle.

Of the original long-term scope (mobile, security, release,
incident-response), 3 are now implemented: `security-problem`,
`release`, `incident`. Only `mobile` remains as genuinely future
work. The `database` / `frontend` / `backend` skills, previously
listed here as long-term, were authored as cross-cutting domain
skills (see "Domain skills" section above).

## Verification skills (patron-driven)

These two skills are not tied to a specific workflow — they
are verification-layer skills that any workflow may cite in its
`skills_required` list at the `verify` state when the change
touched visual output or test infrastructure. Each follows
`behavioral-verification/SKILL.md`'s format (frontmatter +
When-to-use + Procedure with real evidence-schema citations +
Tool integration + Validation criteria + Examples with happy
path and failure mode) and produces Evidence Model artifacts
(`Decision`/`Expected`/`Actual`/`Validation`/`Trace`/`Event`)
that `behavioral-verification` then judges.

- [`visual-regression/`](visual-regression/SKILL.md) — covers
  pixel-level visual regression: capture baseline screenshots
  before the change, capture after, compute pixel-diff, and emit
  `Actual` + `Validation` with `method: "app_validation"` only if
  the diff is below threshold. Integrates with Playwright's
  `toHaveScreenshot()` (built-in) and BackstopJS (standalone,
  MIT-licensed). Directly addresses the patron's stated pain
  point ("asset bozulmaları, visual regression") in Phaser /
  Electron / embedded-browser asset pipelines.
- [`self-healing/`](self-healing/SKILL.md) — covers selector /
  locator drift recovery: when a test fails with "element not
  found," search the rendered DOM for the closest matching
  element, update the test file with the healed selector, re-run.
  Cites the Playwright Healer pattern (75%+ success per web
  research 2026-08-15). Directly addresses the patron's stated
  pain point ("gömülü tarayıcıdan selector toplayamıyor") — the
  full solution to embedded-browser selector collection failures.

The two skills compose: a `self-healing` recovery (selector
updated) should be followed by a `visual-regression` capture to
confirm the healed selector still finds the right element visually.

## Skill Authoring Conventions

Inspired by `anthropics/skills`'s skill structure (Apache-2.0,
structural learning only — no content copied, per ADR-0018).

### Directory structure (progressive disclosure)

```
skill-name/
├── SKILL.md          (required — frontmatter + procedure)
├── reference/        (optional — long reference docs loaded on demand)
│   ├── topic-a.md
│   └── topic-b.md
└── scripts/          (optional — executable helper scripts)
    └── helper.py
```

- `SKILL.md` is always read first. Keep it under 3000 words.
- `reference/` files are loaded only when the skill's procedure
  explicitly tells the agent to read them. This prevents context
  bloat.
- `scripts/` files are black-box tools — the agent should run them
  with `--help` first, not read the source.

### Frontmatter

```yaml
---
name: skill-name
description: When to trigger + what it does. Be "pushy" — include
  specific trigger phrases and contexts so the LLM uses this skill
  when it should, not just when explicitly asked.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---
```

The `description` is the primary triggering mechanism. All "when to
use" info goes here, not in the body. Make it "pushy" — instead of
"How to debug", write "Use when encountering ANY bug, test failure,
or unexpected behavior. Use ESPECIALLY when under time pressure or
when previous fixes didn't work."

### Decision tree format

For skills with branching logic, use a decision tree format:

```
User task → Is it X?
    ├─ Yes → Do A
    │       ├─ Success → Continue
    │       └─ Fails → Try B
    └─ No → Do C
```

This is clearer than nested if/else prose.

### Cross-skill references

Skills may reference other skills by name:
`Use the `superpowers:systematic-debugging` skill for Phase 1.`
This helps the agent navigate the skill catalog.

### "Ready for Development" checklist (for `specification` skill)

Inspired by `BMAD-METHOD` (MIT, paraphrased per ADR-0018).

A specification is "Ready for Development" when it meets all 6 criteria:

1. **Actionable** — every task has a file path and specific action.
2. **Logical** — tasks ordered by dependency.
3. **Testable** — all acceptance criteria use Given/When/Then.
4. **Complete** — no placeholders or TBDs.
5. **Sufficient** — no unresolved requirement/dependency gaps.
6. **Coherent** — no internal contradictions.

**Scope standard**: target a single user-facing goal within 900-1600
tokens of spec text. Below 900 risks ambiguity; above 1600 risks
context-rot in implementation agents.

