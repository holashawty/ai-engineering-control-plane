---
name: ux-design
description: "Use after architecture-design (or in parallel for medium-scale projects) — designs user experience: wireframes, user flows, journey maps, design system basics (colors, typography, spacing). Distinct from frontend (which is code-writing discipline: accessibility, responsive); this skill is DESIGN decision-making. Writes: specs/ux/wireframes.md + specs/ux/flows.md + specs/ux/design-system.md. Reads: specs/requirements.md + specs/plan.md. Novel to AIECP; no upstream equivalent found in docs/research.md."
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec]
---

# UX Design

## When to use this skill

After `architecture-design` (for large projects) or in parallel
with it (for medium-scale projects where the UX and architecture
co-evolve). This skill is the **design-decision** layer: it
produces wireframes, user flows, journey maps, and design-system
basics that `frontend` (the code-writing discipline) will later
implement.

**Distinct from `frontend`** (per `skills/frontend/SKILL.md`):
frontend is a cross-cutting DOMAIN skill covering accessibility
checks (WCAG-level `axe` violations are blocking), responsive
design verification (viewport matrix as `predicate_kind:
"state_property"`), visual regression awareness (snapshot updates
are `Decision`s), and component prop validation. That skill is
for the **moment of code change** — when a `<SaveButton>` is
being added, modified, or removed. This skill is for the **moment
of design decision** — before any component exists, this skill
decides what the SaveButton should look like, where it lives in
the flow, what color it is, and what its hover/focus/disabled
states communicate. Frontend cites the wireframes + design system
this skill writes; this skill writes the design that frontend
will later implement with accessibility discipline.

The two skills are complementary, not overlapping: this skill
produces the *design intent* (the wireframe says "the Save button
is in the top-right, primary color, with a floppy-disk icon");
frontend produces the *code that honors the intent* (the React
component renders a `<button>` with `aria-label="Save"`,
`type="submit"`, the project's primary color via the design-
system token, and a `disabled` state with `aria-busy`). A
wireframe without a frontend implementation is a sketch; a
frontend implementation without a prior wireframe is a designer-
less component — both fail, in different ways.

**Distinct from `requirements-gathering`** (per
`skills/requirements-gathering/SKILL.md`): requirements-gathering
discovers HUMAN intent (who, what, why). That skill produces
user stories + personas. This skill *uses* those personas (step
3 below designs a journey map per persona) and user stories (step
2 designs a flow per story). A UX designed without prior
requirements is a design for an imaginary user; this skill
refuses to proceed if `specs/requirements.md` is missing.

**Distinct from `architecture-design`** (per
`skills/architecture-design/SKILL.md`): architecture-design
makes TECHNICAL decisions (stack, pattern, database, API
contracts, deployment). That skill produces
`specs/contracts.md` + `specs/invariants.md` +
`specs/architecture.md`. This skill reads the API contracts (an
endpoint's response schema implies what data the wireframe can
display) and the deployment topology (a serverless deploy may
add latency that the UX must account for with loading states).
UX and architecture co-evolve: if the UX requires real-time
updates (a live dashboard), the architecture must include a
websocket or polling mechanism — a conflict surfaced here
becomes a `conflicts_with_requirements`-adjacent feedback to
architecture.

**Distinct from `behavioral-simulation`** (per
`skills/behavioral-simulation/SKILL.md`): behavioral-simulation
generates plausible end-user interaction sequences (clicks, form
submissions, edge-case inputs, accessibility paths) against
CHANGED behavior — it runs *after* implementation, at the
`verify` state. This skill runs *before* implementation, at the
design state. The two are sequential: this skill designs the
flow; `frontend` implements it; `behavioral-simulation` simulates
users interacting with the implementation; `frontend` step 5
composes with `behavioral-simulation` to verify the rendering
across the simulated states.

## Procedure

### 1. Read specs/requirements.md + specs/plan.md

Open both files. This skill cannot proceed without them. If
either is missing, transition to blocked with the precise gap
"specs/<file>.md not found — run <predecessor-skill> first."
A UX designed without requirements is a design for an imaginary
user; a UX designed without a plan is a design that ignores which
user stories are MVP-critical (and thus which flows must be
designed first).

Extract from `specs/requirements.md`:

- The personas — each persona gets a journey map (step 4).
- The user stories — each MVP user story gets a user flow (step 2).
- The accessibility needs declared per persona — these become
  accessibility invariants in the design system (step 5).
- The target platform (web / mobile / desktop) — determines the
  wireframe canvas dimensions and the design-system's responsive
  breakpoints.

Extract from `specs/plan.md`:

- The MVP scope (in / out / Phase 2+) — only MVP user stories
  get full wireframes; Phase-2+ stories get a one-line "Phase 2
  placeholder" note, not a full design.
- The phases — UX for Phase 1 (MVP) is designed in detail; UX
  for Phase 2+ is sketched at a high level only, to avoid
  over-investing in designs that may change before they ship.

If `specs/contracts.md` exists (from `architecture-design`),
read the API contracts — each endpoint's response schema implies
what data a wireframe can display. A wireframe that shows a
field the API does not return is a design-implementation mismatch
caught here, not at frontend-implementation time.

### 2. Design user flows

In `specs/ux/flows.md`, write one `### Flow-N: <persona> → <story>`
block per MVP user story. Each flow describes the path from
entry to exit for that persona achieving that story's benefit.

A flow is a sequence of *screens* + *actions* + *decisions*:

```
Entry: User opens /plants (web) / taps Plants tab (mobile)
  ↓
Screen: Plants list (empty state if no plants)
  ↓ action: tap "Add plant"
Screen: Add-plant form (name, species, watering-frequency)
  ↓ action: fill + submit
  ↓ decision: valid?
    ├─ yes → Screen: Plant detail (confirmation)
    └─ no  → Screen: Add-plant form (errors inline)
  ↓
Exit: Plant detail (user can log a watering)
```

Each flow MUST name:

- **Entry** — how the user arrives at the flow (URL, tab, push
  notification, deep link). A flow without an entry is a screen
  no one reaches.
- **Screens** — each named (e.g., "Plants list", "Add-plant
  form"). Each screen gets a wireframe in step 3.
- **Actions** — what the user does on each screen (tap, type,
  submit, swipe). Each action maps to a user-story Given/When/
  Then clause.
- **Decisions** — branch points (valid/invalid, success/error,
  auth/no-auth). Each decision names the alternative path.
- **Exit** — the terminal screen + what the user can do next.
  A flow without an exit is a dead-end screen.

Each flow is a separate `### Flow-N` heading — do not collapse
multiple stories into one flow. A flow that covers "log in AND
view dashboard AND edit profile" is three flows, because each
will be implemented as a separate set of components and tested
as a separate user journey by `behavioral-simulation`.

### 3. Design wireframes

In `specs/ux/wireframes.md`, write one `### Wireframe-N: <screen-
name>` block per screen named in any flow (step 2). Wireframes
are **text-based** — either ASCII art or a structured prose
description. This skill deliberately does NOT produce image
wireframes (Figma, Sketch) because:

1. Text wireframes are diff-able in git (image wireframes are
   binary blobs that produce unreviewable diffs).
2. Text wireframes are accessible to screen-reader-using
   designers reviewing the design (image wireframes are not,
   per `skills/frontend/SKILL.md`'s accessibility discipline —
   the discipline applies to the design process, not only the
   implemented UI).
3. Text wireframes are schema-checkable: each wireframe can be
   cited by an `Expected` with `source_ref:
   "specs/ux/wireframes.md#Wireframe-N"` and the predicate can
   be a structured claim ("the Add-plant form has 3 fields: name,
   species, watering-frequency-days, in that tab order").

An ASCII wireframe for the Plants list:

```
┌─────────────────────────────────────┐
│  Plants              [+ Add plant]  │  ← header (sticky)
├─────────────────────────────────────┤
│  🌱 Fiddle Leaf Fig                 │  ← plant card (tap → detail)
│     Last watered: 3 days ago        │
│     Next water in: 4 days            │
├─────────────────────────────────────┤
│  🌵 Cactus                           │
│     Last watered: 12 days ago       │
│     Next water in: 18 days           │
├─────────────────────────────────────┤
│  (empty state if no plants:)        │
│  "No plants yet. Tap + to add one."  │
└─────────────────────────────────────┘
```

Each wireframe MUST name:

- **Screen name** — matches the flow's screen name (step 2).
- **Layout** — the ASCII art OR a structured prose description
  ("header with title 'Plants' and a primary button '+ Add
  plant' on the right; body is a vertical list of plant cards,
  each card showing emoji + name + last-watered + next-water").
- **Interactive elements** — each button, link, form field, tab,
  named with its label AND its action (e.g., "[+ Add plant]
  button → navigates to Add-plant form (Flow-1)").
- **States** — empty state (no data), loading state (fetching),
  error state (fetch failed), populated state (has data). Each
  state is a separate wireframe section, NOT collapsed — a
  wireframe that shows only the populated state hides the empty
  state that 100% of new users see first.
- **Accessibility notes** — for each interactive element, name
  its accessible name, role, and keyboard-reachability (per
  `skills/frontend/SKILL.md` step 3's accessibility-invariant
  `Expected`). The wireframe is where the a11y intent is declared;
  the frontend implementation is where it is verified.

### 4. Design journey map

In `specs/ux/flows.md` (under a `## Journey Maps` heading, after
the per-story flows), write one `### Journey-Persona-N: <persona-
name>` block per persona from `specs/requirements.md`. A journey
map describes the user's **emotional + functional** experience
across the WHOLE product, not just one flow.

A journey map is a table (renderable in Markdown) with rows =
journey stages and columns = dimensions:

| Stage | User action | Thinking | Feeling | Pain point | Opportunity |
|---|---|---|---|---|---|
| Discover | Hears about app from a friend | "Is this worth my time?" | Curious but skeptical | Doesn't know if it'll fit their plants | Show a 30-sec demo on the landing page |
| Onboard | First open, adds first plant | "How do I add my fiddle leaf?" | Engaged if it's fast | Empty state is intimidating | Pre-seed with a "demo plant" they can delete |
| Daily use | Logs waterings | "Did I water yesterday?" | Confident if the schedule is clear | Forgets which plant is which | Color-code plants; show "last watered" prominently |
| ... | ... | ... | ... | ... | ... |

The journey map's purpose is to surface **pain points and
opportunities** that per-screen wireframes miss. A wireframe
shows what the screen looks like; a journey map shows what the
user FEELS across the whole product. The "pre-seed with a demo
plant" opportunity in the Onboard stage is a design decision
that no per-screen wireframe would surface — it requires seeing
the journey from Discover to Daily-use as a whole.

### 5. Define design system basics

In `specs/ux/design-system.md`, define the project's foundational
design tokens. These are the constraints `frontend` will cite
when implementing components (so the implemented UI is consistent
without each component re-deciding "what's our primary blue?").

The design system has 4 sections:

#### 5a. Color palette

- **Primary** — the main brand color (used for primary buttons,
  active states, links). Name the hex + the WCAG contrast ratio
  against the background (per `skills/frontend/SKILL.md` step 8,
  WCAG AA is the default minimum — 4.5:1 for normal text, 3:1
  for large text).
- **Secondary** — the supporting color (used for secondary
  buttons, hover states).
- **Neutral** — grays for text, borders, backgrounds (a 5-7 step
  ramp from `gray-50` to `gray-900`).
- **Semantic** — success (green), warning (yellow), error (red),
  info (blue). Each with the WCAG contrast ratio verified.
- **Background** — the page background (white, off-white, or a
  dark-mode variant if the requirements specify dark mode).

Each color entry: hex value, usage, WCAG contrast ratio against
the relevant background. A color without a verified contrast
ratio is a `skills/frontend/SKILL.md` step 8 violation waiting
to happen — declare the ratio now so `axe` doesn't fail at
implementation time.

#### 5b. Typography

- **Font family** — primary (body) + secondary (headings, if
  different). Name the font AND a web-safe fallback stack
  (per `recency-verification`: if the font is a Google Font,
  verify the font is still available at the cited URL before
  asserting it).
- **Type scale** — a modular scale (e.g., 12 / 14 / 16 / 20 /
  24 / 32 / 48 px), with each step named (`caption`, `body`,
  `subtitle`, `title`, `h3`, `h2`, `h1`). Do NOT pick arbitrary
  sizes; use a ratio (minor third 1.2, major third 1.25, perfect
  fourth 1.333) so the scale is internally consistent.
- **Line height** — per size (body 1.5, headings 1.2).
- **Font weight** — regular (400) for body, medium (500) or
  semibold (600) for emphasis, bold (700) for headings.

#### 5c. Spacing

- **Base unit** — 4px or 8px (pick one; the whole system uses
  multiples of it).
- **Spacing scale** — 0 / 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
  (for a 4px base). Each step named (`space-0`, `space-1`, ...).
- **Usage rules** — component-internal padding (8-16px), section
  gaps (24-48px), page margins (16-32px mobile, 48-64px desktop).

#### 5d. Component library basics

A starter list of components the MVP will need (one line each,
not a full spec — the full spec is `frontend`'s job at
implementation time):

- **Button** — primary / secondary / ghost variants; states:
  default / hover / focus / active / disabled.
- **Input** — text / number / select / textarea; states: default /
  focus / error / disabled; always with an associated `<label>`.
- **Card** — for list items (plant cards in the wireframe above).
- **Modal** — for confirmations and forms that benefit from
  focus-trapping.
- **Toast** — for transient success/error notifications.
- **Empty state** — a reusable component for "no data yet" states
  (per the journey map's Onboard-stage opportunity).

Each component names the design-system tokens it uses (the
primary Button uses `color-primary` for its background, `space-2`
for its padding, `font-body` for its label). This is the bridge
from design-system to implementation: a `frontend` component
that hardcodes `#3B82F6` instead of `var(--color-primary)` is a
design-system violation.

### 6. Domain Conventions & Visual Polish

This step is **creation-mode only**. In fix/maintenance mode
(per `constitution/engineering-principles.md` "Mode-Dependent
Virtues"), this step is SKIPPED — fix mode does not add visual
polish to a bug fix. If the orchestrator's `classify-goal`
classified this session as fix/maintenance, jump to step 7 (Emit
a Decision) and note in the Decision's `why` that step 6 was
skipped per mode-dependent virtues.

In creation mode, this step ensures the UX is not just internally
consistent (step 5) but also **externally competitive** — that
it matches what users in this product domain have come to expect.
A design-system in isolation produces a coherent-but-generic UI;
this step pulls in the domain-specific visual/interactive
conventions that make the product feel native to its genre. This
is the UX-design analogue of `recency-verification`: do NOT
assert "a game should have particle effects" from training-data
memory — verify what similar products in THIS domain actually
ship today.

#### 6a. Research domain conventions (live, not static)

Use the `recency-verification` skill (`skills/recency-
verification/SKILL.md`) plus web search to research what similar
products in this domain typically have visually and
interactively. This is NOT a static checklist — the conventions
evolve (e.g., toast notifications displaced alert dialogs for
transient feedback ~2018; skeleton loaders displaced spinners
for above-the-fold content ~2020). Live research each time.

Run web searches shaped like `"<product-type> UI conventions
<year>"` or `"<domain> app design patterns <year>"`. For each
search, emit an `Event` (`evidence/schema/event.schema.json`)
with `kind: "action"`, `source: "web_search"`, `payload.query`
and `payload.result_summary` (one-sentence paraphrase of the top
result, plus `payload.result_url` if available). These Events are
the audit trail that the conventions cited in
`specs/ux/domain-conventions.md` came from current research, not
training-data memory — the same audit trail `recency-
verification` step 2 requires for any time-sensitive claim.

Indicative examples (NOT a static list — verify each time):
the actual conventions in each domain shift, and the list below
is illustrative of the *kind* of convention to look for, not the
definitive set:

- **Game domain** — particle effects on click, evolution/
  transformation animations, floating score numbers, achievement
  toasts, background atmosphere (star field, gradient, parallax),
  sound-effect-on-action feedback, progress bars for long
  actions.
- **E-commerce** — product hover zoom, cart badge count animation
  on add, checkout progress steps (cart → shipping → payment →
  confirm), wishlist heart animation, image gallery with
  thumbnails, "recently viewed" carousel.
- **SaaS dashboard** — loading skeleton (not spinner) for above-
  the-fold data, data-viz charts (line/bar/donut), toast
  notifications for save success, empty states with
  illustrations + CTA, keyboard shortcuts (cmd+K command
  palette).
- **CLI tool** — colored output (success green, error red,
  warning yellow), progress bar for long operations, spinner
  for indeterminate waits, `--help` formatting with usage /
  flags / examples, exit codes that follow the POSIX convention.

If `product-vision` skill has already run and produced
`specs/product-vision.md` with domain standards + wow-factor
targets, READ it first — this step should BUILD ON that research,
not duplicate it. Cite `specs/product-vision.md` in the Events
emitted here.

#### 6b. Define which domain conventions to include

For each convention discovered in 6a, decide:
**include in Launch-Ready V1** / **defer to Post-Launch** /
**reject**. Record the decision inline. Domain-standard
conventions default to INCLUDE — rejecting a domain-standard
convention requires a documented reason (e.g., "rejected hover
zoom: target platform is mobile-first, hover is not a primary
input"). This mirrors `requirements-gathering`'s step 4 KEY
PRINCIPLE: domain standards are non-negotiable for Launch-Ready
V1.

#### 6c. Define Visual Polish Targets

Identify 1-3 specific visual/interactive elements that would
make a user say "wow" — not just "it works" but "this is
delightful." These are the creation-mode analogue of the
"stretch goals" in `product-vision`: concrete, nameable
elements the implementation skill will cite. Each target must
be:

- **Specific** — "particle burst on score increment" not "nice
  animations".
- **Implementable** — names the technical mechanism (Canvas
  particle system, CSS keyframe, SVG morph, etc.).
- **Testable** — names an observable behavior (`behavioral-
  simulation` can verify the particle burst fires on score
  change).

These targets become `Expected` entities (per `specification`)
with `source_ref: "specs/ux/domain-conventions.md#visual-polish-
targets"` so the implementation phase can be checked against
them — without this, "delightful" is subjective and
unverifiable.

#### 6d. Write findings to specs/ux/domain-conventions.md

Write the research findings, decisions, and Visual Polish
Targets to `specs/ux/domain-conventions.md` (a FOURTH file under
`specs/ux/`, alongside `flows.md` / `wireframes.md` / `design-
system.md`). Structure:

```
## Domain Conventions (researched <iso-date>)

### Research sources
- <Event id> — <query> → <result_summary> (<result_url>)

### Conventions included in Launch-Ready V1
- <convention> — <why include> — <wireframe ref>

### Conventions deferred to Post-Launch
- <convention> — <why defer>

### Rejected conventions
- <convention> — <why reject>

## Visual Polish Targets
1. <target> — <mechanism> — <observable behavior>
2. <target> — <mechanism> — <observable behavior>
3. <target> — <mechanism> — <observable behavior>
```

If the file already exists (a prior ux-design run), APPEND a
new `## Domain Conventions Revision — <iso-date>` section rather
than overwriting, mirroring the append-don't-overwrite discipline
this skill applies to its other three output files.

### 7. Emit a Decision

Emit a `Decision` (`evidence/schema/decision.schema.json`) with:

- `what: "ux_designed"` — the canonical what-field for this skill's
  output.
- `why` — one paragraph summarizing: how many flows, how many
  wireframes, how many journey maps, and the top 1-2 design
  decisions (e.g., "chose a card-based list over a table because
  the primary persona uses a phone where cards reflow better").
- `validated: false` — the UX design is a proposal, not a verified
  outcome. It becomes `validated: true` only when `frontend`
  implements the components AND `behavioral-simulation` +
  `behavioral-verification` confirm the implemented UI matches
  the wireframes and meets the accessibility invariants.
- `result: "pending"`.
- `made_by: "agent"`.
- `evidence_refs` — pointing at (a) the `requirements_gathered`
  Decision (the UX exists to serve the requirements' personas),
  (b) the `plan_created` Decision (the UX covers the MVP user
  stories), (c) the `architecture_designed` Decision if it ran
  (the UX honors the API contracts' response shapes).
- `alternatives` — naming at least one rejected design alternative
  per major design decision (e.g., "could have used a table layout
  for the plants list — rejected because the primary persona is
  mobile-first and tables reflow poorly at <480px viewport").

The `Decision.trace_ref` MUST point at the `Trace` wrapping the
inspection events (reading requirements + plan + contracts).

### 8. Write to specs/ux/ (create directory if needed)

Write four files under `specs/ux/` (three in fix mode, where step
6 is skipped):

- `specs/ux/flows.md` — user flows (step 2) + journey maps (step 4).
- `specs/ux/wireframes.md` — wireframes (step 3).
- `specs/ux/design-system.md` — design system (step 5).
- `specs/ux/domain-conventions.md` — domain conventions + Visual
  Polish Targets (step 6, creation mode only).

If the `specs/ux/` directory does not exist, create it. This is
the home for all UX artifacts; per the file-level contract,
`specs/ux/` is WRITTEN by `ux-design` and READ by
`architecture-design` (which checks whether UX-implied real-time
requirements conflict with the architecture) and `frontend`
(which implements the wireframes + design system).

If any file already exists (a prior ux-design run), APPEND a new
`## UX Revision — <iso-date>` section rather than overwriting.
Prior wireframes are historical artifacts that downstream
`Expected` entities may reference via `source_ref`; overwriting
would dangle them.

## Tool integration

- **`filesystem_read`**: read `specs/requirements.md` (required
  input), `specs/plan.md` (required input), `specs/contracts.md`
  (if architecture-design has run — the API contracts constrain
  what data wireframes can display), prior `specs/ux/` files (if
  this is a revision), and `.aiecp/project-intelligence.json` (if
  the repo is existing — the detected frontend framework informs
  the design-system's component-naming conventions: React uses
  PascalCase, Vue uses kebab-case).
- **`filesystem_write`**: write `specs/ux/flows.md`,
  `specs/ux/wireframes.md`, `specs/ux/design-system.md`. Create
  `specs/ux/` if needed. All writes are to `specs/ux/`, never to
  source code.
- **`shell_exec`**: declared because the skill MAY invoke
  commands to inspect the repo's existing frontend (if any) for
  consistency — `ls frontend/src/components/` to see what
  components already exist (so the design system names them
  consistently), `cat frontend/package.json` to see what UI
  library (if any) is already in use (so the design system's
  component list aligns with it rather than proposing a parallel
  set). Also used for `recency-verification` of any font/ icon-
  library availability claims.

## Validation

This skill is considered successful for a given run only if:

- `specs/requirements.md` and `specs/plan.md` were both read.
  If either was missing, the skill transitioned to blocked with
  a precise gap.
- `specs/ux/flows.md` contains at least one `### Flow-N` block per
  MVP user story, each with entry, screens, actions, decisions,
  and exit.
- `specs/ux/wireframes.md` contains at least one `### Wireframe-N`
  block per screen named in any flow, each with layout,
  interactive elements, all states (empty/loading/error/populated),
  and accessibility notes.
- `specs/ux/flows.md` contains at least one `### Journey-Persona-N`
  block per persona, with the journey-stage table including pain
  points and opportunities.
- `specs/ux/design-system.md` contains all four sections: color
  palette (with WCAG contrast ratios), typography (with type scale),
  spacing (with base unit + scale), component library basics.
- Every interactive element in every wireframe has an accessibility
  note (accessible name, role, keyboard-reachability) — per
  `skills/frontend/SKILL.md` step 3, accessibility is declared at
  design time, not deferred to implementation.
- A `Decision` with `what: "ux_designed"`, `validated: false`,
  `result: "pending"` was emitted, with `evidence_refs` pointing
  at the `requirements_gathered` and `plan_created` Decisions.
- No question was asked during this skill's execution — UX design
  is a decision activity, not an elicitation. If a genuine
  ambiguity in the requirements is discovered, note it in the
  Decision's `alternatives` and proceed with a defensible
  default; do NOT ask the user (the question budget belongs to
  `requirements-gathering`).
- `specs/ux/` directory was created (if it did not exist) and all
  three files were written there.

## Examples

**Happy path (web MVP):** `requirements-gathering` produced a
plant-tracking web app (4 user stories: US-1 add plant, US-2 log
watering, US-3 see schedule, US-4 photo timeline; 1 persona:
Maya the hobbyist; target platform: web). `project-planning`
produced a 2-phase plan with 6 tasks. → Step 1 reads both. →
Step 2 designs 4 flows: Flow-1 (Maya → US-1: add a plant),
Flow-2 (Maya → US-2: log a watering), Flow-3 (Maya → US-3: see
schedule), Flow-4 (Maya → US-4: view photo timeline). Each flow
names entry/screens/actions/decisions/exit. → Step 3 designs
6 wireframes: Plants list, Add-plant form, Plant detail,
Watering log form, Schedule view, Photo timeline. Each wireframe
is ASCII art with all 4 states (empty/loading/error/populated)
and accessibility notes per interactive element. → Step 4
designs 1 journey map for Maya: stages Discover → Onboard →
Daily use → Neglect → Re-engage, with pain points ("empty state
is intimidating" → opportunity "pre-seed with a demo plant") and
opportunities. → Step 5 defines the design system: primary green
(#2E7D32, WCAG AA 4.6:1 on white), secondary brown (#5D4037),
neutral grays, semantic colors; typography (system-ui font
stack, 1.25 ratio type scale 12/16/20/24/32); 4px spacing scale;
component basics (Button, Input, Card, Modal, Toast, EmptyState).
→ Step 6 emits Decision with `what: "ux_designed"`,
`validated: false`. → Step 7 creates `specs/ux/` and writes the
3 files.

**Conflict surfacing (UX implies architecture requirement):**
During step 2 (flow design), the Flow-3 (see schedule) wireframe
shows a live-updating "next water in: 4 days" countdown. This
implies a real-time update mechanism (websocket or polling).
The `specs/contracts.md` from `architecture-design` declared only
REST endpoints (GET /plants/{id}/schedule), no websocket. This is
a design-implementation mismatch. The skill does NOT silently
redesign the wireframe to remove the live countdown — that would
hide the requirement. Instead it emits the Decision with
`alternatives` noting "the live-countdown wireframe implies a
realtime mechanism not in the current architecture; either (a)
add a websocket contract to `specs/contracts.md` via
`architecture-design` re-run, or (b) relax the wireframe to a
static 'last calculated: <time>' display." The orchestrator's
`evaluate-result` may treat this as a soft conflict (not a hard
`conflicts_with_requirements` but a design-implementation gap)
and route back to `architecture-design` for a contract addition.

**Failure mode (no requirements → blocked):** User opens a
session and the orchestrator routes to `ux-design` without a
prior `requirements-gathering` run (perhaps the user said "design
the UI for my app" without specifying the app). Step 1 reads
`specs/requirements.md` → file not found. The skill transitions
to blocked with the precise gap "specs/requirements.md not found
— run `requirements-gathering` first. A UX designed without
requirements is a design for an imaginary user; the personas and
user stories this skill depends on do not exist." Without this
check, the skill would fabricate personas and stories from
training-data memory — the same "I have seen this pattern"
hallucination `constitution/constitution.md` §8 exists to
prevent. The blocked state names exactly what is missing and
what the user should do next (supply a one-line idea to
`requirements-gathering`, which will elicit the rest within its
3-question budget).
