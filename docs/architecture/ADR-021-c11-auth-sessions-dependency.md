# ADR-021 — Component 11 reads GoTrue's `auth.sessions`

**Status:** ⛔ **DRAFT — the dependency this ADR governs is NOT yet verified.**
**Date:** 2026-08-13 · **Component:** Controller V2 — C11 Session Security
**Contract:** [`11_COMPONENT11_SESSION_SECURITY_CONTRACT.md`](../controller-v2/11_COMPONENT11_SESSION_SECURITY_CONTRACT.md) §7, §20 (O-3), §22
**Supersedes nothing. Related:** [ADR-019](ADR-019-supabase-grant-model.md) (grant model), [ADR-020](ADR-020-repository-baseline-objects.md) (objects no migration creates)

> **This ADR may not be marked Accepted until O-3 is verified against a real GoTrue.** Its central factual claims — that `auth.sessions` exists here, which columns it carries, and that a `SECURITY DEFINER` function can read it — are exactly what verification establishes. Writing them down as decided before measuring them is the failure mode this project has already paid for twice.

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

**To be filled in from measurement, not from documentation.** The probe (`scripts/diagnostics/c11-session-revocation-probe.mjs`) prints the live column list and per-role reachability. Until it runs, this table stays empty on purpose:

| Column | Type | Used for | Verified |
|---|---|---|---|
| _(pending O-3)_ | | | ❌ |

The assumption set recorded here **is** the blast radius of a future Supabase upgrade. Anything not listed must not be read by C11.

## What happens when Supabase changes the schema

**The failure must be loud.** A dropped or renamed column must produce an error, never an empty result:

1. **Explicit projection.** The function selects named columns. A renamed column raises `42703 undefined_column` at execution — the endpoint 500s and the operator sees a failure, instead of an inventory that quietly returns nothing.
2. **No `SELECT *`, no dynamic SQL, no `COALESCE` over a missing column.** Each would convert a schema break into silence.
3. **A schema-assumption test** (see below) fails in CI before the change reaches an operator.

## How incompatibility is detected

A runtime test in the embedded-PostgreSQL harness cannot help here — `auth.sessions` is created by GoTrue, not by any migration, so the harness has no such table. Detection therefore has two layers, and the split must stay explicit:

| Layer | Where | Detects |
|---|---|---|
| **Structural + behavioural** | `supabase/tests/` (embedded PostgreSQL) | the C11 function's own logic against a *stand-in* table whose shape is declared by this ADR — proves the projection, the filters, the snapshot and the grants |
| **Schema-assumption** | the diagnostic probe, run against a real GoTrue | that the real `auth.sessions` still matches the assumption table above |

The first layer must never be described as proving the second. A stand-in table shaped by our own assumptions cannot detect that those assumptions became false — that is precisely the "fake GoTrue semantics" trap, and this ADR names it so nobody has to rediscover it.

## Consequences

- C11 gains a real inventory and a real forced logout.
- Controller V2 acquires a dependency on a schema it does not own. That is accepted here, deliberately, with the detection and loud-failure requirements above as the price.
- If O-3 shows the function cannot read `auth.sessions`, or that the readable columns cannot support a truthful inventory, this ADR is **rejected** and C11 falls back to Option C — with the contract updated to say so plainly.
