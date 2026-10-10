# Migration `20261018_chat_honours_user_blocks` — verification and deployment-window proposal

Status: **verified in tests only; NOT applied to any database; no deployment is scheduled or performed by this document.** Baseline `17d4aac` + Checkpoint 2.

## 1. What it is
Three `CREATE OR REPLACE FUNCTION` statements (`chat_can_reach`, `chat_thread_blocked`, `chat_create_group`), each followed by its original REVOKE/GRANT. No table, column, index, policy, trigger or data change. Signatures, return types, `SECURITY DEFINER`, pinned `search_path`, ACLs and error codes are unchanged. It reads `safety_private.blocked_ids()` (from `20261001_user_blocks.sql`) and `chat_blocks`.

## 2. Verified (supabase/tests/chat_honours_user_blocks.test.ts — 17 tests, real PostgreSQL on the production schema snapshot)
- **SQL:** applies cleanly on the snapshot plus `20261001_user_blocks`; re-applies (idempotent); behaviour cases: direct start (both directions), existing thread (send refused 42501, history readable, unblock restores), group creation (creator↔member via `user_blocks` and `chat_blocks`; member↔member **not** judged), unrelated third party unaffected, same errors as an unknown account.
- **Rollback:** `rollback/20261018_chat_honours_user_blocks_rollback.sql` restores the previous behaviour **and the function bodies verbatim** (`pg_get_functiondef` before = after rollback; a tampered rollback fails the test), signatures/ACL identical; the migration re-applies afterwards.
- **Ordering:** listed once in `supabase/MIGRATION_ORDER.txt`, after `20260905_chat_messaging_phase1`, `20260906_phase6_messenger_reachability`, `20261001_user_blocks` and after the previous last migration (`20261017_p7_pip_trial_any_source`); `scripts/release/apply-migration.sh` policy **AFTER-SMOKE** (with the other `user_blocks` migrations); `migrationOrder.test.ts`, `applyMigrationPolicy.test.ts` pass.
- **Interaction with the existing block policies:** the `chat_messages` INSERT policy still delegates to `chat_thread_blocked` (the policy is untouched); `safety_private.blocked_ids()` is not callable by `anon`; with the block tables empty (what production has until `USER_BLOCKS_ENABLED` is turned on and someone blocks) the functions answer exactly as before; the reverse lookup is index-backed (`user_blocks_blocked_idx`, `user_blocks_pkey`), so a message insert does not gain a scan. The neighbouring suites (`phase6_messenger`, `chat_messaging_boundary`, `user_blocks`) pass.
- **Group rule preserved:** creation refuses a member in a block pair **with the creator**; no member↔member restriction at creation (unchanged by this checkpoint). After creation `chat_thread_blocked` keeps its existing semantics (a sender is muted against any block pair with another participant).

## 3. Not verified (needs production access or the owner)
Production presence and state of `chat_blocks`, `user_blocks`, `safety_private.blocked_ids()` and the three functions (their definitions are assumed to equal the repository's `20260905`/`20260906` bodies — the pre-check below proves it); the function owner; load behaviour on production data; the production value of `USER_BLOCKS_ENABLED`.

## 4. Proposed deployment window (a proposal for the owner — nothing is executed here)
1. **Preconditions:** `20261001_user_blocks` (+ `b`, `d`, `e`) applied and smoked (policy AFTER-SMOKE); a release smoke passed; no one is mid-way through another migration.
2. **Pre-check (read-only):** (a) `SELECT proname, md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname IN (...)` and compare with the md5 of the repository bodies of `20260905`/`20260906` — if they differ, **stop** and investigate; (b) `SELECT count(*) FROM user_blocks ub WHERE NOT EXISTS (SELECT 1 FROM chat_blocks cb WHERE cb.blocker_id = ub.blocker_id AND cb.blocked_id = ub.blocked_id)` — the number of pairs whose chat behaviour will change (expected 0 or tiny); (c) record the function owner.
3. **Apply:** the file in one transaction (`CREATE OR REPLACE` takes a brief lock on each function; no table lock, no rewrite). Expected duration: milliseconds.
4. **Verify (read-only + two disposable test accounts):** definitions now contain `blocked_ids`; a blocked test pair cannot start a direct chat (HTTP 400 `invalid_input`) and a send to an existing thread is 404; an unblocked pair still works; group creation with a blocked member is 400.
5. **Monitor:** 4xx/5xx on `/api/messaging/threads` and `.../messages` for an hour; no new error codes are introduced.
6. **Rollback:** run the rollback file (restores the previous bodies; verified verbatim). No data to repair.
7. **Client impact:** none required — the same error codes are returned; Android/iOS behaviour changes only in the sense that blocked pairs are now refused server-side.
Everything above that touches production needs owner approval and read/apply access that this task does not have.
