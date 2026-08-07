# Component 7 — Audit Hardening: Architecture Audit & Design

**Branch:** `feat/controller-v2-component7-audit-chain` @ `e8d4eb9` (`origin/main`, 0 behind)
**Status:** Phase A + B — **no code written**
**Scope:** protect the integrity of `audit_log`. Not a redesign, not an event bus, not observability.

---

# PHASE A — Architecture Audit

## A1. Current schema

`supabase/migrations/20260713_backoffice_phase0.sql:54`

```sql
CREATE TABLE IF NOT EXISTS audit_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id      UUID NOT NULL,
    actor_email   TEXT NOT NULL,
    actor_role    TEXT NOT NULL,
    action        TEXT NOT NULL,
    target_type   TEXT,
    target_id     TEXT,
    before_state  JSONB,
    after_state   JSONB,
    metadata      JSONB,
    ip_address    INET,
    user_agent    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Four indexes, all `(…, created_at DESC)`. No unique constraint other than the
primary key. No sequence. No hash column.

## A2. Write path

One insert point, six callers.

| | |
|---|---|
| Insert | `src/lib/admin/audit.ts:54` — `supabase.from('audit_log').insert({…})` |
| Client | `createAdminClient()` — **service role**, bypasses RLS |
| Callers | `deals` POST · `deals/[id]` PATCH · `deals/[id]` DELETE · `rbac/roles` POST · `rbac/roles/[id]` DELETE · `permissions/decisionAudit.ts` |

**The write is fire-and-forget** (`void (async () => …)`, `audit.ts:51`). Callers
never await it, and a failed insert is swallowed so it cannot break the
operation being audited.

## A3. Read path

`src/app/api/admin/audit/route.ts`

- Gated by `requirePermission(AUDIT_LOG_READ)` + rate limit 100/60s.
- Selects a **subset** of columns: `id, actor_id, actor_email, actor_role,
  action, target_type, target_id, metadata, created_at`.
  **`before_state`, `after_state`, `ip_address` and `user_agent` are never
  returned** by the API — they are written but not readable through any UI.
- Filters: `actor_id`, `action`, `target_type`, `target_id`.
- Order: `created_at DESC`. Cursor: `.lt('created_at', before)`.
- UI: `AuditViewer.tsx` — free-text action filter, actor filter, table.

## A4. Retention

**Declared but not implemented.**

`settings/route.ts:27` reports `audit_log_retention_days` from
`AUDIT_LOG_RETENTION_DAYS ?? 365` and the Controller displays it. Nothing reads
that value to delete anything: no cron route references `audit_log`, and the
eight cron jobs that exist touch analytics, notifications and reminders only.

The setting is currently a **promise the system does not keep**. Fixing that is
not Component 7's scope, but the chain design must not assume rows are never
pruned — see §B7.

## A5. Integrity guarantees — the central finding

The migration states, twice:

> *"audit_log is INSERT-only with no UPDATE/DELETE path (ADR-007)"*
> *"audit_log therefore has no UPDATE/DELETE path anywhere (ADR-007 immutability)"*

**That guarantee does not exist at the database level.** It rests entirely on
two facts that are not enforcement:

1. `ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY` with **no policies** —
   which denies `anon` and `authenticated`, and
2. the observation that no application code currently issues an `UPDATE` or
   `DELETE`.

But every audit write goes through the **service-role** client, and
`service_role` **bypasses RLS entirely**. There is no `REVOKE`, no rule, no
trigger, and no constraint stopping an `UPDATE audit_log SET …` or
`DELETE FROM audit_log` issued with that key.

Verified: no `GRANT`/`REVOKE`/`POLICY` statement mentions `audit_log` anywhere
in `supabase/migrations/`; the deferred hardening file
(`FOUNDATION_END_service_role_hardening.sql`) does not mention it either.

So today's guarantee is **"nothing writes those statements"**, not
**"those statements cannot succeed"**. For an audit log, those are very
different claims — and the stronger one is written in the migration.

## A6. Ordering guarantees

**There is no total order.**

- `created_at` is `TIMESTAMPTZ DEFAULT NOW()`. In PostgreSQL `now()` is the
  **transaction start time**, so two rows written in the same transaction share
  it exactly; two concurrent transactions can also collide at microsecond
  resolution.
- `id` is a random UUIDv4 — no ordering information at all.
- The read cursor is `created_at < before` (strict). Rows sharing a boundary
  timestamp can therefore be **skipped** across a page boundary.

A hash chain needs a deterministic total order. The table does not currently
have one, and this is the single hardest constraint on the design.

## A7. Replay risk

Low but real. Nothing in the schema is unique per logical event:
`(actor_id, action, target_id, created_at)` can legitimately repeat, so a
replayed insert is indistinguishable from a genuine repeat action. There is no
idempotency key. Component 7 does not need to solve replay — a chain makes
*insertion of a forged row* detectable, which is the property actually asked
for — but it should not make replay harder to detect either.

## A8. Deletion risk

**High, and currently undetectable.** With the service-role key, `DELETE FROM
audit_log WHERE id = …` succeeds and leaves no trace: no row count is recorded
anywhere, `id` is random so gaps are invisible, and `created_at` gaps are
indistinguishable from quiet periods. Deleting the row that records your own
action is the obvious attack, and today it works perfectly.

## A9. Modification risk

**High, and currently undetectable.** `UPDATE audit_log SET actor_id = <someone
else> WHERE id = …` succeeds. Nothing recomputes or compares anything.

## A10. Concurrency

Writes are concurrent by construction:

- fire-and-forget, so ordering between two writes in one request is not
  guaranteed;
- **one request can produce two rows** — an Owner granting a role emits
  `owner.override` from `decisionAudit` *and* `rbac.role_granted` from the
  handler;
- serverless means multiple instances insert simultaneously.

Any chain that computes "previous hash" in application code will fork under
this. That rules out the obvious implementation.

---

# PHASE B — Design

## B1. Threat model

| # | Threat | Actor | Today | After |
|---|---|---|---|---|
| **T1** | Delete a row to hide an action | anyone with the service-role key | undetectable | **detected** — chain break at the gap |
| **T2** | Modify a row (change actor, action, target) | same | undetectable | **detected** — row hash mismatch |
| **T3** | Insert a backdated row | same | undetectable | **detected** — cannot produce a valid hash without rewriting every later row |
| **T4** | Truncate the tail (delete the last N rows) | same | undetectable | **detected only if a checkpoint exists** — see §B6 |
| **T5** | Rewrite the whole table consistently | same | undetectable | **not detected by the chain alone** — requires an external anchor (§B6) |
| **T6** | Suppress a write (never insert) | application-level attacker | undetectable | **still undetectable** — out of scope; a chain proves what *is* there, not what *should* be |

**Explicitly out of scope:** T6, and preventing the attacks. This component makes
tampering **evident**, not impossible. Prevention is a credential and
grant-management problem (§B8), and the deferred `service_role` hardening is
where it belongs.

**Who is the adversary?** Realistically: a compromised service-role key, or a
future code path that deletes rows "to clean up". Not the Platform Owner —
though the design deliberately does not exempt them, because an audit log that
its most privileged user can silently edit is the situation the architecture
already calls *"worthless"*.

## B2. The ordering problem, and how the chain resolves it

Add a `BIGSERIAL` column. It gives:

- a **deterministic total order** independent of clocks,
- **gap visibility** — a deleted row leaves a hole in the sequence,
- a stable chain predecessor (`seq - 1` semantics without relying on timestamps).

A sequence gap alone is *not* proof of deletion (a rolled-back transaction also
burns a number), so a gap is a signal to investigate, not a verdict. The hash
chain is what turns it into proof.

## B3. Chain algorithm

Two new columns plus the sequence:

```
seq        BIGSERIAL        -- total order, UNIQUE
row_hash   BYTEA NOT NULL   -- sha256 of this row's canonical form + prev_hash
prev_hash  BYTEA            -- row_hash of seq-1; NULL only for the genesis row
```

```
row_hash = sha256(
    coalesce(prev_hash, '\x00'::bytea)
 || seq
 || actor_id || actor_email || actor_role
 || action
 || coalesce(target_type,'') || coalesce(target_id,'')
 || coalesce(before_state::text,'') || coalesce(after_state::text,'')
 || coalesce(metadata::text,'')
 || coalesce(ip_address::text,'') || coalesce(user_agent,'')
 || created_at
)
```

**Every column is covered**, including the four the read API never returns —
otherwise `before_state` could be rewritten undetectably, which is exactly the
field an attacker would target.

**Computed by a `BEFORE INSERT` trigger, not by the application.** This is the
load-bearing decision:

- The application API does not change at all. `writeAuditLog` keeps its exact
  signature and its fire-and-forget behaviour. Zero call-site changes across all
  six writers.
- The chain cannot be forged from the application layer, because the application
  never supplies the hash.
- Concurrency is handled where the serialization actually exists — inside the
  transaction, under `pg_advisory_xact_lock` on a fixed key, so two concurrent
  inserts cannot both read the same tail.

Contention is acceptable: audit volume is administrative actions plus throttled
denials — orders of magnitude below where a single advisory lock matters.

**JSONB canonicalisation caveat.** `jsonb::text` is stable for a given stored
value (PostgreSQL normalises key order on input), so hashing `metadata::text` is
deterministic. This must be asserted by test rather than assumed, because the
whole chain rests on it.

## B4. Verification

A `SECURITY DEFINER` function with a pinned `search_path`, following the pattern
Component 1 already established for `fn_grant_admin_role`:

```
fn_verify_audit_chain(p_from bigint DEFAULT NULL, p_to bigint DEFAULT NULL)
  → TABLE(seq bigint, id uuid, problem text)
```

Reports, per row: `hash_mismatch` (row was modified), `prev_mismatch` (a
predecessor changed or vanished), `sequence_gap` (a row is missing). Empty result
means the range verifies.

Range parameters exist so verification stays cheap as the table grows — the
Controller can verify the recent window on demand and the full chain on a
schedule.

**No new API surface in Component 7.** The function is callable from SQL and, if
the Owner wants it, from a later Controller screen. Adding a route now would be
scope creep, and there is no consumer for it yet — the rule that has bitten this
project four times.

## B5. Migration strategy

One migration, idempotent, in four steps:

1. `ALTER TABLE audit_log ADD COLUMN seq BIGSERIAL` — backfills existing rows in
   physical order.
2. `ADD COLUMN prev_hash BYTEA`, `ADD COLUMN row_hash BYTEA` — nullable at first.
3. **Backfill** existing rows in `seq` order, computing the chain from a genesis
   of `NULL`. Production currently holds **2 rows**, so this is instant; the
   backfill is still written to be resumable for safety.
4. `ALTER COLUMN row_hash SET NOT NULL`, add the `BEFORE INSERT` trigger, add
   `UNIQUE(seq)`.

**Backward compatibility:** all three columns are additive. The read API selects
an explicit column list that does not include them, so `/api/admin/audit` and
`AuditViewer` are byte-for-byte unaffected. Existing queries, filters, cursor
pagination and every audit action string keep working unchanged.

**The chain starts at the current tail.** The two existing production rows get
hashes, but their pre-migration contents cannot be proven — nothing recorded them
before now. That is inherent and must be stated: **the chain proves integrity
from the migration forward, not retroactively.**

## B6. What the chain cannot do, and the checkpoint that closes it

A chain verifies internal consistency. An attacker who rewrites **every** row
from a point onward produces a chain that verifies perfectly (T5), and one who
deletes the **tail** removes the evidence of its own removal (T4).

Closing those requires an anchor outside the table: periodically record
`(max_seq, row_hash)` somewhere the service-role key cannot reach — an external
log, a separate database, or an operator-held note.

**Recommendation: not in Component 7.** The chain is the prerequisite; the anchor
is a separate operational decision about *where* trust lives, and it has no
consumer until someone commits to running the checkpoint. Stated here so the
residual risk is explicit rather than implied-solved.

## B7. Interaction with retention

If `audit_log_retention_days` is ever enforced (A4 — it is not today), naive
deletion of old rows **breaks the chain at the prune boundary**, and verification
would report it as tampering.

Any future retention implementation must either verify-then-prune-then-record a
checkpoint at the new head, or prune only whole verified prefixes. Recorded here
so it is a known constraint rather than a surprise incident.

## B8. Rollback strategy

The migration is additive, so rollback is genuinely cheap:

1. `DROP TRIGGER` — inserts immediately return to today's behaviour. The
   application never knew the trigger existed, so nothing else changes.
2. Optionally `DROP FUNCTION fn_verify_audit_chain`.
3. The three columns can be left in place indefinitely; they are nullable-safe
   for readers and no code selects them.

**No application rollback is needed at all** — Component 7 changes no
TypeScript on the write or read path. That is the main argument for the trigger
design over an application-computed chain.

Rollback triggers: any insert failure on `audit_log` in production, or a
measurable latency regression on admin mutations.

---

# PHASE C — Estimated implementation risk

| Area | Risk | Why |
|---|---|---|
| **Application code** | **very low** | None changes. `writeAuditLog` signature, behaviour and all six call sites are untouched. |
| **Read path / UI** | **very low** | Additive columns; the API selects an explicit list that excludes them. |
| **Migration** | **medium** | First Component 7 migration; adds a `BIGSERIAL` to a live table. Production has **2 rows**, so the backfill is trivial — but this is the first schema change since Component 1, and Component 1's seed shipped a defect that only a real PostgreSQL run caught. |
| **Trigger correctness** | **medium** | Hash canonicalisation and NULL handling are easy to get subtly wrong. Mitigated by running the real `.sql` against real PostgreSQL, as `supabase/tests/platform_owner_bootstrap.test.ts` already does with `embedded-postgres`. |
| **Concurrency** | **medium** | The advisory lock is the correctness linchpin. Must be tested with genuinely concurrent inserts, not sequential ones. |
| **Write latency** | **low** | One sha256 and one indexed lookup per insert, on a fire-and-forget path. |
| **Lock contention** | **low** | Serializes audit inserts globally. Volume is administrative; the throttle from Component 4 already caps denial floods. |

**Overall: medium**, concentrated entirely in SQL rather than TypeScript.

## Non-negotiable acceptance criteria if approved

1. The migration is executed against a **real PostgreSQL** in tests before it is
   called verified — Component 1's `min(uuid)` defect passed code review, tsc,
   lint, 535 unit tests, architecture and build, because **none of them execute
   SQL**.
2. Tamper detection is proven RED/GREEN: modify a row, delete a row, and insert a
   backdated row in a test database, and assert the verifier reports each.
3. Concurrency is proven with parallel inserts, not sequential ones.
4. `/api/admin/audit` response shape is asserted byte-identical before and after.
5. Zero changes to `writeAuditLog`'s signature, behaviour, or any call site.
6. No new API route, no new UI, no env var.

---

**Stopping here. No code written. Awaiting approval.**
