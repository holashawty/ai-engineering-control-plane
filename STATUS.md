# STATUS — Read this first

**Purpose:** This file is the single source of truth for "where are we
right now." Any agent (Claude in a new session, Z.ai, a human) picking
up this project should read this file before touching anything else.

**For the detailed, prioritized task list for the current phase
(post-MVP: real upstream integration + expanding beyond bug-report),
see [`TASKS.md`](docs/archive/sprint-logs/TASKS.md).** That file also documents which tasks
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
merged. See `docs/archive/implementation-roadmap.md` for the full phase
breakdown and `DECISIONS.md` for all 29 ADRs governing these choices.

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
   ✅ done. (See Done section: "4 MVP `SKILL.md` files … real procedures
   cross-referencing the actual Phase 1 schemas …".) Catalog has since
   grown to 35 skills.
5. **Workflow executor** (Node.js/TS CLI that walks
   `workflows/bug-report.sm.yaml`, calls skills, reads/writes
   evidence + memory JSON against the Phase 1 schemas, enforces
   `question_economy` and `safety_gate`) — ✅ done. Real, tested
   Node.js/TypeScript engine with 20/20 self-test assertions; see
   Done section.
6. **End-to-end run + evidence schema validation** — ✅ done. The
   `e2e-membership-bug` driver (and 18 subsequent drivers) prove the
   full state-machine completion + evidence schema validation
   end-to-end.

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
      growing skill catalog (now 35 skills, was 4 at MVP).
- [x] C3 sprint — ADR-0019 + constitution §8 ("Tool use is
      mandatory, not optional") + 3 tool-use discipline skills
      authored. The user's vision explicitly named "tool
      kullanımını üst düzeye çıkartmak" as a core goal; this
      sprint makes it constitution-level, not just skill-level:
      - **ADR-0019** added to `DECISIONS.md`: an agent's own
        parametric knowledge is a hypothesis to be verified, never
        ground truth. Skipping a mandatory tool (per
        `skills/tool-use-discipline/SKILL.md`'s request-class
        table) emits a `Decision` with `what: "tool_use_skipped"`,
        `validated: false`, `result: "rejected"`.
      - **Constitution §8** added to `constitution/constitution.md`:
        the governance-layer rule, citing ADR-0019 and the three
        operational skills.
      - **3 skills** authored (subagent C3-A, opus):
        `tool-use-discipline`, `recency-verification`, `quality-gate`.
      - **CHAT-ENTRYPOINT.md** rewritten with aggressive tool-use
        manifesto + zip-upload protocol.
      - **5 workflow .sm.yaml files** updated to cite the 3 new
        skills in `skills_required`.
      - **AGENTS.md + CLAUDE.md** regenerated — 13 skills listed.
- [x] D-sprint — 3 more workflows + skills authored and proven
      end-to-end (subagents D1/D2/D3, opus, in parallel):
      - **project-onboarding** (entry point for any new repo;
        runs `discovery/cli`, writes initial `project` +
        `environment` memory entries; no safety gate — writes only
        to `.aiecp/`, never source code) — 36/36 assertions via
        `executor/examples/e2e-project-onboarding/drive-run.mjs`.
      - **regression** (prior-context-aware; `re-diagnose`
        `Decision.why` MUST cite the prior fix's blind spot;
        `update-known-failure` UPDATES an existing memory entry,
        setting `regression_id` from null to a new id) — 43/43
        assertions via `executor/examples/e2e-regression/drive-
        run.mjs`.
      - **performance-problem** (cost-shaped; requires
        `environment_fingerprint_ref` at baseline; `verify-
        improvement` requires BOTH perf check AND functional
        regression check; writes a `known-failure` memory entry
        for a PERFORMANCE regression) — 41/41 assertions via
        `executor/examples/e2e-performance-problem/drive-run.mjs`.
      Together with the prior 5, the framework now has **8
      runnable workflows** covering reactive / constructive /
      behavior-preserving / behavior-modifying / gatekeeping /
      onboarding / regression / performance shapes — all driven
      by the same workflow-agnostic executor. Catalog now 16
      skills.
- [x] A2 (spec-kit template vendoring) — 5 spec-kit templates
      copied verbatim with attribution into `specs/` per ADR-0018
      (MIT, commit `83883a2ebad7e7de667fd00381b100d597faf846`):
      `spec.template.md`, `plan.template.md`, `tasks.template.md`,
      `constitution.template.md`, `checklist.template.md`. Each
      file has an HTML comment at the top recording the upstream
      source commit and license.
- [x] A2 extensions (AIECP-original) — 3 AIECP-original spec
      templates authored per ADR-0002 (no upstream equivalent
      found): `contracts.template.md` (parties, input/output
      schema, invariants, failure modes — derives from
      `docs/evidence-model.md`'s "Contract" entity),
      `invariants.template.md` (scope, predicate, validation
      method, failure mode — derives from "Invariant" entity),
      `state-machines.template.md` (YAML or Markdown, same shape
      as AIECP's own workflow `.sm.yaml` files — derives from
      "State Transition" entity). Each becomes an `Expected`
      entity when referenced by `skills/specification/SKILL.md`.
- [x] Live-session test infrastructure — `scripts/chat-harness.mjs`
      authored. Drives an AIECP workflow interactively with a
      real chat LLM's text response (file path or stdin),
      validates every `aiecp:*` block against the Phase 1 schemas,
      walks the real `WorkflowRun` state machine, and reports
      whether the chat LLM's response drove the workflow from
      initial state to a terminal state. Designed for the user
      (patron) to test real chat LLM sessions at home without
      writing code. Smoke-tested with a simulated 22-block chat
      LLM response (bug-report workflow, full intake → report
      walk) — 22/22 blocks OK, terminal state reached, verdict
      PASS. Run via `npm run chat-harness -- <workflow-name>
      <response-file>` or `cat response.md | npm run chat-harness
      -- <workflow-name>`.
- [x] `workflows/_router.md`, `workflows/README.md`,
      `skills/README.md`, `package.json` updated to reflect 15
      runnable workflows + 35 skills. `package.json` now has
      15 e2e-demo scripts + 2 validators + chat-harness.
- [x] **Live session test (subagent-simulated)** — A clean-session
      chat LLM simulation was run via a general-purpose subagent
      (opus, model "chat-llm-simulator"). The subagent was given
      the AIECP repo and a bug-report task ("membership endpoint
      returns wrong value on expiry date") with NO knowledge of
      chat-harness.mjs or validate-chat-output.mjs (it was
      explicitly forbidden from reading them). The subagent
      followed CHAT-ENTRYPOINT.md's zip-upload protocol: verified
      date (honest fallback to `recency_unverifiable`), inventoried
      tools, read constitution §8, identified the bug-report
      workflow, walked every state from intake to apply-fix, and
      emitted 25 `aiecp:*` blocks. **chat-harness.mjs validated the
      response: 25/25 blocks OK, terminal state `blocked` reached
      (the chat LLM correctly transitioned to `blocked` on
      `requires_filesystem_write_capability` — it cannot apply
      fixes, so it handed the fix back to the user). VERDICT: PASS.**
      This is the first end-to-end proof that a fresh LLM given
      only CHAT-ENTRYPOINT.md can drive the framework correctly.
      Two real bugs were found and fixed during this test:
      1. `apply-fix → blocked on: requires_filesystem_write_capability`
         transition was missing from `bug-report.sm.yaml` (and the
         other 5 code-changing workflows). Added to all 6.
      2. Bootstrap (intake state) date-verification question was
         being emitted as `aiecp:question` block, which violated
         `question_economy.allowed_states: [classify]`.
         CHAT-ENTRYPOINT.md updated to clarify: bootstrap questions
         are plain prose, NOT `aiecp:question` blocks.
- [x] Bug-fix sweep: all 6 code-changing workflows
      (`bug-report`, `feature-request`, `change-request`,
      `refactor`, `performance-problem`, `regression`) now declare
      the `requires_filesystem_write_capability` transition from
      their code-changing state to `blocked`. This is the
      constitution §3 + §8 honest-fallback clause made operational:
      an agent without `filesystem_write` (chat LLMs) transitions
      to `blocked` rather than fabricating the fix.
- [x] Toy shipping-bug test fixture — `executor/examples/toy-shipping-bug/`
      created. A deliberately-buggy Python module
      (`shipping.py` with `>` instead of `>=`) + test suite
      (`test_shipping.py` with 7 tests, 2 of which fail until the
      bug is fixed) + README documenting how to test with a
      chat-sandbox LLM. This fixture exists so chat-sandbox LLMs
      (ChatGPT Code Interpreter, etc.) have a REAL source file in
      the repo to test the FULL bug-report workflow against,
      including `apply-fix` → `verify` → `regression-protect` →
      `replay` → `report` — the states that previously couldn't be
      tested because no real source file existed. The 3rd ChatGPT
      test (2026-08-14) correctly blocked at "requires target source
      file" because the user's pasted snippet wasn't in the repo;
      this fixture fixes that structural gap. Verified locally:
      `python3 -m pytest test_shipping.py -v` shows 2 failures
      before the fix, 7 passes after.
- [x] ADR-0020 — Chat LLMs are not all the same: pure-text vs
      sandboxed-code-execution. The original `chat` adapter
      (commit `ff4afbc`) assumed all chat LLMs have zero
      capabilities. This was proven wrong by a real ChatGPT
      session (2026-08-14, patron's home test with ChatGPT):
      ChatGPT correctly followed `workflows/_router.md` rule 1
      (".aiecp/project-intelligence.json missing →
      project-onboarding first") but couldn't proceed because
      the chat adapter declared `filesystem_write=false`.
      ChatGPT's Code Interpreter is a real Python environment
      that CAN write files in the sandbox. Fixes:
      - **`adapters/agents/src/types.ts`**: new
        `sandboxed_code_execution?: boolean` field on
        `AgentCapabilities`.
      - **`adapters/agents/src/chat-sandbox/adapter.ts`** (new):
        declares `filesystem_read=true`, `filesystem_write=true`,
        `shell_exec=true`, `test_runner=true`,
        `sandboxed_code_execution=true` (all within the sandbox).
        `translateObservation` is a REAL function (unlike pure-text
        chat's no-op-throw) — sandbox agents CAN produce raw tool
        observations.
      - **`adapters/agents/src/chat/adapter.ts`** (updated):
        explicitly declares `sandboxed_code_execution: false`
        for pure-text chat LLMs.
      - **`CHAT-ENTRYPOINT.md`** (updated): new Step 0
        self-identification checklist (chat LLM checks whether it
        has a code execution tool and selects the appropriate
        adapter) + new Step 0.5 router pre-condition check
        (`.aiecp/project-intelligence.json` must exist before any
        non-onboarding workflow runs).
      - **`CHAT-ENTRYPOINT-SANDBOX.md`** (new, generated by
        chat-sandbox adapter's renderEntrypoint): orientation for
        code-execution-capable chat LLMs.
      - **`DECISIONS.md`**: ADR-0020 added (20th ADR).
      - **`adapters/agents/src/cli.ts`** self-test: 8 new
        assertions for chat-sandbox capabilities (total adapters/
        agents self-test now 27/27, was 19/19).
      - **`adapters/agents/src/bin/write-entrypoints.ts`**: now
        supports `chat` and `chat-sandbox` adapter ids (opt-in;
        default is still claude-code + codex only).
      - **`executor/examples/e2e-chat-adapter/drive-run.mjs`**:
        new Scenario 9 testing chat-sandbox adapter (24 new
        assertions; total chat-adapter proof now 56/56, was 32/32).

## In progress

(nothing currently in progress — next unchecked item in "Not started"
below is the next task to pick up)

## Not started (in sequence order)

- [ ] A **live**, multi-turn agent session (not a single driver script)
      actually exercising `adapters/agents/`'s `translateObservation`
      on real tool-call output from a real Claude Code or Codex
      session, one call at a time. **Subagent-simulated chat LLM
      session: DONE** (see Done section above — 25/25 blocks OK,
      verdict PASS). **Real chat LLM session (ChatGPT/Claude chat
      via patron's home setup):** still open. The infrastructure
      (`scripts/chat-harness.mjs`) is proven; the remaining gap is
      a human-in-the-loop test where patron uploads the repo to a
      real chat LLM and runs the harness on the LLM's response.
- [ ] 2 stack adapters (Python, TypeScript) beyond what `discovery/cli/`
      already does — `adapters/stacks/` placeholder only. May turn out
      to be unnecessary now that `discovery/cli` + `skills/testing/`
      have been proven sufficient for a real Python bug-report run
      above; revisit before building this speculatively.
- [~] Formal eval harness (Phase 8, Python, per ADR-0017) — BUILT.
      `evaluations/eval_runner.py` drives the real `WorkflowRun` API
      across 25 scenarios / 115 assertions, covering 15/15 workflows
      (14 single-workflow + orchestrator). 3 new orchestrator
      scenarios added in this cycle: `orchestrator-happy-path-2-
      subgoals` (7 assertions), `orchestrator-plan-revision-resolved`
      (6 assertions — the LIVING PLAN back-edge fires once and
      resolves), `orchestrator-plan-revision-limit-blocked` (6
      assertions — the `plan_revision_limit_reached` transition is
      now e2e-exercised, not just a YAML line). REMAINING GAP: the
      4 planning skills (requirements-gathering, project-planning,
      architecture-design, ux-design) have no skill-tier eval
      scenarios — they are exercised only indirectly via the
      orchestrator scenarios. A skill-tier harness (separate from
      the workflow-tier one) is the next eval expansion.
- [x] All 15 workflows are implemented and proven end-to-end (see
      `workflows/README.md`).
- [x] All 35 of 35 skills authored (per ADR-0016 + long-term scope;
      see `skills/README.md`). The only genuinely future-work skill
      is `mobile`.
- [x] Adapters: 1 stack adapter (`discovery/cli/`, per ADR-0009 +
      ADR-0022) and 5 agent adapters (`claude-code`, `codex`, `chat`,
      `chat-sandbox`, `mcp`). Long-term scope per ADR-0016.

## Known open questions (not blocking, but unresolved)

- Exact commit SHAs for vendored/referenced upstream repos were never
  captured (no `git clone`/`gh api` access during verification) — see
  `NOTICE`. A1's deepening pass did pin one SHA
  (`obra/superpowers@b36e0829`); the pattern is now established for
  future vendoring. The general open question (other repos) remains.
- `vercel-labs/skills` license still unverified — flagged in
  `docs/research.md` and `NOTICE`, must be checked before any reuse.
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
*Last updated: 2026-08-16, ADR-0023 (safety gate authorization for
chat-sandbox) added after controller found security gap in
chat-harness.mjs. The 4th ChatGPT test proved chat-sandbox CAN write
files, but the harness was auto-confirming ALL safety gates
unconditionally — a stale comment from pre-ADR-0020 days. Fixed:
adapter-aware safety gate handling (chat=auto-confirm, chat-sandbox
requires explicit authorization via aiecp:confirm or --user-prompt).
Also added already-terminal violation handling (catches the "extra
block past terminal" bug from the 4th test). 29 ADRs, 20 e2e drivers
(19 with assertions + 1 narrative-only; was incorrectly claimed as
9 — corrected after running every driver in this cycle), 953
assertions across all harnesses (was
incorrectly claimed as 325+ — corrected after running every
component in this cycle; see breakdown below). SDLC planning gap
filled: 4 new planning skills (requirements-gathering,
project-planning, architecture-design, ux-design) + orchestrator
plan_revision loop (the `plan_revision_limit_reached` transition
is now e2e-tested via `orchestrator-plan-revision-limit-blocked`
eval scenario AND via the existing
`executor/examples/e2e-orchestrator/drive-run.mjs` 50-assertion
driver — both confirm the transition actually fires, not just a
YAML line).*

**Assertion breakdown (auto-generated by `npm run count-assertions -- --write`):**

<!-- AUTO-GENERATED by `node scripts/count-assertions.mjs --write`. DO NOT EDIT by hand. -->
<!-- Last regenerated: 2026-08-17T00:22:35.363Z -->

| Component | Run command | Pass | Fail | Notes |
|---|---|---|---|---|
| `eval_runner.py` | `python3 evaluations/eval_runner.py` | 115 | 0 | 25/25 scenarios PASS |
| `executor self-test` | `npm test --workspace=executor` | 20 | 0 | 20/20 PASS |
| `adapters/agents self-test` | `npm test --workspace=adapters/agents` | 58 | 0 | 58/58 PASS |
| `e2e-* drivers (26 runnable, 1 narrative-only)` | `node executor/examples/e2e-*/drive-run.mjs` | 1066 | 0 | 25/26 drivers PASS with assertions; narrative-only: e2e-membership-bug |
| `validate-chat-output.mjs (test-responses/)` | `node scripts/validate-chat-output.mjs <file>` | 96 | 5 | see scripts/test-responses/README.md for which fixtures are intentional-fail regression cases |
| **Total** | | **1355** | **5** | Total: 1355 pass + 5 fail across 5 components |
<!-- END AUTO-GENERATED -->

NOTE: This table is regenerated by `npm run count-assertions -- --write`.
The prior "325+ assertions" claim (this cycle's first draft) and the prior
"9 e2e drivers" claim were stale aggregates copied from earlier STATUS.md
without re-running components — corrected after the critic pointed out
that running only `eval_runner.py` and copying other components' counts
from STATUS is the same drift habit this cycle was supposed to fix. The
structural fix: the table is now generated by `scripts/count-assertions.mjs`,
which actually runs each harness and parses real output. A future STATUS
edit that hand-edits the table will be overwritten on the next
`count-assertions --write` run — the drift is now structural, not
human-discipline-dependent.
