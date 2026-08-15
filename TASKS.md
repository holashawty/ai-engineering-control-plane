# AIECP — Sıradaki Faz Görev Listesi
**Oluşturulma tarihi:** 2026-08-14 (revize: 2026-08-14, A1 + B1 tamamlandı)
**Repo:** holashawty/ai-engineering-control-plane (private)
**Son commit:** (B1 commit'i bu dokümanla birlikte geliyor — bkz. aşağıda)

Bu liste, kullanıcının Z.ai'yi (chat + cloud agent) yönlendirmesi ve
Claude'un (bu asistan) **kod/proje kontrolcüsü ve planlayıcı** olarak
çalışması için hazırlanmıştır.

---

## 2026-08-14 güncellemesi — tamamlananlar

- **ADR-0018** (kontrolcü tarafından): MIT/Apache/BSD lisanslı upstream
  kod için verbatim kopyalama + attribution artık serbest. Eski
  "asla verbatim kopyalama" kuralı superpowers/MIT gibi izin verici
  lisanslar için geçersiz; sadece kısıtlı/doğrulanmamış lisanslar
  (anthropics/skills'in docx/pdf/pptx/xlsx'i, vercel-labs/skills)
  için paraphrase-only kuralı duruyor. `constitution.md` §6 ve
  `README.md`'deki upstream link listesi güncellendi. Commit `2b2a74e`.
- **A1** (Z.ai Agent tarafından, kontrolcü tarafından onaylanıp merge
  edildi): `systematic-debugging` skill'inin derinleştirilmesi.
  Superpowers'tan öğrenilen teknikler (shell-level evidence toplama,
  backward call-chain tracing, find-polluter bisection,
  condition-based-waiting, three-failure rule, defense-in-depth)
  AIECP Evidence Model dilinde yeniden ifade edildi. Branch
  `feature/a1-systematic-debugging-deepen` `--no-ff` ile main'e
  merge edildi, NOTICE'te pinned SHA `obra/superpowers@b36e0829` ile
  section-by-section attribution var.
- **B1** (Z.ai Agent tarafından, kontrolcü validation'ından geçti):
  `workflows/feature-request.sm.yaml` yazıldı ve gerçek executor'dan
  uçtan uca geçirildi. 10 state, 15 transition, `implement` state'inde
  `broad-refactor` safety gate, `question_economy` (max=2,
  allowed=[classify,design]). 23/23 assertion geçen proof driver
  `executor/examples/e2e-feature-request/drive-run.mjs` altında;
  structural validator `scripts/validate-feature-request.mjs` altında.
  Bu, executor'ın workflow-agnostic olduğunu kanıtlayan ikinci
  proof point (ilki `bug-report` ile membership off-by-one idi).

Bu üç madde STATUS.md'in "Done" bölümünde işaretli. Aşağıdaki listede
A1 ve B1'in yanına ✅ eklendi; bir sonraki öncelik A2.

---

## İş bölümü (düzeltilmiş)

| Araç | Yetenek | Bu listede kullanılacağı yer |
|---|---|---|
| **Z.ai Agent** (siteki agent bölümü, kendi bulut bilgisayarı) | Repo klonlama, dosya okuma/yazma, kod çalıştırma, test, commit/push — tam bir geliştirme ortamı | Grup A (gerçek upstream entegrasyonu) + Grup B (içerik üretimi) + kod yazma gerektiren her şey |
| **Z.ai Chat** (deep research / max thinking mode) | Web araştırması, derin analiz, karşılaştırma | Grup B'deki saf araştırma alt-görevleri (B3, B4) |
| **Claude (ben)** | Kod/proje denetimi, mimari tutarlılık kontrolü, plan güncelleme | **Kontrolcü + planlayıcı.** Z.ai'nin çıktısını denetler: doğru mu, eksik mi, DECISIONS.md/şemalarla tutarlı mı, güvenlik açığı var mı. Gerekirse düzeltme talimatı yazar. Yeni görev tanımlar. |

**Önceki hata:** Bir önceki TASKS.md sürümünde Grup A'yı ("gerçek repo
klonlama gerektiren işler") yanlışlıkla sadece Claude'a atamıştım,
Z.ai'nin chat modunun repo erişimi olmadığını Z.ai'nin *hiçbir*
modunun repo erişimi olmadığı şeklinde genellemiştim. Bu yanlıştı —
Z.ai Agent (bulut bilgisayar) tam donanımlı bir geliştirme ortamı.
Düzeltildi.

**Claude'un yeni rolü net olsun diye:** Aşağıdaki görevlerin hiçbirini
"ben yapayım" diye üstlenmeyeceğim. Z.ai Agent'a görev olarak
verilecekler, ben sonucu inceleyip onaylayacağım/reddedeceğim/
düzeltme isteyeceğim.

---

## İş bölümü (düzeltilmiş)

| Araç | Yetenek | Bu listede kullanılacağı yer |
|---|---|---|
| **Z.ai Agent** (siteki agent bölümü, kendi bulut bilgisayarı) | Repo klonlama, dosya okuma/yazma, kod çalıştırma, test, commit/push — tam bir geliştirme ortamı | Grup A (gerçek upstream entegrasyonu) + Grup B (içerik üretimi) + kod yazma gerektiren her şey |
| **Z.ai Chat** (deep research / max thinking mode) | Web araştırması, derin analiz, karşılaştırma | Grup B'deki saf araştırma alt-görevleri (B3, B4) |
| **Claude (ben)** | Kod/proje denetimi, mimari tutarlılık kontrolü, plan güncelleme | **Kontrolcü + planlayıcı.** Z.ai'nin çıktısını denetler: doğru mu, eksik mi, DECISIONS.md/şemalarla tutarlı mı, güvenlik açığı var mı. Gerekirse düzeltme talimatı yazar. Yeni görev tanımlar. |

**Önceki hata:** Bir önceki TASKS.md sürümünde Grup A'yı ("gerçek repo
klonlama gerektiren işler") yanlışlıkla sadece Claude'a atamıştım,
Z.ai'nin chat modunun repo erişimi olmadığını Z.ai'nin *hiçbir*
modunun repo erişimi olmadığı şeklinde genellemiştim. Bu yanlıştı —
Z.ai Agent (bulut bilgisayar) tam donanımlı bir geliştirme ortamı.
Düzeltildi.

**Claude'un yeni rolü net olsun diye:** Aşağıdaki görevlerin hiçbirini
"ben yapayım" diye üstlenmeyeceğim. Z.ai Agent'a görev olarak
verilecekler, ben sonucu inceleyip onaylayacağım/reddedeceğim/
düzeltme isteyeceğim.

---

## GRUP A — Gerçek Upstream Entegrasyonu (Z.ai Agent yapacak, Claude denetler)

### A1. ✅ superpowers'ı gerçekten klonla ve systematic-debugging'i zenginleştir
- **Durum:** TAMAMLANDI (2026-08-14). Branch `feature/a1-systematic-debugging-deepen`
  `--no-ff` ile main'e merge edildi, kontrolcü tarafından doğrulandı
  (pinned SHA `obra/superpowers@b36e0829` GitHub'da teyit edildi,
  gerçek dosyaların varlığı doğrulandı, frontmatter YAML geçerli,
  verbatim-copy review yapıldı).
- **ADRs notu:** ADR-0018 sonrası "asla verbatim" kuralı MIT için
  kalktı; bu görevde paraphrase tercih edilmişti ama bu bir kural
  değil, tercihti. Gelecekteki benzer entegrasyonlarda verbatim +
  attribution da tercih edilebilir (her durumda NOTICE'e yazılır).
- **Kabul kriteri:** Sağlandı (NOTICE güncel, SHA pinned, format
  korunmuş, kontrolcü tarafından teyit edildi).

### A2. spec-kit'in gerçek `specs/` şablonlarını incele ve uyarlamayı derinleştir
- **Ne:** `github/spec-kit` reposunu clone et, gerçek
  `spec.md`/`plan.md`/`tasks.md`/`constitution.md` şablonlarını oku
  (şu an bizim `specs/` klasörü sadece placeholder). Bizim
  Specification layer'ımız (ADR-0002) için gerçek şablon içeriğini
  uyarla — `contracts.md`, `invariants.md`, `state-machines.md`
  eklentileriyle birlikte.
- **Z.ai Agent'a verilecek prompt:** (A1 ile aynı kalıp — clone, oku,
  bizim repoyu clone et, `specs/*.template.md` dosyalarını doldur,
  NOTICE güncelle, branch'te bırak, push etme.)
- **Kabul kriteri:** `specs/spec.template.md` vb. artık placeholder
  değil, gerçek, kullanılabilir şablon içeriği var; NOTICE güncel.

### A3. anthropics/skills'in klasör yapısını incele (lisans nedeniyle SADECE yapı, kopya değil)
- **Ne:** Bu repo mixed-license (bkz. NOTICE) — document skill'leri
  source-available, kopyalanamaz. Yapısını (progressive disclosure,
  `reference/` klasör kullanımı) inceleyip bizim `skills/` klasör
  konvansiyonumuzu iyileştir.
- **Z.ai Agent'a verilecek prompt:** Clone et, yapıyı incele, **hiçbir
  içerik kopyalamadan** `skills/README.md`'ye "skill authoring
  conventions" bölümü ekle.
- **Kabul kriteri:** Kod/metin kopyası yok (lisans ihlali riski sıfır
  olmalı — Claude bunu özellikle kontrol edecek), sadece yapısal öğrenim.

### A4. OpenHands'in event-stream şemasını incele, bizim Trace/Event modeliyle karşılaştır
- **Ne:** `OpenHands/OpenHands` reposunda event/observation şemasını
  incele, bizim `evidence/schema/trace.schema.json` +
  `event.schema.json` ile karşılaştır.
- **Kabul kriteri:** `docs/evidence-model.md`'ye karşılaştırma notu
  eklenir; gerçek iyileştirme varsa yeni ADR + schema_version bump
  önerisiyle Claude'a sunulur (Claude onaylamadan şema değişmez —
  ADR-0008 gereği).

---

## GRUP B — Z.ai (Agent veya Chat/deep research) İçerik Üretimi

### B1. ✅ Kalan workflow'lar için `.sm.yaml` taslakları (ilk öncelik: feature-request)
- **Durum:** KISMEN TAMAMLANDI (2026-08-14). `feature-request.sm.yaml`
  yazıldı, gerçek executor'dan uçtan uça geçirildi (23/23 assertion),
  `_router.md` "implemented" olarak işaretlendi, `package.json`'a
  `npm run e2e:feature-request-demo` ve `npm run validate:feature-request`
  script'leri eklendi. Bu, executor'ın workflow-agnostic olduğunu
  kanıtlayan ikinci proof pointtir.
- **Kalan:** `code-review` ve `refactor` (TASKS.md öncelik sırasındaki
  diğer ikisi) artık bloklu değil — executor sorusu çözüldü. Bu iki
  workflow, yapısal olarak farklı şekiller (read-mostly ve
  behavior-preserving) eklemek için hâlâ değerli, ancak acil
  değiller. Bir sonraki sprit'a bırakılabilir veya paralel verilebilir.

### B2. Kalan ~15 skill için `SKILL.md` taslakları
- **Ne:** B1'deki yeni workflow'larla eşleşen skill'ler öncelikli.
- **Kabul kriteri:** Frontmatter geçerli, gerçek dosya referansları var
  (uydurma yol yok), en az 1 happy-path + 1 failure-mode örneği.

### B3. Yeni upstream alternatiflerinin araştırılması (Z.ai Chat/deep research)
- **Ne:** İlk 7 repo dışında, evidence-based debugging / agent
  orchestration alanında yeni öne çıkan projeler var mı?
- **Kabul kriteri:** Claude bulunanları `docs/research.md`'ye ekler,
  değerliyse Grup A'ya yeni görev açılır (Z.ai Agent'a clone görevi).

### B4. `evaluations/`, `tests/` altındaki boş klasörler için içerik taslağı
- **Ne:** Phase 8 hazırlığı — eval senaryosu taslakları.
- **Ön koşul:** B1/B2 kısmen tamamlanmış olmalı.

---

## GRUP C — Claude'un Rolü: Kontrolcü + Planlayıcı

Bu grupta Claude "görev yapmaz", **denetler ve yönlendirir:**

### C1. Her Z.ai çıktısını gerçek araçlarla doğrula
- Z.ai'nin ürettiği her `.sm.yaml`'ı gerçek `executor`'dan geçirip
  yapısal doğrulama yapar (dead-end, dangling transition kontrolü).
- Her yeni skill'in frontmatter'ını gerçekten parse eder.
- Kod içeren her PR/branch'i inceleyip: mimari tutarlılık, güvenlik
  (credential sızıntısı, redaction), lisans/attribution doğruluğu
  kontrol eder.

### C2. Eksik/unutulmuş şeyleri tespit et
- Z.ai'nin bir görevi "bitti" dediği ama gerçekte eksik bıraktığı
  yerleri bulur (örn. NOTICE güncellenmemiş, test yazılmamış,
  STATUS.md güncellenmemiş).
- Bunu kullanıcıya açıkça raporlar: "Z.ai şunu yaptı, şunu unuttu,
  şurada hata var."

### C3. Planı sürekli güncelle
- Her tamamlanan görev sonrası bu dosyayı (`TASKS.md`) ve
  `STATUS.md`'yi günceller, yeni öncelik sırası önerir.
- Kullanıcı onaylarsa commit/push eder (push yetkisi hâlâ token
  üzerinden Claude'da — bu değişmedi, sadece "kim kod yazıyor"
  değişti).

---

## Öncelik sırası (önerilen, 2026-08-14 güncellemesi #4)

1. ✅ **A1** (superpowers derinleştirme) — TAMAMLANDI.
2. ✅ **B1** (feature-request workflow taslağı) — TAMAMLANDI.
3. ✅ **ADR-0018** (izin verici lisanslar için verbatim kopyalama
   politikası) — kontrolcü tarafından TAMAMLANDI.
4. ✅ **C2** (3 workflow + 5 skill + 2 meta-skill + chat adapter)
   — TAMAMLANDI.
5. ✅ **C3** (ADR-0019 + constitution §8 + 3 tool-use discipline skill
   + CHAT-ENTRYPOINT manifesto) — TAMAMLANDI.
6. ✅ **D-sprint** (3 yeni workflow + skill: project-onboarding,
   regression, performance-problem) — TAMAMLANDI (bu commit).
   Subagent'lar D1/D2/D3 paralel çalıştı, 36+43+41 = 120 yeni
   assertion PASS. Toplam 8 runnable workflow, 16 skill.
7. ✅ **A2** (spec-kit şablonları) — TAMAMLANDI (bu commit). 5
   spec-kit şablonu verbatim + attribution ile `specs/`'e
   vendored (ADR-0018, MIT, commit `83883a2`). 3 AIECP-original
   extension şablonu (contracts/invariants/state-machines)
   ADR-0002'ye göre yazıldı.
8. ✅ **Chat-harness** (live-session test altyapısı) — TAMAMLANDI
   (bu commit). `scripts/chat-harness.mjs` — patron evinde
   ChatGPT/Claude chat ile test yapabilir: chat LLM'in response'u
   file veya stdin, harness workflow'u drive eder, schema-valid
   yapar, terminal state'e ulaşıp ulaşmadığını söyler. Smoke
   test: 22/22 blok PASS, bug-report workflow intake → report.
9. **Actual live session test** — SONRAKİ ÖNCELİK. Patron evinde
   gerçek ChatGPT/Claude chat ile bir task versin, LLM CHAT-ENTRYPOINT.md
   okuyup `aiecp:*` blokları emit etsin, patron
   `npm run chat-harness -- <workflow> <response.md>` çalıştırıp
   sonucu görsün. Bu "structural proof → canlı kanıt" gap'ini
   kapatır. Constitution §8 chat LLM'leri tool kullanmaya ZORLUYOR —
   bu test, ZORLAMANIN çalıştığını kanıtlayacak.
10. **Eval harness** (Phase 8, Python) — her skill için ≥5 senaryo,
    her workflow için ≥3 senaryo. Şu an 9 proof-of-concept e2e
    driver var ama hiçbürü formal eval değil.
11. **Kalan 6 workflow + ~3 skill** — uzun kuyruk, düşük öncelik.
    (user-complaint, security-problem, release, incident,
    unknown-failure fallback; database/frontend/backend skill'leri.)
12. **"Son vurucu darbe"** — patron'un vizyonu: "hazır çalışan çok
    zeki hazır proje ve sistemleri de kusursuz entegre edip diğer
    projelerin çok çok üstünde bir yapıya sahip olmak." A2 spec-kit
    tamamlandı; A3 (anthropics/skills), A4 (OpenHands) geri kalan.
    README'deki upstream repo listesi bu entegrasyonların öncül
    hazırlığı.

## Bu listenin kullanımı

1. Kullanıcı, Z.ai Agent'a yukarıdaki prompt'ları (branch'te bırak,
   push etme talimatıyla) verir.
2. Z.ai Agent işi yapar, branch'i/diff'i kullanıcıya gösterir.
3. Kullanıcı diff'i (veya branch linkini) Claude'a getirir.
4. **Claude inceler:** doğru mu, eksik mi, tutarlı mı, güvenli mi —
   ve kararını açıkça söyler (onay / red / düzeltme talebi).
5. Onaylanırsa Claude ana branch'e merge eder / kendi committer
   erişimiyle push eder ve STATUS.md + bu dosyayı günceller.

---

## AIECP PROJESİ — Z.AI AGENT İÇİN KALICI ÇALIŞMA PRENSİPLERİ

Bu bölüm, her görevde tekrar tekrar aynı şeyleri söylememek için
kalıcı bir referanstır. Tüm agent'lar (Z.ai, Claude, süper zeka)
bu prensiplere uymak zorundadır.

### 1. İDDİA ETME, KANITLA

"X çalışıyor" demeden önce X'i gerçekten çalıştır ve çıktısını göster.
Sayı iddia ediyorsan (örn. "74/74 test geçti") bu sayının nereden
geldiğini gösterebilmelisin. "npm test çalıştırdım, 27/27 PASS verdi"
demek yeterli değil — komutun tam çıktısını göster.

### 2. HER GERÇEK TEST BİR BUG BULABİLİR — BU BAŞARISIZLIK DEĞİL

Şimdiye kadarki 5 canlı LLM testi 6 gerçek sorun buldu (3 catch-22,
1 broken fix, 1 security gap, 1 schema-vocabulary mismatch). Her
biri düzeltildi ve framework güçlendi. Bunu böyle raporlamaya devam
et — gizleme, abartma yapma. "17/30 blok FAIL verdi, işte nedenleri"
demek "30/30 PASS verdi" demekten daha değerli.

### 3. BRANCH + PUSH DISİPLİNİ

Kod/mimari değişikliği gerektiren her görevi ayrı bir feature
branch'te yap, doğrudan main'e push etme. Kontrolcü (Claude) diff'i
inceleyip onaylayana kadar bekle. İstisna: küçük dokümantasyon
düzeltmileri veya typo fix'leri doğrudan main'e push edilebilir.

### 4. HER ŞEMA DEĞİŞİKLİĞİ BİR ADR GEREKTİRİR

`constitution/change-policy.md`'ye göre: `evidence/schema/*`,
`memory/schemas/*`, `discovery/schema/*`,
`constitution/*.schema.json` dosyalarına dokunmadan önce mutlaka
yeni bir ADR yaz. Şema değişikliği = mimari karar = ADR.

### 5. REGRESYON TESTİ OLMADAN GÜVENLİK/DAVRANIŞ DÜZELTMESİ TAMAMLANMAMIŞ SAYILIR

Bir bug düzelttiğinde, o bug'ın regresyonunu yakalayacak bir test
eklemeden "tamamlandı" deme. Bug fix + regression test = tamamlandı.
Bug fix without regression test = yarım kaldı.

### 6. DOKÜMANTASYON = KOD KADAR ÖNEMLİ

CHAT-ENTRYPOINT*.md gibi LLM-yönelik dosyalar, gerçek bir LLM'in
(chat veya IDE) hiç ek açıklama almadan doğru davranmasını sağlamalı.
Belirsiz/eksik örnek = gelecekte bulunacak bir bug demektir. Grok
live test #5 bunu kanıtladı: "summary" yerine "what" kullanılacağı
yeterince net yazılmamıştı, 17 blok FAIL verdi.

### 7. STATUS.md VE NOTICE HER OTURUM SONUNDA GÜNCEL KALSIN

Ne yapıldı, ne yapılmadı, hangi upstream'den ne alındı — hepsi
güncel olmalı. STATUS.md footer'ı her commit'te güncellenmeli.

### 8. GERÇEK VERİYLE TEST ET, UYDURMA SENARYO DEĞİL

Mümkün olduğunda gerçek bir LLM oturumunun (chat veya agent)
ürettiği transkripti test fixture'ı olarak kullan — scripted/sentetik
test verisi, gerçek bir LLM'in yapacağı hataları asla tam olarak
taklit edemez (tam bu session'da 3 kez kanıtlandı: ChatGPT catch-22,
Grok schema mismatch, subagent simülasyon bypass).

---

## 2026-08-14 handoff notu (Z.ai Agent → sonraki agent / kontrolcü)

Bu commit (B1 + A1-in-STATUS + tüm dokümantasyon güncellemeleri)
tek bir mantıksal birim olarak main'e push edilecek. Sonra:

- **Sonraki Z.ai Agent görevi:** A2 (spec-kit şablonları). ADR-0018
  sayesinde artık paraphrase yerine verbatim + attribution
  tercih edilebilir — spec-kit MIT'li, Notice'e satır satır yazmak
  yeterli. Prompt A2'nin altında hazır.
- **Kontrolcüye not:** A1 merge commit'i `--no-ff` ile yapıldı, branch
  history korundu. B1 tek commit olarak main'e gidiyor (workflow +
  proof + router + status + tasks bir arada, çünkü proof script
  workflow'süz anlamsız). Ayrı ayrı split etmeye gerek yok.
- **Bekleyen açık sorular:** (1) `vercel-labs/skills` lisansı hâlâ
  doğrulanmadı — B3 araştırması sırasında kapatılmalı. (2) ADR-0018
  "vendor/ altına mı yoksa interleaved mı" sorusu açık — ilk gerçek
  vendoring (A2 olabilir) sırasında cevaplanacak.
- **Token/Güvenlik:** Push için kullanılan GitHub PAT hiçbir dosyaya,
  commit mesajına, veya STATUS/TASKS'a yazılmadı (ilk draft'ta yanlışlıkla
  prefix yazılmıştı, bu commit'te kaldırıldı). Bash output'larında URL
  redaksiyonu yapıldı (`sed -E 's|//[^@]*@|//***@|g'`). Token iş bitince
  patron tarafından revoke edilecek.
