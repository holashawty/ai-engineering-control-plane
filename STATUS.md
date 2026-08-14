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

## Current phase: Phase 2 (Core) — MVP vertical slice complete, entering Phase 3+ scope

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
- [x] 4 MVP `SKILL.md` files (`systematic-debugging`,
      `evidence-engineering`, `behavioral-verification`, `testing`) —
      real procedures cross-referencing the actual Phase 1 schemas and
      `bug-report.sm.yaml` states, each with tool integration,
      validation criteria, and happy-path + failure-mode examples.
      `systematic-debugging`'s adaptation from obra/superpowers is
      recorded in `NOTICE`.
- [x] Workflow executor (`executor/`) — real, tested Node.js/TypeScript
      engine: state machine, question-economy enforcement, safety-gate
      enforcement against an autonomy policy, and an evidence/memory
      store that validates every write against the actual Phase 1
      schemas. Self-test drives a full scripted `bug-report` run
      end-to-end (emits a real instance of all 8 evidence entities + 1
      memory type, all schema-valid) plus 3 negative-test scenarios
      (question limit, wrong-state question, safety-gate-without-
      confirmation, invalid transition, invalid evidence). 20/20
      assertions pass. 2 real bugs found and fixed while building this
      (missing `ajv-formats` wiring; a test fixture missing a required
      field) — see `executor/README.md`.
- [x] Agent adapters (`adapters/agents/`) — Claude Code and Codex
      adapters implementing `docs/portability.md`'s contract
      (`capabilities()`, `renderEntrypoint()`, `translateObservation()`),
      plus `sync-entrypoints.ts` (ADR-0006). 19/19 self-test assertions
      pass: canonical-source loading, render idempotency (byte-
      identical output on repeat runs — the actual ADR-0006
      requirement, not just "it ran twice without crashing"), genuinely
      distinct declared capabilities per adapter, and schema-valid
      `Event` output from `translateObservation` with secret
      redaction confirmed. One real inconsistency found and fixed: the
      canonical `agents/AGENTS.md` still claimed `sync-entrypoints` was
      "not yet implemented" after this package made that false — caught
      by reading the generated output directly, not just trusting
      assertions. See `adapters/agents/README.md`.
- [x] Disk-writing CLI wrapper (`adapters/agents/src/bin/write-
      entrypoints.ts`) — actually run against this repo, confirmed it
      writes real `CLAUDE.md` + `AGENTS.md` files to a target
      directory.
- [x] **The final MVP milestone: a real (non-scripted) end-to-end run**
      — `executor/examples/e2e-membership-bug/`. A real toy Python repo
      was built with a genuine off-by-one bug (membership expiry
      boundary check using `<` instead of `<=`, contradicting its own
      docstring). The bug was diagnosed for real: `discovery/cli` ran
      against it for real, `grep` located the implicated code for
      real, the *existing* test suite was run and observed passing
      2/2 (the actual ADR-0010 trap — technically green, behaviorally
      wrong), a new boundary-case test was written and run for real
      and failed for real, the root cause was read from the real
      source line, the fix was applied for real
      (`today < expiry_date` → `today <= expiry_date`), and
      verification reran the real suite (3/3 passed) plus a real
      direct behavioral check. All of that real captured output (not
      invented) was then fed into the real `WorkflowRun` API via
      `drive-run.mjs`, reaching the `report` terminal state with 0
      questions asked and the safety gate genuinely blocking an
      unconfirmed `propose-fix -> apply-fix` attempt before allowing
      the confirmed one. Full transcript in
      `executor/examples/e2e-membership-bug/README.md`.
      **Honest scope note:** this proves the discovery → evidence →
      executor → schema chain holds together against a genuine bug,
      but it is one driver script assembling real captured data, not a
      live multi-turn agent session issuing one tool call per turn
      through an actual agent adapter. That remains open — see below.

## In progress

(nothing currently in progress — next unchecked item in "Not started"
below is the next task to pick up)

## Not started (in sequence order)

- [ ] A **live**, multi-turn agent session (not a single driver script)
      actually exercising `adapters/agents/`'s `translateObservation`
      on real tool-call output from a real Claude Code or Codex
      session, one call at a time, rather than a script assembling
      captured data after the fact. This is the honest remaining gap
      after the milestone above.
- [ ] 2 stack adapters (Python, TypeScript) beyond what `discovery/cli/`
      already does — `adapters/stacks/` placeholder only. May turn out
      to be unnecessary now that `discovery/cli` + `skills/testing/`
      have been proven sufficient for a real Python bug-report run
      above; revisit before building this speculatively.
- [ ] Formal eval harness (Phase 8, Python, per ADR-0017) — the
      real end-to-end run above is a single proof-of-concept scenario,
      not the ≥5-scenario-per-skill / ≥3-scenario-per-workflow bar
      `docs/evaluations/evaluation-strategy.md` sets as the actual
      minimum.
- [ ] Remaining workflows (13 of 14), remaining skills (~15 of ~19),
      remaining stack adapters (9 of 11), remaining agent adapters (7
      of 9) — all explicitly long-term scope per ADR-0016, not MVP.

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
*Last updated: 2026-08-14, end of real end-to-end MVP validation session
(discovery + skills + executor + agent adapters + a genuine, non-
scripted bug-report run all complete and proven to work together).*
