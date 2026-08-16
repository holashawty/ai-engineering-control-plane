// executor/src/project-scale-classifier.ts
//
// ADR-0027: Misclassification detector for project_scale Decision.
//
// The orchestrator's classify-goal state emits a `project_scale:small|
// medium|large` Decision based on heuristic signals (word count, --yarat
// flag, multi-platform mention). This classifier compares the predicted
// scale against the ACTUAL number of execute-workflow iterations the run
// performed, and emits a Validation if the actual count falls outside the
// expected range for the classified scale.
//
// Expected iteration ranges (per ADR-0027):
//   - small:  1 iteration    (single-workflow goal, no planning chain)
//   - medium: 1-3 iterations (requirements-gathering + execution workflow)
//   - large:  3+ iterations  (full planning chain + execution workflows)
//
// If the actual count exceeds the expected max, the scale was likely
// under-classified (a "small" goal that needed 4 iterations was probably
// "medium" or "large"). If it falls below the expected min, the scale was
// over-classified (a "large" goal that ran 1 iteration was probably
// "medium" — the planning chain was skipped).
//
// The classifier is invoked from the orchestrator's report state (after
// all iterations are done). It emits a Validation entity — a learning
// signal for future runs, NOT a hard error.
//
// This module is also unit-tested standalone (see
// executor/examples/e2e-scale-classifier/drive-run.mjs).

import { WorkflowRun } from "./run.js";

export interface ScaleRange {
  min: number;
  max: number;  // -1 means "no upper bound"
  description: string;
}

export const SCALE_RANGES: Record<string, ScaleRange> = {
  small:  { min: 1, max: 1,  description: "single-workflow goal, no planning chain" },
  medium: { min: 1, max: 3,  description: "requirements-gathering + execution workflow" },
  large:  { min: 3, max: -1, description: "full planning chain + execution workflows" },
};

export interface ClassificationResult {
  classified_scale: string | null;  // "small" | "medium" | "large" | null (if no scale Decision was emitted)
  actual_iterations: number;
  expected_range: ScaleRange | null;
  verdict: "match" | "under_classified" | "over_classified" | "no_scale_decision" | "unknown_scale";
  inferred_correct_scale: string | null;
  reason: string;
}

/**
 * Count the number of execute-workflow iterations in a run by scanning
 * the run's log for `workflow_routed:*` decisions. Each route Decision
 * corresponds to one execute-workflow iteration.
 */
export function countExecuteWorkflowIterations(run: WorkflowRun): number {
  // The log entries for evidence emission record kind="decision" — but
  // we don't have access to the Decision's `what` from the log alone.
  // Instead, we count distinct "execute-workflow" state visits in the
  // state-machine history. WorkflowRun.machine.history (if exposed)
  // gives us the transition trace.
  const history = (run.machine as unknown as { history?: Array<{ from: string; to: string; on: string }> }).history || [];
  return history.filter(h => h.to === "execute-workflow").length;
}

/**
 * Extract the classified project_scale from a run's evidence.
 * Returns:
 *   - "small" | "medium" | "large" for canonical values
 *   - "<raw-value>" for non-canonical project_scale values (e.g. "huge")
 *     — the classifier will then surface these via the "unknown_scale" verdict
 *   - null if no project_scale Decision was emitted (e.g. the run is not
 *     an orchestrator run, or it failed before classify-goal)
 *
 * NOTE: This function reads from the in-memory run, not from disk. The
 * caller must pass the Decisions that were emitted during the run.
 */
export function extractClassifiedScale(decisions: Array<{ what: string }>): string | null {
  for (const d of decisions) {
    const canonical = d.what.match(/^project_scale:(small|medium|large)$/);
    if (canonical) return canonical[1];
    const nonCanonical = d.what.match(/^project_scale:(.+)$/);
    if (nonCanonical) return nonCanonical[1];  // raw value — classifier will flag as unknown
  }
  return null;
}

/**
 * Run the misclassification analysis. Returns a ClassificationResult
 * describing whether the actual iteration count matches the expected
 * range for the classified scale.
 */
export function classifyRun(
  run: WorkflowRun,
  decisions: Array<{ what: string }>
): ClassificationResult {
  const classified = extractClassifiedScale(decisions);
  const actual = countExecuteWorkflowIterations(run);

  if (classified === null) {
    return {
      classified_scale: null,
      actual_iterations: actual,
      expected_range: null,
      verdict: "no_scale_decision",
      inferred_correct_scale: null,
      reason: "No project_scale Decision was emitted — likely this run is not an orchestrator run, or it failed before classify-goal.",
    };
  }

  const range = SCALE_RANGES[classified];
  if (!range) {
    return {
      classified_scale: classified,
      actual_iterations: actual,
      expected_range: null,
      verdict: "unknown_scale",
      inferred_correct_scale: null,
      reason: `project_scale Decision emitted unrecognized value "${classified}" — expected one of small|medium|large.`,
    };
  }

  // Check bounds
  const underMax = range.max === -1 || actual <= range.max;
  const overMin = actual >= range.min;

  if (overMin && underMax) {
    return {
      classified_scale: classified,
      actual_iterations: actual,
      expected_range: range,
      verdict: "match",
      inferred_correct_scale: null,
      reason: `Actual iteration count ${actual} falls within the expected range [${range.min}, ${range.max === -1 ? "∞" : range.max}] for scale "${classified}".`,
    };
  }

  // Mismatch — infer the correct scale
  let inferred: string | null = null;
  if (!underMax) {
    // Too many iterations for this scale — scale up
    if (classified === "small") inferred = actual <= 3 ? "medium" : "large";
    else if (classified === "medium") inferred = "large";
  } else if (!overMin) {
    // Too few iterations for this scale — scale down
    if (classified === "large") inferred = actual <= 1 ? "small" : "medium";
    else if (classified === "medium") inferred = "small";
  }

  const verdict = !underMax ? "under_classified" : "over_classified";
  const reason = !underMax
    ? `Actual iteration count ${actual} exceeds the expected max ${range.max} for scale "${classified}" — the goal was likely ${inferred ? `"${inferred}"` : "larger"} than classified.`
    : `Actual iteration count ${actual} is below the expected min ${range.min} for scale "${classified}" — the goal was likely ${inferred ? `"${inferred}"` : "smaller"} than classified, or planning phases were skipped.`;

  return {
    classified_scale: classified,
    actual_iterations: actual,
    expected_range: range,
    verdict,
    inferred_correct_scale: inferred,
    reason,
  };
}

/**
 * Construct a Validation entity from a ClassificationResult. The
 * Validation references no expected_ref/actual_ref (it's a meta-check
 * on the run, not a contract verification) — `method: scale_classification_review`.
 */
export function buildValidation(result: ClassificationResult): {
  id: string;
  schema_version: string;
  expected_ref: string;
  actual_ref: string;
  result: "match" | "mismatch";
  method: string;
  notes?: string;
} {
  const isMatch = result.verdict === "match" || result.verdict === "no_scale_decision" || result.verdict === "unknown_scale";
  const inferred = result.inferred_correct_scale ? `; inferred_correct_scale: ${result.inferred_correct_scale}` : "";
  return {
    id: `validation-scale-classification-${Date.now()}`,
    schema_version: "1.0.0",
    expected_ref: `decision:project_scale:${result.classified_scale ?? "none"}`,
    actual_ref: `run:execute-workflow-iterations:${result.actual_iterations}`,
    result: isMatch ? "match" : "mismatch",
    method: "scale_classification_review",
    notes: `${result.reason}${inferred}`,
  };
}
