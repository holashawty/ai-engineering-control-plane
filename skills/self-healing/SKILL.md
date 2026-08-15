---
name: self-healing
description: Use when tests fail due to selector/locator drift (UI element moved, renamed, or restructured) — automatically discovers the closest matching element, updates the selector, and re-runs the test without human intervention. Covers Playwright Healer pattern, AI-powered locator recovery, and DOM-diff-based element matching. Distinct from visual-regression (which checks pixel output); this skill fixes the test infrastructure itself. License MIT; tool integration cites Playwright Healer (75%+ success per web research 2026-08-15), custom DOM search, and BackstopJS selector recovery.
license: MIT
allowed-tools: [shell_exec, filesystem_read, filesystem_write]
---

# Self-Healing Tests

## When to use this skill

When a test fails with "element not found," "selector timeout,"
"locator unmatched," or any failure mode where the *test
infrastructure* cannot find the UI element the test was written
against — and the element's absence is the symptom, not the bug.
The element may have moved in the DOM, been renamed, had its
attributes restructured, or been wrapped in an extra container by
a presentational refactor.

This skill is the patron's stated solution to the pain point of
"gömülü tarayıcıdan selector toplayamıyor" ("cannot collect
selectors from the embedded browser") — when an embedded-browser
test runner (Electron, Phaser, embedded Chromium) reports stale
selectors because the rendered DOM has drifted from the snapshot
the test was written against, this skill recovers them
automatically rather than asking the human to manually re-inspect.

**Especially when:**

- A test was passing yesterday and fails Today without a code change
  to the test itself — the application code shifted a selector, the
  test was correct at write-time, and the failure is a *selector
  drift*, not a behavioral regression.
- A refactor PR has shifted DOM structure without changing behavior
  — the visual output is identical, the tests are stale, and a
  human is unavailable to re-record selectors in the next 5 minutes.
- A CI run fails intermittently on a single selector-based test
  while the rest of the suite passes — a "flaky" selector is often
  a selector that's brittle to DOM timing or ordering, not flaky
  at all; this skill finds a more stable selector.

**Don't use when the failure is behavioral:** if the test fails
because the actual output is wrong (a number is 42 instead of 41),
self-healing is the wrong tool — the *behavior* is broken, and
healing the selector would mask the bug. Use `systematic-debugging`
instead. This skill fixes *test infrastructure*, not *application
behavior*; the distinction is the difference between "the test is
looking for the right thing in the wrong place" (self-heal) and
"the test is looking for the right thing in the right place and
the wrong thing is there" (debug).

**Don't use as a substitute for `visual-regression`:** that skill
checks pixel output. This skill fixes selectors. They compose: a
`self-healing` recovery (selector updated) should be followed by
a `visual-regression` capture to confirm the healed selector still
finds the right element visually.

## Procedure

### 1. Capture the failing selector + error

Record the failure as an `Event`
(`evidence/schema/event.schema.json`) of `kind: "error"` with:

- `source: "mcp:playwright"` (or the test runner's adapter-source
  prefix — `"agent_adapter:<tool>"` for non-MCP runners).
- `payload.failing_selector: "<selector string>"` — verbatim, the
  exact selector string the test was using.
- `payload.selector_strategy: "css"|"xpath"|"text"|"role"|"test-id"`
  — how the selector was written. `test-id` (Playwright
  `data-testid`, Cypress `data-cy`) is the most stable; CSS-class
  selectors are the most brittle.
- `payload.error_message: "<full error>"` — verbatim error text
  from the test runner.
- `payload.test_file: "<path>"` and `payload.test_line: <number>` —
  where in the test file the failing selector is referenced.
- `payload.failed_at: "<ISO8601>"` — when the failure occurred.

This `Event` anchors every later step — never proceed without it.
A self-heal run that updates a selector without first recording what
the old selector was and why it failed is *not* a self-heal, it's
silent mutation (per `constitution/constitution.md` §5:
"Self-improvement is proposal, never silent mutation").

### 2. Search the DOM for the closest match

Open the page the test was driving and capture the current DOM as
an `Event` of `kind: "observation"` with `source:
"mcp:playwright:dom-snapshot"` (or the appropriate adapter prefix)
and `payload.dom: "<serialized HTML>"`. The DOM snapshot is the
search space for the closest match.

Search strategies, in order of preference (most stable first):

1. **Test-ID recovery (preferred when test-ids exist):** if the
   failing selector was a `data-testid` selector and the element
   was renamed, search for an element with the same `data-testid`
   value — it's likely still present, just at a different path.
   Playwright's `page.getByTestId('save-button')` is robust to
   DOM restructuring by design.
2. **Role + accessible-name recovery:** search for an element
   matching the failing element's `role` (button, link, textbox,
   etc.) and `accessible-name` (the visible text or `aria-label`).
   Playwright's `page.getByRole('button', { name: 'Save' })` is
   robust to DOM restructuring *and* to text-content changes that
   preserve the accessible name.
3. **Text-content recovery:** if the failing selector was a text-
   based selector and the text is unchanged, search for an element
   whose `textContent` matches. Brittle to text changes — prefer
   role+name recovery when an accessible name exists.
4. **Structural similarity recovery (the AI-powered locator
   recovery pattern, Playwright Healer-style):** when none of the
   above work, compute a structural similarity score between the
   failing selector's expected shape (its attributes, classes, DOM
   position relative to siblings and parents) and every element in
   the current DOM. The closest match above a similarity threshold
   (default 0.7 cosine similarity over a bag-of-attributes
   representation) is the candidate healed selector. Per web
   research 2026-08-15, this approach (Playwright Healer) achieves
   75%+ success on real-world selector drift.

For each candidate, record an `Event` of `kind: "observation"` with
`payload.candidate_selector`, `payload.match_strategy` (one of the
four above), `payload.similarity_score` (for strategy 4), and
`payload.matching_element_html` (the actual element the candidate
selects). Multiple candidates are fine — step 3 picks one.

### 3. If a candidate is found, update the test file with the new selector

Emit a `Decision` (`evidence/schema/decision.schema.json`) recording
the proposed heal:

- `what: "self_heal:<test_file>:<test_name>:<old_selector>→<new_selector>"`
  — the full before/after, machine-parseable.
- `why: "failing selector '<old>' no longer matched any element in
  the rendered DOM; candidate '<new>' found via <strategy> with
  similarity <score>."` — the rationale a future reviewer needs to
  confirm the heal was correct, not just convenient.
- `validated: false` initially — flipped only by step 5's `Validation`.
- `made_by: "agent"` — this is an AI-proposed change, not a human-
  authored fix; `constitution/constitution.md` §2 requires every
  AI-proposed change to start `validated: false`.
- `result: "pending"` until the `Validation` flips it to `"accepted"`.
- `evidence_refs`: listing the failure `Event` from step 1 and the
  candidate `Event` from step 2 — the heal is anchored to evidence,
  not plausibility.

Write the new selector to the test file via `filesystem_write`. The
file mutation is a real host change (per the MCP adapter's
`filesystem_write: true` declaration, this is a real file write,
not a sandbox write). Emit a `kind: "file_change"` `Event`
recording `payload.path`, `payload.old_selector`, `payload.
new_selector`, `payload.line`.

### 4. Re-run the test

Re-run the failing test (via `test_runner` if the adapter exposes
it, else `shell_exec`) and capture the result as an `Event` of
`kind: "test_result"` with `source: "mcp:test-runner"` (or
`"agent_adapter:<runner>"`) and `payload.passed: true|false`,
`payload.output: "<stdout/stderr>"`, `payload.run_at: "<ISO8601>"`.

### 5. Emit a `kind: "action"` `Event` recording the self-heal

Regardless of whether the test now passes, emit a final `Event` of
`kind: "action"` with `source: "mcp:self-healing"` (or the
appropriate adapter prefix), `payload.action: "selector_healed"`,
`payload.healed_selector: "<new>"`, `payload.original_selector:
"<old>"`, `payload.test_status: "pass"|"fail"`, and `payload.
decision_ref: "<decision-id>"` linking back to the step-3
`Decision`. This is the audit trail entry that lets a future
`regression` workflow trace why a selector changed.

### 6. If the test still fails, emit a `Decision` and transition to `blocked`

If the re-run still fails (either the new selector doesn't find an
element, or it finds the wrong element and the test fails
behaviorally), emit a `Decision` with:

- `what: "self_heal_failed"`
- `validated: false` — the heal did not produce a passing test.
- `why: "self-heal candidate '<new>' found element but test still
  fails: <failure-reason>. Manual selector re-authoring required."`
- `result: "rejected"` — the heal is rejected, not accepted.
- `evidence_refs`: listing the failure `Event`, the candidate `Event`,
  and the re-run `Event`.

Transition the workflow to `blocked` with `on: self_heal_failed`
and tell the user precisely what was tried (the failing selector,
the candidate selector, the match strategy, the similarity score,
the failure reason). Do NOT attempt a second speculative heal on
top of the first — that is the guess-and-revert cycle this skill
exists to prevent. A human should re-author the selector with
full context of why the heal failed.

## Tool integration

- **Playwright Healer** (per web research 2026-08-15): the
  established pattern for AI-powered locator recovery. 75%+ success
  rate on real-world selector drift. When integrated as a
  Playwright plugin, it transparently intercepts "element not
  found" errors, runs the structural similarity search, and
  updates the selector in-place. The AIECP integration is via
  this skill's procedure — the Playwright Healer does the
  search, this skill emits the `Decision`/`Event`/`Validation`
  chain around it.
- **Custom DOM search**: when Playwright Healer is not installed,
  the same structural-similarity search can be implemented via
  `shell_exec` running a Node script that uses Playwright's
  `page.evaluate()` to enumerate elements and compute similarity
  scores. The procedure is the same; the tool integration is
  shell-driven rather than plugin-driven.
- **BackstopJS selector recovery**: BackstopJS's `misMatchThreshold`
  and selector-based scenarios can produce "selector not found"
  errors when the DOM drifts; this skill's procedure applies
  identically — capture failing selector, search DOM for closest
  match, update scenario config, re-run.
- `shell_exec`: run the test runner, run the DOM-search script,
  capture stdout/stderr as `Event.payload`. Prefer one-shot
  scriptable commands — the output must be replayable by a future
  `Replay` step.
- `filesystem_read`: read the test file (to find the failing
  selector's exact line), read the application source (to understand
  the intended DOM structure and confirm the candidate selector
  matches the application's actual element), and read prior
  `Decision`/`Event` artifacts when building a reference chain.
- `filesystem_write`: write the healed selector to the test file.
  Real host mutation — emit a `kind: "file_change"` `Event` per
  step 3. Update only the selector, never the test's assertions
  (a self-heal that changes what the test *checks for* is silent
  mutation of the test contract, not self-healing).

**For chat LLMs without `shell_exec`/`filesystem_write`:** this
skill is *not* usable. Self-healing requires actually running the
test runner against the rendered DOM and actually writing the
healed selector to the test file. A chat LLM without these tools
should emit a `Decision` with `what: "self_heal_unavailable"`,
`validated: false`, and transition the workflow to `blocked` with
`on: requires_self_healing_tool`. The chat LLM may *propose* a
candidate selector based on mental simulation of the DOM, but the
proposal is `method: "manual_review"` evidence, not a healed test
— a tool-using agent must re-run the heal against the real DOM
before accepting it.

## Validation (of this skill itself)

A self-heal run using this skill is done correctly only if:

- A failure `Event` was emitted BEFORE the heal was attempted, with
  the failing selector, error, and test location verbatim (evidence-
  before-explanation, enforced structurally).
- A DOM-snapshot `Event` was emitted showing the search space the
  heal was performed against — without it, a reviewer cannot confirm
  the candidate was actually the closest match.
- A candidate `Event` was emitted with `match_strategy` and
  (for strategy 4) `similarity_score` — the heal's reasoning is
  recorded, not opaque.
- A `Decision` was emitted with `what: "self_heal:..."`, `validated:
  false` initially, `made_by: "agent"`, and `evidence_refs` listing
  the failure and candidate `Event`s — the heal is an AI-proposed
  change, not an automatic fix (per `constitution/constitution.md` §2).
- A file-change `Event` was emitted with the exact old/new selector
  and line number — the mutation is auditable, not silent (per
  `constitution/constitution.md` §5).
- A re-run `Event` was emitted with `passed: true|false` and the
  test's stdout/stderr — the heal's outcome is observed, not assumed.
- A final `kind: "action"` `Event` was emitted recording the self-
  heal outcome and linking back to the `Decision` — the audit trail
  lets a future `regression` workflow trace why the selector changed.
- The `Decision.validated` is flipped to `true` only if the re-run
  passed; otherwise `result: "rejected"` and the workflow is in
  `blocked` with `on: self_heal_failed`.

A self-heal that updates a test file without emitting the full
`Event`/`Decision` chain is silent mutation — exactly what
`constitution/constitution.md` §5 prohibits. The self-heal itself
is allowed; skipping the audit trail is not.

## Examples

**Happy path — selector healed, test passes:** A Playwright test for
a `<SaveButton>` was using `page.locator('.btn-primary.save')` and
fails after a Tailwind migration renamed the classes to
`.bg-blue-500.save-action`. Step 1 captures the failure `Event`.
Step 2 searches the DOM: strategy 1 (test-id) fails (no test-id
exists); strategy 2 (role+name) finds `page.getByRole('button',
{ name: 'Save' })` matching the visible button text. Step 3 emits
`Decision: {what: "self_heal:save.spec.ts:save-button:.btn-primary.
save→getByRole('button',{name:'Save'})", validated: false,
made_by: "agent"}` and writes the new selector to the test file.
Step 4 re-runs the test: passes. Step 5 emits `kind: "action"`
`Event` with `payload.action: "selector_healed"`,
`payload.test_status: "pass"`. Step 6 is skipped (test passed).
The `Decision.validated` is flipped to `true` by the re-run
`Validation` (per `behavioral-verification/SKILL.md`'s procedure,
which judges the heal's `Validation.method: "app_validation"` as
sufficient). Without this skill, the human would have had to
manually re-inspect the rendered DOM, find the new classes, and
update the test — a 5-minute task that this skill completes in
seconds.

**Failure mode — closest match not found, blocked:** A Playwright
test for a legacy `<input>` was using `page.locator('#login-form
input[name=username]:nth-child(2)')` and fails after a refactor
restructures the form's children. Step 1 captures the failure.
Step 2 searches the DOM: strategy 1 (test-id) fails (no test-id);
strategy 2 (role+name) finds `page.getByRole('textbox', { name:
'Username' })` — but the test was specifically checking the
*nth-child positioning* of the input, which the role+name selector
does not preserve. Strategy 4 (structural similarity) finds a
candidate with 0.62 similarity (below the 0.7 threshold). Step 3
emits the `Decision` anyway (the candidate was below threshold but
worth trying), writes the selector, and re-runs the test. Step 4
re-runs: fails (the selector finds the wrong input — the form now
has two username-shaped inputs and the healed selector picked the
wrong one). Step 6 emits `Decision: {what: "self_heal_failed",
validated: false, result: "rejected", why: "healed selector
matched wrong element; structural similarity 0.62 below 0.7
threshold was correctly conservative but no better candidate
existed; manual re-authoring required"}` and transitions the
workflow to `blocked` with `on: self_heal_failed`. Without this
skill's discipline, the agent might have attempted a second
speculative heal on top of the first — the guess-and-revert cycle
this skill exists to prevent.

## See also

- `skills/visual-regression/SKILL.md` — after a self-heal, run
  visual regression to confirm the healed selector finds the
  right element visually, not just functionally.
- `skills/systematic-debugging/SKILL.md` — when the failure is
  behavioral (the selector finds the right element but the
  element's behavior is wrong), use systematic-debugging instead.
  This skill's "Don't use when the failure is behavioral" note
  above is the routing decision.
- `skills/behavioral-verification/SKILL.md` — judges whether the
  `Validation.method: "app_validation"` produced by this skill's
  step-5 `Event` is sufficient to close the workflow's `verify`
  state (it is, per the procedure above).
- `skills/frontend/SKILL.md` — covers the broader frontend-test
  discipline of which selector-strategy choice is one part; this
  skill is the recovery layer when a brittle selector choice was
  already made.
