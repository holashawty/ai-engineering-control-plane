# Research — Upstream Systems

> Status: training-knowledge-based. Re-verify every claim with a live
> `git clone` / `gh repo view` before Phase 2 begins.

## 1. obra/superpowers
- **What:** A curated set of Claude Code skills (brainstorming, planning,
  systematic-debugging, code-review, etc.). Skill = directory with
  `SKILL.md` (+ optional `reference/`, `scripts/`, `assets/`). Progressive
  disclosure via frontmatter `name` + `description`; full body loads only
  on activation.
- **Strengths:** Disciplined debugging skill (hypothesis → test → minimal
  fix → regression). Demonstrates that *procedural* skills (not just
  checklists) work.
- **Weaknesses:** Claude Code-specific invocation; no semantic evidence
  model; no cross-agent portability layer; memory is ad-hoc.
- **Reuse:** Adopt the systematic-debugging procedure as a *reference
  implementation* of our `systematic-debugging` skill, with attribution.

## 2. github/spec-kit
- **What:** GitHub's spec-driven development toolkit. Workflow: `/specify`
  → `/plan` → `/tasks` → `/implement`. Produces `spec.md`, `plan.md`,
  `tasks.md`, `constitution.md`.
- **Strengths:** Separates SPECIFICATION from IMPLEMENTATION explicitly.
  Constitution pattern. Used at GitHub.
- **Weaknesses:** Spec↔implementation linkage is manual; no
  observation/evidence layer; no behavioral verification; no runtime
  trace concept.
- **Reuse:** Adopt the `spec/plan/tasks/constitution` document family as
  our Specification layer, extended with contracts, invariants, state
  machines.

## 3. bmad-code-org/BMAD-METHOD
- **What:** Multi-persona method (Business Manager, Architect, Developer,
  SM, PO, Analyst, QA, UX). Knowledge-base-driven with briefs, PRDs,
  architecture docs, stories.
- **Strengths:** Demonstrates persona-driven separation of concerns; rich
  document taxonomy; explicitly addresses non-coding roles.
- **Weaknesses:** Heavy, document-heavy onboarding. Doesn't model runtime
  evidence. Persona overload is a token-cost risk for small tasks.
- **Reuse:** Borrow the *workflow-stage ownership* concept (who/what owns
  each artifact). Do not adopt the full persona roster; map to our skill
  set instead.

## 4. OpenHands/OpenHands
- **What:** Open-source AI software-engineer runtime. Architecture: agent
  controller + event-stream + action/observation pairs + runtime
  (Docker/local) + browser integration + eval harness.
- **Strengths:** Production-grade event-stream model; strong eval harness
  (SWE-bench-style); runtime isolation; browser integration.
- **Weaknesses:** Heavy runtime dependency; not designed as a portable
  *methodology* layer; eval is benchmark-oriented, not skill-behavior
  oriented.
- **Reuse:** (a) event-stream concept as one implementation of our Trace
  model, (b) eval-harness shape for our evaluations, (c) treat OpenHands
  as a first-class agent adapter — do not fork.

## 5. anthropics/skills
- **What:** Anthropic's Agent Skills standard. A skill is a directory with
  `SKILL.md` (YAML frontmatter: `name`, `description`, optional `license`,
  `allowed-tools`) plus supporting files. Description loads first; full
  content loads on demand (progressive disclosure).
- **Strengths:** Designed for token efficiency. Emerging de facto
  standard. Native support in Claude Code; growing support elsewhere.
- **Weaknesses:** Standard is young; not all agents support it
  identically; no workflow, evidence, or memory model.
- **Reuse:** Adopt as the **canonical skill format** for this project.

## 6. agentskills/agentskills
- **What:** Community registry/collection of skills following the Agent
  Skills standard.
- **Strengths:** Demonstrates breadth of skills across stacks. Useful
  reference implementations.
- **Weaknesses:** Variable quality; no governance.
- **Reuse:** Reference implementations only — curate, don't vendor.

## 7. vercel-labs/skills
- **What:** Vercel's skills collection, focused on frontend workflows
  (Next.js / React / Tailwind).
- **Strengths:** High-quality frontend skills.
- **Weaknesses:** Vercel-scoped; not portable across problem domains.
- **Reuse:** Reference for `frontend` skill authoring quality bar.

## Adjacent systems considered

- **Aider** — repo-map (tree-sitter-based symbol graph): adopt for
  `discovery/` and context packing.
- **Cursor `.cursor/rules` + `.mdc`** — generated per-project rules:
  informs adapter pattern.
- **Codex `AGENTS.md`** — becoming a standard entrypoint filename.
- **Cline / Roo Code** — custom-mode JSON + tool allowlists: informs
  safety-gate design.
- **Continue `.continuerules`** — similar pattern.
- **Swe-agent (Princeton)** — lightweight agent loop, agent–computer
  interface: informs the Action/Observation model.
- **MetaGPT / CrewAI / AutoGen** — multi-agent role systems: deliberately
  *not* adopted; single-agent + workflow is simpler and more predictable.
- **LangGraph** — state-machine graphs: informs workflow SM format; not
  taken as a runtime dependency (Python-only).
- **repomix / repo-prompt** — context-packing tools: optional helpers.
- **tree-sitter / ast-grep** — code-structure inspection: discovery
  backends.

## What is missing from *all* upstreams (our differentiators)

1. A semantic **Evidence Model** (incident / trace / decision / contract /
   invariant / expected / actual / validation / fingerprint /
   reproduction / replay / regression). None of them have this.
2. **Decision Trace** as a first-class artifact for high-stakes decisions.
3. **Behavioral Verification** as a layer distinct from unit testing
   (no exception ≠ success).
4. **Typed Memory taxonomy** (project / architecture / decision / domain /
   constraint / known-failure / environment / workflow) with validation
   rules.
5. **Project-onboarding discovery pipeline** that is detector-driven
   across 11+ stacks.
6. **Constitutional self-improvement** with reviewable, version-controlled
   changes — not silent mutation.
7. **AI-output validation pattern** (AI proposes → app validates →
   behavioral contract validates → accept/reject) as a framework
   primitive.
