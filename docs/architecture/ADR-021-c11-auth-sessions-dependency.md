# ADR-021 — Component 11 reads GoTrue's `auth.sessions`

**Status:** ✅ **ACCEPTED — the dependency is measured, and Option A is implemented.**
**Date:** 2026-08-13 · **Component:** Controller V2 — C11 Session Security
**Contract:** [`11_COMPONENT11_SESSION_SECURITY_CONTRACT.md`](../controller-v2/11_COMPONENT11_SESSION_SECURITY_CONTRACT.md) §7, §20 (O-3), §22
**Supersedes nothing. Related:** [ADR-019](ADR-019-supabase-grant-model.md) (grant model), [ADR-020](ADR-020-repository-baseline-objects.md) (objects no migration creates)

> Measured 2026-08-14 against the staging project `nhncoqyadofojjrnpiia`, read-only, through the SQL editor. This ADR was deliberately left in DRAFT with an empty assumption table until that measurement existed.

## Context

C11 must answer *"which sessions exist for this user, and end them"*. The sessions are not ours: Supabase Auth (GoTrue) creates, refreshes and expires them, and stores them in the `auth` schema, which no migration in this repository creates.

**Measured (2026-08-13):** this repository contains **zero** references to `auth.sessions` or `auth.refresh_tokens` across `src/` and `supabase/`, while `auth.users` is referenced routinely as a foreign-key target. So this is genuinely new coupling, not an extension of an existing one.

## Decision

**Option A — a tightly scoped `SECURITY DEFINER` function reads `auth.sessions`** — ratified by the Owner on 2026-08-13, *subject to technical verification (O-3)*.

The application role never reads the auth schema directly. Every C11 read and write goes through a function that:

- is owned by the schema owner and runs as it, so `service_role` needs no privilege on `auth.sessions`;
- pins `SET search_path = public, pg_temp` (ADR-019 house rule; C8's three functions do the same);
- **projects only the contract-approved columns** (§16 of the contract) — never a token, a secret, an IP or a raw user-agent;
- filters `is_anonymous = false` (contract §6.1) and applies the Owner-target protection (§5.1.1);
- has `EXECUTE` revoked from `PUBLIC, anon, authenticated` and granted **only** to `service_role`, the role the app tier authenticates as.

## Alternatives rejected

### Option B — a C11-owned mirror table

Rejected, and the reason is not aesthetic: **nothing populates it truthfully.** GoTrue emits no hook this application receives, so a mirror would be written only when a session is created through a path we happen to observe. Every other path — token refresh, a native client, an OAuth callback, a session created while the app is down — leaves the mirror silently wrong.

An inventory that is *quietly incomplete* is worse than no inventory at all: an operator reads "2 sessions", revokes both, and believes the account is secured while a third session keeps working. A missing feature is visible; a lying feature is not.

### Option C — revocation only, no inventory

Rejected as insufficient rather than wrong. It is honest and small, and it delivers two of the three scope words ("revocation, forced logout") while dropping "session inventory". It remains the fallback **if and only if** O-3 shows `auth.sessions` cannot yield a truthful inventory here — in which case C11 ships without the listing rather than with a fabricated one.

## Assumptions about the upstream schema

Measured, not documented. `auth.sessions` carries **15 columns**; C11 depends on seven of them, plus `auth.users.is_anonymous`.

| Column | Type | C11 uses it for | Verified |
|---|---|---|---|
| `id` | uuid, NOT NULL | session identity | ✅ |
| `user_id` | uuid, NOT NULL | subject, and the revoke-all predicate | ✅ |
| `created_at` | timestamptz | inventory ordering + cursor | ✅ |
| `refreshed_at` | **timestamp WITHOUT time zone** | last activity — converted `AT TIME ZONE 'UTC'`, never reinterpreted | ✅ |
| `not_after` | timestamptz | active vs expired | ✅ |
| `aal` | `auth.aal_level` enum | assurance level, cast to text | ✅ |
| `user_agent` | text | **read only** to derive a three-valued platform class; never returned | ✅ |
| `auth.users.is_anonymous` | boolean | P-4 exclusion, on every read and write | ✅ |

**Deliberately never touched**, though present: `refresh_token_hmac_key` and `refresh_token_counter` (credential material), `ip` (personal data, withheld by P-6), and `updated_at`, `factor_id`, `tag`, `oauth_client_id`, `scopes` (outside the contract).

`refreshed_at` being the one naive timestamp in the table is the sort of detail that only measurement surfaces: returning it without conversion would silently shift "last activity" by the server's offset. A mutation covers it, and the runtime suite runs under a non-UTC session timezone so the mutation cannot pass by luck.

**Privilege evidence, measured the same day:**

| Role | `USAGE` on schema `auth` | `SELECT` on `auth.sessions` |
|---|---|---|
| `anon` | true | **false** |
| `authenticated` | true | **false** |
| `service_role` | true | **false** |

All three hold schema `USAGE` and none can read the table, which is precisely the shape Option A needs: the definer function is the only path, and it is not merely the *preferred* one.

**One thing the measurement changed.** GoTrue has no `revoked` column — revocation deletes the row. The contract's state machine is unaffected (§20.4 records why), but any implementation that expected to flag a row would have been wrong, and would have been written that way had this ADR been accepted before measuring.

The assumption set above **is** the blast radius of a future Supabase upgrade. Anything not listed must not be read by C11.

## What happens when Supabase changes the schema

**The failure must be loud.** A dropped or renamed column must produce an error, never an empty result:

1. **Explicit projection.** The function selects named columns. A renamed column raises `42703 undefined_column` at execution — the endpoint 500s and the operator sees a failure, instead of an inventory that quietly returns nothing.
2. **No `SELECT *`, no dynamic SQL, no `COALESCE` over a missing column.** Each would convert a schema break into silence.
3. **A schema-assumption test** (see below) fails in CI before the change reaches an operator.

## How incompatibility is detected

A runtime test in the embedded-PostgreSQL harness cannot help here — `auth.sessions` is created by GoTrue, not by any migration, so the harness has no such table. Detection therefore has two layers, and the split must stay explicit:

| Layer | Where | Detects |
|---|---|---|
| **Apply-time guard** | the migration's own `DO` block | a missing column **at the moment the migration is applied to a real GoTrue database**, raising `42703` and naming it. This is the mechanism that turns a Supabase upgrade into a loud failure rather than an empty inventory, and the runtime suite proves it by dropping a column and requiring the apply to fail |
| **Structural + behavioural** | `supabase/tests/c11_session_security.test.ts` (embedded PostgreSQL) | the C11 functions' own logic against a *stand-in* table built from the measured shape — the projection, the filters, the snapshot, the grants |
| **Schema-assumption** | the diagnostic probe, run against a real GoTrue | that the real `auth.sessions` still matches the assumption table above |

The first layer must never be described as proving the second. A stand-in table shaped by our own assumptions cannot detect that those assumptions became false — that is precisely the "fake GoTrue semantics" trap, and this ADR names it so nobody has to rediscover it.

## Consequences

- C11 gains a real inventory and a real forced logout.
- Controller V2 acquires a dependency on a schema it does not own. That is accepted here, deliberately, with the detection and loud-failure requirements above as the price.
- If O-3 shows the function cannot read `auth.sessions`, or that the readable columns cannot support a truthful inventory, this ADR is **rejected** and C11 falls back to Option C — with the contract updated to say so plainly.
