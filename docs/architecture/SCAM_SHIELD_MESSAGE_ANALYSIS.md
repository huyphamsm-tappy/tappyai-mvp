# Scam Shield · Analyze Message — architecture (V1)

**Status:** implemented on `design/v3-phase4`, not deployed. **Owner decision pending:** merge/UAT.

## Why

A real message — *"your Telegram account is high risk, verify your phone number within 48 hours"* —
carried a link on a brand-new `.cfd` domain. The URL engine correctly found **no evidence against the
link**, and the product showed a reassuring result under a message that was plainly a scam.
Object-level evidence (URL/DNS/TLS/WHOIS/blocklists) cannot see intent. This layer adds
**human-context analysis** and fuses the two, without touching the deterministic URL/QR engine.

## Shape

```
POST /api/scam-shield/analyze  { text?, url?, imageBase64?+mimeType? }
        │
        ▼  lib/scam-shield/message/index.ts
  [screenshot → OCR (AI.vision, gated)]
  normalize ─▶ extract (URLs / phones / emails)
        ├─▶ urlChecks.ts ──▶ checkUrl()  ← the EXISTING engine, unchanged, ≤3 links
        └─▶ rules.ts     (deterministic social-engineering signals, VI/EN/ZH, bilingual explanations)
  router.ts  → tier 0 (bare link: no model) | 1 (`fast`) | 2 (`smart`) | 3 reserved
  ai/analyzer.ts → AI.generate over @/lib/ai/llm (provider-neutral), fenced prompt, zod-validated JSON
  fusion.ts  → rules ⊕ model ⊕ link verdicts → score/level via the engine's own levelFor()
  advice.ts  → deterministic bilingual "do NOT" / "do now"
```

Result type: `MessageAnalysisResult` (`message/types.ts`). Final `risk.level` reuses the engine's six-level
scale, INCONCLUSIVE included.

## Fusion invariants (pinned in `__tests__/fusion.test.ts`, `__tests__/scenarios.test.ts`)

- The model **never decides alone**: its level is a score scaled by its confidence, plus a floor only when
  it is confident (`high_risk ≥ 0.6 → HIGH`, `critical ≥ 0.7 → CRITICAL`).
- Rules impose a **floor** for known-dangerous combinations (threat + verification/link, money + pressure,
  remote-access/install + pretext, OTP + pressure). The Telegram message floors at HIGH with **no model**.
- Rules alone cap at 80 (HIGH). CRITICAL needs a second source.
- An evidence-positive **link** verdict is a floor, exactly as on the URL tab. A confident model "safe"
  may discount rule *noise* but never a floor or a link finding.
- **Reassurance needs coverage**: with no model and no findings, confidence < 50 → INCONCLUSIVE, never SAFE.
- Tier 0 (bare link) mirrors the URL engine's verdict verbatim.

## Cost control — the ONE shared AI question quota (since 2026-09-15)

- There is **no Scam Alerts quota of its own**. A message analysis spends one question from the SAME pool a
  chat turn in any service area spends from: `src/lib/ai/quota/aiQuestionQuota.ts`.
  - Anonymous identity (Supabase anonymous session, or IP when no session): **`ANON_LIFETIME_LIMIT` = 5, for
    the lifetime of the identity** — one trial, once; not per day, not per session, not again tomorrow.
  - Registered account: **`FREE_DAILY_LIMIT` = 15 per VN day** (key carries the VN date; reset = key change).
  - Pro: exempt (unchanged rule: `subscriptions.status='active'` with a future `current_period_end`).
- Backed by the shared rate-limit store (Upstash in production; in-process fallback with no store; configured
  store down ⇒ fail closed). Atomic admit-and-record, so parallel requests cannot over-spend. No table, no
  migration. `/api/subscription` and the subscription page DISPLAY from the same set (`peekAiQuestionQuota`).
- Tier 0 (bare link / QR) spends nothing. Tiers 1/2 spend **one** question; OCR + analysis of a screenshot
  share one gate call; a message that also carries a URL still spends one.
- The pipeline calls the route's `aiGate` **only at the moment a model is about to be called**, at most once.
- When exhausted, the request still returns the deterministic verdict with `analysis.aiStatus =
  'quota_exhausted'` and a `quota` block `{ kind, limit, period, used, remaining, exhausted, pro }`; HTTP 200.
- Tier → role: 1 → `fast`, 2 → `smart`. Tier 3 reserved and absent from the interface.
- The web view calls `ensureAnonymousSession()` before analyzing, so a signed-out browser is metered by its
  anonymous identity rather than by IP.

## Security

- Message text reaches the model **only** inside the `fenceUntrusted('scam_message', …)` DATA span; markers in
  the input are neutralised at normalisation. Instructions inside the message are reported as
  `prompt_injection_attempt` (rule + prompt) and floor the verdict at MEDIUM.
- Model output is untrusted: enums coerced to closed sets, strings capped/stripped (control chars, HTML,
  fence markers), arrays bounded, confidence clamped (`ai/schema.ts`).
- Advice is deterministic (never model-written). Inputs bounded: 4 000 chars text, 5 MB JPEG/PNG/WebP,
  ≤3 links checked, OCR output capped.
- The route logs shape only (tier, level, status, timings) — never the message, entities, or OCR text.
- Suspended accounts are refused (Module 08); per-IP burst cap on top of the quota.

## Known limitations (V1)

- Both `fast` and `smart` currently resolve to the same model in `providers/claude.ts`; the routing is real
  but cost-neutral until the fleet has two tiers.
- The allowance is spent on attempt; a model failure after the gate is not refunded.
- An identity-less caller (no session) is metered per IP for its lifetime allowance (shared NAT = shared
  allowance). A cleared site-data + new anonymous mint is a new identity and a new trial — the accepted
  limit of any anonymous product without device fingerprinting; mints are capped 5/min, 30/day per IP.
- Rules are pattern matches (VI/EN/ZH); romance/job scams rely on the model.
- No history entry for message analyses (the device history is a list of links).
- Android/iOS clients do not call the new endpoint yet; `GET /api/config.scamShield` now advertises
  `aiDailyLimitFree` / `aiMonthlyLimitPaid` for them.

## Official anti-fraud knowledge library (added 2026-09-15)

`src/lib/scam-shield/knowledge/` — a static, versioned dataset rendered by `ScamKnowledgeSection` below the
tools. No request, no model, no quota: browsing is free by construction (pinned by tests).

- **Dataset:** `bocongan2026.ts` = Bộ Công an, "Nâng cao cảnh giác trước 25 kịch bản lừa đảo trên không gian
  mạng năm 2026" (bocongan.gov.vn, 08/09/2026). The article body describes 5 groups; the 25 items are
  itemised in the official infographic embedded in it (also on bocongan.gov.vn). Official numbering 1–25 kept.
- **Record shape:** `official` (source-derived title/summary; group description verbatim) is kept apart from
  `guidance` (TappyAI-written warning signs / requests / do / don't). The UI labels the two blocks
  differently ("Thông tin từ nguồn chính thức" vs "Hướng dẫn của TappyAI — không phải trích dẫn nguyên văn").
- **Provenance enforced:** every record must be `verified: true`, carry organisation + title + `https` URL on
  `OFFICIAL_SOURCE_HOSTS` (gov/national-agency domains only), and a `verifiedAt` date — `__tests__/dataset.test.ts`.
- **Freshness:** `version` + `source.publishedAt` / `verifiedAt` per dataset; updating = editing the dataset file
  and bumping `version`. A future sync job can diff against `verifiedAt`.
- **Not done in V1 (deliberately):** no RAG; the taxonomy (`attackerGoal` on each record) already maps onto the
  message-analysis `AttackGoal` vocabulary so the two can be joined later without re-modelling.
- **Other official list noted, not consolidated:** Cục An toàn thông tin's "Cẩm nang nhận diện và phòng chống
  lừa đảo trực tuyến" (24 forms, 2023–2024, different agency and taxonomy). Left for a later dataset file.
