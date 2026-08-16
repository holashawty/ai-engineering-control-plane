// executor/examples/e2e-risk-classifier/drive-run.mjs
//
// ADR-0034 e2e driver: risk-based adaptive workflow routing.
//
// Tests executor/src/risk-classifier.ts — a PURE function (no I/O,
// no FSM, no LLM). The driver imports the compiled dist/ output and
// exercises:
//   1. The 5 risk levels (trivial, low, medium, high, critical).
//   2. fast_path_eligible is true ONLY for trivial.
//   3. recommended_workflow_path matches the ADR-0034 spec:
//        trivial  → "fast-path"
//        low      → "full-fsm"
//        medium   → "full-fsm"
//        high     → "full-fsm-plus-review"
//        critical → "full-fsm-plus-human-approval"
//   4. Edge cases: empty signals → medium (safe default);
//      diff_loc=0 but files_changed=5 → low (something changed).
//   5. Boundary inclusivity: diff_loc=5 → trivial; diff_loc=6 → low;
//      diff_loc=50 → low; diff_loc=51 → medium.
//   6. Configuration exports (SECURITY_KEYWORDS, CODE_EXTENSIONS,
//      RISK_THRESHOLDS) — catch silent threshold drift.
//
// Mirrors executor/examples/e2e-scale-classifier/drive-run.mjs's
// pattern: imports from ../../dist/, check(label, cond, detail)
// helper, OK/FAIL per assertion, exit 1 on any failure.
//
// Run: `npm run e2e:risk-classifier` (after `npm run build --workspace=executor`).

import {
  classifyRisk,
  SECURITY_KEYWORDS,
  CODE_EXTENSIONS,
  TRIVIAL_ALLOWED_EXTENSIONS,
  RISK_THRESHOLDS,
} from "../../dist/risk-classifier.js";

let passed = 0, failed = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`  OK   ${label}`); passed++; }
  else { console.log(`  FAIL ${label} — ${detail}`); failed++; }
}

console.log("=== ADR-0034 risk-classifier e2e ===\n");

// ─── Sanity: classifier configuration exports ──────────────────────
// These assertions catch silent threshold drift (the same failure
// mode ADR-0029 fixed for STATUS.md's assertion counts).
console.log("--- Sanity: classifier configuration exports ---");
check("SECURITY_KEYWORDS has 9 entries (security/auth/password/payment/token/secret/credential/vulnerability/cve)",
  SECURITY_KEYWORDS.length === 9, `got ${SECURITY_KEYWORDS.length}`);
check("SECURITY_KEYWORDS includes 'password'",
  SECURITY_KEYWORDS.includes("password"));
check("CODE_EXTENSIONS has 5 entries (.ts/.py/.go/.rs/.java)",
  CODE_EXTENSIONS.size === 5, `got ${CODE_EXTENSIONS.size}`);
check("CODE_EXTENSIONS contains '.ts'",
  CODE_EXTENSIONS.has(".ts"));
check("TRIVIAL_ALLOWED_EXTENSIONS has 3 entries (.md/.txt/.json)",
  TRIVIAL_ALLOWED_EXTENSIONS.size === 3, `got ${TRIVIAL_ALLOWED_EXTENSIONS.size}`);
check("RISK_THRESHOLDS.trivial_max_diff_loc === 5",
  RISK_THRESHOLDS.trivial_max_diff_loc === 5);
check("RISK_THRESHOLDS.low_max_diff_loc === 50",
  RISK_THRESHOLDS.low_max_diff_loc === 50);
check("RISK_THRESHOLDS.medium_max_diff_loc === 500",
  RISK_THRESHOLDS.medium_max_diff_loc === 500);
check("RISK_THRESHOLDS.critical_kfm_diff_loc_threshold === 50",
  RISK_THRESHOLDS.critical_kfm_diff_loc_threshold === 50);

// ─── Scenario 1: trivial (.md-only, 3 LOC, 1 file) ────────────────
// Per ADR-0034 spec: trivial → fast-path (skip FSM, emit
// Decision(fast_path_applied) + apply + verify).
console.log("\n--- Scenario 1: trivial (.md-only, 3 LOC, 1 file) ---");
{
  const result = classifyRisk({
    diff_loc: 3,
    file_extensions: [".md"],
    files_changed: 1,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'trivial'", result.level === "trivial", `got ${result.level}`);
  check("fast_path_eligible === true", result.fast_path_eligible === true);
  check("recommended_workflow_path === 'fast-path'",
    result.recommended_workflow_path === "fast-path",
    `got ${result.recommended_workflow_path}`);
  check("reason starts with 'trivial:'", result.reason.startsWith("trivial:"));
}

// ─── Scenario 2: low (.ts + .test.ts, 30 LOC, 2 files) ────────────
// Per ADR-0034 spec: low → full FSM (current default).
console.log("\n--- Scenario 2: low (.ts + .test.ts, 30 LOC, 2 files) ---");
{
  const result = classifyRisk({
    diff_loc: 30,
    // Both files are .ts (.test.ts has extension .ts, just with .test in the name).
    file_extensions: [".ts"],
    files_changed: 2,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'low'", result.level === "low", `got ${result.level}`);
  check("fast_path_eligible === false", result.fast_path_eligible === false);
  check("recommended_workflow_path === 'full-fsm'",
    result.recommended_workflow_path === "full-fsm",
    `got ${result.recommended_workflow_path}`);
}

// ─── Scenario 3: medium (5 .ts files, 200 LOC) ─────────────────────
// Per ADR-0034 spec: medium → full FSM (current default).
console.log("\n--- Scenario 3: medium (5 .ts files, 200 LOC) ---");
{
  const result = classifyRisk({
    diff_loc: 200,
    file_extensions: [".ts"],
    files_changed: 5,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'medium'", result.level === "medium", `got ${result.level}`);
  check("fast_path_eligible === false", result.fast_path_eligible === false);
  check("recommended_workflow_path === 'full-fsm'",
    result.recommended_workflow_path === "full-fsm");
}

// ─── Scenario 4: high (25 files, 800 LOC) ──────────────────────────
// Per ADR-0034 spec: high → full FSM + mandatory code-review after.
console.log("\n--- Scenario 4: high (25 files, 800 LOC) ---");
{
  const result = classifyRisk({
    diff_loc: 800,
    file_extensions: [".ts"],
    files_changed: 25,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'high'", result.level === "high", `got ${result.level}`);
  check("fast_path_eligible === false", result.fast_path_eligible === false);
  check("recommended_workflow_path === 'full-fsm-plus-review'",
    result.recommended_workflow_path === "full-fsm-plus-review",
    `got ${result.recommended_workflow_path}`);
}

// ─── Scenario 5: critical-security (1 file, 10 LOC, 'password' keyword)
// Per ADR-0034 spec: critical → full FSM + human-approval-required gate.
console.log("\n--- Scenario 5: critical-security (1 file, 10 LOC, 'password' keyword) ---");
{
  const result = classifyRisk({
    diff_loc: 10,
    file_extensions: [".ts"],
    files_changed: 1,
    request_keywords: ["fix", "the", "password", "field"],
    known_failure_match: false,
  });
  check("level === 'critical'", result.level === "critical", `got ${result.level}`);
  check("fast_path_eligible === false", result.fast_path_eligible === false);
  check("recommended_workflow_path === 'full-fsm-plus-human-approval'",
    result.recommended_workflow_path === "full-fsm-plus-human-approval",
    `got ${result.recommended_workflow_path}`);
  check("reason mentions 'security keyword'",
    result.reason.includes("security keyword"));
}

// ─── Scenario 6: critical-regression (known_failure_match=true, 100 LOC)
// Per ADR-0034 spec: KFM with diff_loc > 50 → critical.
console.log("\n--- Scenario 6: critical-regression (known_failure_match=true, 100 LOC) ---");
{
  const result = classifyRisk({
    diff_loc: 100,
    file_extensions: [".ts"],
    files_changed: 1,
    request_keywords: [],
    known_failure_match: true,
  });
  check("level === 'critical'", result.level === "critical", `got ${result.level}`);
  check("fast_path_eligible === false", result.fast_path_eligible === false);
  check("recommended_workflow_path === 'full-fsm-plus-human-approval'",
    result.recommended_workflow_path === "full-fsm-plus-human-approval");
  check("reason mentions 'known_failure_match'",
    result.reason.includes("known_failure_match"));
}

// ─── Edge 7: empty signals → medium (safe default) ─────────────────
// Per ADR-0034 spec: refuse to fast-path without positive evidence
// the change is trivial. Default to medium (full FSM).
console.log("\n--- Edge 7: empty signals → medium (safe default) ---");
{
  // All-zero object — "logically empty" (no diff, no files, no extensions, no keywords).
  const result = classifyRisk({
    file_extensions: [],
    files_changed: 0,
    request_keywords: [],
    known_failure_match: false,
    // diff_loc omitted → treated as 0
  });
  check("level === 'medium' (safe default)",
    result.level === "medium", `got ${result.level}`);
  check("fast_path_eligible === false (refuses fast-path without evidence)",
    result.fast_path_eligible === false);
  check("recommended_workflow_path === 'full-fsm'",
    result.recommended_workflow_path === "full-fsm");
  check("reason mentions 'safe default'",
    result.reason.includes("safe default"));
}

// ─── Edge 8: diff_loc=0 but files_changed=5 → low ─────────────────
// "Something changed" — not empty even if diff_loc=0 (e.g., file
// renames with no content change). Goes through the FSM at low risk.
console.log("\n--- Edge 8: diff_loc=0 but files_changed=5 → low ---");
{
  const result = classifyRisk({
    diff_loc: 0,
    file_extensions: [".ts"],
    files_changed: 5,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'low' (something changed, not empty)",
    result.level === "low", `got ${result.level}`);
  check("fast_path_eligible === false",
    result.fast_path_eligible === false);
}

// ─── Boundary 9: diff_loc=5 → trivial (5 <= 5 inclusive) ──────────
console.log("\n--- Boundary 9: diff_loc=5 → trivial (boundary inclusive) ---");
{
  const result = classifyRisk({
    diff_loc: 5,
    file_extensions: [".md"],
    files_changed: 2,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'trivial'", result.level === "trivial", `got ${result.level}`);
  check("fast_path_eligible === true", result.fast_path_eligible === true);
}

// ─── Boundary 10: diff_loc=6 → low (just over trivial's 5) ────────
console.log("\n--- Boundary 10: diff_loc=6 → low (just over 5) ---");
{
  const result = classifyRisk({
    diff_loc: 6,
    file_extensions: [".md"],
    files_changed: 2,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'low'", result.level === "low", `got ${result.level}`);
}

// ─── Boundary 11: diff_loc=50 → low (50 <= 50 inclusive) ──────────
console.log("\n--- Boundary 11: diff_loc=50 → low (boundary inclusive) ---");
{
  const result = classifyRisk({
    diff_loc: 50,
    file_extensions: [".ts"],  // .ts so trivial is also excluded (trivial needs diff<=5)
    files_changed: 5,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'low'", result.level === "low", `got ${result.level}`);
}

// ─── Boundary 12: diff_loc=51 → medium (just over low's 50) ──────
console.log("\n--- Boundary 12: diff_loc=51 → medium (just over 50) ---");
{
  const result = classifyRisk({
    diff_loc: 51,
    file_extensions: [".ts"],
    files_changed: 5,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'medium'", result.level === "medium", `got ${result.level}`);
}

// ─── Bonus 13: .txt + .json extensions → trivial (trivial-allowed) ─
console.log("\n--- Bonus 13: .txt + .json → trivial (trivial-allowed exts) ---");
{
  const result = classifyRisk({
    diff_loc: 4,
    file_extensions: [".txt", ".json"],
    files_changed: 2,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'trivial'", result.level === "trivial", `got ${result.level}`);
}

// ─── Bonus 14: 'cve-2024-1234' substring-matches 'cve' → critical ─
// Verifies the substring (not word-boundary) matching policy.
console.log("\n--- Bonus 14: 'cve-2024-1234' substring-matches 'cve' → critical ---");
{
  const result = classifyRisk({
    diff_loc: 5,
    file_extensions: [".md"],
    files_changed: 1,
    request_keywords: ["cve-2024-1234"],
    known_failure_match: false,
  });
  check("level === 'critical' (substring match)",
    result.level === "critical", `got ${result.level}`);
}

// ─── Bonus 15: KFM=true with diff_loc=10 → medium ─────────────────
// KFM with small diff is not critical (need diff>50); not trivial
// (diff>5); not low (KFM excludes low); falls to medium.
console.log("\n--- Bonus 15: KFM=true with diff_loc=10 → medium ---");
{
  const result = classifyRisk({
    diff_loc: 10,
    file_extensions: [".md"],
    files_changed: 1,
    request_keywords: [],
    known_failure_match: true,
  });
  check("level === 'medium' (KFM excludes low; diff_loc>5 excludes trivial)",
    result.level === "medium", `got ${result.level}`);
}

// ─── Bonus 16: diff_loc=501 → high (just over medium's 500) ───────
console.log("\n--- Bonus 16: diff_loc=501 → high (just over medium's 500) ---");
{
  const result = classifyRisk({
    diff_loc: 501,
    file_extensions: [".ts"],
    files_changed: 1,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'high'", result.level === "high", `got ${result.level}`);
  check("recommended_workflow_path === 'full-fsm-plus-review'",
    result.recommended_workflow_path === "full-fsm-plus-review");
}

// ─── Bonus 17: files_changed=21 → high (just over medium's 20) ───
console.log("\n--- Bonus 17: files_changed=21 → high (just over medium's 20) ---");
{
  const result = classifyRisk({
    diff_loc: 100,
    file_extensions: [".ts"],
    files_changed: 21,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'high'", result.level === "high", `got ${result.level}`);
}

// ─── Bonus 18: KFM=true with diff_loc=51 → critical (just over 50) ─
console.log("\n--- Bonus 18: KFM=true with diff_loc=51 → critical (just over 50) ---");
{
  const result = classifyRisk({
    diff_loc: 51,
    file_extensions: [".ts"],
    files_changed: 1,
    request_keywords: [],
    known_failure_match: true,
  });
  check("level === 'critical'", result.level === "critical", `got ${result.level}`);
}

// ─── Bonus 19: .ts file at diff_loc=5 → NOT trivial (.ts is code ext)
console.log("\n--- Bonus 19: diff_loc=5 with .ts → low (.ts disqualifies trivial) ---");
{
  const result = classifyRisk({
    diff_loc: 5,
    file_extensions: [".ts"],
    files_changed: 1,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'low' (.ts disqualifies trivial; 5<=50 satisfies low)",
    result.level === "low", `got ${result.level}`);
}

// ─── Bonus 20: classifyRisk({}) → medium (defensive empty-input) ──
// JS callers may pass a truly empty object; the classifier's ??
// defaults normalize it to all-zero, which then hits the empty-signals
// safe default.
console.log("\n--- Bonus 20: classifyRisk({}) → medium (defensive empty-input) ---");
{
  // Pass an empty object — JS allows this even though TypeScript
  // would reject it at compile time (.mjs is not type-checked).
  const result = classifyRisk({});
  check("level === 'medium' (safe default)", result.level === "medium", `got ${result.level}`);
  check("signals echoed back with defaults (diff_loc=0, files_changed=0, ...)",
    result.signals.diff_loc === 0 &&
    result.signals.files_changed === 0 &&
    Array.isArray(result.signals.file_extensions) &&
    result.signals.file_extensions.length === 0);
}

// ─── Bonus 21: high boundary — diff_loc=500 → medium (inclusive) ──
console.log("\n--- Bonus 21: diff_loc=500 → medium (500 <= 500 inclusive) ---");
{
  const result = classifyRisk({
    diff_loc: 500,
    file_extensions: [".ts"],
    files_changed: 1,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'medium' (500 is the inclusive upper bound of medium)",
    result.level === "medium", `got ${result.level}`);
}

// ─── Bonus 22: high boundary — files_changed=20 → medium (inclusive)
console.log("\n--- Bonus 22: files_changed=20 → medium (20 <= 20 inclusive) ---");
{
  const result = classifyRisk({
    diff_loc: 100,
    file_extensions: [".ts"],
    files_changed: 20,
    request_keywords: [],
    known_failure_match: false,
  });
  check("level === 'medium' (20 is the inclusive upper bound of medium)",
    result.level === "medium", `got ${result.level}`);
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log("E2E DRIVER FAILED");
  process.exit(1);
}
console.log("E2E DRIVER PASSED");
