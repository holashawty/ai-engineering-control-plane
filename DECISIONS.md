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

## ADR-0002 — Adopt spec-kit's spec/plan/tasks/constitution family for Specification
- **Decision:** Reuse spec-kit's document family with extensions
  (`contracts.md`, `invariants.md`, `state-machines.md`).
- **Alternatives:** BMAD briefs; custom requirements format.
- **Reason:** Battle-tested; clean SPEC↔IMPL separation; familiar shape.
- **Tradeoffs:** spec-kit is opinionated about IDE integration. We use
  only the *document family*, not any CLI.

## ADR-0003 — Do not ship a competing agent runtime
- **Decision:** AIECP is a *control plane*, not a runtime. OpenHands,
  Cline, etc. are runtimes.
- **Alternatives:** Fork OpenHands; build our own runtime.
- **Reason:** Runtime is a high-maintenance surface; OpenHands already
  does it well; agent-portability requires neutrality.
- **Tradeoffs:** Some features (sandboxed execution, browser) require a
  runtime — provided by adapter, not core.

## ADR-0004 — Build the Evidence Model from scratch
- **Decision:** No upstream has a semantic evidence model. We build one.
- **Alternatives:** Reuse OpenHands event-stream as the model (rejected:
  too runtime-bound); reuse LLM-ops trace formats (rejected: too
  observability-focused, not debugging-focused).
- **Reason:** Evidence-driven debugging is the core differentiator. Must
  be agent- and stack-independent.
- **Tradeoffs:** Schema design is hard; must be validated against ≥3 real
  bug scenarios per concept before Phase 5.

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

## ADR-0006 — Native entrypoints are generated, never hand-edited
- **Decision:** `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`,
  `.windsurfrules`, `GEMINI.md`, `.github/copilot-instructions.md` are
  generated from canonical sources via `sync-entrypoints`.
- **Alternatives:** Maintain each by hand.
- **Reason:** Drift between agent formats is the #1 portability failure
  mode.
- **Tradeoffs:** Slight friction on first setup. Generation step must be
  idempotent and reviewable.

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

## ADR-0008 — Constitutional self-improvement only
- **Decision:** The agent may *propose* framework changes; it may never
  *apply* them silently. All framework changes are ADRs in this file.
- **Alternatives:** Allow the agent to rewrite its own constitution
  (rejected: unsafe, non-reviewable).
- **Reason:** Self-improvement that bypasses review is a security and
  reliability hazard.
- **Tradeoffs:** Slower framework evolution. Acceptable.

## ADR-0009 — Detector-driven Project Discovery (no per-stack enumeration)
- **Decision:** Discovery is a pipeline of detectors (language,
  framework, build, test, entrypoint, layer, integration, cicd), each
  with stack-specific implementations registered behind a stable
  interface.
- **Alternatives:** Big if/else over stacks.
- **Reason:** Enumeration rots; detectors are independently extensible.
- **Tradeoffs:** More interfaces to maintain. Acceptable.

## ADR-0010 — Behavioral Verification is distinct from unit testing
- **Decision:** A passing test suite is *technical* success. *Verified*
  success requires behavioral contract validation (invariants,
  contracts, expected/actual, replay).
- **Alternatives:** Trust test exit codes.
- **Reason:** Behavioral bugs (wrong result, wrong state, wrong UI) often
  pass technical tests. This is a primary reason the framework exists.
- **Tradeoffs:** Higher authoring cost. Mitigated by skills that
  scaffold behavioral assertions.

## ADR-0011 — Safety gates on destructive operations
- **Decision:** The constitution enumerates destructive classes (prod
  mutation, irreversible migration, credential access, broad refactor,
  security-sensitive change). Each requires explicit confirmation or a
  pre-authorized policy.
- **Alternatives:** Trust agent judgment unconditionally.
- **Reason:** Autonomy must not mean unrestricted mutation.
- **Tradeoffs:** Friction on legitimate operations. Mitigated by a
  policy file that pre-authorizes specific scoped operations.

## ADR-0012 — JSON as default evidence serialization, but schema is the contract
- **Decision:** Schemas are JSON Schema; instances serialize as JSON by
  default. Other serializations (YAML, protobuf, msgpack) are adapters.
- **Alternatives:** Lock to JSON only.
- **Reason:** Maximum tooling compatibility; preserves optionality.

## ADR-0013 — License: MIT with NOTICE
- **Decision:** MIT for the framework. `NOTICE` attributes reused
  components.
- **Alternatives:** Apache-2.0 (more protective, explicit patent grant).
- **Reason:** Maximal adoption; aligns with most reused components being
  MIT/Apache.
- **Tradeoffs:** No patent retaliation clause. Acceptable for a
  methodology framework; revisit if a vendored component requires
  Apache-2.0 compatibility.

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
- **Status:** Scheduled for Phase 1 finalization (see
  `docs/implementation-roadmap.md`).

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
