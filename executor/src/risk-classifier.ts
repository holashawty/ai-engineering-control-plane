// executor/src/risk-classifier.ts
//
// ADR-0034: Adaptive Workflow Routing — risk-based fast-path.
//
// A PURE-function classifier that maps a request's risk signals
// (diff size, file types, file count, request keywords, regression
// match) to one of 5 risk levels: trivial | low | medium | high |
// critical. The classifier does NOT call git, the LLM, or any I/O —
// the caller (typically the orchestrator's classify-goal state) is
// responsible for constructing RiskSignals from `git diff --stat`
// (diff_loc + files_changed) and `git diff --name-only`
// (file_extensions). The classifier itself is deterministic and
// side-effect-free: same input always yields the same output.
//
// The risk level drives an OUTER routing decision:
//   - trivial     → fast-path (skip FSM, emit Decision(fast_path_applied)
//                    + apply + verify)
//   - low         → full FSM (current default)
//   - medium      → full FSM (current default)
//   - high        → full FSM + mandatory code-review after
//   - critical    → full FSM + human-approval-required gate (new gate type)
//
// The FSM definitions in workflows/*.sm.yaml are UNCHANGED — this
// module is an outer router, not a modification to the FSM purity.
// See ADR-0034 and workflows/_router.md "Fast-Path" section.
//
// Mirrors executor/src/project-scale-classifier.ts (SCALE_RANGES,
// classifyRun, buildValidation) in structure: an exported config
// object, a pure classify function, and a normalized result type.
//
// Tested by executor/examples/e2e-risk-classifier/drive-run.mjs.

export type RiskLevel = "trivial" | "low" | "medium" | "high" | "critical";

export interface RiskSignals {
  /** Lines changed (from `git diff --stat` — additions + deletions).
   *  Optional; treated as 0 when absent. */
  diff_loc?: number;
  /** File extensions touched (from `git diff --name-only`), e.g.
   *  ['.ts', '.md', '.py']. The caller is responsible for parsing
   *  extensions out of file paths. */
  file_extensions: string[];
  /** Count of files in the diff (from `git diff --stat | grep -c '|'`). */
  files_changed: number;
  /** Tokens extracted from the user's request (for keyword matching).
   *  The caller tokenizes; the classifier does substring matching
   *  against SECURITY_KEYWORDS (case-insensitive). */
  request_keywords: string[];
  /** True if the request matches a known-failure memory entry
   *  (regression risk — the symptom description matches an entry in
   *  `.aiecp/memory/known-failures.json`). */
  known_failure_match: boolean;
}

export interface RiskAssessment {
  level: RiskLevel;
  signals: RiskSignals;
  reason: string;
  /** True ONLY when level === "trivial" — the only fast-path-eligible
   *  level. Every other level must go through the FSM. */
  fast_path_eligible: boolean;
  /** The workflow path the outer router should take for this risk.
   *  Drives the routing decision in workflows/_router.md. */
  recommended_workflow_path:
    | "fast-path"
    | "full-fsm"
    | "full-fsm-plus-review"
    | "full-fsm-plus-human-approval";
}

// ─── Classification configuration ───────────────────────────────────
//
// Exported for introspection (mirrors SCALE_RANGES in
// project-scale-classifier.ts). Tests assert on these values to
// catch silent threshold drift.

/**
 * Security keywords — any presence (case-insensitive substring) in
 * `request_keywords` escalates the request to `critical`. Covers
 * the pro-LLM's list from roadmap-2026-pro.md Item 5: "security,
 * auth, password, payment, token, secret, credential, vulnerability,
 * CVE".
 */
export const SECURITY_KEYWORDS: readonly string[] = [
  "security",
  "auth",
  "password",
  "payment",
  "token",
  "secret",
  "credential",
  "vulnerability",
  "cve",
];

/**
 * Code-bearing file extensions — any presence disqualifies trivial
 * fast-path. Per ADR-0034: only `.md`/`.txt`/`.json` config files
 * are eligible for the trivial fast-path; any code change (even a
 * 1-line `.ts` tweak) must go through the FSM.
 */
export const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".py",
  ".go",
  ".rs",
  ".java",
]);

/**
 * Extensions permitted on the trivial fast-path. Documented for
 * clarity; the actual trivial check uses "no CODE_EXTENSIONS"
 * (i.e., any extension NOT in CODE_EXTENSIONS is allowed, including
 * `.yaml`, `.toml`, `.sh`). The TRIVIAL_ALLOWED_EXTENSIONS set
 * documents the *intended* scope from ADR-0034.
 */
export const TRIVIAL_ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".md",
  ".txt",
  ".json",
]);

/**
 * Numeric thresholds for each level boundary. Exported so tests and
 * downstream tooling can introspect (and assert on) the exact
 * thresholds — prevents silent threshold drift like the kind that
 * afflicted STATUS.md's assertion counts pre-ADR-0029.
 */
export const RISK_THRESHOLDS = {
  /** Maximum diff_loc for trivial classification. */
  trivial_max_diff_loc: 5,
  /** Maximum files_changed for trivial classification. */
  trivial_max_files: 2,
  /** Maximum diff_loc for low classification. */
  low_max_diff_loc: 50,
  /** Maximum files_changed for low classification. */
  low_max_files: 5,
  /** Maximum diff_loc for medium classification. */
  medium_max_diff_loc: 500,
  /** Maximum files_changed for medium classification. */
  medium_max_files: 20,
  /** diff_loc above this threshold, when known_failure_match=true,
   *  escalates to critical. Below this, KFM alone yields medium. */
  critical_kfm_diff_loc_threshold: 50,
} as const;

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Returns true if any of the SECURITY_KEYWORDS appears (as a
 * case-insensitive substring) in any of the request_keywords tokens.
 *
 * Substring matching (not word-boundary regex) so "passwords",
 * "auth-token", and "cve-2024-1234" all match their respective
 * keywords. The trade-off: rare false positives like "insecurity"
 * matching "security" — acceptable for an MVP per ADR-0034.
 */
function hasSecurityKeyword(keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const haystack = keywords.map(k => k.toLowerCase()).join(" ");
  return SECURITY_KEYWORDS.some(kw => haystack.includes(kw));
}

/**
 * Returns true if any of the file_extensions is in CODE_EXTENSIONS
 * (case-insensitive). E.g. ['.md', '.TS'] → true (because '.TS'
 * normalizes to '.ts').
 */
function hasCodeExtension(extensions: string[]): boolean {
  return extensions.some(ext => CODE_EXTENSIONS.has(ext.toLowerCase()));
}

// ─── Pure classifier ────────────────────────────────────────────────

/**
 * Classify a request's risk level from its signals.
 *
 * PURE function: no I/O, no side effects, no LLM, no Date.now(),
 * no Math.random(). Same input always yields the same output —
 * this is what makes the classifier testable in isolation and
 * deterministic across replays.
 *
 * Priority order (most-severe checked first):
 *   1. critical  — security keyword present, OR (known_failure_match
 *                  AND diff_loc > critical_kfm_diff_loc_threshold)
 *   2. high      — diff_loc > medium_max_diff_loc, OR
 *                  files_changed > medium_max_files
 *   3. trivial   — diff_loc <= trivial_max_diff_loc AND
 *                  files_changed <= trivial_max_files AND
 *                  no CODE_EXTENSIONS AND
 *                  no SECURITY_KEYWORDS
 *                  (Checked BEFORE low/medium so the tightest
 *                   classification wins when multiple levels'
 *                   conditions are met — e.g., a 3-LOC .md-only
 *                   change matches trivial, low, AND medium, but
 *                   trivial is the correct answer.)
 *   4. low       — diff_loc <= low_max_diff_loc AND
 *                  files_changed <= low_max_files AND
 *                  no SECURITY_KEYWORDS AND
 *                  no known_failure_match
 *   5. medium    — diff_loc <= medium_max_diff_loc AND
 *                  files_changed <= medium_max_files AND
 *                  no SECURITY_KEYWORDS
 *                  (default for real changes with no escalators)
 *
 * Edge case: when ALL of {diff_loc, files_changed, file_extensions,
 * request_keywords} are zero/empty/missing, the function returns
 * `medium` as a safe default — refusing to fast-path without
 * positive evidence the change is trivial. (Pro-LLM's "safe default"
 * intent per roadmap-2026-pro.md Item 5.)
 */
export function classifyRisk(signals: RiskSignals): RiskAssessment {
  // Defensive defaults — JS callers may pass {} or partial objects.
  // TypeScript strict mode treats these as non-null (per the interface),
  // but the `??` keeps the runtime robust if a JS caller omits a field.
  const diff_loc = signals.diff_loc ?? 0;
  const file_extensions = signals.file_extensions ?? [];
  const files_changed = signals.files_changed ?? 0;
  const request_keywords = signals.request_keywords ?? [];
  const known_failure_match = signals.known_failure_match ?? false;

  // Normalized signals echoed back in the assessment (so callers can
  // see what the classifier actually used, after defaults applied).
  const normalized: RiskSignals = {
    diff_loc,
    file_extensions,
    files_changed,
    request_keywords,
    known_failure_match,
  };

  // --- Empty signals → safe default (medium) -----------------------------
  // No positive evidence about the change; refuse to fast-path. The
  // orchestrator should still run the full FSM (the current default).
  const isEmpty =
    diff_loc === 0 &&
    files_changed === 0 &&
    file_extensions.length === 0 &&
    request_keywords.length === 0;

  if (isEmpty) {
    return {
      level: "medium",
      signals: normalized,
      reason:
        "medium (safe default): no diff/file/keyword signals provided — refusing to fast-path without positive evidence the change is trivial",
      fast_path_eligible: false,
      recommended_workflow_path: "full-fsm",
    };
  }

  const secKeywordMatch = hasSecurityKeyword(request_keywords);
  const hasCodeExt = hasCodeExtension(file_extensions);

  // --- critical: security OR regression-with-real-diff -------------------
  if (
    secKeywordMatch ||
    (known_failure_match && diff_loc > RISK_THRESHOLDS.critical_kfm_diff_loc_threshold)
  ) {
    const reasons: string[] = [];
    if (secKeywordMatch) {
      reasons.push("security keyword present in request");
    }
    if (known_failure_match && diff_loc > RISK_THRESHOLDS.critical_kfm_diff_loc_threshold) {
      reasons.push(
        `known_failure_match=true with diff_loc ${diff_loc} > ${RISK_THRESHOLDS.critical_kfm_diff_loc_threshold}`,
      );
    }
    return {
      level: "critical",
      signals: normalized,
      reason: `critical: ${reasons.join("; ")}`,
      fast_path_eligible: false,
      recommended_workflow_path: "full-fsm-plus-human-approval",
    };
  }

  // --- high: large diff OR many files -----------------------------------
  if (
    diff_loc > RISK_THRESHOLDS.medium_max_diff_loc ||
    files_changed > RISK_THRESHOLDS.medium_max_files
  ) {
    const reasons: string[] = [];
    if (diff_loc > RISK_THRESHOLDS.medium_max_diff_loc) {
      reasons.push(`diff_loc ${diff_loc} > ${RISK_THRESHOLDS.medium_max_diff_loc}`);
    }
    if (files_changed > RISK_THRESHOLDS.medium_max_files) {
      reasons.push(`files_changed ${files_changed} > ${RISK_THRESHOLDS.medium_max_files}`);
    }
    return {
      level: "high",
      signals: normalized,
      reason: `high: ${reasons.join("; ")}`,
      fast_path_eligible: false,
      recommended_workflow_path: "full-fsm-plus-review",
    };
  }

  // --- trivial: tiny diff, few files, no code ext, no sec ----------------
  // Checked BEFORE low/medium so a 3-LOC .md-only change is classified
  // trivial even though it also matches low and medium's conditions.
  // The trivial level is the ONLY fast-path-eligible level.
  if (
    diff_loc <= RISK_THRESHOLDS.trivial_max_diff_loc &&
    files_changed <= RISK_THRESHOLDS.trivial_max_files &&
    !hasCodeExt &&
    !secKeywordMatch
  ) {
    return {
      level: "trivial",
      signals: normalized,
      reason:
        `trivial: diff_loc ${diff_loc} <= ${RISK_THRESHOLDS.trivial_max_diff_loc}, ` +
        `files_changed ${files_changed} <= ${RISK_THRESHOLDS.trivial_max_files}, ` +
        `no code extensions (${[...CODE_EXTENSIONS].join("/")}), no security keywords`,
      fast_path_eligible: true,
      recommended_workflow_path: "fast-path",
    };
  }

  // --- low: small diff, few files, no sec, no KFM -----------------------
  if (
    diff_loc <= RISK_THRESHOLDS.low_max_diff_loc &&
    files_changed <= RISK_THRESHOLDS.low_max_files &&
    !secKeywordMatch &&
    !known_failure_match
  ) {
    return {
      level: "low",
      signals: normalized,
      reason:
        `low: diff_loc ${diff_loc} <= ${RISK_THRESHOLDS.low_max_diff_loc}, ` +
        `files_changed ${files_changed} <= ${RISK_THRESHOLDS.low_max_files}, ` +
        `no security keywords, no known_failure_match`,
      fast_path_eligible: false,
      recommended_workflow_path: "full-fsm",
    };
  }

  // --- medium: default for non-critical, non-high, non-trivial, non-low -
  // By construction (after the checks above), diff_loc <= medium_max_diff_loc
  // AND files_changed <= medium_max_files AND no security keywords. This
  // is the catch-all "we have a real change but no escalators" level —
  // equivalent to the current default workflow path (full FSM).
  return {
    level: "medium",
    signals: normalized,
    reason:
      `medium: diff_loc ${diff_loc} <= ${RISK_THRESHOLDS.medium_max_diff_loc}, ` +
      `files_changed ${files_changed} <= ${RISK_THRESHOLDS.medium_max_files}, ` +
      `no security keywords`,
    fast_path_eligible: false,
    recommended_workflow_path: "full-fsm",
  };
}
