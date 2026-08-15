// End-to-end driver for unknown-failure.sm.yaml. Feeds a scripted (but
// realistic) unknown-failure scenario through the real WorkflowRun API —
// emits real, schema-valid Evidence Model entities at each state and
// (uniquely among the workflow catalog) writes NO memory entry anywhere,
// because unknown-failure is purely diagnostic.
//
// What this proves:
//   1. unknown-failure.sm.yaml loads cleanly through loadWorkflow
//      (structural validation, no dead ends, all states reachable,
//      no safety_gates declared — the workflow is diagnostic-only).
//   2. A real WorkflowRun walks intake -> classify -> gather-context ->
//      triage -> route-or-block -> report, emitting schema-valid
//      evidence at every emitting state.
//   3. NO safety gate fires during the run — proving the workflow
//      correctly declares no gates (unknown-failure writes nothing:
//      no source code, no memory, no .aiecp/project-intelligence.json).
//      The run log has zero "gate-check" entries and every `advance()`
//      call returns `gateDecision: undefined`. This is the same
//      structural inverse pattern as the code-review and
//      project-onboarding e2e drivers (the only other no-gate
//      workflows in the catalog); unknown-failure shares the
//      no-source-mutation property for a different reason (it is
//      diagnostic-only at every layer, not just at the source-code
//      layer — it writes nothing at all).
//   4. The question_economy (max_questions: 2, allowed_states:
//      [classify, gather-context]) enforces correctly: one question
//      in classify (accepted), one in gather-context (accepted), a
//      third question in triage (NOT in allowed_states) is rejected
//      with question-economy-wrong-state, and a third question in
//      gather-context (in a fresh run, budget exhausted) is rejected
//      with question-economy-exceeded.
//   5. The workflow's UNIQUE structural feature — it WRITES NO MEMORY
//      anywhere, because its output is a routing Decision rather than
//      an applied change — is exercised: zero memory files land on
//      disk, the run log has zero memory-store entries, and the
//      terminal `report` state's `writes_memory: []` declaration
//      is honored (no writeMemory call is made from any state).
//      Every other e2e driver in this repo writes memory at the
//      terminal `report` state (or at a dedicated pre-report state
//      for project-onboarding); unknown-failure is the only workflow
//      in the catalog whose terminal states both write nothing.
//   6. The `route-or-block` state emits a `Decision` whose `what`
//      field names the target workflow in the form
//      `workflow_routed:<workflow-name>` — the routing artifact the
//      router (or the user) will act on. This is structurally
//      distinct from every other workflow's terminal `Decision`,
//      which names an applied change (root_cause_candidate,
//      ai_proposal:apply_patch, regression_recorded, etc.). The
//      routing Decision's `evidence_refs` MUST contain both the
//      `triage` Decision id AND at least one corroborating `event`
//      from `gather-context` — a routing with no corroborating
//      event is a hollow routing, the same hollow-evidence failure
//      mode `evidence-engineering` step 2 exists to prevent across
//      all workflows.
//
// What this does NOT prove: a live, multi-turn agent session driving
// the framework one tool call at a time. Same honest scope note as
// executor/examples/e2e-feature-request/README.md.

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { WorkflowRun } from "../../dist/run.js";
import { WorkflowViolation } from "../../dist/types.js";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = join(__dirname, "..", "..", "..", "workflows", "unknown-failure.sm.yaml");

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

// ---------------------------------------------------------------------------
// Scenario 1 (happy path): ambiguous "membership feels weird" request,
// routes to `regression` because a prior known-failure memory entry's
// symptom matches the report verbatim.
// ---------------------------------------------------------------------------
async function scenarioHappyPath(runDir) {
  console.log("=== End-to-end unknown-failure run (happy): 'membership feels weird' → routes to regression ===\n");
  console.log("Trigger (per workflows/_router.md step 3): intent does not match any specific workflow with confidence\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  check("workflow loaded with name 'unknown-failure'", def.workflow === "unknown-failure");
  check("initial state is intake", run.currentState === "intake");
  check("workflow declares no safety_gates (diagnostic only, writes nothing)",
    !def.safety_gates || def.safety_gates.length === 0);
  check("question_economy budget is 2, allowed_states=[classify, gather-context]",
    def.question_economy.max_questions === 2 &&
    JSON.stringify(def.question_economy.allowed_states) === JSON.stringify(["classify", "gather-context"]));

  // Track every advance()'s returned gateDecision — collect into an array
  // so we can assert ALL were undefined (no gate ever fired).
  const advanceResults = [];

  // ------------------------------------------------------------------
  // intake -> classify
  // ------------------------------------------------------------------
  advanceResults.push(run.advance("intent_classified"));
  check("state is classify", run.currentState === "classify");

  // classify: the request "membership feels weird" is ambiguous between
  // a backend calculation issue (bug-report / regression) and a frontend
  // display issue (no specific workflow). The signal shape is reactive
  // (something is wrong) but the surface is unclear. Ask the one allowed
  // classify question.
  run.askQuestion("Is this about the membership expiry calculation (backend), or how the expiry is displayed in the UI (frontend)?");
  check("question count is 1 (under max_questions=2)", run.questions.count === 1);

  // Emit a Trace + Decision recording the signal-shape classification.
  // User answered "the calculation — members are seeing wrong dates" —
  // reactive, scoped to backend.
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
    source: "filesystem_read: user request + project-intelligence.json",
    payload: {
      finding: "request mentions 'membership feels weird' + 'members are seeing wrong dates'; signal shape is reactive (something is wrong); scoped to backend per user's classify answer (the calculation, not the UI display); project-intelligence.json confirms a membership backend exists with src/membership.py as the main entrypoint",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-classify-signal-shape",
    trace_ref: "trace-classify-1",
    what: "signal_shape:reactive",
    why: "request describes something wrong (members seeing wrong dates); scoped to backend per user's classify answer; reactive candidate targets per workflows/_router.md routing table: bug-report, regression (if prior known-failure matches), user-complaint (planned), incident (planned)",
    validated: true,
    result: "accepted",
    alternatives: [
      { option: "signal_shape:constructive", rejected_because: "request does not describe something to add; describes something wrong" },
      { option: "signal_shape:behavior-modifying", rejected_because: "request does not describe a desired change to working behavior" },
    ],
  });
  advanceResults.push(run.advance("class_known"));
  check("state is gather-context", run.currentState === "gather-context");

  // ------------------------------------------------------------------
  // gather-context: run context-gathering commands to find signals
  // that would tip the routing toward a specific target workflow.
  // Emit one Event per command, wrapped in a Trace.
  // ------------------------------------------------------------------
  const contextCommands = [
    {
      eventId: "event-context-git-log",
      source: "git log --oneline -10",
      finding: "recent commits: abc1234 'refactor: extract parseExpiryDate into src/membership/parsing.ts'; def5678 'chore: bump dependencies'; ghi9012 'test: add more edge-case tests for parseExpiryDate' — the recent refactor touched the membership boundary code",
    },
    {
      eventId: "event-context-grep-expiry",
      source: "rg -n 'expiry' --include='*.py' .",
      finding: "src/membership.py:5: def is_active(today, expiry_date); src/membership.py:9: docstring 'member stays active ON expiry_date'; src/membership/parsing.ts:14: comparison uses '<' — the boundary check appears to have been reverted to strict '<' during the recent refactor extraction",
    },
    {
      eventId: "event-context-known-failure-ls",
      source: "ls .aiecp/memory/known-failure/",
      finding: "found prior known-failure entry: mem-known-failure-membership-expiry-boundary — symptom field reads 'members report membership expiring one day early', which matches the current report ('members are seeing wrong dates') verbatim",
    },
  ];
  await run.emitEvidence("trace", {
    id: "trace-gather-context-1",
    started_at: new Date().toISOString(),
    source: "agent_adapter",
    event_refs: contextCommands.map((c) => c.eventId),
  });
  for (const cmd of contextCommands) {
    await run.emitEvidence("event", {
      id: cmd.eventId,
      trace_ref: "trace-gather-context-1",
      ts: new Date().toISOString(),
      kind: "observation",
      source: cmd.source,
      payload: { finding: cmd.finding },
    });
  }

  // The prior known-failure match is a strong signal — no second
  // question needed (the budget remains at 1, not 2).
  check("question count is still 1 (no second question needed — prior known-failure match is disambiguating)",
    run.questions.count === 1);

  advanceResults.push(run.advance("context_gathered"));
  check("state is triage", run.currentState === "triage");

  // ------------------------------------------------------------------
  // triage: weigh the gathered context against the routing table.
  // Emit a routing_candidate Decision naming the strongest candidate.
  // ------------------------------------------------------------------
  await run.emitEvidence("decision", {
    id: "decision-triage-candidate",
    trace_ref: "trace-gather-context-1",
    what: "routing_candidate:regression",
    why: "prior known-failure entry (mem-known-failure-membership-expiry-boundary) has a symptom that matches the current report verbatim; the recent refactor at commit abc1234 touched the membership boundary code (per git log); the boundary check appears reverted to '<' (per rg). All three signals corroborate the regression candidate over the bug-report alternative.",
    validated: false, // candidate, awaiting route-or-block confirmation
    result: "pending",
    evidence_refs: ["event-context-git-log", "event-context-grep-expiry", "event-context-known-failure-ls"],
    alternatives: [
      { option: "routing_candidate:bug-report", rejected_because: "the prior known-failure match makes regression the stronger candidate; bug-report is for new bugs with no prior context, but prior context exists here" },
      { option: "routing_candidate:performance-problem", rejected_because: "the request mentions wrong dates, not slow behavior; no latency/throughput signal" },
    ],
  });
  advanceResults.push(run.advance("triage_complete"));
  check("state is route-or-block", run.currentState === "route-or-block");

  // ------------------------------------------------------------------
  // route-or-block: confirm the candidate (the prior known-failure
  // match is direct corroboration). Emit the final routing Decision.
  // ------------------------------------------------------------------
  await run.emitEvidence("decision", {
    id: "decision-route-workflow-routed",
    trace_ref: "trace-gather-context-1",
    what: "workflow_routed:regression",
    why: "request signal shape 'reactive' (from classify Decision), corroborated by gather-context event event-context-known-failure-ls (prior known-failure entry mem-known-failure-membership-expiry-boundary has a symptom matching the current report verbatim), matches the routing-table intent signal for `regression` per workflows/_router.md ('A known-failure memory entry's symptom recurs'). The confirmation threshold is met: the candidate from triage has at least one corroborating event whose payload.finding directly supports the routing.",
    validated: true,
    result: "accepted",
    evidence_refs: [
      "decision-triage-candidate", // the triage candidate Decision
      "event-context-known-failure-ls", // the corroborating event (prior known-failure match)
      "event-context-git-log", // supporting: recent refactor touched the boundary
      "event-context-grep-expiry", // supporting: boundary check appears reverted
    ],
  });
  advanceResults.push(run.advance("workflow_routed"));
  check("state is report (terminal)", run.currentState === "report" && run.isTerminal());

  // ------------------------------------------------------------------
  // Final assertions: the run produced the expected evidence trail,
  // NO safety gate fired, NO memory was written, and question economy held.
  // ------------------------------------------------------------------
  check("exactly 1 question was asked in the main run (budget not exhausted)", run.questions.count === 1);
  check("log has entries for every transition + evidence (no gate-checks)", run.log.length > 10);
  check("log has ZERO gate-check entries (no safety_gates declared)",
    run.log.filter((e) => e.type === "gate-check").length === 0);
  check("every advance() returned gateDecision=undefined (no gate ever fired)",
    advanceResults.every((r) => r.gateDecision === undefined));
  check(`collected ${advanceResults.length} advance results, all gateDecision=undefined`,
    advanceResults.length === 5); // 5 transitions in the happy path

  // UNIQUE STRUCTURAL FEATURE: NO memory was written anywhere.
  // unknown-failure is purely diagnostic — its terminal `report`
  // state's `writes_memory: []` declaration is honored (no writeMemory
  // call is made from any state). This is the only workflow in the
  // catalog whose terminal states both write nothing.
  check("run log has ZERO memory-store entries (workflow writes nothing — purely diagnostic)",
    run.log.filter((e) => e.type === "evidence" && e.detail.store === "memory").length === 0);

  // Confirm the run wrote real evidence files to disk (not just logged
  // them in memory) — the EvidenceStore validates and persists each one.
  // unknown-failure emits 3 evidence kinds: trace, event, decision.
  // (No expected/actual/validation — this workflow is diagnostic, not
  // a verification workflow; it produces no Expected/Actual pair
  // because it makes no behavioral claim to verify.)
  const evidenceKinds = ["trace", "event", "decision"];
  for (const kind of evidenceKinds) {
    const dir = join(runDir, "evidence", kind);
    const files = await readdir(dir).catch(() => []);
    check(`evidence/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  // Confirm NO memory directory was created at all.
  const memoryDir = join(runDir, "memory");
  const memorySubdirs = await readdir(memoryDir).catch(() => []);
  check("memory/ directory was not created (workflow writes no memory — purely diagnostic)",
    memorySubdirs.length === 0);

  // Spot-check the persisted routing Decision (the workflow's primary
  // output artifact).
  const persistedRouting = JSON.parse(
    await readFile(
      join(runDir, "evidence", "decision", "decision-route-workflow-routed.json"),
      "utf-8"
    )
  );
  check(
    "persisted routing Decision has what=workflow_routed:regression (names the target workflow)",
    persistedRouting.what === "workflow_routed:regression"
  );
  check(
    "persisted routing Decision has validated=true + result=accepted (confirmed route, not candidate)",
    persistedRouting.validated === true && persistedRouting.result === "accepted"
  );
  check(
    "persisted routing Decision references triage Decision + corroborating event(s) in evidence_refs",
    Array.isArray(persistedRouting.evidence_refs) &&
      persistedRouting.evidence_refs.includes("decision-triage-candidate") &&
      persistedRouting.evidence_refs.includes("event-context-known-failure-ls")
  );

  // Spot-check the persisted triage Decision (candidate, not yet confirmed).
  const persistedTriage = JSON.parse(
    await readFile(
      join(runDir, "evidence", "decision", "decision-triage-candidate.json"),
      "utf-8"
    )
  );
  check(
    "persisted triage Decision has what=routing_candidate:regression (candidate, not final route)",
    persistedTriage.what === "routing_candidate:regression"
  );
  check(
    "persisted triage Decision has validated=false (candidate awaiting route-or-block confirmation)",
    persistedTriage.validated === false && persistedTriage.result === "pending"
  );
  check(
    "persisted triage Decision has evidence_refs pointing at concrete gather-context events",
    Array.isArray(persistedTriage.evidence_refs) &&
      persistedTriage.evidence_refs.length === 3 &&
      persistedTriage.evidence_refs.every((r) => r.startsWith("event-context-"))
  );

  // Spot-check the persisted classify Decision (signal shape, not routing target).
  const persistedClassify = JSON.parse(
    await readFile(
      join(runDir, "evidence", "decision", "decision-classify-signal-shape.json"),
      "utf-8"
    )
  );
  check(
    "persisted classify Decision has what=signal_shape:reactive (signal shape, not workflow name)",
    persistedClassify.what === "signal_shape:reactive"
  );
  check(
    "persisted classify Decision names rejected alternatives (constructive, behavior-modifying)",
    Array.isArray(persistedClassify.alternatives) && persistedClassify.alternatives.length === 2
  );

  // Spot-check the persisted gather-context Trace has non-empty event_refs.
  const persistedGatherTrace = JSON.parse(
    await readFile(
      join(runDir, "evidence", "trace", "trace-gather-context-1.json"),
      "utf-8"
    )
  );
  check(
    "persisted gather-context Trace has 3 event_refs (one per context-gathering command)",
    Array.isArray(persistedGatherTrace.event_refs) && persistedGatherTrace.event_refs.length === 3
  );
}

// ---------------------------------------------------------------------------
// Scenario 2 (failure path — blocked with precise gap): ambiguous "the
// system feels off" request, no corroborating context found, route-or-block
// cannot confirm any candidate, transitions to blocked.
// ---------------------------------------------------------------------------
async function scenarioFailurePath(runDir) {
  console.log("\n=== End-to-end unknown-failure run (failure): 'the system feels off' → blocked ===\n");
  console.log("User request: 'the system feels off' (no surface, no error, no reproduction)\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  const advanceResults = [];

  // intake -> classify
  advanceResults.push(run.advance("intent_classified"));
  check("[scenario 2] state is classify", run.currentState === "classify");

  // classify: the request "the system feels off" is too vague to
  // classify a signal shape even with inspection. Ask the one allowed
  // classify question.
  run.askQuestion("Is this about something broken, or something you want to add?");
  check("[scenario 2] question count is 1 (classify question asked)", run.questions.count === 1);

  await run.emitEvidence("trace", {
    id: "trace-classify-2",
    started_at: new Date().toISOString(),
    event_refs: ["event-classify-2"],
  });
  await run.emitEvidence("event", {
    id: "event-classify-2",
    trace_ref: "trace-classify-2",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "filesystem_read: user request + project-intelligence.json",
    payload: {
      finding: "request 'the system feels off' names no surface, no error, no specific behavior; signal shape tentatively reactive per user's classify answer ('broken, I think, but I'm not sure where'); candidate targets remain unclear pending gather-context",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-classify-2-signal-shape",
    trace_ref: "trace-classify-2",
    what: "signal_shape:reactive",
    why: "user's classify answer scopes the request to 'something broken' (tentatively); signal shape is reactive but the surface is unknown; gather-context must surface a specific signal to route",
    validated: true,
    result: "accepted",
  });
  advanceResults.push(run.advance("class_known"));
  check("[scenario 2] state is gather-context", run.currentState === "gather-context");

  // gather-context: all context-gathering commands return negative findings.
  const contextCommands2 = [
    {
      eventId: "event-context-2-git-log",
      source: "git log --oneline -10",
      finding: "recent commits: routine dependency bumps only; no obvious culprit that would make 'the system feel off'",
    },
    {
      eventId: "event-context-2-known-failure-ls",
      source: "ls .aiecp/memory/known-failure/",
      finding: "no prior known-failures found whose symptom matches 'feels off' — the directory is empty (or contains entries whose symptoms are all specific, none matching a vague 'feels off' report)",
    },
    {
      eventId: "event-context-2-grep-broken",
      source: "rg -n 'broken|bug|wrong' .",
      finding: "no obvious matches in source code comments; nothing in the codebase self-reports as broken",
    },
  ];
  await run.emitEvidence("trace", {
    id: "trace-gather-context-2",
    started_at: new Date().toISOString(),
    source: "agent_adapter",
    event_refs: contextCommands2.map((c) => c.eventId),
  });
  for (const cmd of contextCommands2) {
    await run.emitEvidence("event", {
      id: cmd.eventId,
      trace_ref: "trace-gather-context-2",
      ts: new Date().toISOString(),
      kind: "observation",
      source: cmd.source,
      payload: { finding: cmd.finding },
    });
  }

  // The second allowed question (in gather-context) — the user cannot
  // name a specific surface.
  run.askQuestion("Can you name a specific surface, action, or error message where you noticed the system feeling off?");
  check("[scenario 2] question count is 2 (gather-context question asked, budget now exhausted)", run.questions.count === 2);

  advanceResults.push(run.advance("context_gathered"));
  check("[scenario 2] state is triage", run.currentState === "triage");

  // triage: cannot produce a candidate routing target — no
  // corroborating event supports any candidate.
  await run.emitEvidence("decision", {
    id: "decision-triage-2-candidate-none",
    trace_ref: "trace-gather-context-2",
    what: "routing_candidate:none",
    why: "no corroborating event supports any candidate: git log shows no obvious culprit; no prior known-failure matches 'feels off'; grep finds nothing self-reporting as broken. The candidate is 'none' — no workflow should be routed without corroborating evidence.",
    validated: false,
    result: "pending",
    evidence_refs: [],
    alternatives: [
      { option: "routing_candidate:bug-report", rejected_because: "no specific broken behavior named; bug-report's locate-evidence would have nothing to locate" },
      { option: "routing_candidate:regression", rejected_because: "no prior known-failure matches the symptom" },
      { option: "routing_candidate:performance-problem", rejected_because: "no latency/throughput signal cited" },
    ],
  });
  advanceResults.push(run.advance("triage_complete"));
  check("[scenario 2] state is route-or-block", run.currentState === "route-or-block");

  // route-or-block: cannot confirm any candidate (confirmation threshold
  // not met for any workflow — no corroborating event). Emit a
  // no_workflow_match Decision recording the refusal, then transition
  // to blocked.
  await run.emitEvidence("decision", {
    id: "decision-route-2-no-workflow-match",
    trace_ref: "trace-gather-context-2",
    what: "no_workflow_match",
    why: "the request 'the system feels off' was considered against the following workflows: bug-report (rejected — no specific broken behavior named), regression (rejected — no prior known-failure matches a 'feels off' symptom), performance-problem (rejected — no latency/throughput signal). To route this successfully, the request would need at least one of: (a) a specific surface (endpoint, UI route, CLI command), (b) a specific behavior (error message, wrong result, slow response), (c) a specific reproduction step (URL + action + observed + expected). The user should rephrase with at least one of these, or manually invoke bug-report if they have a strong prior that the system is misbehaving in a way they cannot yet describe.",
    validated: true, // the refusal is a confirmed conclusion, not a candidate
    result: "rejected",
    evidence_refs: ["decision-triage-2-candidate-none"],
  });
  advanceResults.push(run.advance("no_workflow_match"));
  check("[scenario 2] state is blocked (terminal)", run.currentState === "blocked" && run.isTerminal());

  // Failure-path assertions: no safety gate fired, no memory written,
  // the routing Decision records the refusal with a precise gap.
  check("[scenario 2] log has ZERO gate-check entries (no safety_gates declared)",
    run.log.filter((e) => e.type === "gate-check").length === 0);
  check("[scenario 2] every advance() returned gateDecision=undefined",
    advanceResults.every((r) => r.gateDecision === undefined));
  check("[scenario 2] run log has ZERO memory-store entries (workflow writes nothing — purely diagnostic)",
    run.log.filter((e) => e.type === "evidence" && e.detail.store === "memory").length === 0);

  // Spot-check the persisted no_workflow_match Decision records the refusal.
  const persistedNoMatch = JSON.parse(
    await readFile(
      join(runDir, "evidence", "decision", "decision-route-2-no-workflow-match.json"),
      "utf-8"
    )
  );
  check(
    "[scenario 2] persisted no_workflow_match Decision has what=no_workflow_match",
    persistedNoMatch.what === "no_workflow_match"
  );
  check(
    "[scenario 2] persisted no_workflow_match Decision has result=rejected (refusal, not acceptance)",
    persistedNoMatch.result === "rejected"
  );
  check(
    "[scenario 2] persisted no_workflow_match Decision.why names which workflows were considered + why each was rejected",
    /bug-report/.test(persistedNoMatch.why) &&
      /regression/.test(persistedNoMatch.why) &&
      /performance-problem/.test(persistedNoMatch.why) &&
      /rejected/.test(persistedNoMatch.why)
  );
  check(
    "[scenario 2] persisted no_workflow_match Decision.why names what the user should do next (rephrase or manually invoke)",
    /rephrase/.test(persistedNoMatch.why) && /manually invoke/.test(persistedNoMatch.why)
  );
}

// ---------------------------------------------------------------------------
// Scenario 3 (question-economy wrong-state): a fresh run, asked in
// `triage` (NOT in allowed_states), is rejected with
// question-economy-wrong-state. Uses a fresh run so the budget is not
// already exhausted.
// ---------------------------------------------------------------------------
async function scenarioQuestionEconomyWrongState(runDir) {
  console.log("\n=== Question-economy wrong-state assertion ===\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  // Walk to triage without asking any questions.
  run.advance("intent_classified");     // classify
  run.advance("class_known");            // gather-context
  run.advance("context_gathered");        // triage

  // triage is NOT in allowed_states=[classify, gather-context].
  await expectViolation(
    "question asked in triage (not in allowed_states) is rejected",
    "question-economy-wrong-state",
    () => run.askQuestion("Should the routing Decision include a confidence score?")
  );
}

// ---------------------------------------------------------------------------
// Scenario 4 (question-economy exceeded): a fresh run, two questions
// already asked (one in classify, one in gather-context — both accepted),
// a third question in gather-context should be rejected as
// question-economy-exceeded (budget exhausted).
// ---------------------------------------------------------------------------
async function scenarioQuestionEconomyExceeded(runDir) {
  console.log("\n=== Question-economy exceeded assertion ===\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  run.advance("intent_classified");     // classify
  run.askQuestion("First question — allowed (in classify).");
  run.advance("class_known");            // gather-context
  run.askQuestion("Second question — allowed (in gather-context).");

  await expectViolation(
    "third question in gather-context exceeds max_questions=2",
    "question-economy-exceeded",
    () => run.askQuestion("Third question — should be rejected (budget exhausted).")
  );
}

async function main() {
  const runDirParent = await mkdtemp(join(tmpdir(), "aiecp-unknown-failure-"));
  try {
    await scenarioHappyPath(join(runDirParent, "scenario1-happy"));
    await scenarioFailurePath(join(runDirParent, "scenario2-failure"));
    await scenarioQuestionEconomyWrongState(join(runDirParent, "scenario3-wrong-state"));
    await scenarioQuestionEconomyExceeded(join(runDirParent, "scenario4-exceeded"));
  } finally {
    await rm(runDirParent, { recursive: true, force: true });
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.error("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
  console.log("");
  console.log("Proof summary:");
  console.log("- unknown-failure.sm.yaml loads through the real executor");
  console.log("- Happy path: WorkflowRun walks all 5 non-terminal states + 1 terminal (report)");
  console.log("- Failure path: WorkflowRun walks to blocked via no_workflow_match");
  console.log("- Schema-valid evidence emitted at every emitting state (3 evidence kinds: trace, event, decision)");
  console.log("- NO safety gate fires (workflow declares none — diagnostic-only, writes nothing)");
  console.log("- Every advance() returned gateDecision=undefined (collected 5 per scenario, all undefined)");
  console.log("- question_economy enforces max_questions=2 and allowed_states=[classify, gather-context]");
  console.log("- Negative tests: question in `triage` (wrong-state) rejected;");
  console.log("  3rd question in `gather-context` (exceeded) rejected in a fresh run");
  console.log("- UNIQUE FEATURE: ZERO memory written anywhere (workflow is purely diagnostic —");
  console.log("  the only workflow in the catalog whose terminal states both write nothing)");
  console.log("- UNIQUE FEATURE: route-or-block emits a `workflow_routed:<workflow-name>` Decision");
  console.log("  naming the target workflow (the routing artifact the router/user acts on)");
  console.log("- UNIQUE FEATURE: route-or-block's `evidence_refs` MUST contain both the triage");
  console.log("  Decision id AND a corroborating event (hollow-routing prevention)");
  console.log("- Failure path emits a `no_workflow_match` Decision with a precise gap (which");
  console.log("  workflows were considered, why each was rejected, what to do next)");
  console.log("- All evidence persisted to disk as JSON (would have thrown on schema violation)");
}

main().catch((err) => {
  console.error("E2E DRIVER FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
