---
name: self-red-team
description: "Use in the orchestrator's quality-gate state (creation mode only) — the agent adopts a competitor/critic perspective and asks: 'If I were reviewing this product harshly, what's missing? What would a competitor have that this doesn't?' Runs minimum N tours based on project_scale (small:1, medium:2, large:3+ per ADR-0027). Each tour produces a Decision(what: 'red_team_finding:<severity>'). Critical/high findings → quality_gate_failed → back to classify-goal. Novel to AIECP; inspired by red-team testing methodology."
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec]
---

# Self Red-Team

## When to use this skill

Use ONLY at the orchestrator's `quality-gate` state, and ONLY in
**creation mode** (per `constitution/engineering-principles.md`
ADR-0037 "Mode-Dependent Virtues"). This skill is the third of
three enrichment processes the quality-gate requires before
transitioning to `report` (the others being `product-vision` and
`creative-expansion`); without it, `quality_gate_passed` cannot be
emitted.

**Creation mode trigger**: the `classify-goal` Decomposition
Decision includes ANY planning skill (`requirements-gathering`,
`project-planning`, `architecture-design`, `ux-design`,
`project-scaffolding`). The presence of any one means the agent is
building, not fixing.

**Fix mode bypass**: if the decomposition names ONLY fix/maintenance
workflows (`bug-report`, `refactor`, `change-request`, `regression`,
`performance-problem`, `incident`, `security-problem`) → emit
`Decision(what: "red_team_skipped_fix_mode")` and return. Red-
teaming a bug fix re-introduces the scope creep ADR-0037 was
written to prevent.

**Don't confuse with `behavioral-simulation`:** that skill finds
*bugs* (behavioral correctness) at `verify`. This skill finds
*product-completeness gaps* (missing features/polish a competitor
or critic would expect) at `quality-gate`. "Does this work?" vs.
"Is this enough?"

**Don't confuse with the `quality-gate` sibling skill:** that skill
runs linters + a code-quality checklist between `implement` and
`verify`. This skill runs a competitor/critic perspective between
`evaluate-result` and `report`. Code quality vs. product quality.

## Procedure

### 1. Determine mode (creation vs. fix)

Read the orchestrator's `classify-goal` Decomposition Decision
(`what: "goal_decomposition:..."`). Extract the workflow names from
the semicolon-separated sub-goals.

- If ANY sub-goal names a planning skill → **creation mode** →
  proceed to step 2.
- If ALL sub-goals name only fix/maintenance workflows → **fix
  mode** → emit `Decision(what: "red_team_skipped_fix_mode")` with
  `why` citing the decomposition, and return.

Record the mode determination as an `Event` of `kind: "observation"`
with `payload.mode: "creation" | "fix"`,
`payload.decomposition_ref` pointing at the `goal_decomposition:...`
Decision id, and `payload.planning_skills_detected: [...]`. This
`Event` anchors every subsequent tour — a future reviewer can
confirm the mode was correctly identified, not assumed.

### 2. Determine tour count from `project_scale`

Read the `project_scale:small | medium | large` Decision emitted by
`classify-goal` (per ADR-0027 — `executor/src/project-scale-
classifier.ts` `SCALE_RANGES`). Map to tour count:

- `small` (1 iteration expected) → **1 tour** (Tour 1: competitor
  perspective only).
- `medium` (1-3 iterations expected) → **2 tours** (Tour 1
  competitor + Tour 2 critic).
- `large` (3+ iterations expected) → **3+ tours** (Tour 1 + Tour 2
  + Tour 3 user perspective, plus any additional tours warranted by
  product complexity — e.g., a 4th tour for security posture if the
  product handles user data, a 5th for performance under load).

Emit `Decision(what: "red_team_tour_count:<n>")` with `why` citing
the `project_scale:<scale>` Decision id and the ADR-0027 SCALE_RANGES
table. If no `project_scale` Decision was emitted (process
violation), emit `Decision(what: "red_team_skipped_no_scale")` and
treat the run as `medium` (2 tours) as a safe default. Do NOT
silently guess `small` — that under-tours and is the failure mode
ADR-0027 exists to prevent.

### 3. Tour 1 — Competitor perspective (all scales)

**Stance:** you are a competitor launching a similar product next
quarter. You have researched this product and you are about to ship
something better. What does THIS product lack that YOUR product
will have?

**Procedure:**

1. Identify the product category from `specs/requirements.md`
   (written by `requirements-gathering`) or, failing that, from the
   `goal_decomposition:...` Decision. The category must be specific:
   not "a web app" but "an incremental idle game"; not "a tool" but
   "a CLI for managing dotfiles across machines."

2. **MANDATORY web search** (per `constitution/constitution.md` §7
   and the `recency-verification` skill — competitor feature sets
   are *time-sensitive*, decaying on the order of months). Query
   `"<product category> features <current year>"` and
   `"<product category> competitor comparison <current year>"`. If
   `web_search` is unavailable (chat LLM without browsing), invoke
   `recency-verification`'s fallback: emit
   `Decision(what: "recency_unverifiable")` and proceed using
   training-data knowledge *with an explicit caveat `Event`* that
   the competitor analysis may be stale. Do NOT pretend you
   researched when you didn't.

3. For each missing competitor feature, classify severity:
   - **critical** = ALL major competitors have this; its absence
     makes the product non-viable. Example: e-commerce with no
     cart/checkout.
   - **high** = MOST competitors have this; a visible weakness a
     reviewer would flag immediately. Example: incremental game
     with no upgrade tree.
   - **medium** = SOME competitors have this; nice-to-have. Example:
     dark mode in a note-taking app.
   - **low** = FEW competitors have this; novel differentiator
     territory. Example: AI summaries in a calculator.

4. For each finding, emit `Decision(what:
   "red_team_finding:<severity>:<slug>")` where `<severity>` is one
   of `critical | high | medium | low` and `<slug>` is a short
   snake_case identifier (e.g.,
   `red_team_finding:high:no_upgrade_system`). The `Decision.why`
   MUST cite (a) the web-search `Event` that established the
   competitor has this feature, and (b) the specific spec/code
   artifact confirming this product lacks it. A `why` like
   "competitors have upgrades" with no citations is a hollow
   finding — reject and re-emit with evidence.

### 4. Tour 2 — Critic perspective (medium, large)

**Stance:** you are a harsh product critic writing a review titled
"Underwhelming: <product name> ships the minimum." What specifically
would you complain about?

**Procedure:** Inspect the built product (source tree via
`filesystem_read`, build via `shell_exec` if needed, UI by reading
component files). For each critic lens, look for gaps and emit
findings:

- **Polish**: missing animations, no loading states, no hover/focus
  feedback, no transitions, no empty-state illustrations.
- **Completeness**: half-implemented features (settings page with
  only 2 of 5 sections wired), dead-end UI paths (button that does
  nothing, link that 404s), `TODO`/`FIXME` in shipped code.
- **Accessibility**: no keyboard navigation, no ARIA on interactive
  elements, no `prefers-reduced-motion` handling, color contrast
  below WCAG AA. Cite the `frontend` skill's WCAG-level bar.
- **Robustness**: no error handling (any deviation crashes), no
  empty states (blank screen instead of "you have no items"), no
  edge-case handling (10,000 items? network offline?).

Each finding follows the same `red_team_finding:<severity>:<slug>`
format from Tour 1 step 4, with `why` citing the specific file/line
where the gap was observed (an `Event` of `kind: "observation"
recording the file path and gap, emitted before the `Decision`).

### 5. Tour 3+ — User perspective (large)

**Stance:** you are a real first-time user who just heard about this
product. You have no instructions, no help docs, no prior context.
You open it cold. Where do you get stuck?

**Procedure:** Walk the first-time user journey end-to-end. Emit
findings for each of:

- **Onboarding clarity**: can a user figure out what this product
  does and how to start, within 30 seconds, with no instructions?
  A blank canvas with no hint of what to do is a finding.
- **First-time experience**: is the first interaction delightful
  (immediate feedback, a clear "aha" moment) or confusing (nothing
  happens, no feedback, user wonders if it's broken)? ADR-0037
  says "it works" is NOT sufficient in creation mode — the first
  interaction must produce delight, not just non-error.
- **Error recovery**: when the user makes a mistake (wrong input,
  wrong click, mid-action refresh), does the product help them
  recover, or punish them (data loss, forced restart, stack trace)?

Emit findings as in Tours 1 and 2.

### 6. Synthesize

After all tours complete, emit a single summary `Decision(what:
"red_team_complete")` with the following in `Decision.why` (the
`Decision.what` is the literal string `red_team_complete`; the
counts go in `why` because `decision.schema.json` has
`additionalProperties: false`, mirroring how `architecture-design`
encodes `conflicts_with_requirements` intent in `what` rather than
a separate boolean field):

- `tours_run`: actual count (1, 2, 3, or more)
- `critical_findings`: count of `red_team_finding:critical:*`
- `high_findings`: count of `red_team_finding:high:*`
- `medium_findings`: count of `red_team_finding:medium:*`
- `low_findings`: count of `red_team_finding:low:*`
- `verdict`: `"pass"` if `critical_findings == 0` AND
  `high_findings == 0`, else `"fail"`

The `Decision.evidence_refs` MUST list every `red_team_finding:*`
Decision id emitted by the tours — a `red_team_complete` with no
`evidence_refs` is a rubber-stamp, not a synthesis, and the
quality-gate state MUST reject it.

### 7. If verdict = fail

The quality-gate state reads this skill's `red_team_complete`
Decision and, on `verdict: "fail"`, emits `Decision(what:
"quality_gate_failed")` with `why` enumerating the critical and
high findings, then transitions back to `classify-goal` per the
orchestrator's transition table (`from: quality-gate, to:
classify-goal, on: quality_gate_failed`).

The re-entry produces an *enriched* decomposition — new sub-goals
addressing the gaps, each routed to the appropriate workflow
(`feature-request` for missing features, `change-request` for
missing polish on existing features). The red-team findings MUST
be cited in the enriched decomposition's `Decision.why` so the
trace is preserved: a future reviewer can see that "sub-goal: add
upgrade system" exists because Tour 1 found "no upgrade system"
as a high-severity gap.

### 8. If verdict = pass

The quality-gate state emits `Decision(what: "quality_gate_passed")`
and transitions to `report`. A pass with zero findings across all
tours is *suspicious* — it likely means the critic wasn't harsh
enough, not that the product is perfect. Before accepting a zero-
finding pass, the quality-gate state SHOULD re-examine: did the web
search actually run (Tour 1)? Did the source inspection actually
happen (Tour 2)? If both ran and genuinely found nothing, the
product may be simple enough that zero findings is correct (e.g.,
a CLI with one command). The burden is on the agent to demonstrate
the tours were substantive, not on the reviewer to prove they
weren't.

## Key design principles

- **NOT bug-finding.** `behavioral-simulation` finds bugs (code
  does the wrong thing). This skill finds product-completeness gaps
  (code does the right thing but the product is missing
  features/polish a competitor or critic would expect). "This code
  crashes on input X" → delegate to `behavioral-simulation`. "No
  loading state, the user sees a frozen screen for 3 seconds" →
  emit it here.

- **Genuinely try to find gaps.** A tour that finds nothing is
  suspicious — it means the critic wasn't harsh enough. The agent
  must adopt the *harshest* plausible critic stance, not the most
  generous. If after a full tour genuinely nothing is found, the
  tour's `Decision.why` must explain *what was inspected* (file
  paths, web-search queries, UI screens examined) so a reviewer can
  confirm the tour was substantive, not skipped.

- **Each finding must be SPECIFIC.** Not "add more features" but
  "no upgrade system — Cookie Clicker, Adventure Capitalist, and
  Idle Champions all have upgrade trees; this is a critical gap
  for an incremental game (web search query 'incremental game
  features 2026' returned 3/3 competitors with upgrades)." A vague
  finding is not actionable and provides nothing for the enriched
  decomposition to address.

- **Web search is MANDATORY for Tour 1.** Per `constitution/constitution.md`
  §7 and the `recency-verification` skill: competitor feature sets
  are time-sensitive. Do NOT guess what competitors have from
  training data — research it. The only exception is chat LLMs
  without `web_search`, which must invoke the `recency-verification`
  fallback and explicitly flag the analysis as possibly stale.

## Tool integration

- **`filesystem_read`**: read `specs/requirements.md` (product
  category), `specs/plan.md` + `specs/tasks.md` (intended scope),
  the source tree (Tour 2 critic inspection — read component files,
  UI routes, error-handling paths), and prior `Decision`s in the
  run's evidence store (the `goal_decomposition:...` and
  `project_scale:...` Decisions this skill depends on).
- **`filesystem_write`**: write findings to a run-scoped artifact
  (e.g., `specs/red-team-findings.md`) so the enriched
  decomposition on `quality_gate_failed` can cite them. Do NOT
  modify source code — fixing findings is downstream workflows'
  job, not this skill's.
- **`shell_exec`**: run the build (`npm run build`, `cargo build`,
  etc.) to confirm the product actually compiles before red-teaming
  it; run the product if it's a CLI/server to inspect real
  behavior, not just source. Web search invocation, if available as
  a shell-accessible tool, also goes here.

## Validation

This skill is considered successful for a given run only if:

- A mode-determination `Event` was emitted (creation vs. fix), with
  the decomposition Decision referenced.
- In fix mode: a `red_team_skipped_fix_mode` Decision was emitted
  and the skill returned without running tours.
- In creation mode: a `red_team_tour_count:<n>` Decision was
  emitted, with `n` matching the ADR-0027 SCALE_RANGES mapping for
  the classified `project_scale`.
- Each tour emitted at least one `red_team_finding:<severity>:<slug>`
  Decision OR a `Decision.why` explaining what was inspected and
  why nothing was found (zero-finding tours are allowed but must
  be justified, not silent).
- A `red_team_complete` Decision was emitted with `verdict` and
  per-severity counts, and its `evidence_refs` lists every finding
  Decision emitted by the tours.
- On `verdict: "fail"`: the quality-gate state transitioned to
  `classify-goal` on `quality_gate_failed`, with the critical/high
  findings cited in the enriched decomposition's `Decision.why`.

## Examples

**Happy path (creation mode, scale=medium):** orchestrator reaches
`quality-gate` after `goal_decomposition:project-planning;architecture-design;feature-request`
and `project_scale:medium` → step 1 finds planning skills → creation
mode → step 2: tour count = 2 → Tour 1: web search "incremental game
features 2026" finds 3 competitors all with upgrade trees; this
product has none → emit
`red_team_finding:critical:no_upgrade_system` → Tour 2: source
inspection finds the clicker button has no loading state, no hover
feedback → emit `red_team_finding:high:no_click_feedback` → step 6:
emit `red_team_complete` with `verdict: "fail"`,
`critical_findings: 1`, `high_findings: 1` → quality-gate emits
`quality_gate_failed` → back to `classify-goal` → enriched
decomposition adds `feature-request(upgrade-system)` and
`change-request(click-feedback)` citing the red-team finding ids.

**Fix mode bypass:** orchestrator reaches `quality-gate` after
`goal_decomposition:bug-report(shipping)` → step 1 finds only
`bug-report` (no planning skills) → fix mode → emit
`red_team_skipped_fix_mode` → return. Quality-gate emits
`quality_gate_passed` and transitions to `report`. Red-teaming a bug
fix would re-introduce the scope creep ADR-0037 prevents.

**Failure mode (rubber-stamp):** agent in creation mode runs Tour 1
without web search, claims "no competitor has features this product
lacks," emits `red_team_complete` with `verdict: "pass"` and zero
findings → quality-gate state rejects the `pass` because Tour 1's
`Decision.why` cites no web-search `Event` (the mandatory search
didn't run) → re-runs Tour 1 with web search invoked → finds 3
competitors with upgrade trees → `verdict: "fail"`. The rejection
of the rubber-stamp pass is the failure mode this skill exists to
prevent.
