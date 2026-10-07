# TappyAI Web — Phase 7 master closeout

Worktree `D:\TappyAI-wt\wtp7`, branch `p7/web-subscription`, base `0612687` (= `rc/web-uat` `56a26ae` + 3 subscription commits).
Web only — Android / iOS: 0 files. No push. **Commit: withheld** — see §C (gates that could not pass without the owner).

> **Status update 04/10 (final cleanup + freeze):** the owner ordered the Web baseline committed as
> `feat(web): finalize phase 7 web baseline` once the code gates passed (tests, tsc, lint, build, architecture/agent lock,
> secret scan). The §C owner items are **still open** and are carried forward unchanged. They are runtime/config/UAT gates,
> not code: the guidelines page stays unpublished until the 3 legal facts are set, uploads stay 503 locally, and so on.
> P0 data sources: see `DATA-SOURCE-RESOLUTION.md` and §W below.

**AI CONSULTATIVE / BOUNDED AGENT = FROZEN.** Changes below are correctness / data-source / security / performance fixes inside the
frozen architecture (no loop, router, model, or tool-orchestration change).

## A. Checklist
| CP | Item | Status |
|---|---|---|
| 0 | Frozen agent integrated from `wtaudit` (3-way patch, same base; no benchmark artefacts) · 153 agent/hardening tests (security A–S) | ✅ FROZEN |
| 1 | Travelpayouts / Aviasales removed (runtime, env, prompts, docs, tests) · guard test `flightSource.test.ts` | ✅ |
| 2A | Carried evidence for follow-ups + placeClaimGuard field-level evidence | ✅ (UAT) |
| 2B | Flight fare / schedule / status — verified vs unverified | ✅ behaviour · ❌ data source (W) |
| 2C | Cinema showtime / ticket price — verified vs unverified | ✅ behaviour · ❌ data source (W) |
| 2E | Local practical tips (frozen capability, `local_tips`) | ✅ (UAT) |
| 2F | AI Planner pre-search sufficiency gate | ✅ (UAT: 0 calls before destination) |
| 3 | Cost / latency (hard caps 8 / 10 kept; context reuse; planner gate) | ✅ |
| 4 | Profile V3 nav · one QR · canonical QR URL · share/download errors · app section on the card | ✅ code + QR artefact verified · ⚠ signed-in UAT needs login |
| 4C | Avatar / cover upload | ✅ code audited · ❌ real upload blocked locally (GCS WIF admits production only) |
| 5 | Subscription: canonical catalog (Free 10/day), old Pro/99K gone, payments-off state, expiry cron | ✅ code + 37 real-SQL purchase-flow tests · ⚠ live purchase UAT needs migrations on the audit DB |
| 6 | Community Guidelines — canonical 28 sections verbatim, gated on verified legal facts | ✅ code · ❌ publication blocked (3 legal facts missing) |
| 7 | Footer (Khác, Tải TappyAI, Sắp có, guidelines/terms/privacy) + global AI disclaimer (chat, app footer, public footer) | ✅ (UAT) |
| 8 | 8A hide "Hỏi Tappy về video này" (flag) · 8B Explore profile cover hero · 8F/8G plan default + user-chosen thumbnail · 8H QR · 8I suggestion art matches its category · 8J tools order | ✅ · 8C/8D/8E: screen not found on Web (§C) |
| 9 | `/reviews/new` upload: 503 for credential outage, 413/HTML no longer a SyntaxError | ✅ code · ❌ real upload blocked locally (same as 4C) |
| 10 | Full suite / tsc / lint / architecture / production build / real UI UAT | ✅ (§R, §S) |
| 11 | ONE local commit | ⏸ withheld (§C) → ✅ committed 04/10 on owner order as the Web baseline (§C items still open) |

## B. What changed (by checkpoint)
- **CP0** — `wtaudit` working tree since `56a26ae` (95 `src` files) applied by `git apply --3way`; only overlaps (`route.ts`, `.env.local.example`) merged cleanly.
- **CP2A** — `src/lib/ai/agent/carriedEvidence.ts`. The card facts the agent reads and the guard's carried evidence now come from the same verified rows (this conversation's last place search), per field, in display order, with `verifiedAt`. "Open now" is carried only for 30 min; opening hours are carried. Rows win over what prior prose stated. The guard also accepts carried phone. A narrow follow-up rule was added to the agent prompt ("use the card's field; missing field → look up that place only").
- **CP2B/2C** — `src/lib/ai/verificationLead.ts`. The owner sentence for exactly the dimension asked: fare, flight time, flight status, showtime or ticket price. It leads the reply unless the reply already says it. The flight context now carries `sources` and `lastVerifiedAt` (null).
- **CP2F** — `src/lib/ai/agent/plannerGate.ts`. A trip plan with no destination anywhere in the user's words gets one canned question: no model, no tool, no Serper, not charged. It reads text parts as well as strings. A regex literal is used because the template form broke in the production bundle (found in UAT).
- **CP4** — Edit Profile Save/Back go to `/profile`. `QRProfileButton` was deleted; `/profile/qr` is the one implementation. The QR payload is `absoluteUrl('/users/{id}')`. Share/download errors are caught. The card gets an apps section ("Android · Sắp có trên Google Play", "iOS · Sắp có trên App Store") while no listing is live. A blob-revoke race that left a broken card image was fixed.
- **CP5**
  - `FREE_DAILY_LIMIT` = 10.
  - `/subscription` always shows the canonical catalog; with `SUBSCRIPTIONS_ENABLED` off, checkout is not offered ("Thanh toán gói đang được chuẩn bị…").
  - Removed `SubscriptionView`, `StripeCheckoutButton`, `ManageSubscriptionButton` and 36 dead keys.
  - Every "không giới hạn" plan claim was replaced with true lines.
  - `subscriptions-expire` is scheduled daily at 00:00 VN.
- **CP6** — `src/lib/legal/communityGuidelinesPublished.ts` is generated verbatim from the owner's docx: title, 4 header lines, 28 sections, 158 blocks. `communityGuidelinesConfig.ts` publishes only when `COMMUNITY_GUIDELINES_EFFECTIVE_DATE`, `LEGAL_OPERATOR_NAME` and `LEGAL_ADDRESS` are all set; it throws if a placeholder would survive.
- **CP7** — `AiDisclaimer` (one key, `ai.disclaimer`); `PublicFooter` (Home + discovery); `V3Footer`.
- **CP8** — `SHOW_ASK_ABOUT_CLIP=false`. `ProfileTab` cover hero, accepting only safe URLs. `planThumb.ts` (presets only, device-local) with default `public/planner/plan-default.webp`. Ten category variants `public/home/inspire/*-2|3.webp` from the owner's package. Tools order changed.
- **CP9** — `api/reviews/upload` classifies credential outages as 503 `upload_unavailable`; the composer handles non-JSON responses and 413.

## C. Remaining blockers (need the owner)
1. **Community Guidelines publication**
   - Needs the effective date, operating entity and legal address.
   - Set the three env vars to verified values; the page switches on with no code change.
   - Not invented.
2. **Real uploads (avatar, cover, post photo/video)**
   - GCS WIF admits only the Vercel production subject. Local / preview writes fail at `sts`, which is now reported as 503.
   - UAT must run on production, or the owner grants a non-production credential.
3. **Live purchase UAT**
   - Migrations `20260924` … `20261017` are unapplied everywhere. Real UAT needs owner permission to apply them to the audit DB, plus a SePay test webhook secret.
   - The flow is proven by `supabase/tests/p8_subscriptions_routes.test.ts`: real SQL, order → verified webhook → ACTIVE → quota, duplicates, Pip once, short payment = mismatch, expiry. 37 tests, green.
4. **Signed-in UI UAT** (Profile V3 edit / persistence)
   - Needs a real login. The session must not create accounts on the remote audit Supabase.
5. **8C / 8D / 8E** ("first recommendation tile", "Deal" tile, "marketplace promotions" tile)
   - No such tile row exists on Web Home V3 (owner-locked) or Explore. This looks like the Android Home design.
   - Needs the owner to name the Web screen before anything is built.

## D. Travelpayouts / Aviasales removal proof
- `flightSource.test.ts` scans `src`, `scripts`, `supabase`, `.env.local.example`, `package.json`, `next.config`, `vercel.json` → **0 matches**. No flight env var is read.
- `getFlightPrices` makes no network call and returns `{origin, destination, depart_date, fare_status:'not_verified', booking_links, note}`.

## F–H. Verification (UAT 04/10, final build, real Luna + Serper)
- **Carried evidence**
  - "tìm 3 quán ngon ở Q1" → 3 places (4 credits).
  - "quán số 2 sao?" → Secret Garden (#2), rating + address + hours from the carried row: **0 searches**.
  - "ở đâu?" → carried address: **0 searches**.
  - "mở tới mấy giờ?" → carried hours "đến 22:00": **0 searches**.
  - Unsupported / contradicting figures and unrelated old entities are still removed (tests).
- **Flight** (TP.HCM → Quy Nhơn, 05/10)
  - Fare, schedule and status are **UNVERIFIED** (no approved source). Each follow-up reused the flight context (0 credits).
  - "có chuyến sáng không?" → *"Giờ bay / chuyến bay hiện chưa xác minh được từ nguồn dữ liệu đang có."*
  - "đúng giờ không?" → *"Trạng thái chuyến bay hiện chưa xác minh được từ nguồn dữ liệu đang có."*
  - Official Trip.com / Traveloka links are shown.
- **Cinema** — films showing today are verified (Moveek dated list). Showtime and ticket price are **UNVERIFIED**:
  - "suất nào" → showtime sentence + CGV / Galaxy film-page links (registry-validated).
  - "7 giờ" → unverified.
  - "giá vé" → unverified.
  - "CGV nào" → CGV cinemas near the centre; it says it cannot verify which one shows the film.
  - "rạp nào gần tôi" → cinemas nearest to GPS (0.2 km).
- **Planner**
  - "Lên kế hoạch du lịch cuối tuần" → *"Cuối tuần này bạn muốn đi đâu? Nếu chưa chốt, mình có thể gợi ý vài điểm phù hợp."* — **0 external calls** before the destination.
  - "Đà Nẵng" → plan (10/10 credits) with dishes and local tips.

## K. Cost / latency (real UAT)
| Turn | Serper | USD | s |
|---|---|---|---|
| tìm 3 quán ngon ở Q1 | 4 | 0.00506 | 12.4 |
| quán số 2 sao? / ở đâu? / mở tới mấy giờ? | 0 / 0 / 0 | 0.00068 / 0.00067 / 0.00013 | 3.3 / 2.8 / 2.6 |
| vé Quy Nhơn ngày mai → giá → chiều về → chuyến sáng → đúng giờ | 0 each | 0.0004–0.0010 | 3.9–6.0 |
| phim tối nay / suất nào / 7 giờ / giá vé / CGV nào | 1 / 1 / 0 / 0 / 4 | 0.0018 / 0.0018 / 0.0003 / 0.0003 / 0.0045 | 7.4 / 6.5 / 4.7 / 4.4 / 12.7 |
| rạp nào gần tôi (new session) | 7 | 0.00748 | 10.8 |
| Lên kế hoạch du lịch cuối tuần | **0** | 0 | canned |
| Đà Nẵng (plan) | 10 | 0.01137 | 28.4 |
| đi Đà Nẵng 3 ngày 2 đêm cho 2 người | 5 | 0.00638 | 26.5 |

Travel baseline 31.4 s / 16 credits / $0.0187 → 26.5 s / 5 credits / $0.0064. Hard caps of 8 and 10 held on every turn. The first "Đà Nẵng" plan run spends 10 because nothing is cached yet. A guest has 5 lifetime questions, so the 6th turn of a guest conversation correctly returns the limit message.

## M. QR artefact
On `/profile/qr` the downloaded card (1200×2056 PNG) was decoded by sampling all **1369 / 1369 modules: 0 mismatches** against `encodeQR("https://www.tappyai.com/users/<session id>")`. The URL is canonical, not localhost. The bottom panel reads "Tải ứng dụng TappyAI · Android · Sắp có trên Google Play · iOS · Sắp có trên App Store · www.tappyai.com".

## R. Tests
- Full suite, tsc clean, architecture 15/15, and ESLint on changed files (0 errors) — final numbers are in the reply.
- Production build: `next build` passed (UAT build).

## V. Phase 8 (unchanged)
- Realtime translation, ads, and the `p8/subscriptions` app-store purchase line.

## W. External data-source blockers
| Capability | Missing | Source type needed | Cost / key / licence / ToS |
|---|---|---|---|
| Flight fare for a date, schedule, live status | every field | flight-data API (fares: OTA/GDS partner; status: AeroDataBox / FlightAware class) | paid, new key, display licence for fares; affiliate approval (Trip.com / Traveloka) is booking hand-off only, not data |
| Cinema showtime per cinema/date, ticket price, availability | every field | partner feed (CGV / Galaxy / Lotte / Moveek / MoMo) | commercial agreement; scraping excluded by ToS |
| P0 status (04/10, `DATA-SOURCE-RESOLUTION.md`) | — | Traveloka = affiliate ready / API access pending · Vexere = affiliate ready / API access pending · Moveek = official data access not established | real UAT not possible: no provider credentials exist |
| Store listings | public URLs | Google Play public page live; App Store listing | owner sets `NEXT_PUBLIC_PLAY_LISTING_LIVE=1` once the Play page is public |
