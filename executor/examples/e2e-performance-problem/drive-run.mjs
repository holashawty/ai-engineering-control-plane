// End-to-end driver for performance-problem.sm.yaml. Feeds a scripted
// (but realistic) performance-problem scenario through the real
// WorkflowRun API — emits real, schema-valid Evidence Model entities
// at each state, writes a real `known-failure` memory entry at the
// `regression-protect` state (a PERFORMANCE regression memory, not a
// functional one), and writes a real `project` memory entry at the
// terminal `report` state.
//
// What this proves:
//   1. performance-problem.sm.yaml loads cleanly through loadWorkflow
//      (structural validation, no dead ends, all 10 states reachable
//      from `intake`).
//   2. A real WorkflowRun walks intake -> classify -> capture-baseline
//      -> profile -> diagnose-bottleneck -> optimize -> verify-
//      improvement -> regression-protect -> report, emitting schema-
//      valid evidence at every emitting state.
//   3. The broad-refactor safety gate at the `optimize` state
//      blocks an un-confirmed transition out of `optimize`, then
//      allows it when confirmation is supplied (advanceWithConfirmation).
//      This is the same gate bug-report uses at propose-fix/apply-fix,
//      feature-request uses at implement, refactor uses at implement,
//      and change-request uses at migrate — proving the gate is
//      workflow-agnostic, not specific to any one workflow.
//   4. The question_economy (max_questions: 2, allowed_states:
//      [classify, diagnose-bottleneck]) enforces correctly: one
//      question in classify and one in diagnose-bottleneck are
//      accepted, a third question (attempted in optimize, not in
//      allowed_states) is rejected with question-economy-wrong-state.
//   5. The workflow's UNIQUE structural feature — `environment_fingerprint_ref`
//      is REQUIRED on the baseline `Trace` — is exercised: the
//      baseline Trace is emitted with environment_fingerprint_ref set
//      to a non-empty string (anchoring the baseline to the
//      environment it was measured in), and the spot-check confirms
//      it round-tripped through schema validation to the persisted
//      JSON file. This is the only workflow in the catalog that
//      requires this field at the baseline stage.
//   6. The `verify-improvement` state emits a Validation that
//      confirms BOTH a performance improvement (p99 latency dropped
//      from 1180ms to 50ms — 24x) AND a functional regression check
//      (the existing test suite still passes — no functional
//      regression). The Validation's evidence_refs include BOTH the
//      baseline events AND the post-optimization events, so the
//      comparison the Validation exists to make is actually citable.
//      A 10x speedup that breaks 3 tests is NOT improvement; this
//      driver's scenario is the happy path where both axes hold.
//   7. The `regression-protect` state writes a `known-failure`
//      memory entry for a PERFORMANCE regression (not a functional
//      one): the `symptom` is a latency symptom, the `root_cause`
//      names the N+1 bottleneck, and the `fix` describes the JOIN
//      optimization. This is the only workflow in the catalog that
//      writes a known-failure memory entry for a performance
//      regression — future code that reintroduces the N+1 pattern
//      should fire the `regression` workflow.
//
// What this does NOT prove: a live, multi-turn agent session driving
// the framework one tool call at a time. Same honest scope note as
// executor/examples/e2e-feature-request/README.md. The scenario
// metrics (p99 latency, db query count, profiler output) are realistic
// but scripted; the real `node --prof` / `wrk` invocations are
// described in Event payloads but not actually executed by this driver.

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { WorkflowRun } from "../../dist/run.js";
import { WorkflowViolation } from "../../dist/types.js";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = join(__dirname, "..", "..", "..", "workflows", "performance-problem.sm.yaml");

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  OK   ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}`);
    failed++;
  }
}

async function expectViolation(label, kind, fn) {
  try {
    await fn();
    check(`${label} (expected WorkflowViolation kind="${kind}")`, false);
  } catch (e) {
    if (e instanceof WorkflowViolation && e.kind === kind) {
      check(label, true);
    } else {
      console.log(`  FAIL ${label} — wrong error: ${e}`);
      failed++;
    }
  }
}

async function scenario() {
  const runDirParent = await mkdtemp(join(tmpdir(), "aiecp-performance-problem-"));
  const runDir = join(runDirParent, "evidence-and-memory");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  // The environment fingerprint — this is the field performance-problem
  // uniquely requires on the baseline Trace. Anchors the baseline to
  // the environment it was measured in so the verify-improvement
  // comparison is apples-to-apples.
  const ENV_FINGERPRINT_REF = "env-fp-node-20-macos-m2-16gb-postgres-15-local";

  console.log("=== End-to-end performance-problem run: '/items endpoint is slow under load' ===\n");
  console.log("User complaint: 'the /items endpoint is slow when 100 users hit it at once — used to be fast'\n");
  console.log("(Code produces CORRECT output, just too slowly. Not a bug-report — a performance-problem.)\n");

  // ------------------------------------------------------------------
  // intake -> classify
  // ------------------------------------------------------------------
  run.advance("intent_classified");
  check("state is classify", run.currentState === "classify");

  // classify: one allowed question. The decision-changing question
  // for performance-problem that the code cannot answer itself is
  // the CLASS: is this a latency problem at the endpoint, or a
  // throughput ceiling on the whole service? Different optimizations
  // (latency → find the slow operation; throughput → find the
  // concurrency bottleneck). The user's complaint is vague ("slow")
  // so the question is necessary.
  run.askQuestion("Is this a latency problem at /items specifically, or a throughput ceiling on the whole service?");
  check("question count is 1 (under max_questions=2)", run.questions.count === 1);

  // Emit the acceptance Decision — "proceed, scope = latency at /items"
  // (modeled per user answer: latency at the endpoint, throughput fine).
  await run.emitEvidence("trace", {
    id: "trace-classify-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-classify-1"],
  });
  await run.emitEvidence("event", {
    id: "event-classify-1",
    trace_ref: "trace-classify-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "project-intelligence.json + grep -rn 'listItems' src/",
    payload: {
      finding: "src/routes/items.ts:12 routes GET /items to listItemsHandler; src/services/items.ts:5 listItems() queries the DB once per item in the result set; the code produces correct output (functional behavior unchanged), just issues N roundtrips where 1 would do — confirmed performance problem, not functional bug",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-accept-perf-problem-1",
    trace_ref: "trace-classify-1",
    what: "acceptance:proceed_with_performance_problem",
    why: "code produces correct output, just too slowly; scope = latency at /items endpoint per user's classify answer; class = latency (not throughput); bottleneck pattern is N+1 query in listItems(), suspected but to be confirmed via profiler in profile state",
    validated: true,
    result: "accepted",
  });
  run.advance("class_known");
  check("state is capture-baseline", run.currentState === "capture-baseline");

  // ------------------------------------------------------------------
  // capture-baseline -> profile
  // ------------------------------------------------------------------
  // UNIQUE STRUCTURAL FEATURE: this state REQUIRES environment_fingerprint_ref
  // on the baseline Trace. Performance is environment-sensitive: same
  // code, different hardware, different result. Without this field,
  // the eventual verify-improvement comparison is unverifiable (a 2x
  // speedup observed on different hardware may be a 2x hardware
  // difference, not a 2x optimization).
  await run.emitEvidence("trace", {
    id: "trace-capture-baseline-1",
    started_at: new Date().toISOString(),
    source: "test_runner",
    environment_fingerprint_ref: ENV_FINGERPRINT_REF,
    event_refs: ["event-baseline-wrk-result", "event-baseline-db-query-count"],
  });
  await run.emitEvidence("event", {
    id: "event-baseline-wrk-result",
    trace_ref: "trace-capture-baseline-1",
    ts: new Date().toISOString(),
    kind: "test_result",
    source: "wrk -t4 -c100 -d30s http://localhost:3000/items (baseline, before any change)",
    payload: {
      metrics: {
        p50_latency_ms: 980,
        p99_latency_ms: 1180,
        throughput_rps: 84.7,
        error_rate: 0.0,
      },
      note: "p99 latency 1180ms is well above the inferred 200ms contract; throughput is 84.7 RPS despite 100 concurrent connections — server is request-bound, not connection-bound; consistent with each request doing 100 sequential DB roundtrips",
    },
  });
  await run.emitEvidence("event", {
    id: "event-baseline-db-query-count",
    trace_ref: "trace-capture-baseline-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "postgres query log (count of SELECT statements per /items request)",
    payload: {
      finding: "100 SELECT statements per /items request — one per item in the result set (N+1 query pattern); each query takes ~11.8ms roundtrip on average, totaling ~1180ms per request — exactly matching the observed p99 latency",
    },
  });
  await run.emitEvidence("expected", {
    id: "expected-items-endpoint-latency-contract",
    source_ref: "specs/spec.md#items-endpoint-latency-sla",
    predicate: "GET /items responds in <200ms at p99 under 100 RPS load with 0% errors; the endpoint must NOT issue more than 1 SELECT statement per request (no N+1 queries)",
    predicate_kind: "behavioral",
  });
  run.advance("baseline_captured");
  check("state is profile", run.currentState === "profile");

  // ------------------------------------------------------------------
  // profile -> diagnose-bottleneck
  // ------------------------------------------------------------------
  // Run a real profiler (Node --prof) and capture the output as a
  // Trace of observation Events. Each Event records one function's
  // hot-path contribution: function name, call count, total time,
  // percent of wall time — verbatim from the profiler output.
  await run.emitEvidence("trace", {
    id: "trace-profile-1",
    started_at: new Date().toISOString(),
    source: "manual_capture",
    environment_fingerprint_ref: ENV_FINGERPRINT_REF,
    event_refs: ["event-profile-listItems", "event-profile-db-driver-query", "event-profile-other"],
  });
  await run.emitEvidence("event", {
    id: "event-profile-listItems",
    trace_ref: "trace-profile-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "node --prof-process isolate-*-v8.log (top contributors by cumulative time)",
    payload: {
      finding: "listItems() in src/services/items.ts:5 — called 1 time per /items request, but internally issues 100 calls to db.query(); cumulative time per request: 1180ms (98.3% of wall time); this is the hot path",
      function: "listItems",
      call_count_per_request: 1,
      cumulative_time_ms_per_request: 1180,
      percent_of_wall_time: 98.3,
    },
  });
  await run.emitEvidence("event", {
    id: "event-profile-db-driver-query",
    trace_ref: "trace-profile-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "node --prof-process isolate-*-v8.log (second-hottest, called BY listItems)",
    payload: {
      finding: "db.query() in src/db/client.ts — called 100 times per /items request (once per item); total time per request: 1180ms (98.3% of wall time — same as listItems because listItems is the only caller); this is the leaf cost, but the bottleneck is the CALLER's choice to call it 100 times, not the query itself",
      function: "db.query",
      call_count_per_request: 100,
      cumulative_time_ms_per_request: 1180,
      percent_of_wall_time: 98.3,
      note: "fixing db.query() to be faster per-call would help marginally; fixing listItems() to call it ONCE (a JOIN) would help by 100x — the bottleneck is the caller, not the callee",
    },
  });
  await run.emitEvidence("event", {
    id: "event-profile-other",
    trace_ref: "trace-profile-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "node --prof-process isolate-*-v8.log (all other functions, summed)",
    payload: {
      finding: "all other functions combined: 20ms (1.7% of wall time) — JSON serialization, HTTP parsing, route matching, response writing; not the bottleneck",
      function: "(all other)",
      call_count_per_request: "various",
      cumulative_time_ms_per_request: 20,
      percent_of_wall_time: 1.7,
    },
  });
  run.advance("profile_complete");
  check("state is diagnose-bottleneck", run.currentState === "diagnose-bottleneck");

  // ------------------------------------------------------------------
  // diagnose-bottleneck -> optimize
  // ------------------------------------------------------------------
  // From the profiler output, identify the bottleneck: listItems()
  // issues an N+1 query (100 DB roundtrips per request). Emit as a
  // Decision (validated=false — candidate until verify-improvement
  // confirms the optimization actually addressed it) + an Expected
  // describing the post-optimization target.
  //
  // Second question (the diagnose-bottleneck question) is permitted
  // here: this is the second of the max_questions=2 budget, and
  // diagnose-bottleneck is in allowed_states. The question is the
  // target — "what is the acceptable p99 latency under 100 RPS?" —
  // because without a target, "improvement" is unmeasurable.
  run.askQuestion("What is the acceptable target p99 latency under 100 RPS load? (Without a target, 'improvement' is unmeasurable.)");
  check("question count is 2 (at max_questions=2)", run.questions.count === 2);

  await run.emitEvidence("decision", {
    id: "decision-bottleneck-listItems-N-plus-1",
    trace_ref: "trace-profile-1",
    what: "bottleneck_candidate:listItems_N+1_query",
    why: "profiler trace-profile-1 shows listItems() issues 100 sequential db.query() calls per /items request (N+1 pattern: 1 query for the list + 100 queries for each item); total cumulative time 1180ms = 98.3% of wall time per request; the bottleneck is the caller's choice to issue per-item queries, not the query itself — fixing db.query() to be faster per-call would help marginally (maybe 2x), but fixing listItems() to issue ONE query (a JOIN) would help by 100x",
    evidence_refs: ["event-profile-listItems", "event-profile-db-driver-query", "event-baseline-db-query-count"],
    validated: false, // candidate until verify-improvement confirms
    result: "pending",
    alternatives: [
      { option: "add a cache in front of db.query() (memoize per-item lookups within a request)", rejected_because: "addresses the symptom (slow per-item queries), not the cause (100 queries where 1 would do); first call still issues 100 roundtrips; cache invalidation contract adds complexity across every write site" },
      { option: "speed up db.query() per-call (e.g., prepared statements, connection pooling)", rejected_because: "would help marginally (maybe 2x), but the issue is structural — 100 roundtrips is too many regardless of per-call speed; a JOIN makes it 1 roundtrip" },
      { option: "introduce DataLoader-style batching (batch the 100 per-item queries into a single roundtrip)", rejected_because: "viable optimization for the N+1 pattern, but adds a runtime dependency (dataloader) and a non-trivial API surface; for this case, a JOIN at the SQL level achieves the same outcome with zero dependencies" },
    ],
  });
  await run.emitEvidence("expected", {
    id: "expected-post-optimization-target",
    source_ref: "user-confirmed-target-per-diagnose-bottleneck-question",
    predicate: "after optimization, listItems() issues exactly 1 SELECT statement per /items request (not 100); per-request total time drops below 50ms (a 24x improvement on the 1180ms baseline); GET /items p99 latency under 100 RPS drops below 200ms (meeting the inferred SLA)",
    predicate_kind: "behavioral",
  });
  run.advance("bottleneck_identified");
  check("state is optimize", run.currentState === "optimize");

  // ------------------------------------------------------------------
  // optimize: safety gate fires here (broad-refactor -> edit_source,
  // default policy = "ask"). Confirm an un-confirmed advance is blocked
  // BEFORE we proceed via advanceWithConfirmation.
  // ------------------------------------------------------------------
  await expectViolation(
    "un-confirmed transition out of optimize is blocked by safety gate",
    "safety-gate-needs-confirmation",
    () => run.advance("optimization_applied")
  );
  check("state is still optimize after blocked attempt", run.currentState === "optimize");

  // Now simulate the human confirming and proceed.
  run.advanceWithConfirmation("optimization_applied");
  check("state is verify-improvement after confirmation", run.currentState === "verify-improvement");

  // Emit the optimization Decision (AI proposal, validated=false)
  // + a file_change Event describing what changed structurally. We
  // emit these AFTER the confirmed advance for narrative simplicity
  // (same pattern as e2e-feature-request/drive-run.mjs and
  // e2e-refactor/drive-run.mjs). The schema permits this — Decision
  // only requires trace_ref + what + why + validated.
  await run.emitEvidence("decision", {
    id: "decision-impl-replace-N-plus-1-with-join",
    trace_ref: "trace-profile-1",
    what: "ai_proposal:apply_optimization_replace_N+1_with_JOIN",
    why: "rewrite listItems() in src/services/items.ts to issue a single SELECT with a LEFT JOIN against the items_metadata table (retrieving all 100 items and their metadata in one roundtrip) instead of 1 SELECT for the list + 100 SELECTs for each item's metadata; update the items repository (src/repositories/items.ts) and the items controller (src/routes/items.ts) to pass the new function shape through; the result set ordering is preserved by an explicit ORDER BY clause in the JOIN",
    validated: false, // AI proposal — flipped to true only after verify-improvement
    result: "pending",
    evidence_refs: ["decision-bottleneck-listItems-N-plus-1"],
  });
  await run.emitEvidence("event", {
    id: "event-impl-file-change",
    trace_ref: "trace-profile-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "src/services/items.ts, src/repositories/items.ts, src/routes/items.ts",
    payload: {
      diff_summary: "src/services/items.ts: rewrote listItems() from a 1+N query pattern to a single JOIN query (12 lines changed); src/repositories/items.ts: added a new fetchItemsWithMetadata() function that issues the JOIN (15 new lines); src/routes/items.ts: updated the call site to use the new repository function (2 lines changed); net LOC change: +5; files touched: 3 (under broad_refactor_threshold max_files=10, max_loc=300); public API surface unchanged — GET /items still returns the same JSON shape",
      public_api_surface: "unchanged — GET /items still returns JSON array of {id, name, metadata} objects in the same order; no caller-visible behavior change (only timing changed)",
    },
  });

  // Negative test: confirm a third question would exceed the budget.
  // Question is asked from `verify-improvement` state, which is NOT
  // in allowed_states [classify, diagnose-bottleneck], so it should
  // be rejected for that reason first — the wrong-state kind is the
  // more specific violation, so that's what we expect.
  await expectViolation(
    "third question asked in verify-improvement state (not in allowed_states) is rejected",
    "question-economy-wrong-state",
    () => run.askQuestion("Should the JOIN include an index hint for the query planner?")
  );

  // Also confirm the budget itself: a fresh run, two questions
  // already asked (one in classify, one in diagnose-bottleneck),
  // a third question in diagnose-bottleneck should be rejected as
  // exceeded (not wrong-state, since diagnose-bottleneck IS in
  // allowed_states).
  const budgetRun = new WorkflowRun(def, { runDir: join(runDir, "budget-test") });
  budgetRun.advance("intent_classified"); // classify
  budgetRun.askQuestion("First question in classify — allowed.");
  budgetRun.advance("class_known");
  budgetRun.advance("baseline_captured");
  budgetRun.advance("profile_complete");
  // now in diagnose-bottleneck, the second allowed state
  budgetRun.askQuestion("Second question in diagnose-bottleneck — allowed.");
  await expectViolation(
    "third question in diagnose-bottleneck exceeds max_questions=2",
    "question-economy-exceeded",
    () => budgetRun.askQuestion("Third question — should be rejected.")
  );

  // ------------------------------------------------------------------
  // verify-improvement -> regression-protect
  // ------------------------------------------------------------------
  // UNIQUE STRUCTURAL FEATURE: this state emits a Validation that
  // confirms BOTH a performance improvement (p99 latency dropped
  // from 1180ms to 50ms — 24x) AND a functional regression check
  // (the existing test suite still passes — no functional
  // regression). The Validation's evidence_refs include BOTH the
  // baseline events AND the post-optimization events, so the
  // comparison the Validation exists to make is actually citable.
  // method: "replay_comparison" because the post-optimization run
  // is a direct replay of the captured baseline load against the
  // same hardware (same environment_fingerprint_ref).
  await run.emitEvidence("trace", {
    id: "trace-verify-improvement-1",
    started_at: new Date().toISOString(),
    source: "test_runner",
    environment_fingerprint_ref: ENV_FINGERPRINT_REF, // SAME env as baseline
    event_refs: ["event-verify-wrk-result", "event-verify-db-query-count", "event-verify-test-suite-pass"],
  });
  await run.emitEvidence("event", {
    id: "event-verify-wrk-result",
    trace_ref: "trace-verify-improvement-1",
    ts: new Date().toISOString(),
    kind: "test_result",
    source: "wrk -t4 -c100 -d30s http://localhost:3000/items (after optimization, same hardware as baseline)",
    payload: {
      metrics: {
        p50_latency_ms: 38,
        p99_latency_ms: 50,
        throughput_rps: 1998.3,
        error_rate: 0.0,
      },
      note: "p99 latency dropped from 1180ms to 50ms — a 23.6x improvement on the same hardware (same environment_fingerprint_ref as baseline trace-capture-baseline-1, so the comparison is apples-to-apples); throughput rose from 84.7 RPS to 1998.3 RPS (23.6x, same factor — confirming the bottleneck was request-bound, not connection-bound); error rate stayed at 0%",
      improvement_factor: 23.6,
    },
  });
  await run.emitEvidence("event", {
    id: "event-verify-db-query-count",
    trace_ref: "trace-verify-improvement-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "postgres query log (count of SELECT statements per /items request, after optimization)",
    payload: {
      finding: "1 SELECT statement per /items request (down from 100) — the JOIN collapsed the N+1 pattern into a single query; the target Expected 'listItems() issues exactly 1 SELECT statement per /items request' is met",
      queries_per_request_before: 100,
      queries_per_request_after: 1,
    },
  });
  // CRITICAL: the functional regression check — run the existing
  // test suite against the optimized code. The suite must pass —
  // a 10x speedup that breaks 3 tests is NOT improvement, it is a
  // faster way to produce wrong output.
  await run.emitEvidence("event", {
    id: "event-verify-test-suite-pass",
    trace_ref: "trace-verify-improvement-1",
    ts: new Date().toISOString(),
    kind: "test_result",
    source: "npm test --silent (after optimization, functional regression check)",
    payload: {
      result: "12 passed",
      note: "all 12 existing tests pass against the optimized code — no functional regression introduced; the JOIN returns the same JSON shape as the N+1 pattern did (verified by 4 tests that assert the response structure), in the same order (verified by 2 tests that assert ordering), with the same items (verified by 6 tests that assert specific items are returned); the optimization is behavior-preserving except in the timing dimension",
    },
  });
  await run.emitEvidence("actual", {
    id: "actual-post-optimization-metrics",
    expected_ref: "expected-post-optimization-target",
    observed_value: "after optimization: p99 latency 50ms (target was <200ms — met with 4x margin); listItems() issues 1 SELECT per request (target was exactly 1 — met); existing test suite 12/12 passing (functional regression check — passed); throughput 1998.3 RPS (up from 84.7 — 23.6x improvement factor on the same hardware)",
    observation_ref: "event-verify-wrk-result",
    observed_at: new Date().toISOString(),
  });
  await run.emitEvidence("validation", {
    id: "validation-verify-improvement",
    expected_ref: "expected-post-optimization-target",
    actual_ref: "actual-post-optimization-metrics",
    result: "match",
    method: "replay_comparison",
    evidence_refs: [
      // BOTH the baseline events AND the post-optimization events —
      // the Validation exists to make the comparison between these
      // two citable. Per skills/performance-problem/SKILL.md, a
      // Validation with only post-optimization evidence has nothing
      // to compare against and is unverifiable.
      "event-baseline-wrk-result",
      "event-baseline-db-query-count",
      "event-verify-wrk-result",
      "event-verify-db-query-count",
      "event-verify-test-suite-pass",
    ],
    decision_ref: "decision-impl-replace-N-plus-1-with-join",
    validated_at: new Date().toISOString(),
  });
  run.advance("improvement_verified");
  check("state is regression-protect", run.currentState === "regression-protect");

  // ------------------------------------------------------------------
  // regression-protect -> report
  // ------------------------------------------------------------------
  // UNIQUE STRUCTURAL FEATURE: this state writes a `known-failure`
  // memory entry for a PERFORMANCE regression (not a functional
  // one). The `symptom` is a latency symptom, the `root_cause` names
  // the bottleneck, the `fix` describes the optimization. Future
  // code that reintroduces the N+1 pattern should fire the
  // `regression` workflow with this entry as the prior incident.
  //
  // Schema note: known-failure.schema.json requires `incident_ref`
  // referencing an evidence/Incident. performance-problem has no
  // Incident entity (only bug-report emits one). We reference the
  // diagnose-bottleneck Decision's id here — same semantic stretch
  // as change-request's report state memory write. The Decision
  // captures the bottleneck diagnosis, which is the source of the
  // failure-knowledge being recorded.
  await run.writeMemory("known-failure", {
    id: "mem-known-failure-items-endpoint-N-plus-1-performance-regression-2026-08-14",
    type: "known-failure",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "performance-problem-run-1",
    incident_ref: "decision-bottleneck-listItems-N-plus-1",
    symptom: "GET /items endpoint p99 latency > 1s (observed: 1180ms) under 100 RPS load with 0% errors; throughput < 100 RPS despite 100 concurrent connections (observed: 84.7 RPS); the code produces CORRECT output, just too slowly — this is a PERFORMANCE regression, not a functional one",
    root_cause: "listItems() in src/services/items.ts issued an N+1 query pattern — 1 SELECT for the item list + 100 SELECTs for each item's metadata, totaling 100 DB roundtrips per /items request; each roundtrip averaged 11.8ms, totaling 1180ms per request (98.3% of wall time per the profiler); the bottleneck was the caller's choice to issue per-item queries, not the per-call query speed",
    fix: "replaced the N+1 query pattern with a single SELECT+LEFT JOIN against the items_metadata table (commit on src/services/items.ts, src/repositories/items.ts, src/routes/items.ts); reduced DB roundtrips per request from 100 to 1; p99 latency dropped from 1180ms to 50ms (23.6x improvement) on the same hardware (environment_fingerprint_ref env-fp-node-20-macos-m2-16gb-postgres-15-local); existing test suite 12/12 still passing (no functional regression). Regression guard: if future code in src/services/items.ts or src/repositories/items.ts reintroduces a per-item DB query inside listItems() or any function called by the /items route, this performance regression will recur — fire the `regression` workflow with this known-failure entry as the prior incident.",
  });
  run.advance("regression_added");
  check("state is report (terminal)", run.currentState === "report" && run.isTerminal());

  // ------------------------------------------------------------------
  // report: write project memory entry recording the new performance
  // contract now in force, so future workflows do not re-derive or
  // re-diagnose the same bottleneck when the code is touched again.
  // ------------------------------------------------------------------
  await run.writeMemory("project", {
    id: "mem-project-items-endpoint-performance-contract-2026-08-14",
    type: "project",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "performance-problem-run-1",
    stack: ["typescript"],
    layer: ["backend", "api"],
    domain: "items endpoint (GET /items) — performance contract: p99 latency <200ms under 100 RPS load, achieved by replacing the N+1 query pattern with a single JOIN in src/services/items.ts; future modifications to /items route, listItems(), or the items repository MUST NOT silently reintroduce a per-item DB query (the N+1 pattern) — see mem-known-failure-items-endpoint-N-plus-1-performance-regression-2026-08-14 for the regression-of-knowledge entry",
  });

  // ------------------------------------------------------------------
  // Final assertions: the run produced the expected evidence trail
  // ------------------------------------------------------------------
  check("exactly 2 questions were asked in the main run", run.questions.count === 2);
  check("log has entries for every transition + evidence + gate check", run.log.length > 15);

  // Confirm the run wrote real evidence files to disk (not just
  // logged them in memory) — the EvidenceStore validates and
  // persists each one.
  const evidenceKinds = ["trace", "event", "decision", "expected", "actual", "validation"];
  for (const kind of evidenceKinds) {
    const dir = join(runDir, "evidence", kind);
    const files = await readdir(dir).catch(() => []);
    check(`evidence/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  const memoryKinds = ["known-failure", "project"];
  for (const kind of memoryKinds) {
    const dir = join(runDir, "memory", kind);
    const files = await readdir(dir).catch(() => []);
    check(`memory/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  // UNIQUE-FEATURE SPOT-CHECK 1: the baseline Trace has
  // environment_fingerprint_ref set (the unique structural feature
  // of performance-problem — performance is environment-sensitive).
  const persistedBaselineTrace = JSON.parse(
    await readFile(join(runDir, "evidence", "trace", "trace-capture-baseline-1.json"), "utf-8")
  );
  check(
    "persisted baseline Trace has environment_fingerprint_ref set (UNIQUE to performance-problem)",
    typeof persistedBaselineTrace.environment_fingerprint_ref === "string" &&
      persistedBaselineTrace.environment_fingerprint_ref === ENV_FINGERPRINT_REF
  );

  // UNIQUE-FEATURE SPOT-CHECK 2: the verify-improvement Trace ALSO
  // has environment_fingerprint_ref set (same env as baseline — the
  // comparison is apples-to-apples).
  const persistedVerifyTrace = JSON.parse(
    await readFile(join(runDir, "evidence", "trace", "trace-verify-improvement-1.json"), "utf-8")
  );
  check(
    "persisted verify-improvement Trace has the SAME environment_fingerprint_ref as baseline (apples-to-apples comparison)",
    persistedVerifyTrace.environment_fingerprint_ref === persistedBaselineTrace.environment_fingerprint_ref
  );

  // UNIQUE-FEATURE SPOT-CHECK 3: the verify-improvement Validation
  // includes BOTH baseline events AND post-optimization events in
  // evidence_refs (the comparison the Validation exists to make
  // must be citable).
  const persistedValidation = JSON.parse(
    await readFile(join(runDir, "evidence", "validation", "validation-verify-improvement.json"), "utf-8")
  );
  check(
    "persisted verify-improvement Validation has method=replay_comparison (post-opt load replayed against same hardware)",
    persistedValidation.method === "replay_comparison"
  );
  check(
    "persisted verify-improvement Validation has result=match (both perf improvement AND functional regression check passed)",
    persistedValidation.result === "match"
  );
  check(
    "persisted verify-improvement Validation references BOTH baseline AND post-optimization events",
    Array.isArray(persistedValidation.evidence_refs) &&
      persistedValidation.evidence_refs.some((r) => r.startsWith("event-baseline-")) &&
      persistedValidation.evidence_refs.some((r) => r.startsWith("event-verify-"))
  );
  check(
    "persisted verify-improvement Validation includes the functional regression check event (test suite pass)",
    Array.isArray(persistedValidation.evidence_refs) &&
      persistedValidation.evidence_refs.includes("event-verify-test-suite-pass")
  );

  // UNIQUE-FEATURE SPOT-CHECK 4: the regression-protect known-failure
  // memory entry is a PERFORMANCE regression (symptom is latency,
  // not a functional bug), and its fix describes the optimization.
  const persistedKnownFailure = JSON.parse(
    await readFile(join(runDir, "memory", "known-failure", "mem-known-failure-items-endpoint-N-plus-1-performance-regression-2026-08-14.json"), "utf-8")
  );
  check(
    "persisted known-failure memory has symptom describing PERFORMANCE (latency), not a functional bug",
    /latency|p99|throughput/.test(persistedKnownFailure.symptom) &&
      !/wrong (output|result|value)/i.test(persistedKnownFailure.symptom)
  );
  check(
    "persisted known-failure memory has root_cause naming the N+1 bottleneck",
    /N\+1|per-item|roundtrip/i.test(persistedKnownFailure.root_cause)
  );
  check(
    "persisted known-failure memory has fix describing the JOIN optimization",
    /JOIN/i.test(persistedKnownFailure.fix)
  );
  check(
    "persisted known-failure memory references the diagnose-bottleneck Decision (incident_ref stretch)",
    persistedKnownFailure.incident_ref === "decision-bottleneck-listItems-N-plus-1"
  );

  // Spot-check the impl Decision (AI proposal, validated=false).
  const persistedImplDecision = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-impl-replace-N-plus-1-with-join.json"), "utf-8")
  );
  check(
    "persisted impl Decision has validated=false (AI proposal, awaiting verify-improvement)",
    persistedImplDecision.validated === false &&
      persistedImplDecision.what.startsWith("ai_proposal:")
  );

  // Spot-check the bottleneck Decision has alternatives recorded
  // (cache, speed-up-per-call, DataLoader) for the decision trace.
  const persistedBottleneckDecision = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-bottleneck-listItems-N-plus-1.json"), "utf-8")
  );
  check(
    "persisted bottleneck Decision records >=3 rejected alternatives (for decision trace)",
    Array.isArray(persistedBottleneckDecision.alternatives) &&
      persistedBottleneckDecision.alternatives.length >= 3
  );
  check(
    "persisted bottleneck Decision has validated=false (candidate, not confirmed root cause)",
    persistedBottleneckDecision.validated === false
  );
  check(
    "persisted bottleneck Decision references profiler evidence (event-profile-*)",
    Array.isArray(persistedBottleneckDecision.evidence_refs) &&
      persistedBottleneckDecision.evidence_refs.some((r) => r.startsWith("event-profile-"))
  );

  // Spot-check the baseline Expected (the performance contract being
  // violated).
  const persistedBaselineExpected = JSON.parse(
    await readFile(join(runDir, "evidence", "expected", "expected-items-endpoint-latency-contract.json"), "utf-8")
  );
  check(
    "persisted baseline Expected has predicate_kind=behavioral (performance is behavior over time)",
    persistedBaselineExpected.predicate_kind === "behavioral"
  );
  check(
    "persisted baseline Expected mentions p99 latency AND N+1 query constraint",
    /p99/.test(persistedBaselineExpected.predicate) && /N\+1|SELECT statement/i.test(persistedBaselineExpected.predicate)
  );

  // Spot-check the post-optimization Expected (the target).
  const persistedTargetExpected = JSON.parse(
    await readFile(join(runDir, "evidence", "expected", "expected-post-optimization-target.json"), "utf-8")
  );
  check(
    "persisted target Expected has measurable target (specific ms value, not 'faster')",
    /below \d+ms|<\d+ms|drop below/i.test(persistedTargetExpected.predicate)
  );

  // Cleanup
  await rm(runDirParent, { recursive: true, force: true });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.error("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
  console.log("");
  console.log("Proof summary:");
  console.log("- performance-problem.sm.yaml loads through the real executor");
  console.log("- A full WorkflowRun walks all 9 non-terminal states + 1 terminal (report)");
  console.log("- Schema-valid evidence emitted at every emitting state (7 of 10 states)");
  console.log("- UNIQUE: capture-baseline Trace has environment_fingerprint_ref set (perf is env-sensitive)");
  console.log("- UNIQUE: verify-improvement Trace has SAME environment_fingerprint_ref as baseline (apples-to-apples)");
  console.log("- UNIQUE: verify-improvement Validation references BOTH baseline AND post-opt events, AND includes the");
  console.log("  functional regression check event (test suite pass) — 10x speedup that breaks tests is NOT improvement");
  console.log("- UNIQUE: regression-protect writes known-failure memory for a PERFORMANCE regression (latency symptom,");
  console.log("  not a functional one) — future code reintroducing the N+1 pattern fires the regression workflow");
  console.log("- broad-refactor safety gate at `optimize` blocks un-confirmed advance, allows confirmed");
  console.log("- question_economy enforces max_questions=2 and allowed_states=[classify,diagnose-bottleneck]");
  console.log("- Negative tests: third question in verify-improvement (wrong-state) rejected;");
  console.log("  third question in diagnose-bottleneck (exceeded) rejected in a fresh run");
  console.log("- All evidence persisted to disk as JSON (would have thrown on schema violation)");
  console.log("- Project memory entry written at `report` recording the new performance contract");
}

scenario().catch((err) => {
  console.error("E2E DRIVER FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
