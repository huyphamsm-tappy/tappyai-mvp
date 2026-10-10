# Messenger → Inbox: collapsing unread message notifications per thread — PROPOSAL (not implemented)

Status: **PROPOSAL for owner decision. No behaviour change was made.** Web-only phase; `MESSAGE_NOTIFICATIONS_ENABLED` stays OFF (Android/iOS do not handle the `message` type), so the shape can still change before anyone depends on it. Baseline: `p8/agent-runtime` after `220d251`.

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
# Send idempotency — separate DESIGN TASK (not part of this slice; NOT implemented)
Problem (verified): `POST /api/messaging/threads/[id]/messages` has no idempotency key; a client retry after a timeout whose first attempt succeeded stores the message twice and (flag on) notifies twice.
Outline for the design review: an **optional** `clientMessageId` (uuid) in the body; nullable column + partial unique index `(thread_id, sender_id, client_message_id) WHERE client_message_id IS NOT NULL`; on conflict return the existing row with 200; Web generates one id per send attempt and reuses it on retry; older clients simply omit it (additive, backward compatible, but it **is** a request-field change, hence a separate approved task with its own tests: duplicate retry, concurrent same id, different sender same id, missing id unchanged). Not started.

---
# Group creation and blocks — current rule (documented; no change)
- At creation (`chat_create_group`, migration `20261018`): a member who is in a block pair with the **creator** (either direction; `user_blocks` or `chat_blocks`) is refused with the same `invalid_members` an unknown account gets. **Pairs among the other members are not judged** at creation, and no such restriction is added without separate approval.
- After creation (`chat_thread_blocked`, unchanged semantics): a sender is muted (RLS 42501 → 404) if they are in a block pair with **any other participant** of the thread; history stays readable. Consequence to be aware of: a block pair between two members mutes both of them in that group (the others are unaffected); there is no remove-member RPC.
