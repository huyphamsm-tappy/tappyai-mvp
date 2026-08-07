# ADR-019 — The Supabase grant model for SECURITY DEFINER functions

**Status:** Accepted
**Date:** 2026-08-07
**Context:** Platform Hardening Phase 0 (platform infrastructure, not a Controller component)
**Supersedes:** nothing
**Related:** F-04 (PR #18, merge `97dd378`) · [ADR-017 service-role hardening strategy](ADR-017-service-role-hardening-strategy.md) · BL-C7-01

---

## Background

Controller V2 Component 7 added a tamper-evident hash chain over `audit_log`. Its
migration created five functions, four of which compute or verify hashes and
have no external consumer. Section 7 of that migration revoked EXECUTE from
`PUBLIC` and granted it to `service_role`, following the pattern in
`20260711_anon_chat_usage.sql`.

The migration passed three review passes, 101 tests against a real PostgreSQL,
and a production rollout verified section by section. The verifier was still
callable by `anon`, unauthenticated, over HTTPS.

## Problem statement

On Supabase, `REVOKE ... FROM PUBLIC` does not make a function unreachable by
`anon`. It removes one of two independent grants, and the one it leaves behind
is the one that matters.

An ACL that looks correct is the failure mode: after the revoke, `proacl` no
longer contained the PUBLIC entry, so every artefact a reviewer would normally
inspect — the migration text, the ACL, the test suite — agreed that the function
was closed. It was not.

## Production evidence from F-04

All of the following was measured on the production project, not inferred.

**The hole, before the hotfix:**

```
SET ROLE anon;
SELECT * FROM fn_verify_audit_chain();
-- returned rows; no permission error
```

```
POST /rest/v1/rpc/fn_verify_audit_chain   (public anon key, over HTTPS)
-- 200
```

RLS denied the same `anon` a plain `SELECT` on `audit_log` at that moment. The
function is `SECURITY DEFINER`, so it executed as the owner and returned data
straight past the deny-by-default design it was written to protect.

**The cause, read from the catalogue:**

```sql
SELECT pg_get_userbyid(d.defaclrole) || ' => ' || array_to_string(d.defaclacl,'  ')
FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public' AND d.defaclobjtype = 'f';
```
```
postgres => postgres=X/postgres  anon=X/postgres  authenticated=X/postgres  service_role=X/postgres
```

**The natural experiment inside one migration.** `fn_audit_log_chain` was
deliberately not revoked; the other four were. After the revoke:

| Function | Revoked from PUBLIC | `=X/` (PUBLIC) present | `anon=X/postgres` present |
|---|---|---|---|
| `fn_audit_log_chain` | no | **yes** | yes |
| `fn_verify_audit_chain` | yes | **no** | **yes** |
| `fn_audit_part` / `fn_audit_ts` / `fn_audit_row_hash` | yes | **no** | **yes** |

The `REVOKE` executed exactly as written. It named the wrong grantee for this
platform.

**The positive control, already in this repository.**
`add_gatea_db_hardening.sql:12` writes
`REVOKE EXECUTE ON FUNCTION public.increment_review_view(uuid) FROM anon, public;`
— naming `anon` explicitly. Measured across a sample of eight SECURITY DEFINER
functions, it was the only one with `anon_exec = false`. Same database, same
owner, same SECURITY DEFINER. The only difference was whether the statement
named `anon`.

**After the hotfix:** `anon` RPC over HTTPS returns `401 permission denied`;
`service_role` returns `200` and the verifier reports a clean chain.

## Why `REVOKE ... FROM PUBLIC` is insufficient on Supabase

A newly created function in schema `public` on this platform carries **two
independent grants**:

| Source | ACL entry | Removed by `REVOKE ... FROM PUBLIC` |
|---|---|---|
| PostgreSQL's own default for `PUBLIC` | `=X/postgres` | **yes** |
| Supabase `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role` | `anon=X/postgres`, `authenticated=X/postgres` | **no** |

`anon` and `authenticated` are members of `PUBLIC`, so before any revoke they can
reach the function by either route. Removing only the first leaves the second
intact and the function reachable.

## PostgreSQL default EXECUTE vs. an explicit materialised ACL

This distinction is not academic; getting it wrong produced a second defect
during the F-04 fix, in the guard written to prevent the first.

- A function whose `proacl` is **`NULL`** carries PostgreSQL's *built-in*
  default. Under that default `PUBLIC` holds EXECUTE, and every role is a member
  of `PUBLIC`.
- `ALTER DEFAULT PRIVILEGES` does not create a rule consulted at call time. It
  **materialises explicit ACL entries at CREATE time**. A function created while
  it is in force has a non-`NULL` `proacl` containing `anon=X/postgres`.

The consequence for verification:

> **`has_function_privilege('anon', f, 'EXECUTE')` cannot distinguish the two
> cases.** For a `proacl = NULL` function it returns `true` via the PUBLIC
> fallback, whether or not Supabase's default privileges were ever in force.

Measured during the F-04 freeze review, on the un-revoked trigger function:

```
chain_acl : null
anon_holds: true
```

Therefore:

- To ask **"can this role call it?"** — use `has_function_privilege`.
- To ask **"were the platform's default privileges in force when this was
  created?"** — read `proacl` and look for an explicit `anon=X` entry.

These are different questions and they require different instruments. Using the
first for the second yields an assertion that passes unconditionally.

`EXECUTE` is also the only privilege type PostgreSQL defines for a routine.
Measured with `aclexplode` over the four Component 7 functions: eight grants,
every one `privilege_type = EXECUTE, is_grantable = false`. `REVOKE ALL` and
`REVOKE EXECUTE` are therefore equivalent today; `EXECUTE` is preferred because
it states the intent and cannot silently widen if a future PostgreSQL adds
another routine privilege.

## Decision

**On this platform, a `SECURITY DEFINER` function in schema `public` is reachable
by `anon` and `authenticated` unless a statement names them. Silence means open.**

The canonical form is:

```sql
REVOKE EXECUTE ON FUNCTION <signature> FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION <signature> TO <only the roles that genuinely call it>;
```

`PUBLIC` remains in the list because it is a genuinely separate grantee — it is
what closes the hole on a plain PostgreSQL instance. Naming it is completeness,
not portability: these statements require the roles `anon`, `authenticated` and
`service_role` to exist, and `REVOKE ... FROM <missing role>` raises `42704`.
That is intended. Ten migrations in this repository already reference these roles
unconditionally and none guards for their existence.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Keep `REVOKE ... FROM PUBLIC` only | Measured insufficient. This is the defect. |
| Narrow `pg_default_acl` at the project level | Changes every past and future function at once; the impact was never measured; would silently close functions that are intentionally open to `anon`. A separate decision with its own gate. |
| Guard role existence with a `DO` block that skips when a role is absent | A guard that skips silently produces a migration that "succeeds" while revoking nothing — the same class of defect wearing a better disguise. The repository baseline is unconditional reference; this would be the sole exception. |
| Rewrite all legacy migrations to the new form | Rewriting history does not change runtime privileges, and it is a large diff over files unrelated to the work at hand. Superseded by the legacy transition policy below. |
| Extend `scripts/architecture/check.mjs` | That guard walks `src/` only (`SRC = join(ROOT,'src')`) and its rules are content regexes over source files. Grant analysis needs statement-level pairing inside SQL. Bending a working engine to a different shape. |
| Rely on a periodic runtime privilege audit instead of a static guard | Would catch more (see Consequences), but does not prevent a bad migration from merging. Not proposed here; recorded as residual. |

## Consequences

**Positive.** The rule is stated once and enforced mechanically rather than
remembered. New SECURITY DEFINER functions cannot reach production with an
unintended `anon` grant without a reviewer explicitly recording that intent.

**Costs.** Migrations become platform-specific: they will not apply to a
PostgreSQL instance lacking the three Supabase roles. Authors must name grantees
explicitly even when the function is obviously internal.

**Residual risk, stated rather than hidden.** A static guard reads files, not the
database. Re-running a legacy migration that **drops and recreates** a function
resets its ACL to the platform default and silently restores the `anon` grant;
the guard will not flag it, because the file did not change. (`CREATE OR REPLACE`
preserves an existing ACL and is therefore safe — documented PostgreSQL
behaviour, not measured in the session that produced this ADR.) Closing this
requires a runtime privilege audit, which is out of scope here.

## Migration policy

- Canonical form as in **Decision**.
- Every migration must be correct when **applied section by section**. This
  project applies SQL to production by hand in the Supabase SQL editor; "the
  migration is atomic" is an assumption the deployment method does not grant.
- Every `.sql` file must run against a real PostgreSQL before it is called
  verified. `tsc`, lint, the architecture guard and the build do **not** execute
  SQL.
- Every migration ships with a rollback file beside it, written in advance.

## SECURITY DEFINER policy

- `SECURITY DEFINER` means **bypasses RLS**. Treat such a function as a public
  endpoint until its grants prove otherwise.
- `search_path` must be pinned (`SET search_path = public, pg_temp`).
- **Trigger functions are not revoked.** A direct call raises *"trigger functions
  can only be called as triggers"* regardless of privilege, so a `REVOKE` there
  is a no-op that implies a hole existed.
- A function returning a boolean about a privileged principal is an
  **enumeration oracle** and is closed by default.

## CI policy — temporal enforcement

Enforcement is **not retroactive**. A dedicated guard,
`scripts/architecture/check-sql-grants.mjs`, scans `supabase/migrations/**.sql`
and classifies each file:

| Severity | Applies to | Behaviour |
|---|---|---|
| **ERROR** | a migration **created or modified** in the current changeset | blocks CI |
| **INFO** | a historical migration, **unchanged** in the current changeset | reported, does not block |

A legacy file becomes ERROR **the moment someone touches it**: editing a line in
an old migration is accepting it into the current standard. That is the mechanism
by which the debt retires without a mass rewrite.

Base-ref resolution: `PH0_GUARD_BASE_REF` → `origin/main` → **fail if neither
resolves.** A guard that defaults to "nothing to check" is an inert guard, and
this project has shipped one before.

Two allowlists, kept strictly separate:

- **`INTENTIONAL_ANON`** — functions deliberately callable by `anon`, each with a
  reason.
- **`LEGACY_UNCOMPLIANT`** — files predating this ADR, each with a date.

A legacy file must **never** be recorded in `INTENTIONAL_ANON`. Doing so writes a
false statement into the guard. The size of `LEGACY_UNCOMPLIANT` is a ratchet: it
may shrink, never grow.

Any violation planted to prove a rule goes RED must be planted in a file that is
part of the changeset. Planting it in a historical file produces INFO and proves
nothing.

## Legacy transition policy

Migrations predating this ADR are **legacy artefacts**. They are reported, not
rewritten, and they do not block unrelated work. Measured at the time of writing:
18 migration files create a `SECURITY DEFINER` function and at most 4 contain a
`REVOKE` naming `anon`.

A legacy function may be brought into compliance by a **later hardening
migration** that names it. That is a valid form of declaration, not an exception
to the policy.

## Repository policy

- Every `SECURITY DEFINER` function in `public` declares its callable roles
  **explicitly**.
- **Effective date:** mandatory for every migration created after this ADR and
  every migration modified by a PR. Earlier files fall under the legacy
  transition policy.
- **Where the declaration lives:** for a new migration, in the same file that
  creates the function. For a legacy function, in a later hardening migration
  that names it.
- Silence is not "closed". On this platform silence is "open to `anon` and
  `authenticated`".
- A function intentionally open to `anon` carries a comment stating why, and an
  entry in `INTENTIONAL_ANON`.
- Never author code, regex, SQL or markdown through a bash heredoc or `node -e`.
  Escapes, `$` and backticks are consumed silently; six corruptions are on
  record, one of which shipped a CI rule inert while CI reported 8/8 over a live
  violation.

## Engineering principle

> **Never encode platform assumptions inside a test. Encode them in the harness.**

F-04 survived three review passes and 101 tests because of two lines inside one
`describe` block, which created the suite's own `anon` with nothing but
`GRANT USAGE ON SCHEMA public`. That is a statement about Supabase, written
inside the tests that depended on it, and it was wrong.

A test that defines its own platform can make itself green by defining a platform
where it is green. Every assertion in that block inherited the false premise and
passed against a platform that does not exist — including one asserting that
`PUBLIC` held no EXECUTE, which was **true on production while the hole was
open**.

Platform facts — which roles exist, what default privileges apply, RLS defaults,
the identity a test runs as — belong in the shared harness, where a correction
reaches every test at once and where the assumption is reviewable as
infrastructure rather than invisible inside a `beforeEach`.

## Relationship to F-04 and PH-0

- **F-04** was the single-component instance: Component 7's four functions,
  hotfixed on production and then synchronised into source by PR #18
  (`97dd378`). F-04 is closed.
- **Platform Hardening Phase 0** is the platform-wide response: it applies this
  ADR to the six SECURITY DEFINER functions measured as accidentally reachable by
  `anon`, and installs the CI guard that stops the class of defect from
  recurring. PH-0 is **platform infrastructure, not a Controller component**, and
  carries no component number.
- This ADR is PH-0 deliverable **D1**. The migration (D2), rollback (D3), CI
  guard (D4), harness change (D5) and tests (D6) implement it.

## What this ADR does NOT change

- **No application behaviour.** No TypeScript, no route, no environment
  variable, no API contract.
- **No schema.** No table, column, constraint, index, sequence or trigger.
- **No RLS.** No policy is added, altered or removed.
- **No function logic.** Only who may call a function, never what it does.
- **`pg_default_acl` is not modified.** The platform default stands; this ADR
  governs what migrations do in its presence.
- **The four functions intentionally open to `anon`** — `increment_deal_click`,
  `music_increment_play`, `music_saved_count`, `music_followed_count` — keep
  their grants. This ADR makes that intent explicit; it does not reverse it.
- **Trigger functions are not revoked.**
- **Component 1 behaviour is unchanged.** `fn_grant_admin_role` and
  `fn_revoke_admin_role` continue to raise `42501` for a non-Owner actor. Only
  their reachability narrows.
- **Legacy migrations are not rewritten.**
- **ADR-017's deferred service-role hardening** remains a separate item under its
  own gate.
- **BL-C7-01 is not closed by this ADR.** It is the backlog entry PH-0's
  migration acts on.
