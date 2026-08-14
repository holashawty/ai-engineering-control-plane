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

## Öncelik sırası (önerilen, 2026-08-14 güncellemesi)

1. ✅ **A1** (superpowers derinleştirme) — TAMAMLANDI.
2. ✅ **B1** (feature-request workflow taslağı) — TAMAMLANDI.
   `code-review` ve `refactor` workflow'ları da artık bloklanmıyor;
   istenirse paralel verilebilir.
3. ✅ **ADR-0018** (izin verici lisanslar için verbatim kopyalama
   politikası) — kontrolcü tarafından TAMAMLANDI.
4. **A2** (spec-kit şablonları) — SONRAKİ ÖNCELİK. spec-kit MIT
   lisanslı, ADR-0018 sayesinde artık gerçek şablon içerikleri
   verbatim + attribution ile alınabilir (paraphrase zorunluluğu
   yok). `specs/*.template.md` dosyalarını doldur.
5. **B2** (B1'deki workflow'larla eşleşen skill'ler) — özellikle
   `specification`, `implementation`, `documentation` skill'leri.
   `feature-request.sm.yaml` şu an bu üç skill'i `skills_required`
   comment'inde "henüz yazılmadı" olarak işaretliyor; gerçek
   SKILL.md dosyaları yazılınca comment'ler kaldırılıp `skills_required`
   listesine eklenebilir.
6. **A3, A4, B3, B4** — arka planda, öncelik sırasıyla.

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
