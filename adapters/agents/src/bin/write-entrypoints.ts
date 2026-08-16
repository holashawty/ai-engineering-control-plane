// Small, mechanical disk-writing wrapper around sync-entrypoints.ts's
// syncAll(). Usage: node dist/bin/write-entrypoints.js <sourceRepoRoot> <targetRepoRoot> [adapterIds...]
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { syncAll } from "../sync-entrypoints.js";
import { claudeCodeAdapter } from "../claude-code/adapter.js";
import { codexAdapter } from "../codex/adapter.js";
import { chatAdapter } from "../chat/adapter.js";
import { chatSandboxAdapter } from "../chat-sandbox/adapter.js";
import { mcpAdapter } from "../mcp/adapter.js";

const ADAPTERS = {
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
  chat: chatAdapter,
  "chat-sandbox": chatSandboxAdapter,
  mcp: mcpAdapter,
};

async function main() {
  const [sourceRoot, targetRoot, ...ids] = process.argv.slice(2);
  if (!sourceRoot || !targetRoot) {
    console.error("Usage: write-entrypoints <sourceRepoRoot> <targetRepoRoot> [claude-code] [codex] [chat] [chat-sandbox] [mcp]");
    process.exit(1);
  }
  // Default: claude-code + codex + chat-sandbox + mcp.
  // - claude-code → CLAUDE.md (CLI agent)
  // - codex → AGENTS.md (CLI agent)
  // - chat-sandbox → CHAT-ENTRYPOINT-SANDBOX.md (chat LLM with sandbox)
  // - mcp → MCP-ENTRYPOINT.md (MCP-connected agent)
  // 
  // The `chat` adapter is EXCLUDED from default because the repo ships
  // a hand-authored CHAT-ENTRYPOINT.md (1075 lines, with worked examples,
  // stuck-pattern style switches, and detailed protocol reference) that
  // is the canonical source for chat LLMs without sandbox. Running
  // sync-entrypoints with `chat` explicitly WILL overwrite that hand-
  // authored file with the generated minimal version. To regenerate
  // CHAT-ENTRYPOINT.md from the adapter, run:
  //   node adapters/agents/dist/bin/write-entrypoints.js . . chat
  // (audit finding H4 2026-08-16: previously chat was default, but its
  // generated output clobbered the hand-authored version on every run).
  const defaultIds = ["claude-code", "codex", "chat-sandbox", "mcp"];
  const selectedIds = ids.length ? ids : defaultIds;
  const selected = selectedIds
    .map((id) => ADAPTERS[id as keyof typeof ADAPTERS])
    .filter(Boolean);

  if (selected.length === 0) {
    console.error(`No matching adapters. Valid: ${Object.keys(ADAPTERS).join(", ")}`);
    process.exit(1);
  }

  const rendered = syncAll(sourceRoot, selected);
  for (const [adapterId, files] of Object.entries(rendered)) {
    for (const file of files) {
      const outPath = join(targetRoot, file.path);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, file.content);
      console.log(`[${adapterId}] wrote ${outPath}`);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
