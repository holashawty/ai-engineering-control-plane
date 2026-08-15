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
import { mcpAdapter } from "./mcp/adapter.js";

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
  const mcp = mcpAdapter.capabilities();

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

  // MCP adapter: real host capabilities mediated by MCP servers.
  // Distinct from chat-sandbox (which is sandboxed/ephemeral) and
  // from claude-code/codex (which are vendor CLI adapters).
  check("MCP adapter declares filesystem_read=true (via file server)", mcp.filesystem_read === true);
  check("MCP adapter declares filesystem_write=true (via file server)", mcp.filesystem_write === true);
  check("MCP adapter declares shell_exec=true (via shell server)", mcp.shell_exec === true);
  check("MCP adapter declares test_runner=true (via test-runner server)", mcp.test_runner === true);
  check("MCP adapter declares native_skills=true (reads SKILL.md via file server)", mcp.native_skills === true);
  check("MCP adapter declares browser=false (MCP does not standardize browser access)", mcp.browser === false);
  check("MCP adapter declares mcp=true (the defining capability)", mcp.mcp === true);
  check("MCP adapter declares sandboxed_code_execution=false (real host, not sandbox)", mcp.sandboxed_code_execution === false);
  check("MCP adapter id is 'mcp'", mcpAdapter.id === "mcp");
  check("MCP and chat-sandbox have distinct sandbox flags", mcp.sandboxed_code_execution === false && chatSandbox.sandboxed_code_execution === true);
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

  // MCP adapter: translateObservation must prefix `source` with `mcp:`
  // and extract the server name from `raw.server` (preferred) or
  // `raw.server_name`, falling back to the tool name. Test all three
  // extraction paths plus a tool-only observation (no explicit server
  // field) to confirm the fallback works.
  const mcpObsWithServer = {
    raw: {
      tool: "read_file",
      server: "filesystem",
      path: "/repo/agents/AGENTS.md",
      api_key: "sk-should-be-redacted",
    },
    timestamp: new Date().toISOString(),
    traceRef: "trace-mcp-1",
    source: "mcp-run-1",
  };
  const mcpObsWithServerName = {
    raw: {
      tool: "run_command",
      server_name: "shell",
      command: "pytest",
      api_key: "sk-should-be-redacted",
    },
    timestamp: new Date().toISOString(),
    traceRef: "trace-mcp-2",
    source: "mcp-run-2",
  };
  const mcpObsToolOnly = {
    raw: {
      tool: "filesystem", // no explicit server field; tool name falls back as server
      command: "ls",
    },
    timestamp: new Date().toISOString(),
    traceRef: "trace-mcp-3",
    source: "mcp-run-3",
  };

  const mcpEvent1 = mcpAdapter.translateObservation(mcpObsWithServer);
  const mcpEvent2 = mcpAdapter.translateObservation(mcpObsWithServerName);
  const mcpEvent3 = mcpAdapter.translateObservation(mcpObsToolOnly);

  check("MCP translateObservation output (with raw.server) validates against event.schema.json", validate(mcpEvent1) === true);
  check("MCP translateObservation output (with raw.server_name) validates against event.schema.json", validate(mcpEvent2) === true);
  check("MCP translateObservation output (tool-only, no explicit server) validates against event.schema.json", validate(mcpEvent3) === true);

  check("MCP adapter prefixes source with 'mcp:' (raw.server path)", mcpEvent1.source === "mcp:filesystem");
  check("MCP adapter prefixes source with 'mcp:' (raw.server_name path)", mcpEvent2.source === "mcp:shell");
  check("MCP adapter falls back to tool name as server name when no explicit server field present", mcpEvent3.source === "mcp:filesystem");

  // Server-name-based kind mapping: filesystem server + read tool → observation.
  check("MCP adapter maps filesystem-server read to kind 'observation'", mcpEvent1.kind === "observation");
  // shell server + run_command → action.
  check("MCP adapter maps shell-server run to kind 'action'", mcpEvent2.kind === "action");

  const mcpPayload1 = mcpEvent1.payload as Record<string, unknown>;
  const mcpPayload2 = mcpEvent2.payload as Record<string, unknown>;
  check("MCP adapter redacted the api_key in payload (filesystem server)", mcpPayload1.api_key === "[redacted]");
  check("MCP adapter redacted the api_key in payload (shell server)", mcpPayload2.api_key === "[redacted]");
  check("MCP adapter did not redact the non-sensitive path field", mcpPayload1.path === "/repo/agents/AGENTS.md");
  check("MCP adapter did not redact the non-sensitive command field (shell server)", mcpPayload2.command === "pytest");
}

function scenarioMCPEntrypoint() {
  console.log("\n=== Scenario 5: MCP adapter renders MCP-ENTRYPOINT.md (ADR-0006) ===");
  const canonical = loadCanonicalSources(REPO_ROOT);

  const mcpFiles1 = mcpAdapter.renderEntrypoint(canonical);
  const mcpFiles2 = mcpAdapter.renderEntrypoint(canonical);
  check("MCP adapter renders MCP-ENTRYPOINT.md (not CLAUDE.md / AGENTS.md)", mcpFiles1[0]?.path === "MCP-ENTRYPOINT.md");
  check(
    "MCP render is idempotent (byte-identical on repeat run)",
    mcpFiles1[0]?.content === mcpFiles2[0]?.content
  );
  check(
    "MCP-ENTRYPOINT.md includes canonical AGENTS.md content verbatim",
    mcpFiles1[0]?.content.includes(canonical.agentsMdContent)
  );
  check(
    "MCP-ENTRYPOINT.md lists all skills by name",
    canonical.skills.every((s) => mcpFiles1[0]?.content.includes(s.name))
  );
  check(
    "MCP-ENTRYPOINT.md includes 30-second orientation section",
    mcpFiles1[0]?.content.includes("The 30-second version")
  );
  check(
    "MCP-ENTRYPOINT.md includes MCP server discovery section",
    mcpFiles1[0]?.content.includes("MCP server discovery")
  );
  check(
    "MCP-ENTRYPOINT.md includes evidence protocol section",
    mcpFiles1[0]?.content.includes("Evidence protocol")
  );
  check(
    "MCP-ENTRYPOINT.md includes tool integration table mapping capabilities to MCP servers",
    mcpFiles1[0]?.content.includes("Tool integration section")
  );
  check(
    "MCP-ENTRYPOINT.md emphasizes safety-gate confirmation (real host mutations)",
    mcpFiles1[0]?.content.includes("aiecp:confirm")
  );
}

async function selfTest() {
  console.log("=== agent-adapters self-test ===");
  scenarioLoadCanonical();
  scenarioRenderAndIdempotency();
  scenarioCapabilitiesDiffer();
  scenarioTranslateObservation();
  scenarioMCPEntrypoint();

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
