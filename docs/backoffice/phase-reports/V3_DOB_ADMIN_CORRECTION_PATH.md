# Date-of-birth correction after the self-service allowance is spent

**Status:** Database primitive IMPLEMENTED. User-facing entry point IMPLEMENTED (§3a).
Admin/support **HTTP surface DEFERRED to the Controller task — LAUNCH BLOCKER.**
**Date:** 2026-09-08 (§3a and the Controller constraints added 2026-09-09)
**Related:** [ADR-027](../../architecture/ADR-027-user-demographics-isolation.md) · [ADR-023](../../architecture/ADR-023-module-08-admin-read-surface-roles.md) · [`20260908_user_demographics_foundation.sql`](../../../supabase/migrations/20260908_user_demographics_foundation.sql) §6

---

## 1. The problem

`set_user_date_of_birth()` allows the user exactly one self-correction. After that:

- a genuine mis-tap (wrong year at signup, then a wrong fix) is **unrecoverable by the person it affects**, and
- if the stored date puts them under 18, they are **locked out of the product entirely**.

There is no other route to that column: no PostgREST role holds a privilege on `date_of_birth`, and the one-correction rule is enforced in the database precisely so it cannot be talked around.

## 2. What is implemented here

`public.admin_set_user_date_of_birth(p_user_id, p_dob, p_actor_id, p_actor_email, p_actor_role, p_reason)` — migration §6.

**Why a function rather than "let an admin run an UPDATE".** `service_role` already holds `ALL` on the table, so the *capability* exists today. What it lacks is a path that is explicit and auditable (`23_*` §3). A raw UPDATE leaves no record of who changed a date of birth, or why. This makes the operation single-purpose, refuses it without a written reason, and writes the audit row **in the same transaction** as the change, so the two cannot come apart.

| Property | Behaviour |
|---|---|
| Who may execute | `service_role` **only** — revoked from `PUBLIC`, `anon` and `authenticated` by name (ADR-019 form) |
| Reason | Required, minimum 20 characters, matching `19_Security.md` §5 / `admin/users/schema.ts` |
| Returns | A status code (`corrected` / `reason_too_short` / `invalid_actor` / `invalid_date` / `user_not_found`). **Never the date**, before or after |
| Audit | One `audit_log` row: actor id/email/role, `action = 'user.date_of_birth.corrected'`, target, reason. Component 7's `BEFORE INSERT` trigger chains it like any other row |
| Audit content | **Age BAND and eligibility only — never the date.** Copying the raw value into a second table with different retention would recreate exactly the duplication ADR-027 removes |
| Self-service allowance | **Not** reset. The user needs the *right* value, not another attempt — resetting it would let anyone spend the allowance, ask support, and spend it again |
| Counting | `user_demographics.admin_corrections`, granted to no client role |
| Refusal | Writes nothing at all — no row, no audit entry |

Covered by 13 tests in [`user_demographics_boundary.test.ts`](../../../supabase/tests/user_demographics_boundary.test.ts), including the full lockout-and-rescue scenario and an assertion that no calendar date reaches `audit_log` in any field.

Banding was extracted to `public.age_band_of(date)` in the same change, so `user_age_status()` and this path cannot disagree about which band a date falls in.

## 3. What is NOT implemented — the launch blocker

**There is no way for a human to invoke this.** Three pieces are missing, and all three are Controller-owned:

1. **HTTP route** — `POST /api/admin/users/[id]/date-of-birth`, following the Module 08 handler contract (RBAC → origin → rate-limit → validate → operate → audit → uniform envelope).
2. **RBAC permission** — a new entry in the permission registry, e.g. `users.date_of_birth.correct`. Under ADR-023's reasoning this should sit with the *most* restricted tier: correcting a date of birth changes whether an account may use the product at all, which is closer to `users.ban` than to a profile edit. **The role assignment is an Owner decision, not one taken here.**
3. **Back-office UI** — a form on the user detail screen that collects the new date and the mandatory reason.

§34 of this task's brief states: *"Do NOT modify TappyAI Controller in this task."* `/api/admin/*`, the permission registry and the admin UI are all Controller V2. Building them here would violate that constraint, so they are deferred rather than done.

### Why this is a launch blocker, not a nice-to-have

Without the surface, the remedy exists but is reachable only by someone with the production `service_role` key running SQL by hand. That is:

- **not auditable in practice** — the function writes an audit row, but nothing forces an operator to use the function rather than a raw UPDATE;
- **not delegable** — support staff cannot hold the service-role key, so every case escalates to whoever can;
- **not survivable at volume** — every existing account is prompted for a date of birth at once when this ships (see [the migration UX audit](./V3_AGE_GATE_EXISTING_USER_MIGRATION.md)), so mis-taps arrive in a burst, not a trickle.

**Recommendation:** do not enable the 18+ gate in production until item 3.1 and 3.2 exist. 3.3 (the UI) can follow if support can call the route directly in the interim.

### Constraints the Controller implementation MUST satisfy

Binding requirements on the deferred work, stated here because the reasoning
lives with the primitive rather than with the route that will call it. An
implementation that satisfies 3.1-3.3 but violates any of these has reopened
what ADR-027 closed.

1. **Call the function; never UPDATE the table.** `admin_set_user_date_of_birth()`
   writes the change and its audit row in ONE transaction. A direct
   `UPDATE user_demographics` would succeed under `service_role` and leave no
   record — the exact failure the function exists to make impossible.

2. **The route must not READ a date of birth, and the UI must not DISPLAY one.**
   Correcting a value does not require seeing it: support acts on what the user
   tells them, and the function refuses anything invalid. There is deliberately
   no admin read path today — `user_age_status()` answers for the CALLER's own
   `auth.uid()` and takes no user id, and no PostgREST role holds a privilege on
   the column. **Adding an admin read to serve this UI would create exactly the
   broad raw-DOB exposure ADR-027 removed, and must not be done.** If the surface
   genuinely must show something, show the derived age BAND through a new
   band-only primitive — never the date.

3. **A new, most-restricted permission.** `users.date_of_birth.correct` as its own
   registry entry, not an existing permission reused. Correcting a date of birth
   decides whether an account may use the product at all, so under ADR-023 it
   belongs beside `users.ban`, not beside a profile edit. The role assignment is
   an Owner decision (see 5.1).

4. **The reason is the operator's, not the system's.** Mandatory, at least 20
   characters, never synthesized or defaulted by the route. The function refuses
   a short one and writes nothing at all on refusal.

5. **Never reset the self-service allowance.** `dob_corrections` stays as it is;
   only `admin_corrections` increments. Resetting it would let anyone spend their
   own correction, ask support, and spend it again.

6. **No date in logs, errors, URLs or audit payloads.** The function returns a
   status code and records the age BAND only. The route must not widen that: no
   date in a query string, an error envelope, an analytics event or a log line.

7. **`service_role` stays server-side.** The function is executable by
   `service_role` alone. That credential must never reach a browser, and the
   route must remain the only way a human reaches the function.

---

## 3a. The user-facing entry point — implemented

A remedy nobody can ask for is not a remedy. `/age-check` already told an
ineligible user who had spent their one self-correction to "contact support"
(`age.blocked.exhausted`, both locales), but printed **no address** — so the
sentence named a path without opening it, and the only remaining remedy for a
locked-out account was unreachable by the person it affects.

`AgeCheckView` now renders `SUPPORT_EMAIL` as a `mailto:` link beside that copy.
It reads the constant from `src/components/landing/config.ts` — the single
user-facing support channel, already shared by the landing page and the privacy
policy — rather than repeating a second literal that could drift.

This is the one piece of the correction path that is **not** Controller-owned,
and it is the piece the affected user actually touches. The full chain:

| # | Step | Status |
|---|---|---|
| 1 | User is locked out; `/age-check` shows the support address | ✅ implemented |
| 2 | User emails support; support raises a ticket | process, not code |
| 3 | Staff invoke the correction | ❌ **blocked** — no route (§3), raw SQL only (§4) |
| 4 | `admin_set_user_date_of_birth()` writes the change + audit row | ✅ implemented |

Step 3 remains the launch blocker. Steps 1 and 4 exist today.

---

## 4. Interim procedure, if the gate ships before the surface

Stated so it is a decision rather than an improvisation. An operator with `service_role` runs:

```sql
SELECT public.admin_set_user_date_of_birth(
  '<user-uuid>'::uuid,
  DATE '<corrected-date>',
  '<admin-uuid>'::uuid,
  '<admin-email>',
  '<admin-role>',
  '<reason, at least 20 characters, naming the support ticket>'
);
```

They must use **this function** and never a direct `UPDATE`: the function is what writes the audit row. A raw UPDATE would leave the correction invisible.

## 5. Open questions for the Owner

1. Which RBAC role may correct a date of birth (`admin`? `owner` only?).
2. Whether a correction should notify the affected user.
3. Whether `admin_corrections` should have a ceiling, and what happens at it.
4. Retention of the `audit_log` rows this produces — inherits Controller's policy, which is itself open.
