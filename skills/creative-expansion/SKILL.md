---
name: creative-expansion
description: "Use during implementation in creation mode — suggests visual/interactive enrichments that would make the product delightful, not just functional. Asks: 'What micro-interactions, animations, visual feedback, or progression mechanics could elevate this?' Distinct from frontend (code-writing discipline); this skill is CREATIVE IDEATION. Emits Decision(what: 'creative_expansion_suggested') with specific enrichment suggestions. The orchestrator's quality-gate REQUIRES this skill to have run (ADR-0038). Reads: specs/product-vision.md + current implementation. Novel to AIECP."
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec]
---

# Creative Expansion

## When to use this skill

In **creation mode** (`--yarat` / greenfield), DURING or AFTER
implementation — once the product's functional core exists but
before the orchestrator's `quality-gate` state runs. This skill
is the **creative ideation** layer: it audits what has been built
and asks "what would make this *delightful*, not just functional?"
— surfacing enrichments (micro-interactions, animations, visual
feedback, progression mechanics) that elevate the user's
emotional experience from "it works" to "wow."

Per ADR-0038, the orchestrator's `quality-gate` state REQUIRES
this skill to have run before it can emit `quality_gate_passed`.
A creation-mode run that ships without a `creative_expansion_suggested`
Decision in its evidence chain will fail the quality-gate and
route back to `classify-goal` — the structural enforcement of
ADR-0037's Mode-Dependent Virtues ("when in doubt, EXPAND — ask
what would make this delightful").

**Distinct from `product-vision`** (per
`skills/product-vision/SKILL.md`): that skill runs BEFORE
implementation and decides WHAT features the product includes
(the upgrade tree, the cart, the search). This skill runs
DURING/AFTER implementation and decides HOW those features
*feel* — the upgrade-tree reveal animates with a stagger, the
cart-add triggers a bounce, the search-as-you-type shows a
skeleton loader. The two are sequential: product-vision decides
"we will build an upgrade tree"; creative-expansion later
decides "the upgrade-tree reveal should make the user gasp."

**Distinct from `frontend`** (per `skills/frontend/SKILL.md`):
frontend is the CODE-WRITING discipline — accessibility checks
(WCAG-level `axe` violations are blocking), responsive design
verification, component prop validation. That skill is for the
*moment of code change*. This skill is for the *moment of
creative ideation* — it doesn't write code, it suggests
enrichments that frontend (or the implementer) will then
realize with code. Frontend cites this skill's suggestions as
the source of "why does this button bounce?" — the bounce was
a creative-expansion suggestion, not a frontend invention.

**Distinct from `ux-design`** (per `skills/ux-design/SKILL.md`):
ux-design runs BEFORE implementation, designing wireframes and
flows. This skill runs DURING/AFTER, enriching the implemented
surface with delight that wireframes (which are static text
descriptions) cannot capture. A wireframe shows where the
button is; creative-expansion decides the button should pulse
gently when idle to invite the user's attention.

**Distinct from `self-red-team`** (per
`skills/self-red-team/SKILL.md`): that skill finds product-
completeness GAPS (missing features a competitor would have).
This skill finds product-enrichment OPPORTUNITIES (present
features that could feel more delightful). `self-red-team` is
critical ("what's missing?"); this skill is creative ("what
could be more delightful?"). Both run at the quality-gate; they
are complementary, not redundant.

## Procedure

### 1. Read specs/product-vision.md

Open `specs/product-vision.md` (produced by `product-vision`).
Extract the **Wow Factor Targets** (subsection 6b) — these are
the specific delights the vision declared the product would
deliver. Every suggestion this skill makes MUST trace back to
either: (a) implementing a Wow Factor Target that is not yet
implemented, or (b) enriching a feature that is implemented but
under-delighting relative to its potential. A suggestion with
no lineage to the vision's Wow Factor Targets AND no clear
domain-standard delight pattern is decorative noise — reject it
in step 6's `rejected` array with reason "not vision-aligned."

If `specs/product-vision.md` is missing, transition to blocked
with the precise gap "`specs/product-vision.md` not found — run
`product-vision` first. Creative expansion without a vision is
decoration without intent." Per ADR-0038, this skill cannot be
skipped in creation mode; the only valid escape is the prior
`product-vision` skill having run.

### 2. Inspect the current implementation

Read the source files that constitute the implemented product.
For a web app: read the component tree (`frontend/src/components/`),
the page routes, the styles. For a CLI: read the command modules,
the help text, the output formatters. For a game: read the scene
files, the entity definitions, the asset manifests. The goal is
not exhaustive reading but **identifying the user-facing surfaces**
where delight lives — the buttons, the transitions, the feedback
channels, the progression indicators.

Emit an `Event` of `kind: "observation"` recording the
implementation surface inventory:
`payload.implemented_features: [...]`,
`payload.user_facing_surfaces: [...]`. This `Event` is the
evidence that step 3-5's audits ran against a real
implementation, not a hypothetical one.

### 3. Visual feedback audit

For each user-facing surface, audit whether the product provides:

- **Click/tap feedback** — visual (button press animation, ripple
  effect), audio (click sound, success chime), haptic (mobile
  vibration). A click with no feedback feels broken even when it
  works.
- **Loading states** — skeleton screens (preferred for known
  layouts), spinners (for indeterminate waits), progress bars
  (for known durations). A blank screen during load feels
  crashed.
- **Success/error states** — toast notifications, inline
  banners, form-field-level errors. Silent success is missed;
  silent error is catastrophic.
- **Transition animations** — page transitions, element enter/exit,
  state-change animations. Instant cuts feel jarring; 200-300ms
  easing feels natural.
- **Particle effects / visual flourishes** — where the domain
  warrants (games: confetti on win; e-commerce: sparkles on
  successful checkout; SaaS: subtle ambient motion on the
  dashboard).

For each MISSING category, record a `suggestion` (step 6) with
priority `must-have` (click feedback, loading states, success/
error states are non-negotiable for any user-facing product) or
`should-have` (transitions, flourishes).

### 4. Interaction richness audit

For each interactive element, audit whether the product provides:

- **Hover/focus/active states** — every clickable element must
  visually respond to all three pointer/keyboard states. A
  button that doesn't change on hover feels dead; one that
  doesn't show focus is inaccessible.
- **Micro-interactions** — button press animations, card flips,
  number count-ups, toggle switches that animate. The difference
  between "functional" and "delightful" is largely
  micro-interactions.
- **Progress indication** — progress bars for long operations,
  level-up notifications for game progression, achievement
  unlocks, streak counters. Users need to FEEL their progress.
- **Delightful details** — easter eggs (the konami code, a
  hidden message), celebratory animations on milestones (1st
  purchase, 100th action, etc.), thoughtful sound design (not
  gratuitous — a single subtle click is better than ten sounds).

For each MISSING category, record a `suggestion` (step 6).
Hover/focus/active states are `must-have` (accessibility-
adjacent); micro-interactions and progress indication are
`should-have`; delightful details are `nice-to-have`.

### 5. Progression/completeness audit (domain-specific)

Apply the domain-specific audit from `product-vision` step 2's
classification:

- **Game:** upgrade tree (visible, navigable, satisfying to
  unlock)? achievement system (visible, rewarding to earn)?
  save/load (automatic, transparent to user)? difficulty curve
  (gentle ramp, no sudden walls)? prestige/reset loop (if
  applicable — gives long-term replayability)?
- **E-commerce:** product reviews (display + write)? wishlist
  / save-for-later? search with filters (price, category,
  rating)? recommendations ("you might also like")? related
  products?
- **SaaS / web app:** onboarding flow (guided first-run)?
  dashboard (the "aha" moment is visible)? settings (account,
  preferences, integrations)? user profile (avatar, name,
  role)? empty states (friendly, instructive, not "no data")?
- **CLI / developer tool:** `--help` (comprehensive, with
  examples)? `--version`? config file support (`~/.config/...`)?
  shell completion (bash/zsh/fish)? sensible defaults (zero-
  config works out of the box)? color output (with `--no-color`
  escape hatch for piping)?
- **Mobile app:** push notification permission (asked at a
  sensible moment, not on first launch)? offline mode (graceful
  degradation)? pull-to-refresh? swipe gestures? haptic
  feedback on key actions?
- **API / library / SDK:** `README` quick-start (5-minute path
  to first success)? examples directory? typed exports
  (TypeScript types, Python type hints, Go interfaces)?
  changelog? migration guide for breaking changes?

For each MISSING item, record a `suggestion` (step 6).
Domain-standard items are `must-have`; advanced items (e.g.,
shell completion) are `should-have` or `nice-to-have`.

### 6. Emit a Decision

Emit a `Decision` (`evidence/schema/decision.schema.json`) with:

- `what: "creative_expansion_suggested"` — canonical what-field.
- `why` — one paragraph summarizing: how many surfaces audited,
  counts per category (visual feedback, interaction richness,
  progression), top 3 must-have suggestions, top wow-target-
  aligned suggestion.
- `validated: false` — suggestions are proposals, not verified
  implementations. Becomes `validated: true` only when the
  orchestrator's `quality-gate` confirms the must-haves were
  implemented (or explicitly rejected with documented reason).
- `result: "pending"`, `made_by: "agent"`.
- `evidence_refs` — pointing at: (a) the `product_vision_defined`
  Decision (suggestions trace to its Wow Factor Targets), (b)
  the implementation-inspection `Event` from step 2.
- `alternatives` — naming at least one rejected enrichment
  direction (e.g., "considered adding background music —
  rejected because the persona is a workplace-SaaS user where
  audio would be intrusive").

The Decision payload MUST include four arrays (this is the
structured output the quality-gate verifies):

- **`suggestions`** — array of specific enrichments. Each entry:
  `{ name, category: "visual_feedback" | "interaction_richness"
  | "progression" | "delightful_detail", priority:
  "must-have" | "should-have" | "nice-to-have", target_surface:
  <file/component path>, vision_alignment: <Wow Factor Target
  id or "domain_standard"> }`.
- **`implemented`** — which suggestions are ALREADY present in
  the implementation (with evidence: file path + line range).
- **`missing`** — which suggestions are NOT yet implemented
  (these are the actionable asks).
- **`rejected`** — which suggestions were considered and
  explicitly rejected, with `reason` per entry (e.g.,
  "background_music — rejected: intrusive for persona's
  context"). Rejections are evidence of deliberate choice, not
  oversight — the quality-gate treats a missing suggestion with
  no `rejected` entry as an unaddressed gap.

The `Decision.trace_ref` MUST point at the `Trace` wrapping the
inspection events.

## Tool integration

- **`filesystem_read`**: read `specs/product-vision.md` (required
  input — the Wow Factor Targets are this skill's north star),
  source files of the current implementation (step 2), prior
  `creative_expansion_suggested` Decisions (if a revision).
- **`filesystem_write`**: append the creative-expansion
  suggestions to `specs/product-vision.md` under a new
  `## Creative Expansion Audit — <iso-date>` section (so the
  vision and the audit live together — the audit IS part of the
  vision, not a separate artifact). All writes are to `specs/`,
  never to source code (this skill SUGGESTS; the implementer or
  `frontend` WRITES the code).
- **`shell_exec`**: declared because the skill MAY invoke
  commands to enumerate the implementation surface (`ls
  frontend/src/components/`, `git ls-files`) and to check
  whether a suggested dependency is already installed
  (`cat frontend/package.json | grep framer-motion`). No code
  is executed, no tests are run — this skill is ideation, not
  verification.

## Validation

This skill is considered successful for a given run only if:

- `specs/product-vision.md` was read. If missing, transitioned
  to blocked with a precise gap (not a fabricated audit).
- An implementation-inspection `Event` was emitted recording the
  audited surfaces.
- All three audits (visual feedback, interaction richness,
  progression/completeness) were performed and recorded.
- The `suggestions` array has at least 3 entries with at least
  one `must-have` priority.
- Every suggestion has a `target_surface` (file/component path)
  and either a `vision_alignment` (Wow Factor Target id) or
  `"domain_standard"`.
- The `implemented` / `missing` / `rejected` arrays together
  account for every suggestion (no orphan suggestions).
- Every `must-have` priority suggestion in `missing` has either
  an implementation commitment OR a `rejected` entry with a
  documented reason — unaddressed must-haves cause
  `quality_gate_failed`.
- A `Decision` with `what: "creative_expansion_suggested"`,
  `validated: false`, `result: "pending"` was emitted, with
  `evidence_refs` pointing at the `product_vision_defined`
  Decision and the inspection `Event`.
- `specs/product-vision.md` was appended with the audit section.
- No question was asked of the user — creative expansion is
  ideation, not elicitation.

## Examples

**Happy path (idle game):** `product-vision` declared Wow
Factor Targets: "upgrade-tree reveal with stagger animation"
and "first-prestige unlock with confetti." Implementation has
the click-to-earn core + upgrade tree (static render) +
save/load. → Step 1 reads vision. → Step 2 inspects
`src/components/UpgradeTree.tsx`, `src/hooks/useGameState.ts`,
`src/App.tsx`. → Step 3 visual feedback audit: click feedback
= ✅ (number popup), loading states = ❌ (initial load is
blank), success/error = ❌ (save success is silent). → Step 4
interaction richness audit: hover/focus = ❌ (upgrade cards
don't respond), micro-interactions = ❌ (upgrade purchase is
instant cut), progress indication = ❌ (no level-up
notification). → Step 5 progression audit: upgrade tree ✅,
achievements ❌, save/load ✅, difficulty curve N/A. → Step 6
emits Decision with: `suggestions` = [stagger animation on
upgrade-tree reveal (must-have, vision-aligned: Wow Target
#1), confetti on first prestige (must-have, vision-aligned:
Wow Target #2), skeleton loader on initial load (must-have,
domain_standard), toast on save success (should-have,
domain_standard), card hover lift (should-have,
domain_standard), level-up notification banner (should-have,
domain_standard), achievement system (nice-to-have,
domain_standard)]; `implemented` = [click feedback,
upgrade-tree (static), save/load]; `missing` = [stagger,
confetti, skeleton, toast, hover lift, level-up banner,
achievements]; `rejected` = [background_music — reason:
persona "Casual Gamer Priya" plays during commutes, audio
intrusive]. The orchestrator's quality-gate sees all
must-haves either committed (in `missing` awaiting
implementation) or rejected-with-reason → emits
`quality_gate_passed` once the must-haves are implemented.

**Failure mode (must-have ignored → quality_gate_failed):**
Skill ran but the implementer marked "stagger animation" as
`rejected` with reason "no time." The orchestrator's
quality-gate sees a Wow Factor Target with no implementation
AND a `rejected` entry whose reason is "no time" (not a
legitimate domain/persona reason) → emits
`quality_gate_failed` → routes back to `classify-goal`. This
is the structural enforcement: "no time" is not an acceptable
rejection reason for a declared Wow Factor Target in creation
mode — that's the underwhelming-product failure mode ADR-0037
exists to prevent.
