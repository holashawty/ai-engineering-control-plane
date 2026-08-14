import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { syncAll, loadCanonicalSources } from "./sync-entrypoints.js";
import { claudeCodeAdapter } from "./claude-code/adapter.js";
import { codexAdapter } from "./codex/adapter.js";
import { chatAdapter } from "./chat/adapter.js";
import { chatSandboxAdapter } from "./chat-sandbox/adapter.js";

const AjvCtor = Ajv2020 as unknown as new (opts?: object) => import("ajv").default;
const addFormatsFn = addFormats as unknown as (ajv: import("ajv").default) => void;

const __dirname = dirname(fileURLToPath(import.meta.url));
// This package lives at adapters/agents/ — repo root is 2 levels up.
const REPO_ROOT = join(__dirname, "..", "..", "..");

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  OK   ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}`);
    failed++;
  }
}

function scenarioLoadCanonical() {
  console.log("\n=== Scenario 1: load canonical sources from this repo ===");
  const canonical = loadCanonicalSources(REPO_ROOT);
  check("agents/AGENTS.md content loaded, non-empty", canonical.agentsMdContent.length > 100);
  // The 4 MVP skills (ADR-0016) must always be present; additional skills
  // (refactor, code-review, specification, implementation, documentation,
  // tool-use-discipline, recency-verification, quality-gate,
  // behavioral-simulation, diverse-thinking, project-onboarding, regression,
  // performance-problem, ...) may be present as the catalog grows. The
  // test verifies the MVP set is a subset, not an exact match, so adding
  // new skills does not break this self-test.
  const MVP_SKILL_NAMES = ["behavioral-verification", "evidence-engineering", "systematic-debugging", "testing"];
  const discoveredNames = new Set(canonical.skills.map((s) => s.name));
  check(`at least the 4 MVP skills discovered (found ${canonical.skills.length} total)`, canonical.skills.length >= 4);
  check(
    "all 4 MVP skill names are present in the discovered set",
    MVP_SKILL_NAMES.every((name) => discoveredNames.has(name))
  );
}

function scenarioRenderAndIdempotency() {
  console.log("\n=== Scenario 2: render entrypoints + idempotency (ADR-0006) ===");
  const canonical = loadCanonicalSources(REPO_ROOT);

  const claudeFiles1 = claudeCodeAdapter.renderEntrypoint(canonical);
  const claudeFiles2 = claudeCodeAdapter.renderEntrypoint(canonical);
  check("Claude Code adapter renders CLAUDE.md", claudeFiles1[0]?.path === "CLAUDE.md");
  check(
    "Claude Code render is idempotent (byte-identical on repeat run)",
    claudeFiles1[0]?.content === claudeFiles2[0]?.content
  );
  check(
    "CLAUDE.md includes canonical AGENTS.md content verbatim",
    claudeFiles1[0]?.content.includes(canonical.agentsMdContent)
  );
  check(
    "CLAUDE.md lists all 4 skills by name",
    canonical.skills.every((s) => claudeFiles1[0]?.content.includes(s.name))
  );

  const codexFiles1 = codexAdapter.renderEntrypoint(canonical);
  const codexFiles2 = codexAdapter.renderEntrypoint(canonical);
  check("Codex adapter renders AGENTS.md (native filename, not CLAUDE.md)", codexFiles1[0]?.path === "AGENTS.md");
  check(
    "Codex render is idempotent (byte-identical on repeat run)",
    codexFiles1[0]?.content === codexFiles2[0]?.content
  );
}

function scenarioCapabilitiesDiffer() {
  console.log("\n=== Scenario 3: adapters declare distinct, real capabilities ===");
  const claude = claudeCodeAdapter.capabilities();
  const codex = codexAdapter.capabilities();
  const chat = chatAdapter.capabilities();
  const chatSandbox = chatSandboxAdapter.capabilities();

  check("Claude Code declares full native_skills support", claude.native_skills === true);
  check("Codex declares partial native_skills support", codex.native_skills === "partial");
  check("Claude Code declares browser capability", claude.browser === true);
  check("Codex declares no browser capability", codex.browser === false);
  check("both declare filesystem + shell + test_runner", claude.filesystem_read && claude.shell_exec && claude.test_runner && codex.filesystem_read && codex.shell_exec && codex.test_runner);

  // ADR-0020: chat LLMs split into pure-text and sandbox variants.
  check("chat (pure-text) declares all capabilities false", !chat.filesystem_read && !chat.filesystem_write && !chat.shell_exec && !chat.test_runner && !chat.browser && !chat.mcp && !chat.native_skills && chat.sandboxed_code_execution === false);
  check("chat-sandbox declares sandboxed_code_execution=true", chatSandbox.sandboxed_code_execution === true);
  check("chat-sandbox declares filesystem_read=true (within sandbox)", chatSandbox.filesystem_read === true);
  check("chat-sandbox declares filesystem_write=true (within sandbox)", chatSandbox.filesystem_write === true);
  check("chat-sandbox declares shell_exec=true (within sandbox)", chatSandbox.shell_exec === true);
  check("chat-sandbox declares test_runner=true (within sandbox)", chatSandbox.test_runner === true);
  check("chat-sandbox declares native_skills=false (still must read SKILL.md via shell)", chatSandbox.native_skills === false);
  check("chat and chat-sandbox have distinct ids", chatAdapter.id === "chat" && chatSandboxAdapter.id === "chat-sandbox");
}

function scenarioTranslateObservation() {
  console.log("\n=== Scenario 4: translateObservation produces schema-valid Events ===");
  const schemaPath = join(REPO_ROOT, "evidence", "schema", "event.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  const ajv = new AjvCtor({ strict: false, allErrors: true });
  addFormatsFn(ajv);
  const validate = ajv.compile(schema);

  const rawObs = {
    raw: { tool: "bash_tool", command: "pytest", api_key: "sk-should-be-redacted" },
    timestamp: new Date().toISOString(),
    traceRef: "trace-repro-1",
    source: "run-1",
  };

  const claudeEvent = claudeCodeAdapter.translateObservation(rawObs);
  const codexEvent = codexAdapter.translateObservation(rawObs);

  check("Claude Code translateObservation output validates against event.schema.json", validate(claudeEvent) === true);
  check("Codex translateObservation output validates against event.schema.json", validate(codexEvent) === true);

  const claudePayload = claudeEvent.payload as Record<string, unknown>;
  const codexPayload = codexEvent.payload as Record<string, unknown>;
  check("Claude Code adapter redacted the api_key in payload", claudePayload.api_key === "[redacted]");
  check("Codex adapter redacted the api_key in payload", codexPayload.api_key === "[redacted]");
  check("Claude Code adapter did not redact the non-sensitive command field", claudePayload.command === "pytest");
}

async function selfTest() {
  console.log("=== agent-adapters self-test ===");
  scenarioLoadCanonical();
  scenarioRenderAndIdempotency();
  scenarioCapabilitiesDiffer();
  scenarioTranslateObservation();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.error("SELF-TEST FAILED");
    process.exit(1);
  }
  console.log("SELF-TEST PASSED");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    await selfTest();
    return;
  }
  console.log(
    "aiecp-sync-entrypoints: use { syncAll } from sync-entrypoints.js in a " +
      "host project's own tooling to generate CLAUDE.md/AGENTS.md from " +
      "this framework's canonical agents/AGENTS.md + skills/. Use " +
      "--self-test to verify the adapters themselves against this repo."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
