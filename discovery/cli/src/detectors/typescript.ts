import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { Detector, DetectionContext, PartialProjectSignal } from "../types.js";

export const typescriptDetector: Detector = {
  id: "typescript",

  matches(ctx: DetectionContext): boolean {
    return ctx.rootEntries.includes("package.json");
  },

  async detect(ctx: DetectionContext): Promise<PartialProjectSignal> {
    const buildSystem: string[] = [];
    const testSystem: string[] = [];
    const entrypoints: Array<{ path: string; kind: string }> = [];
    const dependencies: Record<string, unknown> = {};
    let hasTestSuite = false;
    const externalIntegrations: string[] = [];

    const pkgRaw = await readFile(join(ctx.rootPath, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
      main?: string;
    };
    const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    dependencies.manifest = "package.json";
    dependencies.packages = Object.keys(allDeps).length;

    const isTS = ctx.rootEntries.includes("tsconfig.json") || "typescript" in allDeps;
    const stack = isTS ? ["typescript"] : ["javascript"];

    // Package manager.
    if (ctx.rootEntries.includes("pnpm-lock.yaml")) buildSystem.push("pnpm");
    else if (ctx.rootEntries.includes("yarn.lock")) buildSystem.push("yarn");
    else if (ctx.rootEntries.includes("bun.lockb") || ctx.rootEntries.includes("bun.lock")) buildSystem.push("bun");
    else if (ctx.rootEntries.includes("package-lock.json")) buildSystem.push("npm");
    else buildSystem.push("npm");

    // Test runner, via devDependencies + script hints.
    for (const [dep, name] of [
      ["vitest", "vitest"],
      ["jest", "jest"],
      ["mocha", "mocha"],
      ["@playwright/test", "playwright"],
    ] as const) {
      if (dep in allDeps) { testSystem.push(name); hasTestSuite = true; }
    }
    if (!hasTestSuite && pkg.scripts?.test && !/no test specified/.test(pkg.scripts.test)) {
      hasTestSuite = true;
      testSystem.push("npm-script:test");
    }

    // Framework signals, for external_integrations / layer.
    const layer: string[] = [];
    if ("next" in allDeps) { layer.push("frontend"); externalIntegrations.push("next.js"); }
    if ("react" in allDeps && !layer.includes("frontend")) layer.push("frontend");
    if ("vue" in allDeps && !layer.includes("frontend")) layer.push("frontend");
    if ("express" in allDeps || "fastify" in allDeps || "koa" in allDeps) layer.push("backend");
    if ("electron" in allDeps) layer.push("desktop");
    if (layer.length === 0) layer.push("backend");

    // Common entrypoints.
    if (pkg.main) entrypoints.push({ path: pkg.main, kind: "main" });
    for (const [file, kind] of [
      ["src/index.ts", "main"],
      ["src/index.js", "main"],
      ["index.ts", "main"],
      ["index.js", "main"],
      ["src/cli.ts", "cli"],
    ] as const) {
      if (existsSync(join(ctx.rootPath, file))) entrypoints.push({ path: file, kind });
    }

    return {
      detector: "typescript",
      stack,
      layer,
      buildSystem,
      testSystem,
      entrypoints,
      dependencies,
      capabilities: { has_test_suite: hasTestSuite, external_integrations: externalIntegrations },
    };
  },
};
