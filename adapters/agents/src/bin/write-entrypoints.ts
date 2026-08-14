// Small, mechanical disk-writing wrapper around sync-entrypoints.ts's
// syncAll(). Usage: node dist/bin/write-entrypoints.js <sourceRepoRoot> <targetRepoRoot> [adapterIds...]
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { syncAll } from "../sync-entrypoints.js";
import { claudeCodeAdapter } from "../claude-code/adapter.js";
import { codexAdapter } from "../codex/adapter.js";

const ADAPTERS = { "claude-code": claudeCodeAdapter, codex: codexAdapter };

async function main() {
  const [sourceRoot, targetRoot, ...ids] = process.argv.slice(2);
  if (!sourceRoot || !targetRoot) {
    console.error("Usage: write-entrypoints <sourceRepoRoot> <targetRepoRoot> [claude-code] [codex]");
    process.exit(1);
  }
  const selected = (ids.length ? ids : Object.keys(ADAPTERS))
    .map((id) => ADAPTERS[id as keyof typeof ADAPTERS])
    .filter(Boolean);

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
