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
