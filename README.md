# AI Engineering Control Plane (AIECP)

A portable, agent-agnostic engineering control plane that lets AI coding agents
operate with senior/principal-engineer discipline: evidence-driven, testable,
self-correcting, and context-aware — across languages, frameworks, and stacks.

## Status

Phase 0 (research + architecture) — proposal stage. See `docs/implementation-roadmap.md`.

This is not yet an implementation. It is a research and architecture proposal
that must be approved before Phase 2 (Core) begins. See `docs/research.md` for
methodology notes and required live-verification steps.

## What this is *not*

- Not a prompt collection.
- Not an agent runtime.
- Not a benchmark.
- Not tied to one LLM.

## What this is

A control plane: governance + context + specification + skills + workflows +
evidence + memory + adapters + evaluation.

## Five questions the framework answers

1. What should happen? → Specification
2. What is the project? → Context
3. What actually happened? → Evidence
4. What should the agent do next? → Workflows + Skills
5. How do we know it is correct? → Behavioral Verification

## Quick links

- Research: `docs/research.md`
- Competitive analysis: `docs/competitive-analysis.md`
- Architecture: `docs/architecture.md`
- Decisions: `DECISIONS.md`
- Roadmap: `docs/implementation-roadmap.md`
- Evidence model: `docs/evidence-model.md`
- Memory model: `docs/memory-model.md`
- Workflow model: `docs/workflow-model.md`
- Portability: `docs/portability.md`
- Security: `docs/security-model.md`
- Evaluation: `docs/evaluations/evaluation-strategy.md`

## License

MIT (proposed). See `NOTICE` for upstream attributions.

## Security

Never commit or paste credentials (API keys, tokens, passwords) into
prompts, code, or documentation. See `SECURITY.md` for the framework's
threat model and safety-gate policy.
