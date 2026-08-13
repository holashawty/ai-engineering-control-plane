# Skills (Agent Skills format)

**Status: MVP skill set complete.**

All 4 MVP-scope skills (ADR-0016) are written as real, procedural
Agent Skills (`SKILL.md` + YAML frontmatter, per ADR-0001), not
placeholders:

- [`systematic-debugging/`](systematic-debugging/SKILL.md) — locate
  evidence, reproduce, diagnose to a validated root cause. Adapted from
  obra/superpowers (MIT, see `NOTICE`).
- [`evidence-engineering/`](evidence-engineering/SKILL.md) — how to
  correctly emit Evidence Model entities with proper reference chains.
  Novel to AIECP.
- [`behavioral-verification/`](behavioral-verification/SKILL.md) —
  operationalizes ADR-0010 ("no exception ≠ success") at the `verify`
  workflow state. Novel to AIECP.
- [`testing/`](testing/SKILL.md) — stack-native test execution
  discipline, feeding evidence into `behavioral-verification` rather
  than deciding verification itself.

Each ships with a concrete procedure, tool integration section,
validation criteria, and both a happy-path and a failure-mode example —
per the quality bar in `CONTRIBUTING.md` and
`docs/evaluations/evaluation-strategy.md`.

**Not yet verified:** these skills are unvalidated against a real agent
run — no eval scenarios exist yet (Phase 8). They are internally
consistent with `workflows/bug-report.sm.yaml` and the Phase 1 schemas
by design/cross-reference, but "reads correctly" is not the same as
"an agent following it produces the claimed behavior." See
`docs/evaluations/evaluation-strategy.md`'s core principle.

The remaining ~15 skills (database, frontend, backend, mobile,
security, performance, code-review, release, incident-response, etc.)
are long-term scope (ADR-0016) and are not started.
