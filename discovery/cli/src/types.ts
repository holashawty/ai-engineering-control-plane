// Detector interface per ADR-0009 (detector-driven, no per-stack enumeration
// in the orchestrator). Each stack detector implements this same shape and
// is registered in discover.ts. Adding a new stack means adding one file
// here and one line in the registry — the orchestrator never branches on
// stack name itself.

export interface DetectionContext {
  /** Absolute path to the root of the repository being scanned. */
  rootPath: string;
  /** Top-level entries in rootPath (cached once, shared across detectors). */
  rootEntries: string[];
}

export interface PartialProjectSignal {
  /** Detector name, used in generated_by provenance. */
  detector: string;
  stack: string[];
  layer: string[];
  buildSystem: string[];
  testSystem: string[];
  entrypoints: Array<{ path: string; kind: string }>;
  dependencies: Record<string, unknown>;
  capabilities: Partial<{
    has_test_suite: boolean;
    external_integrations: string[];
  }>;
}

export interface Detector {
  /** Stable id, e.g. "python", "typescript". Used in NOTICE/logs, not branched on. */
  id: string;
  /** Cheap check: could this detector plausibly apply to this repo? */
  matches(ctx: DetectionContext): boolean;
  /** Expensive-ish: actually inspect files and produce a signal. */
  detect(ctx: DetectionContext): Promise<PartialProjectSignal>;
}
