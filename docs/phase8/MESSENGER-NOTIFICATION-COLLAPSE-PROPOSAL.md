# Messenger → Inbox: collapsing unread message notifications per thread — PROPOSAL (not implemented)

Status: **PROPOSAL v2.2 + review package (2026-10-10; store-down semantics §7d; DB-level acceptance criteria verified in a spike §7e — still NOT implemented) — the five open semantics are resolved below with recommended defaults; the owner approved the DIRECTION (one unread row per recipient and thread); implementation waits for explicit approval of §7. No behaviour change was made.** Web-only phase; `MESSAGE_NOTIFICATIONS_ENABLED` stays OFF (Android/iOS do not handle the `message` type), so the shape can still change before anyone depends on it. Baseline: `p8/agent-runtime` after `220d251`.

## 1. What exists today (verified)
- A send (`POST /api/messaging/threads/[id]/messages`) stores the row, then `notifyThreadRecipients` calls `emitNotification` **once per other participant per message** (`type 'message'`, `category 'social'`, title = sender name, fixed body, `data {threadId, kind}`, `entityUrl` = `/profile/notifications?tab=messages&thread=<id>`). Only when the flag is exactly `'true'`.
- `emitNotification` always INSERTs a new `notifications` row and dispatches a push; there is no dedupe key anywhere on `notifications`.
- Message unread (Messenger) is derived server-side from the per-thread read cursor (`chat_reads`, `chat_thread_summaries`); notification unread is `notifications.read_at IS NULL`. The two counts are deliberately independent (`MessagesProvider` header).
- Web delivery: `NotificationProvider` listens to `postgres_changes` `*` on `notifications` for the user and **re-reads the whole list** (300 ms debounce), so an UPDATE of an existing row is already picked up.

## 2. Proposed semantics (to be approved)
1. **One UNREAD message notification per (recipient, thread).** A new message while one exists updates it: `created_at = now()` (it moves to the top), `actor_id`/`title` = latest sender, `data.count = count + 1`, `data.lastMessageId` = the new message id. No new row, no message text, no preview (unchanged privacy rule).
2. **Becomes read when:** (a) the recipient opens the thread — the existing `POST …/read` (cursor) also sets `read_at` on that thread's unread message notification; (b) "mark all read" in the Inbox; (c) the user opens the notification. A message that arrives after it was read starts a **new** row with `count = 1`. Read rows stay as history.
3. **Badge:** the Inbox notification badge counts collapsed rows (one per thread with unread messages), not messages. The Messenger tab keeps its own per-thread message counts.
4. **Group threads:** one collapsed row per recipient per thread; the title stays the thread/sender wording the producer uses today (no @mention logic).
5. **Push:** the push is the noisy part. Proposal: send a push for the first message of a collapsed row and at most one more per thread per N minutes after that (N = owner decision; suggest 10). Collapsing rows while still pushing every message would not fix the problem.
6. **Out of scope / unchanged:** the send contract, the block rules, anonymous refusal, the flag semantics, read-history in Messenger.

## 3. Mechanism (how it would be built, so the semantics are testable)
- Partial unique index on `notifications (user_id, (data->>'threadId')) WHERE type = 'message' AND read_at IS NULL`, and a `SECURITY DEFINER` function (service-role only) `emit_message_notification(...)` doing `INSERT … ON CONFLICT (…) WHERE … DO UPDATE SET created_at = now(), actor_id = EXCLUDED.actor_id, title = EXCLUDED.title, data = jsonb_set(notifications.data, '{count}', to_jsonb(coalesce((notifications.data->>'count')::int, 1) + 1))` — the increment is computed **in SQL**, never read-modify-write in the app, which is what makes concurrent messages exact. PostgREST cannot target a partial index in `on_conflict`, hence the function.
- `POST …/read` additionally runs `UPDATE notifications SET read_at = now() WHERE user_id = me AND type = 'message' AND read_at IS NULL AND data->>'threadId' = :thread`.
- Additive migration + rollback (drop function and index). No change to Android/iOS contracts: the `message` type is not enabled for them yet; if the flag is later enabled they would receive a row with an extra `data.count` field they may ignore.

## 4. Concurrency and realtime (the cases that must be explicit)
- **Concurrent messages** from several senders or retries to the same recipient/thread: the unique index serialises them; exactly one unread row; `count` equals the number of messages.
- **Read racing a new message:** the read UPDATE and the upsert contend on the same row. Either the upsert wins first (count includes the message, then the read marks it read — the message is covered by the cursor only if it is older than the cursor, so the cursor write must be the same transaction/ordering as today) or the read wins (the new message opens a new row). Acceptance test below pins both orders; the product rule is "a notification is read only if the cursor has passed the message it counts".
- **Realtime:** the provider already refetches on any event for the user, so an UPDATE shows up; the badge must not change on an UPDATE of an already-unread row (still one).
- **Persistence:** read rows are retained like every other notification (existing retention rules apply); the unread uniqueness only constrains unread rows.

## 5. Acceptance tests (must exist before implementation is merged)
1. 5 rapid messages to one recipient → 1 unread row, `count = 5`, 1 push (policy above).
2. Open the thread → row read; the next message → a NEW row `count = 1`.
3. 20 concurrent sends → exactly 1 unread row, `count = 20` (real Postgres).
4. Two recipients in a group are independent; two threads give two rows.
5. Read racing a send: both interleavings leave a consistent (`count`, `read_at`) pair.
6. A refused send (RLS / block) creates and changes nothing.
7. Flag OFF: no function call, no row.
8. "Mark all read" marks every collapsed row; the badge returns to 0.
9. Realtime: an UPDATE event refetches; badge stays 1 for a second message in the same thread.
10. No message text in any column; rollback restores today's behaviour exactly.

## 6. Decisions needed
Push throttle window (N); whether the title carries the count ("3 tin nhắn mới" — needs localisation: the producer composes Vietnamese server-side today); whether read-by-opening-thread is acceptable as the only implicit read; whether collapsed rows older than X days are pruned.

---
# 7. Resolved semantics and recommended defaults (v2 — supersedes §2–§5 where they differ)

**D1 — When does opening a thread mark the notification read?** *Recommended:* only **after the newest page of messages has loaded successfully** in the thread view, and then by the existing `POST …/threads/[id]/read` (no new request field). Server side, that endpoint marks the thread's unread message notification read **only if its `lastMessageAt` ≤ the cursor it just wrote** (cursor = the database `now()` inside the same locked section). So a failed history load never marks anything read, and a message that arrived after the cursor keeps (or re-opens) an unread row. (Web change: `ThreadView` calls `markThreadRead` after the first-page fetch resolves, not at mount — it is unconditional at mount today.)

**D2 — Serialisation of concurrent sends and read/send races.** *Recommended:* one **transaction-scoped advisory lock per (recipient, thread)** (`pg_advisory_xact_lock(hashtextextended(user_id || ':' || thread_id, 0))`) taken at the start of BOTH `emit_message_notification(...)` and `mark_thread_notifications_read(...)`. Inside the lock: the emit function recomputes state from the source of truth, the read function advances the cursor and then marks. Result: any two operations on the same (recipient, thread) are totally ordered; there is no read-modify-write in application code. The partial unique index (unread message row per user+thread) remains as the backstop. Race outcomes are defined: *send-then-read* → the row is marked read because `lastMessageAt ≤ cursor`; *read-then-send* → the send creates a new row (`count = 1`); a message whose transaction started before the read but commits after it is covered because emit **re-reads the cursor under the lock** and inserts the row already-read (or not at all) when the message is older than the cursor.

**D3 — Push throttle window and deduplication key.** *Recommended:* **10 minutes per (recipient, thread)**: the first message of an unread row pushes; further messages in the same row push at most once per 10 minutes (the function returns `should_push`, computed under the lock from `data.lastPushAt`). **Deduplication key = `message:<threadId>`**, passed as the transport collapse key (FCM `collapse_key`, APNs `apns-collapse-id`, Web Push `Topic`) so devices replace rather than stack. Owner may change the window; the mechanism does not depend on the number.

**D4 — Is the unread count in the title or payload?** *Recommended:* **payload only**: `data.count` (and `data.lastMessageAt`, `data.lastMessageId`). The server-composed title/body never carry a number (the producer composes Vietnamese only today — a number in the string would be a localisation defect). Web renders "(N)" from `data.count` in the user's locale. A later push after the throttle uses the same fixed generic sentence.

**D5 — Failures and retries must not lose notifications.** *Recommended:* (a) the count is **derived**, not incremented: `count = number of messages in the thread from others with created_at > the recipient's cursor`, computed in the emit function — so a retried emit for the same message cannot double count and a failed emit is repaired by the next one; (b) the send path stays non-throwing and awaits the emit once, with one bounded inline retry on a transient error; failures are logged with the recipient/thread ids (no content); (c) an optional reconciliation sweep (cron) can create the missing row for threads with unread messages and no unread notification — deferred, not needed for correctness of the semantics above; (d) the send API contract is untouched; idempotency of the send itself remains the separate design task below.

**Out of this proposal:** the send request, block rules, anonymous refusal, the flag semantics (stays exact `'true'`, OFF by default; Android/iOS still do not handle the type), Messenger read history.

## 7b. Acceptance tests (replace §5; all must exist and pass before merge — real Postgres for 1–8)
1. 5 sequential messages to one recipient → 1 unread row, `count = 5` (derived), `should_push` true once.
2. Open the thread (cursor advanced) → row read; the next message → a NEW row `count = 1`.
3. 20 concurrent emits for one (recipient, thread) → exactly 1 unread row, `count = 20`, exactly 1 `should_push`.
4. Retry: emit called twice for the same message → `count` unchanged the second time.
5. Read racing a send, **both interleavings forced** with the advisory lock in a controlled order: final `(read_at, count)` is consistent with the cursor in each.
6. A message older than the cursor (started before, committed after the read) → no unread row is created.
7. Two recipients of a group and two threads are independent; the sender never gets a row.
8. A refused send (RLS / block) creates and changes nothing; flag OFF → no function call, no row.
9. Push throttle: second message within 10 min → `should_push` false; after 10 min (injected clock) → true; collapse key = `message:<threadId>`.
10. Web: `ThreadView` does not call the read endpoint when the first page fails; calls it once after success (component tests).
11. Web: an UPDATE event on an unread row refetches and the badge still counts 1; "mark all read" clears every collapsed row.
12. Privacy: no message text in any column; rollback (drop function + index) restores today's behaviour exactly (test compares function and row behaviour).

## 7c. Approval requested
The recommended defaults D1–D5 above, the 10-minute window, and the web change to `ThreadView` ordering. Until approved: no migration, no function, no route change.

## 7d. Store-down semantics (D6) — resolved before implementation (2026-10-10)

**Which "store"?** Two different stores are in play and they must not be confused. (1) **Postgres** is the *only* store the collapse needs: the dedupe row, the per-(recipient, thread) lock, the derived count and the push throttle timestamp (`data.lastPushAt`) all live there. (2) **The shared KV** (Upstash) is the rate-limiter store. **Recommendation: the collapse and the push throttle must not depend on KV at all** — a KV outage then cannot duplicate, lose or storm notifications.

**What can fail, and the recommended behaviour** (the send itself is already stored; the notification is a pointer and the Messenger shows unread from the read cursor, so a missing notification never hides a message):

| Failure | Duplicate pushes | Lost notifications | Database load | Verdict |
|---|---|---|---|---|
| F1 *fail-open to today's behaviour* (insert a row and push per message when the collapse function errors) | **High** (exactly the problem being fixed, at the worst moment) | none | highest (one insert + one dispatch per message) | rejected |
| F2 *fail-closed, silent* (no row, no push) | none | the pointer for that message (repaired by the next message's derived count; the Messenger still shows the unread) | lowest | acceptable only as the last resort |
| **F3 *degrade* (recommended)**: if the function errors or times out, attempt ONE plain `INSERT … ON CONFLICT DO NOTHING` on the partial unique index (no lock, no count change) and **never push from the degraded path**; if that also fails, fall to F2 | none (the unique index forbids a second unread row; the push only fires from the success path) | none in the usual case (the row exists, its count is repaired by the next success); the push for that message is skipped | bounded: one cheap statement | **recommended** |
| F4 *outbox + worker retry* | none | none | extra table, worker, monitoring | defer; only if F3's residual loss proves unacceptable |

**Bounds that keep the load predictable:** the function runs with `SET LOCAL lock_timeout = '2s'` and `statement_timeout = '3s'` (a stuck lock fails fast instead of piling up request handlers); **at most one bounded retry** inline; no background retry loop. The failure is logged with recipient/thread ids only (no content) and counted.

**Dependency on the message-send rate limiter (slice 5 of the SEC4 plan):** `messaging/threads/[id]/messages` is still on the in-process limiter. If it is later moved to the shared limiter with the *fail-closed* semantics used for the paid-provider routes, a KV outage would make **sending a message** answer 429 — the Messenger itself would go down because of a cache outage. Recommendation: for this route use the **fail-open-to-in-process** variant (a spam/abuse limit, not a spend limit) or leave it per-instance; this is an owner decision recorded here so slice 5 does not make it by accident.

**Added acceptance tests (extend §7b):**
13. Function raises (injected lock timeout) → the degraded insert creates exactly one unread row, **no push**, `count` repaired by the next successful emit.
14. Function **and** degraded insert fail → the send still returns 200, no row, no push, one log line; the next message creates the row.
15. KV unavailable (limiter store failing) → emit, collapse and throttle behave identically (no KV call is made on this path).
16. `lock_timeout` is enforced: a held lock makes the emit return within the bound instead of hanging the request.
17. Failure injection never produces two unread rows for one (recipient, thread) (property test over random interleavings with random failures).

**Approval (adds to §7c):** F3 as the failure policy, the 2 s / 3 s bounds, and whether the message-send limiter (SEC4 slice 5) is fail-open or per-instance.

## 7e. Verification status — database-level acceptance criteria are now tested in a SPIKE (2026-10-10)

`supabase/tests/notification_collapse_spike.test.ts` (18 tests with the port suite; **a test-only spike, not a migration; nothing ships from it; nothing was applied anywhere**) builds the minimal schema inline (`chat_messages`, `chat_reads`, `notifications`), the partial unique index and the two functions this proposal describes, on a **real embedded PostgreSQL with real concurrent connections**. It proves, and 7 of 7 mutations of the SQL are caught (no lock in emit, no lock in read, increment instead of derived count, cursor not honoured, throttle ignored, read marking rows newer than the cursor, unique index removed):

| Acceptance test (§7b / §7d) | Spike test | Result |
|---|---|---|
| 1 five messages → one unread row, count 5, one push | `1 ·` | pass |
| 2 read → next message opens a NEW row (count 1), history kept | `2 ·` | pass |
| 3 20 concurrent emits → one unread row, count 20, exactly one push (20 separate connections) | `3 ·` | pass |
| 4 retry of the same message changes nothing (derived count) | `4 ·` | pass |
| 5 read racing a send, **both orders forced** with the advisory lock held in an open transaction: send→read marks read; read→send opens a new row; the waiter really waits (`pending` for 250 ms) | `5a`, `5b` | pass |
| 6 a message older than the cursor creates no row — including one emitted after the read | `6`, `6b` | pass |
| 7 recipients/threads independent; the recipient's own messages are not counted | `7 ·` | pass |
| 9 push throttle with an injected clock: pushes at 0 s, not at 60 s / 599 s, again at 600 s, not at 601 s, again at 1500 s | `9 ·` | pass |
| unique index is the backstop; a read row does not block a new unread row | `the unique index …` | pass |
| 13 lock timeout → degraded insert keeps exactly one unread row, never pushes; the next successful emit repairs the count (3 messages → 3) | `13 + 14 ·` | pass |
| 15 the path touches no KV store (the SQL contains none) | `15 ·` | pass (structural) |
| 16 `lock_timeout` bounds the wait: 55P03 within 2 s while the lock is held | `16 ·` | pass |
| 17 property run: 6 connections × 40 random operations (send, emit, read, emit with a 30 ms lock timeout): no unexpected error, never two unread rows, counts converge to the exact derived value | `17 ·` | pass |

**Findings recorded by the spike (for the review of the real migration):**
1. **Timestamp-cursor edge, consistent with today's Messenger:** a message whose `created_at` is earlier than the reader's cursor but which was committed after the read is treated as read by the emit (no row). That is exactly how the existing unread derivation (`created_at > cursor`) already behaves, so the notification never disagrees with the Messenger's unread badge — but it means such a message is also not shown as unread there. Not introduced by this proposal; to be kept in mind when the cursor semantics are next reviewed.
2. **The degraded path leaves a stale count until the next success** (test 13 + 14): by design (§7d F3) — the pointer exists, the number is repaired by the next emit.
3. The lock key is `hashtextextended(user ‖ ':' ‖ thread, 0)` — a 64-bit hash; a collision would only make two unrelated (recipient, thread) pairs wait on each other (never a correctness problem). To be noted in the migration.

**Still NOT verified (and why this remains a proposal):** acceptance tests 8 (flag/route behaviour), 10 and 11 (Web read ordering, realtime UPDATE handling, "mark all read") and 12 (rollback, privacy columns) need the real migration, the route change and component tests; the production schema, RLS and grants; Android/iOS handling of the `message` type; and any production behaviour. The send API is unchanged.

## 7f. Review package and corrections (2026-10-10, second continuation) — still a PROPOSAL
Comparison with the real Web route, schema, RLS, push path and Inbox consumer, the integration-level tests that remain, a draft migration with pre-checks and rollback, and the failure-mode analysis are in **MESSENGER-COLLAPSE-MIGRATION-REVIEW-PACKAGE.md** (a separate owner decision). Findings that change this proposal if it is approved: **D3 collapse key** `message:<threadId>` is not a valid Web Push `Topic` (≤32 URL-safe base64 characters; use a hash) and the push transport has no topic support today; **D5** the derived count must use `IS DISTINCT FROM` (the real `chat_messages.sender_id` is nullable) — spike test 18a; **stale rows** from a cursor written directly by a client are healed at the next emit — 18b; new decisions **D7** (Inbox "mark all read" does not move the chat cursor — characterised in 18c), **D8** (`actor_id` of a collapsed group row vs the RESTRICTIVE block policy and account-deletion cleanup), **D9** (`created_at` bump vs `updated_at`), **D10** (read route uses the lambda clock). A function-attribute `lock_timeout` is verified (test 19). Spike: 19 tests in the file; 9 SQL mutations caught in total (the earlier 7 plus the nullable-sender and self-heal mutations); test 19 was not mutation-tested (see the package §2). No migration was created or applied; the send API and the send limiter are unchanged.

---
# Send idempotency — separate DESIGN TASK (not part of this slice; NOT implemented)
Problem (verified): `POST /api/messaging/threads/[id]/messages` has no idempotency key; a client retry after a timeout whose first attempt succeeded stores the message twice and (flag on) notifies twice.
Outline for the design review: an **optional** `clientMessageId` (uuid) in the body; nullable column + partial unique index `(thread_id, sender_id, client_message_id) WHERE client_message_id IS NOT NULL`; on conflict return the existing row with 200; Web generates one id per send attempt and reuses it on retry; older clients simply omit it (additive, backward compatible, but it **is** a request-field change, hence a separate approved task with its own tests: duplicate retry, concurrent same id, different sender same id, missing id unchanged). Not started.

---
# Group creation and blocks — current rule (documented; no change)
- At creation (`chat_create_group`, migration `20261018`): a member who is in a block pair with the **creator** (either direction; `user_blocks` or `chat_blocks`) is refused with the same `invalid_members` an unknown account gets. **Pairs among the other members are not judged** at creation, and no such restriction is added without separate approval.
- After creation (`chat_thread_blocked`, unchanged semantics): a sender is muted (RLS 42501 → 404) if they are in a block pair with **any other participant** of the thread; history stays readable. Consequence to be aware of: a block pair between two members mutes both of them in that group (the others are unaffected); there is no remove-member RPC.
