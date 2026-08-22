# Controller V2 — Break-Glass Owner Recovery (R6)

**Status:** ✅ **ACCEPTED AND IMPLEMENTED.** The §7 decisions were answered by Owner delegation on 2026-08-20 and are recorded in [**ADR-025**](../architecture/ADR-025-break-glass-owner-recovery.md). Migration `supabase/migrations/20260820_b8_owner_recovery.sql` is **written and tested, NOT applied to production** — that remains an explicit ADR-017 gate. · **Date:** 2026-08-20
**Authority:** [Owner Decision B8, 2026-08-19](STATUS.md#owner-decisions-2026-08-19-second-set--locked) — *"YES in principle — an Owner break-glass recovery procedure will exist (R6). **Design first**: threat model, recovery authority, DB + env authority, audit, failure modes, rollback → then ADR. No production mutation without separate authorization."*
**Risk being closed:** [`01_CONTROLLER_V2_ARCHITECTURE.md`](01_CONTROLLER_V2_ARCHITECTURE.md) §10 **R6 — Owner key loss = permanent lockout, severity Critical.** Its stated mitigation is *"a DB-level owner-reassignment procedure requiring both database and Vercel env access. This needs an owner decision before implementation."*

**No code, no migration, no production mutation.** This document is the design B8 asked for and nothing more.

---

## 1. What already exists — measured, not assumed

Recovery is **less unbuilt than R6 implies.** Four of its pieces shipped with Component 1 and were never described as recovery.

| Fact | Where | Why it matters here |
|---|---|---|
| `platform_owner.assigned_by TEXT` is documented as `'bootstrap' \| 'break_glass' \| the granting owner's uuid` | [`20260803_platform_owner.sql`](../../supabase/migrations/20260803_platform_owner.sql) §1 | **`break_glass` is a pre-declared value in the shipped schema.** This procedure is anticipated by Component 1, not invented here |
| `active BOOLEAN` + `revoked_at TIMESTAMPTZ` | same | Ownership transfer is *revoke the old row, insert a new one* — history is retained, never overwritten |
| `uq_platform_owner_single_active` — partial unique index on `active = true` | same | At most one active Owner, enforced by the **database**. A recovery script cannot accidentally create two, and a race cannot either |
| `user_id … REFERENCES profiles(id) ON DELETE RESTRICT` | same | Deleting the Owner's profile **fails loudly** rather than silently leaving the platform ownerless |
| The Owner Gate: env `PLATFORM_OWNER_USER_ID` must equal the active row, else the **whole Controller** answers 403 | [`owner.ts`](../../src/lib/admin/owner.ts) `checkOwnerGate` | This is the dual-control mechanism R6 asks for, **already enforced** — see §3 |
| The bootstrap seed: guarded, idempotent, self-asserting, aborts on ambiguity, derives rather than hardcodes | [`platform_owner_bootstrap.sql`](../../supabase/seed/platform_owner_bootstrap.sql) | The exact shape a recovery script should take. It is the precedent, not a new pattern — **with one fatal exception, §4** |

## 2. Threat model

The asset is **the Platform Owner principal** — the only principal that may grant or revoke `super_admin`, enforced in `fn_grant_admin_role` / `fn_revoke_admin_role`, not in application code.

| # | Threat | Today | After recovery exists |
|---|---|---|---|
| T1 | Owner credential lost (device loss, account lockout, departure) | 🔴 **Permanent lockout.** No `super_admin` can ever be granted or revoked again. This is R6 | Recoverable under §3 authority |
| T2 | Attacker with **database write only** reassigns ownership | Already mitigated: the env still names the old Owner ⇒ `ENV_MISMATCH` ⇒ **the entire Controller 403s.** The attacker denies service, gains nothing | Unchanged — recovery must not weaken this |
| T3 | Attacker with **Vercel env access only** | Already mitigated: env points at a user with no active row ⇒ `ENV_SET_BUT_NO_OWNER` ⇒ Controller 403s | Unchanged |
| T4 | Attacker with **both** DB and env | 🔴 Full compromise — and this is the authority the mitigation grants deliberately | Bounded only by audit and by how those two accesses are held |
| T5 | Recovery used as a **transfer** to seize ownership from a live Owner | n/a | 🔴 **Must be prevented or explicitly permitted** — §7 D2 |
| T6 | Recovery replayed later to re-take ownership | n/a | 🔴 **Must be bounded** — §7 D3 |
| T7 | Recovery executed with no trace | n/a | 🔴 Constitution Rule 7 *"Audit everything. No exceptions"* — §5 |

**T4 is not a defect of this design; it is its price.** Anyone holding both the production database and the deployment environment can already do anything. Recovery does not widen that; it makes the exercise of it *auditable and procedural* instead of impossible.

## 3. Recovery authority — DB **and** env, and the system already enforces it

R6's mitigation names the authority: *"requiring both database and Vercel env access."*

The load-bearing property is that **this is self-enforcing, not procedural.** `checkOwnerGate` is already deployed and `PLATFORM_OWNER_USER_ID` is already configured in Production, Preview and Development:

- Change the **database row only** → `ENV_MISMATCH` → whole Controller 403.
- Change the **env only** → `ENV_SET_BUT_NO_OWNER` → whole Controller 403.
- Change **both** → the new Owner is live.

A half-completed recovery therefore **fails closed and loudly**, which is the correct behaviour and needs no new mechanism. Recovery is a *two-key* operation because the gate already makes it one.

⚠️ **One asymmetry, stated because it bounds the guarantee.** `checkOwnerGate` is **inert when the env is unset** (`enforced: false`) — deliberate rollout semantics, documented in `owner.ts`. In a deployment with the variable unset, DB write alone is sufficient and T2 is not mitigated. Production has it set; any environment that does not is outside this guarantee.

## 4. 🔴 The obvious implementation is wrong — the bootstrap pattern cannot be reused

The natural move is to copy `platform_owner_bootstrap.sql`, which derives the Owner from *the sole active `super_admin`* and aborts unless the count is exactly 1.

**That is unsound for recovery, and the reason is specific to this deployment.** Production has **exactly one `super_admin`, and it is the Owner** — that is precisely why [BL-002](BACKLOG.md#bl-002--g1-production-validation) cannot be closed. So in the T1 scenario, deriving "the sole active super_admin" would re-assign ownership **to the very account whose credential was lost**. The script would report success and recover nothing.

Any recovery design that derives the new Owner from existing `admin_roles` state inherits this defect. **The new Owner must be named, not derived** — which is exactly what makes §7 D1 an Owner decision rather than an implementation detail.

## 5. Audit

Constitution **Rule 7** — *"Every administrative action must be recorded in the Audit Log. No exceptions."* — and **Rule 10**, immutability. A break-glass is the single most privileged action the platform admits, so it is the last one that may be silent.

Two records, both required, neither sufficient alone:

1. **`platform_owner` itself** — the revoked row keeps `revoked_at`; the new row carries `assigned_by = 'break_glass'` and a mandatory `notes` justification. This is *state*, and it survives even if the audit write fails.
2. **`audit_log`** — an entry written by the recovery transaction. It passes through the Component 7 hash-chain trigger like any other row, so a break-glass cannot be excised from the chain without detection.

The actor is a **human operating the database directly**, so there is no session `actor_id` to record. The audit row must therefore carry an explicitly non-user actor rather than fabricate one — recording a UUID that was not authenticated would make the trail lie. Exact shape is **§7 D4**.

## 6. Failure modes and rollback

| Failure | Behaviour required |
|---|---|
| Script runs, env change never made | Controller 403s for everyone (`ENV_MISMATCH`). **Recoverable**: set the env, or run rollback below |
| Env changed, script never run | Controller 403s (`ENV_SET_BUT_NO_OWNER`). **Recoverable**: revert the env |
| Script runs twice | The partial unique index makes a second *active* row impossible. Second run must be a **no-op**, not an error that tempts an operator to force it |
| Named recovery target has no `profiles` row | FK `RESTRICT` rejects the insert. Must **abort before** revoking the incumbent, or ownership is left empty |
| Audit write fails | 🔴 **Must abort the whole transaction.** This inverts the normal `writeAuditLog` rule — that one is fire-and-forget precisely so an audit failure cannot break a user action. Break-glass is the opposite: an unaudited ownership seizure is worse than a failed recovery |

**Rollback** is the same procedure run in reverse — revoke the break-glass row, re-activate the prior Owner (`active = true`, `revoked_at = NULL`), restore the env. It is available **only while the prior Owner's credential is usable**, which in the T1 scenario it is not. So rollback protects against a *mistaken* recovery, not against a *correct* one, and that limit must be stated to whoever runs it.

## 7. ✅ ANSWERED — Owner delegation, 2026-08-20

> The four below were the open questions. They were answered by delegation and implemented; **[ADR-025](../architecture/ADR-025-break-glass-owner-recovery.md) is the record**, and the original questions are kept intact rather than rewritten, because the reasoning for *why* each was undecidable is what justifies the answer.
>
> | | Answer as implemented |
> |---|---|
> | **D1** | Explicit `p_target_user_id` parameter. Validated: profile exists, and **not already the active Owner**. Deliberately **not** required to hold an admin role — that would reproduce the lockout |
> | **D2** | **Recovery-only.** Not verifiable in SQL; enforced by no-application-surface + mandatory stored justification + audit on every arm/cancel/execute |
> | **D3** | **One-time, 5–120 minute window**, consumed on execute; replay and expiry refused; at most one open window via a partial **unique** index. Required a new table — the window describes a *pending* recovery, not an owner, so it is not a column on `platform_owner` |
> | **D4** | All-zero UUID + `break-glass@system.invalid` + `actor_role = 'system'`, with operation/target/mechanism/correlation-id/reason/outcome. **Written inside the transaction, so a failed audit aborts the recovery** |

## 7a. The original questions, kept as the record of why they were undecidable

Four, and none can be guessed. §4 is why D1 is not a detail.

| ID | Decision | Why it cannot be derived |
|---|---|---|
| **D1** | **How is the new Owner named?** An explicit UUID supplied by the operator, or a second nominated account maintained in advance? | §4: deriving from `admin_roles` re-selects the lost account. Nothing in any approved document names a successor |
| **D2** | **May break-glass run while an active Owner exists** — is it recovery-only, or also a transfer? | Recovery-only is safer (closes T5) but leaves no procedure for a planned handover. Nothing states which |
| **D3** | **Is there a time bound or one-time semantics?** | B8's brief mentions *"short-lived recovery semantics **if contract supports it**"*. **No contract supports it**: the platform has no notion of a temporary Owner, and `platform_owner` has no expiry column. Adding one is a schema change. The honest default is *no time bound*, and D3 is whether that is accepted |
| **D4** | **What actor does the audit row record** for a human acting directly on the database? | There is no authenticated session. `audit_log.actor_id` is a UUID column; a sentinel value, a nullable column, or a text marker in `metadata` are three different answers, and one of them is a migration |

Two further items are **out of scope and named so they are not silently assumed**: hardware-token or multi-party approval (no authoritative source asks for either), and any change to `checkOwnerGate` (it already provides the dual control R6 specifies).

## 8. What happens after these answers

1. ADR recording the decision (Constitution §8.2 — a security procedure is a Design Change).
2. A guarded script under `supabase/recovery/`, following the bootstrap-seed discipline: self-asserting, abort-on-ambiguity, idempotent, **no hardcoded UUID**, audit-write inside the transaction.
3. RED tests for the invariants that are testable without production: single-active-owner, no-op on re-run, abort when the target has no profile, abort when the audit write fails.
4. A runbook, and an ADR-017-style authorization gate before it is ever executed.

~~**Nothing in step 2–4 is written until D1–D4 are answered.**~~ **All four steps are done** — [ADR-025](../architecture/ADR-025-break-glass-owner-recovery.md), the migration under `supabase/migrations/`, 43 assertions against real PostgreSQL 17.5 plus 7 source-boundary assertions, and the rollback script with its "STOP if any window was consumed" preflight.

The one step that remains is the last: **production application is an explicit Owner/deployment gate under the ADR-017 sequence** — preflight → review → authorization → apply → verify → rollback window. Nothing here has touched production.

The sentence that motivated the wait still holds, and is worth keeping: a recovery procedure built on a guess is worse than the lockout it exists to prevent — it would be the one procedure nobody rehearses and everybody trusts.
