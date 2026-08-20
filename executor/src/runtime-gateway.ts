import { createHash } from "node:crypto";
import { AutonomyPolicy, DEFAULT_AUTONOMY_POLICY, WorkflowViolation } from "./types.js";
import { checkCapability, GateDecision } from "./safety-gate.js";

export type ToolKind =
  | "filesystem_read"
  | "filesystem_write"
  | "shell_exec"
  | "db_mutation"
  | "git_push"
  | "network_egress"
  | "secret_access";

export interface AgentToolAction {
  tool: ToolKind;
  target: string;
  intent: string;
  payload?: Record<string, unknown>;
  actor?: string;
}

export type GatewayDecision =
  | "ALLOW"
  | "BLOCKED"
  | "REQUIRE_CONFIRMATION"
  | "REQUIRE_HUMAN_APPROVAL";

export interface EvaluationResult {
  decision: GatewayDecision;
  reason: string;
  capability: string;
  tool: ToolKind;
  target: string;
  auditHash: string;
  timestamp: string;
}

export interface GatewayContext {
  workflowState: string;
  confirmationToken?: string;
  humanApprovalToken?: string;
  broadRefactorLines?: number;
}

// Robust Regex-based security patterns (prevents trivial whitespace/flag reordering bypasses)
const DESTRUCTIVE_SHELL_REGEX =
  /\brm\s+.*(-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*|--recursive\s+--force|--force\s+--recursive)\s+(\/|[a-z]:\\|\*|\.\/|\.\.)/i;
const DISK_FORMAT_REGEX = /\b(format\s+[a-z]:|mkfs(\.[a-z0-9]+)?\b|dd\s+if=)/i;
const DB_DROP_REGEX = /\b(drop\s+(database|schema|table)|truncate\s+table)\b/i;
const FORCE_PUSH_REGEX = /\bgit\s+push\s+.*(-f\b|--force\b|--force-with-lease\b|\+[a-z0-9_/-]+)/i;
const DEPLOY_CMD_REGEX = /\b(terraform\s+apply|kubectl\s+apply|helm\s+upgrade|npm\s+publish|aws\s+s3\s+sync)\b/i;
const SECRET_FILE_REGEX = /(\.env($|\.)|id_rsa|id_ecdsa|id_ed25519|\.pem$|\.key$|\/etc\/(shadow|passwd)|credentials\.json)/i;

/**
 * Hardened Runtime Policy Gateway (ADR-0043 / ADR-0044)
 *
 * Physically enforces safety gates, constitutional invariants (§3, §8),
 * and autonomy boundaries before any tool action is executed on the host
 * or within a sandbox. Provides cryptographic Merkle hash-chain verification.
 */
export class RuntimePolicyGateway {
  private readonly policy: AutonomyPolicy;
  private readonly auditLog: EvaluationResult[] = [];

  constructor(policy: AutonomyPolicy = DEFAULT_AUTONOMY_POLICY) {
    this.policy = policy;
  }

  getAuditLog(): readonly EvaluationResult[] {
    return this.auditLog;
  }

  /**
   * Evaluates an agent tool action against active policies and context.
   */
  evaluate(action: AgentToolAction, ctx: GatewayContext): EvaluationResult {
    const ts = new Date().toISOString();
    let decision: GatewayDecision = "ALLOW";
    let reason = "Action complies with autonomy policy";
    let capability = "edit_source";

    // 1. Secret Access Interception
    if (action.tool === "secret_access" || SECRET_FILE_REGEX.test(action.target)) {
      decision = "BLOCKED";
      capability = "credential_access";
      reason = `Direct access to secret or credential path "${action.target}" is forbidden`;
    }

    // 2. Shell Command Hardened Interception
    else if (action.tool === "shell_exec") {
      const cmd = action.target.trim();

      if (DESTRUCTIVE_SHELL_REGEX.test(cmd) || DISK_FORMAT_REGEX.test(cmd) || DB_DROP_REGEX.test(cmd)) {
        decision = "BLOCKED";
        capability = "destructive_command";
        reason = `Destructive command rejected by constitutional safety policy: ${cmd}`;
      } else if (FORCE_PUSH_REGEX.test(cmd)) {
        decision = "BLOCKED";
        capability = "destructive_command";
        reason = `Force-pushing is strictly forbidden by constitutional policy: ${cmd}`;
      } else if (DEPLOY_CMD_REGEX.test(cmd) || /\bgit\s+push\b/i.test(cmd)) {
        capability = "human_approval";
        decision = ctx.humanApprovalToken ? "ALLOW" : "REQUIRE_HUMAN_APPROVAL";
        reason = `Deployment or remote push "${cmd}" requires explicit human approval out-of-band`;
      }
    }

    // 3. Database Mutation
    else if (action.tool === "db_mutation" || DB_DROP_REGEX.test(action.target)) {
      capability = "production_mutation";
      if (!ctx.humanApprovalToken) {
        decision = "REQUIRE_HUMAN_APPROVAL";
        reason = "Database schema/data mutations require explicit human approval";
      }
    }

    // 4. Filesystem Write & Broad Refactor Check
    else if (action.tool === "filesystem_write") {
      capability = "edit_source";
      const isSensitivePath =
        action.target.startsWith("constitution/") ||
        action.target.endsWith(".env") ||
        action.target === "DECISIONS.md";

      const thresholdLoc =
        typeof this.policy.broad_refactor_threshold === "number"
          ? this.policy.broad_refactor_threshold
          : (this.policy.broad_refactor_threshold as any)?.max_loc ?? 50;

      if (isSensitivePath && !ctx.humanApprovalToken && !ctx.confirmationToken) {
        decision = "REQUIRE_CONFIRMATION";
        reason = `Modification to sensitive path "${action.target}" requires confirmation`;
      } else if (ctx.broadRefactorLines && ctx.broadRefactorLines > thresholdLoc) {
        if (!ctx.confirmationToken && !ctx.humanApprovalToken) {
          decision = "REQUIRE_CONFIRMATION";
          reason = `Refactor size (${ctx.broadRefactorLines} lines) exceeds threshold (${thresholdLoc})`;
        }
      }
    }

    // 5. Cross-reference AutonomyPolicy capabilities
    if (decision === "ALLOW") {
      const capCheck: GateDecision = checkCapability(this.policy, capability);
      if (capCheck === "denied") {
        decision = "BLOCKED";
        reason = `Capability "${capability}" is set to deny in active policy`;
      } else if (capCheck === "requires-confirmation" && !ctx.confirmationToken && !ctx.humanApprovalToken) {
        decision = "REQUIRE_CONFIRMATION";
        reason = `Capability "${capability}" requires explicit confirmation token`;
      }
    }

    // Cryptographic Hash Chaining (prevHash -> currentHash)
    const prevHash =
      this.auditLog.length > 0
        ? this.auditLog[this.auditLog.length - 1].auditHash
        : "0000000000000000";

    const auditHash = createHash("sha256")
      .update(`${prevHash}|${ts}|${action.tool}|${action.target}|${decision}|${reason}`)
      .digest("hex")
      .slice(0, 16);

    const result: EvaluationResult = {
      decision,
      reason,
      capability,
      tool: action.tool,
      target: action.target,
      auditHash,
      timestamp: ts,
    };

    this.auditLog.push(result);
    return result;
  }

  /**
   * Cryptographically verifies the tamper-evident hash chain of all audit entries.
   * Returns false if any audit entry has been altered, deleted, or reordered.
   */
  verifyAuditChain(): boolean {
    let prev = "0000000000000000";
    for (const entry of this.auditLog) {
      const expected = createHash("sha256")
        .update(`${prev}|${entry.timestamp}|${entry.tool}|${entry.target}|${entry.decision}|${entry.reason}`)
        .digest("hex")
        .slice(0, 16);

      if (entry.auditHash !== expected) {
        return false;
      }
      prev = entry.auditHash;
    }
    return true;
  }

  /**
   * Executes a guarded tool action, throwing WorkflowViolation if blocked or unconfirmed.
   */
  executeGuarded<T>(
    action: AgentToolAction,
    ctx: GatewayContext,
    executorFn: () => T
  ): T {
    const evalResult = this.evaluate(action, ctx);

    if (evalResult.decision === "BLOCKED") {
      throw new WorkflowViolation(
        `Runtime Gateway BLOCKED action: ${evalResult.reason}`,
        "runtime-gateway-blocked"
      );
    }

    if (evalResult.decision === "REQUIRE_HUMAN_APPROVAL") {
      throw new WorkflowViolation(
        `Runtime Gateway requires HUMAN APPROVAL: ${evalResult.reason}`,
        "safety-gate-needs-human-approval"
      );
    }

    if (evalResult.decision === "REQUIRE_CONFIRMATION") {
      throw new WorkflowViolation(
        `Runtime Gateway requires CONFIRMATION: ${evalResult.reason}`,
        "safety-gate-needs-confirmation"
      );
    }

    return executorFn();
  }
}

/**
 * Built-in self test
 */
export function runGatewaySelfTest(): { passed: number; failed: number } {
  const gateway = new RuntimePolicyGateway(DEFAULT_AUTONOMY_POLICY);
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

  console.log("=== RuntimePolicyGateway self-test (ADR-0043 / ADR-0044) ===");

  // 1. Destructive shell commands with variations (spaces, flags) must be BLOCKED
  const blockResult1 = gateway.evaluate(
    { tool: "shell_exec", target: "rm   -rf   /var/data", intent: "delete system" },
    { workflowState: "propose-fix" }
  );
  assert("destructive rm -rf with spaces is BLOCKED", blockResult1.decision === "BLOCKED");

  const blockResult2 = gateway.evaluate(
    { tool: "shell_exec", target: "git   push   origin   -f", intent: "force push variation" },
    { workflowState: "release" }
  );
  assert("force push with -f is BLOCKED", blockResult2.decision === "BLOCKED");

  // 2. Sensitive constitution edits require confirmation
  const sensResult = gateway.evaluate(
    { tool: "filesystem_write", target: "constitution/constitution.md", intent: "modify rules" },
    { workflowState: "implement" }
  );
  assert("constitution edit requires confirmation", sensResult.decision === "REQUIRE_CONFIRMATION");

  // 3. Sensitive edit with confirmation token is ALLOWED
  const confirmedResult = gateway.evaluate(
    { tool: "filesystem_write", target: "constitution/constitution.md", intent: "modify rules" },
    { workflowState: "implement", confirmationToken: "aiecp:confirm" }
  );
  assert("constitution edit with token is ALLOWED", confirmedResult.decision === "ALLOW");

  // 4. Secret access is BLOCKED
  const secretResult = gateway.evaluate(
    { tool: "secret_access", target: "/etc/shadow", intent: "read secrets" },
    { workflowState: "classify" }
  );
  assert("secret access is BLOCKED", secretResult.decision === "BLOCKED");

  // 5. Cryptographic audit chain verification
  assert("audit chain is cryptographically valid", gateway.verifyAuditChain() === true);

  // 6. Tampering test: modify an audit entry and assert chain verification FAILS
  const logs = gateway.getAuditLog() as EvaluationResult[];
  const originalReason = logs[0].reason;
  logs[0].reason = "Tampered reason by attacker";
  assert("tampered audit chain is detected and returns FALSE", gateway.verifyAuditChain() === false);
  logs[0].reason = originalReason; // restore

  console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
