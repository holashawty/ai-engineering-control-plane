# STATUS — Read this first

**Purpose:** This file is the single source of truth for "where are we
right now." Any agent (Claude in a new session, Z.ai, a human) picking
up this project should read this file before touching anything else.

**For the detailed, prioritized task list for the current phase
(post-MVP: real upstream integration + expanding beyond bug-report),
see [`TASKS.md`](TASKS.md).** That file also documents which tasks
Z.ai can actually execute (research, content drafting) versus which
require Claude (real repo cloning, code, schema/architecture
decisions) — Z.ai has no GitHub API/clone access, only web search.

Update this file at the end of every work session — check off what's
done, add what's newly discovered, never delete history (append a
dated note instead of silently rewriting).

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
- [x] ADR-0018: permissively-licensed upstream code (MIT/Apache/BSD)
      may be reused verbatim with attribution. Supersedes the
      paraphrase-by-default reading of `constitution.md` §6 for those
      sources specifically. `constitution.md` §6 updated with the new
      rule, `README.md` lists upstream source URLs so any future
      public-release comparison is straightforward rather than a
      surprise — commit `2b2a74e`.
- [x] A1 — `systematic-debugging` skill deepened in place: concrete
      shell-level evidence-gathering commands, multi-component boundary
      instrumentation pattern, condition-based-waiting (waitFor not
      sleep), backward call-chain tracing with stack-capture snippet,
      find-polluter bisection pattern, three-failure rule (escalate
      to architectural question after 3 rejected candidates),
      defense-in-depth paragraph (guards at every layer data passes
      through), and a third worked example. Adapted from
      `obra/superpowers@b36e0829` (MIT), re-expressed against the
      AIECP Evidence Model — see `NOTICE` for section-by-section
      attribution. Controller-approved after verbatim-copy review
      and SHA/file-existence verification. Merged to main as
      `feature/a1-systematic-debugging-deepen` (branch preserved).
- [x] B1 — `feature-request.sm.yaml` workflow authored and proven
      end-to-end. 10 states, 15 transitions, terminal states
      `report` + `blocked`, `broad-refactor` safety gate at
      `implement`, `question_economy` (max_questions: 2,
      allowed_states: [classify, design]). Proof driver
      `executor/examples/e2e-feature-request/drive-run.mjs` exercises
      every state through the real `WorkflowRun` API, emits
      schema-valid evidence at every emitting state, confirms the
      safety gate blocks un-confirmed advance out of `implement`,
      confirms question economy rejects a third question in the
      wrong state, and writes a project memory entry at `report`.
      23/23 assertions pass. Structural validator script
      `scripts/validate-feature-request.mjs` confirms the YAML is
      sound independently (no dead ends, all states reachable).
      Run via `npm run e2e:feature-request-demo` or
      `npm run validate:feature-request`. This is the second e2e
      proof point — proves the executor is workflow-agnostic (the
      same engine runs `bug-report` and `feature-request` with no
      per-workflow code).
- [x] C2 — three more workflows authored and proven end-to-end
      through the same workflow-agnostic executor (zero executor
      code changes):
      - `code-review.sm.yaml` (gatekeeping, read-only, no safety
        gate) — 30/30 assertions pass via
        `executor/examples/e2e-code-review/drive-run.mjs`.
      - `refactor.sm.yaml` (behavior-preserving, uses
        `Validation.method: "replay_comparison"` at
        `verify-equivalence`) — 28/28 assertions pass via
        `executor/examples/e2e-refactor/drive-run.mjs`.
      - `change-request.sm.yaml` (behavior-modifying, emits TWO
        `Expected` entities — OLD baseline + NEW contract) —
        28/28 assertions pass via
        `executor/examples/e2e-change-request/drive-run.mjs`.
      Together these cover the four primary shapes of engineering
      work (reactive / constructive / behavior-preserving /
      behavior-modifying) plus the orthogonal gatekeeping shape.
- [x] C2 skills — three workflow-driven skills (`code-review`,
      `refactor`, `specification`, `implementation`, `documentation`)
      authored following the existing SKILL.md format. The three
      skills `specification`, `implementation`, `documentation`
      fill the placeholder slots in `feature-request.sm.yaml`'s and
      `change-request.sm.yaml`'s `skills_required` lists.
- [x] Two meta-skills authored (cross-cutting, not tied to one
      workflow):
      - `behavioral-simulation/SKILL.md` — simulates plausible
        end-user interaction sequences against the changed
        behavior. Catches behavioral bugs that unit tests miss
        because tests assert what the author thought to check,
        while simulation explores what users actually do. Works
        for chat LLMs (`method: "manual_review"`, mental
        simulation) as well as tool-using agents
        (`method: "app_validation"`, executed simulation).
      - `diverse-thinking/SKILL.md` — switches the agent to a
        different thinking style (first-principles, inverse,
        analogical, systems, lateral, adversarial,
        constraint-relaxation) when stuck, breaking out of
        cognitive loops. Triggers after 3+ rejected hypotheses
        (per `systematic-debugging`'s three-failure rule) or
        after 10+ minutes without verifiable progress. Emits a
        `Decision` recording the style switch.
- [x] Chat LLM support — the gap that previously limited this
      framework to CLI tools with tool use (Claude Code, Codex)
      is now closed:
      - `adapters/agents/src/chat/adapter.ts` — third agent
        adapter (alongside `claude-code` and `codex`) that
        honestly declares all capabilities as `false` (chat LLMs
        have no tool use) and produces `CHAT-ENTRYPOINT.md` via
        `renderEntrypoint`. `translateObservation` is a no-op
        that throws (chat LLMs emit `Event`s directly as text,
        not via raw observations).
      - `CHAT-ENTRYPOINT.md` (repo root) — the orientation file
        a chat LLM reads first when given this repo as a zip.
        Documents the text-based evidence protocol, the minimum
        reading list, worked examples, and stuck-pattern style
        switches.
      - `scripts/validate-chat-output.mjs` — parses
        `aiecp:evidence`/`aiecp:memory`/`aiecp:advance`/`aiecp:question`
        fenced code blocks from a chat LLM's text response and
        validates each against the Phase 1 schemas. Accepts file
        path arg or stdin. Run via
        `npm run validate:chat-output path/to/response.md` or
        `cat response.md | npm run validate:chat-output`.
      - `executor/examples/e2e-chat-adapter/drive-run.mjs` —
        32/32 assertions proving the chat adapter declares
        honest capabilities, `renderEntrypoint` produces valid
        `CHAT-ENTRYPOINT.md`, `translateObservation` throws,
        the validator accepts well-formed responses (11 blocks
        of all kinds), rejects malformed blocks (5 separate
        defect classes), rejects input with no blocks at all,
        and supports stdin input. Run via
        `npm run e2e:chat-adapter-demo`.
      - Honest remaining gap: this proves the protocol +
        validator pair works; it does NOT prove a real chat LLM
        (ChatGPT, Claude chat, etc.) actually emits blocks in
        this format. That requires a live multi-turn session
        with a real chat LLM — a separate milestone, honestly
        out of scope for this proof.
- [x] `adapters/agents/src/cli.ts` self-test updated to be
      superset-aware: instead of asserting "exactly 4 skills
      discovered", it asserts "at least the 4 MVP skills
      discovered" + "all 4 MVP skill names present in the
      discovered set." This future-proofs the test against the
      growing skill catalog (now 10 skills, was 4 at MVP).

## In progress

(nothing currently in progress — next unchecked item in "Not started"
below is the next task to pick up)

## Not started (in sequence order)

- [ ] A **live**, multi-turn agent session (not a single driver script)
      actually exercising `adapters/agents/`'s `translateObservation`
      on real tool-call output from a real Claude Code or Codex
      session, one call at a time. **Now extended:** also includes a
      live multi-turn session with a real chat LLM (ChatGPT / Claude
      chat / Gemini chat / GLM chat) actually emitting `aiecp:*` blocks
      per `CHAT-ENTRYPOINT.md` and having them validated by
      `scripts/validate-chat-output.mjs`. The chat adapter + validator
      pair is structurally proven (32/32 assertions); the live session
      is the honest remaining gap.
- [ ] 2 stack adapters (Python, TypeScript) beyond what `discovery/cli/`
      already does — `adapters/stacks/` placeholder only. May turn out
      to be unnecessary now that `discovery/cli` + `skills/testing/`
      have been proven sufficient for a real Python bug-report run
      above; revisit before building this speculatively.
- [ ] Formal eval harness (Phase 8, Python, per ADR-0017) — the
      real end-to-end runs above are proof-of-concept scenarios,
      not the ≥5-scenario-per-skill / ≥3-scenario-per-workflow bar
      `docs/evaluations/evaluation-strategy.md` sets as the actual
      minimum.
- [ ] Remaining workflows (9 of 14: `user-complaint`, `regression`,
      `performance-problem`, `security-problem`, `release`,
      `incident`, `project-onboarding`, `unknown-failure`, plus any
      added since). Five of fourteen target workflows are now done
      (`bug-report`, `feature-request`, `code-review`, `refactor`,
      `change-request`) — covering the four primary shapes of
      engineering work plus gatekeeping. The remaining nine are
      long-tail (specialized domains: performance, security,
      release engineering, incident response) and lower priority
      than the eval harness and live-session tests.
- [ ] Remaining skills (~9 of ~19, per ADR-0016 long-term scope).
      10 of ~19 are now authored. The remaining ~9 are
      domain-specific (database, frontend, backend, mobile, security,
      performance, release, incident-response, etc.).
- [ ] Remaining stack adapters (9 of 11) and agent adapters (6 of 9
      — chat adapter is now the 3rd, alongside claude-code and codex).
      Long-term scope per ADR-0016.

## Known open questions (not blocking, but unresolved)

- Exact commit SHAs for vendored/referenced upstream repos were never
  captured (no `git clone`/`gh api` access during verification) — see
  `NOTICE`. A1's deepening pass did pin one SHA
  (`obra/superpowers@b36e0829`); the pattern is now established for
  future vendoring. The general open question (other repos) remains.
- `vercel-labs/skills` license still unverified — flagged in
  `docs/research.md` and `NOTICE`, must be checked before any reuse.
- Whether `discovery-refresh` (the trigger that flips
  `project-intelligence.json`'s `stale` flag) is itself a Phase 3
  detector responsibility or a separate watcher process — not decided,
  will get decided when discovery detectors are actually built.
- ADR-0018 permits verbatim reuse of permissively-licensed code, but
  no actual vendoring of code (only prose adaptation so far) has
  happened yet. When the first real vendoring happens (likely A2:
  spec-kit template adaptation, or A3: anthropics/skills structure
  inspection), the `NOTICE` "Actual adaptations" table will gain its
  first verbatim-copy row, and a small policy question will need
  answering: does verbatim-copied code live under `vendor/<repo>/`
  with upstream license header preserved, or interleaved into the
  project's own structure with attribution in `NOTICE` only? Not
  decided; not blocking until first vendoring actually occurs.

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
*Last updated: 2026-08-14, C2 sprint complete (3 more workflows + 5
more skills + chat LLM adapter + 2 meta-skills). The repo now covers
all four primary shapes of engineering work (reactive / constructive /
behavior-preserving / behavior-modifying) plus gatekeeping, all driven
by the same workflow-agnostic executor. Chat LLM support is structurally
proven — any text-in/text-out LLM can now drive the framework via the
`CHAT-ENTRYPOINT.md` protocol and `validate-chat-output.mjs`. Next
priority per TASKS.md: live multi-turn session test (CLI agent or chat
LLM), then eval harness.*
