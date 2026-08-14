---
name: behavioral-simulation
description: Use at the `verify` state of any workflow, after the test suite passes — simulates plausible end-user interaction sequences (clicks, form submissions, edge-case inputs, accessibility paths) against the changed behavior, emitting a `Trace` per simulation. Catches behavioral bugs that unit tests miss because tests assert what the author thought to check, while simulation explores what users actually do. Distinct from `behavioral-verification` (which checks one specific claim against `Expected`); this skill generates many plausible usage variations and checks each against the spec.
license: MIT
allowed-tools: [filesystem_read, shell_exec, test_runner]
---

# Behavioral Simulation

## When to use this skill

Use at the `verify` state of `feature-request`, `change-request`, or
`refactor` workflows — *after* `behavioral-verification` has confirmed
the implementation matches `Expected` for the specific scenario that
was tested. `behavioral-verification` proves the code does what its
author thought to check. This skill exists because users do not behave
like authors.

**Especially when:**

- The change touches a user-facing API, CLI flag, form field, or
  anything a human or external system can call with arbitrary input.
- The change has obvious "happy path" semantics but unclear edge
  behavior — empty input, very long input, concurrent calls, retry
  after timeout, partial-failure recovery.
- The change modifies behavior users may already depend on (in which
  case pair this skill with the `known-failure` memory entry from
  `change-request`'s `report` state — simulate the OLD usage patterns
  to find users who will break).
- The change is in code that has no test suite at all (this skill
  becomes the de facto test suite by simulating usage).

**Don't use as a substitute for `behavioral-verification`:** this
skill generates *variations* of behavior; `behavioral-verification`
checks the *one specific* behavior the `Expected` describes. Use both.
The order is: `behavioral-verification` confirms the claim, then
`behavioral-simulation` probes around it for what the author missed.

## Procedure

### 1. Read the `Expected` to identify what behaviors to vary

From the workflow's prior `design` (or `design-change`) state,
retrieve the `Expected` entity that describes the new behavior.
Decompose it into *parameters* a user can vary:

- **Input shape:** required fields, optional fields, field types,
  ranges (empty string, single char, max length, beyond-max-length,
  unicode, control characters, null bytes, embedded newlines).
- **Input source:** typed by a human (slow, with typos), pasted by a
  human (fast, exact), sent by another service (machine-speed, may
  retry, may concurrent), sent by an automated test (deterministic).
- **State when called:** cold start (no prior calls), warmed up (prior
  calls have primed caches), under load (concurrent calls racing),
  after a failure (retry path), after a long idle (session expired).
- **Environment:** clock skew, locale, timezone, daylight saving
  boundary, low-memory, slow-disk, network-partitioned-from-deps.

Record this decomposition as a `Trace` of `Event`s, one `Event` per
parameter dimension with `kind: "observation"` and a `payload.finding`
string describing the dimension. This Trace is the simulation plan —
every `Event` in it will become one or more simulated executions.

### 2. Generate the simulation matrix

For each dimension from step 1, enumerate at least three values:

- **Typical value** (baseline — should match what `behavioral-
  verification` already confirmed).
- **Boundary value** (the edge of the spec: empty, max-length, exactly
  at the threshold).
- **Adversarial value** (what a curious or hostile user would try:
  negative where positive expected, unicode where ASCII expected,
  concurrent where sequential expected).

For a `Trace` of N parameter dimensions, the full Cartesian product
is 3^N simulations. **Do not run all of them.** Run:

- All single-dimension variations (3 × N simulations — one dimension
  set to boundary or adversarial, all others at baseline).
- A small sample of multi-dimension combinations — pick the 2-3
  dimensions most likely to interact (e.g., for a form: `empty
  required field` + `concurrent submit`; for a CLI: `--flag with no
  value` + `piped stdin`).

The goal is coverage of *categories* of user behavior, not exhaustive
enumeration. Record the chosen matrix as a `Trace` whose `Event`s
list each chosen simulation with its parameter values.

### 3. Execute each simulation

For each entry in the matrix from step 2, mentally simulate (if you
are a chat LLM without tool use) or actually execute (if you have
`shell_exec` / `test_runner`) the behavior. For each:

- **Capture the input** verbatim in an `Event.payload.input` field.
- **Capture the observed output** in an `Event.payload.output` field
  (or `Event.payload.error` if the call raised).
- **Capture the duration** if timing matters (concurrency races).
- **Capture the side effects** if any (files written, calls made to
  dependencies, state mutated). For chat LLMs, reason about what side
  effects *would* occur; for tool-using agents, observe them directly.

Each simulation becomes one `Event` of `kind: "test_result"`. Group
all simulation `Event`s under a single `Trace` (the simulation run).

### 4. Compare each simulation against `Expected`

For each simulation's observed behavior, emit an `Actual` entity
referencing the `Expected` from the workflow's `design` state and
the specific `Event` from step 3. Then emit a `Validation`:

- `result: "match"` if the observed behavior is consistent with what
  `Expected` permits (note: `Expected` may permit a range — "returns
  200 or 404 depending on existence" — both are valid).
- `result: "mismatch"` if the observed behavior contradicts `Expected`.
  This is the bug this skill exists to find.
- `result: "inconclusive"` if `Expected` doesn't specify what should
  happen in this case. **This is itself a finding** — the spec has a
  gap. Record it; do not silently pick a behavior.

`method: "app_validation"` if executed, `method: "manual_review"` if
mentally simulated. The method choice is honest, not a judgment of
quality — a chat LLM doing mental simulation is doing real work, but
its conclusions are reviewable, not reproducible.

### 5. Aggregate findings

After all simulations complete, emit a final `Validation` summarizing
the simulation run:

- If **any** simulation produced `result: "mismatch"`: the aggregate
  `Validation.result` is `"mismatch"`, with `evidence_refs` listing
  the mismatching simulation `Event`s. Transition back to `implement`
  (or `migrate` for `change-request`) — the change has a behavioral
  bug.
- If **no** mismatches but **any** `inconclusive`: the aggregate
  `Validation.result` is `"inconclusive"`, with `evidence_refs`
  listing the spec-gap `Event`s. Transition back to `design` (or
  `design-change`) — the spec has gaps that must be closed before the
  change can be considered verified.
- If **all** simulations `match`: the aggregate `Validation.result`
  is `"match"`. Proceed to `document`.

**Do not skip step 5.** The per-simulation `Validation`s are
necessary, but the aggregate is what the workflow's `verify` state
actually consumes — without it, the workflow cannot decide whether
to advance to `document` or loop back.

## Tool integration

- `filesystem_read`: read the `Expected` entity from prior states,
  read the source code being simulated (to reason about what it would
  do for each input).
- `shell_exec`: execute simulations when the agent has shell access.
  Prefer the project's own test runner (`test_runner`) when available;
  fall back to direct `shell_exec` for simulations the test runner
  can't express (e.g., concurrent calls, partial-failure injection).
- `test_runner`: structured execution of simulation scenarios that
  fit the test runner's shape. Not all simulations fit — concurrent
  calls and timing-dependent scenarios usually don't.

**For chat LLMs without tool use:** this skill is still usable. The
chat LLM mentally simulates each scenario by reading the source code
and reasoning about what it would do. The `method` of the resulting
`Validation` is `"manual_review"` instead of `"app_validation"`, and
the simulation `Event`s contain the LLM's predicted behavior rather
than observed. This is real work — a careful mental simulation catches
many bugs — but its conclusions are reviewable, not reproducible. A
tool-using agent should re-run any `manual_review` `Validation`s it
finds in memory when it later gains tool access.

## Validation

This skill is considered successful for a given run only if:

- At least one `Trace` was emitted containing the simulation plan
  (step 1+2).
- At least 5 simulation `Event`s were emitted (step 3) — fewer than
  this means the matrix was too narrow to be useful.
- Each simulation `Event` has a corresponding `Actual` and per-
  simulation `Validation` (step 4).
- An aggregate `Validation` was emitted (step 5) — without it, the
  workflow cannot decide.
- Any `mismatch` or `inconclusive` finding causes the workflow to
  loop back to `implement` or `design` (per step 5), NOT proceed to
  `document` with known gaps.

## Examples

**Happy path (chat LLM mode):** "add `?tag=` filter to `/items`
endpoint" → `behavioral-verification` confirms `?tag=a&tag=b` returns
additive matches → this skill decomposes the `Expected` into 4
dimensions (tag count, tag value shape, tag order, concurrent calls)
→ matrix of 12 simulations (3 single-dim + 2 multi-dim) → mental
simulation: `?tag=` (empty) returns 400 per spec, `?tag=<script>`
returns 400 (unexpected — spec didn't mention XSS, gap found) →
aggregate `Validation.result: "inconclusive"`, evidence_refs include
the XSS gap → workflow loops back to `design` to specify XSS handling.
Without this skill, the XSS gap would have shipped.

**Failure mode handled correctly:** "change password reset email
`from:` address" → simulation includes "user who filters email by
`from:` and has allowlist" → mental simulation: user's allowlist no
longer matches → email bounces or goes to spam → `result: "mismatch"`
against the spec's implicit "user receives email" requirement →
aggregate `mismatch` → workflow loops back to `migrate` with
"communicate the from-address change to users before deploying."
Without this skill, the change would have silently broken email
delivery for users with strict allowlists.

**When the spec is genuinely complete:** "extract `parseDate` helper
from `validateMembership`" (refactor) → simulation matrix of 8
scenarios (input shape, timezone, DST boundary, leap year, far-future
date) → all match `Expected` (the refactor preserved behavior) →
aggregate `match` → proceed to `document`. The simulation took 5
minutes and confirmed what the test suite alone could not: that the
refactored helper handles every input the original did.

## Why this skill exists (read this before skipping it)

Per ADR-0010 and `constitution/engineering-principles.md`: a passing
test suite is *technical* success. `behavioral-verification` adds
*behavioral* success for the specific scenario the author thought to
check. **This skill adds behavioral success for the scenarios the
author did not think to check.** That is its entire purpose — to
probe the spec's blind spots by simulating users who do not know
what the spec permits and will try anything.

The honest scope note: this skill does not replace a real QA pass by
a human tester or a property-based test suite. What it does is make
the agent following this framework probe its own work the way a
curious user would, *before* declaring the work done. A 5-minute
simulation pass catches the XSS gaps, the empty-input crashes, and
the "I forgot users in other timezones exist" bugs that ship when
agents stop at "tests pass."
