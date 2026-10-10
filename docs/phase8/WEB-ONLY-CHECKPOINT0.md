# Phase 8 — WEB-ONLY execution (A + B + D) — Checkpoint 0: audit and status matrix (2026-10-09)

Baseline: `p8/agent-runtime` @ `6d383ec` (35 commits ahead of `origin/main` `f9f2b12`; working tree clean except untracked `artifacts/`). Android/iOS/C: untouched. Nothing pushed, merged or deployed. **No application code was changed in this checkpoint.** Status words follow the owner's list: DONE · IMPLEMENTED, NOT VERIFIED · BLOCKED · NOT STARTED · DEFERRED TO APPLICATION · OUT OF SCOPE.

## 1. Source documents
| Needed | Result |
|---|---|
| Official Phase 8 (`PHASE 8.docx`, Downloads, 2026-10-02; text copy `artifacts/phase8/PHASE8-docx-text.txt`) | FOUND. WP-01..10 are named with one-line scope and a Definition of Done (section 12); **no acceptance criteria for SEC4/SF8/SEC9/E2**. It contains no A/B/C/D workstreams. |
| "Overall picture" A/B/C/D document | **NOT FOUND** (the owner prompt is the only statement of A/B/D/C). |
| Messenger + Inbox plan | **NOT FOUND as a standalone plan.** Nearest: `tappyai-phase8/PHASE8_MASTER.md` task 06 "Messenger Expansion" (image, clip, voice note, shared clip; flag `p8_messenger_media`), `PHASE-6-PARALLEL-FOUNDATION.md`, migration `20260906_phase6_messenger_reachability.sql`. |
| Web Polish backlog | FOUND, only inside `docs/audit/PHASE7-CLOSEOUT.md` row 8 and `PHASE8-BACKLOG.md` B-UI-1. |
| Realtime Translation architecture | **NOT FOUND** (only the stub B-TR-1: separate speech-to-speech stack, design doc still to be written). |
| OpenAI Ads reference | **NOT FOUND** (only stub B-ADS-1 and `Downloads/paid-vs-organic-tappyai-v3-phase6.md`, which is a paid-vs-organic ranking analysis, not an OpenAI Ads reference). |

Rule applied: where the source document does not exist, that part stops (no replacement scope is invented): **D2 and D3 are BLOCKED on documents**; **B's scope definition needs one owner confirmation** (below).

## 2. Workstream A — Phase 8 Core (Web + safe shared backend)
| WP | Web-phase status | Evidence / note |
|---|---|---|
| WP-01 prod RLS/grants | **BLOCKED** | no production read access; offline re-verification of the 22 fixes exists (`docs/security/SECURITY-REVIEW-2026-10-01.md`) |
| WP-02 I1 numbering | DONE (`MIGRATION_ORDER.txt` + `migrationOrder.test.ts`; C3 entry added in `b69f340`) | I2 flags/config: trimmed registry `src/lib/p8/flags.ts` (2 flags, OFF) IMPLEMENTED; I3 cherry-pick: done by path for C1–C3, SEC9 needed no port; I5 docs: ledger/matrix updated. Remaining owner mapping of I2/I3/I5 is not defined in any readable file |
| WP-03 iOS baseline | **DEFERRED TO APPLICATION** | |
| WP-04 SEC4 / SF8 / SEC9 | conditional DONE (SEC4=M4 `6120558`; SF8=F-096 `94395ec`; SEC9=F-07 already covered by F-102/F-103 byte checks) | owner has not confirmed these definitions |
| WP-04 E2 user_events | IMPLEMENTED, NOT VERIFIED | criteria not readable |
| WP-05 C1–C3 | DONE locally (`b69f340`); migration NOT applied anywhere; flags OFF | |
| WP-06 Safety UI (Web) | **NOT STARTED, baseline decision needed** | On this line: `user_blocks` API (`/api/users/blocks`, `/api/users/[id]/block`) exists; **`POST /api/reports` does not** (only `/api/reports/mine`); **no Web UI calls blocks or reports**. The Web Safety UI was built on other lines (`merge/blocks-into-rc` @`0c9a673`, `sec/user-blocks-slice` `634aec4` is in main; the P8-17 `23f157d` commit on `phase8-master`), and `0c9a673` is NOT an ancestor of this line or of `origin/main`. |
| WP-09 Apple sign-in | **DEFERRED TO APPLICATION** (Web provider: Supabase Apple provider disabled on audit and prod — owner dashboard config; not a code task) | |
| WP-10 | NOT STARTED (Web integration/regression/UAT only, last) | |

## 3. Workstream B — Messenger + Inbox (Web) — what exists (read-only audit)
- **Wired:** text direct + group messages, Inbox tab (`profile/notifications` + `MessagesProvider`/`MessagesTab`/`ThreadList`/`ThreadView`/`NewMessageSheet`), read cursor and server-derived unread, Supabase Realtime (`messaging:<uid>`, `notifications:<uid>`), 404-for-non-participant, rate limit 60/min, anonymous refused, `chat_can_reach` + legacy `chat_blocks` enforced in the DB. Migrations 20260905/20260906 are in the manifest.
- **Gaps (candidate Web work, all reusing the existing backend):** no "Message" entry on profiles; no standalone route; no "load older" UI although the API pages with `before`; no thread-list error/retry; no component tests for the messaging components; notifications carry no dedupe/collapse; `MESSAGE_NOTIFICATIONS_ENABLED` defaults OFF; `user_blocks` is not read by messaging (two separate block systems — a blocked user may still message; **unverified**, security-relevant).
- **Absent here:** P8-06 Messenger media (image/clip/voice/shared clip: `media.ts`, attachments routes, `20260926_p8_messenger_media.sql`) exists only in `48decc4` on `phase8-master`/`sec/phase8-hardening` (not an ancestor).

## 4. Workstream D (Web)
| Item | Status |
|---|---|
| D1 Web Polish 8A, 8B, 8F/8G, 8H, 8I, 8J | per `PHASE7-CLOSEOUT`: done on Web (6 of 9 sub-items); **IMPLEMENTED, NOT VERIFIED here** (to re-check against code before claiming DONE) |
| D1 8C/8D/8E (first recommendation tile, Deal tile, marketplace promotions tile) | **BLOCKED**: "screen not found on Web" — owner must identify the mockup/screen |
| D2 Realtime Translation | **BLOCKED**: architecture document not found |
| D3 OpenAI Ads | **BLOCKED**: reference document not found (only a stub and a paid-vs-organic note); no provider/credential |

## 5. Workstream C — OUT OF SCOPE. No code, schema or migration exists or was created for it.

## 6. Decisions the owner must give before Checkpoint 1 (the audit cannot choose them safely)
1. **Web baseline branch.** Recommended: continue on `p8/agent-runtime` (= `origin/main` + Agent runtime + C1–C3) as the Web line and **port by path** the missing Web pieces (WP-06 Safety UI + `POST /api/reports`; Messenger media) from `0c9a673` / `23f157d` / `48decc4`, each as a reviewed slice. Alternative: a separate Web integration branch from `origin/main`.
2. **Messenger + Inbox plan.** Confirm that `PHASE8_MASTER.md` task 06 (media) plus the gap list in §3 is the plan, or supply the plan document.
3. **Block systems.** Confirm that messaging must honour `user_blocks` (a shared-backend change; backward-compatible by adding a check, no client change).
4. **D2 / D3.** Provide the Realtime Translation architecture and the OpenAI Ads reference documents (or tell me they do not exist and the stubs are the scope); no credentials or paid provider are assumed.
5. **8C/8D/8E.** Identify the screens/mockups.
6. SEC4/SF8/SEC9/E2: confirm the definitions (unchanged open item).

---
## Update 2026-10-10 — owner decisions applied (Checkpoint 1, slice 1)

**Baseline:** stays `p8/agent-runtime`; Safety UI is ported by path (below). Nothing pushed/merged/deployed; Android/iOS/C untouched.

### Safety UI (WP-06 Web) — porting audit result (read-only)
- `0c9a673` is docs-only and `634aec4`/`4dab7e4`/the rc user-blocks/reports/moderation work are already ancestors of HEAD. `23f157d` (server) is not in HEAD and must NOT be ported: it adds a separate `reports` table and `20260924_p8_*` migrations that would conflict with the rc `user_blocks`/`user_reports` tables.
- **The server side already exists in HEAD with a different contract than the owner's assumption:** there is no `POST /api/reports`; reports go to per-target routes `/api/reviews/[id]/report`, `/api/comments/[commentId]/report`, `/api/users/[id]/report` (shared `handleReport` in `src/lib/safety/userReports.ts`: flag `REPORTS_ENABLED`, 401/403 anonymous, 10 per 10 min, no existence oracle, service-role write because client INSERT is revoked), plus `block`/`blocks` routes. So **no new API or migration is needed; do not add `/api/reports`** (a second contract would only fork Android/iOS, which already call the per-target routes).
- The real Web UI is commit `3ec26a0` (P8-S2-0b, 58 files; web part = `components/safety/{SafetyMenu,ReportDialog}.tsx`, `lib/p8/{safetyClient,useP8Flags,clientFlags}.ts`, `lib/i18n/p8.ts` safety keys, call sites in ProfileTab / ReviewDetailView / ReviewCommentButton / feedShared / ThreadView / ExploreStage). `/api/config` already returns the `p8` client-flag block with the same shape. Port plan (next slices, each reviewed): A i18n safety keys only → B client (rewrite `sendReport` to the per-target routes with `note`/`details`) + components → C call sites by hand (feedShared and ExploreStage have drifted heavily; stop and report if a hunk has no home) → D trimmed tests. Status: **NOT STARTED (audited)**.

### Messenger / blocks (slice 1 DONE — `f43d2de`)
- Finding that refines the Checkpoint-0 note: a block made through `POST /api/users/[id]/block` already writes `chat_blocks` as well, so direct messaging was already stopped; the real gaps were (a) a `user_blocks` row with no `chat_blocks` partner stopped nothing in chat and (b) **group creation checked no block at all**.
- Fix (server-side, DB-level so every client is covered): migration `20261018_chat_honours_user_blocks.sql` replaces the bodies of `chat_can_reach`, `chat_thread_blocked`, `chat_create_group` (same signatures/grants/error codes; blocked create → the same `invalid_target`/`invalid_members` an unknown account gets; send → 42501 → 404; history stays readable). Rollback restores the previous bodies verbatim.
- Evidence: `supabase/tests/chat_honours_user_blocks.test.ts` 13 tests on the full prod-schema snapshot (fails 6/13 against the old bodies); neighbouring suites (`phase6_messenger`, `chat_messaging_boundary`, `user_blocks`, messaging routes/lib) 153 pass; `migrationOrder`/`applyMigrationPolicy`/`portAllocation` pass. Migration NOT applied anywhere; policy AFTER-SMOKE.
- **Assumption to confirm:** for group creation the refusal covers creator↔member pairs only (not member↔member), mirroring the direct rule. Unchanged and still open as product policy: whether a blocked thread should disappear from the list, notification suppression at write time (`emit` is not block-aware; gated off by default), read cursor.

### WP-04 re-verification with the owner's working definitions
- **SEC4 (rate limiter)** — `src/lib/security/distributedRateLimit.ts` (C10 contract): shared store, sliding window, **fails closed** when the store cannot answer, no in-process fallback, refund of a failed unit; public routes use `publicRateLimit`. `distributedRateLimit.test.ts` + `publicRouteRateLimits.test.ts` = 49 pass. Proven: boundary, keying, exceed behaviour, error handling. Not proven: that every cost route is wired to the shared limiter in production (config/runtime).
- **SF8 (audit_log)** — proven: RLS on, `anon`/`authenticated` get *permission denied*; the chain is tamper-EVIDENT (`audit_chain.test.ts`); pruning is a separate `SECURITY DEFINER` function `audit_log_prune` (≥12 months, refuses an unverified prefix, writes an anchor), EXECUTE only for `service_role`. **Not proven / open:** `service_role` (the role the app's admin client uses) can still UPDATE/DELETE `audit_log` directly — the chain header itself calls that "the deferred service_role hardening". Making it immutable even for `service_role` changes a prod privilege model the app depends on → **BLOCKED: owner decision** (does "ordinary application privileges" include `service_role`?).
- **SEC9 (magic bytes)** — covered unconditionally for every minted client-direct kind (F-102/F-103, `clipMetadata.ts`, `clipUploadEnforcement.test.ts`); server photo routes use `sniffImageType`. `audio`/`audioCover` are minted by no route.
- **E2 (user_events writes)** — current state: RLS policies allow an authenticated user `FOR ALL` on their own rows (`20260627_user_memory.sql`) and `INSERT` own (`add_tracking_integrations.sql`), so a client can write **any `event_type`** for itself; server writers are `/api/track`, chat, crons. The "approved sources and rights" list is not defined anywhere → restricting client writes is a policy decision with analytics impact → **BLOCKED: owner must list which event types a client may write directly**.

### Still open from the decision list
- Translation / Ads documents and 8C/8D/8E screens: a second document/mockup search is in progress; result will be appended. No implementation started for D2, D3, 8C–8E.
- Next Web slices (each independent, with tests): Messenger gaps (profile Message button, load-older, thread-list retry, component tests, notification dedupe, `MESSAGE_NOTIFICATIONS_ENABLED` check); Safety UI slices A–D above.

### Second document / mockup search (2026-10-10) — result
- **8C / 8D / 8E: still BLOCKED.** `PHASE7-CLOSEOUT.md` (row 8, §C item 5) states there is no such tile row on Web Home V3 (owner-locked) or Explore, that it "looks like the Android Home design", and that the owner must name the Web screen. No other document defines them. The V3 mockups directory (`V3-Mockup.png/`, 28 files, per an early-September memory note) is **not on disk any more** (searched D:/Claude, D:/TappyAI-backups, Downloads, Documents, Desktop, every worktree to depth 6); only `Downloads/TappyAI-V3.zip` (5 KB, too small to hold it) and unrelated ask-card/voice mockups exist. Candidate Web surfaces, NOT matched to 8C–8E and not to be guessed: `HomeV3.tsx` (owner-locked), `(app)/recommendations`, `(app)/deals/DealsView.tsx`, `(app)/marketplace/MarketplaceReserved.tsx`. **Owner action: name the Web screen or supply the mockup file.**
- **Realtime Translation (D2) / OpenAI Ads (D3): no design document exists anywhere searched** (only the backlog stubs B-TR-1 / B-ADS-1 and the paid-vs-organic note). **Owner action: supply the documents or confirm the stubs are the scope.** No implementation started.

---
## Checkpoint 1 result (2026-10-10) — Web-only, `p8/agent-runtime`

| Slice | Commit | Status | Evidence |
|---|---|---|---|
| Chat honours `user_blocks` (DB) | `f43d2de` | **DONE (local; migration `20261018` NOT applied anywhere)** | `chat_honours_user_blocks.test.ts` 13 on the prod-schema snapshot, 6 fail on the old bodies; neighbouring chat/user_blocks suites 153 pass |
| Messenger Web: load older, list/history retry, component tests | `1ee7704` | DONE | 12 → 36 component tests; found+fixed a refetch loop (history effect depended on `t()`) |
| Messenger Web: profile Message button, Inbox `?thread=`, new conversations open | `9614736` | DONE | 9 profile tests + 5 MessagesTab tests; the `?thread=` deep link the notification already produced was previously ignored (dead parameter) and a just-created thread was cleared by the "thread disappeared" guard |
| Notification trace + flag + route tests | `946d0cf` | DONE as tests; **no behaviour change** | see "Notification findings" below |
| Safety UI: i18n | `ecb0941` | DONE | `safety.ts`, vi/en parity test |
| Safety UI: client + SafetyMenu + ReportDialog | `817fe59` | DONE (flags OFF by default in prod) | 20 tests; reports use the existing per-target routes; no `/api/reports`, no `reports` table, no migration |
| Safety UI: call sites | `367fcc1`, `1ad6a2a` | DONE | ThreadView (1:1), ReviewCommentButton, ReviewDetailView (+page `viewerId`), ProfileTab, **PublicProfileView (not in 3ec26a0 — the Explore visitor profile of this line)**, feedShared comment drawer, clipStage (the relocated ExploreStage hunk). NOT ported: creator-deletes-comments, account deletion, sanctions, discoverability, message/track reports |

### Notification findings (traced creation → realtime → display)
- Creation: only `POST /api/messaging/threads/[id]/messages` → `notifyThreadRecipients` → one `emitNotification` per OTHER participant (`type:'message'`, fixed body, ids only). Gated by `MESSAGE_NOTIFICATIONS_ENABLED === 'true'` (exact string; read in the route and again in the producer; unset / '1' / 'TRUE' = OFF). Shipped OFF on purpose: Android and iOS do not handle the `message` type yet — enabling it is a cross-platform release decision, **not** done here. With the flag OFF no roster is read and no row is written; the Messenger's own realtime channel is how a user learns of a message.
- Delivery/display: `NotificationProvider` re-reads the list on any realtime event (replace, not append), so realtime echo cannot render a row twice. `inbox.ts` groups only like/follow/comment; `message` rows are listed individually.
- **Not duplicates (valid distinct events):** each message is one notification per recipient; a group notifies each member once.
- **Real duplicate risks, NOT changed (need an owner decision / contract change):** (1) a burst of N messages in one thread makes N Inbox rows and N pushes — collapsing "unread message notifications per thread" is a product policy; (2) the send has no idempotency key, so a client retry after a timeout whose first attempt succeeded stores the message twice (and notifies twice) — fixing it needs a new request field, i.e. an API contract change. Both are listed as owner decisions.
- Fixed incidentally: the notification deep link `/profile/notifications?tab=messages&thread=<id>` is now honoured by the Inbox (it was a dead parameter).

### Blockers unchanged
SEC4 (production wiring of every cost route not proven by code) · SF8 (`service_role` direct access to `audit_log`: owner must define; no privilege change made) · E2 (allowed `user_events` event types/sources undefined) · 8C/8D/8E (screens unidentified; mockup directory no longer on disk) · Realtime Translation and OpenAI Ads (no design document exists) · WP-01 (no production read access) · WP-03/WP-09 and the application parts of WP-06/WP-10 (DEFERRED TO APPLICATION) · Workstream C (OUT OF SCOPE; no code).

### Risks and compatibility
- `20261018_chat_honours_user_blocks.sql` changes function BODIES only (same signatures/ACL/error codes): Android/iOS need no change, but behaviour changes server-side for them too — a `user_blocks`-only pair can no longer start/continue chat, and **group creation now refuses members who are in a block pair with the creator** (assumption recorded above).
- Safety UI is inert in production until `REPORTS_ENABLED` / `USER_BLOCKS_ENABLED` are turned on (owner decision; not touched). Blocking has global effects (hides content both ways, closes chat) — the confirm dialog states them.
- The shared `/reviews` surfaces gained a "…" menu when the flags are on; review/clip reports that the feed already offered are unchanged.
- Translation keys added in vi/en only (the only locales that exist).

---
## Follow-up 2026-10-10 (after `220d251`)

### Web Polish 8C / 8D / 8E — source discovery (updates the earlier "mockup directory not on disk")
- **The V3 mockup set is recoverable from git:** commit `beba191` (2026-09-18, "wip(main-repo): snapshot of uncommitted work on feat/consultative-d1-d2-r1-r2-d3 at 77b0bb7", branch `wip/main-repo-2026-09-17`) tracks the directory `V3-Mockup.png/` — **30 PNGs** (28 "ChatGPT Image Sep 6, 2026 05_07_31 PM … 05_56_13 PM", plus `Aug 6, 2026, 02_33_24 PM` and `Sep 7, 2026, 11_45_10 AM`). Read-only: `git show beba191:"V3-Mockup.png/<name>"`. (Extracted for inspection only into the session scratchpad, outside the repo; nothing was added to the repository.) Search scopes of this pass: git messages, file names and deleted files across all refs, stashes, reflog, branch names, all zips under Downloads/D:/Claude/D:/TappyAI-backups, document names, Claude memory notes.
- **What the images show (observation, not a requirement):** all are Android-phone mockups. `…05_07_31 PM` = Home: a "Gợi ý dành cho bạn" row of recommendation tiles (photo, title, ★ rating) and a "Khám phá thêm cùng TappyAI — Ưu đãi • Trải nghiệm" banner. `…05_48_13 PM` (a second Home) = category tiles, then **"Ưu đãi hôm nay"** deal cards (photo with a "−30 %" badge, title, rating, "Xem deal" button) and "Video gợi ý cho bạn". `…05_37_58 PM` = the Deals screen = **"Deals của Tappy"**: "Hỏi Tappy trước khi mua" banner with marketplace logos, "Khám phá deal theo sàn" (Shopee, ShopeeFood, TikTok Shop, Grab, Be, Agoda, Booking.com) and "Deal nổi bật hôm nay" cards per marketplace with "Hỏi Tappy về deal" / "Lấy deal".
- **Candidate mapping (UNCONFIRMED — the owner must confirm; nothing is built):** 8C "first recommendation tile" ↔ the first card of "Gợi ý dành cho bạn" on the Home mockup; 8D "Deal tile" ↔ the "Ưu đãi hôm nay" deal card (−x % label); 8E "marketplace promotions tile" ↔ a "Deal nổi bật" marketplace card. This matches `PHASE7-CLOSEOUT.md`'s note that the rows look like the **Android Home** design and are not on Web Home V3 (owner-locked). On Web, Deals already exists (`(app)/deals/DealsView.tsx`). Also worth the owner's look: remote branch `origin/preview/deals-promo-polish` (not inspected). **Status stays BLOCKED until the owner names the Web screen and confirms the mapping.**
- **Realtime Translation / OpenAI Ads: still NOT FOUND** after the new scopes above (no document, no commit, no stash, no archive content). Only the backlog stubs B-TR-1 / B-ADS-1 and the paid-vs-organic note exist. Absence is not a requirement; nothing is designed or built.

### WP-06 Safety UI — review of the Web changes
- **Authorization (server, unchanged and verified):** `src/lib/safety/userReports.test.ts` (flag OFF → 404 empty; 401 no session; 403 anonymous; 400 bad reason/id; self-report 400; no existence oracle; 10 per 10 min per account incl. the persistent count; duplicate → `alreadyReported`; write failure → 500) and the block/blocks/config/comment/review route suites: 416 tests across `src/lib/safety`, `src/app/api/{users,comments,reviews,config,moderation}` pass. The client adds no authority: it only hides buttons.
- **Flags:** Report of a comment/user needs `p8.reports`, block needs `p8.userBlocks` (from `/api/config`); post/clip reports are always on because their route is not flagged; OFF until `/api/config` answers; a missing block / failed request / network error = OFF. Tested (20 → 23 component tests, 11 mutations caught except a redundant guard).
- **Error states:** failed / rate-limited (own sentence) / already-reported / 401-403 → login with return path / network; inline (no toast host outside admin). Localization: vi + en parity test and a new test that every literal `safety.*` key the three components use exists in both languages (it fails when a key is removed).
- **Defect demonstrated and fixed (`65ce938`):** the menu could not be closed with the keyboard — Escape now closes it and returns focus to its button (2 tests). No other defect was demonstrated.
- **Noted, not changed:** blocking from the comment drawer does not remove already-loaded comments from the open drawer until it is reloaded (the server hides them on the next read); `feedShared`'s own inline post-report menu is left as it was.

### SEC4 — see `docs/phase8/SEC4-COST-ROUTE-COVERAGE-AUDIT.md` (route-by-route; **not proven**; six cost routes in-process only, four with none, no coverage ratchet).
### SF8 / E2 — unchanged BLOCKED. No `service_role` privilege change; no `user_events` rule change.
### Messenger — collapse proposal, send-idempotency design task and the group-creation rule: `docs/phase8/MESSENGER-NOTIFICATION-COLLAPSE-PROPOSAL.md` (nothing implemented; send API unchanged). Messenger media (`48decc4`) remains a separate, unstarted audit.

### Test-runner investigation: `controlBytes` and `mergeGuard`
- **Reproduced and load-related.** Alone: controlBytes 7 ms / 165 ms / **2.1 s** (the repository scan), mergeGuard 1.0–3.0 s per test. With the CPU saturated (12 busy loops on 12 cores) the same files: 6 of 13 tests failed — all `mergeGuard` tests, with `Error: Test timed out in 5000ms.` (observed durations 5.0–7.0 s; assertions never reached); controlBytes took 3.3 s (limit 5 s). In the full runs of this session the same two files failed intermittently (3 of 4 runs) and passed alone (2 of 2, each time).
- **Cause:** both spawn child processes / read the whole tree and run under vitest's default 5 s timeout while the full runner saturates the machine. **Change (`5b58698`):** `vi.setConfig({ testTimeout: 30_000 })` in the two files only; no assertion changed. Re-run under the same synthetic load: 13/13 pass (slowest 10.7 s).
