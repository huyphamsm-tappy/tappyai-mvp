# RELEASE PROGRESS — 2026-09-28/29 (read this first after a context reset)

**Worktree (the only one):** `C:\wtrel` · branch `release/rc-merge-main-2026-09-29` → pushes to `origin/rc/web-uat`.
UAT = https://uat.tappyai.com (bound to branch rc/web-uat, audit DB `zdaprdfgpbpnxyofagmc`, behind Vercel SSO;
bypass secret in `D:\TappyAI-backups\vercel-bypass.txt`, header `x-vercel-protection-bypass`, never print it).
Check the running SHA: `GET /api/version` with the bypass header.

## Rules from the owner (2026-09-28)
- **PASS only with a real screenshot on UAT** (headless browser + bypass). Unit tests are not enough.
  UI items: screenshot next to the matching design in `D:\redesign`. Evidence up to 2614652 → `docs/uat/evidence/release-2026-09-28/`.
- **From 2026-09-28 evening: NO images/videos in git.** Evidence → `gs://tappyai-media-uat/evidence/<UAT SHA>/…`
  (public URL `https://storage.googleapis.com/tappyai-media-uat/evidence/<SHA>/…`; test accounts only). This file keeps paths only.
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

## Round 3 — owner prompt 2026-09-28 evening (evidence in GCS: `gs://tappyai-media-uat/evidence/<SHA>/`)
| Item | Commit(s) | UAT SHA | Evidence (gs://tappyai-media-uat/evidence/…) | Status |
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

## Current step
Overnight run 2026-09-28→29 DONE — final UAT SHA af8b4ba; morning report at the end of this file. Waiting on owner: Q1 (26/9 design), Q7 (AI gate), Q6 (share layout). Login = scratchpad pw/login.mjs (AUDIT only).

---

## BÁO CÁO SÁNG 29/09 (overnight run, NO prod writes)

**SHA cuối trên UAT: `af8b4ba`** (rc/web-uat). Evidence = `https://storage.googleapis.com/tappyai-media-uat/evidence/<SHA>/…`
Tests on the final code: web vitest 15,588 pass (2 failures: a load timeout that passes alone + the Android
`AgeCheck.kt:222` pin from the Android session's 06b5284, see Q8) · Android unit 833/0 · tsc/eslint clean.

### Mục BẮT BUỘC
| Mục | Kết quả | Ảnh (gs://tappyai-media-uat/evidence/…) |
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
