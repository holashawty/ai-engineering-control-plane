import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pythonDetector } from "./detectors/python.js";
import { typescriptDetector } from "./detectors/typescript.js";
// Registry per ADR-0009: add a stack by adding one entry here, the
// orchestrator below never branches on stack identity.
const REGISTRY = [pythonDetector, typescriptDetector];
async function buildContext(rootPath) {
    const entries = await readdir(rootPath);
    return { rootPath, rootEntries: entries };
}
function detectCI(rootPath) {
    return existsSync(join(rootPath, ".github", "workflows")) ||
        existsSync(join(rootPath, ".gitlab-ci.yml")) ||
        existsSync(join(rootPath, ".circleci"));
}
function detectContainerization(rootPath) {
    return existsSync(join(rootPath, "Dockerfile")) ||
        existsSync(join(rootPath, "docker-compose.yml")) ||
        existsSync(join(rootPath, "docker-compose.yaml"));
}
function dedupe(arr) {
    return Array.from(new Set(arr));
}
function dedupeEntrypoints(entries) {
    const seen = new Set();
    const out = [];
    for (const e of entries) {
        const key = `${e.path}::${e.kind}`;
        if (!seen.has(key)) {
            seen.add(key);
            out.push(e);
        }
    }
    return out;
}
export async function discover(rootPath) {
    const ctx = await buildContext(rootPath);
    const applicable = REGISTRY.filter((d) => d.matches(ctx));
    if (applicable.length === 0) {
        // No registered detector matched. MVP scope is Python + TypeScript
        // only (ADR-0016) — an unmatched repo is a real, expected outcome,
        // not an error; the caller decides what to do (e.g. route to
        // project-onboarding's "unsupported stack" path once that exists).
        return emptyIntelligence(REGISTRY.map((d) => d.id).join("+") + ":none-matched");
    }
    const signals = await Promise.all(applicable.map((d) => d.detect(ctx)));
    const merged = {
        schema_version: "1.0.0",
        generated_at: new Date().toISOString(),
        generated_by: `aiecp-discovery/0.1.0 (${signals.map((s) => s.detector).join("+")})`,
        stale: false,
        project: {
            stack: dedupe(signals.flatMap((s) => s.stack)),
            layer: dedupe(signals.flatMap((s) => s.layer)),
            build_system: dedupe(signals.flatMap((s) => s.buildSystem)),
            test_system: dedupe(signals.flatMap((s) => s.testSystem)),
        },
        capabilities: {
            has_test_suite: signals.some((s) => s.capabilities.has_test_suite === true),
            has_ci: detectCI(rootPath),
            has_containerization: detectContainerization(rootPath),
            database_detected: null,
            external_integrations: dedupe(signals.flatMap((s) => s.capabilities.external_integrations ?? [])),
        },
        conventions: {},
        constraints: [],
        dependencies: Object.fromEntries(signals.map((s) => [s.detector, s.dependencies])),
        entrypoints: dedupeEntrypoints(signals.flatMap((s) => s.entrypoints)),
        environments: ["local"].concat(detectCI(rootPath) ? ["ci"] : []),
    };
    return merged;
}
function emptyIntelligence(generatedBy) {
    return {
        schema_version: "1.0.0",
        generated_at: new Date().toISOString(),
        generated_by: `aiecp-discovery/0.1.0 (${generatedBy})`,
        stale: false,
        project: { stack: [], layer: [], build_system: [], test_system: [] },
        capabilities: {
            has_test_suite: false,
            has_ci: false,
            has_containerization: false,
            database_detected: null,
            external_integrations: [],
        },
        conventions: {},
        constraints: [],
        dependencies: {},
        entrypoints: [],
        environments: ["local"],
    };
}
