# AIECP Architecture

## Layered model

```
┌────────────────────────────────────────────────────────────────────┐
│ 7. Evaluation        framework self-tests + skill evals             │
├────────────────────────────────────────────────────────────────────┤
│ 6. Adapters           agents | stacks                                │
├────────────────────────────────────────────────────────────────────┤
│ 5. Memory              typed, validated, persistent                  │
├────────────────────────────────────────────────────────────────────┤
│ 4. Evidence Engine     incident | trace | decision | replay          │
├────────────────────────────────────────────────────────────────────┤
│ 3. Workflows           state machines + router                       │
│ 3a. Skills             progressive-disclosure (Agent Skills)         │
├────────────────────────────────────────────────────────────────────┤
│ 2. Specification       spec | plan | tasks | contracts | invariants  │
│ 2a. Context            project identity | architecture | decisions   │
├────────────────────────────────────────────────────────────────────┤
│ 1. Governance          constitution | AGENTS.md | policies           │
└────────────────────────────────────────────────────────────────────┘
```

## Invariants of the architecture

1. **Specification ⇏ Implementation ⇏ Observation ⇏ Diagnosis ⇏
   Verification** are *separate artifacts*. They never live in the same
   file. They never share a prompt section.
2. **Control plane is agent-agnostic.** Anything that requires an
   agent-native concept (tool-calling format, message structure) lives in
   `adapters/agents/<name>/`.
3. **Native entrypoints are generated, not hand-edited.** `AGENTS.md`,
   `CLAUDE.md`, `.cursor/rules/*.mdc`, `.windsurfrules`, `GEMINI.md`,
   `.github/copilot-instructions.md` are all produced from canonical
   sources via a `sync-entrypoints` step.
4. **Skills follow the Agent Skills standard.** No custom skill format.
5. **Evidence is a semantic contract, not a file format.** JSON is the
   default serialization, but the schema is the contract.
6. **Memory is typed and validated.** Free-form "summaries" are
   explicitly forbidden.
7. **Self-improvement is constitutional.** Changes to the framework
   itself are ADRs (see `DECISIONS.md`), not silent mutations.

## Data flow (single task)

```
User intent
   │
   ▼
Workflow Router ──► picks Workflow SM
   │
   ▼
Workflow SM ──► activates Skills (progressive disclosure)
   │
   ▼
Skills consume Context + Memory ──► produce actions
   │
   ▼
Actions executed via Agent Adapter (or directly in CI/local)
   │
   ▼
Observation ──► Evidence Engine (incident / trace / decision)
   │
   ▼
Behavioral Verification ──► accept | reject | retry-with-diagnosis
   │
   ▼
Memory update (validated, typed)
   │
   ▼
Report (incl. decision trace + replay reference)
```

## The five core questions, mapped

| Question | Layer | Artifact |
|---|---|---|
| What should happen? | Specification | `specs/spec.md`, `contracts.md`, `invariants.md`, `state-machines.md` |
| What is the project? | Context | `context/project-identity.md`, `architecture.md`, `constraints.md` |
| What actually happened? | Evidence | `evidence/incident.*`, `trace.*`, `decision.*` |
| What should the agent do next? | Workflows + Skills | `workflows/*.sm.yaml`, `skills/*/SKILL.md` |
| How do we know it is correct? | Behavioral Verification | `evidence/validation.*`, `evidence/replay.*`, `evidence/regression.*` |

## Separation enforcement

Each of SPEC / IMPL / OBS / DIAG / VERIFY has:
- a distinct directory root,
- a distinct schema,
- a distinct skill,
- a distinct verification step.

Mixing them in one prompt is a constitution violation and is *testable*
via the eval harness.

## Project Intelligence (ADR-0015)

A persistent, machine-readable model of "what this repository is",
produced once by Discovery and consumed by every subsequent workflow
instead of being re-derived from scratch each time. Sits conceptually
between layer 2a (Context) and layer 5 (Memory).

**Status: schema finalized** — see
`discovery/schema/project-intelligence.schema.json`. Written to
`.aiecp/project-intelligence.json` in the host repo. Carries a `stale`
flag flipped by a `discovery-refresh` trigger (detector implementation
still pending, Phase 3).
