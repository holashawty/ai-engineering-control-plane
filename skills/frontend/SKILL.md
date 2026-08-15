---
name: frontend
description: Use whenever a task touches UI, UX, accessibility, or frontend rendering. Ensures frontend changes are verified not just by unit tests but by behavioral simulation (per behavioral-simulation skill) — does the UI actually render correctly for all user states? Covers React/Vue/Svelte/Angular/Vanilla JS equally. Distinct from testing (which runs test suites) — this skill covers frontend-specific discipline — accessibility checks, responsive design verification, visual regression awareness, component prop validation.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Frontend

## When to use this skill

Any time a task touches UI, UX, accessibility, or frontend rendering —
regardless of which workflow is running. This is a cross-cutting
domain skill: any workflow may cite it in its `skills_required` list
when the task touches the frontend domain (`feature-request` adding a
form field, `change-request` rewriting a component, `bug-report`
diagnosing a render regression, `refactor` extracting a shared UI
primitive, `performance-problem` reducing bundle size).

**Especially when:**

- A component is being added, modified, or removed — including a
  presentational change that "looks the same" but alters the DOM
  (accessibility tree, focus order, ARIA semantics).
- A new user state is being introduced (loading, empty, error,
  unauthenticated, partially-permissioned) — each is a separate
  rendering target this skill requires evidence for.
- An accessibility attribute (`aria-*`, `role`, `tabindex`, `alt`)
  is being added, changed, or removed.
- A responsive breakpoint is being changed, added, or removed.
- A visual snapshot is being updated (this skill treats snapshot
  diffs as evidence to validate, not noise to rubber-stamp).
- A component's prop or slot API is being changed — this is a
  contract change, not just an implementation change.

**Don't use as a substitute for `testing`:** that skill runs the
project's own test suite (per `project.test_system` from Project
Intelligence — Jest, Vitest, Playwright, Cypress, etc.). This skill
covers the frontend-specific discipline on top of — not instead of —
that test run. A green component test suite is *necessary* but not
*sufficient*; tests assert what the author thought to check, while
this skill probes the rendering behavior across user states and
accessibility paths the author may not have considered.

**Don't use as a substitute for `behavioral-verification`:** that
skill confirms a specific behavioral claim against `Expected`. This
skill produces the frontend-specific `Expected`s, `Actual`s, and
`Trace`s that `behavioral-verification` consumes.

**Compose with `behavioral-simulation`:** the description of this
skill explicitly invokes `behavioral-simulation` — that skill
generates the interaction matrix (input shapes, user states,
concurrency, environment) and this skill provides the frontend-
specific vocabulary for what counts as "renders correctly" within
that matrix. Use both: `behavioral-simulation` generates the
scenarios, this skill emits the evidence for each.

## Procedure

### 1. Identify the frontend stack (stack-native, not assumed)

Read `.aiecp/project-intelligence.json` (per `skills/testing/SKILL.md`
step 1 — same stack-native discipline). The file's `project.test_system`
declares the test runner; for frontends, also infer the framework
from `package.json` `dependencies` / `devDependencies` (React,
Vue, Svelte, Angular, Solid, Vanilla JS) and the build system
from `project.build_system` (Vite, Webpack, esbuild, Rollup). If
the file does not exist, run `discovery/cli` first
(`node dist/cli.js <repo-path>`) rather than assuming React.

The mechanism varies by framework — the discipline does not:

- **React / Solid:** components are JSX/TSX; prop types are
  TypeScript interfaces or `PropTypes`; testing-library is the
  dominant render-testing utility; a11y tooling is `axe-core`.
- **Vue:** components are `.vue` SFCs; prop types are `defineProps`
  (Vue 3) or `props` option (Vue 2); testing-library is
  `@testing-library/vue`; a11y tooling is `axe-core` via
  `vue-axe`.
- **Svelte:** components are `.svelte` SFCs; prop types are
  TypeScript in `<script lang="ts">`; testing-library is
  `@testing-library/svelte`; a11y tooling is `axe-core`.
- **Angular:** components are `.ts` + `.html` templates; prop
  types are `@Input()` decorators; testing is `TestBed`;
  a11y tooling is `axe-core` via `@angular/cdk/a11y` tooling or
  `cypress-axe`.
- **Vanilla JS / Web Components:** no framework; the discipline
  applies to the DOM directly; a11y tooling is `axe-core` against
  the rendered page.

Record the identified stack as an `Event`
(`evidence/schema/event.schema.json`) of `kind: "observation"` with
`payload.framework: "<react|vue|svelte|angular|solid|vanilla>"` and
`payload.test_runner: "<vitest|jest|playwright|cypress|…>"`. This
`Event` anchors every later step — never proceed without it.

### 2. Treat every UI change as a `Decision` with `validated: false`

Per `constitution/constitution.md` §2 and `docs/evidence-model.md`'s
AI-output validation pattern: every component change, prop API
change, accessibility attribute change, or responsive breakpoint
change is a `Decision`
(`evidence/schema/decision.schema.json`) emitted with:

- `what: "ui_change:<component_id>:<change_kind>"` where
  `change_kind` is one of `add`, `modify`, `remove`,
  `prop_api_change`, `a11y_change`, `breakpoint_change`,
  `style_change`.
- `why` — what the change accomplishes for the user, and why the
  chosen approach beat alternatives (at least one `alternatives`
  entry per `decision.schema.json`'s `alternatives` array).
- `validated: false` initially — flipped only by step 7's
  `Validation`.
- `made_by: "agent"` for AI-proposed changes; `made_by: "human"`
  if the change is human-authored and the agent is verifying it.
- `result: "pending"` until the `Validation` flips it to `"accepted"`.

A UI change merged without this `Decision` first being emitted is a
process violation of this skill — even if the change is correct, a
future `regression` workflow cannot trace why the accessibility
semantics are the way they are.

### 3. Emit an `Expected` for rendering AND accessibility invariants

A UI change's `Expected`
(`evidence/schema/expected.schema.json`) covers *three* separable
properties — collapsing them into one is the failure mode this
skill exists to prevent:

- **Rendering behavior** — `predicate_kind: "behavioral"` — what
  the component renders for each user state (loading, empty, error,
  populated, unauthenticated, partially-permissioned). Each user
  state is a separate `Expected` predicate, not one combined
  predicate; collapsing them hides the state where the component
  silently renders nothing.
- **Accessibility invariant** — `predicate_kind: "invariant"` —
  what must remain true across every rendering state: focusable
  elements have visible focus indicators, interactive elements have
  accessible names, form fields have associated labels, color
  contrast meets WCAG AA (or the project's chosen level), keyboard
  navigation reaches every interactive element in a logical order.
  `source_ref` points at WCAG success criteria, the project's a11y
  contract, or an `axe` rule configuration.
- **Responsive state property** — `predicate_kind:
  "state_property"` — what must be true across the viewport matrix:
  no horizontal scroll at mobile widths, tap targets ≥ 44×44 CSS
  pixels, content reflows rather than clipping at narrow widths,
  no layout shift above the project's CLS threshold.

For prop API changes, the `Expected` additionally states the new
contract: required vs. optional props, prop types, default values,
and which existing call sites are affected. A prop API change with
no inventory of affected call sites is a process violation — the
change is unverifiable without knowing who consumes it.

### 4. Capture `Actual` per user state via render + a11y scan + viewport matrix

For each `Expected`, capture an `Actual`
(`evidence/schema/actual.schema.json`) by actually rendering the
component (in the project's test runner via testing-library, in a
headless browser via Playwright/Puppeteer, or in a Storybook story)
and recording the observed DOM, observed accessibility violations,
and observed layout per viewport. The `Actual` records:

- `expected_ref` — pointing at the `Expected` from step 3.
- `observed_value` — the observed DOM snapshot (for rendering
  behavior), the `axe` violation list (for accessibility invariant),
  or the observed layout metrics (for responsive state property),
  in the shape `predicate_kind` of the referenced `Expected`
  implies.
- `observation_ref` — pointing at the `Event` (render output, axe
  report, viewport screenshot) from which the observation was
  captured. `Actual` is never freestanding — `actual.schema.json`
  requires this field; a value typed from memory rather than
  observed is invalid.

Group all per-state `Event`s under a single `Trace`
(`evidence/schema/trace.schema.json`) with `source:
"test_runner"` (if rendered via testing-library in the project's
test runner) or `source: "agent_adapter"` (if rendered via a
headless browser through `shell_exec`). Order is significant —
the trace should read: state 1 render, state 1 a11y, state 1
viewport-mobile, state 1 viewport-desktop, state 2 render, …

### 5. Run `behavioral-simulation` against the rendering matrix

This step is *not* optional for any UI change — the description of
this skill explicitly invokes `behavioral-simulation`. Hand off the
step-3 `Expected`s to `behavioral-simulation`, which decomposes them
into a parameter matrix (input shapes, user states, environment)
and generates ≥5 simulation scenarios. For each scenario:

- Render the component under the simulated conditions.
- Capture the observed rendering as an `Event` of `kind:
  "test_result"` (per `behavioral-simulation` step 3).
- Compare against the `Expected` from step 3 — emit per-simulation
  `Actual` + `Validation` (per `behavioral-simulation` step 4).
- Aggregate (per `behavioral-simulation` step 5) into a final
  `Validation.result` of `"match"`, `"mismatch"`, or
  `"inconclusive"`.

If `behavioral-simulation` returns `"inconclusive"` (a spec gap —
the simulation found a state the `Expected` doesn't cover), this
skill treats it as a finding, not a nuisance: transition back to
the design state with `on: rendering_spec_gap` rather than picking
a behavior silently. The classic gap this catches: "what does the
component render when the data prop is `undefined` vs. `null` vs.
`{}`?" — three different values, three different renderings, and
the original `Expected` usually specifies only one.

### 6. Visual regression snapshots are `Decision` evidence, not noise

If the project uses a visual regression tool (Jest snapshot,
Playwright trace, Percy, Chromatic, Storybook test runner), every
snapshot diff is a `Decision` (`evidence/schema/decision.schema.json`)
— either the diff is intended (a UI change) and the snapshot is
being updated to match the new `Expected`, or the diff is
unintended (a render regression) and the snapshot is correctly
catching a bug. There is no third option — a snapshot update is
never "just approve the diff."

Record each snapshot update as a `Decision` with:

- `what: "ui_snapshot_update:<component_id>:<snapshot_name>"`
- `why` — what UI change caused this diff, citing the step-2
  `Decision` as `evidence_refs`.
- `validated: false` until the step-3 `Expected` for the changed
  rendering is confirmed against the updated snapshot.

A snapshot update committed without this `Decision` is a process
violation — the diff is being silenced, not verified. This is the
single most common frontend failure mode this skill exists to
prevent: a snapshot diff appears in CI, the developer clicks
"update snapshot," the diff disappears, the change ships, the
regression ships with it.

### 7. Emit the `Validation`, then hand off to `behavioral-verification`

Aggregate step 3's `Expected`s and step 4's `Actual`s (per user
state) plus step 5's behavioral-simulation aggregate into a
`Validation` (`evidence/schema/validation.schema.json`):

- `expected_ref` + `actual_ref` — the `Expected`/`Actual` pair
  for the primary rendering behavior.
- `method: "app_validation"` if `axe-core` ran (the project's own
  external a11y validator) AND the render tests ran AND the
  viewport matrix was checked.
- `method: "contract_validation"` if the validation is a prop API
  contract check (the component's prop types are the contract;
  TypeScript or runtime PropTypes validation is the contract
  check).
- `method: "manual_review"` only for chat LLMs without
  `shell_exec`/`test_runner` — the chat LLM mentally simulates each
  rendering state and records its conclusions, which are
  reviewable, not reproducible. A tool-using agent re-runs any
  `manual_review` `Validation`s it finds in memory when it later
  gains tool access.
- `method: "unit_test"` alone is **insufficient** for any UI
  change, per the same logic as `behavioral-verification`: a
  passing component test suite does not confirm the component
  renders correctly across user states or that accessibility
  invariants hold. A `Validation` with `method: "unit_test"` and
  no stronger evidence is a process violation of this skill.
- `decision_ref` — pointing at the step-2 `Decision`. The
  `Validation` is what flips `Decision.validated` from `false` to
  `true`.
- `result: "match"` only if rendering AND accessibility invariant
  AND responsive state property all held across every simulated
  state from step 5. A single failing state yields `result:
  "mismatch"`. An unspecified state yields `result:
  "inconclusive"`.

This `Validation` is then handed to `behavioral-verification`, which
judges whether the validation method was strong enough to close the
workflow's `verify` state. The two skills do not duplicate work:
this skill emits the frontend-specific evidence;
`behavioral-verification` decides whether the evidence is
sufficient.

### 8. Accessibility findings are blocking, not advisory

Any `axe` violation at the project's chosen WCAG level (AA by
default, A or AAA if declared) — or any manual accessibility
finding (keyboard trap, focus order illogical, missing accessible
name on an interactive element) — is a blocking finding. The
`Validation.result` MUST be `"mismatch"`, the workflow transitions
back to the code-changing state with `on: a11y_violation`, and
the failing `Event`s are attached as `evidence_refs`.

This is non-negotiable because accessibility regressions ship to
real users immediately and affect users with disabilities
disproportionately — a "minor" a11y regression is a complete
blocker for the user it affects. Treat a11y violations with the
same severity as data-loss bugs: they are not polish items to
defer to a future sprint.

## Tool integration

- `filesystem_read`: read existing components, prop type definitions,
  Storybook stories, snapshot baselines, accessibility configuration
  (`.achecker.yml`, `axe` config, WCAG level declaration), and the
  project's `project-intelligence.json` to identify the frontend
  stack. Also used to read prior `Decision`/`Expected`/`Actual`
  artifacts when building a reference chain.
- `filesystem_write`: write new components, prop type changes,
  Storybook stories, and the evidence JSON artifacts this skill
  emits (`Decision`, `Expected`, `Actual`, `Validation`). Update
  snapshot baselines only via step 6's `Decision` discipline —
  never silently.
- `shell_exec`: run the project's component test runner
  (`npm run test:components`, `npm run storybook:test`,
  `npx playwright test`), run `axe-core` against rendered output
  (via the test runner's axe integration or via a headless browser
  script), and run viewport-matrix checks (Playwright `page.
  setViewportSize`, Cypress `cy.viewport`). Prefer one-shot,
  scriptable commands — the output must be replayable by a future
  `Replay` step.
- `test_runner`: structured execution of component tests via
  testing-library. Preferred over raw `shell_exec` when the
  adapter exposes structured test results (pass/fail per case, not
  raw text) — per `docs/portability.md` adapter `capabilities()`.
  Falls back to `shell_exec` for viewport-matrix and a11y scans
  that do not fit the test runner's shape.

**For chat LLMs without `shell_exec`/`test_runner`:** this skill
is still usable, but every `Actual.observed_value` is the chat
LLM's mental simulation of the rendered output, not observed output.
The `Validation.method` is `"manual_review"`, and the simulation
`Event`s contain the LLM's predicted DOM, predicted a11y
violations, and predicted layout — reviewable, not reproducible.
A tool-using agent re-runs any `manual_review` `Validation`s it
finds in memory when it later gains tool access. Chat LLMs should
be especially cautious about claiming "no a11y violations" from
mental simulation — axe scans are precisely the tool whose output
LLMs cannot reliably reproduce from memory.

## Validation

This skill is considered successful for a given UI change only if:

- Every UI change is emitted as a `Decision`
  (`evidence/schema/decision.schema.json`) with `validated: false`
  initially, `result: "pending"`, and at least one `alternatives`
  entry recording a rejected approach.
- Every `Decision` has paired `Expected`s
  (`evidence/schema/expected.schema.json`) covering rendering
  behavior (`predicate_kind: "behavioral"`), accessibility
  invariant (`predicate_kind: "invariant"`), and responsive state
  property (`predicate_kind: "state_property"`). One collapsed
  `Expected` covering all three is a process violation.
- Every `Expected` has a paired `Actual`
  (`evidence/schema/actual.schema.json`) with `observation_ref`
  pointing at a real `Event` (render output, axe report, viewport
  screenshot) — never a value typed from memory.
- All per-state `Event`s are grouped under a single `Trace`
  (`evidence/schema/trace.schema.json`) preserving order — the
  trace must read state-by-state, not jumbled.
- `behavioral-simulation` was invoked and returned an aggregate
  `Validation` — skipping behavioral simulation is a process
  violation of this skill's own description.
- Any snapshot update was recorded as its own `Decision`
  (`ui_snapshot_update:…`) with `evidence_refs` citing the step-2
  UI change `Decision`.
- The final `Validation`
  (`evidence/schema/validation.schema.json`) has `method` of
  `"app_validation"`, `"contract_validation"`, or
  `"manual_review"` (chat LLMs only) — never `"unit_test"` alone
  for a UI change.
- No accessibility violation at the project's chosen WCAG level is
  left without a `result: "mismatch"` `Validation` and a
  workflow transition back to the code-changing state with
  `on: a11y_violation`.

A UI change shipped without this evidence chain — even a "trivial"
style change — is a process violation of this skill, because a
future `regression` workflow cannot trace why the accessibility
semantics changed, and a user who relies on a screen reader cannot
tell the team that the regression shipped — they just experience
the broken UI.

## Examples

**Happy path (add a "Save" button to a form, React + TypeScript):**
`feature-request` workflow adds a `<SaveButton>` to a form component
— step 1 identifies `framework: "react"`, `test_runner: "vitest"`,
a11y tooling: `axe-core` via `vitest-axe` — step 2 emits `Decision`
with `what: "ui_change:SaveButton:add"`, `validated: false`,
`alternatives: [{option: "reuse existing <Button> with type='submit'",
rejected_because: "form uses controlled submit, native button
breaks validation flow"}]` — step 3 emits three `Expected`s:
rendering (`predicate_kind: "behavioral"`,
`predicate: "SaveButton renders with text 'Save' when form is dirty,
'Saving…' when submitting, disabled+aria-busy when submitting"`),
accessibility (`predicate_kind: "invariant"`,
`predicate: "SaveButton has accessible name 'Save'; focusable;
focus indicator visible; aria-busy=true while submitting"`), and
responsive (`predicate_kind: "state_property"`,
`predicate: "SaveButton full-width at <480px viewport, auto-width
at ≥480px, tap target ≥44×44 CSS pixels at all widths"`) — step 4
captures `Actual` per state (idle, submitting, disabled) via
`vitest-axe` (0 violations) and Playwright viewport matrix (3
viewports × 3 states = 9 screenshots, all match `Expected`) — step 5
runs `behavioral-simulation`: 5 scenarios (empty form + Save click,
submitting + second Save click, error state, RTL layout, high-
contrast mode) — all match — step 7 emits `Validation` with
`method: "app_validation"`, `result: "match"`, `decision_ref`
flipping `Decision.validated` to `true`. Component ships.

**Failure mode (accessibility regression caught at validation):**
`change-request` workflow refactors a `<Modal>` component to use a
new animation library — step 4 captures `Actual` via `axe-core`:
2 critical violations (`aria-hidden` on the modal's parent focus
container traps keyboard focus; the close button loses its
accessible name because the icon-only button's `aria-label` was
dropped during refactor) — step 7 emits `Validation` with `result:
"mismatch"`, `method: "app_validation"`,
`evidence_refs` listing the 2 axe violation `Event`s — workflow
transitions back to `migrate` with `on: a11y_violation`. Without
this skill, the refactor would have shipped (the visual animation
worked, the test suite passed because no test asserted the
`aria-label`), and screen-reader users would have lost the ability
to dismiss the modal — a complete blocker for that user population,
shipped silently because the snapshot diff "looked fine" visually.

**Prop API change caught by `contract_validation`:** A Vue
component's `defineProps<{ items: Item[] }>()` is changed to
`defineProps<{ items?: Item[] }>()` (optional) — step 3 emits
`Expected` with `predicate_kind: "invariant"` and `predicate: "all
existing call sites either pass items or handle undefined"` —
step 4 captures `Actual` by inventorying all `grep` matches for
the component's usage (12 call sites found) and confirming via
TypeScript that 3 sites pass `items={undefined}` conditionally —
step 7 emits `Validation` with `method: "contract_validation"`,
`result: "match"` — the contract is verified; all consumers handle
the now-optional prop. Without this skill, the prop change would
have shipped with a green test suite (the test fixture always
passes `items`) and the 3 conditional call sites would have
broken at runtime for users hitting the undefined path.

**Vanilla JS coverage (Web Component):** A custom element
`<my-datepicker>` is being modified to add a `min` attribute —
the discipline applies identically: step 2 emits `Decision` with
`what: "ui_change:my-datepicker:prop_api_change"`, step 3 emits
`Expected` covering the new attribute's rendering, accessibility
(date picker must remain keyboard-navigable per WAI-ARIA
Authoring Practices for date picker patterns), and responsive
behavior, step 4 captures `Actual` via Playwright + axe-core
against the rendered custom element, step 5 runs behavioral
simulation including "user sets `min` to a date in the past"
edge case. The framework changes; the evidence shape does not.
