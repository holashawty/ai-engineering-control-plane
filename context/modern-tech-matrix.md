# Universal Technology, Language & Framework Matrix (2026 Complete Blueprint Bible)

**Purpose:** This document is the comprehensive, exact, and canonical technology catalog for the AI Engineering Control Plane (AIECP) updated for **August 2026 production realities**. It equips AI agents with the complete landscape of modern, enterprise-grade, high-performance, and niche technologies across **all major programming languages, platforms, and domains**.

When designing system architectures, scaffolding greenfield applications (`--yarat`), rescuing/refactoring codebases (`--geliştir`), or planning migrations, agents **MUST consult this catalog** to select the exact right tool and current stable version for the job.

---

## 1. Programming Language Landscape & Runtime Targets (August 2026)

| Language | Primary 2026 Strengths & Ecosystem | Modern Tooling & Package Manager | Current Major Version | Best Suited For |
|---|---|---|---|---|
| **TypeScript / JavaScript** | Universal Fullstack, React 19.2, Next.js 16.3, Node 24/26, Bun 1.3+ | `pnpm`, `bun`, `vite`, `tsx`, `biome` | **TypeScript 7.0 / 7.1** (Native Go port, 8-12x speed), **Node.js 26.x / 24 LTS**, **Bun 1.3+** | Fullstack Web, Cross-platform, Serverless, Cloud APIs |
| **Python** | AI/ML, Async APIs, Data Engineering, Scientific Computing | `uv` (standard blazing fast tool), `poetry`, `ruff` | **Python 3.14.x** (Stable) / 3.13 LTS | Machine Learning, FastAPI backends, Data pipelines, Automation |
| **Java** | High-Scale Enterprise, Banking, Spring Boot 3.5+/4.x, Virtual Threads | `Maven`, `Gradle`, `GraalVM` (native images) | **Java 21 LTS / Java 25 LTS** | Mission-critical enterprise backends, Distributed microservices |
| **C# / .NET** | Enterprise Fullstack, Cross-Platform (MAUI/Avalonia), Unity 6 | `dotnet CLI`, `NuGet`, `Rider / VS` | **.NET 10 (LTS)** / .NET 9 | Enterprise web (ASP.NET Core 10), Desktop, Mobile, Game dev |
| **Go (Golang)** | Cloud-Native, Microservices, Kubernetes tools, High Concurrency | `go mod`, `golangci-lint`, `air` | **Go 1.27.x** | Network proxies, High QPS microservices, DevOps tooling |
| **Rust** | Zero-Cost Abstraction, Memory Safety, Systems, WebAssembly, Tauri | `cargo`, `clippy`, `rust-analyzer`, `tokio` | **Rust 1.97.x** | Low-latency systems, Desktop backends, WASM, Security-critical |
| **C++ (C++20 / C++23)** | AAA Game Engines (Unreal 5.8), Real-Time Embedded, High-Frequency Trading | `CMake`, `Ninja`, `Conan`, `vcpkg`, `Clang` | **C++20 / C++23** | Game engines, Computer vision, High-performance simulation |
| **Kotlin** | Modern Android, Kotlin Multiplatform (KMP), Compose Multiplatform | `Gradle (KTS)`, `Amper` | **Kotlin 2.x (2.4+)** | Android apps, Cross-platform mobile/desktop, Kotlin backend |
| **Swift** | Apple Ecosystem (iOS, macOS, visionOS), Swift Concurrency | `Swift Package Manager (SPM)`, `Xcode` | **Swift 6.x** | Native iOS/macOS apps, High-fidelity Apple UX |
| **PHP** | Modern Web, Rapid SaaS, Laravel 13 Ecosystem | `Composer`, `Pest`, `Laravel Herd` | **PHP 8.3 / 8.4** (with **Laravel 13.x**) | Content platforms, E-commerce, Fast-to-market web SaaS |
| **Elixir / Erlang** | Fault-Tolerant Distributed Systems, Real-Time Web (Phoenix LiveView) | `Mix`, `Hex` | **Elixir 1.17+ / Phoenix 1.7+** | Real-time chat, Telemetry, Millions of concurrent websockets |
| **Zig / C** | Modern Systems Programming, C Replacement, Zero-Dependency Binaries | `zig build` | **Zig 0.13+** | Embedded firmware, Custom runtimes, Low-level OS utilities |
| **R / Julia** | Advanced Statistics, Bioinformatics, Scientific Computing | `renv` (R), `Pkg.jl` (Julia) | **R 4.4+ / Julia 1.11+** | Data science research, Mathematical & physical simulations |
| **Solidity / Rust Web3** | Smart Contracts, Decentralized Apps (EVM / Solana) | `Foundry` (Forge), `Hardhat`, `Anchor` (Solana) | **Solidity 0.8.26+ / Rust Anchor** | Blockchain protocols, Decentralized finance (DeFi) |

---

## 2. 2D & 3D Game Development, Canvas & Interactive Visuals

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GAME DEVELOPMENT ECOSYSTEM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Web & Mobile Canvas: Phaser 3, PixiJS v8, Canvas + WebAudio Synth (PWA)   │
│ • Web 3D & Immersive:  Three.js, React Three Fiber (R3F), Babylon.js v7    │
│ • Cross-Platform 2D:   Flutter + Flame Engine, Defold, Godot 4.7 (GDScript/C#)│
│ • Major Industry Engines: Unity 6 (6.x LTS), Unreal Engine 5.8 (C++/BP)     │
│ • Native & Systems:    Bevy (Rust), Raylib (C/C++), SDL3, WebGPU            │
│ • Creator Platforms:   Roblox (Luau)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Engine / Framework | Version & Tech | Key Production Superpowers | When to Choose |
|---|---|---|---|
| **HTML5 Canvas / Pure JS** | TypeScript 7 / ES6 + WebAudio API | Zero external assets, Procedural audio synthesizer, 60fps delta-time loop | Hyper-fast loading web games, arcade, casual mobile sports |
| **Phaser 3 / PixiJS v8** | TypeScript 7 | Matter.js physics, Sprite batching, Spine animations, WebGL fallback | Production 2D browser games, mobile casual web games |
| **Three.js / React Three Fiber** | React 19.2 + Three.js | `@react-three/drei`, `@react-three/rapier` (physics), WebXR | Interactive 3D web showcases, browser 3D games, visualizers |
| **Babylon.js v7** | TypeScript 7 | Node Material Editor, Havok Physics engine, WebGPU rendering | Enterprise 3D web applications, complex CAD/BIM viewers |
| **Godot 4.7** | GDScript / C# (.NET 10) | Lightweight (<100MB), Node hierarchy, WASM/Mobile/PC export | Indie 2D & 3D games, mobile native games, cross-platform |
| **Unity 6 (6.x LTS)** | C# (.NET 10) | Universal Render Pipeline (URP), DOTS (ECS), OpenXR, Asset Store | Multiplatform 2D/3D games, AR/VR (Quest/VisionOS), Mobile games |
| **Unreal Engine 5.8** | C++20 & Blueprints | Nanite, Lumen, Chaos Physics, MetaHumans, Substrate | High-end AAA games, Architectural visualization, Virtual production |
| **Flutter + Flame Engine** | Flutter 3.47+ | Flame Forge2D, Flame Audio, Riverpod state integration | Single-codebase native 2D mobile games with Flutter UI overlay |
| **Bevy / Raylib** | Rust 1.97 / C++20 | Data-oriented ECS (Bevy), Simple imperative OpenGL (Raylib) | Custom game engines, hacker/indie experiments, native speed |

---

## 3. Web Fullstack, Frontend & UI Architecture

| Paradigm / Stack | Core Technologies & Versions | UI Component & Styling Primitives | Best Fit |
|---|---|---|---|
| **Modern React Ecosystem (Standard)** | **Next.js 16.3** / **Vite + React 19.2** | **Shadcn/UI**, **Radix Primitives**, **Tailwind CSS 4.3**, **Lucide Icons** | SaaS dashboards, Consumer web apps, E-commerce |
| **Vue Ecosystem** | **Nuxt 4.x** / **Vite + Vue 3.5+** | **Nuxt UI / PrimeVue**, **Tailwind CSS 4.3**, **Pinia** | Fast-rendering data applications, European/Global enterprise |
| **Svelte Ecosystem** | **SvelteKit 2** (Svelte 5.56+ Runes) | **Bits UI / Melt UI**, **Tailwind CSS**, **Lucide Svelte** | Reactive apps with zero virtual DOM overhead, high speed |
| **Enterprise Frontend** | **Angular 22.x** (Signals + Standalone) | **Angular Material**, **Tailwind / SCSS**, **RxJS / Signals** | Large corporate enterprise apps, Banking, Large multi-team repos |
| **Fullstack Routing & Edge** | **React Router v8 / Remix** / **Astro 7.x** | **Tailwind CSS**, **Starlight** (docs), **Shadcn** | Content-heavy sites, Multi-framework islands, Edge deployment |
| **Ultra-Light & Hypermedia** | **HTMX 2.x + Alpine.js** / **Qwik** | **Tailwind CSS**, **Shoelace Web Components** | Server-rendered apps (Go/Python/PHP) with minimal client JS |
| **C# Web Frontend** | **Blazor (Interactive Server / WASM - .NET 10)** | **MudBlazor**, **Radzen Blazor** | .NET internal enterprise tools, Corporate intranet portals |

---

## 4. Native & Cross-Platform Mobile Applications

| Platform Strategy | Technology & Versions | Core Ecosystem Libraries | Strengths |
|---|---|---|---|
| **Cross-Platform Gold Standard** | **Flutter 3.47.x (Dart 3.5+)** | `riverpod` / `bloc`, `go_router`, `drift` (SQLite), `flutter_animate` | 100% pixel-perfect UI across iOS/Android, native performance |
| **React-Based Cross-Platform** | **React Native 0.87+ (Expo Router v4)** | `react-native-reanimated 3`, `nativewind v4`, `tamagui`, `mmkv` | Shared web/mobile skills, instant OTA updates |
| **Kotlin Multiplatform (KMP)** | **KMP + Compose Multiplatform 1.11+** | `Ktor`, `SQLDelight`, `Decompose`, `Voyager` | Shared business logic in Kotlin, 100% native UI on iOS/Android |
| **Pure Native Android** | **Kotlin 2.4+ + Jetpack Compose** | `Coroutines + Flow`, `Retrofit/Ktor`, `Room DB`, `Hilt` | Android-first apps, hardware/sensors, maximum Android UX |
| **Pure Native iOS** | **Swift 6.x + SwiftUI** | `Swift Concurrency`, `SwiftData`, `Alamofire`, `Kingfisher` | Apple Design Award tier iOS apps, widgets, Apple Watch/VisionOS |
| **.NET Mobile** | **.NET MAUI (.NET 10)** | `CommunityToolkit.Maui`, `Refit`, `SQLite-net` | .NET teams extending existing C# business logic to mobile |
| **Web-Wrapped Mobile** | **Capacitor 6+ / Ionic** | `@capacitor/core`, `@capacitor/camera`, `@capacitor/push` | Quick mobile packaging of existing React/Vue/Angular web apps |

---

## 5. Native Desktop Applications (Windows, macOS, Linux)

| Framework | Architecture & Versions | Strengths & Trade-offs |
|---|---|---|
| **Tauri 2.11+ (Recommended)** | Rust 1.97 Backend + Web UI (React/Vue/Svelte) | Ultra-light (<10MB installer), minimal RAM usage, native security sandbox |
| **Electron 30+** | Node.js 24/26 + Chromium + Web UI | Battle-tested (VS Code, Slack), huge legacy npm ecosystem, heavier RAM |
| **Avalonia UI (.NET 10)** | C# / XAML Multiplatform Desktop | True cross-platform WPF successor (Windows, macOS, Linux, Mobile, WASM) |
| **Qt 6 (C++ / PyQt6 / PySide6)** | C++20 or Python 3.14 + Qt Quick / QML | Industrial UI, CAD software, high-performance automotive/desktop suites |
| **Go Wails v2** | Go 1.27 Backend + Web UI | Lightweight single-binary Go desktop app with web frontend |

---

## 6. Backend Frameworks & Microservice Architectures

| Language | Frameworks & Current Versions | Key Libraries & Tooling | Best Use Cases |
|---|---|---|---|
| **Python** | **FastAPI**, **Django 5.x**, **Flask 3**, **Litestar** (Python 3.14) | `Pydantic v2`, `SQLAlchemy 2.0`, `Alembic`, `Celery/ARQ`, `uvicorn` | High-productivity APIs, AI microservices, Complex ORM admin (Django) |
| **Java** | **Spring Boot 3.5+/4.x**, **Quarkus 3**, **Micronaut** (Java 21/25 LTS) | `Spring Security`, `Hibernate / JPA`, `Lombok`, `MapStruct`, `Flyway` | Enterprise banking, High-scale distributed microservices |
| **C# / .NET** | **ASP.NET Core 10 (LTS)**, **Minimal APIs** | `Entity Framework Core 10`, `Dapper`, `MediatR`, `FluentValidation` | Enterprise cloud APIs, High-throughput services, Microsoft Azure stack |
| **PHP** | **Laravel 13.x (PHP 8.3/8.4)**, **Symfony 7** | `Eloquent`, `Livewire`, `Inertia.js`, `Pest`, `Laravel Horizon` | Rapid SaaS development, E-commerce, Full-featured web applications |
| **Node / Bun** | **NestJS 10+**, **Fastify 5**, **Express 5**, **Elysia (Bun 1.3+)** | `Prisma`, `Drizzle ORM`, `Zod v3`, `BullMQ`, `tRPC` | Fullstack TypeScript backends, Real-time collaboration |
| **Go** | **Fiber v3**, **Gin**, **Chi**, **Echo** (Go 1.27) | `GORM`, `sqlc`, `Zap`, `Viper`, `Testify` | Lightweight high-QPS microservices, Networking proxies, Cloud tools |
| **Rust** | **Axum 0.7+**, **Actix-web 4**, **Loco** (Rust 1.97) | `Tokio`, `SQLx`, `Diesel`, `Serde`, `Tower`, `Tracing` | Mission-critical low-latency APIs, Crypto backends, Memory constrained |
| **Elixir** | **Phoenix 1.7+** | `Phoenix LiveView`, `Ecto`, `Oban` | Real-time websockets, Multi-player backends, High-concurrency messaging |
| **Ruby** | **Ruby on Rails 7.2 / 8.0** | `Hotwire (Turbo/Stimulus)`, `Sidekiq`, `ActiveRecord` | High-velocity developer ergonomics, Rapid prototyping |

---

## 7. Databases, Event Streaming, Caching & Data Engineering

| Category | Gold Standard Technologies (2026) | Modern High-Leverage Alternatives |
|---|---|---|
| **Relational Databases (RDBMS)** | **PostgreSQL 18.x (Stable) / 19** (pgvector, PgBouncer), **MySQL 8.4 LTS** | **SQLite (WAL mode)**, **SQL Server 2022**, **CockroachDB** |
| **Distributed Cache & In-Memory** | **Redis 8.10+ / Valkey 8+** (Streams, Cluster) | **DragonflyDB**, **Memcached** |
| **NoSQL & Document Stores** | **MongoDB 7/8**, **Amazon DynamoDB** | **Couchbase**, **Firestore**, **RavenDB** |
| **Columnar & Analytical (OLAP)** | **ClickHouse**, **DuckDB** (in-process analytical) | **Snowflake**, **Google BigQuery**, **Apache Druid** |
| **Message Brokers & Streaming** | **Apache Kafka 3.8+**, **RabbitMQ 4+**, **NATS 2.10** | **Redpanda** (C++ Kafka API), **Apache Pulsar** |
| **Data Engineering & Workflow** | **Apache Airflow 2.10+ / 3**, **dbt**, **Prefect** | **Apache Spark 3.5+**, **Dagster**, **Polars** (super-fast DataFrame) |
| **Vector Databases (AI Search)** | **pgvector (Postgres 18)**, **Qdrant**, **ChromaDB** | **Milvus**, **Pinecone**, **Weaviate** |

---

## 8. AI, Machine Learning & Agentic Systems

| Area | Production Frameworks & Libraries |
|---|---|
| **Core Deep Learning & Inference** | **PyTorch 2.x**, **HuggingFace Transformers / Diffusers**, **ONNX Runtime**, **vLLM**, **TGI** |
| **Agentic Frameworks & Tool Chains** | **LangGraph**, **LlamaIndex**, **Instructor** (structured outputs), **LiteLLM** (multi-model gateway) |
| **Local Inference & Embeddings** | **Ollama**, **FastEmbed**, **Sentence-Transformers**, **llama.cpp** |

---

## 9. DevOps, Cloud Infrastructure & Observability

| Layer | Tools & Platforms |
|---|---|
| **Package Managers & Tooling** | **`uv`** (standard blazing fast Python tool), **`pnpm`**, **`bun` 1.3+** |
| **Containerization & Orchestration**| **Docker**, **Kubernetes (k8s 1.36)**, **Docker Compose**, **Podman** |
| **Infrastructure as Code (IaC)** | **Terraform**, **OpenTofu**, **Pulumi**, **AWS CDK** |
| **CI / CD Pipelines** | **GitHub Actions**, **GitLab CI**, **ArgoCD** (GitOps) |
| **Observability, Tracing & Errors** | **OpenTelemetry (OTel)**, **Sentry**, **Prometheus + Grafana**, **Datadog** |
| **Cloud Providers & Serverless** | **AWS** (Lambda, ECS, S3), **GCP** (Cloud Run), **Azure**, **Cloudflare Workers**, **Vercel** |

---

## 10. Testing, Quality Assurance & Vibe-Antidote Standards

| Level | Recommended Tooling | Invariant Discipline |
|---|---|---|
| **Unit & Integration** | **Vitest / Jest** (TS), **Pytest** (Python), **Go test**, **Cargo test**, **JUnit 5** (Java), **xUnit** (.NET 10), **Pest** (PHP) | Mock external network/disk I/O; verify state invariants. |
| **Property-Based Fuzzing** | **fast-check** (TS/JS), **Hypothesis** (Python), **Proptest** (Rust) | Generate 1000+ random inputs to detect edge-case crashes. |
| **End-to-End & Visual QA** | **Playwright**, **Cypress** | Validate real user flows, layout responsiveness, and DOM state. |
| **API & Service Mocking** | **MSW (Mock Service Worker)**, **WireMock**, **Prism** (OpenAPI mock) | Enable 100% offline & sandboxed development. |
| **Accessibility (a11y)** | **axe-core**, `@axe-core/playwright` | Zero critical WCAG-AA accessibility violations. |
