# Runbook — a staff member leaves

Owner decision 2026-09-25: a staff account that holds moderation history **cannot be deleted, by
design**. The foreign keys say so on purpose:

| column | on delete | why (in the migration) |
|---|---|---|
| `moderation_actions.actor_id` | NO ACTION | "a moderator's decision must OUTLIVE the report that prompted it" (`20260821_m09_moderation_queue.sql:105-114`) |
| `user_notes.author_id` | NO ACTION | same rule (`20260821_m08_user_notes.sql:48,87`) |
| `platform_settings.updated_by` | NO ACTION | who changed a platform setting stays attributable |
| `platform_owner.user_id` | RESTRICT | "deleting the Owner's profile must fail loudly rather than silently leaving the platform ownerless" (`20260803_platform_owner.sql:43-45`) |

So a leaver's **access** is removed on their last day; their **decision history** stays attributable
to their account; their **personal data** is removed on request without deleting the account.

## A. On the last working day (always)
1. **Remove every admin role** — back office → RBAC → roles → revoke each role held by the person
   (`DELETE /api/admin/rbac/roles/[id]`). Check `admin_permissions` for direct grants and revoke them too.
2. **End every session** — back office → Security → sessions → force-logout for that user
   (`/api/admin/security/sessions/force-logout`).
3. **Bar sign-in** — back office → user → Ban (`POST /api/admin/users/[id]/ban`): sets the flag and
   revokes their Supabase sessions. Reason: "staff leaver <date>".
4. **Shared secrets** the person could read (Vercel, Supabase dashboard, GCP, Stripe, Google Cloud
   OAuth, CRON_SECRET, any API key): remove their seat on each console; rotate every secret they
   could see in plain text. Record what was rotated.
5. **Owner only:** if the leaver IS the platform owner, ownership must be transferred first — the
   delete is refused (RESTRICT) until it is. The break-glass recovery (`20260820_b8_owner_recovery.sql`)
   is for a LOST owner, not a planned handover.

Result: no access, no sessions, history intact and still attributed.

## B. If they ask for their personal data to be deleted
The account row stays (it is what the decision history points at); the person behind it goes:
1. Do everything in A.
2. Profile: clear name, avatar, cover and bio (set the display name to "Former staff"), delete their
   uploaded files — their personal content, not the records of their decisions.
3. Their **own** user content (chats with TappyAI, AI memory, saved items, reviews …) can be removed
   by the same cascades as any user only by deleting the account — which the database refuses while
   they hold moderation history. Tell them: personal content is removed, staff records remain for
   accountability (the /delete-account "Data We May Retain" section covers this as a legal obligation).
4. `audit_log` rows of their admin actions: no email is stored since F-096; IP/browser go after 90 days;
   the rows themselves after 12 months.

## C. If the staff member never acted as a moderator
No NO ACTION reference exists → do A, then delete the account like any user (`ACCOUNT-DELETION.md`).
Check first:
```sql
select (select count(*) from moderation_actions where actor_id = '<id>') as moderation,
       (select count(*) from user_notes        where author_id = '<id>') as notes,
       (select count(*) from platform_settings where updated_by = '<id>') as settings,
       (select count(*) from platform_owner    where user_id   = '<id>') as owner;
```
All zero → the delete will succeed.
