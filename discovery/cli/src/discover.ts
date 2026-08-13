import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Detector, DetectionContext, PartialProjectSignal } from "./types.js";
import { pythonDetector } from "./detectors/python.js";
import { typescriptDetector } from "./detectors/typescript.js";

// Registry per ADR-0009: add a stack by adding one entry here, the
// orchestrator below never branches on stack identity.
const REGISTRY: Detector[] = [pythonDetector, typescriptDetector];

export interface ProjectIntelligence {
  schema_version: "1.0.0";
  generated_at: string;
  generated_by: string;
  stale: boolean;
  project: {
    stack: string[];
    layer: string[];
    domain_summary?: string;
    build_system: string[];
    test_system: string[];
  };
  capabilities: {
    has_test_suite: boolean;
    has_ci: boolean;
    has_containerization: boolean;
    database_detected: string[] | null;
    external_integrations: string[];
  };
  conventions: Record<string, unknown>;
  constraints: Array<{ constraint: string; source: string; scope?: string }>;
  dependencies: Record<string, unknown>;
  entrypoints: Array<{ path: string; kind: string }>;
  environments: string[];
}

async function buildContext(rootPath: string): Promise<DetectionContext> {
  const entries = await readdir(rootPath);
  return { rootPath, rootEntries: entries };
}

function detectCI(rootPath: string): boolean {
  return existsSync(join(rootPath, ".github", "workflows")) ||
    existsSync(join(rootPath, ".gitlab-ci.yml")) ||
    existsSync(join(rootPath, ".circleci"));
}

function detectContainerization(rootPath: string): boolean {
  return existsSync(join(rootPath, "Dockerfile")) ||
    existsSync(join(rootPath, "docker-compose.yml")) ||
    existsSync(join(rootPath, "docker-compose.yaml"));
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function dedupeEntrypoints(
  entries: Array<{ path: string; kind: string }>
): Array<{ path: string; kind: string }> {
  const seen = new Set<string>();
  const out: Array<{ path: string; kind: string }> = [];
  for (const e of entries) {
    const key = `${e.path}::${e.kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

export async function discover(rootPath: string): Promise<ProjectIntelligence> {
  const ctx = await buildContext(rootPath);
  const applicable = REGISTRY.filter((d) => d.matches(ctx));

  if (applicable.length === 0) {
    // No registered detector matched. MVP scope is Python + TypeScript
    // only (ADR-0016) — an unmatched repo is a real, expected outcome,
    // not an error; the caller decides what to do (e.g. route to
    // project-onboarding's "unsupported stack" path once that exists).
    return emptyIntelligence(REGISTRY.map((d) => d.id).join("+") + ":none-matched");
  }

  const signals: PartialProjectSignal[] = await Promise.all(
    applicable.map((d) => d.detect(ctx))
  );

  const merged: ProjectIntelligence = {
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

function emptyIntelligence(generatedBy: string): ProjectIntelligence {
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
