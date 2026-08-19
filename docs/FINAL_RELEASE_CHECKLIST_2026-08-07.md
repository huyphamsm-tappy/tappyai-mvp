# Final Release Checklist — 2026-08-07

Companion to `RELEASE_READINESS_2026-08-07.md` (not a replacement — that report stands as written).
Remaining items only. Every item is exactly one of **DONE**, **BLOCKED (external)**, **WAITING OWNER**.

---

## Task 1 — `fn_sync_last_login` REVOKE applied to production

| # | Item | State |
|---|---|---|
| 1.1 | Migration applied to production | **DONE** — `REVOKE EXECUTE ON FUNCTION public.fn_sync_last_login() FROM PUBLIC, anon, authenticated;` → `Success. No rows returned`. Editor content verified byte-identical to the migration file before running |
| 1.2 | anon → 42501 | **DONE** — `POST /rest/v1/rpc/fn_sync_last_login` with the public anon key → `{"code":"42501","message":"permission denied for function fn_sync_last_login"}` |
| 1.3 | authenticated → 42501 | **DONE** — `SET LOCAL ROLE authenticated` probe → `42501 permission denied for function fn_sync_last_login` |
| 1.4 | service_role still executes | **DONE** — `SET LOCAL ROLE service_role` → `EXECUTED OK` (the function genuinely ran; this is the nightly cron's own operation and is idempotent) |
| 1.5 | ACL verified | **DONE** — `aclexplode` now returns exactly **`postgres`, `service_role`**. No `anon`, no `authenticated`, no PUBLIC |
| 1.6 | Cron still works — DB layer | **DONE** — all three RPCs the route calls (`fn_rollup_auth_daily`, `fn_sync_last_login`, `fn_rollup_activation_daily`) report `service_role_can_execute = true` |
| 1.7 | Cron still works — HTTP layer | **WAITING OWNER** — `CRON_SECRET` is not available locally and I will not request or handle it. Next scheduled run is `5 17 * * *` = **00:05 VN**. Owner can confirm from the Vercel cron log |
| 1.8 | No contradiction with expectations | **DONE** — every result matched the prediction; no stop condition triggered |

## Task 2 — Planner Stop UAT (integrated Android build `13b5e33`)

| # | Item | State |
|---|---|---|
| 2.1 | Run the final Planner Stop UAT | **WAITING OWNER** — cannot run. Two independent obstacles, both measured: (a) `adb devices` returns empty — device `R58RC0V30BH` disconnected mid-session and `adb reconnect offline` did not recover it, so it needs to be physically reconnected / USB debugging re-authorised; (b) VN clock `23:01`, `FREE_DAILY_LIMIT = 15` resets at midnight and both test accounts are exhausted |
| 2.2 | Mark Planner Stop PASS | **WAITING OWNER** — **NOT PASS.** The Stop path in `ChatViewModel.kt` is byte-identical to where it was proven GREEN on `d9f9f0f`, but that is an argument, not a test |

## Task 3 — Final release verification

| # | Item | State |
|---|---|---|
| 3.1 | No unresolved Critical | **DONE** — C-1 resolved and re-confirmed this session: `fn_is_platform_owner`, `fn_grant_admin_role`, `fn_revoke_admin_role` all still `42501` to anon |
| 3.2 | No unresolved High | **DONE** — H-1 (`fn_sync_last_login`) applied and verified above. Final state query: all five Class-C functions now `anon=false, authenticated=false, service_role=true` |
| 3.3 | No migration missing | **DONE** — both migrations applied to production are present in the branch: `20260807_platform_owner_revoke_public_execute.sql` and `20260807b_sync_last_login_revoke_public_execute.sql` |
| 3.4 | Branch ready | **DONE** — `fix/platform-owner-revoke-public` @ `258cb5a`, working tree clean, 2 commits ahead of `origin/main`, **fast-forward** (merge-base == `origin/main`), diff is **683 insertions / 0 deletions** across 4 files |
| 3.5 | Backend ready | **DONE** — `tsc --noEmit` exit 0; 881 tests, 878 passing; the 3 failures are pre-existing and CRLF-environment-only, present identically at `origin/main` without these commits |
| 3.6 | Database ready | **DONE** — production ACL matches the intended end state exactly; RLS confirmed enforcing on `admin_roles` / `audit_log` / `user_acquisition` |
| 3.7 | Admin area regression check | **DONE** — `/admin/rbac` loads after the second migration, header renders "Platform Owner", lists the existing `super_admin`, no console errors |
| 3.8 | Android ready | **WAITING OWNER** — everything else passed integrated UAT; only Planner Stop (2.1/2.2) is open |

## External

| # | Item | State |
|---|---|---|
| 4.1 | Vercel Blob store 403 | **BLOCKED (external)** — Hobby-tier quota suspension, `blockedUntil` 2026-09-02. Not investigated further, per instruction |

## Gated on approval

| # | Item | State |
|---|---|---|
| 5.1 | Push `fix/platform-owner-revoke-public` | **WAITING OWNER** |
| 5.2 | Merge to `main` | **WAITING OWNER** |
| 5.3 | Deploy | **WAITING OWNER** |

---

# Task 5 — Release Decision

# DO NOT RELEASE

**Not because anything is broken.** Security, backend, database and branch are all closed with evidence
(§3.1–3.7). The single reason is §2:

> **Planner Stop UAT has not been run, and therefore cannot be marked PASS.**

It is an item the owner listed as a release blocker. It is blocked by a disconnected device and an unreset
daily quota — neither of which I can resolve, and neither of which I will substitute with a code-identity
argument.

**Evidence for the decision:** `adb devices` → empty; VN clock `23:01` vs midnight quota reset;
`ChatViewModel.kt` Stop path unchanged since `d9f9f0f` (an argument, not a test).

**What flips this to READY FOR PUSH / MERGE / DEPLOY** — one item:

1. Reconnect device `R58RC0V30BH`, wait for VN midnight, run the Planner Stop UAT with the required evidence
   (stop immediately after the plan block arrives · plan survives · persists · restores from History · no raw
   markers · no regression).

Optionally confirm 1.7 (the 00:05 VN cron run) from the Vercel log — that is a confirmation, not a blocker,
since the database layer is already verified.

Nothing was pushed, merged, or deployed. Production changes made in this session: the two grant migrations,
both verified.
