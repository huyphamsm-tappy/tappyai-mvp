# `supabase/migrations/deferred/`

**Nothing in this folder is part of a normal migration run.**

These files are intentionally held back until a specific, later gate. They live
outside `supabase/migrations/` so that a bulk or directory-default apply cannot
pick them up — the Analytics production-readiness review (finding R1) already
found one real dependency-order bug caused by lexicographic apply order, and a
privilege-revoking migration applied early is a far worse failure mode than a
mis-ordered `CREATE`.

| File | Gate | Status | Rationale |
|---|---|---|---|
| `FOUNDATION_END_service_role_hardening.sql` | End of Controller V2 Foundation (after all Phase 1 components ship and soak) | ✅ **gate met · APPLIED to production 2026-08-19** — do **not** run it again; it is kept here as the record of what was executed. Evidence: [`docs/controller-v2/STATUS.md` § Post-Foundation work](../../../docs/controller-v2/STATUS.md#post-foundation-work) | ADR-017 — Service Role Hardening Strategy |
| `PHASE2_M08_profiles_account_status.sql` | — | ⛔ **SUPERSEDED · NEVER APPLIED · DO NOT APPLY.** A read-only production preflight blocked it: `profiles` is public-read and self-write, and RLS filters rows rather than columns, so these columns would expose `ban_reason` to `anon` and let a suspended user clear their own suspension. Replaced by [`../20260819_m08_account_status.sql`](../20260819_m08_account_status.sql), which isolates the fields in `public.account_status` and leaves `profiles` untouched | [ADR-022](../../../docs/architecture/ADR-022-account-status-isolation.md) · Owner authorization 2026-08-19 (Candidate C) · `04_Database_Architecture.md` §7B |

## Rules

1. Never apply a file from here as part of another migration batch.
2. Each file names its gate in its own header. If the gate is not met, do not run it.
3. Applying one of these is its own change, with its own verification and its own rollback step.
