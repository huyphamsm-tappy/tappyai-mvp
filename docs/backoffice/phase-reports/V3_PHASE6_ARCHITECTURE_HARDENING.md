# V3 Phase 6 — Post UX/UI Architecture Hardening (backlog)

**Status:** OPEN · **Raised:** 2026-09-11 · **Gate:** all currently planned V3 UX/UI/layout work complete.

This is the backlog for database/architecture integrity items that came out of the
V3 work and were deliberately **not** done at the time they were found. Each item
states what to audit; none of them states what to implement, because none has been
audited yet.

> **Why this is a new document rather than an entry in an existing one.** Three
> other documents in this repository have a "Phase 6", and none of them is this
> one: [`docs/backoffice/23_Implementation_Roadmap.md`](../23_Implementation_Roadmap.md)
> §"Phase 6 — Experimentation & Optimization" (backoffice analytics),
> [`docs/controller-v2/STATUS.md`](../../controller-v2/STATUS.md) §"Phase 6 — legacy
> retirement" (Controller V2), and
> [`docs/ios/10_IOS_IMPLEMENTATION_PLAN.md`](../../ios/10_IOS_IMPLEMENTATION_PLAN.md)
> §"Phase 6 — Discovery, Groups, Personalization, Notifications" (iOS). Filing V3
> database-integrity work under any of those would put it inside an unrelated
> workstream's phase numbering. This document is the V3 workstream's own Phase 6.

---

## 0. Ordering — UX/UI first, then one batch

**FIRST: complete all currently planned V3 UX/UI/layout work.** Nothing below starts
before that.

**ONLY AFTER UX/UI is complete:**

| # | Item | Status |
|---|---|---|
| 1 | `user_memory` FK task | ✅ **COMPLETE** — commit `6964bfb`, branch `claude/user-memory-auth-fk-f1z5nf`. Not deployed, not merged. |
| 2 | [`review_saves.user_id` FK audit/fix](#a--review_savesuser_id-fk-integrity) | Backlog — audit first |
| 3 | [`anon_chat_usage.user_id` FK audit/fix](#b--anon_chat_usageuser_id-fk-integrity) | Backlog — audit first |
| 4 | [Production schema reconciliation audit](#c--production-schema-reconciliation--drift-audit) | Backlog — audit first |
| 5 | Full regression + localhost QA | Backlog |
| 6 | **One consolidated Production deployment batch** | Backlog |

🚨 **Do not create separate Production deployments for these architecture items.**
They ship together, once, in the consolidated batch at step 6. Item 1 is already
finished and is waiting for that batch — it is complete, not pending.

Each item is **gated on its own audit**. "If the defect is confirmed" is a real
condition in every case below, not a formality: the repository's declarations and
the live database have already been shown to disagree (that disagreement *is*
item C), so no fix should be designed from the migration files alone.

---

## A — `review_saves.user_id` FK integrity

**Priority: highest of the three.** Same defect class as the `user_memory` task,
and the same consequence: user-owned rows outliving the account that owns them.

**What was observed** (repository declaration only, 2026-09-11, **not verified
against production**): `supabase/migrations/20260712_prod_baseline_and_review_saves_indexes.sql:22`
declares

```sql
user_id    uuid NOT NULL,
```

with no `REFERENCES`. A repository-wide search finds **no foreign key declared for
`review_saves.user_id` in any migration or in `supabase-schema.sql`**. Note the
contrast inside that same file: `subscriptions.user_id` immediately below it *does*
carry `REFERENCES public.profiles(id) ON DELETE CASCADE`.

**To do:**

- Audit `public.review_saves.user_id` **on the live database**, not from the migrations.
- Verify whether it is correctly related to `auth.users(id)`.
- Verify the `ON DELETE` behavior.
- Audit Web + iOS + Android callers.
- If the defect is confirmed, add the appropriate FK with a safe migration and
  cascade behavior.
- **Do not assume the implementation until audited.** In particular, do not assume
  the target is `auth.users` — `subscriptions` in the same file points at
  `public.profiles`, and anonymous identities exist in `auth.users` with no
  `profiles` row (`20260808c_handle_new_user_skip_anonymous.sql`), so which parent
  is correct is part of the audit, not an input to it.

---

## B — `anon_chat_usage.user_id` FK integrity

**Lower priority than `review_saves` / `user_memory`**, because this table does not
contain the same level of private user content — it holds a per-day integer quota
counter, not anything the user said or was remembered for.

**What was observed** (repository declaration only, **not verified against
production**): `supabase/migrations/20260711_anon_chat_usage.sql:13` declares

```sql
CREATE TABLE IF NOT EXISTS public.anon_chat_usage (
  user_id UUID NOT NULL,
  day     DATE NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
```

with no `REFERENCES`, and no FK declared for it anywhere in the repository.

**To do:**

- Audit `public.anon_chat_usage.user_id`.
- Verify **ownership semantics** and whether an `auth.users` FK is appropriate at
  all. This is the substantive question, not a formality: the rows key on anonymous
  Supabase identities, and whether a quota record *should* survive the identity it
  throttles is a product decision. Cascading could hand a returning visitor a fresh
  daily allowance; not cascading leaves rows behind. Establish the intended
  behaviour before choosing a constraint.
- Audit Web + iOS + Android compatibility.
- If confirmed as a defect, fix with a safe migration.
- **Do not assume the implementation until audited.**

---

## C — Production schema reconciliation / drift audit

**What to do:**

- Compare the **actual Production schema** against the canonical migrations /
  schema definitions.
- Identify divergences caused or hidden by patterns such as
  `CREATE TABLE IF NOT EXISTS`.
- Classify each divergence:
  1. intentional
  2. harmless / non-actionable
  3. requires documentation
  4. requires migration/fix
- 🚨 **Do NOT blindly normalize Production to the canonical schema.** The canonical
  file is not automatically the correct answer — deciding which side is right is
  the whole point of the classification step.

**Example already observed** — `public.user_memory.updated_at`:

| | Type |
|---|---|
| Production | `timestamp without time zone` |
| Canonical declaration (`supabase-schema.sql`) | `timestamptz` |

Recorded in [`docs/ios/05_DATABASE_CONTRACT.md`](../../ios/05_DATABASE_CONTRACT.md).
**This is a finding to investigate, NOT an instruction to change it immediately.**

---

## The architectural lesson

> **`CREATE TABLE IF NOT EXISTS` can silently preserve an existing out-of-band table
> whose actual schema differs from the canonical declaration.**
>
> Therefore future schema changes should rely on **explicit migrations /
> reconciliation** rather than assuming `CREATE TABLE IF NOT EXISTS` establishes the
> production shape.

This is not a hypothetical. It is exactly how the `user_memory` defect survived:
`supabase-schema.sql:88` has always declared

```sql
user_id uuid references auth.users on delete cascade not null unique
```

but the live table already existed — created out of band as `text` — so the
`create table if not exists` around that declaration made it a **silent no-op**,
for as long as the file has existed. The database never carried the constraint the
repository appeared to promise, and nothing failed, warned, or drifted visibly. The
same file records the same pattern for `review_saves` and `subscriptions`
(`20260712_prod_baseline_and_review_saves_indexes.sql`), which is why item C exists
and why items A and B are audits rather than fixes.

The corollary worth keeping: **a schema file that is read as documentation is not
evidence of what the database does.** Every claim in items A–C above is labelled
with where it came from, and the repository-only ones are marked as unverified
against production on purpose.

---

## Related

- Completed item 1: `supabase/migrations/20260911b_user_memory_auth_fk.sql`, its
  rollback, and `supabase/tests/user_memory_auth_fk.test.ts` (60 tests, real
  PostgreSQL). Commit `6964bfb`.
- Apply-time preflight for item 1 lives in that migration's own `VERIFY` block
  (queries `0` and `0b`) — run it against production **before** applying, in the
  consolidated batch.
