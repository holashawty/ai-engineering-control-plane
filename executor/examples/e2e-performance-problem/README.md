# End-to-end run: performance-problem workflow (N+1 query → JOIN, 23.6x speedup)

**This is the sixth e2e proof point** in the repo, alongside
`executor/examples/e2e-membership-bug/`,
`executor/examples/e2e-feature-request/`,
`executor/examples/e2e-code-review/`,
`executor/examples/e2e-refactor/`,
`executor/examples/e2e-change-request/`, and
`executor/examples/e2e-chat-adapter/`. The first five proved the
executor is workflow-agnostic across five structurally distinct
workflow shapes: reactive diagnostic (bug-report), constructive
feature (feature-request), gatekeeping (code-review),
behavior-preserving (refactor), and behavior-modifying
(change-request). This one proves the same workflow-agnosticism
for a sixth shape — **performance-problem** — which is structurally
distinct from all five: the code produces CORRECT output, just too
slowly. The diagnosis is not "find the line that produces the wrong
value" (that is bug-report), it is "find the operation whose cost
is too high." That single difference reshapes the workflow.

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state of
`performance-problem.sm.yaml`. Every `emitEvidence` call writes a
JSON file to disk that the executor's `EvidenceStore` validates
against the actual `evidence/schema/*.schema.json` files — a
schema violation would throw before the file is written. Every
transition goes through the real `StateMachine.advance` and
`WorkflowRun.advance` (with safety gate enforcement).

**Isn't:** a recording of a live multi-turn agent session issuing
one tool call at a time through an actual agent adapter. The
scenario data (the `wrk` output, the profiler output, the test
counts) is realistic but scripted — the `wrk` and `node --prof`
invocations are described in `Event.payload`s but not actually
executed by this driver. The same honest scope note as
`executor/examples/e2e-feature-request/README.md` applies: a
driver script assembling realistic data is not yet a live agent
session.

## What the run proves

Run `node executor/examples/e2e-performance-problem/drive-run.mjs`
and observe 41 assertions passing. The interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every
   transition's `from`/`to` is in `states[]`, no non-terminal
   state is a dead end, all 10 states reachable from `intake`.
2. **End-to-end walk.** A single `WorkflowRun` walks
   `intake → classify → capture-baseline → profile → diagnose-
   bottleneck → optimize → verify-improvement → regression-
   protect → report`, emitting schema-valid evidence at every
   emitting state.
3. **Safety gate is workflow-agnostic.** The `broad-refactor`
   gate at the `optimize` state blocks an un-confirmed advance
   out of `optimize` (the executor throws
   `safety-gate-needs-confirmation`), then allows the same
   advance once `advanceWithConfirmation` is called. This is the
   same gate code `bug-report` exercises at `propose-fix`/`apply-fix`,
   `feature-request` and `refactor` exercise at `implement`, and
   `change-request` exercises at `migrate` — proving the gate
   logic is keyed off the workflow's `safety_gates` declaration,
   not hardcoded to any one workflow. **The gate matters MORE for
   performance-problem than for those workflows:** performance
   optimizations are structurally invasive by nature (introduce a
   cache → touch every callsite; add an index → touch the schema
   and every query plan; rewrite a hot loop → touch the function
   signature and every caller). The `broad-refactor` threshold is
   exactly the right shape for catching "the optimization grew
   broader than the bottleneck diagnosis supported."
4. **Question economy with 2 allowed states.** The budget is
   `max_questions: 2, allowed_states: [classify,
   diagnose-bottleneck]`. The driver asks one decision-changing
   question in `classify` ("is this a latency problem at `/items`,
   or a throughput ceiling on the whole service?") and one in
   `diagnose-bottleneck` ("what is the acceptable target p99
   latency under 100 RPS?") — both accepted. A third question,
   attempted in `verify-improvement` (not in `allowed_states`), is
   rejected with `question-economy-wrong-state`. A third question
   in `diagnose-bottleneck` itself (in a fresh run, the budget
   already at 2) is rejected with `question-economy-exceeded`. The
   budget is higher than `bug-report`'s 1 because performance
   complaints are inherently more ambiguous than functional bug
   reports ("slow" needs context), and the two allowed questions
   are reserved for the two genuinely user-dependent decisions
   (the class in `classify`, the target in `diagnose-bottleneck`).
5. **AI-output validation pattern holds.** The optimization
   `Decision` is emitted with `validated: false, result: "pending"`
   — an AI proposal, not a self-confirmed claim. It only becomes
   trustworthy after `verify-improvement` emits a `Validation`.
6. **Decision trace preserved.** The bottleneck `Decision`
   (`decision-bottleneck-listItems-N-plus-1`) records three
   rejected alternatives (add a cache; speed up per-call queries;
   DataLoader batching) with rejection reasons — the eventual
   `report` state can cite these for the decision trace
   `constitution/engineering-principles.md` requires.
7. **`environment_fingerprint_ref` REQUIRED on the baseline Trace.**
   This is **the unique structural feature of performance-problem**
   that no other workflow in the catalog requires. Per
   `evidence/schema/trace.schema.json`, `environment_fingerprint_ref`
   is a non-required string field (the schema doesn't enforce it,
   but this workflow's `skills/performance-problem/SKILL.md`
   procedure does) — performance is environment-sensitive in a way
   functional behavior is not. Same code, different hardware (CPU,
   disk, memory bandwidth), different result. Without the
   fingerprint anchoring the baseline to the environment it was
   measured in, the eventual `verify-improvement` comparison is
   unverifiable (a 2x speedup observed on different hardware may
   be a 2x hardware difference, not a 2x optimization). The driver
   spot-checks the persisted baseline Trace JSON file to confirm
   `environment_fingerprint_ref` round-tripped through schema
   validation as a non-empty string. AND it confirms the
   `verify-improvement` Trace has the SAME fingerprint as the
   baseline Trace — the comparison is apples-to-apples.
8. **`verify-improvement` requires BOTH a performance check AND a
   functional regression check.** This is **the second unique
   structural feature of performance-problem**. Per ADR-0010
   ("no exception ≠ success") specialized to performance: a green
   test suite alone is insufficient (no performance measurement);
   a performance improvement alone is insufficient (no functional
   regression check); BOTH are required for `result: "match"`. The
   `Validation` emitted here has `method: "replay_comparison"`
   (the baseline load replayed against the optimized code on the
   same hardware) and `evidence_refs[]` that includes BOTH the
   baseline `event`s AND the post-optimization `event`s — a
   `Validation` with only post-optimization evidence has no
   baseline to compare against and is unverifiable. Critically,
   the `evidence_refs[]` also includes the test-suite-pass event
   (`event-verify-test-suite-pass`) — the functional regression
   check is a first-class member of the validation, not an
   afterthought. A 10x speedup that breaks 3 tests would have
   `result: "mismatch"`, not `result: "match"` — faster wrong
   output is NOT improvement.
9. **`regression-protect` writes a `known-failure` memory entry for
   a PERFORMANCE regression.** This is **the third unique
   structural feature of performance-problem**. Every other
   workflow that writes a `known-failure` memory entry
   (`bug-report` at its `regression-protect`, `change-request`
   at its `report`) records a FUNCTIONAL regression — the code
   produces wrong output. This workflow's `known-failure` entry
   records a PERFORMANCE regression: the `symptom` is a latency
   symptom ("GET /items p99 latency > 1s under 100 RPS load"),
   the `root_cause` names the bottleneck ("listItems() issued an
   N+1 query — 100 DB roundtrips for 100 items"), the `fix`
   describes the optimization ("replaced the N+1 query with a
   single JOIN"). Future code that reintroduces the N+1 pattern
   (a refactor that splits the JOIN back into per-item queries,
   a new feature that adds a per-item lookup in the loop) should
   fire the `regression` workflow per `workflows/_router.md`'s
   "a `known-failure` memory entry's symptom recurs" routing
   rule — and this entry is the prior incident being regressed.
   Without this memory entry, a future developer who refactors
   the optimized function back into the slow shape has no warning
   that the slowness is a known regression, not a new discovery.
10. **Memory updates at terminal.** The `report` state writes a
    real `project` memory entry recording the new performance
    contract ("GET /items p99 < 200ms under 100 RPS, achieved by
    replacing the N+1 query with a JOIN — future modifications
    must not reintroduce the per-item query"), so a future
    workflow run doesn't re-derive the contract or re-diagnose
    the same bottleneck when the code is touched again.
11. **Disk persistence.** Evidence files actually land on disk
    under `evidence/<kind>/*.json` and `memory/<kind>/*.json` —
    the driver spot-checks several (the baseline Trace with its
    `environment_fingerprint_ref`, the
    `verify-improvement` Validation with `method:
    "replay_comparison"`, the AI-proposal optimization Decision,
    the bottleneck Decision with alternatives, both `Expected`
    entities, the `known-failure` memory entry with its
    performance symptom) to confirm the persisted JSON matches
    what was emitted.

## The scenario

A realistic performance complaint: *"the `/items` endpoint is
slow when 100 users hit it at once — used to be fast."* The
driver models:

- **classify:** asks one decision-changing question ("is this a
  latency problem at `/items`, or a throughput ceiling on the
  whole service?") — exactly the kind of question that cannot be
  answered by repo inspection, because the optimization differs
  (latency → find the slow operation; throughput → find the
  concurrency bottleneck).
- **capture-baseline:** runs `wrk -t4 -c100 -d30s` against the
  `/items` endpoint, captures `p99_latency_ms = 1180` and
  `db_query_count_per_request = 100` as a `Trace` of `test_result`
  `Event`s with `payload.metrics`, sets
  `environment_fingerprint_ref = "env-fp-node-20-macos-m2-16gb-postgres-15-local"`
  on the Trace (the unique structural feature — anchoring the
  baseline to the environment it was measured in), authors an
  `Expected` describing the performance contract being violated
  ("p99 < 200ms under 100 RPS, no N+1 queries").
- **profile:** runs `node --prof` then `--prof-process`, captures
  the top contributors as a `Trace` of `observation` `Event`s —
  `listItems()` 1180ms cumulative (98.3% of wall time, called
  once per request but issuing 100 DB roundtrips internally),
  `db.query()` 1180ms cumulative (98.3%, called 100 times — the
  leaf cost, but the bottleneck is the CALLER's choice to call it
  100 times, not the query itself).
- **diagnose-bottleneck:** emits a `Decision`
  (`what: "bottleneck_candidate:listItems_N+1_query"`,
  `validated: false` — candidate until verify-improvement
  confirms the optimization actually addressed it,
  `evidence_refs[]` pointing at the profiler `Event`s) with three
  rejected alternatives (cache, per-call speedup, DataLoader
  batching — each rejected for a specific reason). Asks the second
  question: "what is the acceptable target p99 latency under 100
  RPS?" — decision-changing because without a target,
  "improvement" is unmeasurable. Emits an `Expected` describing
  the post-optimization target (measurable: "<50ms per request").
- **optimize:** blocked by safety gate until confirmed (the
  optimization touches 3 files: `src/services/items.ts`,
  `src/repositories/items.ts`, `src/routes/items.ts`); emits the
  AI-proposal `Decision` (`validated: false`) and a `file_change`
  `Event` recording the structural diff (rewrites `listItems()`
  to issue a single SELECT+LEFT JOIN).
- **verify-improvement:** re-runs `wrk` against the optimized
  code on the SAME hardware (same `environment_fingerprint_ref`
  as the baseline Trace), captures `p99_latency_ms = 50` (23.6x
  improvement) AND `db_query_count_per_request = 1` (down from
  100 — the JOIN collapsed the N+1) AND runs the existing 12-test
  suite (all pass — no functional regression). Emits `Actual` +
  `Validation` with `method: "replay_comparison"`,
  `result: "match"`, `evidence_refs[]` pointing at BOTH the
  baseline events AND the post-optimization events AND the
  test-suite-pass event.
- **regression-protect:** writes a `known-failure` memory entry
  recording the performance regression — `symptom` is a latency
  symptom (NOT "wrong result"), `root_cause` names the N+1
  bottleneck, `fix` describes the JOIN optimization. Future code
  that reintroduces the N+1 pattern should fire the `regression`
  workflow.
- **report:** writes the `project` memory entry recording the
  new performance contract, terminal.

## What makes performance-problem different (the architectural point)

Before this run, the repo's six e2e proofs were all *value-shaped*
workflows — every one of them is fundamentally about the value
the code produces (correct or wrong, new or old, equivalent or
divergent). `performance-problem` is the first *cost-shaped*
workflow: the value is unchanged (the code produces correct
output), but the cost is too high. This requires three structural
innovations that no prior workflow has:

1. **`environment_fingerprint_ref` REQUIRED on the baseline Trace.**
   No other workflow in the catalog requires this field at any
   state. The reason is structural: in a *value-shaped* workflow,
   the environment affects the symptoms but not the diagnosis
   (a wrong value is wrong on any hardware). In a *cost-shaped*
   workflow, the environment IS the measurement — a 2x speedup
   observed on different hardware than the baseline may be a 2x
   hardware difference, not a 2x optimization. Without the
   fingerprint anchoring the baseline to the environment it was
   measured in, the eventual `verify-improvement` comparison is
   unverifiable. The schema doesn't enforce this field (it is
   optional in `evidence/schema/trace.schema.json`); the
   `skills/performance-problem/SKILL.md` procedure does — and
   the driver spot-checks that the persisted JSON round-tripped
   with the field set.

2. **`verify-improvement` requires BOTH a performance check AND a
   functional regression check.** Every prior workflow's `verify`
   state has ONE axis: "does the actual match the expected?"
   (behavioral correctness). `performance-problem`'s
   `verify-improvement` has TWO: "did the performance metric
   improve?" AND "did the existing test suite still pass?" A
   `Validation` with `result: "match"` requires BOTH. This is the
   ADR-0010 specialization for performance: a green suite alone
   is insufficient (no performance measurement), but it IS
   necessary (a fast broken system is not an improvement — it is
   a faster way to produce wrong output). The driver's
   `evidence_refs[]` includes the test-suite-pass event as a
   first-class member of the validation, not an afterthought.

3. **`regression-protect` writes a `known-failure` memory entry for
   a PERFORMANCE regression.** Every other workflow that writes a
   `known-failure` memory entry (`bug-report`'s
   `regression-protect`, `change-request`'s `report`) records a
   FUNCTIONAL regression — the code produces wrong output.
   `performance-problem`'s `regression-protect` records a
   PERFORMANCE regression: the code is correct, but slow in a
   specific way. The `symptom` field is a latency symptom
   ("p99 > 1s"), the `root_cause` names the bottleneck
   ("N+1 query pattern"), the `fix` describes the optimization
   ("replaced with a JOIN"). Future code that reintroduces the
   slow pattern (the same N+1 query, the same O(n²) loop) should
   fire the `regression` workflow per `workflows/_router.md`'s
   routing rule — and this entry is the prior incident being
   regressed.

The fact that the same executor runs all seven (bug-report,
feature-request, code-review, refactor, change-request,
chat-adapter, performance-problem) without code changes is the
empirical proof of the "workflow-agnostic executor" claim — now
demonstrated across seven structurally distinct workflow shapes:
reactive diagnostic, constructive feature, gatekeeping,
behavior-preserving, behavior-modifying, chat-protocol, and
performance-cost. That's the architectural point of this proof.
