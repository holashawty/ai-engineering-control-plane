import { readFileSync, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { WorkflowViolation } from "./types.js";

const AjvCtor = Ajv2020 as unknown as new (opts?: object) => import("ajv").default;
const addFormatsFn = addFormats as unknown as (ajv: import("ajv").default) => void;

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_SCHEMA_DIR = join(__dirname, "..", "..", "evidence", "schema");
const MEMORY_SCHEMA_DIR = join(__dirname, "..", "..", "memory", "schemas");
const VOCAB_REGISTRY_PATH = join(__dirname, "..", "..", "evidence", "vocabulary", "decision-what.json");

const EVIDENCE_KIND_TO_FILE: Record<string, string> = {
  incident: "incident.schema.json",
  trace: "trace.schema.json",
  event: "event.schema.json",
  decision: "decision.schema.json",
  expected: "expected.schema.json",
  actual: "actual.schema.json",
  validation: "validation.schema.json",
  replay: "replay.schema.json",
};

const MEMORY_TYPE_TO_FILE: Record<string, string> = {
  project: "project.schema.json",
  decision: "decision.schema.json",
  "known-failure": "known-failure.schema.json",
  environment: "environment.schema.json",
};

/**
 * Vocabulary registry for Decision.what soft-linting (per ADR-0026).
 * Lazily loaded on first Decision emit. If the registry file is missing
 * or unparseable, vocabulary checking is silently skipped — this is a
 * soft linter, and missing registry MUST NOT block workflow execution.
 */
interface VocabEntry {
  pattern_type: "exact" | "regex";
  pattern: string;
  category: string;
  description: string;
}
interface VocabRegistry {
  version: string;
  entries: VocabEntry[];
}
let cachedVocabRegistry: VocabRegistry | null = null;
function loadVocabRegistry(): VocabRegistry | null {
  if (cachedVocabRegistry !== null) return cachedVocabRegistry;
  if (!existsSync(VOCAB_REGISTRY_PATH)) {
    return null;
  }
  try {
    cachedVocabRegistry = JSON.parse(readFileSync(VOCAB_REGISTRY_PATH, "utf-8"));
    return cachedVocabRegistry;
  } catch {
    return null;
  }
}
function vocabMatch(value: string, registry: VocabRegistry): VocabEntry | null {
  for (const entry of registry.entries) {
    if (entry.pattern_type === "exact" && value === entry.pattern) return entry;
    if (entry.pattern_type === "regex") {
      try {
        if (new RegExp(entry.pattern).test(value)) return entry;
      } catch {
        // Skip invalid regex entries silently.
      }
    }
  }
  return null;
}

export class EvidenceStore {
  private readonly ajv = new AjvCtor({ strict: false, allErrors: true });
  private readonly validators = new Map<string, import("ajv").ValidateFunction>();

  constructor(private readonly runDir: string) {
    addFormatsFn(this.ajv);
  }

  private getValidator(schemaDir: string, filename: string, cacheKey: string) {
    let v = this.validators.get(cacheKey);
    if (!v) {
      const schema = JSON.parse(readFileSync(join(schemaDir, filename), "utf-8"));
      v = this.ajv.compile(schema);
      this.validators.set(cacheKey, v);
    }
    return v;
  }

  /** Validates and writes an Evidence Model entity. Throws on schema violation — never writes invalid evidence. */
  async writeEvidence(kind: string, data: Record<string, unknown>): Promise<void> {
    const id = data.id;
    const filename = EVIDENCE_KIND_TO_FILE[kind];
    if (!filename) {
      throw new WorkflowViolation(`unknown evidence kind "${kind}"`, "unknown-evidence-kind");
    }
    const validate = this.getValidator(EVIDENCE_SCHEMA_DIR, filename, `evidence:${kind}`);
    const valid = validate(data);
    if (!valid) {
      throw new WorkflowViolation(
        `evidence "${kind}" (id: ${id ?? "?"}) failed schema validation: ${JSON.stringify(validate.errors)}`,
        "evidence-schema-invalid"
      );
    }
    // ADR-0026: soft vocabulary lint for Decision.what. Emits a stderr
    // WARNING if the value does not match any canonical pattern in
    // evidence/vocabulary/decision-what.json. This is a SOFT lint — the
    // Decision is still written and is still schema-valid. The warning
    // is the prompt for the emitter to either register the new value
    // or fix the typo. See ADR-0026 for rationale (silent-break risk
    // in orchestrator's evaluate-result string-match against
    // "architecture_constraint_conflict").
    if (kind === "decision" && typeof data.what === "string") {
      const registry = loadVocabRegistry();
      if (registry) {
        const matched = vocabMatch(data.what, registry);
        if (!matched) {
          process.stderr.write(
            `WARNING (ADR-0026 vocabulary linter): Decision "${id ?? "?"}" has unrecognized \`what\` value: "${data.what}".\n` +
            `  This may be a typo or an unregistered new vocabulary entry. The Decision is still written\n` +
            `  (schema-valid), but downstream consumers (e.g. orchestrator's evaluate-result state)\n` +
            `  that string-match on canonical \`what\` values may silently fail to detect this case.\n` +
            `  Register the value in evidence/vocabulary/decision-what.json if it is a new canonical\n` +
            `  entry, or fix the emitter if it is a typo.\n`
          );
        }
      }
    }
    const dir = join(this.runDir, "evidence", kind);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${id}.json`), JSON.stringify(data, null, 2));
  }

  /** Validates and writes a typed Memory entry. Throws on schema violation. */
  async writeMemory(type: string, data: Record<string, unknown>): Promise<void> {
    const id = data.id;
    const filename = MEMORY_TYPE_TO_FILE[type];
    if (!filename) {
      throw new WorkflowViolation(`unknown memory type "${type}"`, "unknown-memory-type");
    }
    const validate = this.getValidator(MEMORY_SCHEMA_DIR, filename, `memory:${type}`);
    const valid = validate(data);
    if (!valid) {
      throw new WorkflowViolation(
        `memory "${type}" (id: ${id ?? "?"}) failed schema validation: ${JSON.stringify(validate.errors)}`,
        "memory-schema-invalid"
      );
    }
    const dir = join(this.runDir, "memory", type);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${id}.json`), JSON.stringify(data, null, 2));
  }
}
