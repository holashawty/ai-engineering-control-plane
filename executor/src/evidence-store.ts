import { readFileSync } from "node:fs";
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
