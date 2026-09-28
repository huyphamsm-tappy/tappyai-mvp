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
| Design: Saved, Account hub, Viết content, Gợi ý cho bạn, age gate, onboarding | c87ddac, d97b261, 899bdbf, 1e11b32 | final-1e11b32/d-* next to D:edesign | PASS (deviations in RELEASE report) |
| Share layouts (owner-chosen from Downloads) | — | contact sheet sent 2026-09-28 | WAITING OWNER CHOICE |

## Round 3 — owner prompt 2026-09-28 evening (evidence in GCS: `gs://tappyai-media-uat/evidence/<SHA>/`)
| Item | Commit(s) | UAT SHA | Evidence (gs://tappyai-media-uat/evidence/…) | Status |
|---|---|---|---|---|
| A1 onboarding counter = real steps ("Bước 1/2", "Bước 2/2") | b08561d | — | unit tests only so far; UAT shot due in the final pass | CODE DONE, SHOT PENDING |
| A2 Đã lưu: Deals / Bộ sưu tập chips hidden | b08561d | — | unit tests only so far; UAT shot due in the final pass | CODE DONE, SHOT PENDING |
| B3 plan share signed-in → opened with no cookies | — | 826d23b | 826d23b/b3-1-plan-signed-in.png, b3-2-share-sheet.png, b3-3-plan-anonymous.png (uat.tappyai.com/plan/AjqWryKzGUYT, authCookies=0, no 404) | PASS |
| B4 "đi du lịch Đà Nẵng 3 ngày 2 đêm" never invents date/origin/transport; ONE question | 826d23b, 5452fc6, 2bd5c59 | 2bd5c59 | before fix (2/3 fail: dated 3/10–5/10; "Máy bay từ Hà Nội/TP.HCM"): scratch only · 826d23b/b4-trip-run1..3 (no invention, run 3 two questions) · 444774d/b4-trip-run1..3 (run 2 own question leaked, released prefix) · **2bd5c59/b4-trip-run1..3: 3/3 no date, no origin, no leg, exactly one closing question** | PASS 3/3 |
| B4 "ngan sách" typo | 826d23b (fixHalfAccented in markdownNormalize) | — | not emitted by code/prompt; model blends unaccented prompt text; fixed at output | FIXED (unit) |
| B5 shopping card vs D:\redesign | — | — | D:\redesign has 6 images, none is a shopping card → no side-by-side possible | N/A (no design) |
| B6 publish real photo + clip (test account), feed + profile, then hide/delete | — | 826d23b / 2bd5c59 | 826d23b/b6/b6-photo-1..3, b6-clip-1..3, b6-feed-fresh-1..2 · 2bd5c59/b6/b6-feed-guest-find-1..3-mobile, b6-profile-owner-published, b6-del-1..2-mobile, b6-feed-*-after-delete-1 | PASS (photos show only in mobile feed — desktop Explore is video-only by design) |
| B7 YouTube clip in Explore → Facebook / Zalo / TikTok | — | 826d23b / 2bd5c59 | 826d23b/b7/b7-youtube-1..3 · 2bd5c59/b7/b7-sheet-*, b7-click-{facebook,zalo,tiktok}(-mobile), *-popup1, b7-share-results.txt | PASS (FB sharer / Zalo copy+hint (desktop), app scheme (mobile) / TikTok file + upload page) |
| B7 bug: composer AI replaced the typed caption + area | f8a26b7 | — | 826d23b/b7/b7-youtube-1-composer-filled.png (bug) | FIXED (unit), UAT shot due |
| B8 own profile 5 states + visitor view | — | 2bd5c59 | 2bd5c59/b8/b8-owner-{published,shared,saved,restricted,hidden}(-mobile), b8-visitor-fresh, b8-visitor-guest(-mobile) | PASS (visitor sees 8 public posts; hidden + restricted absent). All test rows deleted afterwards. |
| C9–C12 Part B prep | 444774d | — | docs/uat/RELEASE-PLAN-2026-09-29.md, scripts/release/*, docs/ios/HANDOFF-FROM-RELEASE.md | DONE (nothing run on prod) |
| Consultative design 2026-09-26 restore | — | — | not found anywhere on this PC (search report in chat 2026-09-28); baseline c40 running on UAT | WAITING OWNER (where is the design?) |

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

## Current step
Login = scratchpad pw/login.mjs (admin magic-link on AUDIT only → @supabase/ssr cookie). Overnight run 2026-09-28→29 (owner: do not stop except at danger points; no prod writes).
