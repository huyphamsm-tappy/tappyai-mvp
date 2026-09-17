# ADR-027 — Private demographic data is isolated from `profiles`, and the 18+ gate rests on that isolation

**Status:** Proposed
**Date:** 2026-09-08
**Context:** V3 User Data Foundation — one canonical user model serving Web + Android
**Related:** [ADR-019](./ADR-019-supabase-grant-model.md) (grant model) · [ADR-022](./ADR-022-account-status-isolation.md) (the same resolution for account status) · `supabase/migrations/add_profiles_email_isolation.sql` · `supabase/migrations/add_billing_customers_isolation.sql`

---

## Context

TappyAI is to be an 18+ product, and is to build a first-party demographic and
behavioural data foundation on ONE canonical user model shared by Web and
Android. The direction given was explicit on two points that pull against each
other:

> Store full `date_of_birth` **in the existing canonical user/profile
> architecture** — reuse the existing canonical profile model, do not create a
> duplicate profile system.

> DOB must be protected by strict RLS/access controls and must **never** be
> exposed to public APIs, analytics, logs, advertisers, or AI.

On this database both cannot hold for `public.profiles`.

## The measurement

`public.profiles` is not a private table, and this is measured rather than
assumed. Recorded on production 2026-08-19 in
`20260819_m08_account_status.sql`, and earlier in
`add_profiles_email_isolation.sql`:

| Fact | Consequence for a column placed on `profiles` |
|---|---|
| Two permissive `SELECT` policies with `qual = true` for the `{public}` role | Readable by the anonymous internet via a PostgREST `?select=` call |
| Table grants give `anon` and `authenticated` `SELECT/INSERT/UPDATE/DELETE` | Writable by its own subject |
| RLS filters **rows**, never **columns** | No policy can hide one column |
| A column-level `REVOKE` against an existing table-level `GRANT` is **silently inert** (measured, PostgreSQL 17.5 — the ACL does not change and no warning is raised) | The obvious repair does nothing |
| The working repair denies `SELECT *`, which 11 consumer call sites rely on | The repair is not applicable in place |

For `email` the consequence was a Critical: any holder of the public anon key
could enumerate every user's address. For a date of birth the consequence is
worse in kind, because it is not only a disclosure:

**A user who can write their own `date_of_birth` can clear their own under-18
block.** That would make the 18+ gate advisory rather than enforcement — the
identical failure `account_status` exists to avoid for `is_suspended`, where the
suspended user could otherwise `PATCH` away their own suspension.

## Decision

### 1. `public.profiles` remains the ONE canonical identity and profile

Unchanged, untouched, and still the row every other user table keys on. There is
no second profile system, no Android profile, no Chat profile, no ads profile.

### 2. Private attributes live in `public.user_demographics`, a 1:1 companion

`user_id` is both primary key and foreign key to `profiles.id`: at most one row
per profile, removed with the profile. This is the resolution this repository
has already reached three times — `billing_customers` for `stripe_customer_id`,
the removal of `profiles.email`, and `account_status` for the four moderation
fields — and ADR-022's own words apply unchanged here: *"this does not transfer
ownership of `profiles`"*.

**A companion table is not a duplicate profile.** One user, one identity, one
`/api/profile` contract, consumed verbatim by Web and Android. What changes is
only where the private half is stored, and it changes because that is the only
place it can actually be protected.

### 3. `date_of_birth` is granted to no PostgREST role at all

Following the `account_status.ban_reason` precedent. `authenticated` holds
column-list grants covering the ordinary demographic fields and nothing else;
`anon` holds nothing whatsoever.

Two consequences, stated here rather than discovered later:

- `SELECT *` on `user_demographics` is **denied** for `authenticated`, because
  `*` expands to `date_of_birth`. Readers must name their columns.
- A user cannot read their own raw date of birth over PostgREST, and cannot
  write it at all.

The second is the point. It is what makes the 18+ decision un-clearable by its
subject, and it is a property of the schema rather than of any application code.

### 4. Age and age band are DERIVED, never stored

There is no `age` column and no `age_band` column. A stored age is wrong the day
after it is written, and an independently editable duplicate of a value that
gates access is a second source of truth for the same decision.

`public.user_age_status()` (SECURITY DEFINER, `search_path` pinned, `anon`
revoked) derives both and returns neither the date nor anything else. Banding
happens in SQL so Web and Android cannot disagree about which band a user is in
— two client-side derivations of the same band would be a silent, permanent
data-quality defect in the dimension the future audience foundation keys on.

### 4a. The AI receives the MINIMUM NECESSARY age representation

Not "the band, always". The band is the **default**, and it is what every
current AI use case receives, because it is what personalization and the future
audience dimension key on. But a rule fixed to the band would be a rule about
the data rather than about the need, and a future task may genuinely require the
integer — an age-boundary judgement where `18_24` cannot separate 18 from 24.

So precision is a per-request decision that must be justified in code:
`resolveAgeFields` (`contextBuilder.ts`) refuses an `'exact'` request that
carries no `reason`. That turns "explicitly required by the current AI use case"
into a recorded fact at the call site rather than a habit nobody re-examines,
and it fails on the line that made the request rather than silently widening.

The raw date of birth is outside this choice entirely and cannot be reached: no
PostgREST role holds a privilege on the column, so no context builder can read
one to send. Two runtime assertions back it up — one that the context contains
no key outside the allowlist, and one that a band-only request did not somehow
produce an exact age.

### 5. The one-self-correction rule lives in the database

`public.set_user_date_of_birth(date)` enforces it, not the API route. Every
signed-in user holds their own access token and can call PostgREST directly, so
a rule enforced only in application code would be advisory for exactly the
population it is meant to bind.

Re-submitting the same date returns `unchanged` and does **not** consume the
allowance: a double-tap or a retry after a network failure must not cost a user
their one chance to fix a genuine mistake.

Once that allowance is spent the user cannot recover alone, so
`admin_set_user_date_of_birth()` exists as the audited, `service_role`-only
remedy. It refuses without a written reason, writes its `audit_log` row in the
same transaction as the change, records the age BAND rather than the date, and
does not hand back a fresh self-service allowance. Its HTTP surface is
Controller-owned and deferred — a **launch blocker**, recorded in
[V3_DOB_ADMIN_CORRECTION_PATH.md](../backoffice/phase-reports/V3_DOB_ADMIN_CORRECTION_PATH.md).

### 6. The gate fails CLOSED, where `accountStatus` fails open

`getAccountRestriction` allows the request when its read fails, and says why:
failing closed would take chat and posting from everyone during a database blip
to close a window in which a sanctioned user — currently none — could act.

The trade here is not the same one, so the answer is not the same. A read
failure treated as `eligible` admits every under-age visitor for the duration of
the outage, which is the single outcome this control exists to prevent. It fails
to `unknown` — access withheld, user routed to the age flow — and deliberately
**not** to `ineligible`, because an outage must not record or imply that anyone
is under age.

The three states are distinct for the same reason: collapsing `unknown` into
`ineligible` would tell every pre-existing account that it is under age;
collapsing it into `eligible` would let the entire existing user base through
ungated.

## Alternatives rejected

**Add the columns to `profiles` and fix its grants.** Rejected on the
measurement above: the column-level `REVOKE` is inert, and the form that works
denies `SELECT *` to 11 existing call sites. `20260819_m08_account_status.sql`
reached this conclusion first and this ADR does not re-litigate it.

**Store gender in `auth.users.raw_user_meta_data`, as the product did before.**
That location is written client-side by `supabase.auth.updateUser`, so it is
arbitrary self-asserted JSON. Acceptable for a suggested-prompt variant; not
acceptable as a demographic dimension, and unusable for anything gating access.
Migrated to the canonical table.

**Store a self-declared `is_over_18` boolean instead of a date.** Smaller
privacy surface, but it yields no demographic dimension, cannot produce age
bands later without re-asking every user, and goes stale in the one direction
that matters — a 17-year-old's answer becomes correct without anyone updating
it, and there is no way to tell that from a lie.

## Consequences

**Positive.** A date of birth is unreachable from any client role, by
construction rather than by convention. The 18+ decision cannot be edited by the
person it constrains. The demographic dimensions the future audience foundation
needs exist in one canonical place, private by default.

**Negative, accepted.** `SELECT *` no longer works on this table, so every
reader names its columns — the same cost ADR-022 accepted. Two SECURITY DEFINER
functions are added to the surface that must be reviewed under ADR-019; both
declare their grants explicitly and take no user id, keying on `auth.uid()`.

**Behaviour change requiring a product sign-off.** `/api/chat` previously served
anonymous sessions under a daily quota. Under the direction that Chat
constitutes actual TappyAI usage, it now requires a real account. The anonymous
quota machinery is left intact and untouched.

## Not decided here

- Whether any demographic field becomes publicly visible. Today none is.
- Whether admin/back-office may read demographic data, and under which RBAC
  permission. No admin surface is added by this work — only the audited database
  primitive a future Controller route will call.
- Which RBAC role may CORRECT a date of birth. ADR-023's reasoning suggests the
  most restricted tier, since the correction decides whether an account may use
  the product at all; the assignment is an Owner decision.
- Every legal question: minimum-age determination, DOB retention, consent, and
  whether behavioural data may be used for advertising. See
  `docs/` REQUIRES LEGAL REVIEW notes in the implementation report.
