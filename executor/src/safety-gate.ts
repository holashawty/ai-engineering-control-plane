import { AutonomyPolicy, WorkflowViolation } from "./types.js";

export type GateDecision = "allowed" | "requires-confirmation" | "denied";

/**
 * Checks a capability against an AutonomyPolicy (constitution/
 * autonomy-policy.schema.json shape). Per docs/security-model.md and
 * constitution/constitution.md §3: a capability set to "deny" can never
 * be exercised, regardless of the workflow's declared autonomy level.
 */
export function checkCapability(
  policy: AutonomyPolicy,
  capability: string
): GateDecision {
  const grant = policy.allow[capability];

  if (grant === undefined) {
    // Unknown capability, not declared at all — fail safe.
    return "requires-confirmation";
  }
  if (grant === true) return "allowed";
  if (grant === false || grant === "deny") return "denied";
  if (grant === "ask") return "requires-confirmation";
  if (grant === "scoped") return "requires-confirmation"; // scoped grants still need explicit confirmation of scope at this layer
  return "requires-confirmation";
}

/**
 * Called by the executor immediately before a transition annotated with
 * a safety_gate in the workflow definition (e.g. apply-fix -> edit_source).
 * Throws if denied; the caller (run.ts) is responsible for surfacing
 * "requires-confirmation" to whoever is driving the run rather than
 * silently proceeding.
 */
export function enforceGate(
  policy: AutonomyPolicy,
  gateName: string,
  capability: string
): GateDecision {
  const decision = checkCapability(policy, capability);
  if (decision === "denied") {
    throw new WorkflowViolation(
      `safety gate "${gateName}" denied: capability "${capability}" is ` +
        `set to deny in the active autonomy policy`,
      "safety-gate-denied"
    );
  }
  return decision;
}
