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
`agents/AGENTS.md`.

## One-command setup

```bash
npm run bootstrap   # installs + builds + tests all 3 sub-packages
                     # (discovery/cli, executor, adapters/agents)
                     # in one command, via npm workspaces
```

Other root scripts:

```bash
npm run build              # build all 3 packages without testing
npm test                   # run all 3 self-test suites
npm run sync-entrypoints   # regenerate root AGENTS.md/CLAUDE.md from
                            # agents/AGENTS.md + skills/*/SKILL.md
npm run e2e:membership-demo # replay the real end-to-end validation run
                            # (see executor/examples/e2e-membership-bug/)
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

## Upstream sources

This project adopts/adapts patterns and, in some cases, verbatim code
(with attribution, per ADR-0018) from the following upstream projects.
See `NOTICE` for exactly what was reused from each and under what
license. Listed here so that if this project is ever made public, a
side-by-side comparison against these sources is straightforward
rather than a surprise:

- https://github.com/obra/superpowers (MIT)
- https://github.com/github/spec-kit (MIT)
- https://github.com/bmad-code-org/BMAD-METHOD (MIT)
- https://github.com/OpenHands/OpenHands (MIT)
- https://github.com/anthropics/skills (mixed license — see `NOTICE`)
- https://github.com/agentskills/agentskills (Apache-2.0 code / CC-BY-4.0 docs)
- https://github.com/vercel-labs/skills (license unverified — see `NOTICE`)

## License

MIT (proposed). See `NOTICE` for upstream attributions.

## Security

Never commit or paste credentials (API keys, tokens, passwords) into
prompts, code, or documentation. See `SECURITY.md` for the framework's
threat model and safety-gate policy.
