# AI Engineering Control Plane (AIECP)

A portable, agent-agnostic engineering control plane that lets AI coding agents
operate with senior/principal-engineer discipline: evidence-driven, testable,
self-correcting, and context-aware — across languages, frameworks, and stacks.

## Status

**See [`STATUS.md`](STATUS.md) for the current phase, what's done, and
what's next — the single source of truth for resuming work across
sessions or handing off to another agent.**

Phase 0 (research + architecture) and Phase 1 (schemas) are complete.
Phase 2 (Core) is in progress. See `docs/implementation-roadmap.md` for
the full phase breakdown and `docs/research.md` for the verification
methodology.

**Root-level `AGENTS.md` / `CLAUDE.md`** in this repo are generated
files (per ADR-0006) — the canonical, hand-edited source is
`agents/AGENTS.md`. Regenerate after editing the canonical source or
any `skills/*/SKILL.md`:

```bash
cd adapters/agents && npm install && npm run build
node dist/bin/write-entrypoints.js <repo-root> <repo-root>
```

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
