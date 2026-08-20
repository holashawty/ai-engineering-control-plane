import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { discover } from "./discover.js";

// NOTE (ADR-0022): This CLI does NOT import ajv for schema validation.
// The original cli.ts (pre-ADR-0022) imported ajv/dist/2020.js and
// ajv-formats at the top of the file, which made the compiled
// dist/cli.js require `npm install` at runtime — defeating ADR-0021's
// goal of running offline in chat-sandbox environments (ChatGPT Code
// Interpreter, etc.).
//
// Per ADR-0022, schema validation is now the responsibility of the
// `validate-discovery` state of the project-onboarding workflow, NOT
// the discovery CLI itself. The CLI's job is to run the detector
// pipeline and produce the JSON; the validate-discovery state (which
// has access to ajv via the executor's evidence-store, OR to the
// chat-sandbox LLM following the discovery-fallback procedure) does
// the schema check. This separation of concerns (discovery = data
// gathering, validation = separate step) is also more consistent
// with the framework's broader philosophy.
//
// The self-test below does a STRUCTURAL check (required fields
// present, types correct) without ajv — sufficient to catch
// regressions in the detector pipeline. Full schema validation
// happens in validate-discovery.

const __dirname = dirname(fileURLToPath(import.meta.url));

// Required top-level fields per discovery/schema/project-intelligence.schema.json
const REQUIRED_TOP_LEVEL = ["schema_version", "generated_at", "generated_by", "project", "capabilities", "entrypoints"];
const REQUIRED_PROJECT_FIELDS = ["stack", "layer"];
const LAYER_ENUM = ["backend", "frontend", "mobile", "desktop", "cli", "api", "database", "monorepo"];

function structuralCheck(result: unknown, targetPath: string): { ok: boolean; errors?: string[] } {
  const errors: string[] = [];
  if (!result || typeof result !== "object") {
    errors.push("result is not an object");
    return { ok: false, errors };
  }
  const obj = result as Record<string, unknown>;

  for (const field of REQUIRED_TOP_LEVEL) {
    if (!(field in obj)) {
      errors.push(`missing required top-level field: ${field}`);
    }
  }

  if (obj.project && typeof obj.project === "object") {
    const project = obj.project as Record<string, unknown>;
    for (const field of REQUIRED_PROJECT_FIELDS) {
      if (!(field in project)) {
        errors.push(`missing required project field: ${field}`);
      }
    }
    if (Array.isArray(project.layer)) {
      for (const layer of project.layer) {
        if (!LAYER_ENUM.includes(layer as string)) {
          errors.push(`project.layer has invalid value: ${layer} (must be one of ${LAYER_ENUM.join(", ")})`);
        }
      }
    }
  }

  if (obj.schema_version !== "1.0.0") {
    errors.push(`schema_version must be "1.0.0", got: ${obj.schema_version}`);
  }

  return { ok: errors.length === 0, errors };
}

async function runAgainst(targetPath: string, writeOutput: boolean): Promise<{ ok: boolean; errors?: string[] }> {
  const result = await discover(targetPath);
  const check = structuralCheck(result, targetPath);

  if (!check.ok) {
    console.error(`Structural check FAILED for ${targetPath}`);
    console.error(check.errors!.join("\n"));
    return { ok: false, errors: check.errors };
  }

  console.log(`Structural check OK for ${targetPath}`);
  console.log(JSON.stringify(result, null, 2));

  if (writeOutput) {
    const outDir = join(targetPath, ".aiecp");
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "project-intelligence.json"), JSON.stringify(result, null, 2));
    console.log(`Wrote ${join(outDir, "project-intelligence.json")}`);
  }

  return { ok: true };
}

async function buildToyPythonRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "aiecp-toy-py-"));
  await writeFile(join(dir, "pyproject.toml"), `[tool.poetry]\nname = "toy"\nversion = "0.1.0"\n\n[tool.poetry.dependencies]\npython = "^3.11"\npytest = "^8.0"\n`);
  await mkdir(join(dir, "tests"), { recursive: true });
  await writeFile(join(dir, "tests", "test_toy.py"), "def test_ok():\n    assert True\n");
  await writeFile(join(dir, "main.py"), "def main():\n    pass\n\nif __name__ == '__main__':\n    main()\n");
  await mkdir(join(dir, ".github", "workflows"), { recursive: true });
  await writeFile(join(dir, ".github", "workflows", "ci.yml"), "name: CI\non: [push]\n");
  return dir;
}

async function buildToyTsRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "aiecp-toy-ts-"));
  await writeFile(join(dir, "package.json"), JSON.stringify({
    name: "toy", version: "0.1.0", main: "src/index.ts",
    scripts: { test: "vitest run" },
    devDependencies: { typescript: "^5.6.0", vitest: "^2.0.0" },
    dependencies: { express: "^4.19.0" },
  }, null, 2));
  await writeFile(join(dir, "tsconfig.json"), "{}\n");
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "index.ts"), "export const ok = true;\n");
  await writeFile(join(dir, "Dockerfile"), "FROM node:22\n");
  return dir;
}

import { runBlastRadiusSelfTest, BlastRadiusSlicer } from "./blast-radius.js";

async function selfTest(): Promise<void> {
  console.log("=== aiecp-discover self-test (structural check, no ajv — per ADR-0022) ===");
  const pyDir = await buildToyPythonRepo();
  const tsDir = await buildToyTsRepo();

  const pyResult = await runAgainst(pyDir, false);
  const tsResult = await runAgainst(tsDir, false);

  await rm(pyDir, { recursive: true, force: true });
  await rm(tsDir, { recursive: true, force: true });

  const blastRes = runBlastRadiusSelfTest();

  if (!pyResult.ok || !tsResult.ok || blastRes.failed > 0) {
    console.error("SELF-TEST FAILED");
    process.exit(1);
  }
  console.log("SELF-TEST PASSED — both toy repos produced structurally-valid Project Intelligence documents.");
  console.log("(Full schema validation happens in validate-discovery state, not here — per ADR-0022.)");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--self-test")) {
    await selfTest();
    return;
  }

  if (args.includes("--blast-radius")) {
    const idx = args.indexOf("--blast-radius");
    const targetFile = args[idx + 1];
    if (!targetFile) {
      console.error("Usage: aiecp-discover --blast-radius <target-file> [repo-path]");
      process.exit(1);
    }
    const repoPath = args[idx + 2] && !args[idx + 2].startsWith("-") ? args[idx + 2] : ".";
    const slicer = new BlastRadiusSlicer();
    const slice = slicer.slice(repoPath, targetFile);
    console.log(JSON.stringify(slice, null, 2));
    return;
  }

  const targetPath = args[0];
  if (!targetPath || !existsSync(targetPath)) {
    console.error("Usage: aiecp-discover <path-to-repo> | --blast-radius <file> | --self-test");
    console.error("");
    console.error("Note: This CLI does NOT do full schema validation (per ADR-0022).");
    console.error("It runs the detector pipeline and writes the JSON. Schema validation");
    console.error("is the responsibility of the validate-discovery state of the");
    console.error("project-onboarding workflow (which has access to ajv via the");
    console.error("executor's evidence-store, OR via the chat-sandbox LLM following");
    console.error("the discovery-fallback procedure).");
    process.exit(1);
  }

  const write = !args.includes("--dry-run");
  const result = await runAgainst(targetPath, write);
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
