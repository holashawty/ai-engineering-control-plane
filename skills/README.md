# Skills (Agent Skills format)

**Status: 20 skills authored — 4 MVP + 5 workflow-driven + 2 meta + 3 tool-discipline + 3 new-workflow (project-onboarding, regression, performance-problem) + 3 new-domain (database, frontend, backend).**

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

The remaining ~4 skills (mobile, security, release,
incident-response — pick the most relevant to the project's actual
needs) are long-term scope (ADR-0016) and are not started. The
`database` / `frontend` / `backend` skills, previously listed
here as long-term, were authored as cross-cutting domain skills
(see "Domain skills" section above).

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

