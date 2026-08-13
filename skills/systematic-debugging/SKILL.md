---
name: systematic-debugging
description: Use when diagnosing a reported bug or unexpected behavior — locates evidence, reproduces deterministically, and walks the debugging chain to a validated root cause before any fix is proposed. Adapted from obra/superpowers' systematic-debugging skill (MIT, see NOTICE) with the addition of the AIECP Evidence Model.
license: MIT
allowed-tools: [filesystem_read, shell_exec, test_runner]
---

# Systematic Debugging

## When to use this skill

Any time a workflow reaches `locate-evidence`, `reproduce`, or
`diagnose` in `workflows/bug-report.sm.yaml`. Do not skip straight to
"propose-fix" — a fix proposed without walking this procedure is a
guess, and guesses are exactly what `docs/evidence-model.md` and
`constitution/engineering-principles.md` ("Evidence before explanation")
prohibit.

## Procedure

### 1. Locate evidence (state: `locate-evidence`)

Before reading a single line of source code to form a theory, search
for evidence that already exists:

1. Check `known-failure` memory
   (`memory/schemas/known-failure.schema.json`) for a matching symptom.
   If found, the root cause and fix may already be known — skip to
   verifying it still applies rather than re-diagnosing from scratch.
2. Search recent commits touching the area implicated by the report.
3. Search logs / CI output / test failures for anything matching the
   symptom.
4. Read Project Intelligence (`.aiecp/project-intelligence.json`) to
   know which test runner and entrypoints are relevant — never assume
   a toolchain the project doesn't use.

Emit an `event` (`evidence/schema/event.schema.json`, `kind:
"log_line"` or similar) for each piece of evidence found, referencing
its source.

**Failure handling:** if no evidence can be located at all, transition
to `blocked` with `on: no_evidence_found` — do not proceed to guess.

### 2. Reproduce (state: `reproduce`)

1. Using the project's own test runner (per Project Intelligence
   `project.test_system`), attempt to write or run a minimal
   reproduction that deterministically triggers the reported symptom.
2. Capture an `environment_fingerprint` alongside the reproduction —
   version, OS, git commit — so the reproduction is replayable later
   (`replay` state, `evidence/schema/replay.schema.json`).
3. Emit a `trace` (`evidence/schema/trace.schema.json`) covering the
   reproduction run, with ordered `event` entries.

**Failure handling:** if the symptom cannot be reproduced after a
reasonable, evidence-guided effort (not infinite retries), transition
to `blocked` with `on: cannot_reproduce`, reporting exactly what was
tried. Do not fabricate a reproduction that "should" trigger it.

### 3. Diagnose (state: `diagnose`)

This is the hypothesis → test → minimal fix discipline, applied against
the Evidence Model rather than free-form reasoning:

1. From the trace, identify the *first* point where a `Decision` or
   state diverges from what `Expected` (`evidence/schema/expected.
   schema.json`) says should have happened.
2. State that divergence as a root-cause **candidate** — emit it as a
   `decision` with `validated: false`, `root_cause: false` initially.
3. Test the candidate: does forcing the opposite of that decision
   eliminate the symptom in a controlled way (e.g. a targeted unit
   test, a debugger breakpoint, a log statement)? This is the "test the
   hypothesis" step — do not accept a candidate on plausibility alone.
4. Only after the candidate is confirmed against evidence, emit a
   `validation` (`evidence/schema/validation.schema.json`, `method:
   "manual_review"` or stronger) and flip the `decision`'s
   `root_cause: true`.

**Failure handling:** if the root-cause candidate doesn't survive
testing, the workflow transitions back to `locate-evidence`
(`on: root_cause_invalid`) — this is expected and not a failure of the
skill, it's the skill working correctly. Do not force a candidate
through just because a first attempt was made.

## Tool integration

- `shell_exec`: run the project's own test runner and any reproduction
  scripts.
- `filesystem_read`: read source, logs, and test files.
- `test_runner`: structured access to test results (pass/fail, output)
  rather than parsing raw shell output where the adapter supports it.

## Validation

This skill is considered successful for a given run only if:
- At least one `event`/`trace` was emitted before any `decision` was
  proposed (evidence-before-explanation, enforced structurally).
- The final root-cause `decision` has `validated: true` and a
  `validation` entity referencing it.
- No question was asked during this skill's execution — `locate-
  evidence`/`reproduce`/`diagnose` are not in
  `bug-report.sm.yaml`'s `question_economy.allowed_states` (only
  `classify` is).

## Examples

**Happy path:** "login sometimes fails" → known-failure memory has no
match → recent commits show an auth middleware change 2 days ago →
reproduction written using project's pytest suite → trace shows a
race condition between token refresh and request retry → decision
candidate: "token refresh Decision assumed synchronous completion" →
tested by forcing sequential execution, symptom eliminated → validated,
root_cause: true.

**Failure mode handled correctly:** "app is slow sometimes" → evidence
located (slow query logs) → reproduction attempted with the project's
load-testing tool → cannot reliably reproduce within a reasonable
number of attempts → workflow transitions to `blocked` with a precise
gap ("cannot reproduce timing-dependent slowdown without production
traffic patterns") rather than shipping a speculative fix.
