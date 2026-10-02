# Runbook — deleting a user account (support / operator)

Applies once DEPLOY-CHECKLIST D1–D5 are live. What deletion removes, anonymises and keeps is
defined by `/delete-account` (draft: `docs/uat/DELETE-ACCOUNT-COPY-DRAFT.md`) and F-093/F-096.

## 1. Verify the request
- The request must come from the account's own email address (or be confirmed from it).
- Record: ticket id, account email, user id, date received, date verified.

## 2. Is this a staff account?
If the user holds any admin role, or has moderation actions / staff notes / platform settings in
their name, **stop and use `STAFF-LEAVER-RUNBOOK.md`** — the database refuses to delete such an
account by design (the decision history must outlive the moderator).

## 3. Delete the account
Supabase dashboard → **Authentication → Users** → find the user id → **Delete user**.
(Or `auth.admin.deleteUser(<id>)` from an admin script — the effect is identical.)

That one delete:
- removes every per-user row (profile, AI chats, AI memory, saved items, reviews, comments,
  likes, shares, notifications they caused, groups they created, integrations …) — foreign keys;
- **queues** a row in `account_deletion_jobs` holding their group ids and Google Calendar token —
  a trigger on `auth.users`, so the dashboard path is covered too.

## 4. Remove their files and revoke Google — do not wait for the nightly run
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<prod-host>/api/cron/account-deletion-jobs
```
Expect `{"ok":true,"processed":N,"completed":N,"failed":0,...}`. The job also runs daily at 01:45 VN.

## 5. Confirm
In the SQL editor (service role):
```sql
select done_at, media_deleted, attempts, last_error
  from public.account_deletion_jobs where user_id = '<user id>';
```
- `done_at` set → files are gone from the bucket (the worker re-lists every prefix and requires it empty) and the Google grant is revoked.
- `done_at` null with `last_error` → it is retried nightly (up to 10 attempts). `google revoke did not complete` = Google unreachable;
  a storage error = bucket permission or outage. Escalate if attempts reach 10.

## 6. Reply to the user
Confirm deletion with the date. Do not include what was stored.

## Never
- Never delete their rows by hand in the SQL editor instead of deleting the Auth user: the job is only queued by an Auth deletion.
- Never delete bucket objects by hand with a wide prefix — the worker's prefixes are validated to one owner.
