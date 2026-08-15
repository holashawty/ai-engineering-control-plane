# DECISIONS (ADR-style)

Architecture Decision Records for the AI Engineering Control Plane.
Every framework-level decision — especially anything touching
`constitution/` — must be recorded here. Silent changes are not permitted
(see ADR-0008).

## ADR-0001 — Adopt Agent Skills standard as the canonical skill format
- **Decision:** All skills are authored as Agent Skills (`SKILL.md` +
  frontmatter + supporting files).
- **Alternatives:** Custom skill format; superpowers-style directory
  convention; BMAD persona docs.
- **Reason:** Emerging de-facto standard; native support in Claude Code;
  growing support in OpenCode/Cursor/etc.; progressive disclosure built
  in.
- **Tradeoffs:** We accept dependence on Anthropic's spec evolution.
  Mitigated by keeping our *semantic* model above the format.
- **Status:** Decided 2026-08-11. Active.

## ADR-0002 — Adopt spec-kit's spec/plan/tasks/constitution family for Specification
- **Decision:** Reuse spec-kit's document family with extensions
  (`contracts.md`, `invariants.md`, `state-machines.md`).
- **Alternatives:** BMAD briefs; custom requirements format.
- **Reason:** Battle-tested; clean SPEC↔IMPL separation; familiar shape.
- **Tradeoffs:** spec-kit is opinionated about IDE integration. We use
  only the *document family*, not any CLI.
- **Status:** Decided 2026-08-11. Active.

## ADR-0003 — Do not ship a competing agent runtime
- **Decision:** AIECP is a *control plane*, not a runtime. OpenHands,
  Cline, etc. are runtimes.
- **Alternatives:** Fork OpenHands; build our own runtime.
- **Reason:** Runtime is a high-maintenance surface; OpenHands already
  does it well; agent-portability requires neutrality.
- **Tradeoffs:** Some features (sandboxed execution, browser) require a
  runtime — provided by adapter, not core.
- **Status:** Decided 2026-08-11. Active.

## ADR-0004 — Build the Evidence Model from scratch
- **Decision:** No upstream has a semantic evidence model. We build one.
- **Alternatives:** Reuse OpenHands event-stream as the model (rejected:
  too runtime-bound); reuse LLM-ops trace formats (rejected: too
  observability-focused, not debugging-focused).
- **Reason:** Evidence-driven debugging is the core differentiator. Must
  be agent- and stack-independent.
- **Tradeoffs:** Schema design is hard; must be validated against ≥3 real
  bug scenarios per concept before Phase 5.
- **Status:** Decided 2026-08-11. Active.

## ADR-0005 — Single-agent + workflow state machines, not multi-agent orchestration
- **Decision:** One agent + explicit workflow SMs. No MetaGPT/CrewAI/
  AutoGen-style role swarm.
- **Alternatives:** Multi-agent role systems.
- **Reason:** Predictability, token efficiency, debuggability.
  Multi-agent introduces non-determinism and is hard to make
  evidence-driven.
- **Tradeoffs:** Some complex tasks may benefit from role specialization.
  Mitigated by skills + workflow stages giving role-like behavior without
  agent multiplicity.
- **Status:** Decided 2026-08-11. Active.

## ADR-0006 — Native entrypoints are generated, never hand-edited
- **Decision:** `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`,
  `.windsurfrules`, `GEMINI.md`, `.github/copilot-instructions.md` are
  generated from canonical sources via `sync-entrypoints`.
- **Alternatives:** Maintain each by hand.
- **Reason:** Drift between agent formats is the #1 portability failure
  mode.
- **Tradeoffs:** Slight friction on first setup. Generation step must be
  idempotent and reviewable.
- **Status:** Decided 2026-08-11. Active.

## ADR-0007 — Memory is typed, validated, and small
- **Decision:** Eight memory types (project / architecture / decision /
  domain / constraint / known-failure / environment / workflow). Each
  entry validated against schema. No free-form summaries.
- **Alternatives:** Free-form session summaries; vector-store-only
  memory.
- **Reason:** Long chat summaries rot. Typed memory composes and is
  auditable.
- **Tradeoffs:** Higher authoring discipline. Mitigated by helper skills
  that propose memory updates for review.
- **Status:** Decided 2026-08-11. Active.

## ADR-0008 — Constitutional self-improvement only
- **Decision:** The agent may *propose* framework changes; it may never
  *apply* them silently. All framework changes are ADRs in this file.
- **Alternatives:** Allow the agent to rewrite its own constitution
  (rejected: unsafe, non-reviewable).
- **Reason:** Self-improvement that bypasses review is a security and
  reliability hazard.
- **Tradeoffs:** Slower framework evolution. Acceptable.
- **Status:** Decided 2026-08-11. Active.

## ADR-0009 — Detector-driven Project Discovery (no per-stack enumeration)
- **Decision:** Discovery is a pipeline of detectors (language,
  framework, build, test, entrypoint, layer, integration, cicd), each
  with stack-specific implementations registered behind a stable
  interface.
- **Alternatives:** Big if/else over stacks.
- **Reason:** Enumeration rots; detectors are independently extensible.
- **Tradeoffs:** More interfaces to maintain. Acceptable.
- **Status:** Decided 2026-08-11. Active.

## ADR-0010 — Behavioral Verification is distinct from unit testing
- **Decision:** A passing test suite is *technical* success. *Verified*
  success requires behavioral contract validation (invariants,
  contracts, expected/actual, replay).
- **Alternatives:** Trust test exit codes.
- **Reason:** Behavioral bugs (wrong result, wrong state, wrong UI) often
  pass technical tests. This is a primary reason the framework exists.
- **Tradeoffs:** Higher authoring cost. Mitigated by skills that
  scaffold behavioral assertions.
- **Status:** Decided 2026-08-11. Active.

## ADR-0011 — Safety gates on destructive operations
- **Decision:** The constitution enumerates destructive classes (prod
  mutation, irreversible migration, credential access, broad refactor,
  security-sensitive change). Each requires explicit confirmation or a
  pre-authorized policy.
- **Alternatives:** Trust agent judgment unconditionally.
- **Reason:** Autonomy must not mean unrestricted mutation.
- **Tradeoffs:** Friction on legitimate operations. Mitigated by a
  policy file that pre-authorizes specific scoped operations.
- **Status:** Decided 2026-08-11. Active.

## ADR-0012 — JSON as default evidence serialization, but schema is the contract
- **Decision:** Schemas are JSON Schema; instances serialize as JSON by
  default. Other serializations (YAML, protobuf, msgpack) are adapters.
- **Alternatives:** Lock to JSON only.
- **Reason:** Maximum tooling compatibility; preserves optionality.
- **Status:** Decided 2026-08-11. Active.

## ADR-0013 — License: MIT with NOTICE
- **Decision:** MIT for the framework. `NOTICE` attributes reused
  components.
- **Alternatives:** Apache-2.0 (more protective, explicit patent grant).
- **Reason:** Maximal adoption; aligns with most reused components being
  MIT/Apache.
- **Tradeoffs:** No patent retaliation clause. Acceptable for a
  methodology framework; revisit if a vendored component requires
  Apache-2.0 compatibility.
- **Status:** Decided 2026-08-11. Active.

## ADR-0014 — Autonomy is leveled and explicitly policy-gated
- **Decision:** Define explicit autonomy levels (L0 Observe → L5
  Autonomous engineering with safety gates) and a per-project
  `autonomy` policy (`default` level + per-capability `allow`/`ask`/
  `deny`/`scoped` rules), rather than a single implicit "the agent
  decides" model.
- **Alternatives:** Leave autonomy implicit in skill/workflow prose
  (original Phase-0 draft).
- **Reason:** "Minimum user intervention" is a UX goal, not a safety
  policy. Without an explicit, machine-checkable level and capability
  matrix, autonomy scope is unauditable and inconsistent across
  workflows.
- **Tradeoffs:** Adds one more schema/config surface. Justified because
  it directly implements ADR-0011 rather than leaving it as prose.
- **Status:** Decided 2026-08-11. Active. Scheduled for Phase 1
  finalization (see `docs/implementation-roadmap.md`). CSA (Cloud
  Security Alliance) Ocak 2026'da AI ajanları için yayınladığı
  resmi L0-L5 otonomi seviyeleri standardıyla neredeyse birebir
  örtüşmektedir — bu paralellik, AIECP'nin tasarım kararlarının
  endüstri standardıyla uyumlu olduğunu doğrulamaktadır.

## ADR-0015 — Project Intelligence is a persistent, first-class artifact
- **Decision:** Introduce a machine-readable, persistent project model
  (`project.yaml`, `capabilities.yaml`, `conventions.yaml`,
  `constraints.yaml`, `dependencies.yaml`, `entrypoints.yaml`,
  `environments.yaml`) produced by Discovery and consumed by every
  subsequent task, instead of re-deriving "what is this repository" from
  scratch each time.
- **Alternatives:** Keep discovery ephemeral / per-task (original
  Phase-0 draft, where Context and Memory implicitly carried this role).
- **Reason:** Re-deriving project understanding on every task wastes
  tokens and produces inconsistent answers across sessions/agents. A
  first-class, versioned project model is required for the "AI should
  ask minimal unnecessary questions" goal to actually hold.
- **Tradeoffs:** Another layer to keep in sync with reality; must be
  invalidated/refreshed when the repository changes structurally
  (handled by a `discovery-refresh` trigger, to be designed in Phase 1).
- **Status:** Scheduled for Phase 1 finalization.

## ADR-0016 — MVP is a single vertical slice, not the full layer set
- **Decision:** Before authoring the full 19-skill / 14-workflow /
  11-stack-adapter / 9-agent-adapter target, prove one complete vertical
  slice end-to-end: onboarding → intent classification → bug-report
  workflow → evidence → diagnosis → fix → behavioral verification →
  replay → typed memory update → report, on one real repository, through
  one agent adapter.
- **Alternatives:** Author the full document/skill/workflow surface
  first, then validate (original Phase-0 draft's implicit trajectory).
- **Reason:** Without a working vertical slice, the Evidence Model's 14
  entities and the Memory model's 8 types are unvalidated theory. A
  wide-but-shallow framework is a higher risk than a narrow-but-proven
  one; the wide surface can be built once the slice is proven correct.
- **Tradeoffs:** Slower perceived breadth early on. Accepted — see
  `docs/implementation-roadmap.md` MVP definition.
- **Status:** Decided 2026-08-14. Active. MVP vertical slice expanded to 14/14 workflows (was 8 at decision time).

## ADR-0017 — Tooling language: Node.js/TypeScript for the CLI, Python for the eval harness
- **Decision:** All dev-facing tooling that a host project installs and
  runs directly — `sync-entrypoints`, the workflow executor, discovery
  detectors' orchestration layer, schema validation — is built in
  Node.js/TypeScript and distributed via `npm`/`npx`. The evaluation
  harness (Phase 8) is built in Python, following the SWE-bench /
  OpenHands Eval convention.
- **Alternatives considered:** Python for everything (matches spec-kit's
  `specify-cli` and the eval-harness ecosystem); Rust for the CLI
  (matches `agentsync`'s optional crates.io distribution, fastest
  runtime); a single language for both CLI and eval harness.
- **Reason:** Live research (2026-08-11) into the AGENTS.md-sync tooling
  ecosystem — the closest existing analog to `sync-entrypoints` — found
  it is overwhelmingly npm/npx-based: `agentsync` (`npm install -g
  @dallay/agentsync`, also offers a Rust/crates.io build), `@agents-dev/
  cli` (`npm install -g @agents-dev/cli`), and Vercel's `npx skills`
  installer all standardize on Node.js distribution via `npx` for
  zero-install, cross-repo tooling. AGENTS.md itself is now stewarded by
  the Linux Foundation's Agentic AI Foundation and read natively by 28+
  tools across 60,000+ repos — none of the sync tools built for it
  chose Python, because the target repos this tooling runs against are
  frequently non-Python (Node/TS/Go/Rust/mobile projects) and requiring
  a Python runtime just to sync an `AGENTS.md` file is friction the
  ecosystem has already converged on avoiding. `npx` runs with zero
  install step even in a pure-Python or pure-Go host repo, whereas `uvx`
  (spec-kit's approach) is a fair alternative but a smaller footprint
  than `npx` across polyglot repos as of this research pass.
  Conversely, the evaluation harness (Phase 8) sits firmly in the
  SWE-bench / OpenHands Eval lineage, which is Python-native throughout
  the ecosystem we studied in `docs/research.md` — there is no
  comparable pull toward Node.js there.
- **Tradeoffs:** Two languages in one repo's tooling surface increases
  maintenance surface. Mitigated by a hard boundary: the CLI never
  imports eval-harness code and vice versa; they communicate only
  through the JSON/YAML artifacts already defined by the Evidence and
  Workflow schemas (language-neutral by construction, per ADR-0012).
  Framework *skills* themselves (`SKILL.md` + optional `scripts/`)
  remain language-agnostic per the Agent Skills standard (ADR-0001) and
  are unaffected by this decision — a skill's `scripts/` folder may use
  whatever language fits that skill's stack.
- **Status:** Decided 2026-08-11. Unblocks Phase 2 (Core).
## ADR-0018 — Verbatim reuse of permissively-licensed upstream code is allowed with attribution
- **Decision:** For upstream sources under a permissive license (MIT,
  Apache-2.0, BSD), verbatim reuse of code/prose into this project is
  explicitly permitted, provided the reused portion is recorded in
  `NOTICE` (source repo, commit SHA, license, what was reused) and any
  license/copyright header the upstream file carries is preserved.
  Paraphrasing permissively-licensed code purely to avoid textual
  similarity is not required and is actively discouraged when it risks
  altering working logic (e.g. rewriting a correct snippet just to make
  it "look different" can introduce bugs for no legal benefit).
- **Alternatives:** The original Phase-0 default (`constitution.md` §6,
  as first written) required paraphrasing/re-expression of adapted
  material even when the license permitted verbatim reuse.
- **Reason:** MIT/Apache/BSD licenses exist specifically to permit this
  — verbatim vendoring with attribution is standard, legal industry
  practice (this is what every `node_modules`-style dependency does).
  Requiring paraphrase on top of a license that doesn't ask for it added
  process cost with no legal or quality benefit, and in practice
  produced worse outcomes than the original when applied to working
  code (ADR text corrected after this was observed in practice on the
  `systematic-debugging` skill adaptation — see `STATUS.md`/`TASKS.md`
  history for 2026-08-14).
- **What does NOT change:** Sources with a restrictive or unverified
  license are unaffected by this ADR and remain paraphrase-only /
  reuse-with-caution:
  - `anthropics/skills`'s bundled document skills (`docx`, `pdf`,
    `pptx`, `xlsx`) — explicitly "source-available for reference, not
    open source" per their own `LICENSE.txt` (see `NOTICE`). This is a
    real license restriction, not a project-invented one.
  - `vercel-labs/skills` — license unverified as of this ADR; treat as
    restricted until confirmed.
  - Anything not yet in `docs/research.md`'s verified-license table.
- **Tradeoffs:** Slightly higher textual-similarity risk if this
  project is ever made public and compared side-by-side with upstream
  — mitigated by `NOTICE` making every reused portion traceable, and by
  `README.md`/`NOTICE` listing source repo URLs so any future
  public-release comparison is straightforward rather than a surprise.
- **Status:** Decided 2026-08-14. Supersedes the paraphrase-by-default
  reading of `constitution.md` §6 for permissively-licensed sources
  specifically; §6 ("reuse before reinvent") itself is unchanged.

## ADR-0019 — Tool use is mandatory, not optional
- **Decision:** An agent operating under this framework MUST invoke
  its available tools before asserting any time-sensitive fact,
  generating any code, or proposing any fix. The agent's own
  parametric knowledge is treated as a *hypothesis* to be verified,
  never as ground truth. Skipping a mandatory tool (per
  `skills/tool-use-discipline/SKILL.md`'s request-class table) is a
  process violation that emits a `Decision` with `what:
  "tool_use_skipped"`, `validated: false`, `result: "rejected"` —
  the agent must then either invoke the tool or transition to
  `blocked` with `on: tool_unavailable`. This rule is added to
  `constitution.md` as §8.
- **Alternatives:**
  - *Tool use is recommended but not enforced* (the pre-ADR-0019
    default, where skills like `behavioral-verification` strongly
    implied tool use but no rule made skipping a tool a process
    violation). Rejected: in practice, "recommended" tool use is
    skipped tool use — LLMs default to answering from memory unless
    forced.
  - *Tool use enforced only for chat LLMs* (the segment most prone
    to skipping). Rejected: CLI agents (Claude Code, Codex) skip
    tools too, just less often; the rule applies uniformly.
- **Reason:** The most common failure mode of LLMs — including
  capable ones — is conflating "I have seen this pattern in training
  data" with "I know this is currently true." For static facts this
  is harmless; for time-sensitive facts (library versions, API
  behaviors, current best practices, current date, current syntax)
  it produces authoritative-looking hallucinations. The cost of
  mandatory tool use is one extra tool call per claim; the benefit
  is not shipping stale-wrong answers. This is the single highest-
  leverage rule the framework can enforce to prevent the LLM weak-
  work patterns the project exists to prevent (per the user's
  vision: "çoğu llm zaten parametreleri ve eğitim verileri sayesinde
  bildiğini sanıp hafızasındaki şeyler ile yapmayı deniyor ve tool
  veya skillerden yardım almıyor").
- **What is mandatory, specifically:** See
  `skills/tool-use-discipline/SKILL.md` step 3's table — the table
  maps request classes (factual claim, code generation, bug
  diagnosis, architectural recommendation, review/assessment) to
  the mandatory tool for each. This ADR makes the table's entries
  constitution-level rules, not skill-level suggestions.
- **What is NOT mandatory:**
  - Tools the agent's adapter does not declare (per
    `adapters/agents/<adapter>/adapter.ts` `capabilities()`). If an
    agent doesn't have `web_search`, it cannot be mandatory — but
    the agent must then emit `Decision: recency_unverifiable` and
    transition to `blocked` rather than asserting the claim from
    memory.
  - Tools whose cost exceeds their value for trivial claims
    ("what's 2+2?"). The agent's judgment applies here; this ADR
    covers time-sensitive and code-generation claims specifically.
- **Tradeoffs:** Slightly slower per-claim (one tool call). Mitigated
  by the fact that the alternative — shipping stale-wrong answers
  and discovering the staleness in `verify` or worse, in production
  — is much slower.
- **Status:** Decided 2026-08-14. Adds `constitution.md` §8.
  Operationalized by three skills:
  `skills/tool-use-discipline/SKILL.md` (the mandatory-tool table),
  `skills/recency-verification/SKILL.md` (time-sensitive claims
  specifically), `skills/quality-gate/SKILL.md` (code quality after
  generation).

## ADR-0020 — Chat LLMs are not all the same: pure-text vs sandboxed-code-execution
- **Decision:** The agent adapter capability model gains a new flag
  `sandboxed_code_execution: boolean` on `AgentCapabilities`
  (`adapters/agents/src/types.ts`). Chat LLMs are split into two
  adapter categories:
  - **`chat` (pure-text)**: no code execution at all. All
    filesystem/shell/test_runner capabilities false. Must transition
    to `blocked` on `requires_filesystem_write_capability`. Examples:
    ChatGPT without Code Interpreter, Claude chat without code
    execution tool, Gemini chat basic.
  - **`chat-sandbox` (new)**: has a sandboxed code execution
    environment (ChatGPT Code Interpreter / Advanced Data Analysis,
    Claude code execution, Gemini code execution). Within the
    sandbox: `filesystem_read=true`, `filesystem_write=true`,
    `shell_exec=true`, `test_runner=true`,
    `sandboxed_code_execution=true`. The agent CAN drive
    `project-onboarding` (which writes `.aiecp/project-intelligence.json`)
    — the file lives in the sandbox.
- **Reason:** The original `chat` adapter (commit `ff4afbc`)
  assumed all chat LLMs have zero capabilities. This was proven
  wrong by a real ChatGPT session (2026-08-14, patron's home test):
  ChatGPT correctly followed `workflows/_router.md` rule 1
  (".aiecp/project-intelligence.json missing → project-onboarding
  first") but couldn't proceed because the chat adapter declared
  `filesystem_write=false`. The framework's router was right, the
  chat LLM was right, but the adapter's capability model was wrong
  — it conflated "no real filesystem" with "no sandboxed code
  execution," which are different things. ChatGPT's Code Interpreter
  is a real (if ephemeral) Python environment that can read files,
  run shell commands, write artifacts, and run tests *inside the
  sandbox*.
- **What this fixes:** The catch-22 where a chat LLM correctly
  routes to `project-onboarding` per `_router.md` rule 1, but
  `project-onboarding` requires `filesystem_write` (to write
  `.aiecp/project-intelligence.json`), and the chat adapter declared
  `filesystem_write=false`. With the new `chat-sandbox` adapter,
  ChatGPT-with-Code-Interpreter can drive `project-onboarding` to
  completion — the `.aiecp/` artifacts live in the sandbox.
- **What does NOT change:**
  - The pure-text `chat` adapter stays for chat LLMs without code
    execution — it still declares all capabilities false and must
    transition to `blocked` on `requires_filesystem_write_capability`.
  - CLI agents (Claude Code, Codex) are unaffected — they already
    declare `filesystem_write=true` and `sandboxed_code_execution`
    is implicitly false (their filesystem is real, not sandboxed).
- **Tradeoffs:** Slightly more complex adapter selection. The user
  (or the chat LLM itself) must correctly identify which adapter
  applies — pure-text vs sandbox. Mitigated by CHAT-ENTRYPOINT.md
  being updated to include a self-identification step: the chat LLM
  checks whether it has a code execution tool and selects the
  appropriate entrypoint (`CHAT-ENTRYPOINT.md` for pure-text,
  `CHAT-ENTRYPOINT-SANDBOX.md` for sandbox).
- **Status:** Decided 2026-08-14. Adds `sandboxed_code_execution`
  to `AgentCapabilities`. Adds `chat-sandbox` adapter alongside
  the existing `chat` adapter. Updates `CHAT-ENTRYPOINT.md` with
  self-identification guidance.

## ADR-0021 — Discovery is a procedure, not a tool: offline-sandbox portability via committed dist/ + text fallback procedure
- **Decision:** Two complementary fixes for the offline-sandbox
  portability gap found by a real ChatGPT session (2026-08-14):
  the chat-sandbox adapter (ADR-0020) correctly declared
  `filesystem_write=true`, but the `project-onboarding` workflow's
  `run-discovery` state required running `discovery/cli` as a
  Node.js subprocess — and `discovery/cli/dist/` was .gitignored,
  so it didn't exist in the repo zip the chat LLM received. The
  chat LLM tried `npm install` but timed out (sandbox has no
  network access). Result: `project-onboarding` blocked at
  `discovery_failed`, even though the chat-sandbox adapter had
  the right capabilities.

  Fix 1 (complementary): **commit `discovery/cli/dist/` to the
  repo** (against Node.js convention of not committing build
  output) so chat-sandbox agents can run
  `node discovery/cli/dist/cli.js <repo-path>` without `npm install`.

  Fix 2 (primary, conceptual): **encode discovery as a text
  procedure** in `skills/project-onboarding/discovery-fallback.md`.
  This procedure allows a chat-sandbox agent (or any agent with
  `filesystem_read` + `filesystem_write` but no Node.js runtime)
  to produce a schema-valid `.aiecp/project-intelligence.json` by
  reading marker files directly. The procedure is consistent with
  the framework's broader philosophy: chat LLMs follow procedures
  encoded as text (`CHAT-ENTRYPOINT.md`, `aiecp:*` blocks), they
  don't call subprocesses.

  The `project-onboarding` workflow's `run-discovery` state now
  documents TWO paths: (1) PRIMARY — run `discovery/cli`
  canonical tool; (2) FALLBACK — follow the discovery-fallback
  procedure. Both produce documents that validate against the same
  schema (`discovery/schema/project-intelligence.schema.json`);
  the fallback-produced document sets `discovery_method:
  "chat-sandbox-fallback-procedure"` for audit-trail distinction.

- **Reason:** The framework's router (`workflows/_router.md` rule
  1) correctly routes chat-sandbox agents to `project-onboarding`
  first — but `project-onboarding` then required a Node.js
  subprocess that wasn't available in the offline sandbox. This
  created a catch-22: the router was right, the chat-sandbox
  adapter was right, but the `project-onboarding` workflow had an
  implicit Node.js dependency that wasn't declared anywhere.

  The framework's broader philosophy resolves this: discovery is
  a *procedure* (read marker files, probe versions, write JSON),
  not a *tool*. The canonical `discovery/cli` is one
  implementation of that procedure; the fallback procedure in
  `skills/project-onboarding/discovery-fallback.md` is another.
  Both produce schema-valid output. The procedure-as-text encoding
  is the same pattern the framework uses for evidence (`aiecp:*`
  blocks), for entrypoints (`CHAT-ENTRYPOINT.md`), and for
  workflow transitions (`aiecp:advance` blocks).

- **What does NOT change:**
  - The canonical `discovery/cli` remains the preferred path —
    if `node discovery/cli/dist/cli.js` runs successfully, use
    that output, not the fallback. The canonical CLI may detect
    more (linters, CI/CD configs) than the fallback procedure.
  - CLI agents (Claude Code, Codex) are unaffected — they have
    `npm install` access and can rebuild dist/ if needed.
  - The schema is unchanged — both paths produce documents
    validatable against `discovery/schema/project-intelligence.
    schema.json`.

- **Tradeoffs:**
  - Committing `discovery/cli/dist/` bloats the repo slightly
    (~32KB as of this ADR). Mitigated by
    `scripts/check-discovery-freshness.mjs` which verifies the
    committed dist/ matches the current source — drift is caught
    in CI.
  - The fallback procedure may produce less-detailed Project
    Intelligence than the canonical CLI (no linter detection, no
    CI/CD parsing). Mitigated by the `discovery_method` field in
    the produced JSON, so downstream agents know the grade of
    discovery they're working with.

- **Status:** Decided 2026-08-14. Adds committed
  `discovery/cli/dist/` (with `.gitignore` exception per
  ADR-0021). Adds `skills/project-onboarding/discovery-fallback.md`.
  Updates `workflows/project-onboarding.sm.yaml`'s `run-discovery`
  state with two-path documentation + `discovery_complete_via_fallback`
  transition. Adds `scripts/check-discovery-freshness.mjs`.

## ADR-0022 — discovery/cli has ZERO runtime npm dependencies (ajv moved out)
- **Decision:** `discovery/cli/src/cli.ts` no longer imports `ajv`
  or `ajv-formats` at runtime. The schema validation that previously
  happened in `discovery/cli` (via `loadValidator()` using ajv) is
  removed — the CLI now does only a STRUCTURAL check (required fields
  present, types correct, enum values valid) without ajv. Full
  schema validation is the responsibility of the `validate-discovery`
  state of the `project-onboarding` workflow, which has access to ajv
  via the executor's `evidence-store.ts`, OR via the chat-sandbox LLM
  following the `discovery-fallback.md` procedure.
- **Reason:** ADR-0021's Fix 1 (commit `discovery/cli/dist/` so
  chat-sandbox agents can run it offline) was found BROKEN by the
  controller's verification on 2026-08-14: `node discovery/cli/dist/
  cli.js --self-test` in a fresh clone without `node_modules` fails
  with `ERR_MODULE_NOT_FOUND: Cannot find package 'ajv'`. The
  compiled `dist/cli.js` imports `ajv/dist/2020.js` and `ajv-formats`
  at the top of the file — runtime dependencies that require
  `npm install`. ADR-0021's claim that "chat-sandbox agents can run
  `node discovery/cli/dist/cli.js` without `npm install`" was wrong
  because of this.
- **The fix:** Remove ajv from `discovery/cli`'s runtime entirely:
  - `discovery/cli/src/cli.ts`: removed `import Ajv2020` and `import
    addFormats`. Removed `loadValidator()` function. `runAgainst()`
    now calls a new `structuralCheck()` that verifies required fields
    without ajv — sufficient to catch regressions in the detector
    pipeline. The self-test message now says "structurally-valid"
    instead of "schema-valid" to be honest about what was checked.
  - `discovery/cli/package.json`: removed `ajv` and `ajv-formats`
    from BOTH `dependencies` and `devDependencies`. The CLI now has
    ZERO runtime npm dependencies (only `typescript` and `@types/node`
    as devDependencies for the build step, which doesn't run in the
    chat-sandbox environment anyway).
  - `scripts/check-discovery-freshness.mjs`: extended to do TWO
    checks instead of one. (1) Hash check (committed dist/ matches
    current source) — same as before. (2) NEW: executability check
    — runs `node discovery/cli/dist/cli.js --self-test` in a temp
    dir with `node_modules` moved aside, simulating a fresh offline
    clone. If the CLI fails (e.g., ERR_MODULE_NOT_FOUND for any
    npm package), the check fails with exit code 3 and a clear
    message. This check would have caught the original ADR-0021
    bug if it had existed then.
- **What does NOT change:**
  - Schema validation still happens — just not in the discovery CLI.
    The `validate-discovery` state of `project-onboarding.sm.yaml`
    is where it belongs, and it has access to ajv via the executor's
    `evidence-store.ts` (for tool-using agents) or via the chat-sandbox
    LLM's structural reasoning (for chat agents).
  - The `discovery-fallback.md` text procedure (per ADR-0021 Fix 2)
    is unaffected — it never depended on ajv; it produces JSON via
    marker-file reading + text encoding.
  - CLI agents (Claude Code, Codex) are unaffected — they have
    `npm install` access and can use the full ajv-validated path
    if needed (via the executor).
- **Tradeoffs:**
  - The discovery CLI's self-test is now less rigorous (structural
    check only, not full schema validation). Mitigated by: (a) the
    structural check catches the most common regressions (missing
    required fields, wrong enum values); (b) full schema validation
    happens in `validate-discovery`, which is the right place for it
    per separation of concerns; (c) the `e2e-project-onboarding`
    driver still exercises the full pipeline including schema
    validation via the executor's evidence-store.
  - The `discovery/cli/package.json` no longer declares ajv as a
    dependency, which means `npm install` at the workspace root no
    longer installs ajv for discovery/cli. But ajv is still needed
    by `executor/` (for `evidence-store.ts`), so it remains in the
    root `package-lock.json` — no change to the install behavior.
- **Status:** Decided 2026-08-14. Removes ajv from `discovery/cli`
  runtime. Updates `discovery/cli/src/cli.ts` (structural check
  replaces ajv validation). Updates `discovery/cli/package.json`
  (zero runtime deps). Extends `scripts/check-discovery-freshness.mjs`
  with executability check. Corrects ADR-0021's "npm install gerekmez"
  claim where it was previously wrong — now it's actually true
  because the runtime dependency is gone.

## ADR-0023 — Safety gate authorization for chat-sandbox adapter
- **Decision:** `scripts/chat-harness.mjs` no longer auto-confirms
  safety gates unconditionally. The safety gate handling is now
  adapter-aware:
  - **`chat` (pure-text) adapter**: auto-confirm safety gates.
    The pure-text chat LLM cannot actually write files, so the gate
    is moot — the LLM will transition to `blocked:
    requires_filesystem_write_capability` before reaching any gated
    state anyway. This is the pre-ADR-0023 behavior, unchanged.
  - **`chat-sandbox` adapter**: DO NOT auto-confirm. The chat-sandbox
    CAN actually write files (per ADR-0020), so the safety gate is a
    real authorization boundary. The harness checks authorization
    via TWO mechanisms:
    1. **`aiecp:confirm` block** (NEW, per this ADR): the chat LLM
       may emit an explicit confirmation block in its response.
       If present, it serves as the authorization. Optional fields:
       `gate` (which gate, e.g., `"broad-refactor"`), `reason`
       (why the LLM is confirming).
    2. **`--user-prompt` argument**: the harness reads the user's
       original prompt to the chat LLM and checks if it contains
       authorization keywords (`fix`, `düzelt`, `apply`, `uygula`,
       `implement`, `refactor`, `migrate`, `optimize`, `change`,
       `modify`, `update`, `patch`, `edit`, `write`, etc.). If the
       prompt authorizes the gated action, the harness allows it.
    If neither authorization mechanism is present, the harness
    FAILS the safety-gated advance with a clear message explaining
    how to authorize.

- **Reason:** The 4th ChatGPT test (2026-08-14, patron's home with
  `toy-shipping-bug` fixture) proved that chat-sandbox LLMs can
  drive the full workflow including `apply-fix` (writing real files
  in the sandbox). The controller's verification found that
  `chat-harness.mjs` was auto-confirming ALL safety gates
  unconditionally, with a comment saying "chat LLM can't actually
  apply fixes anyway" — but this comment was written before
  ADR-0020 (which added the chat-sandbox adapter that CAN write
  files). The comment was stale; the behavior was a security gap:
  a chat-sandbox LLM could pass through a `broad-refactor` safety
  gate without any user authorization, and the harness would let
  it through silently.

- **What does NOT change:**
  - The `chat` (pure-text) adapter's behavior is unchanged.
  - CLI agents (Claude Code, Codex) are unaffected — they use
    `advanceWithConfirmation` directly, not through the harness.
  - The executor's `WorkflowRun.advance()` behavior is unchanged —
    it still throws `safety-gate-needs-confirmation` when a gated
    transition is attempted without confirmation. The harness's
    handling of this exception is what changed.
  - The `aiecp:confirm` block is new but optional — existing chat
    LLM responses that don't use it still work (if the adapter is
    `chat` or if `--user-prompt` authorizes).

- **Tradeoffs:**
  - Slightly more complex harness usage for chat-sandbox: the user
    must pass `--user-prompt` (or the LLM must emit `aiecp:confirm`
    blocks). Mitigated by clear error messages explaining how to
    authorize.
  - The authorization keyword list is heuristic, not perfect. A
    user prompt like "analyze the bug" (without "fix") would NOT
    authorize `apply-fix`, even if the user intended to authorize
    it. This is intentional — the harness errs on the side of
    requiring explicit authorization for file-writing actions.

- **Status:** Decided 2026-08-14. Updates `scripts/chat-harness.mjs`
  with adapter-aware safety gate handling. Adds `aiecp:confirm`
  block type. Adds `--adapter` and `--user-prompt` arguments.
  Adds `already-terminal` violation handling (catches the "extra
  block past terminal state" bug from the 4th ChatGPT test).
