# RELEASE PROGRESS — 2026-09-28/29 (read this first after a context reset)

**Worktree (the only one):** `C:\wtrel` · branch `release/rc-merge-main-2026-09-29` → pushes to `origin/rc/web-uat`.
UAT = https://uat.tappyai.com (bound to branch rc/web-uat, audit DB `zdaprdfgpbpnxyofagmc`, behind Vercel SSO;
bypass secret in `D:\TappyAI-backups\vercel-bypass.txt`, header `x-vercel-protection-bypass`, never print it).
Check the running SHA: `GET /api/version` with the bypass header.

## Rules from the owner (2026-09-28)
- **PASS only with a real screenshot on UAT** (headless browser + bypass). Unit tests are not enough.
  UI items: screenshot next to the matching design in `D:\redesign`. Evidence → `docs/uat/evidence/release-2026-09-28/`.
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

### Work list — status with evidence (screenshots under docs/uat/evidence/release-2026-09-28/shots/<uat-sha>/)
| Item | Commit(s) | Evidence (UAT SHA) | Status |
|---|---|---|---|
| P1a "tối nay có chỗ nào đi chơi ở sài gòn ko" | 668ffd1 intent; f6c7faf fixed evening FRAME (eveningPlan.ts, code-written searches); a5c19a8 code-written intro | shots/a5c19a8/p1a-run1..5-t1.png — 5/5: 18:30 Quán ăn ngon Sài Gòn → 20:00 Chợ đêm Hồ Thị Kỷ → 21:30 The View Rooftop Bar, maps on every stop, no origin/transport question | PASS |
| P1b "mua đồ ăn vặt" → "tối nay đi đâu chơi quận 1" | 668ffd1, e05de06 (new subject = only the new turn reaches the model) | shots/e05de06/p1b-snack-then-q1-t2.png — dinner → Bùi Viện → … no snack | PASS (re-shoot on final SHA) |
| P1c raw URL / glued links / photo link | 1b79b97 (web), 4515b0f (Android) | unit tests only; needs an answer that contains links | CODE-DONE, screenshot TODO |
| P1d blank gaps | 1b79b97 | shots/p1cd-hotel-t1.png (1b79b97) no gap | PASS |
| P1e "quán phở ngon quận 3" order buttons | e823425, 062c7ec, c7f78d3 | shots/e05de06/p1e-pho-q3-t1.png (Đặt chỗ / Tìm trên GrabFood) | PASS |
| A1 shopping buttons | e823425 | shots/e05de06/a1-shop-t1.png (every product Mua trên…/Tìm trên Lazada) | PASS |
| Cut sentence "…cao hơn Nếu cần…" | a5c19a8 (moneyGuard clause cut + 'không dây' + budget words) | fixture red→green; UAT re-shoot TODO | CODE-DONE |
| P2a avatar/cover | 5e305f4; infra (c) docs/uat/UAT-MEDIA-INFRA.md | shots/d97b261/p2a-1..3 (before/after/reload), p2a-buckets.txt (UAT bucket has both, prod none), wif-isolation.txt | PASS |
| P2b own profile tabs | 5e305f4 | needs login in Browser pane | CODE-DONE, screenshot TODO |
| P2c sidebar | 5e305f4 | shots/auth-probe/p2-profile.png (no Saved/History/Cài đặt/Language/Help in sidebar; rows in the hub) | PASS (re-shoot final) |
| P3a Explore upload | 4e9f53d (resumable session Origin → CORS) | shots/4e9f53d/p3a-2 (photo), p3a-3 ('Video đã tải lên', AI caption), p3a-result.json (PUT 200, no console error) | PASS |
| P3b/P4 share | 7e78e58, c835b3e, 91461bd | shots/p4-review-share-sheet-mobile.png; Facebook popup sharer.php?u=uat…/reviews/… + "Đã mở Facebook" (f6c7faf); TikTok desktop download tappyai-post-*.png + tiktok.com/upload + hint; OG tags p4-og-review-*.txt | PASS web (FB/Zalo previews: UAT behind SSO → re-check on prod) |
| Zalo "crash" | 91461bd | it was MY SCRIPT: desktop tile had no "Zalo" text (label "Sao chép liên kết"); label now "Zalo (sao chép link)" | FIXED, re-shoot TODO |
| Design conformance R1 Saved, Account&Settings, R2 Viết content, R3 Gợi ý (+photo/address/rating/activity), age gate, onboarding | c87ddac, d97b261, 899bdbf | final re-shoot side-by-side with D:\redesign | CODE-DONE |
| Share layouts | — | contact sheet sent to owner (Downloads: QR cards 1–4, share sheet 6, plan page 7) — awaiting owner's choice | WAITING OWNER |

## Coordination
- Android session (C:\wtandroid) owns android/. Web wrote STOPPED @ 6e392d2. Requests: docs/uat/ANDROID-REQUESTS.md.
- vercel.json ignoreCommand: android-only commits do not build the web.
- Push rule: fetch + rebase, never force.

## Current step
Login = scratchpad pw/login.mjs (admin magic-link on AUDIT only → @supabase/ssr cookie). Waiting on owner's share-layout choice; then final re-shoot of everything on one SHA.
