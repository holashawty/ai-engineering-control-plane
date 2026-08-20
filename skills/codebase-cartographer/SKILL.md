---
name: codebase-cartographer
description: Use when onboarding to an unfamiliar repository, ingesting a project via URL/path, or diagnosing complex legacy architecture. Generates semantic symbol maps, dependency call graphs, and architectural boundary charts in seconds. Enables surgical diagnosis of root causes versus superficial symptoms when rescuing broken projects. Distinct from systematic-debugging (which diagnoses a specific failing test); this skill maps the holistic codebase landscape.
license: MIT
allowed-tools: [filesystem_read, shell_exec, test_runner]
---

# Codebase Cartographer

## When to use this skill

During `project-onboarding`, `discovery-refresh`, `--entegre`, or when taking over an unfamiliar codebase.

### The Problem It Solves
When an agent is dropped into a large, messy, or broken repository, naive file-by-file reading consumes excessive context tokens and fails to uncover deep architectural dependencies. This skill acts as a **Cartographer**, rapidly constructing a multi-layered map of:
1. **Entrypoints & Core Routers** (Where requests enter the system).
2. **Data & State Flow** (How models, stores, and databases interact).
3. **Architectural Boundaries** (Which modules import which, detecting circular dependencies).
4. **Hotspots & Fragile Zones** (Complex files with high churn or missing test coverage).

---

## 4 Cartography Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           4 CARTOGRAPHY LAYERS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 1: [TOPOLOGY MAP]     Entrypoints, routes, API endpoints, exports.    │
│ Layer 2: [DATA & STATE MAP] Database schemas, stores, state machines, DTOs.│
│ Layer 3: [DEPENDENCY GRAPH] Module imports, circular dependency detection.  │
│ Layer 4: [HEALTH RADAR]     Test coverage ratio, unhandled error spots.     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Procedure

### 1. Rapid Structural Survey
Execute Tree-sitter / AST scanning via `discovery/cli` or ripgrep to locate:
- Package manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`).
- Main entrypoints (`src/index.ts`, `main.py`, `App.tsx`, `cmd/main.go`).
- Route definitions (`routes/`, `api/`, `controllers/`, `pages/`).

### 2. Trace Data & State Flow
Identify where core application state lives:
- Frontend: Zustand, Redux, Context, Pinia, Bloc.
- Backend: Prisma schema, SQLAlchemy models, TypeORM, Drizzle, migrations.
- State machines: Reducers, FSM definitions.

### 3. Diagnose Architectural Health & Root-Cause Isolation
When rescuing a broken codebase:
1. **Differentiate Symptom vs Root Cause:** A crash in `renderer.ts` line 45 is often caused by an unvalidated null emitted 3 layers up in `data-fetcher.ts`. Trace the Call Graph upwards to find the origin of the invalid state.
2. **Detect Circular Dependencies:** Find tightly-coupled spaghetti modules that make isolated changes risky.
3. **Capture Baseline Behavior:** Write a regression capture test verifying current behavior *before* modifying code.

### 4. Emit Cartography Record
Write `.aiecp/memory/project/cartography.json` and emit `Decision(what: "cartography_mapped")`.

---

## Output Format

A typical cartography summary produced by this skill:
```markdown
### Codebase Topology Summary
- **Primary Stack:** TypeScript (Node.js 20 + React 19)
- **Entrypoint:** `src/main.tsx` (Client), `src/server.ts` (API)
- **Core State Engine:** Zustand store at `src/store/useAppStore.ts`
- **Data Layer:** SQLite via Drizzle ORM (`src/db/schema.ts`)
- **Key Modules:**
  - `src/features/auth/` (Authentication & Session)
  - `src/features/billing/` (Stripe integration & Webhook listeners)
  - `src/shared/components/` (UI Primitives)
- **Identified Fragilities:** `src/features/billing/webhook.ts` lacks idempotency verification; `useAppStore` has 2 unmemoized selectors causing re-render churn.
```
