// Small, mechanical disk-writing wrapper around sync-entrypoints.ts's
// syncAll(). Usage: node dist/bin/write-entrypoints.js <sourceRepoRoot> <targetRepoRoot> [adapterIds...]
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { syncAll } from "../sync-entrypoints.js";
import { claudeCodeAdapter } from "../claude-code/adapter.js";
import { codexAdapter } from "../codex/adapter.js";
import { chatAdapter } from "../chat/adapter.js";
import { chatSandboxAdapter } from "../chat-sandbox/adapter.js";

const ADAPTERS = {
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
  chat: chatAdapter,
  "chat-sandbox": chatSandboxAdapter,
};

async function main() {
  const [sourceRoot, targetRoot, ...ids] = process.argv.slice(2);
  if (!sourceRoot || !targetRoot) {
    console.error("Usage: write-entrypoints <sourceRepoRoot> <targetRepoRoot> [claude-code] [codex] [chat] [chat-sandbox]");
    process.exit(1);
  }
  // Default: claude-code + codex only (the CLI agents that natively
  // read CLAUDE.md / AGENTS.md). Chat adapters are opt-in because
  // their entrypoints (CHAT-ENTRYPOINT.md, CHAT-ENTRYPOINT-SANDBOX.md)
  // may conflict with hand-authored versions at repo root.
  const defaultIds = ["claude-code", "codex"];
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
