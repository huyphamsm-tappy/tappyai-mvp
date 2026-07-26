# Android↔Web Parity — Implementation Progress

Autonomous sequential implementation of the approved gap report (P0→P1→P2→P3).
Web PRODUCTION = source of truth. **The real prod Web source is the worktree
`.claude/worktrees/cool-vaughan-b3c7ff/` (branch `main`, `b68be0d`)** — the primary
tree's `src/` lags prod. Always read Web contracts from that worktree.

Build/test: PowerShell only. `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`,
`ANDROID_HOME=C:\Users\Admin\AppData\Local\Android\Sdk`, then `android\gradlew.bat :app:testDebugUnitTest`.

## Done (committed on feat/backoffice-phase0)
- **P0-1, P0-2** — gradle foundation + POSIX gradlew committed. `03548b7`
- **P1-11, P1-12** — Music CC-BY attribution + "videos using this sound" grid. `41efd93` (test: SoundAttributionTest)
- **P1-3, P1-4, P1-5** — Reviews comment replies + reactions + feed back-restore by clip id. `3093d5e` (test: CommentWireContractTest)
- **P1-1, P1-2** — Chat incremental token rendering + [TAPPY_PLAN] itinerary card. `8c12cbd` (test: ChatPlanTest; new TripPlan/TripPlanCard/ChatStreaming)
- **P1-10** — Split Bill calculator (new `splitbill/` package, Home quick-action). `6e56884` (test: SplitBillCalculatorTest)
- **P1-6** — Location capability (play-services-location + permissions + LocationRepository) wired to chat userLocation bias. `b28ecd4` (test: ChatLocationWireTest)
- **P1-Deals** — partner_deals model + promo UI (badge/countdown/voucher) + click counter. `a17ce84` (test: PromoCountdownTest)

- **P2-11** — Full 78-card tarot deck (22 major + 56 generated minor). `59ea9e2` (test: TarotDeckTest)
- **P1-7** — Fortune deterministic engine (djb2, golden-tested) + zodiac/tu-vi period readings + lucky number/color + Ngũ Hành + aligned elements. `9e261d2` (test: FortuneEngineTest)
- **P1-8, P1-9** — Tu-vi Lifetime + By-Year tabs (full birth date, 4 life stages, year picker + can-chi compat + 12-month breakdown). `06292c1` (test: FortuneTuViEngineTest)

**→ ALL NON-BLOCKED P1 ITEMS DONE.** (Bank content transcribed verbatim from prod by worktree agents into ZodiacBanks/CanChiBanks/FortuneData/LifetimeData.)

## Remaining
### P2 done
- **P2-3** — 300ms self-healing video watchdog. `1d6b3b7`
- **P2-12** — Translate TTS checks setLanguage(). `dc7d9b0`
- **P2-7** — gender persisted to Supabase auth metadata. `5672140`
- **P2-9** — review upload caps from `/api/config` (AppConfigRepository). `bde15d8`
- **P2-10** — `/api/track` network provider + review_like/place_save wired. `89d26f3`
- **P2-1** — dynamic suggested prompts on Home from `/api/suggested-prompts`. `dc7e9eb`
- **P3** — removed dead Room `core:database` module. `49aaebc`

### P2 (remaining)
- P2-5 in-feed attached-sound playback (large) · P2-6 Explore Users search + optimistic follow · P2-8 auth providers from `/api/config` (marginal — Android providers already correct; Zalo blocked separately) · P2-2 remainder (SavePlaceButton in chat, history GET-by-id).
### P2 (needs backend / flag to owner)
- P2-4 liked-reviews collection (needs a source endpoint) · P2-13 inferFromBooking RLS (a Web/backend bug, not client).
### P3 polish
- dead CachedContextEntity cleanup, other polish items in gap report §2 P3.

## OLD-Remaining note (superseded):
- **P1-7/8/9 Fortune engine** — the big content-heavy port (~500 VN strings: deterministic djb2 engine, zodiac/tu-vi banks + lucky number/color, Tu-vi Lifetime + By-Year tabs, Ngũ Hành). Full spec at `spec_fortune.md`. NEXT MAJOR TASK — needs a focused pass (hash-parity traps §1.1 abs + §1.4 seed ids incl. `ty2`; ISO-week/UTC+7 key). Highest-value gate = a golden cross-platform determinism test.
- **P2 items** (suggested-prompts, video watchdog, liked-reviews, gender persistence, /api/config limits, TTS voice-check, in-feed attached sound, Users search, dead CachedContextEntity cleanup, /api/track). Some already noted in gap report.
- **P3 polish.**

## Pause points (need credentials / product decision — will stop and ask):
- FCM push (P1-13) — needs a Firebase project + google-services.json.
- Zalo login (P1-B1), anonymous tier (P1-B2) — backend/product contract decision.

## Specs ready on disk: spec_deals.md (done), spec_fortune.md (NEXT), spec_reviews_comments.md (done).

## Audit correction (from prod-worktree re-verification, gap report §8)
- **Deals is a REAL P1 gap** (prod has `POST /api/deals/[id]/click` + promo UI: discount badge, countdown, voucher chip). Was wrongly "N/A". Must audit Android Deals vs prod `partner_deals` + `DealsView.tsx`.
- **Currency** needs re-check vs prod `src/lib/finance/exchange.ts` (`MissingCurrencyError`, no `|| 1` fallback).
- `/api/track` DOES degrade recs (P2-10 rationale corrected; severity stays P2).

## Remaining P1
- P1-1 Chat incremental token render
- P1-2 Chat [TAPPY_PLAN] card
- P1-6 Location capability
- P1-7/8/9 Fortune engine (deterministic + Tu-vi Lifetime/By-Year + tarot 78)
- P1-10 Split Bill
- P1-Deals (NEW) click counter + promo UI
- **P1-13 FCM push — PAUSE POINT: needs Firebase project + google-services.json (credentials/env)**
- **P1-B1 Zalo login — PAUSE POINT: needs backend mobile-token/deep-link contract (product decision)**
- **P1-B2 Anonymous tier — PAUSE POINT: needs product + backend session decision**

Then P2 (13 items) and P3.

## Commit strategy note
Owner's working tree had ~150 files of uncommitted parity WIP. Many feature files
were pre-dirty (owner WIP) entangled with new work in the same files; non-interactive
staging can't split hunks, so domain-cluster commits carry that inherited WIP with an
honest note. Branch tip builds + tests after each commit.
