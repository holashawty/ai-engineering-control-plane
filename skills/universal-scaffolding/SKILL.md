---
name: universal-scaffolding
description: Use when creating a new project from scratch (--yarat) or establishing architectural foundations. Dynamically selects from 6 Architectural Archetypes (web-saas, mobile-cross, game-2d, desktop-app, backend-api, systems-cli) and enforces Launch-Ready V1 invariants (mock seed data, responsive layouts, procedural audio for games, error boundaries, state machine safety). Distinct from project-scaffolding (which creates minimal folder skeletons); this skill injects complete, modern, production-grade architectural engines.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Universal Scaffolding

## When to use this skill

During the `classify-goal`, `design`, `scaffold`, and `implement` states of greenfield (`--yarat`) projects or when restructuring a project from the ground up.

This skill is the **Architectural Engine** of AIECP. It eliminates the "Vibe Coder Scaffolding Gap" by ensuring that every newly created project starts with a **battle-tested, modern, and complete foundation** rather than empty folders or toy skeletons.

> [!TIP]
> **Canonical Technology Matrix:** When choosing libraries, frameworks, or engines, consult [`context/modern-tech-matrix.md`](file:///C:/Users/localUser/.gemini/antigravity/scratch/ai-engineering-control-plane/context/modern-tech-matrix.md). It contains the complete cheat sheet of modern, cutting-edge technologies across Web (Next.js 15, Shadcn), Mobile (Flutter, Kotlin Compose), Games (Phaser 3, PixiJS, Babylon.js), Desktop (Tauri 2.0, PyQt6), and Backend (FastAPI, Go Fiber).

---

## 6 Architectural Archetypes

When given any user prompt (even a 3-word prompt like `--yarat "casual futbol oyunu"`), this skill selects the matching archetype and enforces its mandatory invariants:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       6 UNIVERSAL ARCHITECTURAL ARCHETYPES                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. [game-2d]     Casual 2D / Canvas Game (Phaser 3 / HTML5 Canvas / PWA)    │
│ 2. [web-saas]    Modern Fullstack Web (Next.js 15 / Vite + Tailwind + Shadcn)│
│ 3. [mobile-cross]Cross-Platform Mobile (Flutter / React Native / Kotlin)    │
│ 4. [desktop-app] Native Desktop App (Tauri + Rust/TS / Electron)            │
│ 5. [backend-api] High-Performance API (FastAPI / Go Fiber / NestJS)         │
│ 6. [systems-cli] Systems & CLI Tool (Rust / Go / Python Click)              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Archetype 1: Casual 2D Game (`game-2d`)

**Target:** Mobile & Desktop browser games, casual arcade, sports, puzzles, hyper-casual.
**Tech Stack:** HTML5 Canvas / Phaser 3 / PixiJS + Pure TypeScript/ES6 + WebAudio API.

#### Mandatory Launch-Ready V1 Invariants:
1. **Procedural WebAudio Synthesizer:** Zero external audio file dependencies. Synthesize whistle, goal cheer, bounce, laser, click, explosion, and level-up sounds using `AudioContext` oscillators.
2. **Deterministic Game Loop:** Explicit delta-time (`dt`) calculation at fixed 60 FPS. Game speed never depends on screen refresh rate (prevents 144Hz physics bugs).
3. **Dual Input Abstraction:** Simultaneous support for Mobile Touch / Swipe gestures and Desktop Mouse / Keyboard (Arrow keys / WASD).
4. **State Machine Game Engine:** Explicit states: `BOOT` -> `MENU` -> `PLAYING` -> `PAUSED` -> `GOAL_SCORED` -> `GAME_OVER`.
5. **Persistent High Scores:** LocalStorage with checksum or fallback to in-memory state.
6. **Auto-Resize & Safe Area:** Canvas dynamically scales maintaining aspect ratio with letterboxing on ultra-wide or vertical mobile screens.

#### Procedural Audio Recipe (Built-in WebAudio Synth):
```javascript
export class SoundEngine {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.2) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
  playGoal() {
    this.init();
    [261.63, 329.63, 392.00, 523.25].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'triangle', 0.3, 0.4), i * 100);
    });
  }
  playWhistle() {
    this.init();
    this.playTone(1800, 'sine', 0.15, 0.3);
    setTimeout(() => this.playTone(2200, 'sine', 0.35, 0.4), 180);
  }
  playKick() {
    this.init();
    this.playTone(120, 'square', 0.08, 0.5);
  }
}
```

---

### Archetype 2: Modern Fullstack Web (`web-saas`)

**Target:** SaaS products, dashboards, e-commerce, community platforms.
**Tech Stack:** Next.js 15 App Router / Vite + React 19 + Tailwind CSS v4 + Lucide Icons + Shadcn/UI primitives + Zustand.

#### Mandatory Launch-Ready V1 Invariants:
1. **Rich Seed Data Forge:** Minimum 20+ realistic, richly typed mock records (e.g. products with real Unsplash images, prices, categories, ratings, reviews; not `test1`, `test2`).
2. **Responsive Layout & Theme:** Dark/Light mode toggle, full mobile hamburger navigation, responsive grid tables.
3. **Empty, Loading & Error States:**
   - Skeleton loader components for async data.
   - Beautiful empty-state illustration with an action button when collections are empty.
   - React Error Boundary with "Try Again" button.
4. **Toast Notification System:** Feedback on every user action (Create, Update, Delete, Error).
5. **Form Validation with Zod:** Client-side error messages, disabled buttons on invalid inputs, debounce on search inputs.

---

### Archetype 3: Cross-Platform Mobile (`mobile-cross`)

**Target:** iOS & Android apps.
**Tech Stack:** Flutter / React Native (Expo) / Kotlin Jetpack Compose.

#### Mandatory Launch-Ready V1 Invariants:
1. **Safe Area & Notch Invariance:** All views wrap in SafeArea widgets/views.
2. **Offline-First & Local Cache:** SQLite (drift / room) or Hive/MMKV storage. App starts instantly without network.
3. **Haptic Feedback:** Tactile responses on success, error, pull-to-refresh, and key actions.
4. **Network Reconnection Banner:** Non-intrusive offline pill indicator when internet is disconnected.

---

### Archetype 4: Native Desktop App (`desktop-app`)

**Target:** High-performance desktop tools, local AI dashboards, utilities.
**Tech Stack:** Tauri (Rust backend + Web frontend) / Electron.

#### Mandatory Launch-Ready V1 Invariants:
1. **Secure IPC Bridge:** Explicitly typed command and event channels. Zero `nodeIntegration: true` vulnerabilities.
2. **Native Menu & Shortcuts:** Full keyboard accelerators (Ctrl/Cmd+S, Ctrl/Cmd+P, Escape).
3. **Graceful App Life-Cycle:** Window state saving (position, size, maximized) in local configuration.

---

### Archetype 5: High-Performance API & Backend (`backend-api`)

**Target:** Microservices, REST/GraphQL APIs, Data pipelines.
**Tech Stack:** FastAPI (Python 3.12+) / Go Fiber / NestJS (TypeScript) + PostgreSQL / SQLite.

#### Mandatory Launch-Ready V1 Invariants:
1. **Auto-Generated OpenAPI / Swagger:** Detailed docstrings and Pydantic/Zod schemas with examples on `/docs`.
2. **Global Exception Handling:** RFC 7807 compliant problem JSON for all errors (status, code, detail, timestamp).
3. **Health & Readiness Endpoints:** `/healthz` and `/readyz` endpoints checking DB connection.
4. **Automated Seed Database Command:** `npm run db:seed` or `python -m app.db.seed` populating the DB with 50+ realistic records.
5. **Graceful Shutdown:** Handling `SIGTERM` and `SIGINT` cleanly closing DB pools and inflight requests.

---

### Archetype 6: Systems & CLI Tools (`systems-cli`)

**Target:** Developer tools, automation scripts, system utilities.
**Tech Stack:** Rust (clap + tokio) / Go (cobra) / Python (click/typer).

#### Mandatory Launch-Ready V1 Invariants:
1. **Standard Exit Codes:** `0` for success, `1` for user error, `2` for internal/fatal error.
2. **Structured & Human Output Modes:** Support `--json` flag alongside colorized terminal output.
3. **Self-Documenting `--help`:** Detailed examples and usage flags for all subcommands.

---

## Procedure

### 1. Identify and Select Archetype
Inspect user intent (e.g. `--yarat "..."` prompt). Emit `Decision(what: "archetype_selected:<archetype>")` citing keywords in the prompt.

### 2. Scaffold Core Blueprint
Create directory structure and initialize core files with full, production-ready code. **Never write stub comments like `// implement later` or `TODO`. Write the complete implementation.**

### 3. Inject Seed Data and Assets
Generate realistic seed data, procedural sound engines, theme providers, and state machines according to the selected archetype's invariants.

### 4. Verify Launch-Ready Invariants
Run the verification suite (TypeScript check, tests, seed check, build check). Emit `Decision(what: "scaffolding_verified")`.
