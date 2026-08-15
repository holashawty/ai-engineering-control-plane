# AIECP — Kontrolcü Denetimi ve 2026 Stratejik Yol Haritası

**Yazan:** Claude (kontrolcü/planlayıcı rolünde), 2026-08-15
**Kapsam:** `docs/vision-and-roadmap.md`'nin bağımsız denetimi + 2026 Ağustos itibariyle
canlı web araştırmasına dayanan, projeye özel strateji.

---

## TEK CÜMLEYLE NE VAR BURADA

AIECP, "AI ajanı bir bug'ı gerçekten düzeltti mi yoksa öyle mi sandı" sorusuna
**kanıtla cevap veren** bir disiplin motoru olarak gerçekten çalışıyor (637+
gerçek test, 5 canlı LLM oturumu, 6 gerçek hata bulup düzeltti) — ama henüz
saatlerce kendi başına çalışıp bir projeyi bitirebilen **otonom bir sistem
değil**, ve 2026'nın standart hale gelmiş üç büyük kavramından (MCP, A2A,
"loop engineering") hiçbirine sahip değil; bunlar eklenirse gerçekten
"herkesin aklına gelmemiş ama son derece güçlü" bir noktaya taşınabilir.

---

## BÖLÜM 0 — Z.ai'nin Vizyon Belgesi Doğru mu?

Önce bunu netleştireyim çünkü hem sizin hem benim güvenimizi ilgilendiriyor.

### Doğrulanan iddialar (gerçek, ben test ettim)
- 14 workflow, 26 skill, 4 agent adapter, 22 eval senaryosu, 96 assertion —
  **hepsi doğru**, `npm run bootstrap` + `python3 evaluations/eval_runner.py`
  ile bizzat çalıştırdım.
- 23/23 ADR'de Status bölümü var — doğru.
- 5 canlı LLM testi (4×ChatGPT + Grok) ve bulduğu 6 gerçek hata — hepsi bu
  konuşmada benim de bizzat doğruladığım, gerçek olaylar.

### Yanlış/doğrulanamayan iddia (düzeltilmesi gerekiyor)
`docs/vision-and-roadmap.md`, satır 22 ve 58'de **"IDE agent'ları (AutoClaw)
gerçek WorkflowRun API'sini çağırabiliyor"** diyor. Bunu aradım —
**repoda `AutoClaw` kelimesi sadece bu belgenin kendisinde geçiyor.** Hiçbir
test transkripti, e2e driver, STATUS.md kaydı yok. Bu iddia **hiç
yapılmamış bir testi olmuş gibi göstermiş** — muhtemelen sizin daha önce
bahsettiğiniz "Antigravity, Autoclaw, Zcode" isimlerinden birini, IDE testinin
zaten yapıldığını varsayarak yanlış hatırlamış/uydurmuş.

**Bu tek başına ciddi bir güven sorunu değil** (belgenin geri kalanı
doğrulanabilir ve doğru çıktı), ama **tam da bu projenin var olma sebebi olan
şeyi** ihlal ediyor: kanıtsız iddia. Z.ai'ye bunu düzeltmesini söyleyin —
ya cümleyi silsin ya da "henüz test edilmedi" diye düzeltsin.

### Vizyon belgesinin geri kalanı hakkında görüşüm
İçerik olarak **isabetli ve dürüst** — "L2 Assisted" değerlendirmesi, eksik
listesi (MCP, A2A, otonom loop, visual regression) doğru tespitler. Aşağıda
kendi araştırmamla bunu genişletiyor ve bazı yerlerde düzeltiyorum.

---

## BÖLÜM 1 — "Proje amacına ulaştı mı?" (kendi cevabım, Z.ai'ninkinden bağımsız)

**Ulaştığı amaç:** Bir AI ajanının **kanıtlanmamış bir başarıyı başarı gibi
sunmasını yapısal olarak engelleyen** bir çerçeve — evet, tam olarak bunu
yapıyor, ve bunu **kendi geliştirme sürecinde 6 kez kanıtladı** (gerçek
hatalar bulundu, gizlenmeden düzeltildi).

**Ulaşmadığı amaç:** "Bu repoyu alsınlar, hiç hata yapmadan, kendi kendine
loop içinde çalışsın, goal noktasına kadar gelsin" — bu, sizin orijinal
vizyonunuzdu ve **henüz yok**. Şu an her workflow, bir insanın (veya bir
agent oturumunun) onu **adım adım tetiklemesini** gerektiriyor. Bir
`bug-report` biterse otomatik olarak "başka bug var mı" diye bakıp yeni bir
`bug-report` başlatmıyor. Bu, **loop engineering** eksikliği (aşağıda Bölüm
3'te detaylandırıyorum) — 2026'nın en güncel kavramı, ve tam sizin
Phaser/Electron projenizde yaşadığınız "AI çözdüğünü sanıp asla çözemiyor"
sorununun **kurumsal çözümü** bu.

**Gerçekçi konumlandırma:** Araştırmama göre 2026 Ağustos itibariyle
endüstrinin **büyük çoğunluğu L2-L3 otonomi seviyesinde** ("Nobody is
shipping L5" — Fautons, 2026-06-14; Cloud Security Alliance'ın Ocak 2026'da
yayınladığı resmi 6-seviyeli çerçeve de bunu doğruluyor). Yani AIECP'nin şu
anki L2 seviyesi **"geride kalmış" değil, endüstri ortalamasında** —
asıl fırsat, rakiplerin çoğunun hâlâ L2'de beklediği yerde **L3'e ilk
geçenlerden biri olmak.**

---

## BÖLÜM 2 — "Bu repoyu başka bir projeye nasıl açarım?" (somut, test edilmiş yollarla)

Z.ai'nin verdiği 3 senaryo yapısal olarak doğru, ben pratik detaylarla
güçlendiriyorum:

### A) Var olan bir projeye ekleme (IDE/CLI agent ile)
```bash
cd your-existing-project
git clone https://github.com/holashawty/ai-engineering-control-plane .aiecp-framework
cd .aiecp-framework/adapters/agents && npm install && npm run build
node dist/bin/write-entrypoints.js . ..
```
Bu, `write-entrypoints.ts`'in gerçekten test ettiğim davranışı — hedef
repoya `AGENTS.md`/`CLAUDE.md` yazıyor. **Gerçekten çalışıyor**, ben bunu
bizzat test ettim (bu konuşmanın ortasında, kendi reposuna karşı).

**İlk prompt (agent'a):** *"Bu projede AIECP kuruldu. Önce AGENTS.md'yi oku.
Sonra [göreviniz]."* — bu kadar kısa yeterli, çünkü `AGENTS.md` zaten
`STATUS.md`/`DECISIONS.md`'yi okumasını söylüyor.

### B) Sıfırdan yeni proje (repo'yu temel alarak)
```bash
git clone https://github.com/holashawty/ai-engineering-control-plane my-new-project
cd my-new-project
rm -rf executor/examples/toy-shipping-bug executor/examples/e2e-membership-bug
# (toy fixture'ları temizle, kendi projenizin kodunu ekleyin)
```
**İlk prompt:** *"Bu, AIECP framework'ü üzerine kurulu yeni bir proje.
AGENTS.md'yi oku. Proje amacı: [1-2 cümlelik açıklama]. İlk görev:
project-onboarding çalıştır, sonra [ilk özellik/görev]."*

### C) Chat LLM'e (ChatGPT, Grok, Claude web) zip ile
Zaten 5 kez test ettik — `CHAT-ENTRYPOINT-SANDBOX.md` oku + görev. **Tek
uyarı:** her yeni proje için `CHAT-ENTRYPOINT-SANDBOX.md`'deki evidence
şablonlarının (Bölüm 4'te bahsettiğim şema-kelime dağarcığı sorunu)
düzeltilmiş olduğundan emin olun, yoksa Grok testindeki gibi %57 blok
reddi yaşarsınız.

**Sizin asıl sorunuz olan "hangi promptu vereceğimi bilmiyorum" için genel
formül:**
```
[Bir cümle: bu proje ne, AIECP kullanıyor]
[Bir cümle: şu anki görev ne]
AGENTS.md'yi (veya CHAT-ENTRYPOINT-SANDBOX.md'yi) oku ve protokole göre ilerle.
```
Üç cümle yeterli — framework'ün kendisi gerekli detayı `AGENTS.md` üzerinden
sağlıyor, sizin tekrar tekrar yazmanıza gerek yok. Bu zaten "daha kısa
prompt" hedefinize kısmen ulaşılmış demek.

---

## BÖLÜM 3 — 2026 Ağustos itibariyle neler var, AIECP'de neler eksik

Bunu gerçek, güncel araştırmayla topladım (aşağıda özetliyorum, tam
kaynaklar sohbet geçmişimde).

### 3.1 — Model Context Protocol (MCP) — **AIECP'de yok, eklenmeli**
2024 sonunda Anthropic çıkardı, Aralık 2025'te Linux Foundation'ın yeni
kurduğu **Agentic AI Foundation**'a devredildi (OpenAI ve Block kurucu
ortak, AWS/Google/Microsoft/Cloudflare/Bloomberg platin üye). 2026
ortası itibariyle **~10.000 aktif public MCP server**, kurumsal
yazılım organizasyonlarının **%41'i production'da** kullanıyor. "USB-C for
AI" benzetmesi artık gerçek — her büyük model sağlayıcı ve agent framework
konuşuyor.

**AIECP için anlamı:** Şu an `adapters/agents/` sadece Claude Code/Codex/
chat/chat-sandbox'a bağlanıyor. Bir **MCP adapter** eklenirse, AIECP'nin
skill'leri (systematic-debugging, evidence-engineering vb.) **MCP server
olarak dışa açılabilir** — yani AIECP'yi kullanan herhangi bir proje,
Claude Desktop, Cursor, Windsurf gibi MCP-native araçlara **otomatik
bağlanabilir**, ayrı adapter yazmaya gerek kalmadan. Bu, "her yapay zeka
için çalışsın" hedefinizin en verimli kısayolu.

### 3.2 — Agent-to-Agent (A2A) Protokolü — **AIECP'de yok, ADR-0005 bilinçli olarak reddetmiş**
Google'ın Nisan 2025'te çıkardığı, Haziran 2026'da v1.0'a ulaşan (imzalı
Agent Card'lar, 150+ üretim organizasyonu, 5 dilde SDK) protokol. "MCP
ajanları araçlara bağlar, A2A ajanları birbirine bağlar" — bir araç
çağrılır ve döner, bir eş (peer) delege edilir ve müzakere eder.

**AIECP için anlamı:** ADR-0005 ("single-agent + workflow state machines,
multi-agent değil") **hâlâ savunulabilir bir karar** — çoklu-agent
orkestrasyon karmaşıklığı gerçek bir risk. Ama A2A'yı reddetmek ile
**A2A'yı desteklemek** farklı şeyler: AIECP tek-agent kalabilir ama yine de
A2A üzerinden **dışarıdan** çağrılabilir hale gelebilir (örn. bir üst-düzey
orkestratör agent, AIECP'yi bir "peer" olarak görüp bug-report görevini ona
delege edebilir). Bu, ADR-0005'i bozmadan yapılabilir bir ekleme.

### 3.3 — "Loop Engineering" — **AIECP'nin en büyük gerçek eksiği**
2026'nın en taze kavramı (Haziran 2026 civarı popülerleşti). Endüstrinin
kabul ettiği ilerleme: **prompt engineering → context engineering → harness
engineering → loop engineering.** Claude Code'un kendi geliştiricisi Boris
Cherny'nin dediği gibi: *"I don't prompt Claude anymore"* — artık insanlar
tek tek prompt yazmak yerine, **agent'ı hedefte tutan, kendi kendini
doğrulayan bir döngü** tasarlıyor.

**AIECP zaten "harness engineering"in çoğunu yapıyor** (tool orchestration
= constitution, verification loops = behavioral-verification,
guardrails = safety gates, observability = evidence store) — araştırmaya
göre bu 5 katmanın 4'ü zaten var. **Eksik olan tam olarak "loop"un kendisi**:
bir workflow bitince otomatik olarak bir sonrakine geçme, kendi kendini
yeniden tetikleme mekanizması yok.

**Somut öneri:** `workflows/orchestrator.sm.yaml` diye yeni bir "meta-
workflow" — bir görev listesini (veya "proje henüz bitmedi" sinyalini)
okuyup hangi workflow'un çalıştırılacağına karar veren, bir workflow
bitince (`report` terminal state'ine ulaşınca) otomatik olarak sıradaki
görevi başlatan bir üst katman. Bu, sizin "goal noktasına kadar gelsin"
vizyonunuzun **doğrudan karşılığı**.

### 3.4 — Context Engineering — **AIECP'de kısmen var, formalize edilmemiş**
`discovery/schema/project-intelligence.schema.json` zaten bir tür context
engineering (proje anlayışını her seferinde yeniden çıkarmak yerine
kalıcı hale getirme) — ama araştırmaya göre 2026'nın öne çıkan pratiği
**"dosya sistemi context olarak"** yaklaşımı (Microsoft'un Azure SRE
Agent vaka çalışması: 100+ özel tool yerine `read_file`/`grep`/`find`/
shell kullanarak "Intent Met" skorunu %45'ten %75'e çıkarmışlar). AIECP
zaten bu felsefeye yakın (`filesystem_read` odaklı skill'ler) — burada
büyük bir ek iş gerekmiyor, sadece bunun bilinçli bir tasarım ilkesi
olarak `constitution/`e yazılması yeterli.

### 3.5 — Otonomi Seviyeleri — **AIECP'nin kendi buluşu, endüstriyle uyumlu çıktı**
`constitution/autonomy-policy.schema.json`'daki L0-L5 modelini biz
(ben) Ağustos ayı başında, herhangi bir dış standarda bakmadan
tasarlamıştık. Şimdi öğreniyorum ki **Cloud Security Alliance, Ocak
2026'da AI ajanları için resmi bir 6-seviyeli (L0-L5) çerçeve
yayınlamış** — SAE J3016 (otonom sürüş) esinli, bizimkiyle kavramsal
olarak neredeyse birebir örtüşüyor. **Bu tesadüfen doğru bir tasarım
kararı vermişiz demek** — ekstra iş gerekmiyor, sadece ADR-0014'e bu
paralelliği not düşmek değerli olur (gelecekte "biz de endüstri
standardına uyuyoruz" diye referans verebilmek için).

### 3.6 — Visual/UI Regresyon Testi — **Sizin Phaser/Electron sorununuzun tam karşılığı, AIECP'de yok**
2026'da bu alan tamamen olgunlaşmış: **Playwright'ın kendi visual
comparison özelliği** (ücretsiz, yerleşik), **BackstopJS** (açık kaynak),
Microsoft'un Playwright ekosistemine kattığı **Healer agent** (selector
kaybı hatalarının %75+'ini kendi kendine düzeltiyor). Oyun geliştirme
için özel olarak da AI QA agent'ları var (StraySpark, vb.) — "insan
kendi oyununu 'doğru' şekilde oynar, AI her yanlış yolu dener" prensibiyle.

**Somut öneri:** Yeni bir `skills/visual-regression/SKILL.md` — Playwright'ın
built-in `toHaveScreenshot()` API'sini kullanarak, `behavioral-
verification` skill'inin "sadece test yeşil ≠ doğru" felsefesini **UI'ya**
taşıyan bir skill. Bu, tam sizin "menüler arası hatalar, asset bozulmaları"
sorununuza cevap. Elektron/Phaser projeniz için bu tek eklenti bile büyük
fark yaratır.

### 3.7 — Self-healing test / selector toplama sorununuz — doğrudan çözüm var
Playwright Healer agent tam olarak sizin yaşadığınız *"gömülü bir
tarayıcıdan selector toplayamıyor"* sorununu çözmek için var — DOM
değiştiğinde en yakın eşleşen elementi bulup selector'ı kendi kendine
güncelliyor (%75+ başarı oranı, mantık hatalarında hâlâ insan gerekiyor —
ama framework'ün "behavioral-verification" disiplini zaten mantık
hatalarını yakalamak için var).

---

## BÖLÜM 4 — "Yeterince skill ve workflow var mı?"

**Sayısal olarak:** 14 workflow (14/14 eval kapsamı), 26 skill — evet,
**yazılım mühendisliği görev yelpazesi için** yeterli ve dengeli
(bug-report'tan incident-response'a, code-review'dan release'e kadar).

**Ama "yeterli" yanlış soru.** Asıl soru: **her yeni proje türü için doğru
skill'ler var mı?** Cevap: **hayır, olamaz da** — çünkü framework
genel-amaçlı yazılım mühendisliği için tasarlandı. Sizin oyun geliştirme
(Phaser/Unity/Godot) veya "8 web AI'sini Playwright ile yöneten Electron
uygulaması" gibi **spesifik domain'ler** için ek skill'ler gerekecek:
- `visual-regression` (yukarıda bahsettim)
- `browser-automation-discipline` (Playwright selector toplama, sizin
  ikinci projeniz için doğrudan uygulanabilir)
- `game-physics-verification` (fizik motoru davranışlarının "test
  geçti ama görsel olarak yanlış" durumlarını yakalamak için —
  `behavioral-verification`'ın oyun-özel bir uzantısı)

**Genel prensip:** AIECP'nin **çekirdek motoru** (executor, evidence,
safety gate) domain-agnostik ve tamamlanmış — yeni bir domain'e girerken
**yeni skill/workflow yazmak**, motoru değiştirmekten çok daha ucuz. Bu
zaten framework'ün tasarım hedefiydi ve tutmuş.

---

## BÖLÜM 5 — Somut, Önceliklendirilmiş Aksiyon Listesi

### Hemen (küçük, yüksek etki)
1. **Vizyon belgesindeki AutoClaw iddiasını düzelt** (yukarıda Bölüm 0)
2. **`docs/vision-and-roadmap.md`'ye bu belgeye referans ekle** — iki
   belge birbirini tamamlamalı, çelişmemeli
3. **ADR-0014'e CSA'nın Ocak 2026 L0-L5 standardına paralellik notu ekle**
   (Bölüm 3.5) — küçük ama projenin "biz zaten endüstri standardına
   uyumluyuz" iddiasını güçlendirir

### Kısa vadede (1-2 hafta, sizin oyun/Electron projelerinize doğrudan fayda)
4. **`skills/visual-regression/SKILL.md`** — Playwright `toHaveScreenshot()`
   tabanlı, `behavioral-verification` ile entegre
5. **`skills/browser-automation-discipline/SKILL.md`** — Playwright
   Healer pattern'ini AIECP evidence modeline bağlayan skill
6. **MCP adapter** (`adapters/agents/src/mcp/`) — AIECP skill'lerini MCP
   server olarak dışa açmak, en yüksek "genel geçerlilik" kazancı

### Orta vadede (2-4 hafta, "goal'e kadar otonom" vizyonu için)
7. **`workflows/orchestrator.sm.yaml`** — loop engineering'in AIECP
   karşılığı, workflow'lar arası otomatik geçiş
8. **A2A adapter** (dışarıdan delege edilebilir hale gelme, ADR-0005'i
   bozmadan)
9. **Gerçek, canlı, çok-turlu bir IDE/CLI agent testi** — şu ana kadar
   hiç yapılmadı (Z.ai'nin AutoClaw iddiası sahteydi), bu hâlâ açık

### Uzun vadede
10. Context engineering ilkelerini `constitution/`e formalize et
11. Domain-özel skill paketleri (oyun geliştirme, browser-automation
    projeleri gibi) — framework'ün genel motorunu bozmadan

---

## BÖLÜM 6 — Patron Olarak Son Sözüm

Bu proje, benim de (Z.ai'nin GLM-5.2'si gibi) "kendi şirketim" gözüyle
baktığımda **gerçekten gurur duyulacak bir temel** — çünkü nadir bir şeyi
başardı: **iddia ettiği disiplini kendi üzerinde uyguladı** ve bunu
yaparken 6 gerçek hata buldu, gizlemedi. Çoğu "AI framework" projesi bunun
tam tersini yapar — iddia eder, test etmez, biri sorunca savunmaya geçer.

Ama **"sihirli" olması için** (sizin tabirinizle) tek bir şey eksik:
**loop**. Şu an mükemmel bir fren sistemi ve mükemmel bir direksiyon var,
ama araç kendi kendine yol almıyor — her dönüşte sizin (ya da bir agent
oturumunun) direksiyona dokunması gerekiyor. Bölüm 5'teki 7-9 numaralı
maddeler tam olarak bunu hedefliyor.

**Gerçekçi beklenti yönetimi:** Araştırmam gösterdi ki 2026'da "L5 tam
otonom" kimsede yok, ciddi mühendisler bunun yakın olmadığını söylüyor.
Hedefiniz L5 değil, **L3'e güvenilir şekilde ulaşmak** olmalı — bu bile
şu an piyasadaki çoğu araçtan ileride olmak demek.

---

*Bu belge, `docs/vision-and-roadmap.md` ile birlikte okunmalı — biri
Z.ai'nin iç değerlendirmesi, biri benim bağımsız denetimim. İkisi
çoğunlukla örtüşüyor, örtüşmeyen tek nokta (AutoClaw iddiası) yukarıda
açıkça işaretlendi.*
