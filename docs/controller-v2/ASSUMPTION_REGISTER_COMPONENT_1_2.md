# Deployment Assumption Register — Controller V2 Components 1 & 2

**Date:** 2026-08-03 · **Branch:** `feat/controller-v2-foundation`
**Trigger:** owner decision to make the migration self-contained (A1) and to keep the PostgREST reload in the runbook (A2), followed by a full sweep for remaining implicit assumptions.

**Resolution key:** `MIGRATION` = moved into the migration · `RUNBOOK` = documented + verified during deployment · `CI` = should be validated automatically · `ELIMINATED` = proven by evidence, no longer an assumption · `ACCEPTED` = real, documented, deliberately left as-is.

---

## 1. Changes made in this review

### A1 — `EXECUTE` on the three functions · **RESOLVED → MIGRATION**

`20260803_platform_owner.sql` §5 now grants explicitly:

```sql
GRANT EXECUTE ON FUNCTION fn_is_platform_owner(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION fn_revoke_admin_role(UUID, UUID) TO service_role;
```

*Why it existed:* PostgreSQL grants `EXECUTE` to `PUBLIC` on new functions by default, so it worked — but implicitly, and inconsistently with six other migrations in this repository that grant explicitly.

### A4 — `SELECT` on `platform_owner` · **RESOLVED → MIGRATION** *(found during this sweep)*

```sql
GRANT SELECT ON platform_owner TO service_role;
```

*Why it existed:* Supabase's default privileges grant table access to `service_role` for new tables in `public`. Same class as A1, **worse failure mode**: the application reads this table directly (`owner.ts → .from('platform_owner')`), not through an RPC. A failed read degrades to "no owner assigned", and with `PLATFORM_OWNER_USER_ID` set the Owner Gate returns `ENV_SET_BUT_NO_OWNER` — **403 for the entire Controller**, not just role granting.

Deliberately **not** granted to `anon`/`authenticated`: the ownership record must never be client-readable.

### A2 — PostgREST schema cache · **RUNBOOK (per owner decision)**

`NOTIFY pgrst, 'reload schema';` stays in runbook Step 2.

*Why it exists:* `supabase.rpc()` serves from PostgREST's cached schema. A newly created function can return `PGRST202` until the cache reloads. `PGRST202` is not in the route's error map (`23505`/`42501`/`P0002`/`23514`), so it would surface as HTTP 500.

*Considered and rejected:* moving the `NOTIFY` into the migration would make it fully self-contained. **Owner instructed it stay in the runbook**, so it stays. Recorded here so the choice is visible rather than looking like an oversight.

### A4b — `platform_owner` must stay client-invisible · **RUNBOOK** *(new check)*

New Step 2 verification asserts `relrowsecurity = true` and `policy_count = 0`. A table grant does not widen client access while RLS is deny-by-default, but a future policy would — so it is now checked explicitly rather than assumed.

---

## 2. Remaining assumptions — full register

| # | Assumption | Class | Why it exists | Resolution | Where verified |
|---|---|---|---|---|---|
| A3 | `SECURITY DEFINER` functions are owned by `postgres` | DB permissions | The Supabase SQL editor runs as `postgres`; the functions inherit its rights on `admin_roles` | **RUNBOOK** | Step 2 asserts `prosecdef = true`; Step 4 live grant tests would expose a wrong owner immediately |
| A5 | `gen_random_uuid()` is available | Extension | Built into PostgreSQL ≥ 13; Supabase runs 15 | **ELIMINATED** — 24 migrations already use it and Phase 0 is live in production. Proven, not assumed | — |
| A6 | Phase 0 objects exist (`admin_role` enum, `admin_roles`, `profiles`) | Schema | The migration references all three | **RUNBOOK** | Step 1 Q4 (STOP if any NULL) |
| A7 | Exactly one active `super_admin` in production | Data | The bootstrap derives the Owner from it | **RUNBOOK — HARD STOP** | Step 1 Q1; the seed also re-checks and aborts itself |
| A8 | The Owner's `profiles` row exists | Schema/data | FK `platform_owner.user_id → profiles(id)` | **ELIMINATED** — satisfied transitively: `admin_roles.user_id` already FKs to `profiles`, so an existing `super_admin` proves the profile exists | — |
| A9 | `PLATFORM_OWNER_USER_ID` set in all three Vercel environments | Env var | The boot assertion is half of the two-factor ownership pin | **RUNBOOK** | Step 3; fails closed and loudly if wrong |
| A10 | Vercel env changes take effect only on the **next** deploy | Env var | Platform behaviour | **RUNBOOK** | Stated in Step 3; Step 4's deploy is what activates it |
| A11 | `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` are set and correct | Env var | Every admin route already depends on them | **ELIMINATED** — in production use today; unchanged by this PR | — |
| A12 | `NEXT_PUBLIC_SITE_URL` = `https://www.tappyai.com` | Env var | The same-origin guard compares against it | **ACCEPTED** — pre-existing, unchanged by this PR. Previously verified and corrected in production | — |
| A13 | No triggers fire on `admin_roles` writes | Trigger | `fn_revoke_admin_role` performs a `DELETE` | **ELIMINATED** — grepped all migrations; no trigger exists on `admin_roles` | — |
| A14 | No cron job or queue touches `admin_roles` / `platform_owner` | Cron/queue | `analytics-snapshot` is the only cron | **ELIMINATED** — verified it calls only the four analytics functions; no reference to either table. No queue system exists in the repo | — |
| A15 | The deferred hardening is **not** applied | DB permissions | `service_role` must retain write on `admin_roles` until end of Foundation | **RUNBOOK** | Step 1 Q5 records the baseline; gate item 18 re-confirms |
| A16 | Merging triggers the production deploy | Deployment | Vercel is wired to `main` | **RUNBOOK + GATE** — this is R7 | Deployment Gate; recommended label `do-not-merge-until-gated` |
| A17 | The 60s principal cache means revocation lags up to 60s | Runtime | Pre-existing ADR-003 behaviour | **ACCEPTED** — unchanged by this PR; `invalidateRoleCache` is called on every grant/revoke | — |

---

## 3. Assumptions that are FALSE — recorded so nobody relies on them

| # | Belief | Reality |
|---|---|---|
| F1 | `BACKOFFICE_ENABLED=false` disables the Controller | **It does not.** The variable is read in exactly two places (`admin/settings/page.tsx`, `api/admin/settings/route.ts`) and only feeds a **displayed value**. It gates no route and no guard. There is no kill switch for `/admin` today. |
| F2 | CI verifies this PR | **It does not.** The only workflow is `architecture-guard.yml`, which runs the architecture check and brand validation. **`tsc`, `lint`, `vitest` and `build` are not run in CI** — the 535-test result is a local measurement. |

Neither is caused by this PR, and neither blocks it. Both are recorded because acting on either belief during deployment would be a mistake.

---

## 4. Recommendations (NOT actioned — outside this PR's scope)

| # | Recommendation | Rationale | Class |
|---|---|---|---|
| REC-1 | Add `tsc`, `lint`, `vitest` and `build` jobs to CI | F2 — the strongest evidence in the readiness report is currently produced by hand on one machine. A PR check would make it reproducible for reviewers | **CI** |
| REC-2 | Extend the architecture guard with a rule that fails when a migration creates a function without a matching `GRANT EXECUTE` | A1 was a convention violation no tool could catch. The guard is already rules-as-data, so this is a rule entry, not new machinery | **CI** |
| REC-3 | Make `BACKOFFICE_ENABLED` a real kill switch, or delete it | F1 — a flag that looks like a safety control but is not is worse than no flag | Backlog |
| REC-4 | Map `PGRST202` in the admin error handler | A2 is mitigated operationally, but a schema-cache miss at any future point still surfaces as an unexplained 500 | Backlog |

REC-1 and REC-2 are the two that would have prevented findings in this review from needing a human to spot them.

---

## 5. Post-change verification

Migration re-reviewed after the `GRANT` additions:

| Check | Result |
|---|---|
| Idempotent | ✅ `IF NOT EXISTS` / `CREATE OR REPLACE` / re-`GRANT` is a no-op |
| Self-contained | ✅ §5 grants every privilege the application needs; nothing depends on ambient defaults |
| Still purely additive | ✅ no `DROP`, no `REVOKE`, no `ALTER` of an existing object |
| Grants scoped correctly | ✅ `service_role` only — nothing granted to `anon`/`authenticated` |
| Deferred file consistent | ✅ repeats the three `GRANT EXECUTE` idempotently so it cannot revoke writes while leaving the replacement path uncallable; **`SELECT` on `platform_owner` explicitly retained** with a comment explaining that revoking it would 403 the whole Controller |
| Runbook updated | ✅ Step 2 verification now confirms A1, A4 and A4b, and issues the A2 reload |

Gates re-run after the change: **tsc clean · 535 tests / 60 files · lint 0 errors · architecture 7/7 · build exit 0 (121/121 pages)**.
