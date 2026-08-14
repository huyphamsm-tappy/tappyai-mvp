# C11 — Implementation readiness

**Status:** preparation complete; implementation **blocked on one prerequisite**.
**Date:** 2026-08-13 · **Contract:** [`11_COMPONENT11_SESSION_SECURITY_CONTRACT.md`](11_COMPONENT11_SESSION_SECURITY_CONTRACT.md) · **ADR:** [ADR-021](../architecture/ADR-021-c11-auth-sessions-dependency.md) (draft)

This document exists so the implementation session starts by *writing code*, not by re-deriving decisions. It contains no new policy — every rule here traces to a ratified clause.

## 1. The single prerequisite

**A GoTrue instance that is not production.** Either:

| Path | Then |
|---|---|
| `tappyai-memberapi/.env.staging` with `STAGING_SUPABASE_URL` / `_ANON_KEY` / `_SERVICE_ROLE_KEY` / `_DATABASE_URL` | run the probe as-is |
| `docker` (or `podman`) on PATH | `npx supabase init && npx supabase start`, then point the same four variables at the local stack (`http://127.0.0.1:54321`, and `postgresql://postgres:postgres@127.0.0.1:54322/postgres`) |

Everything downstream is already written and waiting.

**Measured 2026-08-13:** no `.env.staging` anywhere under `Projects/`, no `STAGING_*` variables, `docker` and `podman` both absent, no `supabase/config.toml`. The embedded-PostgreSQL harness cannot substitute: it provides PostgreSQL, and `auth.sessions` is created by **GoTrue**.

## 2. Resume procedure — exact

```bash
node scripts/diagnostics/c11-session-revocation-probe.mjs
```

It prints, in order: the target host and a production-refusal check · whether `session_id` is a claim · **O-2** TTL computed from the token's own `iat`/`exp` · **O-1** the `getUser` status before and after revocation · **O-3** the `auth.sessions` column list, per-role reachability, and any credential-bearing columns a projection must never select.

Then, without further decisions:

| O-1 result | Contract §5.2 becomes | Implementation |
|---|---|---|
| **401/403** (immediate) | stands as written | reuse the existing `auth.getUser()` round-trip; **no** per-request database lookup |
| **200** (eventual) | must be rewritten before coding | the guarantee is the measured TTL; minimum request-time enforcement must be designed, and that is a **contract change, not an implementation detail** |

| O-3 result | Then |
|---|---|
| `auth.sessions` readable via definer function, approved columns present | fill ADR-021's assumption table from the probe output, mark it Accepted, implement Option A |
| not readable, or columns cannot support a truthful inventory | **reject ADR-021**, fall back to contract Option C (revocation only, no listing), and say so in the contract |

## 3. Test architecture — the split that must not blur

| Layer | Location | Proves | Cannot prove |
|---|---|---|---|
| **PostgreSQL runtime** | `supabase/tests/c11_session_security.test.ts` (to be written) | the C11 functions' own behaviour: projection, `is_anonymous` filter, Owner-target protection, snapshot boundary, idempotency, grants, transaction atomicity | anything about real GoTrue behaviour |
| **GoTrue integration** | `scripts/diagnostics/c11-session-revocation-probe.mjs` | O-1 revocation timing, O-2 TTL, O-3 real schema | nothing about C11's own logic |
| **Guard** | `scripts/diagnostics/c11ProbeGuard.test.mjs` ✅ **written, 5 tests, 4/4 mutations killed** | the probe refuses production, exits non-zero without config, never echoes keys | — |

**The runtime layer will use a stand-in table shaped by ADR-021's assumption list.** That is legitimate for testing C11's logic and *illegitimate* as evidence about GoTrue. Any test name or comment implying otherwise is a defect — this is the "fake GoTrue semantics" trap the Owner named, and ADR-021 records why a stand-in cannot detect its own assumptions going stale.

Harness pattern is already established (C8's suite is the template): unique port, `PRELUDE` creating `anon`/`authenticated`/`service_role` **plus `ALTER DEFAULT PRIVILEGES`** so revoke assertions are non-vacuous, `DROP SCHEMA public CASCADE` per test, migration applied from disk.

## 4. Runtime test matrix — ready to write

| # | Test | Ratified source |
|---|---|---|
| 1 | migration applies; is idempotent on re-apply | C8 precedent |
| 2 | every C11 function is `SECURITY DEFINER` with pinned `search_path` | ADR-019 |
| 3 | inventory projects **only** approved columns; no token/secret/IP/user-agent column is selectable | §16, P-6, I-5 |
| 4 | `is_anonymous = true` rows are invisible to inventory **and** unaffected by revoke-all | §6.1, I-12 |
| 5 | revoking one session leaves the user's other sessions untouched | §8 |
| 6 | revoke-all revokes exactly the snapshot set | §4.1, I-8 |
| 7 | a session inserted *after* the revoke-all statement begins survives | §4.1, I-8 |
| 8 | revoke-all never touches another user's rows | I-7 |
| 9 | Owner-target protection: revoke and revoke-all both refuse when the target is the Platform Owner | §5.1.1, I-4a |
| 10 | already-revoked → no-op success, count 0 | §8, I-6 |
| 11 | expired → no-op success, count 0 | §4, §8 |
| 12 | nonexistent session id → no row affected | §8 |
| 13 | terminal states never reopen (`revoked` → `active` impossible) | §4 |
| 14 | `EXECUTE` revoked from `PUBLIC, anon, authenticated`; granted only to `service_role` — tested by `SET ROLE` and requiring `42501` | ADR-019, C8 precedent |
| 15 | revoke-all is atomic: an aborted transaction leaves zero rows revoked | §10 |
| 16 | audit entry written for revoke, revoke-all, and denial | §13, I-10 |

## 5. Mutation checklist — every one must die

Anchors must be **unique** in the file (the C8 lesson: a duplicated anchor mutates a comment and reports a false SURVIVED).

| # | Mutation | Kills which test |
|---|---|---|
| M1 | delete the Owner-target predicate in the SQL function | 9 |
| M2 | delete the Owner-target check in the handler | 9 (handler-side) |
| M3 | drop `is_anonymous = false` from the inventory query | 4 |
| M4 | drop `is_anonymous = false` from the revoke path | 4 |
| M5 | revoke-all re-queries after the first statement ("catch stragglers") | 7 |
| M6 | revoke-all loops in the application tier instead of one statement | 6, 15 |
| M7 | widen the `user_id` predicate in revoke-all | 8 |
| M8 | allow a `revoked` row to be re-revoked and counted | 10 |
| M9 | allow settle/revoke on a terminal row to flip it back | 13 |
| M10 | add a token/secret column to the projection | 3 |
| M11 | grant `EXECUTE` to `authenticated` | 14 |
| M12 | change the required permission to the read permission on a revoke route | authorization test |
| M13 | remove the audit write from the denial path | 16 |
| M14 | swap the decision order so C11 runs after authorization | §18 order test |

## 6. API surface — already fixed by the contract

`GET /api/admin/security/sessions` · `DELETE /api/admin/security/sessions/[sessionId]` · `POST /api/admin/security/sessions/force-logout`, all `dynamic = 'force-dynamic'`, mutations `isSameOrigin`, handler contract **RBAC → origin → rate-limit → validate → operation → audit → envelope**.

Errors reuse `adminError` only: `401 UNAUTHORIZED` · `403 FORBIDDEN` (no permission · non-corporate identity · Owner Gate · **Owner target**) · `404 NOT_FOUND` · `422 VALIDATION_ERROR` · `429 RATE_LIMITED` + `Retry-After` · `500 INTERNAL_ERROR` (generic message).

Limits (C10, unchanged): list `100/60s`, revoke `20/60s`, force-logout `10/60s`, keyed per admin.

Permissions to add to the C3 registry, with a `REGISTRY_VERSION` bump: `security.sessions.read` (admin + super_admin) · `security.sessions.revoke` (super_admin only).

## 7. SQL skeleton — **NOT a migration**

Deliberately not written to `supabase/migrations/`: it would be applied by a future operator, and its column list is unverified. The shape is fixed; the `‹…›` placeholders are what O-3 fills in.

```
fn_session_inventory(p_user_id uuid, p_limit int, p_cursor …) RETURNS TABLE(
  id, user_id, state, created_at, ‹last_refreshed_at›, ‹expires_at›, aal, client_class)
  -- SECURITY DEFINER · SET search_path = public, pg_temp
  -- WHERE u.is_anonymous = false      ← I-12
  -- explicit column projection only   ← I-5, ADR-021 loud failure
  -- REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT TO service_role

fn_session_revoke(p_session_id uuid) RETURNS int
  -- refuse when the target subject is the Platform Owner   ← I-4a
  -- no-op success on already-terminal rows                 ← I-6

fn_session_revoke_all(p_user_id uuid) RETURNS int
  -- ONE statement. Its READ COMMITTED snapshot IS the effect set.  ← §4.1, I-8
  -- no second pass, no application-tier select-then-revoke
```

## 8. What is deliberately absent

No migration, no route, no registry entry, no mirror table, no auth-path change, and no assumed value for O-1, O-2 or O-3. The contract's source table still marks rows 13 and 14 as blocked, and that is accurate.
