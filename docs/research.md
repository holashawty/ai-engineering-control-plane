# Research — Upstream Systems

> Status: Live-verified via web search + page fetch on 2026-08-11 (no
> direct `git clone`/`gh api` access was available in the verifying
> environment; verification was done by fetching each repo's GitHub
> page and cross-referencing secondary sources). Each section below now
> carries a "Verified" line. Corrections found during verification are
> called out explicitly rather than silently fixed, so the record of
> what Phase 0 originally got wrong is preserved.

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
- **Verified (2026-08-11):** MIT license confirmed. The skill/frontmatter
  structure claim is confirmed. **Correction:** the project has grown
  well past a single-agent skill collection — it is now a full
  cross-agent methodology with native support across Claude Code, Codex,
  Cursor, Factory Droid, Gemini CLI, GitHub Copilot CLI, Kimi Code,
  OpenCode, and Pi, plus its own eval harness (`superpowers-evals`,
  internally called "drill"). Our original "Weaknesses: Claude
  Code-specific invocation" is now **out of date** — superpowers has
  already solved a version of the cross-agent portability problem we
  are trying to solve, at least for skill delivery. Also has an
  eval-harness precedent (`drill`) worth studying alongside OpenHands
  Eval before we design our own (Phase 8).

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
- **Verified (2026-08-11):** MIT license confirmed (root LICENSE +
  README badge). **Correction:** the CLI (`specify-cli`) is **Python**
  (installed via `uv tool install specify-cli`, requires Python 3.11+),
  not TypeScript and not Elixir — our original "Originally Elixir CLI;
  now TS" claim was wrong on both counts. Commands are now namespaced as
  `/speckit.constitution`, `/speckit.specify`, `/speckit.plan`,
  `/speckit.tasks`, `/speckit.implement`, plus optional
  `/speckit.clarify`, `/speckit.analyze`, `/speckit.checklist`,
  `/speckit.converge`, `/speckit.taskstoissues`. It now supports 30+
  agent integrations (not just GitHub Copilot) and, notably, **ships its
  own root-level `AGENTS.md`** — directly relevant precedent for our
  ADR-0006 (generated canonical entrypoint). It also supports an
  "agent skills" install mode (`--integration-options="--skills"`),
  meaning spec-kit and the Agent Skills standard (ADR-0001) are already
  converging upstream, which validates pairing them in AIECP.

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
- **Verified (2026-08-11):** MIT license confirmed (root LICENSE).
  **Correction:** the persona roster in our original note ("Business
  Manager, Architect, Developer, SM, PO, Analyst, QA, UX") does not
  match the current agent names. The current BMM module ships agents
  named `analyst`, `pm` (Product Manager, not "Business Manager"),
  `architect`, `dev`, `ux-designer`, `tech-writer`, `sm` (Scrum Master),
  and `tea` (Test Engineering Architect — QA was recently consolidated
  into this role, per the changelog). **Also important:** "BMad" and
  "BMAD-METHOD" are registered trademarks of BMad Code, LLC — the code
  is MIT but the name/marks carry separate trademark terms
  (`TRADEMARK.md`) that must be respected if we reference the project
  name in our own materials.

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
- **Verified (2026-08-11):** MIT license confirmed for the core
  `OpenHands/OpenHands` repo specifically (verify licenses independently
  for any other repo in the `OpenHands` org — e.g. `OpenHands-Cloud` is
  **Polyform Free Trial, not open source**; do not conflate the two).
  Event-stream / Action-Observation architecture confirmed, as is the
  SWE-bench-style eval lineage (reported ~77% on SWE-Bench Verified with
  Claude Sonnet 4.5 in one third-party write-up) and Docker-based
  sandboxing. **New finding:** OpenHands has since added support for the
  Agent-Client Protocol (ACP), letting it delegate to third-party agents
  including Claude Code, Codex, and Gemini rather than only running its
  own agent — this is directly relevant to ADR-0003 (don't fork the
  runtime) and suggests OpenHands may already function as a
  ready-made agent-adapter target rather than something we need to
  build an adapter *to* from scratch.

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
- **Verified (2026-08-11):** Frontmatter fields confirmed: required
  `name` + `description`; optional `license`, `allowed-tools`,
  `metadata`. **Important correction — license is not repo-wide.** The
  example/community-style skills (e.g. `algorithmic-art`,
  `brand-guidelines`, `internal-comms`) are Apache-2.0, but the bundled
  document skills (`docx`, `pdf`, `pptx`, `xlsx`) are **source-available
  for reference only, not open source**, each with its own
  `LICENSE.txt`. Our NOTICE previously said "believed MIT" for this
  repo — that was wrong on two counts (it isn't MIT, and it isn't
  uniform). See `NOTICE` for the corrected per-folder guidance. Also
  confirmed: the Agent Skills format is now cited as adopted by OpenAI
  Codex, GitHub Copilot, Cursor, and Gemini CLI beyond Claude — this
  strengthens the case for ADR-0001 (adopt it as canonical) rather than
  weakening it, despite the licensing wrinkle above.

## 6. agentskills/agentskills
- **What:** Community registry/collection of skills following the Agent
  Skills standard.
- **Strengths:** Demonstrates breadth of skills across stacks. Useful
  reference implementations.
- **Weaknesses:** Variable quality; no governance.
- **Reuse:** Reference implementations only — curate, don't vendor.
- **Verified (2026-08-11):** License confirmed directly from the repo
  README: code is Apache-2.0, documentation is CC-BY-4.0. This is a
  neutral specification repo behind agentskills.io, distinct from
  `anthropics/skills` (Anthropic's own implementation repo) — the two
  were previously easy to conflate in our notes; they are not the same
  thing and license terms differ between them.

## 7. vercel-labs/skills
- **What:** Vercel's skills collection, focused on frontend workflows
  (Next.js / React / Tailwind).
- **Strengths:** High-quality frontend skills.
- **Weaknesses:** Vercel-scoped; not portable across problem domains.
- **Reuse:** Reference for `frontend` skill authoring quality bar.
- **Verified (2026-08-11):** `could not verify` — consistently described
  across multiple secondary sources as "Vercel's official Skills CLI
  tool," but no direct license confirmation (root LICENSE file) was
  retrieved during this pass. **Must be fetched and confirmed directly
  before any reuse or vendoring**; do not assume Apache-2.0/MIT by
  association with the rest of the Vercel ecosystem.

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

## Verification pass summary (2026-08-11)

What live verification changed, in one place:

- **License corrections:** `anthropics/skills` is not uniformly MIT —
  mixed Apache-2.0 / source-available-per-folder (see `NOTICE`).
  `vercel-labs/skills` remains unverified and must be checked before any
  reuse.
- **Factual correction:** `github/spec-kit`'s CLI is Python, not
  TypeScript or Elixir.
- **Factual correction:** BMAD-METHOD's persona names differ from our
  original list (`pm` not "Business Manager"; QA has been consolidated
  into a `tea` role).
- **Scope correction (matters for ADR-0003/ADR-0005):** both
  `obra/superpowers` and `OpenHands/OpenHands` have moved further toward
  cross-agent portability than our Phase 0 notes assumed — superpowers
  now works natively across ~10 agents, and OpenHands now supports the
  Agent-Client Protocol to delegate to Claude Code/Codex/Gemini. This
  doesn't invalidate AIECP's differentiators (Evidence Model, Decision
  Trace, Behavioral Verification, typed Memory, autonomy policy,
  Project Intelligence — none of these appeared in any upstream, live
  or otherwise), but it does mean the portability gap we're solving is
  narrower than Phase 0 assumed, and worth re-scoping in Phase 1.
- **Not yet verified:** exact commit SHAs (no `git clone`/`gh api`
  access in the verifying environment — see `NOTICE`), and the detailed
  competitive-analysis.md capability matrix scores, which were derived
  from the same original training-knowledge pass and should be treated
  as directional rather than confirmed until spot-checked against
  current repo behavior.
