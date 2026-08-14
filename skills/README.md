# Skills (Agent Skills format)

**Status: 10 skills authored — 4 MVP + 6 post-MVP.**

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

The remaining ~9 skills (database, frontend, backend, mobile,
security, performance, release, incident-response, etc.) are
long-term scope (ADR-0016) and are not started.

