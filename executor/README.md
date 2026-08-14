# aiecp-run — Workflow Executor

The core engine that walks a workflow `.sm.yaml` state machine
(currently `workflows/bug-report.sm.yaml`, ADR-0016), enforces question
economy (`constitution/constitution.md` §4) and safety gates
(`constitution/constitution.md` §3, `docs/security-model.md`), and
validates + persists Evidence Model / Memory artifacts against the
Phase 1 JSON Schemas.

## What this is NOT (yet)

This is the *engine*, not an agent. It does not itself diagnose bugs,
call an LLM, or decide what evidence to emit — it is the thing an agent
(or, in the self-test, a scripted stand-in for one) drives through the
`WorkflowRun` API (`src/run.ts`). Wiring a real agent adapter
(Claude Code / Codex, per ADR-0007's MVP scope) to actually call this
API is separate, not-yet-started work — see `STATUS.md`.

## Usage

```bash
npm install
npm run build

# Runs the full self-test suite (see below)
npm test
```

There is no interactive CLI mode yet — `WorkflowRun` is meant to be
driven programmatically. See `src/cli.ts`'s self-test scenarios for the
calling pattern any future agent adapter should follow.

## What's verified so far (2026-08-12)

The self-test drives three scripted scenarios end to end:

1. **Full happy-path `bug-report` run** — intake through report,
   asking exactly one question (in `classify`, the only allowed state),
   emitting a real instance of every one of the 8 MVP Evidence Model
   entities (Incident, Trace, Event, Decision, Expected, Actual,
   Validation, Replay) plus a `known-failure` Memory entry — every one
   validated against its actual JSON Schema, not just structurally
   plausible. Also proves the safety gate on `propose-fix -> apply-fix`
   genuinely blocks an unconfirmed transition and allows a confirmed
   one.
2. **Question economy enforcement** — a second question in the same run
   is rejected (`max_questions: 1`); a question asked outside
   `classify` (the only entry in `allowed_states`) is rejected in a
   separate run.
3. **Invalid input rejection** — an event with no matching transition
   from the current state throws; evidence missing required schema
   fields throws instead of being written; an unknown evidence kind
   throws.

All 20 assertions across the 3 scenarios pass (`npm test`).

**Two real bugs were found and fixed while building this, both by the
schema validation actually doing its job:**
- `ajv-formats` wasn't wired in initially, so `date-time` format
  constraints were silently ignored (ajv printed "unknown format
  ignored" warnings and let malformed dates through). Fixed by adding
  `ajv-formats` and calling it in `EvidenceStore`'s constructor.
- The scripted happy-path scenario itself initially omitted the
  required `schema_version` field on its `known-failure` memory entry
  — schema validation correctly rejected it rather than silently
  writing an invalid memory document. Fixed the test data, not the
  schema (the schema was right).

## Not yet done

- No real agent adapter drives this yet — everything above is a
  scripted stand-in for what an LLM-driven agent would do.
- `.sm.yaml` itself has no JSON Schema (`workflow-loader.ts` does
  structural checks — dangling transitions, dead-end states — but not
  full schema validation).
- Referential integrity across evidence documents (does
  `decision.trace_ref` actually point at a `Trace` that was written?)
  is not checked — flagged as a gap in
  `skills/evidence-engineering/SKILL.md` §Validation.
- Only `bug-report` is wired up; the executor's `WorkflowRun` class is
  written to be workflow-agnostic (it reads `states`/`transitions`/
  `safety_gates`/`question_economy` generically from whatever
  `WorkflowDefinition` it's given), but no other `.sm.yaml` exists yet
  to prove that generality against a second real workflow.
