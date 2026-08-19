# ADR-022 — Account status lives in `account_status`, not on `profiles`

**Status:** Accepted
**Date:** 2026-08-19
**Context:** Controller V2 Phase 2 — Module 08 User Management
**Supersedes:** the `profiles` block of `docs/backoffice/04_Database_Architecture.md` §7, for these four fields only
**Related:** [ADR-019 Supabase grant model](ADR-019-supabase-grant-model.md) · [ADR-017 service-role hardening](ADR-017-service-role-hardening-strategy.md) · `add_billing_customers_isolation.sql` · `add_profiles_email_isolation.sql` · Owner Decision 2 (suspension must be real enforcement) · Owner authorization 2026-08-19 (Candidate C)

---

## Background

`04_Database_Architecture.md` §7 — the authoritative schema source under ERRATA-005 — specifies four account-status fields as additions to the existing `profiles` table:

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT;
```

§7 is headed *"Minimal modifications to existing tables. Only additions, never breaking changes."* The migration implementing it verbatim was prepared, held in `supabase/migrations/deferred/`, and never applied. A read-only production preflight blocked it.

## Problem statement

`profiles` is a **public-read, self-write** table. Measured on production 2026-08-19, not inferred:

| Layer | State |
|---|---|
| RLS | enabled |
| SELECT policies | `Public profiles are viewable by everyone` and `profiles_select` — both `{public}`, both `USING (true)` |
| UPDATE policies | `profiles_update` (`{authenticated}`, `USING`/`WITH CHECK id = auth.uid()`) and two more `{public}` own-row policies |
| Table grants | `anon`, `authenticated`, `service_role` each hold `SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE` |
| Column-level grants | none — `attacl` is empty on all 50 public tables |
| Triggers | `profiles_set_updated_at` only; it does not gate columns |

Live confirmation: an anon-key `GET /rest/v1/profiles?select=id,username,language` returned **HTTP 206, `content-range: 0-2/21`**.

**RLS filters rows. It does not filter columns.** Two consequences follow for any column placed on this table:

1. **`ban_reason` would be world-readable.** `?select=ban_reason` with the public anon key returns every moderator's free-text note.
2. **Suspension would be self-clearable.** `authenticated` holds table `UPDATE`; the policies restrict *which row*, never *which column*; no trigger compares old to new. A suspended user could `PATCH /rest/v1/profiles?id=eq.<own id>` with `{"is_suspended":false}`.

(2) inverts Owner Decision 2 — *"full user management suspension must be real enforcement, not an admin-only flag."* A flag its subject can clear is weaker than admin-only, not stronger.

## Why the fields cannot be repaired in place

**A column-level `REVOKE` against a table-level grant is silently inert.** Measured on PostgreSQL 17.5:

```
BASELINE   GRANT SELECT, UPDATE ON t TO anon
           has_column_privilege(anon, t, secret, SELECT) = true    attacl = NULL

REVOKE SELECT (secret) ON t FROM anon
           has_column_privilege(anon, t, secret, SELECT) = true    attacl = NULL
           -- no error, and no warning
```

The privilege is unchanged. This matters beyond this ADR: `add_profiles_email_isolation.sql` PART 1 writes exactly this statement for `profiles.email` and asserts in its comment that *"the anon role can no longer read the email column at all."* That assertion is false. No harm resulted — the statement is wrapped in a `DO` guard that found the column already dropped in production, so it never executed — but it is the ADR-019 failure class exactly: a remedy that reads correctly and does nothing.

The form that does work is to remove the table-level grant and re-grant an explicit column list. Measured in the same run, that produces `has_column_privilege = false` and `42501` for a real session — **and denies `SELECT *` outright**, because `*` expands to columns the role lacks. Eleven consumer call sites issue `profiles.select('*')` on the caller's own row (`src/app/page.tsx:16`, `src/app/profile/page.tsx`, `profile/account`, `profile/history`, `profile/settings`, `subscription`, `viet-content`, and four under `boi/`). Rewriting `profiles`' grants would break all of them.

That trade-off was already reached, and already rejected, inside this repository. `add_billing_customers_isolation.sql` states it plainly:

> *"RLS is row-level and cannot hide a single column, and a column-level REVOKE would break the app's many `profiles.select('*')` reads of the owner's own row. The clean fix is to move the only sensitive column out of the public table into a restricted one; the remaining profiles columns (username, full_name, avatar_url, counts, language, onboarded) are public-safe social data."*

## Decision

**The four Module 08 account-status fields live in a dedicated privileged table, `public.account_status`, keyed one-to-one on `profiles.id`. `public.profiles` is not altered.**

The fields themselves are unchanged — same four names, same types, same state machine (`10_User_Management.md` §4). Only their location changes. This is a deviation from `04` §7's *location*, not from its *content*.

Boundary, as implemented by `supabase/migrations/20260819_m08_account_status.sql`:

| Principal | Access |
|---|---|
| `anon` | none — no table privilege, no column privilege |
| `authenticated` | `SELECT` on `user_id`, `is_suspended`, `suspended_until`, `is_banned`, own row only, via RLS policy `account_status_select_own`. **No `ban_reason`. No write of any kind.** |
| `service_role` | full — the administrative write path (`19_Security.md` §4 Layer 3), reaching rows by `BYPASSRLS` rather than by policy |

Three properties are load-bearing:

- **The `REVOKE` is mandatory, not tidiness.** Production `pg_default_acl` for tables reads `anon=arwdDxtm/postgres  authenticated=arwdDxtm/postgres`, so a new table is **born fully open**. This is the table-level counterpart of ADR-019's finding for functions: on this platform, silence is not "closed". Without the `REVOKE`, `account_status` would reproduce the exact defect it exists to avoid.
- **`authenticated` self-read is deliberate.** It lets consumer enforcement keep using the existing user-scoped Supabase client instead of moving post/comment/chat onto `service_role`. Its cost is that `SELECT *` on this table fails for `authenticated`; readers name their columns.
- **Absent row means ACTIVE.** No backfill, no signup trigger. Consumer enforcement must `LEFT JOIN` and `COALESCE(..., false)`. An inner join silently drops every never-moderated user, so the suite pins that case.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Apply §7 as written | Creates both defects above. This is what the preflight blocked. |
| Column-level privilege redesign on `profiles` | The obvious form is inert (measured); the working form denies `SELECT *` and breaks 11 call sites. No precedent — zero of 50 production tables use a non-uniform column grant. |
| `BEFORE UPDATE` trigger comparing `OLD`/`NEW` | Closes self-mutation only. `ban_reason` disclosure needs a second mechanism, which lands back on column grants. Adds a per-row function to the hottest user table. |
| Security view over `profiles` | No precedent and no authority — production contains **zero** views. A new pattern invented to avoid a decision. |
| Move only `ban_reason` | Closes disclosure, leaves `is_suspended`/`is_banned` self-clearable. Owner Decision 2 still fails. |

## Consequences

**Positive.** The sensitive field is unreachable from any PostgREST role. Suspension cannot be cleared by its subject at the database layer, independently of whether the API layer is correct. `profiles` keeps its grants, its policies and its `select('*')` behaviour, so no consumer code changes. The shape matches a pattern already applied twice on this table and already verified in production.

**Costs.** Consumer enforcement reads a join rather than a column. One more table to reason about. `SELECT *` is unavailable to `authenticated` on `account_status`.

**Residual risk, stated rather than hidden.**

- The `33` §3 data classification of `ban_reason` is **still an open Owner decision**. It does not block this migration, because the field is exposed to no PostgREST role under either answer — but the access matrix in `04` §8 records it as open rather than guessing.
- `profiles` remains world-readable and self-writable for its existing ten columns. That predates this work and is untouched by it. `29_Database_Governance.md` §4 states *"No table is world-readable"*, which `profiles` already contravenes; closing that is a separate decision with its own blast radius.
- The static SQL grant guard (`check-sql-grants.mjs`) enforces ADR-019 for `SECURITY DEFINER` **functions**. No guard enforces table or column grants. This ADR is therefore held by its test suite (`supabase/tests/account_status_boundary.test.ts`, 28 assertions, 9 mutations killed), not by CI static analysis.
- A ban does not revoke sessions by virtue of a column. Session revocation is an Auth Admin API operation performed by the admin surface.

## What this ADR does NOT change

- **`public.profiles`** — no column, grant, policy, trigger or index. The migration contains no `ALTER TABLE profiles`, and the suite asserts it.
- **The four field names, types, defaults or semantics.** `10_User_Management.md` §4 stands unchanged.
- **Any other `04` §7 modification.** The `track_events` additions and §7A analytics structures are untouched.
- **`33` §3 classification of `ban_reason`** — deliberately not assigned here.
- **Consumer enforcement.** No route, no application code. Enforcement ships after the schema is safely deployed.
- **Cron architecture.** The expiry index is created; the job named by `10` §4 is not invented here.
