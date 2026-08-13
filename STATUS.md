# STATUS — Read this first

**Purpose:** This file is the single source of truth for "where are we
right now." Any agent (Claude in a new session, Z.ai, a human) picking
up this project should read this file before touching anything else.
Update it at the end of every work session — check off what's done, add
what's newly discovered, never delete history (append a dated note
instead of silently rewriting).

Do not treat this file as documentation of *how* the system works —
that's `docs/`. This file only tracks *what's done and what's next*.

---

## Current phase: Phase 2 (Core) — in progress

Phase 0 (Research + Architecture) and Phase 1 (Schemas) are complete and
merged. See `docs/implementation-roadmap.md` for the full phase
breakdown and `DECISIONS.md` for all 17 ADRs governing these choices.

## Sequencing decision (2026-08-11)

The remaining work toward a working MVP vertical slice (ADR-0016) has a
dependency order. This is the order we're following, chosen for maximum
"can be tested independently before the next step needs it":

1. **Tooling language decision** — ✅ done, ADR-0017 (Node.js/TypeScript
   for CLI + sync-entrypoints + workflow executor; Python for the
   eval harness only).
2. **Governance layer content** (`constitution/`, canonical
   `agents/AGENTS.md`) — ✅ done. `constitution.md`,
   `engineering-principles.md`, `change-policy.md`, and the canonical
   `agents/AGENTS.md` entrypoint are written with real content, no
   longer placeholders. `safety-rules.md` still needs the enforceable
   prose version (currently points to `docs/security-model.md` +
   `autonomy-policy.schema.json` and is explicit about what's pending).
3. **Discovery detectors** (Python + TypeScript only, per ADR-0016) —
   ✅ done. Real, tested Node.js/TypeScript CLI at `discovery/cli/`.
   Verified against 3 scenarios (toy Python repo, toy TypeScript repo,
   toy polyglot repo) — 2 real bugs found and fixed during testing
   (duplicate entrypoints, dependencies-key collision across
   detectors). See `discovery/cli/README.md` for details.
4. **MVP skill content** (`systematic-debugging`, `evidence-engineering`,
   `behavioral-verification`, `testing` as real `SKILL.md` files) —
   🔄 next up. Textual; the workflow executor needs these to exist as
   real files to reference, not placeholders.
4. **MVP skill content** (`systematic-debugging`, `evidence-engineering`,
   `behavioral-verification`, `testing` as real `SKILL.md` files) —
   ⬜ not started. Textual; the workflow executor needs these to exist
   as real files to reference, not placeholders.
5. **Workflow executor** (Node.js/TS CLI that walks
   `workflows/bug-report.sm.yaml`, calls skills, reads/writes
   evidence + memory JSON against the Phase 1 schemas, enforces
   `question_economy` and `safety_gate`) — ⬜ not started. This is the
   biggest single piece of remaining work.
6. **End-to-end run + evidence schema validation** — ⬜ not started.
   Run the executor against a real toy repo with a seeded bug, confirm
   the full `bug-report` state machine completes, and use that run (plus
   2 more scenarios) to satisfy the "validate against 3 real bug
   scenarios" requirement in `docs/evidence-model.md` / ADR-0004.

**Why this order and not another:** governance (2) is needed before
skills/executor can cite real constitution text instead of TODOs.
Discovery (3) and skills (4) are independent of each other and of the
executor, so either could be swapped, but both must exist before the
executor (5) has anything real to call. Validation (6) can only happen
after the executor exists. If you (agent picking this up) find a
better order, that's fine — just update this section and explain why,
don't silently reorder.

## Done

- [x] Phase 0: research, architecture proposal, ADR log (16 ADRs)
      — commit `cc2d2db`
- [x] Phase 0 verification pass: live-checked upstream licenses and
      architecture claims via web search (corrected 6 factual errors,
      found `anthropics/skills` is not uniformly MIT) — commit `8589b77`
- [x] Phase 1: JSON Schemas for 8 MVP Evidence entities, 4 MVP Memory
      types, Project Intelligence schema (ADR-0015), Autonomy Policy
      schema (ADR-0014), concrete `bug-report.sm.yaml` workflow,
      fleshed-out router — commit `4c365f2`
- [x] ADR-0017: tooling language decision (Node/TS CLI, Python eval
      harness), based on live research into the AGENTS.md-sync tooling
      ecosystem (`agentsync`, `@agents-dev/cli`, `npx skills`)
- [x] Governance layer: `constitution/constitution.md`,
      `constitution/engineering-principles.md`,
      `constitution/change-policy.md`, canonical `agents/AGENTS.md`
      entrypoint — real content, not placeholders
- [x] Discovery detectors: working Python + TypeScript CLI
      (`discovery/cli/`), tested against 3 real scenarios including a
      polyglot/monorepo case, 2 bugs found and fixed during testing —
      commit `fa40bb4`

## In progress

(nothing currently in progress — next unchecked item in "Not started"
below is the next task to pick up)

## Not started (in sequence order)

- [ ] 4 MVP `SKILL.md` files (`skills/systematic-debugging/`,
      `skills/evidence-engineering/`, `skills/behavioral-verification/`,
      `skills/testing/`) — currently only `skills/README.md` and
      `skills/_shared/evidence-schema.md` placeholders exist
- [ ] Workflow executor (Node.js/TypeScript) — does not exist yet at all
- [ ] `sync-entrypoints` implementation — design only so far
      (`docs/portability.md` adapter contract), no code
- [ ] 2 stack adapters (Python, TypeScript) — `adapters/stacks/`
      placeholder only
- [ ] 2 agent adapters (Claude Code, Codex) — `adapters/agents/`
      placeholder only
- [ ] End-to-end MVP run + evidence schema validation against 3 real
      bug scenarios

## Known open questions (not blocking, but unresolved)

- Exact commit SHAs for vendored/referenced upstream repos were never
  captured (no `git clone`/`gh api` access during verification) — see
  `NOTICE`. Only matters once something is actually vendored, not yet.
- `vercel-labs/skills` license still unverified — flagged in
  `docs/research.md` and `NOTICE`, must be checked before any reuse.
- Whether `discovery-refresh` (the trigger that flips
  `project-intelligence.json`'s `stale` flag) is itself a Phase 3
  detector responsibility or a separate watcher process — not decided,
  will get decided when discovery detectors are actually built.

## How to resume this project in a new session

1. Read this file top to bottom.
2. Read `DECISIONS.md` for the "why" behind anything that looks like an
   odd choice — don't re-litigate a decision that already has an ADR
   without a new ADR superseding it (ADR-0008).
3. Pick the next unchecked item in "Sequencing decision" order unless
   you have a specific reason to deviate (and if so, write that reason
   into this file).
4. When you finish a chunk of work: check it off here, add a one-line
   note under "Done" with the commit hash, and update "In progress" /
   "Not started" accordingly, in the same commit as the work itself.
5. If you're an agent other than Claude (e.g. Z.ai) picking this up
   directly: the repo is private on GitHub
   (`holashawty/ai-engineering-control-plane`) — you'll need a
   short-lived, narrowly-scoped access token from the repo owner to
   read/write it, the same way this session did. Do not persist that
   token anywhere in the repo, commit messages, or this file.

---
*Last updated: 2026-08-11, end of Phase 1 + ADR-0017 session.*
