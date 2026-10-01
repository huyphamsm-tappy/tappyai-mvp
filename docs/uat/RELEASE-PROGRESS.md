# RELEASE PROGRESS — 2026-09-28/29 (read this first after a context reset)

**Worktree (the only one):** `C:\wtrel` · branch `release/rc-merge-main-2026-09-29` → pushes to `origin/rc/web-uat`.
UAT = https://uat.tappyai.com (bound to branch rc/web-uat, audit DB `zdaprdfgpbpnxyofagmc`, behind Vercel SSO;
bypass secret in `D:\TappyAI-backups\vercel-bypass.txt`, header `x-vercel-protection-bypass`, never print it).
Check the running SHA: `GET /api/version` with the bypass header.

## ▶ LUNA SẴN SÀNG GỘP — commit f82fcaa (nhánh `origin/luna/consult-2026-09-30`), 2026-09-30
Owner 30/09 (GẤP): Anthropic hết credit, không nạp → GPT-6 Luna lên production CÙNG release Phase 7. Phiên Luna làm code;
**phiên web gộp nhánh vào rc/web-uat và release.** Nhánh đã rebase lên rc @95dbe94 (có bảo mật, bộ làm sạch Serper, I6,
thẻ hỏi v2, 3 bản sửa kế hoạch). Chi tiết: `docs/uat/LUNA-REPORT.md` (§7–§13), `docs/uat/LUNA-PROGRESS.md`.

**Đã chuyển — MỌI lời gọi AI đi qua lớp LLM (`src/lib/ai/llm`), mặc định giờ là Luna; không còn chỗ nào gọi Anthropic:**
chat tư vấn + chat thường (fast/smart/planning, có ảnh = vision), hiểu ý định (structured), kế hoạch chi tiết, ScamShield
(phân tích tin nhắn + đọc ảnh chụp), quét ảnh `/api/scan`, phân tích nội dung upload (explore), Viết content, dịch, gợi ý
nhóm, trích/tóm tắt trí nhớ, 4 cron (deal-notifications, morning-brief, price-check, weekly-recap). Không có judge chạy trong app.
Mức suy nghĩ: none mọi nơi; kế hoạch du lịch low (không công cụ); lời gọi có công cụ luôn none (API chỉ nhận none khi có công cụ).
Định dạng đầu ra giữ nguyên (Viết content JSON {caption, hashtags}, dịch {translation}, ScamShield JSON…).

**Khi Luna lỗi/timeout:** thử lại Luna 1 lần → vẫn lỗi thì đường lỗi sẵn có của từng nơi (chat: câu «Mình gặp trục trặc…
Thử lại» + hoàn lượt hỏi). KHÔNG gọi Anthropic (HAIKU_FALLBACK mặc định TẮT). Code Haiku giữ nguyên.

**Kiểm tra:** 16.143 test đạt · typecheck · lint 0 · 15/15 luật kiến trúc. Test sống 10/10 tính năng trên Luna, 0 request tới
Anthropic (`LUNA_FEATURE_SMOKE=1 npx vitest run scripts/consult/luna/featureSmoke.test.ts`). ⚠ `scripts/controlBytes.test.mjs`
chập chờn khi chạy CẢ bộ song song (2/3 lần; chạy riêng luôn đạt; lần full cuối 0 trượt). 🔑 Sửa kèm một lỗ SSRF: lớp bọc
model làm rơi `supportsImageUrls` → SDK sẽ tự tải URL ảnh do user đưa; đã sửa + test.
Replay cấu hình production (15×7): 95/105 tự động, 105/105 lượt do Luna, 0 thử lại, $0,0033/lượt, chữ đầu p50 2,2 s / p90 6,7 s.
Chấm tay: lượt tư vấn A=0, B=1 (SHOP-3 t5 chọn máy 4GB cho học thiết kế, có nói rõ hạn chế), C=1, D=1. Kế hoạch 3/16 đạt đủ 10
điều, 2 chi tiết bịa (Haiku trước: 2/55 đạt, 177 bịa) — lỗi chính: mục kế hoạch chỉ có câu «Chưa có thông tin đã kiểm cho mục này».

**Biến môi trường (Production + Preview):**
| Biến | Giá trị | Ghi chú |
|---|---|---|
| `OPENAI_API_KEY` | **bắt buộc** | thay `ANTHROPIC_API_KEY` trong danh sách 5 biến bắt buộc của `scripts/check-env.mjs` |
| `LLM_PROVIDER` | **không đặt** (hoặc `openai`) | ⚠ nếu đang có `LLM_PROVIDER=claude` thì XOÁ — `claude` = quay về Haiku |
| `CONSULT_LUNA`, `CONSULT_LUNA_FAST`, `CONSULT_LUNA_PLAN` | không đặt (mặc định BẬT) | đặt `0` để tắt từng phần |
| `HAIKU_FALLBACK` | không đặt (TẮT) | `1` chỉ khi Anthropic có credit lại |
| `LLM_PLAN_REASONING` | không đặt (= low) | tuỳ chọn |
| `LLM_LUNA_MODEL` | không đặt (= gpt-6-luna) | tuỳ chọn |
| `LLM_FAST_MODEL` / `LLM_SMART_MODEL` / … | bỏ qua khi dùng Luna | chỉ đọc khi `LLM_PROVIDER=claude` |
| `SERPER_CACHE_V2` | tuỳ chọn `1` | giá cũ tối đa 6 giờ thay vì 24 giờ; mặc định TẮT |
| `ANTHROPIC_API_KEY` | để nguyên / bỏ | không còn được dùng |
**Quay lui:** `LLM_PROVIDER=claude` (cần Anthropic có credit) → đúng pipeline Phase 7 Haiku.

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

## /reviews LOAD TIME — 2026-09-29 (owner: >3 s to first content = blocker)
Method: headless Chromium, mobile 390 px, slow 4G (150 ms RTT, 1.6 Mbps down, 750 kbps up), CPU ×4, cache off, signed-out, language pre-chosen. FCP/LCP from PerformanceObserver; "usable" = a feed item visible and no long task for 2 s. Script: scratchpad pw/perfReviews.mjs; evidence gs://tappyai-uat-evidence/evidence/perf-reviews-2026-09-29/ (JSON per run, screenshots, filmstrip.jpg).

| Build | FCP (ms) | LCP (ms) | Usable (ms) |
|---|---|---|---|
| UAT 727e01a (before) | 4040 | 5520 | 7589 |
| UAT 7e7dfe4 (feed shell) | 3716 · 2876 | 5964 · 4444 | 5971 · 6539 |
| UAT 7ec6970 (+ posthog out of the root bundle) | 3332 · 2620 · 2636 · 2616 · 2640 — **median 2636** | 5112 · 3972 · 3872 · 3752 · 3816 | 5128 · 6120 · 5957 · 5839 · 5891 |
| Production f42ae4b (reference, same conditions) | 2800 · 2728 | 7136 · 2984 | 7269 · 3078 |

- **Root causes found:** (1) the page rendered **null** until the media query resolved and its Suspense fallback was null → the HTML had no content (30 chars: the title), first paint waited for the whole client bundle; (2) the render-blocking CSS (49 KB) finished at 2.9 s because ~578 KB of JS downloaded beside it — incl. posthog-js (68 KB) on every page although the PostHog key is deliberately unset, and the full UI dictionary in BOTH languages for every area (110 KB compressed).
- **Fixed:** feed shell in the first HTML (7e7dfe4); posthog-js loaded only when a key is configured (7ec6970). Median FCP 4.0 s → **2.6 s** (one run of five 3.3 s).
- **The "44 s" on production was a measurement artifact** of the baseline script (it waited for network-idle; the video feed never goes idle). Production paints at ~2.8 s.
- **Open (not a blocker by the 3 s FCP rule, reported honestly):** real feed content on UAT arrives at ~5.8 s vs 3.1–7.3 s on production — the V3 bundle is heavier and the feed fetch starts only after hydration. Next steps (post-launch backlog unless Huy says otherwise): split the UI dictionary per language/area (−55…110 KB), start the feed request before hydration, lazy-load the desktop ExploreStage on mobile.

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
| ~~Q-SL1b~~ CLOSED 29/09 — NOT a product bug | The 401 came from the TEST HARNESS: a request routed through Playwright `page.route` (`continue` or `fetch`) loses the 3 kB Supabase auth cookie → 401; the same call un-intercepted → 200 (`cookieRepro`: before/after a chat turn 200/200, via route 401/401, unrouted 200). A simulated expired token also refreshes and shares fine (200). | Harness fixed (retry goes out un-intercepted; "pending" held by CDP network latency). Real link state shot on UAT 727e01a: `/plan/1FL5rfTQCIlJ`, "Sao chép link" — gs://tappyai-uat-evidence/evidence/727e01a/q-sl1b-fixed/. Removed from Huy's real-phone list. |
| ~~Q-ENV1~~ DECIDED 29/09: ADD on Production + full parity table RELEASE-PLAN §2g | `SNIPPET_PRICE_GUARD_V2` is set on **Preview for `rc/web-uat`** (added ~28/09 evening) — UAT and the replay run with it **ON** — but it is **absent on Production**, where the code default is **OFF**. RELEASE-PLAN §2d still says "unset = OFF, as tested", which is no longer true. | Nothing changed. Huy: either add `SNIPPET_PRICE_GUARD_V2=1` to Production at the release (ships what UAT tested — recommended), or remove it from Preview and re-run the replay/UAT with it off. |
| Q-PROD1 | `commerce_providers` + its 7 tracked rows were applied to **production** on 27/09 (AFFILIATE_STATUS §0), while RELEASE-PLAN §1 still lists #5 / #7 as APPLY-before-deploy. | RELEASE-GOVERNANCE §4 step 2: #5 and #7 are VERIFY-ONLY; #6 applied only if the pre-check shows it absent. The current production code (`f42ae4b`) does not read these tables — no effect today. |
| Q-AI-C1 | Two guard false positives found in replay r25 plan turns: (1) a chain HOTLINE (`1900 0303`, carried by every branch row) was deleted as unattributable — FOOD-2 plan then read "Nhưng …" with a list starting at "2."; (2) the venue ticket-sale rule cut flight-booking instructions ("Hướng dẫn đặt vé máy bay:", "Vào trang đặt vé — chọn một trong hai:") — TRAVEL-3 plan lost its structure. Fix + tests in `docs/uat/patches/2026-09-29-c1-guard-false-positives.patch`. Replay (new checker, mean of 2): baseline 87.5/105 @ $0.00886 → with the fix 86.5 @ $0.00879. None of the turns that flipped involves a phone or a ticket sentence (flips both ways: FOOD-1/3, SHOP-1/2/3, SPA-1/2, ENT-1/2, TRAVEL-1/2) — model variance. | **Not kept** (owner rule: quality mean −1). Huy: keep it anyway as a correctness fix (it can only keep supported text), or re-measure with 4 runs? |
| 🚨 Q-API1 (29/09 ~19:50 VN) | The Anthropic key used by the replay (`g1-place-guard/.env.local`) answers 400 "You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC" (07:00 VN) — same as 28/09. Replay D2-B collapsed to 17/105 on it. Unknown whether UAT / production use the same Anthropic organisation (key identity check was refused before — not retried). If they do, AI chat on UAT **and production** is down until 07:00 VN. | Stopped all replays / UAT AI runs. D2 (shopping: store the RANKED rows for more/reject; 1 valid run 91/105 @ $0.00894) parked in `docs/uat/patches/2026-09-29-d2-shopping-store-ranked-rows.patch`, repo = measured D1. **Huy: raise the monthly limit in console.anthropic.com → Settings → Limits (or confirm prod uses another org/key), and check www chat now.** |
| Q-AI-STATE (29/09) | Replay, mean of 2, new checker: baseline 87.5 → C2 89 → (flight checker, B1) 90 @ $0.00892 → D1 92 @ $0.00889. By area (D1): spa 20.5, entertainment 19.5, travel 18, shopping 17.5, food 16.5 (food moves 15–20 between runs of the same code). Remaining repeat failures: SHOP-1 reject (the search returns 1 product, only in black), TRAVEL-2 reject (3 hotels for a vague destination, all already offered), SHOP-3 more/reject (fixed by D2, unmeasured), food plan headings / reject on FOOD-2. | §9 not reached in all 5 areas yet → §10 not started. |

## ▶ AI TƯ VẤN — QUYẾT ĐỊNH CỦA HUY + THỨ TỰ LÀM (29/09 tối) — đọc trước khi làm tiếp
Quy tắc: mỗi thay đổi giữ/bỏ theo **trung bình 2 lượt replay, hai cột** (chất lượng, $/lượt) — giữ khi không cột nào kém đi.
- **Q10 (đã quyết):** vé máy bay KHÔNG cần nguồn giá (không Travelpayouts). Một lượt vé máy bay ĐẠT khi: không bịa giá; có link tìm vé
  Traveloka **qua ACCESSTRADE** điền sẵn chặng + ngày (sub1 theo phương án C = mã ngẫu nhiên do `/go/at` thêm lúc bấm); ghi rõ
  "xem giá trên Traveloka"; phần tư vấn còn lại đúng. Link Traveloka trực tiếp (không qua ACCESSTRADE) = TRƯỢT.
- **Q-AI-C1 (đã quyết): GIỮ** bản sửa 2 guard — đã áp và commit `acec34c` (patch `docs/uat/patches/2026-09-29-c1-guard-false-positives.patch`
  kiểm `git apply -R --check` = đã có trong code).
- **Thứ tự:** (1) sửa bộ chấm Q10 + chạy lại 2 lượt, báo điểm du lịch → (2) C1 (xong) → (3) mua sắm: trích nguyên văn lượt trượt, sửa gốc
  (prompt/dữ liệu đưa vào, KHÔNG thêm guard vá) → (4) du lịch phần còn lại. Ăn uống KHÔNG phải mảng yếu nhất.
- **Khi mục 9 đạt ở CẢ 5 mảng:** chạy thật một lượt đầy đủ mục 10 → gửi trang UAT cho Huy duyệt; đồng thời ghi "AI tư vấn ổn định" + câu trả
  lời thô cuối + đặc tả thẻ kế hoạch vào `ANDROID-REQUESTS.md` (phiên Android đang chờ).
- **Ghi nhận 29/09 21:00 (bước 1):** replay trước đây KHÔNG giống production ở 2 chỗ — (a) client Supabase giả trả bảng `commerce_providers`
  rỗng → Traveloka (mã chiến dịch chỉ nằm trong bảng) ra link TRỰC TIẾP; (b) user giả `u1` không có dạng id → không có link `/go/at`. Bộ chấm cũ
  lại chấp nhận link trực tiếp. Đã sửa harness (fixture = các dòng của DB audit, trùng production) + bộ chấm; lượt "chốt, hướng dẫn đặt vé"
  (TRAVEL-3) đang lập kế hoạch khách sạn + quán ăn thay vì gọi lại tra vé → sửa gốc ở route. Điểm đo lại: xem Q-AI-STATE.

### AI tư vấn — kết quả đo 29/09 tối (trung bình 2 lượt, bộ chấm Q10 mới, harness = production)
| Bước | Chất lượng /105 | $/lượt | Ăn uống · Mua sắm · Du lịch · Giải trí · Spa | Giữ/bỏ |
|---|---|---|---|---|
| Baseline (bộ chấm mới, harness đúng prod) | 89.5 | 0.00916 | 18 · 16 · 15 · 20 · 20.5 | — |
| E1 lượt kế hoạch vé máy bay gọi lại tra vé + guard "Bước 1:" (`9b7fd81`) | 91 | 0.00885 | 19.5 · 16.5 · 16 · 18.5 · 20.5 | **GIỮ** |
| E2 thẻ mua sắm chỉ lựa chọn chính + 2, router bỏ tên sản phẩm user chép lại, dòng "còn N" | 90.5 | 0.00857 | 19 · 16 · 15.5 · 19 · 21 | bỏ (−0.5) |
| E2b = E2 + kho sản phẩm mở rộng + luật lượt bác | 91 | 0.00895 | 19.5 · 15.5 · 15 · 20 · 21 | bỏ (chi phí +1%) |
| E2c = E2 + lượt bác có yêu cầu mới thì tìm lại + "không thích X" không thành "muốn X" | 88.5 | 0.00860 | 17.5 · 16 · 14.5 · 20 · 20.5 | bỏ |
| E3 nhãn link vé = "Xem giá trên Traveloka" (Q10) | **95** | 0.00898 | 19.5 · 16.5 · 17.5 · 20.5 · 21 | giữ — ⚠ chi phí +1.5% (xem Q-AI-E3) |

Patch E2/E2b/E2c lưu ở scratchpad phiên (không trong git) — ý tưởng đúng gốc nhưng không vượt được độ dao động của 2 lượt.

- ~~Q-AI-E3~~ **ĐÃ QUYẾT (Huy 29/09 tối): GIỮ E3** — chất lượng +4, chênh chi phí nằm trong dao động.
- ~~Q-AI-S9~~ **ĐÃ QUYẾT (Huy 29/09 tối) — NGƯỠNG RELEASE MỤC 9:**
  - Mỗi mảng **≥ 17/21** (trung bình 2 lượt replay ĐỦ BỘ) **VÀ 0 lỗi mức A, 0 lỗi mức B, tối đa 1 lỗi mức C**.
  - Đạt ngưỡng là **DỪNG tinh chỉnh mảng đó** — không đuổi 21/21 (Phase 8 chuyển sang GPT-6 Luna và làm lại prompt). Lỗi D còn lại → `POST-LAUNCH-BACKLOG.md` cho đợt Luna.
  - **Phân loại lượt trượt (bắt buộc với replay mới nhất và mọi lần đo sau):**
    - **A. Sai/bịa thông tin** (giá, địa điểm, giờ, món, link sai đích) — PHẢI = 0.
    - **B. Hiểu sai ý người dùng** (sai mảng, sai khu vực/ngân sách/số người, bỏ qua yêu cầu, lặp lựa chọn đã bác) — PHẢI = 0.
    - **C. Thiếu thông tin quan trọng để quyết định** (không có lý do, không có nút hành động, không nói thiếu dữ liệu) — tối đa 1/mảng.
    - **D. Lỗi định dạng/nhãn** (thiếu dòng "còn N", chữ nhãn nút, số phương án khác, tiêu đề) — chấp nhận trong ngưỡng ≥ 17/21.
  - Báo bảng: mỗi mảng → số lượt trượt theo A/B/C/D, trích NGUYÊN VĂN mỗi lượt A/B/C. Lượt A hoặc B nào còn thì SỬA TRƯỚC, bất kể điểm mảng.
  - Du lịch: dừng tinh chỉnh (trừ lỗi A/B). Mua sắm: giữ 2 sửa router ("không thích X" ≠ muốn X; tên sản phẩm chép lại trong "A hay B?"
    là tham chiếu) + xoá dòng "Còn N lựa chọn" do model tự viết (có test); BỎ kho sản phẩm mở rộng; đo RIÊNG mua sắm 4 lượt trước/sau.
  - Sau đó: replay đủ bộ 2 lượt xác nhận cả 5 mảng → chạy thật mục 10 trên UAT (trang duyệt ghi mức lỗi từng câu) → ANDROID-REQUESTS
    "AI tư vấn ổn định" + câu trả lời thô cuối + đặc tả thẻ kế hoạch.

### AI tư vấn — phân loại A/B/C/D + mua sắm 4 lượt (30/09 ~00:30)
**Replay đủ bộ mới nhất (E3, 2 lượt) — lượt trượt theo mức (đọc tay):**
| Mảng | Điểm TB | A | B | C | D | Ghi chú |
|---|---|---|---|---|---|---|
| Spa | 21 | 0 | 0 | 0 | 0 | |
| Giải trí | 20.5 | 0 | 0 | 0 | 1 | ENT-2 t2: 2 dòng "Mình chọn" (D) |
| Ăn uống | 19.5 | 0 | 0 | 2 (1/lượt) | 1 | FOOD-2 t7 không gợi ý món (C); FOOD-2 t6 bác xong không nêu tên quán (C) |
| Du lịch | 17.5 | **1** | **2** | 2 (1/lượt) | 4 | ⚠ TRAVEL-2 t2 ĐƯỢC CHẤM ĐẠT nhưng là **B**: "thích núi, gần Sài Gòn" → chọn KS ở **đường Núi Thành, Tân Bình**; t3 **A**: "Tân Bình cách TP.HCM 30–45 phút"; t6 **B** lặp KS đã hiện. TRAVEL-3 t7 mất link Traveloka (model chép sai URL /go/at dài ~500 ký tự → guard egress xoá) = C |
| Mua sắm | 16.5 | **1** | **4** | … | … | SHOP-1 t6 "không thích màu đen" → vẫn chọn ốp đen (B, router đọc thành *muốn* màu đen); SHOP-3 t5/t6 ràng buộc "Dell" user không hề nói (B, tên chép lại trong "A hay B?"); SHOP-2 t7 "Giấy gói quà ~20.000đ", "Tổng ~105.000đ" (A) |

**Mua sắm — đo riêng 4 lượt × 21 lượt:**
| Bản | 4 lượt | TB | A | B | Ghi chú |
|---|---|---|---|---|---|
| Trước (E3) | 15·19·16·18 | 17.0 | 1 | 5 | |
| R = 2 sửa router + xoá dòng "Còn N" model viết | 16·19·16·18 | 17.25 | 1 (SHOP-2 giá khoản phụ) | "Dell" còn (từ 3 lớp khác) | hết lỗi "màu đen" |
| AB2–AB4 (+ thẻ 3 sản phẩm, bằng chứng giá kế hoạch, bỏ tên chép lại ở need profile / situation / shopping constraints) | 16.75 · 16.25 · 15.0 | | 0 | 2 → 0 | thẻ 3 sản phẩm làm guard cắt tên phương án ở "xem thêm" → C tăng; BỎ |
| AB5 = R + bỏ tên chép lại ở cả 4 lớp + bằng chứng giá kế hoạch + bác không nhận lại cái đã hiện + TRAVEL-2 | 15·15·18·16 | 16.0 | 0 | 1–2 mới | hết "Dell"; nhưng lượt "xem thêm" tìm lại ra **dịch vụ sửa laptop**, lượt bác chọn **ba lô** (B mới, do dữ liệu tìm kiếm) |
Chưa commit — patch lưu scratchpad (shopR / shopAB5). Chờ Huy (Q-AI-SHOP).

### ▶ AI TƯ VẤN — KẾT QUẢ CUỐI (30/09 trưa) — ngưỡng release ĐẠT, chờ Huy duyệt trang UAT
- **Replay đủ bộ, 2 lượt (17:40Z + 17:48Z 29/09), TB:** ăn uống 18,5 · mua sắm 17,5 · du lịch 17,5 · giải trí 18,5 · spa 20,5
  (92,5/105 @ $0,00916/lượt) — cả 5 mảng ≥ 17. Mua sắm đo riêng 4 lượt: 16 · 18 · 18 · 19 = 17,75.
- **Đọc tay (A/B/C/D):** A = 0 sau các sửa (dòng chi phí kế hoạch tính giá quán khác — FOOD-1/ENT-1/ENT-2/SPA-2 — sửa `2b46088`,
  `fbb1c3c`, test offline). B còn ở ngách: SHOP-1 lượt 6 (bác "không thích màu đen" → vẫn chọn ốp Scout không ghi màu), T3 lượt 2
  (câu cố định sau lượt hỏi). B lượt chính SHOP-2 lượt 4 (so sánh bị chèn "Mình chọn" món thứ ba) phát hiện ở UAT → sửa `b01b53c`,
  test offline. Luna 30/09: ngân sách đọc từ "Core i5-1334U" → sửa `af38b73`, test bằng dữ liệu SHOP-3.
- **Mục 10 chạy thật trên UAT:** 199 lượt (59 câu + 20 câu ý định trên `fbb1c3c`; 15 kịch bản × 7 lượt trên `55e298e`), ảnh mobile
  từng lượt, chi phí thật $1,29 (≈ $0,0065/lượt; 900 lượt/tháng ≈ $5,8). Đạt tự động theo mảng: ăn uống 33/35 · mua sắm 30/34 ·
  du lịch 32/34 · giải trí 34/34 · spa 32/34 · khác 23/28. Trang duyệt: https://claude.ai/artifact/T1ENadG4ZVDHEbnJaaGRFU
  Bằng chứng: `gs://tappyai-uat-evidence/evidence/s10-2026-09-30/`. ⚠ bộ đo: stream đọc sai mã hoá (cp1252) lúc chạy → chấm lại từ
  file thô; phần kịch bản chạy lại toàn bộ trên `55e298e` sau khi sửa (không còn câu "chỗ đó/chỗ kia" thay tên).
- Lỗi còn lại → `POST-LAUNCH-BACKLOG.md` PL-AI-LUNA. Vercel Function Storage 100% → việc 0 trong `OWNER-TOMORROW-2026-09-30.md`.
- Test toàn bộ trên ứng viên release: 15.824 qua; 5 lỗi → 2 lỗi thật đã sửa (`020ff56`: /go/at giới hạn theo IP nền tảng, số cron
  14), 1 lỗi timeout do tải máy (qua khi chạy riêng), kiến trúc 15/15.

### ✅ AI tư vấn — owner duyệt ĐẠT (30/09, sau khi sửa lỗi B duy nhất)
- Trang https://claude.ai/artifact/T1ENadG4ZVDHEbnJaaGRFU, kho `verdicts` ngày 30/09: 59 câu — 54 Đạt, 2 Không đạt, 3 chỉ ghi chú.
  (Các bản ghi không hậu tố `-t<n>` trong cùng kho là đánh giá cũ 28/09 của trang trước — không tính.)
- **T3 lượt 2 (B):** "Cái thứ hai có bao gồm ăn sáng không?" sau lượt hỏi → đưa quán ăn. Sửa `329973d` (câu có từ trỏ về luồng hiện tại
  không phải yêu cầu mới), test offline (trượt khi gỡ sửa), **chụp lại trên UAT: ĐẠT** ("Mình chọn: M Hotel Da Nang"), trang cập nhật (bản 2).
- **T5b lượt 1** (Không đạt, không ghi chú) → C, backlog PL-AI-OWNER-UAT-30-09. SPA-2 lượt 7 (thẻ kế hoạch) → backlog.
  ENT-3 lượt 7 "ủa cái", T4 lượt 1 "câu này " — ghi chú bị cắt, đã hỏi lại Huy.
- Bảo mật 30/09: nhánh `security/hardening-2026-09-30` gộp vào rc (`d4f5c8c`), UAT `6aade7a` smoke 5 luồng đạt; migration #20–#23 vào PHẦN B.
  Apple IAP: production KHÔNG có `APPLE_IAP_*` → verify trả 503, lỗ API-1 đang đóng; không thêm các biến này trước khi `fea7f38` lên prod.

### ▶ ĐÊM 30/09→01/10 — sửa B của trang Luna, R25, thẻ hỏi vé máy bay (UAT = `b88a499`, mã release; sau đó chỉ có commit tài liệu)
- **Trang duyệt (cùng link, bản 2):** https://claude.ai/artifact/KtAqAkz3s1hUdpsZQUiQnV — 35 hội thoại / 125 lượt trên Luna: **A = 0, B = 0**, C = 9, D = 11.
  9 hội thoại chụp lại sau 0:02 trên UAT (FOOD-1, FOOD-3, SHOP-3, SPA-3 chạy đủ 7 lượt; SHOP-2, TRAVEL-2, ENT-2, ENT-1, SPA-1 chạy lại).
- **B cũ đã hết:** SHOP-2 chọn set 1.150.000đ trong 1–2 triệu (nguyên nhân: «1-2 triệu» bị đọc là 1.000đ–2.000.000đ); TRAVEL-2 đổi ĐIỂM ĐẾN khi nói «chỗ khác / đi rồi»
  (Núi Dinh → Tây Ninh → Xuân Lộc, kế hoạch theo Xuân Lộc); khoảng cách tra 30/09: Núi Dinh ≈80 km (VnExpress), Núi Bà Đen 85–100 km, Núi Chứa Chan 100–110 km (mia.vn) — Bảo Lộc bỏ vì quá xa.
  **Lệch tin nhắn 01/10:** tin ghi «Tây Ninh → Bảo Lộc → Xuân Lộc»; tôi làm theo lệnh trước (xếp theo khoảng cách thật) nên thứ tự là Núi Dinh → Tây Ninh → Xuân Lộc.
- **R25 (3 ca chat web không có nút/link):** vé máy bay = LỖI THẬT (lệnh tìm vé cần điểm đi mà bộ hiểu ý không có → chạy tìm khách sạn); đã sửa `d016346` + hỏi «Bay từ đâu?» trong thẻ hỏi `848133c`.
  Karaoke tối nay / đồ ăn vặt Q1: server gửi ĐỦ thẻ địa điểm (8 nơi, 3–6 hành động mỗi nơi); phép kiểm cũ trượt vì cửa sổ giới thiệu lần đầu «Tappy muốn hiểu bạn hơn!» phủ lên thẻ hỏi, mọi lần bấm hết giờ và e2e cũ nuốt lỗi. Khi đóng cửa sổ: đạt 2/2.
  Chưa xử lý (chờ anh quyết): hai bộ 3 câu hỏi chồng nhau ở lần chat đầu.
- **E2E web chặt** (`scratchpad/pw/webe2e.mjs`, chạy trên UAT `cc02d4c`): 9/11 ĐẠT — flight, snacks-then-q1, pho-q3, pho-q1, pho-delivery, headphones, concert, hotel, followup-more; TRƯỢT: saigon-tonight (cửa sổ giới thiệu; đạt khi đóng nó, 2/2 trên b88a499),
  trip (tin kế hoạch cuối có thẻ quán + bản đồ nhưng không có link khách sạn — chưa rõ nguyên nhân). **trip-full chưa chạy lại.** Phép kiểm cũ của android/e2e/flows/chat.mjs đã ghi ở ANDROID-REQUESTS (R25) — không sửa thư mục android/.
- **Số test (rõ từng bộ):** bộ FULL gồm test DB trên mã release `b88a499`: **16.263 test, 16.180 đạt, 1 trượt** = `scripts/controlBytes.test.mjs` hết giờ 5 giây vì quét `scripts/` đang chứa file replay chạy đêm (chạy riêng với giới hạn dài: 3/3 đạt). Bộ full trước đó trên `f1e7dc9`: 16.246 / 16.164 / 0 trượt.
  12.754–12.755 = bộ con `src/lib` + `src/app/api`; 5.826 = bộ con `src/lib/ai` + `src/app/api/chat` — không phải full.
- **Xoá tài khoản:** cờ TẮT (trạng thái UAT, quyết định cho production) — ĐÃ chụp: dòng «Yêu cầu xóa tài khoản» → trang hướng dẫn email support@tappyai.com, không có nút xoá. Cờ BẬT: CHƯA kiểm (cần đặt biến Preview + deploy thêm; sẽ chụp đến bước xác nhận, không bấm xoá).
- **Lỗi mã tìm thấy trong đêm và đã sửa:** câu ghép của bộ lọc khi tên quán dài (b88a499); thẻ hỏi vé máy bay thiếu điểm đi (848133c).
- **Chưa làm / chưa kiểm:** FOOD-3 lượt 3 chưa chụp lại sau b88a499; cờ xoá tài khoản BẬT; trip-full web e2e; link khách sạn trong tin kế hoạch (trip); test APK Android cuối; GPS cho điểm đi (backlog PL-FLIGHT-ORIGIN-GPS).

### ▶ LUNA TRÊN UAT — chạy thật rút gọn 30/09 tối (UAT `3e763fb`), trang duyệt https://claude.ai/artifact/KtAqAkz3s1hUdpsZQUiQnV
- Gộp `luna/consult-2026-09-30` (@c4ddf3c) vào rc = `87007a1`; 16.150 test (2 quét repo quá giờ khi chạy cả bộ, chạy riêng đạt) · tsc · lint 0 lỗi ·
  kiến trúc 15/15 · build Vercel. Gói `@ai-sdk/openai@1.3.24` thêm vào node_modules dùng chung (khớp integrity lockfile).
- Env: `OPENAI_API_KEY` (key TEST 30 ngày → PL-OPENAI-KEY) + `SERPER_CACHE_V2=1` cho Preview + Production; không có `LLM_PROVIDER`;
  `ANTHROPIC_API_KEY` để nguyên. §2g + PHẦN B B0 đã ghi.
- Sửa trước lượt chạy (`54210f2`): kế hoạch ẩn mục không có dữ liệu + nói chặng thiếu ở cuối; mua sắm không chọn máy thiếu RAM cho mục đích
  đã nêu (SHOP-3 t5). Sau lượt chạy (`c2d8b59`): «không thích bar» không bị coi là muốn đi uống; chủ ngữ câu gộp bỏ đuôi «được xác nhận».
- Lượt chạy: 20 câu tiêu biểu + 15 kịch bản + ScamShield / Viết content / đăng clip có phân tích (cả 3 chạy Luna, ảnh giao diện thật).
  104 lượt, **A = 0**, B = 5 (TRAVEL-2 t5–t7 «đi rồi, chỗ khác» vẫn ở Tây Ninh; SHOP-2 t2/t6 lệch xa ngân sách 1–2 triệu), C/D ghi trên trang.
  **Chi phí thật (server UAT): $0,404 / 104 lượt ≈ $0,0039/lượt** (Haiku $0,00916); lượt nền trước sửa $0,232 / 107 lượt.
- ⏳ FOOD-1, FOOD-3, SHOP-3 (dừng ở lượt 1) và SPA-3 (lượt 4): 3 tài khoản test hết lượt hỏi trong ngày (Pro 300/300, free 15/15) —
  bộ đếm ở KV dùng chung với production nên KHÔNG xoá; chụp nốt + ENT-2 t7 sau 0h (giờ VN).
- Bằng chứng: `gs://tappyai-uat-evidence/luna-uat-2026-09-30/`.

### ✅ 3 lỗi code ở lượt KẾ HOẠCH CHI TIẾT (LUNA-REPORT §7) — sửa trong Phase 7, rc `43d4395` + `ca10919`
Kiểm trên rc hiện tại (sau các sửa dòng chi phí FOOD-1/ENT-1/ENT-2/SPA-2) bằng replay đúng các hội thoại có lượt kế hoạch lỗi
(13 kịch bản + E1-G5; replay `scenarios-2026-09-30T10-14` trước sửa): **cả 3 lỗi CÒN** → sửa:
- **(a) dòng "Chi phí"**: không có «Mình chọn» thì lấy quán KẾ HOẠCH viết ra (tên đủ thắng tên một phần; tên một phần phải có từ riêng,
  không lấy tên quận/từ thường — "Gia Đình" ≠ "giả định"), không lấy quán chốt cũ của luồng (ENT-3 BIBO KIDS bị ghi "KHU VUI CHƠI TRẺ EM";
  E1-G5 A Xỉu bị ghi "Cơm Ngon Hà Nội"); khung giá mở của Google giữ lại: «dưới 100.000đ» / «trên 1.000.000đ» (FOOD-2 Bánh Cuốn 1-100.000 ₫ bị ghi
  "chưa có giá"). Số người: không thấy lệch ở lượt chạy lại (ENT-1 8 người đúng).
- **(b) câu gộp "chưa xác nhận được"** (`hedgeCap.ts`): câu của guard giữ chủ ngữ thật («giờ chạy và giá vé cụ thể», «giờ mở cửa») thay vì
  «từ nguồn đã tìm»; một chủ ngữ nói một lần (giá / mức giá / giá trực tuyến); không ghép ô bảng hay «(chưa có giá)». Mệnh đề mục đích
  «để có phòng riêng» không còn thành «để mình chưa xác nhận được…» mà tách thành câu riêng (`unsupportedClaimGuard.ts`).
- **(c) mục khung trống**: mục chỉ còn tiêu đề → «- Chưa có thông tin đã kiểm cho mục này.» (`fillEmptyPlanSections`).
- Test offline bằng đúng các kế hoạch lỗi: `planCodeLines.test.ts` + `hedgeMergePlans.test.ts` — 9/11 ca TRƯỢT khi gỡ sửa; AI + chat 4.741 test đạt.
- Replay lại các lượt kế hoạch (`scenarios-2026-09-30T10-30` + E1-G5): 0 mục trống, 0 câu gộp lỗi; dòng chi phí đúng quán ở 12/13 kế hoạch có
  dòng chi phí — riêng E1-G5 còn sai ("Gia Đình" khớp "giả định") → sửa thêm `ca10919` (test có ca đó). **Lượt replay xác nhận `ca10919` KHÔNG
  chạy được: Anthropic báo HẾT CREDIT** ("credit balance is too low") — cùng lúc UAT trả "An error occurred." cho câu hỏi thật. Chạy lại
  E1-G5/ENT-1/ENT-3/SPA-1/SPA-2 khi có credit.
- **UAT build bị bỏ qua (đã sửa `26873c0`)**: `scripts/vercel-ignore.mjs` so commit với `HEAD^`; merge `70c7cd3` (bên kia chỉ có commit
  android) bị đọc là "chỉ android" → SKIP, 5 bản UAT 30/09 chiều bị Canceled. Giờ so với commit ĐÃ DEPLOY (`VERCEL_GIT_PREVIOUS_SHA`);
  merge không có SHA đó → build. Test bằng đúng merge `70c7cd3`. **UAT hiện chạy `26873c0`** (gồm sửa kế hoạch).
- Phiên Luna: rebase theo các file trên (`streamEnrichment.ts` planCostSubject, `planBudgetMath.ts`, `domainFrames.ts`, `hedgeCap.ts`, `unsupportedClaimGuard.ts`).

### ✅ Bảo mật 2c–2f (tin gộp 30/09) — UAT `e7a79a9`
- **2c Serper không tin cậy** (`79c79d7`): chỉ bộ làm sạch của luna `2f16ce8`, KHÔNG kèm Luna, chạy cho mọi lời gọi `serperPost`
  (`src/lib/ai/tools/serperUntrusted.ts`). Tên thật giữ nguyên (Say Cheese Studio, Reveal Beauty Spa, Quán Quên Lối Về, System Coffee).
  Tiêm lệnh với Haiku: **12/12 lượt sạch, 0 trượt** (`injectionCheck.mjs`). Bằng chứng: `gs://tappyai-uat-evidence/security-2026-09-30/serper-injection-haiku/`.
- **2d «Core i5-1334U»**: đã có trong rc từ `af38b73` (budgetFromHistory đọc tin đã bỏ tên chép lại), test dữ liệu SHOP-3 4/4.
- **2e I6 / R24** (`5eb785f`): `app_state` 5 phút trong cookie httpOnly/Secure/Lax → callback Zalo → `/auth/confirm` kiểm TRƯỚC khi dùng
  token, trả `state`+`app_state` trong fragment, dùng 1 lần. Test 26/26. Smoke UAT 6/6: Zalo web → Zalo; Android thiếu state → từ chối;
  có state → Zalo + cookie 5 phút; link magic giả `&platform=android` → từ chối và token KHÔNG bị dùng (cùng link vẫn đăng nhập web →
  email OK); Google web = PKCE S256. Zalo thật trên app: chờ Android e2e cuối. Supabase Redirect URLs: Huy xem (OWNER-TOMORROW B0).
- **2f «thích núi, gần Sài Gòn»**: 3 cách gõ (kịch bản, gõ tắt «gan sg / thik nui», một câu) → Tây Ninh / Núi Bà Đen, không Ba Vì.
- Kiểm toàn bộ: 16.057 test đạt, 3 test quét repo quá 5 giây khi chạy cả bộ (chạy riêng 26/26 đạt); tsc 0; lint chỉ cảnh báo có sẵn;
  kiến trúc 15/15; SQL grants 0 lỗi; build Vercel UAT READY. Smoke luồng bị đụng: Viết content 200, báo cáo 200, ScamShield CRITICAL,
  ảnh nhóm không còn EXIF/GPS, thông báo: URL metadata bị chặn 400, endpoint mới 200 (endpoint cũ tái dùng → 500 do luật một
  chủ/credential có sẵn, không phải lỗi mới). Không có migration mới trong đợt này.
- **Vercel**: owner chốt KHÔNG nâng Pro; kiểm không bị chặn ngay trước deploy production, bị chặn → dừng (OWNER-TOMORROW B0).

### ✅ Thẻ hỏi nhanh mới [TAPPY_ASK] — web LIVE UAT `1c5087b` (30/09, chỉ đổi giao diện)
- Đặc tả chung web + Android: `docs/design/ask-card/README.md` (R23 + **R23.1** §5). Server và tin gửi lên KHÔNG đổi.
  Web `1685c62` + `86f88d3` + `f6b4a31`; Android đã chép 1:1 (`e3aa75c`, `7f1646d`). iOS: `docs/ios/IOS-REQUESTS.md` I-1.
- Test: `askCardModel.test.ts` (câu hỏi thật của router, 5 mảng; ghép câu trả lời: chọn nhiều `, `, các câu ` · `, không chọn gì → `Tìm cho tôi`),
  `AskCard.test.tsx` (chọn nhiều/chọn một, gửi 1 lần rồi khoá, giữ lựa chọn qua lần remount).
- **Lỗi tìm thấy khi chụp UAT và đã sửa:** câu trả lời đầu tiên của một chat lưu xong thì `router.replace` sang `/chat/<id>` → thẻ remount, mất lựa
  chọn bấm trong 1–2 giây đầu (thẻ cũ dạng chip cũng bị). Sửa: giữ nháp trong bộ nhớ phiên (không ghi đâu cả), ghi ngay trong lúc bấm.
  Chụp lại: 6/6 lượt giữ đủ lựa chọn sau 5 giây; lượt giải trí gửi đúng `Karaoke, Xem phim · 2 người · Quận 3`, thẻ biến mất sau khi gửi.
- Ảnh UAT (mobile 390px + desktop 1280px, 5 mảng + du lịch có câu «Thích kiểu gì?», trạng thái đang gửi, ảnh cạnh mockup):
  `gs://tappyai-uat-evidence/ask-card-v2-2026-09-30/web-1c5087b/askcard/` (`sbs-mobile-5areas.jpg`, `sbs-desktop-5areas.jpg`).
  Ảnh ô hiện là ảnh giữ chỗ cùng tên vì manifest ảnh còn rỗng — thêm ảnh = thêm mục vào `src/lib/plans/images/manifest.ts`.

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

## Android AAB release vc10 / 1.0.0 — build 30/09 (từ commit 68d6639, KHÔNG có thay đổi Android nào trên rc sau đó)
- Build: `bash scripts/release/build-aab.sh 68d6639` (worktree detached `C:/wtbuild-68d6639`, không đụng worktree dùng chung).
- File: `D:\TappyAI-backups\TappyAI-release-vc10-68d6639.aab` (gốc `C:/wtbuild-68d6639/android/app/build/outputs/bundle/release/app-release.aab`).
- SHA-256 AAB: `79edd00910821470b4e198c7fd4d9915155ac335d214f12f9fd51b0d3df9c058`
- Chứng chỉ ký (upload key) SHA-256: `02:5B:35:4D:1C:37:7B:DC:F3:D6:49:4A:71:8E:6B:2D:A4:56:2F:73:2B:CE:0A:42:11:9C:9B:09:37:74:5C:C7` — so với Play Console → App integrity → Upload key certificate. `jarsigner -verify` = "jar verified."
- BuildConfig (script kiểm, đều `ok`): versionCode 10, versionName 1.0.0, API_BASE_URL `https://www.tappyai.com/`, WEB_APP_URL `https://www.tappyai.com`, GIT_SHA 68d6639, SUPABASE_URL = production (`fwznnobrdctuskgrvuik`), DEBUG=false, **VERCEL_BYPASS_SECRET rỗng**.
- Quét thêm trên dex của chính AAB: KHÔNG có chuỗi `uat.tappyai.com`; chuỗi duy nhất liên quan là TÊN header `x-vercel-protection-bypass` trong `DeploymentProtectionInterceptor` — vô hiệu khi secret rỗng (`secret.isEmpty()` → không gắn header). Không chứa khoá bypass.
- Test trước khi build (cùng commit): unit Android debug+release+uat xanh, web scan Android 793 qua, `verify-release-clean` 8/8.
- Chưa upload gì; Play Console là bước của anh (RELEASE-PLAN §3d). Dọn sau upload: `git -C C:/wtrel worktree remove --force C:/wtbuild-68d6639`.
- Nhánh local `android/video-held`: 4 commit của nó (video composer, golden chat, share e2e stub, guest giữ Login) ĐÃ nằm trên rc từ 29/09 dưới hash khác (41cd098, 8f6ca1e, f3b8679, 389e321) và đều có trong 68d6639 → bản release CÓ đăng video. Nhánh chỉ còn là bản cũ, không cần gộp.

## 2026-10-01 — ĐÓNG BĂNG WEB (SHA cuối)
- Mã web cuối = `81e8016` (đã gồm eaefa04 id thẻ hỏi, 3c-onboarding gate, /privacy OpenAI, R26/R27, ENV-RELEASE-CHECKLIST). Commit chứa ghi chú này chỉ khác `81e8016` ở tài liệu; SHA UAT phục vụ = commit này, đo bằng `GET /api/version`.
- UAT chạy với `ACCOUNT_SELF_DELETE_ENABLED` ĐÃ GỠ (cờ TẮT, như production mặc định). Cờ BẬT được chụp tạm ở `81e8016` (trang xoá + gõ XÓA, KHÔNG bấm xoá) rồi gỡ biến và deploy lại.
- Test đầy đủ (app + db, `npm test`) trên mã này: 952 file đạt / 16 bỏ qua; 16.184 test đạt, 0 lỗi, 80 skip, 1 todo; cổng "required-suite" OK.
- 80 skip: 33 `weatherCountryMatrix` + 10 `memoryGate/cacheProbe/domainMatrix/refinementProbe/reviewSourceProbe/toolPayload` (đo thật, cần TAPPY_MEASURE=1); 10 `luna/featureSmoke` (LUNA_FEATURE_SMOKE=1, gọi OpenAI thật); 3 replay audit (AUDIT_REPLAY=1) + 1 `brainEval` (BRAIN_EVAL=1, gọi model thật); 7 `ccpVerificationEvidence` (CCP_VERIFY=1); 14 `profileCollectionsParity`/`sharedPrivacy` (describe.skip từ 17/09 — chờ port tab lên hub V3); 1 `decisionFrame` (it.skip từ 17/09, phụ thuộc guard chưa merge).
- Dọn: xoá 4 tệp ghi replay CHƯA theo dõi trong `scripts/consult/replay/recordings/` (không xoá tệp đã commit).

## ĐIỂM QUAY LẠI — release-freeze-3fce8b7 (01/10)
- Tag git **local** `release-freeze-3fce8b7` → `3fce8b7c62eed5374d1f14b21c266e4c98650fd6` (bản đã đóng băng Huy đang test; không push — hook chặn).
- Deployment Vercel của bản đó vẫn còn: `https://tappyai-p2aqcto8r-huyphamsm-tappys-projects.vercel.app` (Ready).
- **Quay UAT về ngay (không đụng git, hoàn tác được):**
  `vercel alias set https://tappyai-p2aqcto8r-huyphamsm-tappys-projects.vercel.app uat.tappyai.com`
  (lần push kế tiếp lên rc/web-uat sẽ tự gán lại alias cho bản mới).
- **Quay lại bằng git (không force):** `git -C C:/wtrel checkout -b rollback-to-3fce8b7 release-freeze-3fce8b7` để xem; muốn UAT build lại đúng nội dung đó: `git -C C:/wtrel revert --no-commit 3fce8b7..HEAD && git -C C:/wtrel commit -m "revert to 3fce8b7 content"` rồi push lên rc/web-uat như thường.
- Kiểm: `curl https://uat.tappyai.com/api/version` phải trả `3fce8b7…`.

## Regression Gate đỏ ở 40289ae — nguyên nhân gốc (01/10)
- Hai bài đỏ: `scripts/architecture/controllerRules.test.ts` (2 test) và `vendorCacheRule.test.ts` — cùng chạy `scripts/architecture/check.mjs`. Luật bị phạm: **`no-commerce-merchant-hosts-outside-ccp`** — `src/lib/links/movieTitles.ts:28` viết thẳng host nhà cung cấp (cgv.vn, galaxycine.vn…) NGOÀI `src/lib/ccp`. Commit gây ra: **5c89e20** (A1/A2/A4 — câu trả lời «có phim gì hay»).
- Vì sao phạm: tôi đặt tệp này ở `src/lib/links/` để tránh luật khác (`retrievalArchitecture`: markdown từ nội dung truy xuất chỉ ở `streamEnrichment`) mà **không chạy `scripts/architecture` và `npm test` đầy đủ trước khi push** — chỉ chạy `src/lib/ai`, `src/app/api`, `src/lib`. Né một luật bằng cách chuyển chỗ đã đâm vào luật kế bên.
- Sửa (không nới luật nào): bảng trang phim đang chiếu chuyển vào `src/lib/ccp/adapters/nowShowing.ts`; `ccpBoundary.test` lại bắt tiếp: **mọi host trong CCP phải thuộc allow-list của registry, danh sách nhà cung cấp ĐÓNG BĂNG (D10)** ⇒ chỉ **CGV** (đã là provider) được link; Galaxy/Lotte/BHD/Beta chỉ nhắc tên. Thêm 4 rạp = quyết định của Huy (PL-MOVIES).
- Cùng đợt phát hiện thêm một vi phạm quyết định cũ: tôi đã cho link khách sạn điền ngày từ «cuối tuần»; test `flightPickLink` (ghim quyết định 30/09 «không đoán ngày cho khách sạn») đỏ → **đã hoàn lại**.
- **Quy tắc cho thay đổi sau:** trước KHI PUSH chạy `npm test` đầy đủ (gồm `scripts/architecture`, `src/lib/ccp`, `src/lib/ai/security`), không chỉ thư mục mình sửa; không dời tệp để né một luật; không thêm host thương mại ngoài `src/lib/ccp`; không thêm nhà cung cấp mới.

## 2026-10-01 chiều — ĐÓNG BĂNG LẦN 2 (khối hoàn chỉnh A–E)
- Mã web cuối = `c865408` (+ các commit tài liệu/dọn dẹp sau đó chỉ đổi tài liệu và gỡ tệp tạm; SHA phục vụ trên UAT = commit cuối, đo bằng `/api/version`). Điểm quay lại: tag `release-freeze-3fce8b7`.
- Regression Gate xanh ở `27f333f` (run push 36827156658, PR 36827163991); Architecture Guard xanh (36827156630 / 36827164024). Merge Guard đỏ TỪ TRƯỚC (cả ở 3fce8b7): job «protected work stranded on side branches» — không do thay đổi này.
- Cờ trên UAT: `STYLE_LUNA6` TẮT (không đặt), `ACCOUNT_SELF_DELETE_ENABLED` TẮT (đã gỡ).
- Bằng chứng (riêng tư): `gs://tappyai-uat-evidence/evidence/c865408/`.
- Danh sách Huy test: `docs/uat/HUY-TEST-ROUND-FINAL.md`.
- Sai sót của tôi trong đợt này (đã sửa): commit nhầm tệp tạm (`.uatlogs.jsonl` = bản log UAT 33 KB, `.d7*`, 283 bản ghi Serper mới) bằng `git add -A` — đã gỡ khỏi cây, **nhưng vẫn nằm trong lịch sử commit 26832ad…c865408 đã push** (không force-push); log chỉ gồm sự kiện `tappyai_*` của lượt thử, không có nội dung cá nhân nào tôi thấy.

## 2026-10-01 tối — ĐÓNG BĂNG LẦN 3 (giọng Luna 6 BẬT, xoá tài khoản BẬT trên UAT)
- Mã web cuối = `f277b4b`; commit chứa ghi chú này chỉ khác ở tài liệu. SHA phục vụ = commit cuối, đo bằng `/api/version`. Điểm quay lại: tag `release-freeze-3fce8b7`.
- **Cờ trên UAT (Preview, nhánh rc/web-uat):** `STYLE_LUNA6=1` BẬT; `ACCOUNT_SELF_DELETE_ENABLED=true` BẬT (đo `/api/config` → `accountSelfDelete:true`). Production: Huy quyết ở PHẦN B.
- Regression Gate xanh ở f277b4b: run push **36837703726**, PR **36837713662**; Architecture Guard xanh (36837703712 / 36837713656). Merge Guard đỏ từ trước (không liên quan).
- Test full cục bộ: 16.255 đạt, 0 lỗi, 80 skip; 15/15 luật kiến trúc.
- Xoá tài khoản đo trên UAT bằng 2 tài khoản dùng-một-lần tạo mới (DB audit, không đụng tài khoản có sẵn): không gói → không có đoạn gói; có gói (`subscriptions.status='active'`) → có đoạn gói; gõ sai chữ → nút mờ; xoá → hàng chat/hồ sơ/gói = 0, `account_deletion_jobs` +1, người dùng không còn, gọi lần hai → 401. D1/D2/D4 đã áp trên DB audit (đo chỉ-đọc).
- Bằng chứng: `gs://tappyai-uat-evidence/evidence/f277b4b/`.

### ▶ ĐÊM 01→02/10 — gộp chặn người dùng + báo cáo + kiểm duyệt vào rc/web-uat (cờ TẮT trong mã; BẬT trên Preview)
- Gộp `sec/user-blocks-slice` (đã duyệt độc lập bởi phiên bảo mật: «Có thể gộp», không còn mức cao/vừa) vào rc/web-uat. Điều kiện gộp đủ 7: bảo mật duyệt ✓; toàn bộ test nhánh gộp xanh (16.484 test; 4 tệp DB cổng cố định chạy ở cổng khác: 111/111) ✓; tsc, quyền SQL, kiến trúc xanh ✓; `next build` thành công trên nhánh gộp ✓; đo feed ≤ 1,3 ms (200 người bị chặn, 300.000 bài) ✓; bốn migration áp + rollback + áp lại thành công trên DB AUDIT ✓; không chạm `reviews/route.ts`, `uploadCompletion.ts` ✓. Regression Gate sau gộp: xem mục đóng băng.
- Migration mới (production CHƯA áp, thứ tự trong `MIGRATION_ORDER.txt` và `docs/uat/PART-B-FINAL.md`): `20261001_user_blocks`, `20261001b_user_reports`, `20261001c_commerce_providers_cinemas`, `20261001d_moderation_standards`, `20261001e_banned_identity_hash`.
- Cờ Preview (rc/web-uat): `USER_BLOCKS_ENABLED`, `REPORTS_ENABLED`, `MODERATION_ADMIN_ENABLED` = true; `STYLE_LUNA6`, `ACCOUNT_SELF_DELETE_ENABLED` = true (đã có); `SUBSCRIPTIONS_ENABLED` không đặt (tắt).
- Tài liệu: `docs/security/USER-BLOCKS-SLICE.md` (§10 SẴN SÀNG DUYỆT, §11 xử lý phát hiện), `MODERATION-STANDARDS.md`, `PART-B-FINAL.md`.
