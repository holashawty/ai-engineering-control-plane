# Evaluation Strategy

## Principle

A skill that "reads well" is not done. A skill must change agent
behavior in measurable ways.

## Three eval tiers

1. **Skill behavior evals** — given a controlled scenario, does the
   agent follow the skill's procedure and produce the expected evidence
   artifacts?
2. **Workflow evals** — given an intent, does the workflow SM reach
   `report` with verified success?
3. **Compatibility tests** — given the same project intelligence, do all
   agent adapters produce equivalent observable behavior (modulo
   capability gaps)?

## A fourth tier: question economy

Alongside correctness, every workflow eval also scores **how many
questions were asked, and whether each was necessary** (see
`docs/workflow-model.md`). A scenario that reaches `report` correctly
but asked an avoidable question is a partial failure, not a pass.

## Method

- Scenarios are fixtures: a small repo + an intent + expected evidence
  artifacts + expected memory updates + expected outcome.
- Eval runner: (a) load fixture, (b) invoke the agent via an adapter,
  (c) collect evidence artifacts, (d) compare to expected via
  schema-validated assertions, (e) score.
- Inspired by the OpenHands eval harness and SWE-bench, but scoped to
  *framework behavior*, not benchmark problems.

## Minimum bars

- Each skill: ≥5 scenarios (1 happy path, 2 edge cases, 2 failure
  modes).
- Each workflow: ≥3 scenarios.
- Each adapter: ≥1 scenario per required capability.
- Regression suite: every historical framework bug becomes a regression
  case.

## What we do *not* measure

- We do not benchmark LLM quality (that is the model vendor's job).
- We do not run SWE-bench directly (out of scope for a control-plane
  framework; integration with SWE-bench is a possible *future* adapter,
  not a Phase-8 deliverable).

## Failure handling

A failing eval blocks merge to `main`. CI runs evals on every PR.
Long-running evals run nightly.
