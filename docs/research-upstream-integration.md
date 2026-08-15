# Upstream Repo Research — Integration Plan

**Date:** 2026-08-15
**Author:** Z.ai Agent (orchestrator)
**Purpose:** Kapsamlı upstream repo araştırması + entegrasyon planı.
Per ADR-0018, permissively-licensed code may be reused verbatim with
attribution. Per the patron's directive: "lisans asla önemli değil
ama hangi projeler çalındıysa bunları not tutmalıyız."

---

## A3: anthropics/skills — Yapısal Öğrenim

**Repo:** https://github.com/anthropics/skills
**Commit:** (latest, cloned 2026-08-15)
**License:** Mixed — example skills are Apache-2.0, document skills
(docx/pdf/pptx/xlsx) are "© 2025 Anthropic, PBC. All rights reserved"
(source-available, NOT open source).

### Ne bulduk

1. **Progressive disclosure pattern**: Her skill dizini `SKILL.md` +
   `reference/` alt-dizini (uzun referans dokümanları için) +
   `scripts/` alt-dizini (çalıştırılabilir yardımcı script'ler için)
   şeklinde yapılandırılmış. AIECP zaten `reference/` pattern'ini
   kullanıyor (`skills/systematic-debugging/root-cause-tracing.md`
   gibi) ama bu pattern'i resmi bir skill authoring convention olarak
   dokümante etmedik.

2. **Skill-creator skill**: `skills/skill-creator/SKILL.md` — yeni
   skill oluşturmak + eval yapmak + benchmarking için bir meta-skill.
   AIECP'nin `skill-creator` skill'i yok (TASKS.md'de "kalan ~3 skill"
   arasında değil ama faydalı olabilir).

3. **Spec at agentskills.io**: `spec/agent-skills-spec.md` sadece bir
   link `https://agentskills.io/specification` içeriyor. AIECP'nin
   `ADR-0001`'i bu spec'i referans alıyor.

4. **"Pushy" description convention**: skill-creator, description'ların
   "biraz pushy" olmasını öneriyor — LLM'lerin skill'leri
   undertrigger etme eğilimine karşı. AIECP'nin description'ları
   genelde yeterince pushy ama bu convention'ı `skills/README.md`'de
   dokümante etmek faydalı olabilir.

5. **Decision tree pattern**: `webapp-testing` skill'i, karar ağacı
   formatında (`User task → Is it X? → Yes → ... / No → ...`) yazılmış.
   Bu, AIECP'nin `systematic-debugging` skill'inde zaten var (four-phase
   procedure) ama diğer skill'lerde de kullanılabilir.

### Entegre edilecek

- **Skill authoring conventions dokümante et** (`skills/README.md`'ye
  "Skill Authoring Conventions" bölümü ekle): progressive disclosure
  pattern, reference/ kullanımı, scripts/ kullanımı, "pushy"
  description convention, decision tree format.

- **`skills/skill-creator/SKILL.md` yaz** (AIECP-original, structurally
  inspired by anthropics/skills but not copied): yeni skill oluşturma
  + eval yapma + benchmarking süreci. Bu, AIECP'nin eval harness'i
  (eval_runner.py) ile entegre çalışır.

### NOT çalınan (lisans uygun değil)

- `docx`, `pdf`, `pptx`, `xlsx` skill'leri: "© 2025 Anthropic, PBC.
  All rights reserved" — source-available, açık kaynak değil.
  AIECP bunları kullanmıyor ve kullanmayacak (patron'un directive'i
  "lisans önemli değil" diyor ama ADR-0018 hala yürürlükte —
  restricted-license kaynaklar paraphrase-only kalır).

---

## A4: OpenHands/OpenHands — Event Stream Şeması

**Repo:** https://github.com/OpenHands/OpenHands
**Commit:** (latest, cloned 2026-08-15)
**License:** MIT (root LICENSE confirmed)

**Önemli not:** Bu repo aslında OpenHands'in **GUI/frontend** reposu
("Agent Canvas"), core runtime değil. Ama event-stream TypeScript
tipleri burada tanımlı — bunlar AIECP'nin `Event` entity'siyle
karşılaştırmak için değerli.

### Ne bulduk

1. **OpenHandsEvent union type**: 15 event tipi bir union'da
   toplanmış: `ActionEvent | MessageEvent | ObservationEvent |
   UserRejectObservation | AgentErrorEvent | SystemPromptEvent |
   ACPToolCallEvent | HookExecutionEvent | CondensationEvent |
   CondensationRequestEvent | CondensationSummaryEvent |
   ConversationStateUpdateEvent | ConversationErrorEvent |
   PauseEvent | ServerErrorEvent | StreamingDeltaEvent`.

   AIECP'nin `Event.kind` enum'u sadece 11 tip (`action, observation,
   log_line, test_result, user_message, agent_message, state_read,
   state_write, network_call, file_change, error`). OpenHands daha
   granular — örneğin `condensation` (context compression) ve
   `streaming_delta` (partial LLM output) AIECP'de yok.

2. **Action/Observation duality**: OpenHands, her action'ın bir
   observation'ı takip ettiği bir model kullanıyor
   (`ActionEvent → ObservationEvent`, `action_id` ile bağlı).
   AIECP'de bu `Event.kind: "action"` ve `Event.kind: "observation"`
   olarak ayrılmış ama `action_id`/`observation_id` çapraz-referansı
   yok — OpenHands'in `observation.action_id` field'ı AIECP'ye
   eklenebilir (Event schema'ya `action_ref` opsiyonel field'ı
   olarak).

3. **SourceType enum**: `"agent" | "user" | "environment" | "hook"`.
   AIECP'nin `Event.source` field'i serbest metin. Enum'a geçmek
   daha güvenli olabilir ama schema değişikliği gerektirir (ADR
   gerekir).

4. **CmdOutputMetadata**: OpenHands, bash komut çıktısında
   `exit_code, pid, username, hostname, working_dir, py_interpreter_path`
   gibi metadata yakalıyor. AIECP'nin `Event.payload`'ı serbest
   format — bu alanlar `Event.payload` içinde convention olarak
   önerilebilir (schema değişikliği gerekmez).

5. **SecurityRisk enum**: `UNKNOWN | LOW | MEDIUM | HIGH`.
   AIECP'de `Incident.severity` enum'u benzer ama Event seviyesinde
   security risk etiketleme yok. `Event.payload.security_risk`
   convention olarak eklenebilir.

6. **InvokeSkillObservation**: OpenHands, skill çağrılarını bir
   observation tipi olarak modellemiş. AIECP'de skill çağrıları
   dolaylı — workflow state'leri skill'lere referans veriyor ama
   runtime'da skill çağrısı ayrı bir event olarak emit edilmiyor.
   Bu ilginç bir fikir ama AIECP'nin mimarisine uymuyor (AIECP'de
   skill'ler prosedür, runtime entity değil).

### Entegre edilecek

- **`Event.payload` convention'ları dokümante et**
  (`docs/evidence-model.md`'ye "Event Payload Conventions" bölümü):
  bash komutları için `exit_code, pid, working_dir` metadata'sı;
  security risk etiketleme convention'ı. Bu alanlar schema'da zorunlu
  değil ama convention olarak önerilir — schema değişikliği gerekmez.

- **`action_ref` opsiyonel field'ı Ekle** (Event schema'ya):
  Bir `observation` event'inin hangi `action` event'ine yanıt olduğunu
  belirtir. Bu, ADR gerektiren bir schema değişikliği — şimdilik
  `payload.action_ref` convention'ı olarak önerilir, gelecekte
  schema'ya eklenebilir.

### NOT entegre edilen (AIECP mimarisine uymuyor)

- **CondensationEvent / StreamingDeltaEvent**: AIECP, context
  compression ve streaming'i LLM runtime'ın sorumluluğunda sayar
  (ADR-0003: "AIECP is a control plane, not a runtime"). Bu event
  tipleri runtime-specific — AIECP'nin Event modelinde yeri yok.

- **ACPToolCallEvent**: Agent Communication Protocol'a özel —
  AIECP agent-agnostic.

---

## BMAD-METHOD — Workflow + Persona Pattern

**Repo:** https://github.com/bmad-code-org/BMAD-METHOD
**License:** MIT (confirmed in NOTICE)
**Commit:** (latest, cloned 2026-08-15)

### Ne bulduk

1. **Workflow.md pattern**: BMAD, her workflow'u bir `.md` dosyası
   olarak yazıyor — `Goal`, `CRITICAL`, `READY FOR DEVELOPMENT STANDARD`,
   `SCOPE STANDARD`, `Conventions`, `On Activation` (step-by-step).
   AIECP'nin workflow'ları `.sm.yaml` (state machine) + `SKILL.md`
   (prosedür) olarak ayrılmış — BMAD'in tek-dosya yaklaşımı daha
   basit ama state machine desteği yok.

2. **"Ready for Development" standard**: Actionable, Logical, Testable,
   Complete, Sufficient, Coherent — 6 kriter. AIECP'nin
   `skills/specification/SKILL.md`'sinde benzer ama 6 kriter olarak
   dokümante edilmemiş. Dış görünüm olarak güzel bir checklist.

3. **Scope standard**: 900-1600 token hedef aralığı, single user-facing
   goal. Bu, AIECP'nin "minimal fix" ilkesiyle uyumlu ama daha spesifik
   bir量化.

### Entegre edilecek

- **`skills/specification/SKILL.md`'ye "Ready for Development" checklist
  ekle**: 6 kriter (Actionable, Logical, Testable, Complete, Sufficient,
  Coherent) + scope standard (900-1600 token, single goal). BMAD'in
  MIT lisansı ADR-0018 kapsamında — paraphrase + attribution ile
  entegre edilebilir.

---

## Diğer Repo'lar — Araştırma

### obra/superpowers (already integrated)

- **Status:** A1 tamamlandı (commit `a7f3d7d`). `systematic-debugging`
  skill'i deepened, NOTICE'te pinned SHA `obra/superpowers@b36e0829`.

### github/spec-kit (already integrated)

- **Status:** A2 tamamlandı (commit `eecf363`). 5 template verbatim +
  attribution, 3 AIECP-original extensions.

### agentskills/agentskills (Apache-2.0)

- **Status:** NOTICE'te kayıtlı. AIECP `ADR-0001` bu spec'i referans
  alıyor. Spec `https://agentskills.io/specification` adresine taşınmış.

### Vercel-labs/skills

- **Status:** Lisans hâlâ doğrulanmadı. Kullanılmıyor.

---

## Entegrasyon Planı (öncelik sırasıyla)

### Hemen yapılacak (bu commit)

1. **`skills/README.md`'ye "Skill Authoring Conventions" bölümü ekle**
   (anthropics/skills'ten öğrenim, paraphrase):
   - Progressive disclosure: `SKILL.md` + `reference/` + `scripts/`
   - "Pushy" description convention
   - Decision tree format
   - Cross-skill references

2. **`docs/evidence-model.md`'ye "Event Payload Conventions" bölümü ekle**
   (OpenHands'ten öğrenim, paraphrase):
   - Bash komutları: `exit_code, pid, working_dir` metadata
   - Security risk: `security_risk` field convention
   - Action-observation pairing: `action_ref` convention

3. **`skills/specification/SKILL.md`'ye "Ready for Development" checklist
   ekle** (BMAD-METHOD'ten öğrenim, paraphrase + attribution):
   - 6 kriter + scope standard

### Sonraki adımlar (gelecek sprint'ler)

4. **`skills/skill-creator/SKILL.md` yaz** (AIECP-original):
   - Yeni skill oluşturma süreci
   - eval_runner.py ile benchmarking
   - Description optimization

5. **OpenHands event tiplerini araştır** (deeper):
   - CondensationEvent → AIECP context-management skill için ilham
   - StreamingDeltaEvent → chat-LLM streaming için ilham

6. **BMAD persona pattern'ini araştır**:
   - AIECP ADR-0005 ("single-agent + workflow state machines, not
     multi-agent orchestration") ile çelişiyor — ama persona-based
     prompt template'leri AIECP skill'lerinde kullanılabilir.

---

## Kaynak Repo Listesi (NOTICE için)

| Repo | License | Ne alındı | Ne zaman |
|---|---|---|---|
| obra/superpowers | MIT | systematic-debugging skill deepening (paraphrase) | A1, commit a7f3d7d |
| github/spec-kit | MIT | 5 spec template (verbatim + attribution) | A2, commit eecf363 |
| anthropics/skills | Apache-2.0 (mixed) | Skill authoring conventions (structural learning, paraphrase) | A3, this commit |
| OpenHands/OpenHands | MIT | Event payload conventions (structural learning, paraphrase) | A4, this commit |
| bmad-code-org/BMAD-METHOD | MIT | "Ready for Development" checklist (paraphrase + attribution) | This commit |
| agentskills/agentskills | Apache-2.0 | Agent Skills spec (ADR-0001 reference) | Phase 0 |

### NOT alındı (lisans kısıtlaması veya mimari uyumsuzluk)

| Repo | License | Neden alınmadı |
|---|---|---|
| anthropics/skills docx/pdf/pptx/xlsx | "© Anthropic, all rights reserved" | Source-available, not open source |
| vercel-labs/skills | Unverified | License not confirmed |
