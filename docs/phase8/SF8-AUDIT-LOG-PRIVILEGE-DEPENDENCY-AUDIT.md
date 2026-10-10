# SF8 — `audit_log` privilege and dependency audit (facts only) — 2026-10-10

Status: **SF8 stays BLOCKED.** This is the *privilege and dependency audit* the owner asked for; it is not a design. **No `service_role` (or any) privilege was changed, and none should be until a reviewed privilege design and an explicit policy for `service_role` and `audit_log` exist.** Baseline `17d4aac`; read-only audit of repository files (no live database was queried).

## 1. Consumers (all use `createAdminClient` = `SUPABASE_SERVICE_ROLE_KEY`, `src/lib/supabase/admin.ts`; no request/`authenticated` client touches `audit_log`; there is no `supabase/functions`)
| Consumer | Operation | Would revoking UPDATE/DELETE/TRUNCATE from `service_role` break it? |
|---|---|---|
| `writeAuditLog` / `writeAuditLogAwaited` (`src/lib/admin/audit.ts`) and ~25 admin routes, `decisionAudit.ts`, `users/identity.ts`, `controller/auditAdapter.ts`, `org/membershipService.ts`, `notifications/dispatchService.ts`, `ai/actions/runAction.ts` | INSERT via PostgREST (BEFORE INSERT triggers run `SECURITY DEFINER`) | No |
| `GET /api/admin/audit`, admin home | SELECT | No |
| `cron/audit-retention` | RPC `audit_log_client_sweep(90)`, `audit_log_prune(12)` — `SECURITY DEFINER`, the DELETEs run as the **function owner** | No for the caller; **UNKNOWN**: whether the production function owner keeps DELETE |
| `admin_set_user_date_of_birth` RPC (migration `20260908`), `fn_owner_recovery_audit` (`20260820_b8`) | INSERT inside definer functions | No |
| `fn_verify_audit_chain` | SELECT; callers: `scripts/release/sql/precheck-all.sql`, tests | No |
| `scripts/release/backup-prod.ps1` | SELECT count / dump (DB credential unknown) | No (read) |
| Account deletion code | no `audit_log` reference found | No |
| Tests that mutate `audit_log` (`audit_chain.test.ts` T-01..T-18, PII/owner-recovery tests) | UPDATE/DELETE/TRUNCATE as the connection **owner** on a throw-away Postgres | No effect on production; they need an owner/superuser connection |
**No `src/` or `scripts/` code issues UPDATE, DELETE or TRUNCATE on `audit_log` directly.** The only DELETEs are inside `audit_log_prune` (`20260925d` ~:259); `audit_log_client` is deleted in `audit_log_client_sweep` and `audit_log_prune`.

## 2. Database facts (migrations)
- `20260713_backoffice_phase0.sql` comments "immutable; INSERT-only — ADR-007" and "no UPDATE/DELETE path anywhere", then `ENABLE ROW LEVEL SECURITY` with **no policies**. There is no GRANT/REVOKE/POLICY on `audit_log` in any migration.
- Triggers on `audit_log`: only BEFORE INSERT — `aaa_audit_log_pii` (nulls email, masks JSON, moves IP/UA to `audit_log_client`) and `zzz_audit_log_chain` (hash chain, advisory lock). **No trigger blocks UPDATE, DELETE or TRUNCATE**; the chain design (A5) states the immutability guarantee does not exist at database level.
- `audit_log_prune` / `audit_log_client_sweep`: `REVOKE ALL FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE TO service_role`; prune requires ≥ 12 months, takes the chain lock, refuses an unverified prefix, deletes, writes an anchor. `fn_verify_audit_chain` and the hash helpers are revoked from `PUBLIC, anon, authenticated`. `audit_log_client` / `audit_log_anchor`: RLS on, `REVOKE ALL FROM PUBLIC, anon, authenticated`, `GRANT SELECT TO service_role`.
- Function owner is not stated in any migration (default = the migration executor; the snapshot says objects are owned by `postgres`).

## 3. Production schema snapshot (`docs/audit/schema-baseline/prod-schema-only.sql`)
- Provenance (`…manifest.json`): generated 2026-09-17T05:59:33Z via the Management API as `supabase_read_only_user`, "default_privileges: Supabase defaults assumed". It is a **snapshot, not live production**, and predates `20260925d` (no `audit_log_client`, `audit_log_anchor`, `aaa_audit_log_pii`, `audit_log_prune`).
- It shows (lines ~3119–3122) `REVOKE ALL … FROM anon, authenticated, service_role` then GRANT of DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE to **anon, authenticated and service_role** on `audit_log`. `anon`/`authenticated` are stopped only by RLS (enabled, no policy).
- Precedent in the same snapshot: `admin_roles` and `platform_owner` give `service_role` only MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE; `event_outbox` gives it SELECT only — so `service_role` was already narrowed on some tables. ADR-017 lists the `admin_roles` REVOKE as deferred (`supabase/migrations/deferred/FOUNDATION_END_service_role_hardening.sql`), which does not mention `audit_log`.

## 4. What the tests prove (and do not)
`audit_chain.test.ts` B-23: `anon` SELECT on `audit_log` is *permission denied*; `anon`/`authenticated` cannot execute the verifier/helpers while `service_role` can. `audit_log_pii_retention.test.ts`: `anon`/`authenticated` get 42501 on `audit_log_client`, `audit_log_anchor`, sweep and prune. **No test asserts table-level privileges of `audit_log` for `service_role`, none asserts `authenticated` is denied on `audit_log` itself** (RLS-without-policy is the control), and T-03/T-17 document that tail deletion and TRUNCATE pass the verifier.

## 5. Documented position
`20260807_audit_chain.sql` header and the C7 design: the chain is tamper-**evident** only; "prevention is a credential/grant problem (the deferred service_role hardening)". `docs/backoffice/13_Audit_Log.md` claims "no service role mutation" and a RESTRICTIVE policy `audit_log_insert_only` — **no such policy exists** in migrations or the snapshot (that document is aspirational).

## 6. UNKNOWN without production access (these block any design)
Live grants on `audit_log`, `audit_log_client`, `audit_log_anchor`; whether `20260925d` is applied (an apply log exists at `docs/uat/evidence/f096-2026-09-26/apply-20260925c-d.log`); the owner of `audit_log_prune`, `audit_log_client_sweep`, `fn_audit_log_chain` and whether that owner holds DELETE (a definer delete needs it); whether any other role (a prune role, the backup/release credential) exists; which key Vercel actually runs with; `pg_default_acl`; whether any ad-hoc REVOKE or the FOUNDATION_END script was applied after 2026-09-17; whether any BYPASSRLS/superuser path (dashboard SQL editor) deletes rows today.

## 7. Questions the owner's policy must answer before a design can start
(1) Does "ordinary application privileges" include `service_role`, which the app uses for every legitimate write? (2) Who may prune — the existing definer function with `service_role` EXECUTE, or a separate role? (3) Are TRUNCATE and TRIGGER on `audit_log` in scope? (4) Is the target "INSERT/SELECT only for `service_role`" with all deletes through definer functions (this audit finds no code path that would break, but the production function owner is unverified)? (5) Rollback and verification evidence required from production.
