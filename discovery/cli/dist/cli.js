import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
// ajv v8's type declarations don't cleanly expose a default export under
// NodeNext module resolution — cast through unknown rather than fighting
// the .d.ts. Runtime behavior (require) is correct either way.
const AjvCtor = Ajv2020;
const addFormatsFn = addFormats;
import { discover } from "./discover.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "..", "..", "schema", "project-intelligence.schema.json");
function loadValidator() {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
    const ajv = new AjvCtor({ strict: false, allErrors: true });
    addFormatsFn(ajv);
    return ajv.compile(schema);
}
async function runAgainst(targetPath, writeOutput) {
    const result = await discover(targetPath);
    const validate = loadValidator();
    const valid = validate(result);
    if (!valid) {
        console.error(`Schema validation FAILED for ${targetPath}`);
        console.error(JSON.stringify(validate.errors, null, 2));
        return { ok: false, errors: validate.errors };
    }
    console.log(`Schema validation OK for ${targetPath}`);
    console.log(JSON.stringify(result, null, 2));
    if (writeOutput) {
        const outDir = join(targetPath, ".aiecp");
        await mkdir(outDir, { recursive: true });
        await writeFile(join(outDir, "project-intelligence.json"), JSON.stringify(result, null, 2));
        console.log(`Wrote ${join(outDir, "project-intelligence.json")}`);
    }
    return { ok: true };
}
async function buildToyPythonRepo() {
    const dir = await mkdtemp(join(tmpdir(), "aiecp-toy-py-"));
    await writeFile(join(dir, "pyproject.toml"), `[tool.poetry]\nname = "toy"\nversion = "0.1.0"\n\n[tool.poetry.dependencies]\npython = "^3.11"\npytest = "^8.0"\n`);
    await mkdir(join(dir, "tests"), { recursive: true });
    await writeFile(join(dir, "tests", "test_toy.py"), "def test_ok():\n    assert True\n");
    await writeFile(join(dir, "main.py"), "def main():\n    pass\n\nif __name__ == '__main__':\n    main()\n");
    await mkdir(join(dir, ".github", "workflows"), { recursive: true });
    await writeFile(join(dir, ".github", "workflows", "ci.yml"), "name: CI\non: [push]\n");
    return dir;
}
async function buildToyTsRepo() {
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
async function selfTest() {
    console.log("=== aiecp-discover self-test ===");
    const pyDir = await buildToyPythonRepo();
    const tsDir = await buildToyTsRepo();
    const pyResult = await runAgainst(pyDir, false);
    const tsResult = await runAgainst(tsDir, false);
    await rm(pyDir, { recursive: true, force: true });
    await rm(tsDir, { recursive: true, force: true });
    if (!pyResult.ok || !tsResult.ok) {
        console.error("SELF-TEST FAILED");
        process.exit(1);
    }
    console.log("SELF-TEST PASSED — both toy repos produced schema-valid Project Intelligence documents.");
}
async function main() {
    const args = process.argv.slice(2);
    if (args.includes("--self-test")) {
        await selfTest();
        return;
    }
    const targetPath = args[0];
    if (!targetPath || !existsSync(targetPath)) {
        console.error("Usage: aiecp-discover <path-to-repo> | --self-test");
        process.exit(1);
    }
    const write = !args.includes("--dry-run");
    const result = await runAgainst(targetPath, write);
    if (!result.ok)
        process.exit(1);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
