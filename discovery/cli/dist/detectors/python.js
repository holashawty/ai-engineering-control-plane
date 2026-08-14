import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
const PY_MARKERS = ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "Pipfile"];
export const pythonDetector = {
    id: "python",
    matches(ctx) {
        return PY_MARKERS.some((m) => ctx.rootEntries.includes(m)) ||
            ctx.rootEntries.some((e) => e.endsWith(".py"));
    },
    async detect(ctx) {
        const buildSystem = [];
        const testSystem = [];
        const entrypoints = [];
        const dependencies = {};
        let hasTestSuite = false;
        if (ctx.rootEntries.includes("pyproject.toml")) {
            const content = await readFile(join(ctx.rootPath, "pyproject.toml"), "utf-8");
            if (content.includes("[tool.poetry]"))
                buildSystem.push("poetry");
            if (content.includes("[tool.hatch"))
                buildSystem.push("hatch");
            if (content.includes("[tool.uv") || content.includes("uv_build"))
                buildSystem.push("uv");
            if (buildSystem.length === 0)
                buildSystem.push("pyproject");
            if (content.includes("pytest")) {
                testSystem.push("pytest");
                hasTestSuite = true;
            }
            dependencies.manifest = "pyproject.toml";
        }
        if (ctx.rootEntries.includes("requirements.txt")) {
            buildSystem.push("pip");
            dependencies.manifest = dependencies.manifest ?? "requirements.txt";
            const content = await readFile(join(ctx.rootPath, "requirements.txt"), "utf-8");
            if (/pytest/i.test(content)) {
                testSystem.push("pytest");
                hasTestSuite = true;
            }
        }
        if (ctx.rootEntries.includes("Pipfile"))
            buildSystem.push("pipenv");
        // Test suite presence, independent of manifest mentions.
        if (existsSync(join(ctx.rootPath, "tests")) || existsSync(join(ctx.rootPath, "test"))) {
            hasTestSuite = true;
            if (!testSystem.includes("pytest"))
                testSystem.push("pytest");
        }
        // Common entrypoint conventions.
        for (const [file, kind] of [
            ["main.py", "main"],
            ["app.py", "main"],
            ["manage.py", "cli"],
            ["__main__.py", "main"],
            ["cli.py", "cli"],
        ]) {
            if (ctx.rootEntries.includes(file))
                entrypoints.push({ path: file, kind });
        }
        const layer = [];
        if (ctx.rootEntries.includes("manage.py"))
            layer.push("backend"); // Django signal
        if (existsSync(join(ctx.rootPath, "app")) || existsSync(join(ctx.rootPath, "api")))
            layer.push("api");
        if (layer.length === 0)
            layer.push("backend");
        return {
            detector: "python",
            stack: ["python"],
            layer,
            buildSystem: buildSystem.length ? buildSystem : ["unknown"],
            testSystem,
            entrypoints,
            dependencies,
            capabilities: { has_test_suite: hasTestSuite },
        };
    },
};
