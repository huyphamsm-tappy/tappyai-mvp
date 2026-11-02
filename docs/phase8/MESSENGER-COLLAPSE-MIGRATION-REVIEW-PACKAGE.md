# Messenger notification collapse — migration REVIEW PACKAGE (2026-10-10)

Status: **review material for a separate owner decision. Nothing is implemented, no migration file exists under `supabase/migrations/`, nothing was applied anywhere, and the send API, the send limiter and the feature flag are unchanged.** The SQL in §5 is a *draft embedded in this document*; it is not executable from the repository. Baseline `4bfb3d4` + this checkpoint. Production schema, grants, flag value and KV: **UNVERIFIED** (no production access).

**Third checkpoint (2026-10-10): D3/D5/D7–D10 resolved as recommendations (§8); the draft SQL moved to `docs/phase8/drafts/messenger-collapse/` (v3) and is tested verbatim by `supabase/tests/notification_collapse_draft.test.ts`; still no migration, nothing applied.**
Companion documents: `MESSENGER-NOTIFICATION-COLLAPSE-PROPOSAL.md` (semantics D1–D6, v2.2), `supabase/tests/notification_collapse_spike.test.ts` (real-Postgres spike, 19 tests), `MESSAGE-SEND-LIMITER-AUDIT.md`.

## 1. Spike versus the real Web route and the real schema
| Aspect | What the spike assumes | What the repository actually has | Consequence |
|---|---|---|---|
| **Call site** | `emit` is a function called directly | `POST …/messages` inserts the message through the **caller's** Supabase client, then (flag on) `notifyThreadRecipients`: roster select → sender profile select → `Promise.all(recipients → emitMessageNotification)`; each emit is `emitNotification()` = **service-role** `INSERT notifications` + `sendNotificationToUser` + `UPDATE push_status`, i.e. 3 separate PostgREST requests and a push outside any DB transaction | The collapse must be **one RPC** (lock + read + insert/update in one transaction) called with the service-role client from a new Messenger-specific path. `emitNotification` is shared by every producer (like, comment, follow, deals, marketing) and must **not** be changed for them |
| **Feature flag** | none | `messageNotificationsEnabled()` is exact `'true'`, default off, checked **before** any query; Android and iOS do not handle the `message` type | Flag semantics stay as they are; the RPC is never called while the flag is off (test 8) |
| **Transaction / lock** | `pg_advisory_xact_lock(hashtextextended(user‖':'‖thread, 0))` inside a plpgsql function; client holds one connection | PostgREST runs an RPC in one transaction, so an xact-scoped lock is released at function end; Supabase's pooler is transaction-mode, which is compatible with xact locks (session locks would not be) | Design is compatible; **verified in the spike only on plain Postgres**, not through PostgREST/pooler |
| **Lock bound** | `SET LOCAL lock_timeout` from the client (test 16) | the function must carry it itself | **Test 19 (new)** proves `SET lock_timeout = '…'` as a *function attribute* bounds the wait (55P03) and does not leak into the session |
| **Push** | `should_push` boolean; "collapse key = `message:<threadId>`" | `dispatchWebPush` calls `webpush.sendNotification(sub, payload)` with **no options** (no `topic`, `TTL`, `urgency`); FCM goes through `createFcmSender`; there is no APNs path in `send.ts` | The collapse key is **not implemented anywhere**. **Correction to the proposal (D3):** a Web Push `Topic` header is limited to 32 characters of the URL-safe base64 alphabet (RFC 8030 §5.4); `message:<uuid>` is 44 characters and contains `:` and would be rejected. Use a short hash (e.g. first 24 bytes of SHA-256, base64url = 32 chars). The change is in the **shared** `send.ts`, so it needs an optional parameter and tests for every other producer (unchanged when absent) |
| **`notifications` table** | `type text`, `data jsonb`, `read_at`, `created_at` | also `category`, `title`, `body` (all NOT NULL), `actor_id` (FK, SET NULL → later **CASCADE-delete** for rows the user caused, `20260925c`/`20261005`), `entity_url`, `image_url`, `push_status/_sent_at/_attempts/_error`; `type` and `category` are unconstrained `TEXT` (no CHECK) | `message` needs no schema change. The function must fill the NOT NULL columns itself |
| **RLS / grants** | none | RLS on; `notifications_select_own`, `notifications_update_own`, and (since `20261001`) a **RESTRICTIVE** `user_blocks_notifications_select` that hides rows whose actor is in a block pair; no INSERT policy (service role only); RLS lets the recipient `UPDATE` **any column** of an own row (column-level grants UNVERIFIED) | New functions must be `SECURITY DEFINER`, `SET search_path`, `REVOKE … FROM PUBLIC, anon, authenticated`, `GRANT … TO service_role` (emit) — a client must never be able to call emit with an arbitrary `p_user`. The `UPDATE` policy lets a recipient edit `data` (count, lastPushAt) of their own row: self-inflicted only, but it is a reason not to treat `data` as authoritative (the count is derived, see D5) |
| **Read cursor** | `mark_thread_notifications_read` upserts with `GREATEST` and the **database** clock | `POST …/threads/[id]/read` upserts `chat_reads` from the **lambda clock** (`new Date()`), without `GREATEST`; `chat_reads` RLS also lets a *client* write its own cursor directly; the badge is derived from it by `chat_thread_summaries()` | Cursor can regress or run ahead under clock skew and out-of-order requests today. The collapse inherits that unless the read route calls the function (route change). A cursor moved by a direct client write bypasses the function entirely → **self-heal added to the spike (18b)** |
| **Sender** | `sender_id NOT NULL` | `chat_messages.sender_id` is **nullable** (`ON DELETE SET NULL`) | `sender_id <> p_user` silently drops deleted-sender messages from the count. Spike corrected to `IS DISTINCT FROM` (**18a**, mutation caught) |
| **Message-side trigger** | none | `AFTER INSERT` trigger `chat_messages_touch_thread` updates `chat_threads.last_message_at` for every message | Already a per-message write on the thread row; the collapse adds one more row-level update per (recipient) — see failure modes |
| **Inbox consumption** | rows are read through SQL | `NotificationProvider` subscribes to `postgres_changes` `event: '*'` on `notifications` with a 300 ms debounce and **refetches**; `GET /api/notifications` returns `unread_count` | A collapse `UPDATE` is handled as a refetch (works). Not yet tested at component level (acceptance 11) |
| **"Mark all read"** | not modelled | `POST /api/notifications/read` sets `read_at` on unread rows **without moving `chat_reads`** | **18c (new, characterisation):** the next message reopens a row whose derived count includes the 3 messages the user dismissed (count 4, consistent with the Messenger badge, surprising in the Inbox). Needs an owner decision (D7) |

## 2. What the spike additions prove (all on real Postgres; this checkpoint)
* **18a** a message with `sender_id NULL` is counted; mutation (`<>`) caught.
* **18b** a cursor moved by a direct write leaves a stale unread row *until the next emit*, which reads it and opens a new row (`count 1`, push allowed); mutation (self-heal removed) caught.
* **18c** characterisation of D7 (not a pass/fail of desirable behaviour: it pins the current consequence so a later decision changes the test deliberately).
* **19** the lock bound works as a function attribute (55P03 within 250–2000 ms, no setting leak, works again once the lock is free). *Not mutation-tested:* removing the attribute makes the call wait for the holder, i.e. the test would hang to its timeout.

Spike totals: 19 tests in `notification_collapse_spike.test.ts`; earlier 7/7 mutants plus these 2 caught.

## 3. Acceptance criteria that still need INTEGRATION-level tests (the spike cannot answer them)
| # | Criterion | Why the spike cannot show it | Needed harness |
|---|---|---|---|
| 8 | flag off → no RPC, no row; refused send (RLS / block / validation) → nothing changes | needs the route | route test with mocked admin client (call counts) — cheap, Web only |
| 8b | the route still returns **200 with the stored message** when the RPC errors, times out, or the push throws; one log line, no content | needs the route | same |
| 10 | `ThreadView` marks read only after the first page loaded (today it marks at mount, before load) | component | jsdom component test |
| 11 | a collapsed-row `UPDATE` event refetches and the badge stays 1; "mark all read" clears every collapsed row; D7 decision reflected | component + provider | jsdom with a fake realtime channel |
| 12 | rollback restores today's behaviour; no message text in any column | real migration | migration test on a **production-schema snapshot** (see below) |
| P1 | RPC through **PostgREST** with the real role grants: `authenticated`/`anon` cannot execute emit; `service_role` can | embedded Postgres has no Supabase roles/PostgREST | Supabase local stack (`supabase start`) or the existing `supabase/tests` harness extended with role fixtures |
| P2 | block interaction: the RESTRICTIVE `user_blocks_notifications_select` hides a collapsed row whose **actor** is blocked. Which sender is `actor_id` of a collapsed group row? (first sender in the spike's insert; never updated) | needs the policy and `safety_private.blocked_ids()` | production-schema test (D8) |
| P3 | account deletion: rows with `actor_id = deleted user` are **deleted** by the cleanup trigger; a collapsed row whose actor leaves vanishes while other senders' messages are still unread | needs `20261005` objects | production-schema test; expected behaviour: next emit reopens a row (benign), count may lag |
| P4 | `chat_reads` regression/ahead under **lambda-clock skew** and out-of-order read requests | needs the real read route | route test with injected clock + DB test with skewed cursor |
| P5 | push path: `Topic` hash validity (≤32 base64url chars), TTL/urgency unchanged for other producers; FCM collapse key | shared `send.ts` | unit tests on `dispatchWebPush` with a stubbed `web-push` (options object asserted) |
| P6 | latency: group of 49 → 49 RPCs + 49 push dispatches inside the request (today the same fan-out runs inline) | measured on a deployment | measurement only; not claimed |
| P7 | native contract: Android/iOS do not handle `message` (why the flag is off) | out of scope | owner/application phase |

## 3b. Status after the third checkpoint (what is now proven, and where)
Draft SQL (v3) lives in `docs/phase8/drafts/messenger-collapse/` (outside `supabase/migrations/`); `supabase/tests/notification_collapse_draft.test.ts` loads it **verbatim** into a real embedded PostgreSQL with a production-**shaped** fixture (roles, `auth.uid()`, the exact `notifications` columns and RLS, nullable `sender_id`, `'-infinity'` cursor default, a simplified block policy). 19 tests; 10 SQL mutations caught.

| # | Criterion | Status |
|---|---|---|
| P1 (partly) | roles/grants: `authenticated`/`anon` cannot execute emit (42501), `service_role` can; anon cannot execute the mark functions; no `auth.uid()` or non-participant → 42501 | **proven on the fixture**; *not* through PostgREST and *not* against Supabase's real default privileges |
| P2 | RESTRICTIVE block policy vs a collapsed row's actor | **proven on a simplified stand-in policy**; the real `safety_private.blocked_ids()` is not exercised |
| P3 | account-deletion cleanup of rows whose actor was deleted | **proven on the fixture** (the cleanup is simulated with its `DELETE … WHERE actor_id`): the next emit reopens one row with the full derived count |
| P4 | read-route clock | **characterised** (`collapseReadiness.test.ts`: lambda clock, plain upsert, no monotonic guard; mutation caught). The *fix* (DB clock + GREATEST) is proven in SQL (`mark_thread_read`, cursor never regresses) but the route still has to call it |
| P5 | push options | **proven against the real `web-push` library** (`messagePushOptions.test.ts`): topic validity, the first design rejected; today's send path and service worker characterised (no options, no `tag`) |
| 8 / 8b | flag off → no call; send returns 200 when the producer fails | already covered by `messageNotificationRoute.test.ts`; the **new** route shape (RPC with `created_at`) is not written because the route is not changed |
| 10 | read only after the first page loaded | **characterised** (`threadViewReadOrder.test.tsx`: today it marks at mount and after a failed load; mutation caught). The approved ordering test replaces it |
| 11 | collapsed-row UPDATE refetch / "mark all read" in the Inbox component | **not written** (needs the route change first) |
| 12 | rollback / privacy | **proven on the fixture**: rollback script drops exactly the 3 functions + index, keeps rows, draft re-applies idempotently; no message text in any column |
| P6, P7 | latency on a deployment; native handling of the `message` type | **not measurable here / out of scope** |
| – | `PostgREST` transaction semantics, pooler behaviour, production `statement_timeout`s | **UNVERIFIED** |

Known limits of the draft (documented, not fixed): a recipient may `UPDATE` their own row's `data`, and `(data->>'lastPushAt')::timestamptz` / `lastMessageAt` casts would then raise for that row (self-inflicted; emit fails into the degraded path F3, mark-all ignores a non-uuid `threadId` — tested); the push is dispatched **after** the database commit, so a push that fails after `should_push = true` has already recorded `lastPushAt` and the next push for that thread waits for the window (at-most-once per window; a failed-push compensation is not designed).

## 4. Failure-mode analysis (design as in proposal §7d, F3)
| Failure | Effect | Bounded by | Recovery |
|---|---|---|---|
| Lock contention (hot thread, many senders) | callers queue per (recipient, thread) | `lock_timeout` 2 s (test 19) | after the bound → degraded insert (no push) |
| Function error / timeout | no collapse for that message | one inline retry, then F3 degraded `INSERT … ON CONFLICT DO NOTHING` on the unique index, never pushes | next successful emit repairs the derived count (test 13/14) |
| Degraded insert also fails | no notification pointer for that message | send still 200 | next message creates/repairs the row; Messenger unread (cursor-derived) unaffected |
| Duplicate unread rows | impossible: partial unique index `(user_id, data->>'threadId') WHERE type='message' AND read_at IS NULL` | database | — |
| Index creation fails (pre-existing duplicate unread `message` rows) | migration aborts, nothing applied if transactional | pre-check query §6 | clean the rows first (owner approval; rows in `notifications` are other users' data) |
| Heavy table lock while building the index | writers to `notifications` blocked during a plain `CREATE INDEX` | table size (**UNVERIFIED**); `CONCURRENTLY` cannot run inside the migration transaction | measure size first; if large, create the index outside the migration transaction in a window |
| KV outage | none: the collapse and throttle do not use KV (structural test 15) | — | — |
| Realtime write amplification | one `UPDATE` (REPLICA IDENTITY FULL: old+new row with `data`) per message instead of one `INSERT` | throttle does not apply to the row update, only to push | acceptable at 1 update/message/recipient; revisit with measured volume |
| Row-update contention | `chat_threads` trigger update + the notification row update per message | per-thread serial order already exists | measure on a deployment |
| Clock skew (lambda vs DB) | cursor ahead/behind → message counted as read / unread wrongly | route must pass DB time (call the function) | route change (P4) |
| Rollback needed | — | §7 | functions dropped; open `message` rows remain as plain unread rows (readable, never collapsed again); flag off first |

## 5. Draft migration — moved out of this document (2026-10-10, third checkpoint)
The SQL is no longer pasted here, so it cannot drift from what is tested: **`docs/phase8/drafts/messenger-collapse/20261019_messenger_notification_collapse.DRAFT.sql`** (v3: unique index; `emit_message_notification` — service_role only; `mark_thread_read` — authenticated, database clock; `mark_notifications_read` — authenticated, moves the chat cursors) and its rollback **`…ROLLBACK.DRAFT.sql`**. Both are **drafts outside `supabase/migrations/`**; the number and name are placeholders; nothing was applied. Differences from the v2 draft that was here: attribution parameters (`p_actor`, `p_title`, `p_image_url`), monotonic update by newest message, `created_at` follows the newest message, `firstMessageAt`, the self-heal, `IS DISTINCT FROM`, a guard for a vanished message (`count = 0` → no row), a recipient-read race guard (`UPDATE … WHERE read_at IS NULL`, new row if it was read meanwhile), `SET statement_timeout`/`lock_timeout` as function attributes, a sorted lock order for multi-thread mark-all, and the optional `p_now` (service_role only; exists for tests, the route will not pass it).

## 6. Pre-checks (read-only; to be run by the owner against each database before any apply)
```sql
-- 1. any message notification already exists? (the flag is expected to have been off)
SELECT count(*) AS message_rows, count(*) FILTER (WHERE read_at IS NULL) AS unread FROM public.notifications WHERE type = 'message';
-- 2. duplicates that would make the unique index fail
SELECT user_id, data->>'threadId' AS thread, count(*) FROM public.notifications
 WHERE type = 'message' AND read_at IS NULL GROUP BY 1,2 HAVING count(*) > 1;
-- 3. table size (decides plain vs outside-transaction index build)
SELECT pg_size_pretty(pg_total_relation_size('public.notifications')), (SELECT count(*) FROM public.notifications);
-- 4. required objects exist
SELECT to_regclass('public.chat_reads'), to_regclass('public.chat_messages'), to_regprocedure('public.chat_is_participant(uuid)');
-- 5. RLS / policies as assumed
SELECT policyname, permissive, cmd FROM pg_policies WHERE tablename = 'notifications';
-- 6. role statement_timeout defaults (service_role / authenticated) — the function attribute must be <= them
SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('authenticated','service_role','anon');
```

## 7. Rollback
`docs/phase8/drafts/messenger-collapse/20261019_messenger_notification_collapse.ROLLBACK.DRAFT.sql` (draft; tested: drops exactly the three functions and the index, keeps every row, and the draft re-applies cleanly). Order at rollback: (1) set `MESSAGE_NOTIFICATIONS_ENABLED` off or deploy the route that no longer calls the functions, (2) run the script. Rows already written stay valid ordinary notifications (`data.count` stale and ignored); no data migration in either direction. Deployment order for a future apply: migration first (nothing calls it), then the route/read changes behind the existing flag, then — only when Web, Android and iOS all handle the type — the flag.

## 8. D3, D5, D7–D10 — RESOLVED as recommendations for the owner's approval of the design (nothing implemented)
"Resolved" means each question now has one specific design, with its consequences and the test that proves it (SQL on the fixture unless stated). The owner still approves or changes it; a different answer changes the draft and its tests, not the architecture.

| # | Question | Resolution | Consequence / what it costs | Proof |
|---|---|---|---|---|
| D3 | push collapse key | **Web Push only.** `Topic` = first 32 chars of `base64url(sha256('tappyai:message-topic:'+threadId))` (the first design `message:<threadId>` makes `web-push` throw); `TTL` 86 400 s; `Urgency` normal. A shown notification is replaced by a service-worker `tag` (`message:<threadId>`, with `renotify` off); the database throttle (10 min per recipient+thread, state in Postgres) is the primary volume control. FCM / APNs untouched (native clients do not handle the type) | `send.ts` is shared: add an **optional** third-argument carrier, unchanged when absent; `public/push-sw.js` gains an optional `tag`. Topic only helps while the device is offline; push is dispatched after the commit, so a failed push after `should_push` waits out the window | `messagePushOptions.test.ts` (real library) |
| D5 | sender is NULL (deleted account) | counted (`IS DISTINCT FROM`); its notification has `actor_id NULL` and the fallback title `TappyAI` | the row has no avatar/name for that moment | draft suite, nullable-sender test (mutation caught) |
| D7 | "mark all read" | **Reading a message notification reads the thread**: `mark_notifications_read(ids)` sets `read_at` *and* moves the chat cursor (database clock, `GREATEST`) under the same per-(user,thread) lock, threads in sorted order (no deadlock); other types and rows with a malformed `threadId` are read plainly. The next message opens a row with count 1 | `POST /api/notifications/read` must call the RPC (route change; edge runtime stays). Marking one collapsed row by id also clears that thread's Messenger badge — intended: the row *is* the thread's unread pointer | draft suite: mark-all, by-id, other user's ids, tampered row, race vs emit (mutation caught) |
| D8 | sender attribution of a collapsed row | **the sender of the newest message** (actor, title, image follow it); an out-of-order or retried older emit never regresses it and never pushes. The count includes everyone else's messages | a blocked actor hides the row (RESTRICTIVE policy) until a newer message from someone else re-attributes it; if the newest sender's account is deleted the cleanup removes the row and the next emit reopens it (count from the cursor) | draft suite: attribution, out-of-order, block, deletion cleanup |
| D9 | `created_at` vs `updated_at` | **bump `created_at` to the newest message's time**; keep `data.firstMessageAt`. A separate `updated_at` is rejected: the Inbox orders by `created_at` through PostgREST, so a new column would need a generated sort column or a view and a contract change for Android/iOS | `created_at` of a `message` row is no longer a creation time. Searched the repository: no consumer treats it as immutable for this type (Inbox ordering; backfill rows are `skipPush`; the retention cron prunes marketing deliveries). Android/iOS DTOs: **not examined** | draft suite: created_at follows the newest message (mutation caught) |
| D10 | read-route clock | **database clock**: the read route calls `mark_thread_read(thread)` (DB `now()`, `GREATEST`, participant check → 42501 → the existing 404). The route no longer sends a timestamp | route change. A client can still write its own `chat_reads` row (RLS) — a stale unread row is then healed at the next emit; a future-dated cursor is self-inflicted. Tightening the `chat_reads` policies is **not** part of this design | draft suite: DB clock, cursor never regresses, authorisation; `collapseReadiness.test.ts` characterises today |
| F3 | failure policy | unchanged from proposal §7d: bounded `lock_timeout` 2 s / `statement_timeout` 3 s as function attributes, one bounded inline retry, then ONE plain `INSERT … ON CONFLICT DO NOTHING` on the unique index that never pushes; the send always returns 200 | – | draft suite: lock bound (55P03 within ~2 s, no setting leak), degraded insert keeps one row and the next emit repairs the count; property run |

## 9. What would have to be true before this can be implemented
Owner approval of the resolutions above; the unapplied-migration process (pre-checks in §6 run per database, deployment window, rollback reviewed); route changes (send passes `created_at` and uses the RPC; read route calls `mark_thread_read`; `/api/notifications/read` calls `mark_notifications_read`; `ThreadView` marks read after the first page) with the tests listed in §3b rewritten from characterisation to behaviour; `send.ts` / service-worker options; Android/iOS handling of the `message` type before the flag is ever turned on. None of this has been done.
