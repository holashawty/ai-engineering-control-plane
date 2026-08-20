import { RiskLevel } from "./risk-classifier.js";

export type VerificationTierName =
  | "TIER_1_UNIT_FAST"
  | "TIER_2_CONTRACT_INTEGRATION"
  | "TIER_3_BROWSER_FUZZ_REPLAY"
  | "TIER_4_FULL_AUDIT_SHADOW";

export interface VerificationTier {
  tier: VerificationTierName;
  riskLevel: RiskLevel;
  requiredVerifiers: string[];
  maxTokenBudget: number;
  maxDurationSeconds: number;
  requiresHumanSignoff: boolean;
}

export interface BudgetCostReport {
  withinBudget: boolean;
  actualTokens: number;
  budgetTokens: number;
  actualDurationSec: number;
  budgetDurationSec: number;
  tokenSavings: number;
}

/**
 * Verification Budget Engine (ADR-0044)
 *
 * Dynamically balances testing rigor vs execution cost/latency based on task risk.
 * Prevents running 1000+ iterations of expensive browser/fuzz testing on trivial edits,
 * while strictly enforcing multi-layer validation (integration, replay, browser) on high-risk changes.
 */
export class VerificationBudgetEngine {
  /**
   * Derives the optimal verification plan for a given risk level.
   */
  determinePlan(risk: RiskLevel, maxBudgetOverride?: number): VerificationTier {
    switch (risk) {
      case "trivial":
        return {
          tier: "TIER_1_UNIT_FAST",
          riskLevel: "trivial",
          requiredVerifiers: ["unit_test", "lint_check"],
          maxTokenBudget: maxBudgetOverride ?? 5000,
          maxDurationSeconds: 15,
          requiresHumanSignoff: false,
        };

      case "low":
        return {
          tier: "TIER_1_UNIT_FAST",
          riskLevel: "low",
          requiredVerifiers: ["unit_test", "type_check", "ast_blast_radius"],
          maxTokenBudget: maxBudgetOverride ?? 15000,
          maxDurationSeconds: 30,
          requiresHumanSignoff: false,
        };

      case "medium":
        return {
          tier: "TIER_2_CONTRACT_INTEGRATION",
          riskLevel: "medium",
          requiredVerifiers: ["unit_test", "contract_test", "integration_test", "fuzz_property_light"],
          maxTokenBudget: maxBudgetOverride ?? 40000,
          maxDurationSeconds: 90,
          requiresHumanSignoff: false,
        };

      case "high":
        return {
          tier: "TIER_3_BROWSER_FUZZ_REPLAY",
          riskLevel: "high",
          requiredVerifiers: [
            "unit_test",
            "contract_test",
            "integration_test",
            "browser_headless_verifier",
            "fuzz_property_deep",
            "replay_comparison",
          ],
          maxTokenBudget: maxBudgetOverride ?? 100000,
          maxDurationSeconds: 240,
          requiresHumanSignoff: true,
        };

      case "critical":
      default:
        return {
          tier: "TIER_4_FULL_AUDIT_SHADOW",
          riskLevel: "critical",
          requiredVerifiers: [
            "unit_test",
            "contract_test",
            "integration_test",
            "browser_headless_verifier",
            "fuzz_property_deep",
            "replay_comparison",
            "security_secret_audit",
            "human_approval_gate",
          ],
          maxTokenBudget: maxBudgetOverride ?? 250000,
          maxDurationSeconds: 600,
          requiresHumanSignoff: true,
        };
    }
  }

  /**
   * Assesses actual resource consumption against the allocated verification budget.
   */
  evaluateCost(
    actualTokens: number,
    actualDurationSec: number,
    plan: VerificationTier
  ): BudgetCostReport {
    const withinBudget =
      actualTokens <= plan.maxTokenBudget && actualDurationSec <= plan.maxDurationSeconds;
    const tokenSavings = Math.max(0, plan.maxTokenBudget - actualTokens);

    return {
      withinBudget,
      actualTokens,
      budgetTokens: plan.maxTokenBudget,
      actualDurationSec,
      budgetDurationSec: plan.maxDurationSeconds,
      tokenSavings,
    };
  }
}

/**
 * Built-in self test
 */
export function runVerificationBudgetSelfTest(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean) {
    if (condition) {
      console.log(`  OK   ${name}`);
      passed++;
    } else {
      console.error(`  FAIL ${name}`);
      failed++;
    }
  }

  console.log("=== VerificationBudgetEngine self-test (ADR-0044) ===");
  const engine = new VerificationBudgetEngine();

  // 1. Trivial risk routes to fast unit tier without human gate
  const trivialPlan = engine.determinePlan("trivial");
  assert("trivial is TIER_1_UNIT_FAST", trivialPlan.tier === "TIER_1_UNIT_FAST");
  assert("trivial does not require human signoff", !trivialPlan.requiresHumanSignoff);

  // 2. High risk includes browser verifier & replay
  const highPlan = engine.determinePlan("high");
  assert("high is TIER_3_BROWSER_FUZZ_REPLAY", highPlan.tier === "TIER_3_BROWSER_FUZZ_REPLAY");
  assert("high requires browser verifier", highPlan.requiredVerifiers.includes("browser_headless_verifier"));
  assert("high requires human signoff", highPlan.requiresHumanSignoff);

  // 3. Cost evaluation
  const cost = engine.evaluateCost(4000, 5, trivialPlan);
  assert("cost within budget", cost.withinBudget === true);
  assert("token savings computed", cost.tokenSavings === 1000);

  console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
