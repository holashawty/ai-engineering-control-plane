---
name: visual-regression
description: Use when a change touches UI, frontend rendering, or visual output — captures screenshots before and after changes, compares them pixel-by-pixel, and catches visual regressions that functional tests miss entirely (broken layouts, wrong fonts, misaligned buttons, incorrect color tokens). Integrates with behavioral-verification to ensure "test passed" ≠ "UI looks right." License MIT; tool integration cites Playwright `toHaveScreenshot()`, BackstopJS, and the Playwright Healer selector-recovery pattern.
license: MIT
allowed-tools: [shell_exec, test_runner, filesystem_read]
---

# Visual Regression

## When to use this skill

At the `verify` state of any workflow that touches UI, frontend
rendering, or visual output — `feature-request` adding a component,
`change-request` rewriting a presentational primitive, `bug-report`
diagnosing a render regression, `refactor` extracting a shared UI
element, `release` cutting a build with presentational changes. This
is the skill that stands between "the test suite exits 0" and "the UI
looks the way the user expects it to" — those are different claims,
and a green suite can ship alongside a broken layout, a wrong font, a
misaligned button, or an incorrect color token that no functional
test asserts against.

**Especially when:**

- A change touches CSS, Tailwind tokens, design-system primitives,
  or component-level styling — even when the change is "purely
  presentational and the tests still pass."
- A change touches a Phaser / Electron / embedded-browser asset
  pipeline — visual regressions in game-asset or Electron-renderer
  code are the patron's stated pain point ("asset bozulmaları, visual
  regression"); this skill is the direct remedy.
- A change touches dependency versions — a minor-version bump in a
  styling library, an icon set, or a font package can shift rendered
  output in ways that no unit test catches.
- A change is being shipped under time pressure — the temptation to
  skip visual verification is highest exactly when it matters most,
  because visual regressions ship to users immediately and are
  immediately visible.

**Don't use as a substitute for `behavioral-verification`:** that
skill confirms a specific behavioral claim against `Expected` (per
ADR-0010, "no exception ≠ success"). This skill produces the pixel-
level `Actual` that `behavioral-verification` then judges. Use both:
this skill captures the visual evidence, `behavioral-verification`
decides whether the evidence is sufficient.

**Don't use as a substitute for `self-healing`:** that skill fixes
broken selectors/locators when a test fails with "element not found."
This skill checks pixel output. They compose — a `self-healing`
recovery should be followed by a `visual-regression` capture to
confirm the healed selector still finds the right element visually.

## Procedure

### 1. Capture baseline screenshots before the change

Before applying any code change, capture baseline screenshots of
every view the change touches. Each baseline is an `Event`
(`evidence/schema/event.schema.json`) of `kind: "observation"` with:

- `source: "mcp:playwright"` (or `"agent_adapter:<tool>"` for the
  project's chosen screenshot tool — Playwright, BackstopJS, Puppeteer,
  Cypress with `cy.screenshot`, Storybook test runner).
- `payload.viewport: {width, height, device_scale_factor}` — viewport
  is part of the observation, not noise; a baseline captured at one
  viewport cannot validate a comparison at another.
- `payload.route: "/path"` or `payload.story: "<story-id>"` — which
  page / story / component instance was captured.
- `payload.user_state: "loading|empty|error|populated|…"` — the user
  state at capture time; collapsing states hides the rendering gap
  this skill exists to catch (same lesson as `frontend/SKILL.md` step 3).
- `payload.baseline_path: "<path>"` — where the baseline PNG was
  written on disk, so a future `Replay` can re-load it.
- `payload.capture_at: "<ISO8601>"` — when the baseline was captured.

Group all baseline `Event`s under a single `Trace`
(`evidence/schema/trace.schema.json`) with `source: "agent_adapter"`
and `started_at` matching the first capture. This `Trace` is the
"before" half of the visual diff.

**Playwright-specific command shape** (per web research 2026-08-15,
Playwright has built-in `toHaveScreenshot()` for visual regression):

```typescript
// Captures the baseline if absent; compares against it if present.
await expect(page).toHaveScreenshot('login-form.png', {
  maxDiffPixelRatio: 0.01, // 1% pixel diff threshold
  threshold: 0.2,          // per-pixel difference tolerance (0–1)
  animations: 'disabled',  // deterministic — animations make flaky baselines
});
```

**BackstopJS-specific command shape** (per web research 2026-08-15,
BackstopJS is open-source, MIT-licensed):

```bash
# Captures baselines the first time, then compares on subsequent runs.
npx backstop init     # one-time, generates backstop.json
npx backstop reference # capture baselines
npx backstop test      # compare against baselines
```

### 2. Apply the change

Apply the code change via the workflow's normal `apply-fix` /
`implement` / `migrate` state, with the standard `Decision`
(`evidence/schema/decision.schema.json`) emission per
`implementation/SKILL.md`. The change is a `Decision` with
`validated: false` until step 5's `Validation` flips it.

### 3. Capture screenshots after the change

After the change is applied, capture "after" screenshots at the same
viewports, routes, stories, and user states as the baselines from
step 1. Each "after" capture is its own `Event` with the same
`source`/`payload` shape, but `payload.baseline_path` is replaced by
`payload.after_path: "<path>"` and `payload.baseline_ref: "<event-id>"`
pointing back at the corresponding baseline `Event`.

Group all "after" `Event`s under a second `Trace` with the same
`source` and a `started_at` matching the first "after" capture. This
is the "after" half of the visual diff.

### 4. Pixel-diff comparison

For each (baseline, after) pair, compute a pixel-diff and emit the
result as an `Actual` (`evidence/schema/actual.schema.json`):

- `expected_ref` — pointing at the `Expected` from step 5 below
  (the predicate that the diff should be below threshold).
- `observed_value` — `{diff_pixel_count, diff_pixel_ratio, max_diff,
  diff_image_path}` in the shape the project's diff tool produces
  (Playwright `toHaveScreenshot` produces these; BackstopJS produces
  a richer report including `diff_image` paths per scenario).
- `observation_ref` — pointing at the diff `Event` (an `Event` of
  `kind: "observation"` whose payload carries the diff tool's raw
  output). `Actual` is never freestanding — `actual.schema.json`
  requires this field.

### 5. Emit `Actual` + `Validation` with `method: "app_validation"`

For each diff, emit a `Validation`
(`evidence/schema/validation.schema.json`):

- `expected_ref` + `actual_ref` — the `Expected` (diff below
  threshold) and `Actual` (the computed diff) pair.
- `method: "app_validation"` — the visual diff was computed by
  running real code (Playwright / BackstopJS), not by mental
  simulation. This is the strongest available `method` per the
  `validation.schema.json` enum; `manual_review` is reserved for chat
  LLMs without tool access (they cannot actually capture screenshots).
- `result: "match"` — when `diff_pixel_ratio < threshold` AND
  `diff_pixel_count < absolute_threshold` (per the project's chosen
  thresholds; default to 1% ratio and 100 px absolute — both must
  hold, either alone is gameable).
- `result: "mismatch"` — when either threshold is exceeded. This is
  the visual regression: the change shifted pixels the user can see,
  and no functional test caught it.
- `result: "inconclusive"` — when the diff tool errored, the
  screenshot capture failed (e.g. flaky network dependency on the
  page), or the baseline is missing. Treat as `mismatch` for safety:
  re-capture the baseline if appropriate, or transition back to the
  code-changing state with `on: visual_baseline_missing`.
- `decision_ref` — pointing at the step-2 `Decision` (the change
  being verified). The `Validation` flips `Decision.validated` from
  `false` to `true` only if `result: "match"`.

The aggregate `Validation.result` across all (baseline, after) pairs
is the product, not the average — a single mismatching viewport /
route / user state is a visual regression, not a "mostly passes."

## Tool integration

- **Playwright `toHaveScreenshot()`** (preferred when the project
  already uses Playwright): built-in visual regression, no extra
  dependency. Captures baselines on first run, compares on
  subsequent runs, produces diff images on mismatch. Per web
  research 2026-08-15, Playwright's visual regression is mature and
  widely deployed.
- **BackstopJS** (preferred for standalone visual-regression
  scenarios, especially when the project does not have Playwright
  wired up): open-source, MIT-licensed, dedicated to visual
  regression. Produces a per-scenario HTML report with baseline /
  diff / actual images side-by-side. Per web research 2026-08-15,
  BackstopJS is the dominant standalone visual-regression tool.
- **Playwright Healer** (cited in `self-healing/SKILL.md`): when a
  visual-regression test fails because the *selector* drifted (the
  page changed DOM structure but the visual output is fine),
  `self-healing` recovers the selector automatically (75%+ success
  per web research 2026-08-15) and the visual-regression test
  re-runs against the healed selector. Use `self-healing` first
  when the failure is selector-shaped; use `visual-regression`
  when the failure is pixel-shaped.
- `shell_exec`: run the project's screenshot / diff tool as a
  one-shot, scriptable command. Prefer commands whose stdout is
  parseable (Playwright with `--reporter=json`, BackstopJS with
  its JSON report) — the output must be replayable by a future
  `Replay` step.
- `test_runner`: structured execution of Playwright test files that
  contain `toHaveScreenshot()` assertions. Preferred over raw
  `shell_exec` when the adapter exposes structured per-test results
  (pass/fail per scenario, not raw text) — per `docs/portability.md`
  adapter `capabilities()`. Falls back to `shell_exec` for BackstopJS
  scenarios that do not fit the test runner's shape.
- `filesystem_read`: read the baseline PNG files (so the diff can
  compare against them), read prior `Trace`/`Event` artifacts when
  building a reference chain across workflow runs, and read
  `.aiecp/project-intelligence.json` to identify the project's
  chosen visual-regression tool.

**For chat LLMs without `shell_exec`/`test_runner`:** this skill
is *not* usable. Visual regression requires actual screenshot capture
and pixel-diff computation — there is no honest `manual_review`
fallback the way there is for behavioral-simulation. A chat LLM
without tool access should emit a `Decision` with `what:
"visual_regression_unverifiable"`, `validated: false`, and transition
the workflow to `blocked` with `on: requires_visual_regression_tool`.

## Validation (of this skill itself)

A `verify` step using this skill is done correctly only if:

- At least one baseline `Event` was captured BEFORE the change was
  applied (evidence-before-explanation, enforced structurally —
  a baseline captured after the change is meaningless for diffing).
- At least one after `Event` was captured AFTER the change, at the
  same viewport / route / story / user state as a baseline.
- A pixel-diff `Actual` was emitted for each (baseline, after) pair,
  with `observation_ref` pointing at the diff tool's output `Event`.
- The `Validation.method` is `"app_validation"` — never
  `"manual_review"` for a visual-regression run (a chat LLM cannot
  visually simulate pixel diffs).
- The aggregate `Validation.result` is `"match"` only if EVERY pair
  passed the threshold; a single mismatch yields `"mismatch"`.
- The `Validation.decision_ref` points at the `Decision` for the
  change being verified, and `Decision.validated` is flipped to
  `true` only if `result: "match"`.
- Any snapshot update (when a visual regression is intentional —
  the new rendering is the new `Expected`) was recorded as its own
  `Decision` with `what: "visual_snapshot_update:<route>:<state>"`,
  `why` citing the change being shipped, and `evidence_refs` listing
  the (baseline, after) pair. A snapshot update committed without
  this `Decision` is a process violation — the diff is being
  silenced, not verified (same lesson as `frontend/SKILL.md` step 6).

## Examples

**Happy path — no visual regression:** A `change-request` workflow
refactors a `<Button>` to extract a shared `<ButtonBase>` primitive.
Step 1 captures baselines at 4 viewports × 3 user states (idle,
hover, disabled) = 12 baseline `Event`s under a single `Trace`.
Step 2 applies the refactor (a `Decision` with `validated: false`).
Step 3 captures 12 "after" `Event`s. Step 4's pixel-diff produces 12
`Actual`s, all with `diff_pixel_ratio < 0.01`. Step 5 emits a
`Validation` with `method: "app_validation"`, `result: "match"`,
`decision_ref` flipping the refactor `Decision.validated` to `true`.
The refactor ships with no visual regression.

**Failure mode — button moved 3px:** A `feature-request` workflow
adds a new icon to a `<SaveButton>`. Step 1 captures baselines at
3 viewports × 2 user states = 6 baseline `Event`s. Step 2 applies
the change. Step 3 captures 6 "after" `Event`s. Step 4's pixel-diff
produces 6 `Actual`s — 5 with `diff_pixel_ratio: 0.003` (within
threshold, the icon's new presence is intentional), 1 with
`diff_pixel_ratio: 0.04` (above the 1% threshold — the entire button
shifted 3px right because the icon's container added margin that
wasn't accounted for). Step 5 emits a `Validation` with `method:
"app_validation"`, `result: "mismatch"`, `evidence_refs` listing
the failing viewport's diff `Event`. The workflow transitions back
to `implement` with `on: visual_regression_detected`. Without this
skill, the change would have shipped with a green test suite (the
button's behavior was unchanged, only its position shifted) and the
3px misalignment would have shipped to users — exactly the
"asset bozulmaları, visual regression" pain point this skill exists
to prevent.

**Snapshot update handled correctly:** A `change-request` workflow
intentionally rebrands the `<SaveButton>` from blue to green. Step 1
captures the blue baselines. Step 2 applies the color change. Step 3
captures the green "after" screenshots. Step 4's pixel-diff produces
large `diff_pixel_ratio` values (the entire button changed color —
expected). Step 5 does NOT emit `result: "match"` automatically;
instead, the agent emits a separate `Decision` with `what:
"visual_snapshot_update:SaveButton:rebrand-blue-to-green"`, `why:
"intentional rebrand per design ticket #1234"`, `validated: false`
initially. The `Validation` is then re-emitted with `expected_ref`
pointing at the *new* `Expected` (green button), `actual_ref`
pointing at the green "after" capture, `result: "match"`,
`decision_ref` flipping the snapshot-update `Decision` to
`validated: true`. The rebrand ships with a clean audit trail.

## See also

- `skills/behavioral-verification/SKILL.md` — judges whether the
  `Validation.method: "app_validation"` produced by this skill is
  sufficient to close the workflow's `verify` state.
- `skills/self-healing/SKILL.md` — when a visual-regression test
  fails because the selector drifted (DOM changed but pixels would be
  fine), `self-healing` recovers the selector before this skill re-
  runs the pixel comparison.
- `skills/frontend/SKILL.md` — covers the broader frontend discipline
  (accessibility, responsive design, prop validation); this skill
  is the pixel-level specialization of `frontend`'s step 6 ("visual
  regression snapshots are `Decision` evidence, not noise").
