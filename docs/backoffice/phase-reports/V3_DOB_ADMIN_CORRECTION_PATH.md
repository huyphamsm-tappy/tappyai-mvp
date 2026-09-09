# Date-of-birth correction after the self-service allowance is spent

**Status:** COMPLETE. Database primitive, user-facing entry point (§3a) and the
Controller HTTP surface (§3b) are all implemented. **No longer a launch blocker.**
**Date:** 2026-09-08 (§3a and the Controller constraints added 2026-09-09; §3b shipped 2026-09-09)
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

## 3. The Controller surface — what was missing, and the contract it had to meet

**Originally there was no way for a human to invoke this.** Three pieces were
missing, all three Controller-owned. All three now exist — see §3b. The
requirements below are kept verbatim because they are what the implementation
was held to, and what any future change to it is still held to:

1. **HTTP route** — `POST /api/admin/users/[id]/date-of-birth`, following the Module 08 handler contract (RBAC → origin → rate-limit → validate → operate → audit → uniform envelope).
2. **RBAC permission** — a new entry in the permission registry, e.g. `users.date_of_birth.correct`. Under ADR-023's reasoning this should sit with the *most* restricted tier: correcting a date of birth changes whether an account may use the product at all, which is closer to `users.ban` than to a profile edit. **The role assignment is an Owner decision, not one taken here.**
3. **Back-office UI** — a form on the user detail screen that collects the new date and the mandatory reason.

§34 of this task's brief states: *"Do NOT modify TappyAI Controller in this task."* `/api/admin/*`, the permission registry and the admin UI are all Controller V2. Building them here would violate that constraint, so they are deferred rather than done.

### Why this WAS a launch blocker, not a nice-to-have

Without the surface, the remedy exists but is reachable only by someone with the production `service_role` key running SQL by hand. That is:

- **not auditable in practice** — the function writes an audit row, but nothing forces an operator to use the function rather than a raw UPDATE;
- **not delegable** — support staff cannot hold the service-role key, so every case escalates to whoever can;
- **not survivable at volume** — every existing account is prompted for a date of birth at once when this ships (see [the migration UX audit](./V3_AGE_GATE_EXISTING_USER_MIGRATION.md)), so mis-taps arrive in a burst, not a trickle.

**Recommendation (met).** The 18+ gate was not to be enabled in production until
3.1 and 3.2 existed. All three items now ship — §3b. This blocker is closed;
legal review remains a separate and independent one.

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
| 3 | Staff invoke the correction | ✅ implemented — `POST /api/admin/users/[id]/date-of-birth` (§3b) |
| 4 | `admin_set_user_date_of_birth()` writes the change + audit row | ✅ implemented |

All four steps exist. Step 2 is process; the rest is code.

---

## 3b. The Controller surface — implemented

Shipped 2026-09-09, against the seven constraints in the section above. Each one
is satisfied, and each is pinned by a test rather than by intention.

| Piece | Where |
|---|---|
| Permission | `users.date_of_birth.correct` — `registry.ts`, `super_admin` **only** (Owner, 2026-09-09) |
| Route | `POST /api/admin/users/[id]/date-of-birth` |
| Service wrapper | `src/lib/admin/users/dateOfBirthAdmin.ts` |
| UI | `UserDobCorrectionPanel` on the user detail |
| Tests | `src/app/api/admin/users/[id]/date-of-birth/route.test.ts` |

**Authorization.** `requirePermission(req, PERMISSIONS.USERS_DOB_CORRECT)` runs
first, and the privileged client is created only after it answers —
`service_role` is the credential the operation needs, never a way around the
check that precedes it. The route then reuses `guardMutationTarget`, which
refuses a non-UUID target, an actor targeting themselves, and the Platform
Owner, and which **fails closed** if the Owner check itself errors.

**The route does not audit.** The SQL function writes the `audit_log` row in the
same transaction as the change, so `writeAuditLog`/`writeAuditLogAwaited` are
deliberately absent — a second write would produce two entries for one event,
and the second would survive a transaction that rolled back. The one audit this
path can emit from the handler is `guardMutationTarget`'s `user.action_denied`
on an Owner-protected target, which is a denial event and shared with every
other Module 08 mutation.

**No read was added.** The route makes exactly two RPCs — the Owner check and
the correction — plus the existence lookup `guardMutationTarget` already
performed for suspend and ban. It never calls `user_age_status()`, never selects
`date_of_birth`, and the UI shows no current value. Constraint 2 above holds.

**Nothing is echoed back.** A success returns `{ id, corrected: true }`. Tests
assert that no response body — success or refusal — contains a
calendar-date-shaped string at all, and that the operator's reason is not
returned either.

**Validation is shared, not duplicated.** The date goes through
`parseDateOfBirthInput`, the same function the consumer path uses; the reason
through the same `ReasonSchema` as every other sanction, whose twenty-character
floor already matched the SQL function's own check. The database remains the
backstop: its status vocabulary is mapped explicitly, and an unrecognised value
is a 500 rather than a success.

---

## 4. Fallback procedure (superseded by §3b — kept for break-glass)

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

## 5. Owner decisions, and what is still open

Decided 2026-09-09. Recorded here because each one is a constraint the
implementation now embodies, and reopening any of them is a change to shipped
behaviour rather than a preference.

| # | Question | Decision |
|---|---|---|
| 1 | Which RBAC role may correct a date of birth | **`super_admin` alone.** Not `admin`, not `moderator`, not `analyst` |
| 2 | Should a correction notify the affected user | **No**, not in this phase |
| 3 | Should `admin_corrections` have a ceiling | **No limit** in this phase. Existing behaviour and full auditability preserved |

Still open:

4. Retention of the `audit_log` rows this produces — inherits Controller's policy, which is itself open.
