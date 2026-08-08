# ADR-020 — Repository-baseline objects for real-PostgreSQL test harnesses

**Status:** ✅ ACCEPTED — ratified 2026-08-08 (FOUNDATION-01), documenting a
decision already relied upon by shipped tests.
**Context layer:** Testing / migration-harness contract. Relates to
[ADR-019](ADR-019-supabase-grant-model.md) (the Supabase grant model that the
PH-0 tests verify).
**Referenced by (MEASURED):** `supabase/tests/platform_hardening_phase0.test.ts`
(lines 16, 30, 44, 67, 73) cites "ADR-020" and "ADR-020 SECTION 4" as the LOCKED
scope contract for its PRELUDE. This ADR makes that citation resolve; it was
previously dangling.

---

## Context

Controller V2 security migrations (PH-0, the audit chain, the grant model) are
verified against a **real embedded PostgreSQL** by replaying the actual migration
files from disk. Some objects those migrations *read* are **repository-baseline
objects**: their `CREATE` statement is absent from the repository's migration
history because Supabase provisions them (e.g. `auth.users`, `auth.uid()`) or an
earlier un-captured baseline created them (e.g. `profiles`, `reviews`). A test
that replays only in-repo migrations therefore cannot resolve them.

## Decision

**Option B′ — existence-and-type scaffolds only.** A test harness MAY create the
minimum scaffold for a repository-baseline object **solely so the real migration
chain can be applied**, under a LOCKED contract:

1. **Only** objects whose `CREATE` is genuinely absent from migration history may
   be scaffolded. Anything a repo migration creates must come from that migration.
2. Scaffolds are **existence-and-type only** — no behaviour. `auth.uid()` returns
   `NULL`; baseline tables carry only the columns the chain reads.
3. **No assertion may depend on a scaffold's behaviour.** Every assertion stays in
   the layer under test (for PH-0: the function-permission layer —
   `has_function_privilege` + `proacl`), never on row visibility, RLS evaluation,
   JWT claims, or session identity. A scaffold that any assertion's truth depends
   on invalidates the test.
4. **SECTION 4 — baseline tables/columns.** The permitted baseline tables and the
   exact minimum columns are enumerated in the harness PRELUDE and kept in lockstep
   with what the migration chain reads (for PH-0: `profiles(id,email,follower_count)`,
   `reviews(id,is_hidden,created_at,like_count,save_count,watch_time_avg)`).
   `SET check_function_bodies = off` lets `LANGUAGE sql` functions be created
   without resolving body-only table dependencies, keeping the chain minimal.

## Consequences

- The PH-0 test's "(ADR-020, LOCKED)" / "(ADR-020 SECTION 4)" comments now resolve
  to this document.
- If the migration chain or the baseline schema changes, the scaffold list must be
  updated in lockstep; a stale scaffold makes the suite fail loudly (never falsely
  green) — accepted.

## What this ADR does NOT decide

- It does not authorise scaffolding objects that a repo migration *does* create.
- It does not change any migration, schema, or production object.
