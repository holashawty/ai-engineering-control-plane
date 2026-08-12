# Implementation Roadmap

## Phase 0 — Research (complete)
- Upstream analysis ✓
- Architecture proposal ✓
- Risk register ✓
- License audit — **pending live re-verification** (see `NOTICE`)

## Phase 1 — Architecture (in progress)
- [x] JSON Schemas for the 8 MVP-scope Evidence Model entities
  (Incident, Trace, Event, Decision, Expected, Actual, Validation,
  Replay) — `evidence/schema/*.schema.json`. **Not yet done:**
  validating each against 3 real bug scenarios (requires the MVP slice
  to actually run once — Phase 3/4 dependency).
- [x] JSON Schemas for the 4 MVP-scope Memory types (project, decision,
  known-failure, environment) — `memory/schemas/*.schema.json`.
- [x] Workflow SM YAML for `bug-report` (concrete, not just an example)
  — `workflows/bug-report.sm.yaml` — plus a fleshed-out router table —
  `workflows/_router.md`.
- [x] **Project Intelligence** schema (ADR-0015), combined single file
  — `discovery/schema/project-intelligence.schema.json`. **Not yet
  done:** the `discovery-refresh` trigger implementation (needs
  detectors, Phase 3).
- [x] **Autonomy policy** schema (ADR-0014) — `constitution/autonomy-policy.schema.json`.
  **Not yet done:** the enforceable prose in `constitution/safety-rules.md`
  and the executor that actually reads/enforces this schema.
- [ ] **Question economy** enforcement mechanism — currently only a
  rule (`max_questions: 1`) declared inside `bug-report.sm.yaml`
  `question_economy` block; no executor enforces it yet.
- [ ] `sync-entrypoints` design (canonical → per-agent) — not started.
- [ ] Decide bootstrap language for tooling (proposed: TypeScript for
  portability + Python for the eval harness; do *not* introduce a
  runtime dependency for end users — tooling is dev-only) — not
  decided yet, blocks Phase 2 start.

## Phase 2 — Core
- `constitution/` content
- `agents/AGENTS.md` canonical entrypoint + adapters for Claude and
  Codex
- Skill loader spec (spec only; runtime is per-agent)
- Workflow SM schema + the single workflow needed for the MVP slice
  (`bug-report`)

## Phase 3 — Project Adapter (MVP-scoped)
- `discovery/` detector interface
- Detectors for **Python and TypeScript only** at MVP; remaining stacks
  (Go, Rust, Java/Kotlin, Swift, C#, C/C++, Electron) come after the
  vertical slice is proven (ADR-0016)
- High-impact question protocol (only ask what inspection cannot
  answer)

## Phase 4 — Evidence Engine (MVP-scoped)
- JSON Schemas for the **minimal entity set** needed for the slice:
  Incident, Trace, Event, Decision, Expected, Actual, Validation, Replay
  (the remaining 6 entities follow once the slice is proven)
- Example corpus (≥3 real incidents per entity)
- Evidence-emission helpers for the MVP agent adapters

## Phase 5 — Engineering Skills (MVP-scoped)
- `systematic-debugging` (adapted from superpowers)
- `behavioral-verification` (novel)
- `evidence-engineering` (novel)
- `testing`
- Each skill ships with: procedure, tool integration, validation,
  examples, failure handling — not prose alone

## Phase 6 — Memory (MVP-scoped)
- The subset of the 8 typed schemas actually exercised by the
  `bug-report` slice, plus helper skills that *propose* memory updates
  (never write directly)

## Phase 7 — Agent Adapters (MVP-scoped)
- Claude Code and Codex (`AGENTS.md`) only at MVP
- Remaining adapters (Gemini, OpenHands, Cursor, Windsurf, Copilot,
  Z.ai, OpenCode) follow once the slice is proven

## Phase 8 — Evaluation
- Skill behavior evals (≥5 scenarios per skill)
- Workflow evals (≥3 scenarios per workflow)
- Compatibility tests (per adapter)
- Regression cases (historical failures replayed)
- Question-economy eval: penalize avoidable questions

## Phase 9 — Documentation
- Installation, architecture, examples, migration guide

---

## MVP definition (ADR-0016 — supersedes the original "broad Phase 2/3/4"
## framing)

The MVP is **one working vertical slice**, not a partial implementation
of every layer:

```
existing Python or TypeScript repo
        ↓
bootstrap (install AIECP into the repo)
        ↓
discover (Project Intelligence built)
        ↓
understand (Context populated)
        ↓
user says: "login sometimes fails"
        ↓
intent classified → bug-report workflow selected (no user choice)
        ↓
locate evidence (repo inspection, not questions)
        ↓
reproduce
        ↓
diagnose (evidence chain, not source-reading guesswork)
        ↓
propose fix
        ↓
apply fix (behind a safety gate if broad-refactor)
        ↓
verify (behavioral, not just "tests pass")
        ↓
regression-protect + replay
        ↓
typed memory update (known-failure entry)
        ↓
report (includes decision trace)
```

Concretely, MVP =
- Constitution + canonical `AGENTS.md`
- Agent Skills format adopted
- 1 workflow: `bug-report`
- 4 skills: `systematic-debugging`, `behavioral-verification`,
  `evidence-engineering`, `testing`
- Minimal Evidence Model: Incident, Trace, Event, Decision, Expected,
  Actual, Validation, Replay
- 2 stack adapters: Python + TypeScript
- 2 agent adapters: Claude Code + Codex (`AGENTS.md`)
- Project Intelligence v0 (`project.yaml` + `capabilities.yaml` at
  minimum)
- Autonomy policy v0 (default level + the capability matrix from
  `docs/security-model.md`)
- 1 end-to-end eval scenario (the "login sometimes fails" demo)

**Nothing else is built until this slice runs correctly on a real
repository.** The remaining workflows, skills, stack adapters, agent
adapters, and evidence entities are long-term architecture, not MVP
scope.

## Long-term architecture

All 7 layers, 14 evidence entities, 8 memory types, 14 workflows, ~19
skills, 9 agent adapters, 11 stack adapters, full eval harness, self-tests
as first-class citizens. Built incrementally *on top of* a proven MVP
slice, not before it.
