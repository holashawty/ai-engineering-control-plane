# AIECP Vizyon ve Yol Haritası — 2026 ve Ötesi

**"Bu repo'yu alsınlar, hiç hata yapmadan, kendi kendine loop içinde
çalışsın, goal noktasına kadar gelsin."**

Bu doküman, AIECP'nin mevcut durumunu, 2026 AI manzarasındaki
yerini, eksikliklerini ve gelecek vizyonunu kapsar. Patron'un
soru ve vizyonlerine doğrudan cevap verir.

---

## 1. Proje Amacına Ulaştı mı?

**Kısmen evet, tamamlanmadı.** Mevcut durumda AIECP bir LLM'in
yanlış davranmasını engelleyen bir **disiplin çerçevesi** olarak
çalışıyor — ama henüz bir LLM'in **otonom olarak bir projeyi
baştan sona götürebileceği** bir sistem değil.

### Ne çalışıyor (kanıtlı):
- 14 workflow state machine hepsi test edilmiş, 500+ assertion PASS
- Chat LLM'ler (ChatGPT, Grok) protokolü takip edip evidence üretebiliyor
- IDE agent'ları (AutoClaw) gerçek WorkflowRun API'sini çağırabiliyor
- Safety gate, question economy, tool-use-mandatory constitution'ları
  çalışıyor — gerçek testlerde bug buldular (5 canlı test, 6 gerçek bug)
- Eval harness 22 senaryo, 96 assertion PASS

### Ne eksik (gap'ler):
- **Canlı, çok-turlu agent oturumu yok** — scripted/simulated testler
  var ama gerçek bir LLM'in saatlerce otonom çalışıp goal'e ulaşması
  test edilmedi
- **MCP entegrasyonu yok** — Model Context Protocol 2026'da
  standartlaştı, AIECP'nin adapter'ları MCP server'lara bağlanamıyor
- **A2A protokolü yok** — Agent-to-Agent iletişimi 2026'da Google'ın
  A2A protokolüyle standartlaştı, AIECP tek-agent (ADR-0005)
- **Visual/UI testing yok** — patron'un Phaser/Electron sorunları
  (gizli bug'lar, visual regression) için `behavioral-simulation`
  skill'i var ama gerçek UI etkileşim simülasyonu yok
- **Otonom loop yok** — workflow'lar state machine olarak çalışıyor
  ama bir workflow'ten diğerine otomatik geçiş (bug-report →
  propose-fix → feature-request → implement) yok

### Patron'un yaşadığı sorunlara cevap:

| Sorun | AIECP'nin çözümü | Durum |
|---|---|---|
| "Testler geçiyor görünüyor ama arkaplanda sıkışıyor" | `behavioral-verification` skill'i: "no exception ≠ success" (ADR-0010) | ✅ Skill yazıldı |
| "Gizli/sessiz bug'lar" | `behavioral-simulation` skill'i: kullanıcı varyasyonlarını simüle eder | ✅ Skill yazıldı |
| "AI çözdü sanıp çözemiyor" | `evidence-engineering`: her iddia evidence ile doğrulanır, `validated: false` kalır | ✅ Çalışıyor |
| "AI aynı çözüm yollarına başvuruyor" | `diverse-thinking`: 7 düşünce stili ile cognitive loop kırma | ✅ Skill yazıldı |
| "AI tool kullanmıyor, hafızasından yapıyor" | Constitution §8: "Tool use is mandatory" (ADR-0019) | ✅ Çalışıyor |
| "Menüler arasında bug'lar" | `quality-gate` skill'i: linter + self-review checklist | ✅ Skill yazıldı |
| "Visual/asset bozulmaları" | ❌ Eksik — visual regression testing skill'i yok | ⬜ Eklenmeli |

---

## 2. Mevcut Repo'yu Başka Projeye Nasıl Açarım?

### Senaryo A: IDE/CLI agent (Claude Code, Codex, AutoClaw)

```bash
# 1. Hedef repoyu klonla
git clone https://github.com/your-org/your-project
cd your-project

# 2. AIECP'yi alt-modül veya kopya olarak ekle
git submodule add https://github.com/holashawty/ai-engineering-control-plane .aiecp-framework

# 3. AIECP entrypoint'lerini generate et
node .aiecp-framework/adapters/agents/dist/bin/write-entrypoints.js .aiecp-framework .

# 4. AGENTS.md/CLAUDE.md otomatik oluştu — agent bunu okuyacak
```

Artık IDE agent'ı projeyi açtığında `AGENTS.md`'yi okuyacak ve
AIECP disiplinine göre çalışacak.

### Senaryo B: Chat LLM (ChatGPT, Claude chat, Grok)

```bash
# 1. AIECP reposunu zip olarak indir
# 2. Hedef projenin dosyalarını da zip'e ekle (veya ayrı yükleyebilirsin)
# 3. Chat LLM'e yükle
# 4. Şu promptu ver:
```

**Prompt:**
```
Bu zip'te AIECP adında bir framework var. Önce
CHAT-ENTRYPOINT-SANDBOX.md dosyasını oku (Code Interpreter'ın
varsa) veya CHAT-ENTRYPOINT.md'yi oku (yoksa).

Sonra bu projede şu görevi yap:
[görev açıklaması]

AIECP'nin bug-report (veya ilgili) workflow'unu kullan.
Her adımda evidence emit et (aiecp:evidence blokları).
```

### Senaryo C: Sıfırdan yeni proje (repo'yu template olarak)

```bash
# 1. AIECP'yi klonla
git clone https://github.com/holashawty/ai-engineering-control-plane my-project
cd my-project

# 2. AIECP'nin kendi dosyalarını temizle (opsiyonel — tutabilirsin de)
# 3. Kendi kodunu ekle
# 4. AGENTS.md zaten var — agent bunu okuyacak

# 5. npm run bootstrap çalıştır
npm run bootstrap

# 6. discovery/cli'yi çalıştır — .aiecp/project-intelligence.json oluşur
node discovery/cli/dist/cli.js .

# Artık herhangi bir agent bu repoyu açtığında AIECP disiplinine
# göre çalışacak.
```

---

## 3. Yeterince Skill ve Workflow Var mı?

### Workflow durumu: 14/14 hedef tamam

| Workflow | Durum | Eval senaryo |
|---|---|---|
| bug-report | ✅ | 5 senaryo |
| feature-request | ✅ | 3 senaryo |
| code-review | ✅ | 3 senaryo |
| refactor | ✅ | 1 senaryo |
| change-request | ✅ | 1 senaryo |
| project-onboarding | ✅ | 1 senaryo |
| regression | ✅ | 1 senaryo |
| performance-problem | ✅ | 1 senaryo |
| user-complaint | ✅ | 1 senaryo |
| security-problem | ✅ | 1 senaryo |
| release | ✅ | 1 senaryo |
| incident | ✅ | 1 senaryo |
| unknown-failure | ✅ | 1 senaryo |
| discovery-refresh | ✅ | 1 senaryo |

### Skill durumu: 26 skill

| Kategori | Sayı | Skill'ler |
|---|---|---|
| MVP | 4 | systematic-debugging, evidence-engineering, behavioral-verification, testing |
| Workflow-driven | 11 | code-review, refactor, specification, implementation, documentation, project-onboarding, regression, performance-problem, user-complaint, security-problem, release, incident, unknown-failure, discovery-refresh |
| Meta | 2 | behavioral-simulation, diverse-thinking |
| Tool-discipline | 3 | tool-use-discipline, recency-verification, quality-gate |
| Domain | 3 | database, frontend, backend |

### Ne eksik?

**1. `mobile` skill'i** — mobile-specific testing (iOS/Android emulator,
touch interaction, screen orientation).

**2. `visual-regression` skill'i** — patron'un Phaser/Electron sorunları
için kritik. Ekran görüntüsü karşılaştırma, layout bozulması tespiti,
CSS regression detection. Bu, `behavioral-simulation`'dan farklı:
behavioral-simulation "kullanıcı varyasyonlarını" simüle eder,
visual-regression "görsel bozulmaları" tespit eder.

**3. `ci-cd` skill'i** — CI/CD pipeline yönetimi, deployment safety,
rollback procedures. `release` workflow'u var ama CI/CD spesifik
disiplin yok.

**4. `prompt-engineering` skill'i** — LLM'lerin kendi prompt'larını
optimize etmesi için meta-skill. AIECP'nin constitution'ı agent
davranışını yönetir ama LLM'in prompt kalitesini yönetmez.

---

## 4. 2026 AI Manzarası — AIECP Nerede Duruyor?

### 2026'da ortaya çıkan kavramlar ve AIECP'de olup olmadıkları:

| Kavram | Açıklama | AIECP'de var mı? |
|---|---|---|
| **MCP (Model Context Protocol)** | Agent'ların external tool'lara bağlanması için standart protokol (Anthropic, 2025) | ❌ Yok — `capabilities()` modeli var ama MCP server'lara bağlanamıyor |
| **A2A (Agent2Agent Protocol)** | Agent'ların birbiriyle iletişim kurması (Google, 2025) | ❌ Yok — ADR-0005 "single-agent + workflow" diyerek reddetti |
| **Agent Skills** | Portatif instruction set'ler (Anthropic, 2025) | ✅ Var — ADR-0001 |
| **State Machine Agents** | LangGraph, NOMOS gibi state-machine tabanlı agent framework'leri | ✅ Var — 14 workflow state machine |
| **Evidence-Driven Debugging** | Her kararın evidence ile doğrulanması | ✅ Var — Evidence Model (ADR-0004) |
| **Behavioral Testing** | "Test geçti ≠ çalışıyor" | ✅ Var — ADR-0010 + behavioral-verification |
| **Agent Control Plane** | IBM/Futurum'un 5-katmanlı governance modeli | ✅ Var — AIECP tam olarak bu (6 katman) |
| **Tracing/Evaluation** | MLflow, Arize, LangSmith gibi agent tracing | ⬠ Kısmen — Evidence Model var ama tracing dashboard yok |
| **Visual Regression Testing** | Wopee, Autonoma gibi görsel test araçları | ❌ Yok |
| **Function Calling Standards** | OpenAI function calling, Anthropic tool use standardizasyonu | ⬠ Kısmen — adapter'lar var ama standardizasyon yok |
| **Context Engineering** | Context penceresinin optimize edilmesi, condensation | ❌ Yok — OpenHands'te CondensationEvent var ama AIECP'de yok |
| **Self-Healing Agents** | Agent'ın kendi hatasını fark edip düzeltmesi | ✅ Kısmen — regression workflow + diverse-thinking |
| **Agent Observability** | Telemetry, metrics, alerting | ❌ Yok — log'lar var ama dashboard yok |
| **Prompt Optimization** | A/B testing, description triggering optimization | ❌ Yok — anthropics/skills'te skill-creator var |

### AIECP'nin 2026'daki benzersiz konumu:

**AIECP, "Agent Control Plane" konseptinin en tam implementasyonu.**
IBM ve Futurum "Agent Control Plane" konseptini tanımlıyor ama
implementasyon bırakıyorlar. AIECP bunu implemente ediyor:
- Constitution (governance)
- 14 workflow state machine (workflow layer)
- 26 skill (procedural layer)
- Evidence Model (observability layer)
- 4 agent adapter (portability layer)
- Eval harness (evaluation layer)

**Rakiplerinden farkı:** LangGraph, CrewAI, AutoGen gibi framework'ler
"agent runtime" sağlar — AIECP "agent control plane" sağlar. Runtime
değil, disiplin. Herhangi bir runtime'la (Claude Code, Codex,
ChatGPT) çalışır.

---

## 5. Nasıl Daha Otonom Hale Gelir?

### Mevcut otonomi seviyesi: L2 (Assisted)

ADR-0014'te tanımlanan otonomi seviyeleri:
- L0: Observe (sadece gözlem)
- L1: Suggest (öneri sunar, insan onaylar)
- **L2: Assisted (öneri + uygulama, insan onaylar gate'leri)** ← BURADAYIZ
- L3: Scoped (belirli görevlerde tam otonom)
- L4: Supervised (insan gözetiminde tam otonom)
- L5: Autonomous (tam otonom)

### L3'e geçiş için gerekenler:

**1. Otonom workflow zinciri**
- bug-report → propose-fix → otomatik feature-request → implement →
  verify → report zinciri birleşik olmalı
- `_router.md` şu an tek bir workflow seçiyor — çoklu workflow zinciri
  desteklenmiyor (ADR-0016 non-goal olarak işaretli)

**2. `discovery-refresh` trigger'ı**
- File watcher veya git hook: kaynak değiştiğinde
  `project-intelligence.json` stale yapacak
- Şu an manuel — otomatik olmalı

**3. Memory persistence**
- Evidence ve memory şu an run-directory'de (geçici)
- `.aiecp/memory/` altında kalıcı olmalı
- Cross-session memory: agent bir sonraki oturumda önceki
  `known-failure`'ları okuyabilmeli

**4. Error recovery loop**
- Workflow `blocked`'a düştüğünde otomatik olarak `unknown-failure`
  workflow'una geçmeli
- Şu an manuel — insan müdahalesi gerekiyor

### L4'e geçiş için gerekenler:

**5. MCP entegrasyonu**
- Agent'lar MCP server'lara bağlanabilmeli (database, browser, file system)
- Bu, `capabilities()` modeline `mcp: true` eklenmesini gerektirir
- adapters/agents/src/*/adapter.ts'e MCP support eklenmeli

**6. Context engineering**
- LLM context penceresini optimize etme
- Uzun workflow'larda evidence summary'leri üretme
- "CondensationEvent" benzeri bir mekanizma

**7. Eval-driven self-improvement**
- Agent, eval sonuçlarına göre kendi prompt'larını optimize etmeli
- `skill-creator` skill'i (henüz yazılmadı) bu işi yapabilir

---

## 6. Prompt Kısaltma — "Tek Cümleyle Başlat"

### Mevcut en kısa prompt:

```
CHAT-ENTRYPOINT-SANDBOX.md oku, sonra [görev] yap.
```

Bu yeterli ama AIECP'yi bilmeyen bir LLM için belirsiz.

### İdeal "tek cümle" prompt:

```
Bu repodaki .aiecp/ klasörü ve AGENTS.md/CLAUDE.md dosyaları bir
mühendislik disiplin çerçevesi (AIECP) içerir — önce
CHAT-ENTRYPOINT-SANDBOX.md'yi oku, sonra [görev]'i bu disipline
uyarak yap.
```

### Gelecekte daha da kısaltmak için:

**`.aiecp/auto-activate` mekanizması:** repo'da `.aiecp/` klasörü
varsa, agent otomatik olarak AIECP moduna geçmeli. Bu, `AGENTS.md`'ye
bir "auto-activation hook" eklenerek yapılabilir:

```markdown
## Auto-Activation
If this file exists in a repo, you are operating under AIECP.
Read .aiecp/CHAT-ENTRYPOINT-SANDBOX.md before doing anything else.
```

Bu sayede prompt sadece `[görev]` olur — AIECP otomatik aktive olur.

---

## 7. Ne Eklenebilir? (2026 Trendlerine Göre)

### Yüksek öncelik:

**1. `visual-regression` skill'i**
- Playwright/Puppeteer ile ekran görüntüsü karşılaştırma
- Patron'un Phaser/Electron sorunlarının çözümü
- `behavioral-simulation` ile entegre çalışır
- Wopee, Autonoma gibi araçlardan ilham

**2. MCP adapter'ı**
- `adapters/agents/src/mcp/adapter.ts`
- MCP server'lara bağlanan agent adapter'ı
- `capabilities()` modeline `mcp: true` ekler
- 2026'da MCP standartlaştı — olmazsa proje geride kalır

**3. Context engineering skill'i**
- Uzun workflow'larda evidence summary üretme
- Context penceresi dolmadan önemli bilgileri saklama
- OpenHands'in `CondensationEvent`'inden ilham

### Orta öncelik:

**4. `skill-creator` skill'i**
- Yeni skill oluşturma + eval + benchmarking
- anthropics/skills'ten ilham (yapısal, paraphrase)
- `eval_runner.py` ile entegre

**5. A2A protokol desteği (gelecekte)**
- ADR-0005 "single-agent" diyerek reddetti
- Ama A2A standartlaştıkça yeniden değerlendirilmeli
- Özellikle: "subagent'a görev ver → subagent yap → geri al" pattern'i
  AIECP'de manuel, A2A ile otomatik olabilir

**6. Agent observability dashboard**
- Evidence Model JSON'larını görselleştiren bir web UI
- MLflow/Arize tarzı tracing
- "Hangi state'te ne kadar zaman harcandı" gibi metrikler

### Düşük öncelik:

**7. `mobile` skill'i**
**8. `ci-cd` skill'i**
**9. `prompt-engineering` skill'i**
**10. SWE-bench entegrasyonu** (eval harness'e)

---

## 8. Patron'un Vizyonuna Cevap

> "bu projeyi seninle bir proje geliştirirken bile kullanıp seni de
> diğer süper zeka gibi farklı bir boyuta taşımak istiyorum"

**Bu mümkün.** AIECP'nin 3 temel gücü var:

### Güç 1: Discipline Layer
AIECP bir LLM'in "ben yaptım" diyip yapmamasını engelliyor. Her
iddia `validated: false` ile başlar, sadece evidence ile `true` olur.
Bu, patron'un yaşadığı "AI çözdü sanıp çözemiyor" sorununun
tam çözümü.

### Güç 2: Evidence Chain
Her karar, her fix, her doğrulama — hepsi JSON olarak diske yazılır.
Bu, "sessiz/gizli bug'lar" sorununu çözer: bug bulunduğunda neden
bulunamadığı (hangi evidence'ın eksik olduğu) geriye dönük izlenebilir.

### Güç 3: Workflow-Agnostic Executor
AIECP herhangi bir LLM'yle (chat, IDE, API) çalışır. ChatGPT, Grok,
Claude, Codex — hepsi aynı workflow'ları kullanabilir. Bu, "model
ne olursa olsun" vizyonunun implementasyonu.

### Eksik olan tek şey: Otonom Loop

Patron'un istediği "kendi kendine loop içinde sorunları çözüp goal
noktasına kadar getirme" — şu an manuel. Bir workflow bittiğinde
insan başlatması gerekiyor. Otonom loop için:

1. **`orchestrator` workflow'ı** — diğer workflow'ları otomatik
   zincirler: `bug-report → propose-fix → feature-request → implement
   → verify → report`. Bu, `_router.md`'nin otomatik versiyonu.

2. **`watcher` mekanizması** — dosya sistemi değişikliklerini
   izler, `discovery-refresh` trigger'ını otomatik tetikler.

3. **`retry-loop`** — `blocked` state'ine düşüldüğünde otomatik
   olarak `unknown-failure`'a geçer, farklı yaklaşım dener.

Bunlar eklenirse AIECP L3 (Scoped Autonomous) seviyesine geçer.

---

## 9. Sonuç ve Önerilen Yol Haritası

### Mevcut durum: L2 Assisted, 14 workflow, 26 skill, 637 assertion

**AIECP şu an bir LLM'in disiplinli çalışmasını sağlayan en tam
framework.** Ama otonom değil — her workflow bittiğinde insan
başlatması gerekiyor.

### Önerilen 3 fazlı yol haritası:

**Faz 1 (1-2 hafta): Eksiklikleri kapat**
- `visual-regression` skill'i yaz
- MCP adapter'ı ekle
- STATUS.md + DELIVERABLES.md sürekli güncel tut
- Gerçek çok-turlu LLM testi yap (ChatGPT + toy-shipping-bug)

**Faz 2 (2-4 hafta): Otonomiye geçiş**
- `orchestrator` workflow'ı yaz (workflow zincirleme)
- `watcher` mekanizması yaz (file system monitoring)
- `retry-loop` mekanizması yaz (blocked → unknown-failure)
- Context engineering skill'i yaz
- Memory persistence (`.aiecp/memory/` kalıcı)

**Faz 3 (1-2 ay): Ekosistem**
- `skill-creator` skill'i yaz
- Agent observability dashboard (web UI)
- SWE-bench entegrasyonu
- `prompt-engineering` skill'i
- 10+ gerçek proje ile test

### Patron'a doğrudan cevap:

**"Proje amacına ulaştı mı?"** — Disiplin framework'ü olarak evet.
Otonom agent sistemi olarak henüz değil. 2-4 haftalık çalışma ile
L3 otonomiye ulaşılabilir.

**"Başka bir projeye nasıl açarım?"** — Yukarıdaki 3 senaryoya bakın
(IDE, chat, template). En kolayı: `git submodule add` + 
`write-entrypoints.js`.

**"Yeterince skill ve workflow var mı?"** — 14 workflow + 26 skill
yeterli başlangıç. `visual-regression` ve `mcp` adapter'ı eklenmeli.

**"2026 kavramlarına sahip mi?"** — State machine agents, evidence-
driven debugging, behavioral testing, agent control plane: hepsi var.
MCP, A2A, context engineering, visual regression: eksik.

**"Daha kısa promptla nasıl?"** — `.aiecp/auto-activate` mekanizması
ile prompt sadece `[görev]` olabilir.

**"Daha otonom nasıl?"** — `orchestrator` workflow + `watcher` +
`retry-loop` = L3 otonomi.
