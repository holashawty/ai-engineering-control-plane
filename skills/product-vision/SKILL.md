---
name: product-vision
description: "Use after requirements-gathering in creation mode (--yarat) — researches domain standards via web search (recency-verification), identifies what similar products typically include, defines Launch-Ready V1 scope (NOT MVP), and sets 'wow factor' targets. Asks: 'Would a real user be delighted, not just satisfied?' Distinct from requirements-gathering (which captures user intent); this skill enriches that intent with market awareness and domain conventions. Writes: specs/product-vision.md. Reads: specs/requirements.md. Novel to AIECP; inspired by BMAD-METHOD's Product Owner persona."
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec]
---

# Product Vision

## When to use this skill

In **creation mode** (`--yarat` / greenfield, or any orchestrator
run whose `classify-goal` Decomposition Decision names planning
skills), immediately after `requirements-gathering` produced
`specs/requirements.md` and BEFORE `project-planning`. This skill
is the **market-aware enrichment** layer: it takes the user's
stated intent and asks "is this rich enough?" — researching what
similar products in the same domain typically include, surfacing
gaps the user didn't mention, and defining a "Launch-Ready V1"
scope that aims at delight rather than mere viability.

**Distinct from `requirements-gathering`**: that skill captures
what the USER said — verbatim capture + 3 clarifying questions,
deliberately NOT injecting market knowledge during elicitation
(that would contaminate the user's words). This skill runs AFTER
elicitation is closed precisely so the user's intent is preserved
untouched — then enriches it with domain standards the user may
not have known to ask for. A user who said "a game where you
click and earn" did not mention upgrades; this skill's job is to
discover that upgrades are domain-standard for idle games and
add them to the vision.

**Distinct from `project-planning`**: that skill decomposes an
AGREED scope into phases/tasks/dependencies — it preserves the
scope, does not widen it. This skill runs BEFORE project-planning
precisely to widen the scope (where warranted by domain
standards) so the plan that follows decomposes a *Launch-Ready
V1*, not a minimal viable sketch. **Distinct from `ux-design`**
(decides HOW the product looks) and **`creative-expansion`**
(runs DURING/AFTER implementation, suggests delight enrichments
for what is already being built): this skill decides WHAT the
product IS — which features make the cut, which are domain-
standard and non-negotiable, which are genuinely Phase-2+.

**Banned vocabulary:** the term "MVP" is BANNED in this skill's
output. Per `constitution/engineering-principles.md`'s Mode-
Dependent Virtues table, "MVP" in creation mode drifts toward
underwhelming scope. Use **"Launch-Ready V1"** instead — the
smallest scope a REAL user would call *delightful*, not the
smallest scope that *works*.

## Procedure

### 1. Read specs/requirements.md

Open `specs/requirements.md` (produced by `requirements-gathering`).
If missing, transition to blocked with the precise gap
"`specs/requirements.md` not found — run `requirements-gathering`
first." Mirrors `ux-design` step 1's refusal to design without
requirements. Extract: the verbatim user idea, personas, MVP
scope (in / out / Phase 2+), target platform. These seed step 2's
domain classification and step 6's Launch-Ready V1 scope (which
must honor — not silently rewrite — the user's declared
out-of-scope items).

### 2. Determine the domain

Classify the product into ONE primary domain (and 0-1 secondary
if genuinely hybrid). The domain drives step 3's search queries
and step 6's completeness checks. Common domains: **game**
(idle/incremental, puzzle, RPG, platformer, simulation,
strategy), **e-commerce** (storefront, marketplace, subscription
box), **SaaS / web app** (dashboard, productivity, B2B), **CLI /
developer tool**, **mobile app**, **API / library / SDK**,
**content site**.

Record the classification as an `Event` of `kind: "observation"`
with `payload.domain`, `payload.secondary`, `payload.why` citing
specific phrases from the user's verbatim idea that drove the
classification. A classification without a cited `why` is a
guess dressed as a finding — the same anti-hallucination rule
`evidence-engineering` step 2 applies to all agent conclusions.

### 3. Web-search domain standards (recency-verification)

For the classified domain, perform a **web search** to enumerate
what similar products typically include. This is a mandatory
`recency-verification` step (per `skills/recency-verification/SKILL.md`
step 2): "what do domain-X products typically include" is a
time-sensitive claim (best practices evolve — e-commerce checkout
flows shifted significantly between 2020 and 2026 with one-click
checkout, BNPL, Apple Pay). Query shape:

- `"<domain> product typical features <current-year>"` — broad
  sweep.
- `"<domain> launch-ready feature checklist <current-year>"` —
  baseline.
- `"<domain> common user expectations <current-year>"` — what
  users assume is present.

For each query, invoke `web_search` (if available) and record the
result as an `Event` of `kind: "action"`, `source:
"<adapter_id>:web_search"`, with `payload.query`,
`payload.result_summary`, `payload.result_url`. Per
`recency-verification` step 4, if `web_search` is unavailable,
emit `Decision(what: "recency_unverifiable", validated: false)`
and transition to blocked on `no_recency_verification_available`
— do NOT assert domain standards from training-data memory.
Minimum: 2 distinct queries per primary domain. All query
`Event`s are evidence — step 7's Decision MUST cite them.

### 4. Build the Domain Standards table

Under a `## Domain Standards` heading in `specs/product-vision.md`,
write a table with one row per domain-standard feature surfaced by
step 3's searches:

| Standard Feature | Source | In requirements? | Action |
|---|---|---|---|
| Cart / persistent basket | Event#e5 | ❌ Not mentioned | GAP — add to Launch-Ready V1 |
| Guest checkout option | Event#e7 | ❌ Not mentioned | GAP — consider adding |
| Product reviews | Event#e9 | ✅ US-3 | Already covered |
| Search / filter | Event#e7 | ❌ Not mentioned | GAP — add to Launch-Ready V1 |

Each row's `Source` MUST cite the web_search `Event` id — a
feature claim without a source citation is an assertion from
memory, which `recency-verification` step 3 forbids.

**The "GAP" judgment is the heart of this skill.** A row marked
GAP means: this feature is domain-standard, the user did not ask
for it, but in creation mode domain standards are EXPECTED, not
optional. Per `constitution/engineering-principles.md`'s Mode-
Dependent Virtues table: "Research domain standards, add standard
features even if user didn't explicitly ask." A game without
progression is not Launch-Ready V1. An e-commerce without cart is
not Launch-Ready V1. A CLI without `--help` is not Launch-Ready
V1. This skill does NOT accept "the user didn't ask for it" as a
reason to omit a domain-standard feature — that is fix-mode
thinking misapplied to creation mode. A feature is "domain-
standard" only if ≥2 independent sources mention it OR one
authoritative source explicitly states it is standard; a single
blog post recommending a feature is a "consider," not a "GAP —
add."

### 5. Define the Core Loop

Under a `## Core Loop` heading, name the product's fundamental
interaction cycle — the smallest repeatable sequence of user
actions that delivers the product's value. Examples:

- **Idle game:** click → earn currency → upgrade → earn faster →
  repeat.
- **E-commerce:** discover product → add to cart → checkout →
  receive → repeat.
- **SaaS dashboard:** log in → view data → take action → see
  outcome → repeat.
- **CLI tool:** invoke command → read output → adjust flags →
  re-invoke → repeat.

The Core Loop is the **coherence test** for step 6's Launch-Ready
V1 scope: every in-scope feature must either BE part of the loop
or DIRECTLY SUPPORT the loop. A feature that is neither is a
Phase-2+ candidate. A Launch-Ready V1 whose scope does not
include the full Core Loop is not Launch-Ready — it is a demo of
one stage of the loop, which is the underwhelming-product failure
mode ADR-0037 exists to prevent. State the loop as a numbered
cycle and name the US-N ids per stage; missing stages are gaps
to add to step 6's must-have list.

### 6. Define Launch-Ready V1 Scope (NOT "MVP")

Under a `## Launch-Ready V1 Scope` heading, write FOUR subsections:

#### 6a. Must-have features

The domain-standard features that are NON-NEGOTIABLE for a real
user to consider the product complete. Each entry cites the
feature name, why it is non-negotiable (domain standard, core-
loop stage, or user-story dependency), and the corresponding
US-N id from requirements OR a new US-N id to be added (mark as
`US-N (NEW)` so `project-planning` knows to fold it into the
plan, not assume it was already there). A must-have list
identical to the requirements' MVP in-scope list is a smell:
either the requirements were unusually complete (rare) or this
skill didn't actually research domain standards (common — verify
step 3 ran).

#### 6b. Wow Factor Targets

1-3 SPECIFIC features that would make a real user say "wow" —
not "it works," not "that's nice," but "wow." Each target names
the feature concretely (not "polish" or "delight" — name the
actual mechanism), states the wow-trigger (what user action
produces what surprise), and states the implementation surface
(which file/component/asset the wow lives in, so
`creative-expansion` and `frontend` know where to look). A Wow
Factor Target of "good UX" is not a target — it is a vibe.
"Confetti burst when the user clears their first level, with a
number count-up animation on the score" IS a target.

#### 6c. Core Loop completeness

State explicitly: "The Core Loop (step 5) is fully implemented
by the Must-have features (6a). [Or: stage N is deferred to
Phase 2+ because <reason> — this is a deliberate deferral, not
an omission.]" A Launch-Ready V1 that ships with a half-loop is
the canonical underwhelming product; this subsection forces an
explicit statement so the orchestrator's quality-gate can verify
it.

#### 6d. Post-Launch Enhancements

Genuinely future work — features that would ENRICH the product
but are NOT required for a real user to be delighted by V1. The
test: if a user received V1 without this feature, would they
still say "wow"? If yes → Post-Launch. If no → it belongs in 6a
or 6b, not here. This subsection is NOT a dumping ground for
deferred must-haves — a "Post-Launch Enhancement" that is
actually a deferred core-loop stage is a process violation; the
quality-gate will fail the run with `quality_gate_failed`.

### 7. Emit a Decision

Emit a `Decision` (`evidence/schema/decision.schema.json`) with:

- `what: "product_vision_defined"` — canonical what-field.
  (Suffix `:<feature-name>` if multiple visions are produced in
  one session, mirroring `requirements_gathered`'s convention.)
- `why` — one paragraph: classified domain, count of domain
  standards researched, count of GAPs found, Wow Factor Targets,
  loop-completeness status.
- `validated: false` — proposal, not verified outcome. Becomes
  `validated: true` only when the orchestrator's `quality-gate`
  state confirms the implementation honors the vision.
- `result: "pending"`, `made_by: "agent"`.
- `evidence_refs` — pointing at: (a) the `requirements_gathered`
  Decision, (b) every web_search `Event` from step 3, (c) the
  domain-classification `Event` from step 2.
- `alternatives` — naming at least one rejected Launch-Ready V1
  scope alternative (e.g., "could have shipped without the
  upgrade tree — rejected because idle games without progression
  are demos, not products, per Event#e5").

The `Decision.trace_ref` MUST point at the `Trace` wrapping the
research `Event`s, per `decision.schema.json`'s required
`trace_ref` field.

### 8. Write to specs/product-vision.md

Write the complete product-vision document to
`specs/product-vision.md` at the project root. If the file
already exists, APPEND a new `## Product Vision Run — <iso-date>`
section rather than overwriting — prior visions are historical
artifacts that downstream `Expected` entities may reference via
`source_ref`; overwriting would dangle them, the same failure
mode `specification` step 1 exists to prevent for `specs/spec.md`.
If `specs/` does not exist, create it. The file-level contract
(per `skills/README.md`):

| File | Who WRITES | Who READS |
|---|---|---|
| `specs/product-vision.md` | product-vision | planning, ux-design, creative-expansion, orchestrator quality-gate |

## Tool integration

- **`filesystem_read`**: read `specs/requirements.md` (required
  input), `.aiecp/project-intelligence.json` (if existing repo),
  prior `specs/product-vision.md`, prior `Decision`/`Trace`
  artifacts.
- **`filesystem_write`**: write `specs/product-vision.md`. All
  writes are to `specs/`, never to source code.
- **`shell_exec`**: declared because the skill MAY invoke
  `date -u +%Y-%m-%d` for the run-date stamp and `git rev-parse
  --abbrev-ref HEAD` for traceability. Also used as a fallback
  for the `web_search` step when the adapter exposes web search
  via a CLI tool rather than a declared capability.

## Validation

This skill is considered successful for a given run only if:

- `specs/requirements.md` was read. If missing, transitioned to
  blocked with a precise gap (not a fabricated vision).
- The domain was classified and the classification `Event` cites
  specific phrases from the user's verbatim idea as `why`.
- At least 2 web_search `Event`s were emitted (or a
  `recency_unverifiable` `Decision` was emitted and the run
  transitioned to blocked — the honest fallback for chat LLMs
  without browsing).
- The Domain Standards table has ≥3 rows, each with a cited
  source `Event` id. GAP rows have an explicit "add" or
  "consider" action.
- The Core Loop is stated as a numbered cycle with US-N ids per
  stage; missing stages are explicitly named as gaps.
- The Launch-Ready V1 Scope has all four subsections. At least
  one Wow Factor Target is named concretely (not "polish").
- The term "MVP" does NOT appear in the output (banned in
  creation mode per `engineering-principles.md`).
- A `Decision` with `what: "product_vision_defined"`,
  `validated: false`, `result: "pending"` was emitted, with
  `evidence_refs` pointing at the web_search `Event`s.
- `specs/product-vision.md` was written (or appended to) at the
  project root.
- No question was asked of the user — product vision is research
  + decision, not elicitation.

## Examples

**Happy path (idle game):** User said "an idle game where you
click to earn coins." `requirements-gathering` produced
`specs/requirements.md` with US-1 (click to earn), persona
"Casual Gamer Priya," web platform. → Step 2 classifies domain
as "game: idle/incremental" with `why` citing "click to earn."
→ Step 3 web-searches "idle incremental game typical features
2026" + "idle game launch-ready features." Results mention
upgrades, prestige, save/load, offline progression, achievements.
→ Step 4 Domain Standards table: upgrades (GAP — add), prestige
(consider — Phase 2+), save/load (GAP — add), offline progression
(GAP — add), achievements (consider). → Step 5 Core Loop: click
→ earn → upgrade → earn faster → repeat; US-1 covers stages 1-2,
stages 3-4 are gaps. → Step 6 Launch-Ready V1: must-have = US-1
+ US-2 (upgrade tree, NEW) + US-3 (save/load, NEW) + US-4
(offline progression, NEW); Wow Factor Targets = "upgrade-tree
reveal with stagger animation" + "first-prestige unlock with
confetti"; loop completeness = "full loop in V1"; post-launch =
prestige system, achievements, leaderboards. → Step 7 emits
`Decision(what: "product_vision_defined")` with `evidence_refs`
to 2 web_search Events. → Step 8 writes `specs/product-vision.md`.

**Failure mode (no web search → blocked):** Chat LLM without
browsing. Step 3 cannot fire `web_search`. → Emit
`Decision(what: "recency_unverifiable", why: "chat adapter has
no web_search; cannot research domain standards without
hallucinating from training data")` → transition to blocked on
`no_recency_verification_available`. The orchestrator's quality-
gate later sees no `product_vision_defined` Decision and emits
`quality_gate_failed`. Without this honest fallback, the skill
would fabricate "domain standards" from memory — the exact
failure `recency-verification` exists to prevent.
