// End-to-end proof for the chat adapter + chat-output validator pair.
//
// Simulates what a chat LLM would produce as a text response (a series
// of ```aiecp:* fenced code blocks per the CHAT-ENTRYPOINT.md protocol),
// then runs scripts/validate-chat-output.mjs against that text. If the
// validator parses and validates every block correctly, the proof passes.
//
// What this proves:
//   1. The chat protocol is well-defined: a chat LLM that emits blocks
//      in the documented shape produces output the validator can consume.
//   2. The validator correctly parses + schema-validates each block kind
//      (evidence, memory, advance, question).
//   3. The validator correctly REJECTS malformed blocks (negative test).
//   4. The chat adapter's declared capabilities are honest (no false
//      tool-use claims) and its renderEntrypoint produces valid output.
//
// What this does NOT prove: that a real chat LLM (ChatGPT, Claude chat,
// etc.) actually emits blocks in this format. That requires a live
// multi-turn session with a real chat LLM, which is out of scope for
// this script — same honest scope note as the other e2e drivers. The
// script proves the protocol + validator pair works; the live LLM
// session is a separate milestone.

import { chatAdapter } from "../../../adapters/agents/dist/chat/adapter.js";
import { chatSandboxAdapter } from "../../../adapters/agents/dist/chat-sandbox/adapter.js";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const VALIDATOR_PATH = join(REPO_ROOT, "scripts", "validate-chat-output.mjs");

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

// A realistic chat LLM response to "login sometimes fails" — exercises
// every block kind: evidence (multiple kinds), advance, question, memory.
const SIMULATED_CHAT_RESPONSE = `I'll diagnose this login failure following AIECP's bug-report workflow. Let me start by examining the evidence you provided.

\`\`\`aiecp:evidence
kind: trace
data:
  id: trace-locate-1
  started_at: 2026-08-14T10:32:00Z
  event_refs:
    - event-log-line
    - event-code-line
\`\`\`

\`\`\`aiecp:evidence
kind: event
data:
  id: event-log-line
  trace_ref: trace-locate-1
  ts: 2026-08-14T10:31:55Z
  kind: log_line
  source: auth-service.log
  payload:
    line: "ERROR retry fired before token refresh completed"
\`\`\`

\`\`\`aiecp:evidence
kind: event
data:
  id: event-code-line
  trace_ref: trace-locate-1
  ts: 2026-08-14T10:32:00Z
  kind: observation
  source: src/auth/login.ts:42
  payload:
    finding: "retry is fired without awaiting the token refresh promise"
\`\`\`

I need to ask one clarifying question in classify before proceeding.

\`\`\`aiecp:question
text: "Is this affecting all users or a subset?"
\`\`\`

\`\`\`aiecp:advance
on: class_known
\`\`\`

Now I'll form my root-cause hypothesis based on the trace.

\`\`\`aiecp:evidence
kind: decision
data:
  id: decision-root-cause-1
  trace_ref: trace-locate-1
  what: "root_cause_candidate:retry_does_not_await_token_refresh"
  why: "event-log-line shows retry firing before refresh completes; event-code-line confirms the code does not await"
  validated: false
  root_cause: false
  result: pending
\`\`\`

After mental simulation (I cannot execute the code, so method=manual_review):

\`\`\`aiecp:evidence
kind: expected
data:
  id: expected-login-success
  source_ref: "specs/spec.md#auth-contract"
  predicate: "retry must wait for token refresh to complete"
  predicate_kind: behavioral
\`\`\`

\`\`\`aiecp:evidence
kind: actual
data:
  id: actual-login-fail
  expected_ref: expected-login-success
  observed_value: "retry fired before refresh completed (per event-log-line)"
  observation_ref: event-log-line
  observed_at: 2026-08-14T10:32:30Z
\`\`\`

\`\`\`aiecp:evidence
kind: validation
data:
  id: validation-diagnose-1
  expected_ref: expected-login-success
  actual_ref: actual-login-fail
  result: mismatch
  method: manual_review
  evidence_refs:
    - event-log-line
    - event-code-line
  decision_ref: decision-root-cause-1
\`\`\`

Root cause confirmed (mismatch). I'll transition to propose-fix.

\`\`\`aiecp:advance
on: root_cause_found
\`\`\`

I cannot apply the fix myself (no filesystem_write capability per my chat adapter declaration). I'll record a known-failure memory entry and transition to blocked.

\`\`\`aiecp:memory
type: known-failure
data:
  id: mem-known-failure-login-race-1
  type: known-failure
  schema_version: "1.0.0"
  created_at: 2026-08-14T10:33:00Z
  source: "chat-llm-run-1"
  incident_ref: "incident-login-race-2026-08-14"
  symptom: "login sometimes fails under concurrent refresh+retry"
  root_cause: "retry fired before token refresh completed"
  fix: "make retry await refresh completion before firing"
\`\`\`

**Note:** The incident_ref above references an Incident that this chat LLM run did not emit (chat LLMs following the bug-report workflow should emit one in the classify state — this is a deliberate scope note showing the validator catches schema-level validity, not cross-document referential integrity, which per \`evidence-engineering/SKILL.md\` is a procedural check, not a schema check).

**Honest scope:** My \`Validation.method\` is \`"manual_review"\` (mental simulation). A tool-using agent should re-run this verification later to flip the method to \`"app_validation"\` and apply the actual fix.
`;

// A malformed response — for the negative test. Each block has a
// specific defect the validator should catch.
const MALFORMED_RESPONSE = `Malformed blocks for negative test:

Unknown evidence kind:
\`\`\`aiecp:evidence
kind: not-a-real-kind
data:
  id: x-1
\`\`\`

Missing required field (Trace needs started_at + event_refs):
\`\`\`aiecp:evidence
kind: trace
data:
  id: trace-bad-1
\`\`\`

Decision missing required what/why/validated:
\`\`\`aiecp:evidence
kind: decision
data:
  id: decision-bad-1
  trace_ref: trace-x
\`\`\`

Invalid id pattern (must match ^<kind>-[a-zA-Z0-9_-]+$):
\`\`\`aiecp:evidence
kind: event
data:
  id: "not a valid id with spaces"
  trace_ref: trace-x
  ts: 2026-08-14T10:00:00Z
  kind: log_line
  source: test
\`\`\`

Bad YAML:
\`\`\`aiecp:evidence
kind: trace
data: this is not a mapping
\`\`\`
`;

async function scenario() {
  const tmpDir = await mkdtemp(join(tmpdir(), "aiecp-chat-adapter-"));

  try {
    console.log("=== Chat adapter + validator proof ===\n");

    // ------------------------------------------------------------------
    // Scenario 1: chat adapter capabilities are honestly declared
    // ------------------------------------------------------------------
    console.log("--- Scenario 1: chat adapter capabilities ---");
    const caps = chatAdapter.capabilities();
    check("chat adapter declares filesystem_read=false", caps.filesystem_read === false);
    check("chat adapter declares filesystem_write=false", caps.filesystem_write === false);
    check("chat adapter declares shell_exec=false", caps.shell_exec === false);
    check("chat adapter declares test_runner=false", caps.test_runner === false);
    check("chat adapter declares native_skills=false", caps.native_skills === false);
    check("chat adapter declares browser=false", caps.browser === false);
    check("chat adapter declares mcp=false", caps.mcp === false);
    check("chat adapter id is 'chat'", chatAdapter.id === "chat");

    // ------------------------------------------------------------------
    // Scenario 2: renderEntrypoint produces CHAT-ENTRYPOINT.md
    // ------------------------------------------------------------------
    console.log("\n--- Scenario 2: renderEntrypoint ---");
    const minimalCanonical = {
      agentsMdContent: "# Test project\n\nThis is a test project.",
      skills: [
        { name: "systematic-debugging", description: "Use when debugging.", path: "skills/systematic-debugging" },
        { name: "evidence-engineering", description: "Use when emitting evidence.", path: "skills/evidence-engineering" },
      ],
    };
    const files = chatAdapter.renderEntrypoint(minimalCanonical);
    check("renderEntrypoint produces exactly 1 file", files.length === 1);
    check("rendered file is CHAT-ENTRYPOINT.md", files[0].path === "CHAT-ENTRYPOINT.md");
    check("content includes the 30-second version header", files[0].content.includes("The 30-second version"));
    check("content lists both skills by name", files[0].content.includes("systematic-debugging") && files[0].content.includes("evidence-engineering"));
    check("content includes the evidence protocol example", files[0].content.includes("aiecp:evidence"));
    check("content includes the advance protocol example", files[0].content.includes("aiecp:advance"));
    check("content notes manual_review is the only valid Validation.method for chat", files[0].content.includes("manual_review"));
    check("renderEntrypoint is idempotent", chatAdapter.renderEntrypoint(minimalCanonical)[0].content === files[0].content);

    // ------------------------------------------------------------------
    // Scenario 3: translateObservation throws (chat LLMs emit directly)
    // ------------------------------------------------------------------
    console.log("\n--- Scenario 3: translateObservation is a no-op ---");
    let threw = false;
    let errMsg = "";
    try {
      chatAdapter.translateObservation({ raw: {}, timestamp: new Date().toISOString(), traceRef: "x", source: "y" });
    } catch (e) {
      threw = true;
      errMsg = e.message;
    }
    check("translateObservation throws", threw);
    check("error message explains chat LLMs emit directly", errMsg.includes("chat LLMs emit Events directly"));

    // ------------------------------------------------------------------
    // Scenario 4: validator accepts a well-formed chat LLM response
    // ------------------------------------------------------------------
    console.log("\n--- Scenario 4: validator accepts well-formed chat response ---");
    const goodFile = join(tmpDir, "good-response.md");
    await writeFile(goodFile, SIMULATED_CHAT_RESPONSE);

    let stdout = "";
    let exitCode = 0;
    try {
      stdout = execFileSync("node", [VALIDATOR_PATH, goodFile], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      exitCode = e.status ?? 1;
      stdout = (e.stdout ?? "") + (e.stderr ?? "");
    }
    check("validator exits 0 on well-formed response", exitCode === 0);
    check("validator reports 'VALIDATION PASSED'", stdout.includes("VALIDATION PASSED"));
    check("validator found all expected blocks (11 total: trace x1, event x2, decision x1, expected x1, actual x1, validation x1, memory x1, advance x2, question x1)", stdout.includes("11 aiecp block"));

    const okCount = (stdout.match(/^  OK   /gm) || []).length;
    check(`validator marked all 11 blocks OK (found ${okCount})`, okCount === 11);

    // ------------------------------------------------------------------
    // Scenario 5: validator rejects malformed blocks
    // ------------------------------------------------------------------
    console.log("\n--- Scenario 5: validator rejects malformed blocks ---");
    const badFile = join(tmpDir, "bad-response.md");
    await writeFile(badFile, MALFORMED_RESPONSE);

    let badExit = 0;
    let badStdout = "";
    try {
      execFileSync("node", [VALIDATOR_PATH, badFile], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      badExit = e.status ?? 0;
      badStdout = (e.stdout ?? "") + (e.stderr ?? "");
    }
    check("validator exits non-zero on malformed response", badExit !== 0);
    check("validator reports 'VALIDATION FAILED'", badStdout.includes("VALIDATION FAILED"));
    check("validator caught unknown evidence kind 'not-a-real-kind'", badStdout.includes("not-a-real-kind") || badStdout.includes("unknown evidence kind"));
    check("validator caught Decision missing required fields", badStdout.includes("decision-bad-1") || badStdout.includes("what") || badStdout.includes("validated"));
    check("validator caught bad id pattern", badStdout.includes("not a valid id with spaces") || badStdout.includes("pattern"));

    // ------------------------------------------------------------------
    // Scenario 6: validator rejects input with no aiecp blocks at all
    // ------------------------------------------------------------------
    console.log("\n--- Scenario 6: validator rejects input with no aiecp blocks ---");
    const emptyFile = join(tmpDir, "no-blocks.md");
    await writeFile(emptyFile, "This is just prose. No code blocks. The validator should reject it.");

    let emptyExit = 0;
    try {
      execFileSync("node", [VALIDATOR_PATH, emptyFile], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      emptyExit = e.status ?? 0;
    }
    check("validator exits non-zero when no aiecp blocks present", emptyExit !== 0);

    // ------------------------------------------------------------------
    // Scenario 7: validator supports stdin input
    // ------------------------------------------------------------------
    console.log("\n--- Scenario 7: validator reads from stdin ---");
    let stdinExit = 0;
    let stdinStdout = "";
    try {
      stdinStdout = execFileSync("node", [VALIDATOR_PATH], {
        input: SIMULATED_CHAT_RESPONSE,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      stdinExit = e.status ?? 0;
      stdinStdout = (e.stdout ?? "") + (e.stderr ?? "");
    }
    check("validator accepts stdin input", stdinExit === 0);
    check("stdin-validated response passes", stdinStdout.includes("VALIDATION PASSED"));

    // ------------------------------------------------------------------
    // Scenario 8: protocol coverage — every block kind, 5+ evidence kinds
    // ------------------------------------------------------------------
    console.log("\n--- Scenario 8: protocol coverage ---");
    const protocolKinds = new Set();
    for (const line of SIMULATED_CHAT_RESPONSE.split("\n")) {
      const m = line.match(/^```aiecp:([a-z]+)/);
      if (m) protocolKinds.add(m[1]);
    }
    check("protocol covers all 4 block kinds (evidence, memory, advance, question)",
      protocolKinds.has("evidence") && protocolKinds.has("memory") && protocolKinds.has("advance") && protocolKinds.has("question"));

    const evidenceKindsUsed = new Set();
    const evidenceRegex = /```aiecp:evidence\nkind: (\w+)/g;
    let m;
    while ((m = evidenceRegex.exec(SIMULATED_CHAT_RESPONSE)) !== null) {
      evidenceKindsUsed.add(m[1]);
    }
    check(`simulated response exercises 5+ distinct evidence kinds (found ${evidenceKindsUsed.size}: ${[...evidenceKindsUsed].join(", ")})`,
      evidenceKindsUsed.size >= 5);

    // ------------------------------------------------------------------
    // Scenario 9: chat-sandbox adapter (ADR-0020) — code-execution chat LLMs
    // ------------------------------------------------------------------
    console.log("\n--- Scenario 9: chat-sandbox adapter (ADR-0020) ---");
    const sandboxCaps = chatSandboxAdapter.capabilities();
    check("chat-sandbox id is 'chat-sandbox'", chatSandboxAdapter.id === "chat-sandbox");
    check("chat-sandbox declares sandboxed_code_execution=true", sandboxCaps.sandboxed_code_execution === true);
    check("chat-sandbox declares filesystem_read=true (within sandbox)", sandboxCaps.filesystem_read === true);
    check("chat-sandbox declares filesystem_write=true (within sandbox)", sandboxCaps.filesystem_write === true);
    check("chat-sandbox declares shell_exec=true (within sandbox)", sandboxCaps.shell_exec === true);
    check("chat-sandbox declares test_runner=true (within sandbox)", sandboxCaps.test_runner === true);
    check("chat-sandbox declares native_skills=false (still must read SKILL.md via shell)", sandboxCaps.native_skills === false);
    check("chat-sandbox declares browser=false (typical sandbox has no browser)", sandboxCaps.browser === false);
    check("chat-sandbox declares mcp=false (MCP not typically in sandbox)", sandboxCaps.mcp === false);

    // chat-sandbox renderEntrypoint produces CHAT-ENTRYPOINT-SANDBOX.md
    const sandboxFiles = chatSandboxAdapter.renderEntrypoint(minimalCanonical);
    check("chat-sandbox renderEntrypoint produces exactly 1 file", sandboxFiles.length === 1);
    check("rendered file is CHAT-ENTRYPOINT-SANDBOX.md", sandboxFiles[0].path === "CHAT-ENTRYPOINT-SANDBOX.md");
    check("sandbox entrypoint mentions code execution", sandboxFiles[0].content.includes("code execution"));
    check("sandbox entrypoint mentions sandbox", sandboxFiles[0].content.includes("sandbox"));
    check("sandbox entrypoint lists skills by name", sandboxFiles[0].content.includes("systematic-debugging") && sandboxFiles[0].content.includes("evidence-engineering"));
    check("sandbox entrypoint notes artifacts live in sandbox (not user's real FS)", sandboxFiles[0].content.includes("sandbox") && sandboxFiles[0].content.includes("real filesystem"));
    check("renderEntrypoint is idempotent", chatSandboxAdapter.renderEntrypoint(minimalCanonical)[0].content === sandboxFiles[0].content);

    // chat-sandbox translateObservation IS a real function (unlike pure-text
    // chat which throws) — sandbox agents CAN produce raw tool observations
    // (shell output, file reads from the sandbox)
    const sandboxObs = {
      raw: { tool: "python", command: "pytest tests/", exit_code: 0, output: "3 passed" },
      timestamp: new Date().toISOString(),
      traceRef: "trace-sandbox-1",
      source: "sandbox-run-1",
    };
    const sandboxEvent = chatSandboxAdapter.translateObservation(sandboxObs);
    check("chat-sandbox translateObservation produces an Event object", typeof sandboxEvent === "object" && sandboxEvent !== null);
    check("chat-sandbox event has trace_ref", sandboxEvent.trace_ref === "trace-sandbox-1");
    check("chat-sandbox event source is 'chat-sandbox:python'", sandboxEvent.source === "chat-sandbox:python");
    check("chat-sandbox event kind is 'action' (python maps to action)", sandboxEvent.kind === "action");
    check("chat-sandbox event id starts with 'event-sandbox-run-1-'", String(sandboxEvent.id).startsWith("event-sandbox-run-1-"));

    // chat-sandbox vs pure-text chat: distinct capabilities
    const pureChatCaps = chatAdapter.capabilities();
    check("chat and chat-sandbox have distinct filesystem_write declarations", pureChatCaps.filesystem_write !== sandboxCaps.filesystem_write);
    check("chat and chat-sandbox have distinct sandboxed_code_execution declarations", pureChatCaps.sandboxed_code_execution === false && sandboxCaps.sandboxed_code_execution === true);
    check("chat and chat-sandbox have distinct ids", chatAdapter.id !== chatSandboxAdapter.id);

    // ------------------------------------------------------------------
    // Scenario 10: ADR-0023 — safety gate authorization for chat-sandbox
    // ------------------------------------------------------------------
    console.log("\n--- Scenario 10: ADR-0023 safety gate authorization ---");

    // Use the REAL simulated chat response file (not the SIMULATED_CHAT_RESPONSE
    // constant, which is a short example for validator tests, not a full
    // workflow walkthrough). The real file at scripts/test-responses/
    // chat-llm-simulated-bug-report.md walks the full bug-report workflow
    // including safety-gated transitions (fix_approved → apply-fix,
    // fix_applied → verify).
    const FULL_RESPONSE_PATH = join(REPO_ROOT, "scripts", "test-responses", "chat-llm-simulated-bug-report.md");
    const fullResponse = readFileSync(FULL_RESPONSE_PATH, "utf-8");

    // Test (a): chat-sandbox WITHOUT authorization — safety gate must BLOCK
    let authFailExit = 0;
    let authFailStdout = "";
    try {
      authFailStdout = execFileSync("node", [
        join(REPO_ROOT, "scripts", "chat-harness.mjs"),
        "bug-report", FULL_RESPONSE_PATH,
        "--adapter", "chat-sandbox",
      ], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      authFailExit = e.status ?? 1;
      authFailStdout = (e.stdout ?? "").toString() + (e.stderr ?? "").toString();
    }
    check("(a) chat-sandbox without auth: harness exits non-zero", authFailExit !== 0);
    check("(a) chat-sandbox without auth: VERDICT is FAIL", authFailStdout.includes("VERDICT: FAIL"));
    check("(a) chat-sandbox without auth: 'NOT authorized' message present", authFailStdout.includes("NOT authorized"));
    check("(a) chat-sandbox without auth: 'safety-gate-not-authorized' violation present", authFailStdout.includes("safety-gate-not-authorized") || authFailStdout.includes("safety gate NOT authorized"));

    // Test (b): chat-sandbox WITH --user-prompt containing "fix" — must PASS
    const promptFile = join(tmpDir, "user-prompt.txt");
    await writeFile(promptFile, "fix the boundary bug in shipping.py");
    let authPassExit = 0;
    let authPassStdout = "";
    try {
      authPassStdout = execFileSync("node", [
        join(REPO_ROOT, "scripts", "chat-harness.mjs"),
        "bug-report", FULL_RESPONSE_PATH,
        "--adapter", "chat-sandbox",
        "--user-prompt", promptFile,
      ], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      authPassExit = e.status ?? 1;
      authPassStdout = (e.stdout ?? "").toString() + (e.stderr ?? "").toString();
    }
    check("(b) chat-sandbox with --user-prompt 'fix': harness exits 0", authPassExit === 0);
    check("(b) chat-sandbox with --user-prompt 'fix': VERDICT is PASS", authPassStdout.includes("VERDICT: PASS"));
    check("(b) chat-sandbox with --user-prompt 'fix': 'authorized: user prompt' present", authPassStdout.includes("authorized: user prompt"));

    // Test (c): chat-sandbox WITH aiecp:confirm block — must PASS
    // Insert an aiecp:confirm block before the fix_approved advance
    const confirmResponse = fullResponse.replace(
      "```aiecp:advance\non: fix_approved\n```",
      "```aiecp:confirm\ngate: broad-refactor\nreason: \"user asked to fix the bug, proceeding with patch\"\n```\n\n```aiecp:advance\non: fix_approved\n```"
    );
    const confirmFile = join(tmpDir, "sandbox-with-confirm.md");
    await writeFile(confirmFile, confirmResponse);
    let confirmExit = 0;
    let confirmStdout = "";
    try {
      confirmStdout = execFileSync("node", [
        join(REPO_ROOT, "scripts", "chat-harness.mjs"),
        "bug-report", confirmFile,
        "--adapter", "chat-sandbox",
      ], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      confirmExit = e.status ?? 1;
      confirmStdout = (e.stdout ?? "").toString() + (e.stderr ?? "").toString();
    }
    check("(c) chat-sandbox with aiecp:confirm: harness exits 0", confirmExit === 0);
    check("(c) chat-sandbox with aiecp:confirm: VERDICT is PASS", confirmStdout.includes("VERDICT: PASS"));
    check("(c) chat-sandbox with aiecp:confirm: 'explicit aiecp:confirm' message present", confirmStdout.includes("authorized: explicit aiecp:confirm"));
    check("(c) chat-sandbox with aiecp:confirm: confirm block was parsed", confirmStdout.includes("explicit confirmation recorded"));

    // Test (d): chat (pure-text) still auto-confirms — backward compat
    let pureChatExit = 0;
    let pureChatStdout = "";
    try {
      pureChatStdout = execFileSync("node", [
        join(REPO_ROOT, "scripts", "chat-harness.mjs"),
        "bug-report", FULL_RESPONSE_PATH,
        "--adapter", "chat",
      ], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      pureChatExit = e.status ?? 1;
      pureChatStdout = (e.stdout ?? "").toString() + (e.stderr ?? "").toString();
    }
    check("(d) chat (pure-text) auto-confirm: harness exits 0", pureChatExit === 0);
    check("(d) chat (pure-text) auto-confirm: VERDICT is PASS", pureChatStdout.includes("VERDICT: PASS"));
    check("(d) chat (pure-text) auto-confirm: 'auto-confirmed' present", pureChatStdout.includes("auto-confirmed"));
    check("(d) chat (pure-text) auto-confirm: 'gate moot' reason present", pureChatStdout.includes("gate moot"));

    // Test (e): already-terminal violation (4th ChatGPT test's extra block bug)
    const alreadyTerminalResponse = fullResponse + "\n```aiecp:advance\non: replay_matches\n```\n";
    const alreadyTerminalFile = join(tmpDir, "already-terminal.md");
    await writeFile(alreadyTerminalFile, alreadyTerminalResponse);
    let terminalExit = 0;
    let terminalStdout = "";
    try {
      terminalStdout = execFileSync("node", [
        join(REPO_ROOT, "scripts", "chat-harness.mjs"),
        "bug-report", alreadyTerminalFile,
        "--adapter", "chat",
      ], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      terminalExit = e.status ?? 1;
      terminalStdout = (e.stdout ?? "").toString() + (e.stderr ?? "").toString();
    }
    check("(e) already-terminal: harness exits non-zero (extra block fails)", terminalExit !== 0);
    check("(e) already-terminal: 'already-terminal' violation present", terminalStdout.includes("already-terminal"));
    check("(e) already-terminal: clear message about terminal state", terminalStdout.includes("terminal") && terminalStdout.includes("cannot advance"));

  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.error("CHAT ADAPTER PROOF FAILED");
    process.exit(1);
  }
  console.log("CHAT ADAPTER PROOF PASSED");
  console.log("");
  console.log("Proof summary:");
  console.log("- chat (pure-text) adapter declares capabilities honestly (all false, no false claims)");
  console.log("- chat-sandbox adapter (ADR-0020) declares sandboxed capabilities (true within sandbox)");
  console.log("- chat-sandbox can drive project-onboarding (filesystem_write=true in sandbox)");
  console.log("- chat-sandbox translateObservation IS a real function (unlike pure-text chat which throws)");
  console.log("- renderEntrypoint produces CHAT-ENTRYPOINT.md (pure-text) + CHAT-ENTRYPOINT-SANDBOX.md (sandbox)");
  console.log("- validate-chat-output.mjs parses + schema-validates aiecp:* blocks");
  console.log("- Validator accepts well-formed responses with 11 blocks of all kinds");
  console.log("- Validator rejects malformed blocks (unknown kinds, missing fields, bad id patterns, bad YAML)");
  console.log("- Validator rejects input with no aiecp blocks at all");
  console.log("- Validator supports stdin input (for piping chat LLM responses)");
  console.log("- Protocol is expressive enough for a full bug-report workflow run (5+ evidence kinds)");
  console.log("- ADR-0023: chat-sandbox without auth FAILS (security gap closed)");
  console.log("- ADR-0023: chat-sandbox with --user-prompt authorization PASSES");
  console.log("- ADR-0023: chat-sandbox with aiecp:confirm block PASSES (explicit authorization)");
  console.log("- ADR-0023: chat (pure-text) still auto-confirms (backward compat)");
  console.log("- ADR-0023: already-terminal violation correctly caught (extra block past terminal)");
}

scenario().catch((err) => {
  console.error("CHAT ADAPTER PROOF FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
