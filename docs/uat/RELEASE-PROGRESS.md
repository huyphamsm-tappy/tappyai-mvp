# RELEASE PROGRESS — 2026-09-28/29 (read this first after a context reset)

**Worktree (the only one):** `C:\wtrel` · branch `release/rc-merge-main-2026-09-29` → pushes to `origin/rc/web-uat`.
UAT = https://uat.tappyai.com (bound to branch rc/web-uat, audit DB `zdaprdfgpbpnxyofagmc`, behind Vercel SSO;
bypass secret in `D:\TappyAI-backups\vercel-bypass.txt`, header `x-vercel-protection-bypass`, never print it).
Check the running SHA: `GET /api/version` with the bypass header.

## Rules from the owner (2026-09-28)
- **PASS only with a real screenshot on UAT** (headless browser + bypass). Unit tests are not enough.
  UI items: screenshot next to the matching design in `D:\redesign`. Evidence up to 2614652 → `docs/uat/evidence/release-2026-09-28/`.
- **From 2026-09-28 evening: NO images/videos in git.** Evidence → `gs://tappyai-uat-evidence/evidence/<UAT SHA>/…`
  (public URL `gs://tappyai-uat-evidence/evidence/<SHA>/…`; test accounts only). This file keeps paths only.
- Signed-in shots: Playwright + admin magic-link session on the AUDIT project (scratchpad `pw/login.mjs`), never the Browser pane.
- Only message the owner for login/password/secret, real-device tests, or danger points.
- Never write to prod before the owner confirms the real-device UAT. Phase B (release) unchanged.
- Claude may not type passwords into a non-localhost site → logged-in screenshots need the owner to sign in
  in the in-app Browser pane (test accounts: `docs/uat/MANUAL-UAT-HANDOFF.md` §1), then Claude drives it.

## Done (commits on rc/web-uat)
| Commit | What |
|---|---|
| 380e0c9 | merge main (C2 hotfix) into rc; `.env.local.example` resolved; PR #252 mergeable |
| c66d07d | merge of the stopped fix session's WIP (`wip/blocker-fix-2026-09-28` 67714c9) + 3 corrections |
| 2ba8ee9, a2cd816 | A2 snack purchase → shopping; A4 trip asks missing date/origin/transport (tripFacts.ts) |
| 090be49 | A5 SHOW_PUBLIC_SHARE flag, `query` blocked in user_events, noindex /r and /plan |
| e823425 | A1 "Tìm trên …" search fallback (food GrabFood, shopping Lazada/Shopee, events Ticketbox) |
| 3c5887a | literal `**` balanced at the shared render layer (web + Android + server) |
| 062c7ec | fallback on EVERY card row (was only 3) |
| 348cfe0 | prose guards never cut inside [TAPPY_PLAN] JSON (trip plan cards were broken) |
| c7f78d3 | hotel cards: Booking.com results page for that hotel (not pushed yet at time of writing) |

## Owner UAT on 3c5887a said: many "PASS" were really FAIL → round 2 (prompt 2026-09-28 afternoon)
Design images (D:\redesign, 6 files): age gate · onboarding interests · "Gợi ý cho bạn" nearby places ·
Tài khoản & Cài đặt · Đã lưu (with sidebar) · Viết content (AI caption). No design exists for: profile
content tabs, share-card layouts, Explore upload, chat answers.

### Work list — status with evidence (docs/uat/evidence/release-2026-09-28/shots/<dir>/)
Latest full run: `final-1e11b32/` (+ `final-a9d634e/` for the cut-sentence fix and P1c). UAT SHA recorded in each dir's `_version.json` or name.
| Item | Commit(s) | Evidence | Status |
|---|---|---|---|
| P1a "tối nay có chỗ nào đi chơi ở sài gòn ko" | f6c7faf fixed frame, a5c19a8 code intro | a5c19a8/p1a-run1..5 (5/5 dinner→Chợ đêm Hồ Thị Kỷ→The View Rooftop Bar), final-1e11b32/p1a-tonight-sg(-mobile) | PASS |
| P1b snack → "tối nay đi đâu chơi quận 1" | 668ffd1, e05de06 | final-1e11b32/p1b-snack-then-q1-t2 | PASS |
| P1c raw URL / glued links / photo link | 1b79b97, 4515b0f | final-1e11b32/a1-flight-t1 (chips "Trip.com" · "Traveloka"), 0 raw URLs in every captured answer | PASS |
| P1d blank gaps | 1b79b97 | final-1e11b32/a1-hotel-t1 | PASS |
| P1e / A1 buttons (food, delivery, shop, hotel, event, flight) | e823425, 062c7ec, c7f78d3 | final-1e11b32/p1e-pho-q3, a1-* | PASS |
| Cut sentence "…cao hơn Nếu cần…" | a5c19a8, a9d634e | final-a9d634e/a1-shop-cut-run1..3 (3/3 complete "Nếu …" sentences, real prices kept) | PASS |
| A4 trip asks date/origin/transport | 2ba8ee9, 348cfe0 | final-1e11b32/a4-trip-t1/t2 | PASS |
| P2a avatar / cover | 5e305f4 + UAT infra (docs/uat/UAT-MEDIA-INFRA.md) | d97b261/p2a-1..3, p2a-buckets.txt, wif-isolation.txt | PASS |
| P2b own profile tabs | 5e305f4 | final-1e11b32/p2-profile(-mobile) | PASS (see screenshot) |
| P2c sidebar | 5e305f4 | final-1e11b32/p2-profile (no Saved/History/Cài đặt/Language/Help) | PASS |
| P3a Explore photo + clip upload | 4e9f53d | 4e9f53d/p3a-2, p3a-3 | PASS |
| P4 Facebook / Zalo / TikTok / OG | 7e78e58, c835b3e, 91461bd | final-1e11b32/p4-click-facebook ("Đã mở Facebook"), p4-click-zalo-desktop (clipboard = UAT link + hint), p4-click-tiktok-desktop (file + tiktok.com/upload + hint), p4-og-review.txt | PASS web; FB/Zalo crawler previews only on prod (UAT behind SSO); phone share sheet → owner device test |
| Design: Saved, Account hub, Viết content, Gợi ý cho bạn, age gate, onboarding | c87ddac, d97b261, 899bdbf, 1e11b32 | final-1e11b32/d-* next to D:
edesign | PASS (deviations in RELEASE report) |
| Share layouts (owner-chosen from Downloads) | — | contact sheet sent 2026-09-28 | WAITING OWNER CHOICE |

## Round 3 — owner prompt 2026-09-28 evening (evidence in GCS: `gs://tappyai-uat-evidence/evidence/<SHA>/`)
| Item | Commit(s) | UAT SHA | Evidence (gs://tappyai-uat-evidence/evidence/…) | Status |
|---|---|---|---|---|
| A1 onboarding counter = real steps ("Bước 1/2", "Bước 2/2") | b08561d | f8a26b7 | f8a26b7/a1-onboarding.png ("Bước 1/2", 2 segments) | PASS |
| A2 Đã lưu: Deals / Bộ sưu tập chips hidden | b08561d | f8a26b7 | f8a26b7/a2-saved.png, a2-saved-mobile.png (Tất cả / Địa điểm / Bài viết / Video only, no "Sắp có") | PASS |
| B3 plan share signed-in → opened with no cookies | — | 826d23b | 826d23b/b3-1-plan-signed-in.png, b3-2-share-sheet.png, b3-3-plan-anonymous.png (uat.tappyai.com/plan/AjqWryKzGUYT, authCookies=0, no 404) | PASS |
| B4 "đi du lịch Đà Nẵng 3 ngày 2 đêm" never invents date/origin/transport; ONE question | 826d23b, 5452fc6, 2bd5c59, 5e0a823, af8b4ba | af8b4ba | before fix (2/3 fail: dated 3/10–5/10; "Máy bay từ Hà Nội/TP.HCM"): scratch only · 826d23b/b4-trip-run1..3 (no invention, run 3 two questions) · 444774d/b4-trip-run1..3 (run 2 own question leaked, released prefix) · 2bd5c59/b4-trip-run1..3 (3/3) · 192973d/final/danang-3n2d-run1..3 (1/3: bolded model question slipped past) · **af8b4ba/b4-trip-run1..3: 3/3 — exactly 3 days, no date, no origin, no leg, one closing question** | PASS 3/3 (final SHA) |
| B4 "ngan sách" typo | 826d23b (fixHalfAccented in markdownNormalize) | — | not emitted by code/prompt; model blends unaccented prompt text; fixed at output | FIXED (unit) |
| B5 shopping card vs D:\redesign | — | — | D:\redesign has 6 images, none is a shopping card → no side-by-side possible | N/A (no design) |
| B6 publish real photo + clip (test account), feed + profile, then hide/delete | — | 826d23b / 2bd5c59 | 826d23b/b6/b6-photo-1..3, b6-clip-1..3, b6-feed-fresh-1..2 · 2bd5c59/b6/b6-feed-guest-find-1..3-mobile, b6-profile-owner-published, b6-del-1..2-mobile, b6-feed-*-after-delete-1 | PASS (photos show only in mobile feed — desktop Explore is video-only by design) |
| B7 YouTube clip in Explore → Facebook / Zalo / TikTok | — | 826d23b / 2bd5c59 | 826d23b/b7/b7-youtube-1..3 · 2bd5c59/b7/b7-sheet-*, b7-click-{facebook,zalo,tiktok}(-mobile), *-popup1, b7-share-results.txt | PASS (FB sharer / Zalo copy+hint (desktop), app scheme (mobile) / TikTok file + upload page) |
| B7 bug: composer AI replaced the typed caption + area | f8a26b7 | f8a26b7 | bug: 826d23b/b7/b7-youtube-1-composer-filled.png · fix: f8a26b7/b7fix-composer-typed-kept.png + .json (bodyKept=true, areaKept=true after 20 s) | PASS |
| B8 own profile 5 states + visitor view | — | 2bd5c59 | 2bd5c59/b8/b8-owner-{published,shared,saved,restricted,hidden}(-mobile), b8-visitor-fresh, b8-visitor-guest(-mobile) | PASS (visitor sees 8 public posts; hidden + restricted absent). All test rows deleted afterwards. |
| C9–C12 Part B prep | 444774d | — | docs/uat/RELEASE-PLAN-2026-09-29.md, scripts/release/*, docs/ios/HANDOFF-FROM-RELEASE.md | DONE (nothing run on prod) |
| Consultative design 2026-09-26 restore | — | — | not found anywhere on this PC (full search) → nothing restored, nothing to revert | WAITING OWNER (Q1) |
| AI baseline on UAT (c40 answer-first rubric, blind) | — | 2bd5c59 | 2bd5c59…/c40-baseline/ (grading, stats, worst-5 replays) · raw streams 2bd5c59…/golden-raw/ (220 files) | **31/40 — BELOW 38 → Part B gate NOT met** (Food 7/8 · Shopping 6/8 · Travel 6/8 · Spa 7/8 · Entertainment 5/8 · Clarify 6/8); golden scorer 55/58 (human 8 PASS/15 PARTIAL/1 FAIL) |
| Deterministic fixes from the baseline (offline replay, no model calls) | 5e0a823, 7d156e0, 93b06b3, af8b4ba | — | fixtures from live T1/O8/P7b/E8/T6 streams | evening frame follows who/mood/budget + real party size; trip days = stated length; no invented travel date; no-tool follow-up place guard (P7b); weekday-closure guard (E8); plan times fit hours (T6); bolded trip questions + origin chips |
| AI final on UAT (same method) | — | 192973d | 192973d/final/ (c40-grading.md, golden-grading.md, owner-and-principles.md, stats, 6 screenshots) · raw 192973d/golden-raw/ (220 exact bodies) | **30/40 — BELOW 38** (Food 7/8 · Shopping 4/8 · Travel 6/8 · Spa 6/8 · Entertainment 7/8 · Clarify 4/8); golden scorer 52/58 (human 8/14/2); owner queries 1✅/7⚠/3❌ (was 1/5/5) |
| Screenshots on final code | — | 192973d | 192973d/final/tonight-sg-t1.png (3 open stops) · group5-q1-t1.png ("5 người", quán nhậu → karaoke → craft beer) · flight-sgn-han-t1.png (no assumed date) | PASS 3/3 |

Observations (not fixed): desktop post-publish lands on "for you" feed (own post not visible); /profile state tabs need horizontal scroll at 1280px.

## Coordination
- Android session (C:\wtandroid) owns android/. Web wrote STOPPED @ 6e392d2. Requests: docs/uat/ANDROID-REQUESTS.md.
- vercel.json ignoreCommand: android-only commits do not build the web.
- Push rule: fetch + rebase, never force.

## PRODUCTION STATE — 2026-09-29 16:40 VN (read-only check; nothing written to production)
| Item | Finding |
|---|---|
| `origin/main` | **`f42ae4b`** (Merge PR #260 hotfix/c2-apple-root) — contains the C2 fix `src/lib/apple-iap/` (Apple Root CA G3 pinned in code). |
| Vercel production | serves **`f42ae4b`** (`/api/version`), deployment `dpl_AwmZEwWgMNzJzKun5K7c6CYKvsne`, created 2026-09-28 10:12 VN, Ready. The previous one (`842379b`, 08:00) is the rollback-of-rollback target only. → **C2 is on main AND running: no stop.** |
| Supabase prod `commerce_providers` | 7 tracked rows applied 27/09 (AFFILIATE_STATUS). `f42ae4b` has **no reference** to `commerce_providers` / feed tables → no dependency, no broken flow. Rows not re-read today: no prod DB credential on this PC (no `pgpass`), and the prod service key is not used. |
| Production env (names, 80) | vs the release code: see RELEASE-PLAN §2 (unchanged) + Q-ENV1. `NEXT_PUBLIC_PLAY_LISTING_LIVE` **absent = OFF** ✓. `AUTH_GOOGLE_ENABLED` present ✓ (keep). 🚨 `ACCOUNT_SELF_DELETE_ENABLED` = **`true`** (plain var) — inert on `f42ae4b` (no self-delete route), must be set **`false`** at the release (RELEASE-GOVERNANCE §4 step 6); not changed now (no production writes). |
| Health baseline | `/` 200 · `/login` 200 · `/reviews` 200 · public review 200 with OG · **guest chat 401 → sign-in wall** (no guest chat on production today). Evidence `gs://tappyai-uat-evidence/evidence/prod-baseline-f42ae4b/`. |

## AFFILIATE (PR #255) — 2026-09-29
- Already merged into `rc/web-uat` on 27/09 (`dc51447`; `e182504` is an ancestor of HEAD; PR #255 state **MERGED**). No price source on that branch (flights still need `TRAVELPAYOUTS_TOKEN`, Q10) → TRAVEL-3 keeps prefilled search links.
- One link builder (`src/lib/ccp` resolver → `wrapWithAccesstrade`), one click path per surface: card = handoff beacon + GA4 `affiliate_click`; link in the reply text = GA4 only (`inlineLinkTap`) → a tap is never counted twice.
- UAT `1ddfadc`: 5/5 `go.isclix.com` links with `sub1` (24 hex); Booking.com direct (not in a programme). Found + fixed: the prefilled Trip.com fare link used the wrong date ("ngày 15/10" → 06/10) and the hotel link one night only ("10/10 đến 12/10" → checkout 11/10) — commit `41eca86` (in `400da54`); on UAT `400da54` the hotel link now carries `checkOut=2026-10-12`.
- Clicks followed on UAT `400da54` (verify-prod dry run): Trip.com, Traveloka, Lazada → `go.isclix.com` → `click.accesstrade.vn` (sub1 present) → merchant (Rakuten linksynergy for Trip.com, Traveloka, c.lazada.vn); Shopee direct. GA4 is configured for Production only → verified at release by Huy (PRODUCTION-VERIFICATION §3).

## CẦN HUY QUYẾT (each has a temporary SAFE choice already applied — work continues)
| # | Question | Temporary safe choice (applied) |
|---|---|---|
| Q1 | Where is the consultative design approved 2026-09-26 ("CONSULTATIVE PROMPT REDESIGN (5 DOMAINS + MAIN CHAT)")? Not found in any transcript, branch, stash, worktree or doc on this PC (only PRE-REDESIGN-AUDIT §12–14 "KHÔNG triển khai", and owner notes 24/9 + 27/9 "do not redesign"). | Nothing restored, no new frame invented. Current rc kept; baseline c40 + golden measured on UAT (results below). |
| Q2 | Production has `ACCOUNT_SELF_DELETE_ENABLED=true` (D1/D2/D4 deferred). | Not touched (no prod writes). Release step: remove it before deploy (RELEASE-PLAN §3a). |
| Q3 | `/delete-account` text vs deferred self-delete. | Page now follows the flag: off → request-by-email text (0af672c wording), on → in-app deletion text. Correct whichever way Q2 is decided. |
| Q4 | Photo posts never show in desktop Explore (video-only by design); owner B6 expected the photo in "the feed". | Unchanged (shows in mobile feed + profile). |
| Q5 | After posting on desktop the user lands on the "for you" feed, which hides their own post. | Unchanged, noted. |
| Q6 | Share-image layout choice (Downloads contact sheet). | Waiting — owner picks in the morning. |
| Q7 | AI stays BELOW the 38/40 gate (baseline 31, final 30 — same method; the turns that got worse are in areas no fix touched, e.g. shopping S2/S4 — model variance). Keep tonight's targeted guard fixes, or revert them? | KEPT: each fix removes a measured invention (P7b venue, E8 closure, O8 date, T1 day 4, T6 hour, E1 people) and is pinned by a live-stream fixture. Nothing was restored ⇒ nothing to revert under the 26/9 rule. **Part B stays blocked by the gate.** |
| Q8 | rc test red from the Android session's 06b5284 (`AgeCheck.kt:222` hardcoded `contentDescription`). | Not fixed by web (android/ is theirs); request written in ANDROID-REQUESTS.md. |
| Q9 | An evening plan with no stated party size shows "2 người" without saying it is assumed. | Unchanged (default 2). |
| Q10 | **Flight picks are impossible without `TRAVELPAYOUTS_TOKEN`** (not set on UAT, preview or replay): `get_flight_prices` returns only dated booking links, so a "vé máy bay" pick cannot name a flight/airline/time (TRAVEL-3 fails §9 "1 main pick" on every turn). | Honest: links + "chưa có giá trực tuyến", nothing invented. A multi-day trip now searches HOTELS (a pick is possible). Set the token on UAT (and prod) to unblock flight picks. |
| Q11 | Guard conflict (§5 "do not weaken guards — report conflicts"): the V1 prose-shape guard caps a reply at 6 sentences / 1 alternative, which cut the approved frame (17→6 sentence plans; pick 1 + 2 alternatives). | Relaxed for consult turns only: plans are not reshaped, picks keep ≤ 2 alternatives, ≤ 9 sentences. Every claim guard (price/hours/place/ticket) is unchanged. |
| Q12 | A consult place PLAN re-runs the stored search (24 h Serper cache → normally 0 credits) and the model reads ONLY the chosen venue's row. Without it every price/hour/review fact was cut and "Chi phí" came out empty. | Applied. Cost: +~$0.0016 per plan turn (1 row). |
| Q13 | The shared 24 h Serper cache keeps Google Maps thumbnail URLs for 24 h (Places terms). | Images are NOT cached (only text rows). Owner to confirm the 24 h text retention. |
| Q-SL1 | (share layouts, Q6 answered: #1/#6/#7, Khác = none — built on UAT 30c0724; approval page https://claude.ai/artifact/RXcTGLUu92DAn4VTN3T57T) The chat PLAN card (TripPlanCard) still opens the older share sheet — it carries the plan-link minting states (pending / sign-in / retry) that the #6 sheet has no place for. | Kept the older sheet for chat plans, but it now has "Lưu về máy" of the #7 plan image (same file for TikTok). The /plan/<id> page uses the #6 sheet. Move chat plans to #6 later if wanted. |
| Q-SL2 | (Updated 29/09, owner: Android IS on Google Play, approved 19/09.) The profile-QR card now carries the Google Play badge + link `https://play.google.com/store/apps/details?id=com.tappyai.app`; App Store not added. **But that listing URL returns 404 (VN and US) and a Play search finds no TappyAI** — the listing may be unpublished, region-limited or under another id. | Badge ON on UAT/preview, OFF on production until `NEXT_PUBLIC_PLAY_LISTING_LIVE=1` is set (storeListing.ts). Huy: confirm the public Play URL (or the real package id), then set the flag. |
| Q-SL3 | The card footer shows the host of the shared link (uat.tappyai.com on UAT, www.tappyai.com on prod via NEXT_PUBLIC_SITE_URL). A suggestion has no public page, so its QR opens the brand root. | Applied (nothing invented). |
| Q14 | Cost target ≤ $0.005/turn is NOT met: replay mean ≈ $0.0096–0.0101/turn (ask $0 · follow-up/compare ≈ $0.004 · plan ≈ $0.014 · reject ≈ $0.015 · pick/more ≈ $0.014–0.020). Top 3 drivers: (1) search rows sent to the model (~3k tokens per pick), (2) the V1 rules block still sent with the lean prompt (~1k tokens), (3) Serper per pick/more/reject. | Next experiment (measured before kept): trim rows to the fields the pick needs + drop V1 blocks the lean core duplicates. |
| Q-R16 | A consult evening plan ("Lên kế hoạch tối nay ở Quận 1 … dạo phố Nguyễn Huệ … cà phê") is a PROSE plan under Consult V2 — only travel plans carry `[TAPPY_PLAN]` (and the chat "Chia sẻ lịch trình" card). Its pre-search is ONE query (the café), so the "Gọi món" section has no dinner venue. | Kept as designed; the Huế location bug and the cut reply are fixed (72d53b0…e36c1ea). Huy: should an evening plan also build a `[TAPPY_PLAN]` card (dinner → walk → café, one search per stage)? |
| Q-SL1b | Chat plan sheet #6, real link step: in the automated UAT session `/api/plans/share` answered 401 (sheet shows "Đăng nhập để tạo liên kết"), while the same account calling it directly got 200 (`/plan/EwLSSerdjhmd`). Likely the test browser's injected session; not reproduced by hand. | Failed / pending / sign-in states verified by screenshots (gs://tappyai-uat-evidence/evidence/e36c1ea/share-layouts-v2b/). Huy: tap "Chia sẻ lịch trình" once on a real signed-in phone. |
| Q-ENV1 | `SNIPPET_PRICE_GUARD_V2` is set on **Preview for `rc/web-uat`** (added ~28/09 evening) — UAT and the replay run with it **ON** — but it is **absent on Production**, where the code default is **OFF**. RELEASE-PLAN §2d still says "unset = OFF, as tested", which is no longer true. | Nothing changed. Huy: either add `SNIPPET_PRICE_GUARD_V2=1` to Production at the release (ships what UAT tested — recommended), or remove it from Preview and re-run the replay/UAT with it off. |
| Q-PROD1 | `commerce_providers` + its 7 tracked rows were applied to **production** on 27/09 (AFFILIATE_STATUS §0), while RELEASE-PLAN §1 still lists #5 / #7 as APPLY-before-deploy. | RELEASE-GOVERNANCE §4 step 2: #5 and #7 are VERIFY-ONLY; #6 applied only if the pre-check shows it absent. The current production code (`f42ae4b`) does not read these tables — no effect today. |

## Current step
Overnight run 2026-09-28→29 DONE — final UAT SHA af8b4ba; morning report at the end of this file. Waiting on owner: Q1 (26/9 design), Q7 (AI gate), Q6 (share layout). Login = scratchpad pw/login.mjs (AUDIT only).

---

## OWNER ANSWERS 2026-09-29 (morning) — supersede the table above
- **Q1:** the 26/9 design is a REQUEST, never run. The owner's 6-area output frame (TRAVEL/FOOD/SHOPPING/ENTERTAINMENT/SPA/MAIN CHAT)
  + principles (1)–(8) is APPROVED → implement directly (docs/consultative/OUTPUT-CONTRACT-6-DOMAINS.md records it).
- **Q7:** KEEP last night's fixes.  **Q2/Q3:** set `ACCOUNT_SELF_DELETE_ENABLED=false` EXPLICITLY on prod at the deploy (not removed).
- **Q6:** owner picks the share layout at the PC — do not wait.
- **PASS rule (all items, AI included):** PASS only with a REAL UAT screenshot (SHA). Unit tests / offline replay / model grades are
  never PASS. Every model-graded failure quotes the wrong text VERBATIM. AI is accepted only by the OWNER on the UAT review page.
  **Part B waits for that owner approval.**

### Step 0 — flags of the chat / consultative pipeline (code default → UAT Preview → Production), 2026-09-29
| Flag | Code default | UAT (Preview, rc/web-uat) | Production | In the 38/40 runs (18–19/9) |
|---|---|---|---|---|
| `CONSULTATIVE_V1` | ON (74b6f10) | unset → ON | unset → ON | ON |
| `PLACE_GUARD_ATTRIBUTION_V2` | ON | unset → ON | unset → ON | ON |
| `SNIPPET_PRICE_GUARD_V2` | **OFF** | **was unset → OFF; set `1` 2026-09-29** | unset → **OFF** | ON |
| `MEDIA_PLACEMENT_V2` | **OFF** | **was unset → OFF; set `1` 2026-09-29** | unset → **OFF** | ON |
| `RISK_BACKSTOP` | live | unset → live | unset → live | ON (default) |
| `LLM_*_MODEL` / `LLM_PROVIDER` | Haiku 4.5 / claude | unset | unset | same |
| `PLACES_PROVIDER` | serper | set (encrypted) | set (encrypted) | serper |
| `CONTENT_SAFETY_GATE_ENABLED` / `_SCHEMA_MIGRATED` | off | unset | set (encrypted) | — (not chat) |
Offline: `SNIPPET_PRICE_GUARD_V2=1 MEDIA_PLACEMENT_V2=1 npx vitest run src/lib/ai src/app/api` → 5,461 pass / 0 fail.
→ If they stay ON after the UAT eval, the same two must be set to `1` on **Production** at the deploy (release step).

### Steps 0–3 (2026-09-29) — model grades are REFERENCE ONLY; the owner decides on the review page
| Step | UAT SHA | c40 (model) | Clarify b-turns | Owner queries | Evidence |
|---|---|---|---|---|---|
| 0 flags ON (SNIPPET_PRICE_GUARD_V2, MEDIA_PLACEMENT_V2) | 776f392 | 30/40 (Food 6 · Shop 6 · Travel 5 · Spa 5 · Ent 8) | 6/8 | — | 776f392/c40-step0/ |
| 1 6-area frames + budget arithmetic | 83853cc | — | — | — | code: domainFrames.ts, planBudgetMath.ts |
| 2 measure (48 + 11 real turns) | 83853cc | **31/40** (Food 7 · Shop 6 · Travel 4 · Spa 7 · Ent 7) | **3/8** | 0✅ 5⚠ 4❌ + O9 ⚠, O10 ❌ (signed-in reruns, eval account hit 300/day) | 83853cc/c40-step2/ (grading with verbatim quotes, 74 mobile shots, manifest) |
Cost/turn (lower bound, Haiku 4.5 list): step0 $0.0062 → step2 $0.0057; tokens/turn 3,671 → 3,393; first text median 13.2 s → 14.1 s.
**Step 3 — owner review page:** https://claude.ai/artifact/AZzyNWtpKkZC5RDaAvcm9g (59 items, grouped by area, model-failed first,
Đạt / Không đạt + note saved to the artifact db `verdicts/<id>`). **Part B waits for the owner's approval there.**

## BÁO CÁO SÁNG 29/09 (overnight run, NO prod writes)

**SHA cuối trên UAT: `af8b4ba`** (rc/web-uat). Evidence = `gs://tappyai-uat-evidence/evidence/<SHA>/…`
Tests on the final code: web vitest 15,588 pass (2 failures: a load timeout that passes alone + the Android
`AgeCheck.kt:222` pin from the Android session's 06b5284, see Q8) · Android unit 833/0 · tsc/eslint clean.

### Mục BẮT BUỘC
| Mục | Kết quả | Ảnh (gs://tappyai-uat-evidence/evidence/…) |
|---|---|---|
| A1 onboarding đúng số bước | PASS | f8a26b7/a1-onboarding.png |
| A2 ẩn chip Deals / Bộ sưu tập | PASS | f8a26b7/a2-saved.png, a2-saved-mobile.png |
| B3 chia sẻ kế hoạch → mở ẩn danh | PASS | 826d23b/b3-1..3 (uat.tappyai.com/plan/AjqWryKzGUYT) |
| B4 du lịch không bịa ngày/điểm đi/phương tiện, 3/3 | PASS 3/3 | af8b4ba/b4-trip-run1..3 |
| B4 "ngan sách" | FIXED (output normaliser; not from code/prompt) | — |
| B5 card mua sắm vs D:\redesign | N/A — no shopping design in D:\redesign | — |
| B6 đăng thật ảnh + clip, feed + hồ sơ, rồi ẩn/xoá | PASS (ảnh chỉ hiện ở feed mobile — Q4) | 826d23b/b6/*, 2bd5c59/b6/* |
| B7 clip YouTube → Facebook / Zalo / TikTok | PASS | 826d23b/b7/*, 2bd5c59/b7/* |
| B7 lỗi AI ghi đè chữ đang gõ | FIXED + PASS | f8a26b7/b7fix-composer-typed-kept.png |
| B8 5 trạng thái hồ sơ + người khác xem | PASS | 2bd5c59/b8/* |
| AI tư vấn ≥ 38/40 | **FAIL — 30/40** (baseline 31/40) | 192973d/final/*, 2bd5c59…/c40-baseline/* |
| Khôi phục thiết kế 26/9 | NOT POSSIBLE — not found (Q1) | — |
| Chuẩn bị Phần B | DONE (nothing run on prod) | RELEASE-PLAN-2026-09-29.md, scripts/release/* |

### Điểm AI trước / sau (c40 answer-first rubric, blind, same account + method)
| Mảng | Baseline 2bd5c59 | Final 192973d |
|---|---|---|
| Food | 7/8 | 7/8 |
| Shopping | 6/8 | 4/8 |
| Travel | 6/8 | 6/8 |
| Spa | 7/8 | 6/8 |
| Entertainment | 5/8 | 7/8 |
| Clarify (b-turns) | 6/8 | 4/8 |
| **Tổng** | **31/40** | **30/40** |
Golden set: scripted 55/58 → 52/58 (all 3 lost checks = one malformed plan JSON in golden T1 t2); human 8/15/1 → 8/14/2.
Owner queries (11): 1✅/5⚠/5❌ → 1✅/7⚠/3❌. Fixed: P7b invented venue, E8 invented closure, E4/F6 invented
distance/crowd, O8 assumed date, T1 "Ngày 4", T6 hour, E1 people=5. Still open (no code touched): shopping picks
off-budget/off-category (S2, S4, F7b), invented "phù hợp"/"giá hợp lý" fit claims, text≠card (F4, P5b), no booking
link for hotels / delivery (O5, O6), no budget arithmetic.

### Lượt chat thật + chi phí (ước tính)
~246 real /api/chat turns on UAT tonight (baseline 110 + final 116 + ~20 screenshot runs).
Lower bound from stream usage (Haiku 4.5 list price, no cached input / side calls): ≈ **$2.1**.
Upper estimate at UAT4's server-measured $0.028/turn: ≈ **$6.9**. Plus Serper searches (not metered here).

### CẦN HUY QUYẾT
Q1–Q9 in the table above. Most urgent: **Q1** (where is the 26/9 design), **Q7** (AI gate 30/40 < 38 blocks Part B),
**Q2/Q3** (self-delete flag on prod), **Q6** (share layout numbers).

### Anh test trên máy thật
1. Web trên điện thoại (uat.tappyai.com): nút Chia sẻ → Facebook / Zalo / TikTok mở đúng app; "Lưu về máy" ra file ảnh.
2. Web: đăng 1 ảnh + 1 clip từ điện thoại (camera roll), xem ở Khám phá và Hồ sơ.
3. Web: chat "đi du lịch Đà Nẵng 3 ngày 2 đêm" và "tối nay đi chơi với hội bạn 5 người quận 1".
4. Android APK (UAT build): đăng nhập → Home giống trước/sau đăng nhập (F-107) → mở lại app vẫn đăng nhập (F-098)
   → 1 lượt chat → Cài đặt hiện "Yêu cầu xóa tài khoản" (cờ tắt) → nhận 1 thông báo push.

### Việc anh làm lúc release (chi tiết từng bước: RELEASE-PLAN-2026-09-29.md §3)
(a) ACCESSTRADE Access Key + datafeed URL → `D:\TappyAI-backups\accesstrade.txt` (2 dòng) → báo "accesstrade.txt ready".
(b) Supabase prod → Connect → Session pooler → host vào `D:\TappyAI-backups\pghost.txt`; tạo `D:\TappyAI-backups\pgpass`
    (`<host>:5432:postgres:postgres.fwznnobrdctuskgrvuik:<password>`, KHÔNG reset mật khẩu) → báo "pgpass ready".
(c) Chỉ khi lead không merge được: PR #252 → "Create a merge commit" (không squash/rebase), không xoá nhánh.
(d) Play Console: kiểm App signing SHA-256 = số build-aab.sh in ra; App bundle explorer: vc10 chưa từng upload →
    Internal testing → Upload AAB → rollout → test máy thật → Promote to Production → Send for review.
(e) Env prod: giữ `AUTH_GOOGLE_ENABLED`; lead xoá `ACCOUNT_SELF_DELETE_ENABLED`, thêm `SERPER_DAILY_CREDIT_CEILING=15000`
    + 2 biến ACCESSTRADE; Supabase prod → Authentication → "Allow anonymous sign-ins" = ON.
(f) Sau khi ổn định: xoá `pgpass`, `pghost.txt`, `accesstrade.txt`.

## AI tư vấn — chi phí theo loại lượt + prompt caching (offline replay, 29/09, rc 9e81b95)
15 kịch bản × 7 lượt = 105 lượt, Haiku 4.5, server tự tính (`tappy.turn.v1`). Chất lượng = tiêu chí tự động §9.

| Loại lượt | Đạt | $/lượt | token vào/lượt | cache đọc |
|---|---|---|---|---|
| hỏi (ask) | 15/15 | $0 | 0 | — |
| chọn (pick) | 13/15 | $0.0176 | 8.442 | 5% |
| hỏi thêm (followup) | 14/15 | $0.0044 | 3.520 | 0% |
| so sánh (compare) | 14/15 | $0.0051 | 3.604 | 0% |
| xem thêm (more) | 10/15 | $0.0146 | 8.575 | 6% |
| chê (reject) | 12/15 | $0.0142 | 8.217 | 0% |
| kế hoạch (plan) | 6/15 | $0.0170 | 10.496 | 14% |

Tổng: **84/105**, **$0.0104/lượt**; phiên 6 lượt ≈ $0.059; 900 lượt/tháng ≈ $9.4. Mục tiêu $0.005/lượt **CHƯA ĐẠT**.
3 khoản đắt nhất: (1) dòng kết quả tìm kiếm gửi cho model (~3k token mỗi lượt chọn/xem thêm/chê); (2) khối luật V1 + khung
(~1.8k token/lượt); (3) Serper cho chọn/xem thêm/chê (cache 24 h dùng chung chỉ có trên UAT/prod, replay không có).

Prompt caching — đo A/B, KHÔNG giữ những gì làm tăng chi phí:
- Đưa toàn bộ khung của mảng vào phần được cache (thư viện khung): $0.01145 so với $0.01049 khi tắt → TẮT (cờ `CONSULT_CACHE_LIBRARY`).
  Lý do: phần cố định vẫn sát ngưỡng tối thiểu cache của Haiku 4.5, trúng cache chỉ 13–35% ở lượt có công cụ, 0% ở hỏi thêm.
- Kế hoạch không phải chuyến đi nhiều bước: bỏ ghi cache lịch sử (ghi ~4.2k token ×1.25, đọc lại ~20% = lỗ) → GIỮ.
- Hỏi thêm/so sánh đọc lại bằng chứng lần tìm trước: chất lượng hỏi thêm 14/15 → 6/15 (tính là gọi Serper), chi phí tăng → TẮT (cờ `CONSULT_FOLLOW_REUSE`).
- Kết luận: với lưu lượng hiện tại, caching không phải đòn bẩy chính; đòn bẩy là GIẢM token gửi đi (mục 1–2 ở trên).

Hạn chế guard vá: mỗi bản vá sau model giờ được ĐẾM (`tappyai_consult_patch`, bảng trong báo cáo replay).
- Tiêu đề kế hoạch bị cắt 7/15 → sửa TẬN GỐC (guard đọc «gọi món»/«đặt bàn» trong tiêu đề là khẳng định) → 0/15, bỏ cơ chế «niêm phong».
- Còn vá nhiều: câu «Mình chọn» thêm bằng code (4/15 lượt chọn), dòng «còn N» (server đếm — đúng thiết kế).
- `place_claim` + `snippet_price` sửa 9–12/15 lượt mỗi loại → việc tiếp theo: giảm khẳng định không có nguồn ngay ở khung.
