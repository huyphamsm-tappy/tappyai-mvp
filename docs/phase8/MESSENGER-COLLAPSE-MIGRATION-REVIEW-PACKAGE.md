# Messenger notification collapse — migration REVIEW PACKAGE (2026-10-10)

Status: **review material for a separate owner decision. Nothing is implemented, no migration file exists under `supabase/migrations/`, nothing was applied anywhere, and the send API, the send limiter and the feature flag are unchanged.** The SQL in §5 is a *draft embedded in this document*; it is not executable from the repository. Baseline `4bfb3d4` + this checkpoint. Production schema, grants, flag value and KV: **UNVERIFIED** (no production access).
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

## 5. Draft migration (REVIEW ONLY — not applied, not in `supabase/migrations/`)
```sql
-- DRAFT 20261019_messenger_notification_collapse.sql  (name/number are placeholders)
-- Requires: public.notifications (20260725), public.chat_reads/chat_messages (20260905). Independent of 20261018 (no shared objects).

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_message_uidx
  ON public.notifications (user_id, (data->>'threadId'))
  WHERE type = 'message' AND read_at IS NULL;

CREATE OR REPLACE FUNCTION public.emit_message_notification(
  p_user uuid, p_thread uuid, p_message_at timestamptz,
  p_actor uuid, p_title text, p_body text, p_entity_url text, p_image_url text,
  p_push_window interval DEFAULT interval '10 minutes')
RETURNS TABLE (notification_id uuid, unread_count int, should_push boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET lock_timeout = '2s' SET statement_timeout = '3s'
AS $$
DECLARE v_cursor timestamptz; v_count int; v_id uuid; v_last_push timestamptz; v_push boolean := false; v_now timestamptz := now();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_thread::text, 0));
  SELECT last_read_at INTO v_cursor FROM public.chat_reads WHERE user_id = p_user AND thread_id = p_thread;
  UPDATE public.notifications SET read_at = v_now                         -- self-heal (spike 18b)
   WHERE user_id = p_user AND type = 'message' AND read_at IS NULL AND data->>'threadId' = p_thread::text
     AND v_cursor IS NOT NULL AND (data->>'lastMessageAt')::timestamptz <= v_cursor;
  IF v_cursor IS NOT NULL AND p_message_at <= v_cursor THEN RETURN; END IF;
  SELECT count(*) INTO v_count FROM public.chat_messages
   WHERE thread_id = p_thread AND sender_id IS DISTINCT FROM p_user AND created_at > COALESCE(v_cursor, '-infinity');
  SELECT n.id, (n.data->>'lastPushAt')::timestamptz INTO v_id, v_last_push FROM public.notifications n
   WHERE n.user_id = p_user AND n.type = 'message' AND n.data->>'threadId' = p_thread::text AND n.read_at IS NULL;
  IF v_id IS NULL THEN
    v_push := true;
    INSERT INTO public.notifications (user_id, type, category, title, body, actor_id, entity_url, image_url, data, created_at)
    VALUES (p_user, 'message', 'social', p_title, p_body, p_actor, p_entity_url, p_image_url,
            jsonb_build_object('threadId', p_thread::text, 'kind', 'message', 'count', v_count, 'lastMessageAt', p_message_at, 'lastPushAt', v_now), v_now)
    RETURNING id INTO v_id;
  ELSE
    v_push := v_last_push IS NULL OR v_now - v_last_push >= p_push_window;
    UPDATE public.notifications SET created_at = v_now,   -- OWNER DECISION D9: bump created_at (re-sorts the Inbox) vs a new updated_at column
           data = data || jsonb_build_object('count', v_count, 'lastMessageAt', p_message_at) || CASE WHEN v_push THEN jsonb_build_object('lastPushAt', v_now) ELSE '{}'::jsonb END
     WHERE id = v_id;
  END IF;
  RETURN QUERY SELECT v_id, v_count, v_push;
END $$;
REVOKE ALL ON FUNCTION public.emit_message_notification(uuid,uuid,timestamptz,uuid,text,text,text,text,interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_message_notification(uuid,uuid,timestamptz,uuid,text,text,text,text,interval) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_thread_notifications_read(p_thread uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET lock_timeout = '2s'
AS $$
DECLARE v_user uuid := auth.uid(); v_now timestamptz := now(); v_n int;
BEGIN
  IF v_user IS NULL OR NOT public.chat_is_participant(p_thread) THEN RETURN 0; END IF;     -- same refusal shape as RLS (route answers 404)
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_thread::text, 0));
  INSERT INTO public.chat_reads (thread_id, user_id, last_read_at) VALUES (p_thread, v_user, v_now)
    ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = GREATEST(public.chat_reads.last_read_at, EXCLUDED.last_read_at);
  UPDATE public.notifications SET read_at = v_now
   WHERE user_id = v_user AND type = 'message' AND read_at IS NULL AND data->>'threadId' = p_thread::text AND (data->>'lastMessageAt')::timestamptz <= v_now;
  GET DIAGNOSTICS v_n = ROW_COUNT; RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.mark_thread_notifications_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_thread_notifications_read(uuid) TO authenticated;
```
Differences from the spike that are **not yet tested** (so they would be part of the migration's own test, §3 P1): `SECURITY DEFINER` + role grants, `auth.uid()` / `chat_is_participant` use, the extra NOT NULL columns, `statement_timeout` as a function attribute, and the `p_actor` semantics (D8). The draft passes no clock parameter: the spike's injected clock exists for tests only; the real tests would need an injectable time source (a wrapper or a GUC) — part of the work, not solved here.

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

## 7. Rollback (draft)
```sql
DROP FUNCTION IF EXISTS public.mark_thread_notifications_read(uuid);
DROP FUNCTION IF EXISTS public.emit_message_notification(uuid,uuid,timestamptz,uuid,text,text,text,text,interval);
DROP INDEX IF EXISTS public.notifications_unread_message_uidx;
```
Order of operations at rollback: (1) set `MESSAGE_NOTIFICATIONS_ENABLED` off (or deploy the route that no longer calls the RPCs), (2) run the drops. Rows already written stay valid ordinary notifications (type `message`, `data.count` stale and ignored). No data migration is required either way. Deployment order for a future apply: migration first (nothing calls it), then the route/read changes behind the existing flag, then — only when Web, Android and iOS all handle the type — the flag.

## 8. Corrections and additions to the proposal (v2.2 → needs v2.3 if approved)
1. **D3 collapse key:** `message:<threadId>` is not a valid Web Push `Topic`; use a ≤32-char base64url hash (§1).
2. **D5 count:** derived count must use `IS DISTINCT FROM` (nullable sender) — tested.
3. **D1/D2 stale rows:** add the self-heal at emit — tested.
4. **D7 (new): "mark all read" semantics.** Options: (a) leave as is (count reopens, consistent with Messenger); (b) make `POST /api/notifications/read` also advance the chat cursor for thread-message rows it clears (route change, then both surfaces agree); (c) make a dismissed notification reset the derived count baseline (needs a stored baseline; adds state).
5. **D8 (new): `actor_id` of a collapsed row** in a group (first sender today). Interaction with the RESTRICTIVE block policy and account-deletion cleanup (P2/P3). Options: first sender / latest sender (update `actor_id`+`title` each emit) / null actor for group rows.
6. **D9 (new): `created_at` bump** vs a new `updated_at` column (the latter changes the shared `notifications` contract Android/iOS read).
7. **D10 (new): read-route clock.** Move the cursor write into the function (database clock, `GREATEST`) — recommended — or leave the lambda clock.

## 9. What would have to be true before this can be implemented
Owner approval of D1–D10; the unapplied-migration process (pre-checks run per database, deployment window, rollback script reviewed); tests P1–P5 and 8/8b/10/11 written; Android/iOS handling of the `message` type (separate phase) before the flag is ever turned on. None of this has been done.
