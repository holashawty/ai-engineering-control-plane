# Skills (Agent Skills format)

**Status: 16 skills authored — 4 MVP + 5 workflow-driven + 2 meta + 3 tool-discipline + 3 new-workflow (project-onboarding, regression, performance-problem).**

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

The remaining ~3 skills (database, frontend, backend, mobile,
security, release, incident-response — pick the most relevant to
the project's actual needs) are long-term scope (ADR-0016) and
are not started.

