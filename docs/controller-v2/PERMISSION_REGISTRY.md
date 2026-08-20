# Permission Registry

**Registry version:** `2026-08-20.2`
**Source of truth:** `src/lib/admin/permissions/registry.ts`
**Count:** 26 permissions across 7 modules

> Transcribed from `registry.ts` on 2026-08-20, when Module 08 added the `users`
> module. The previous revision of this file was written at 14 permissions and
> had not been updated for Component 11 (`security.sessions.*`) or
> FOUNDATION-07D (`security.membership.*`); those four rows are restored below.

This document is generated from — and must stay consistent with — the code.
`engine.test.ts` asserts a bijection between the `PERMISSIONS` constants and the
registry, so a permission cannot exist in one place only.

---

## 1. Catalogue

Legend — **Cat**: read / write / destructive / security · **Risk**: low / medium / high / critical

| ID | Module | Cat | Risk | Capability | Roles | Description |
|---|---|---|---|---|---|---|
| `dashboard.home.view` | dashboard | read | low | `controller.dashboard` | analyst, moderator, admin, super_admin | Open the Controller home dashboard. The minimum permission any admin needs. |
| `analytics.auth.read` | analytics | read | low | `analytics.read` | analyst, moderator, admin, super_admin | View signup, login and provider breakdowns. Aggregate data only; no user PII. |
| `analytics.activation.read` | analytics | read | low | `analytics.read` | analyst, moderator, admin, super_admin | View activation funnel, rules and cohort breakdowns. Aggregate data only. |
| `analytics.content.read` | analytics | read | low | `analytics.read` | analyst, moderator, admin, super_admin | View review, video, hashtag and creator aggregates. Aggregate data only; no user PII. |
| `audit.log.read` | audit | read | **medium** | `audit.read` | admin, super_admin | View the administrative audit trail, including actor identity and before/after state. Reveals who did what. |
| `settings.config.read` | settings | read | low | `settings.read` | admin, super_admin | View effective Controller configuration. Read-only; no secrets exposed. |
| `commerce.deals.read` | commerce | read | low | `commerce.deals` | admin, super_admin | View partner deals, including unpublished ones. |
| `commerce.deals.create` | commerce | write | medium | `commerce.deals` | admin, super_admin | Create a partner deal. Published deals are visible to end users. |
| `commerce.deals.update` | commerce | write | medium | `commerce.deals` | admin, super_admin | Edit an existing partner deal, including its published state. |
| `commerce.deals.delete` | commerce | **destructive** | **high** | `commerce.deals` | admin, super_admin | Permanently remove a partner deal. Not recoverable from the Controller. |
| `commerce.deals.upload_media` | commerce | write | medium | `commerce.deals` | admin, super_admin | Upload images for partner deals to blob storage. |
| `security.roles.read` | security | read | medium | `security.rbac` | super_admin | See who holds which administrative role. |
| `security.roles.grant` | security | **security** | **critical** | `security.rbac` | super_admin | Grant an administrative role. `super_admin` additionally requires the Platform Owner, enforced in the database, outside RBAC. |
| `security.roles.revoke` | security | **security** | **critical** | `security.rbac` | super_admin | Revoke an administrative role. `super_admin` additionally requires the Platform Owner, enforced in the database, outside RBAC. |
| `security.sessions.read` | security | read | **medium** | `security.sessions` | admin, super_admin | List a user's sessions: creation time, last activity, expiry and platform class. Credential material is never returned. |
| `security.sessions.revoke` | security | **security** | **critical** | `security.sessions` | super_admin | End a specific session, or every session for one user. Cannot target the Platform Owner, and never affects anonymous sessions. |
| `security.membership.read` | security | read | **medium** | `security.rbac` | super_admin | See which users belong to which department, with org role and scope. |
| `security.membership.manage` | security | **security** | **critical** | `security.rbac` | super_admin | Assign, suspend, reactivate or remove a department membership. Bounded by department authority. |
| `users.list.read` | users | read | **medium** | `users.manage` | moderator, admin, super_admin | Search and page the consumer user list, including each account's standing. Email addresses are withheld unless `users.email.read_full` is also held. |
| `users.detail.read` | users | read | **medium** | `users.manage` | moderator, admin, super_admin | Open one consumer account: profile summary, account standing and suspension expiry. The ban reason needs `users.ban_reason.read` on top. |
| `users.email.read_full` | users | read | **high** | `users.manage` | admin, super_admin | Read a consumer user's full email address. Without it the address is masked (`10_User_Management.md` §6). Also gates **searching by** an address, which is an existence oracle over the same data. |
| `users.ban_reason.read` | users | read | **high** | `users.manage` | admin, super_admin | Read the internal moderation note recorded when an account was banned. Withheld without it; the ban itself stays visible. |
| `users.account.suspend` | users | **write** | **high** | `users.manage` | moderator, admin, super_admin | Temporarily bar a consumer account from posting, commenting and AI, leaving browsing intact. Time-limited or indefinite. |
| `users.account.unsuspend` | users | **write** | **medium** | `users.manage` | moderator, admin, super_admin | Return a suspended consumer account to active standing. |
| `users.account.ban` | users | **destructive** | **critical** | `users.manage` | admin, super_admin | Permanently bar a consumer account. Records the ban and its internal reason; session revocation is a separate operation and is NOT performed by this permission. |
| `users.account.unban` | users | **write** | **high** | `users.manage` | admin, super_admin | Restore a banned consumer account and clear its ban reason. |

### Why `users.account.ban` is `destructive` and not `security`

Invariant 9 pins every `security`-category permission to `super_admin` alone.
Banning a consumer account is assigned to `admin` by `10_User_Management.md`
§3.9, so classifying it as `security` would either break that invariant or
silently narrow the documented policy. The `security` category means **power
over the platform** — who holds a role, whose administrative session lives.
Barring one consumer account is severe but confers no authority, so it is
`destructive`, at `critical` risk.

## 2. By role — the effective permission set

Roles **union**; they do not inherit. This table is what each role holds on its
own.

| Role | Permissions | Count |
|---|---|---:|
| `analyst` | `dashboard.home.view`, `analytics.auth.read`, `analytics.activation.read`, `analytics.content.read` | 4 |
| `moderator` | analyst's 4 + `users.list.read`, `users.detail.read`, `users.account.suspend`, `users.account.unsuspend` | 8 |
| `admin` | analyst's 4 + `audit.log.read`, `settings.config.read`, all 5 `commerce.deals.*`, `security.sessions.read`, the 4 `users` permissions moderator holds, `users.email.read_full`, `users.ban_reason.read`, `users.account.ban`, `users.account.unban` | 20 |
| `super_admin` | admin's 20 + all 3 `security.roles.*`, `security.sessions.revoke`, both `security.membership.*` | 26 |
| **Platform Owner** | **not applicable** — the Owner bypasses the engine entirely (`OWNER_BYPASS`) and is never resolved against this table | — |

**`moderator` stopped being a copy of `analyst` on 2026-08-20**, by
[ADR-023](../architecture/ADR-023-module-08-admin-read-surface-roles.md) (Owner
Decision A). The previous revision of this file recorded them as identical and
noted that differentiating them "belongs with the Moderation Hub, when moderator
gains permissions of its own". Module 08 is where that happened: a moderator may
now find a consumer account and suspend or unsuspend it (`10_User_Management.md`
§3.9), but not ban, not unban, not see an unmasked email address, not search by
one, and not read a ban reason.

⚠️ **This makes [`BACKLOG.md`](BACKLOG.md) BL-C3-02 actionable.** That item asks
whether `moderator` should keep analytics read access, argues from the premise
that the two roles "hold **identical** permission sets", and names its own
trigger — *"when the Moderation Hub ships and `moderator` gains permissions of
its own"*. The premise is now false and the trigger has fired. ADR-023 does not
answer BL-C3-02; it unblocks it.

## 3. Metadata contract

Every definition carries all nine fields. `engine.test.ts` fails if any is
missing or malformed.

| Field | Rule |
|---|---|
| `id` | `module.resource.action`, lowercase, dot-separated. The `module` segment **must** equal the `module` field. |
| `displayName` | Human label for the roles UI. Non-empty. |
| `description` | What the holder can actually do, and what it exposes. Non-empty. |
| `module` | Owning Hub. One of: dashboard, analytics, audit, settings, commerce, security, users. |
| `capability` | Capability required for this permission to be usable. Inert until Component 5. |
| `category` | read / write / destructive / security |
| `riskLevel` | low / medium / high / critical |
| `defaultRoles` | Roles granted this permission. **The policy.** |
| `deprecated` | Optional. Set when a permission is retired but still referenced. |

## 4. Machine-checked invariants

These are assertions in `engine.test.ts`, not conventions:

1. Every `id` matches `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`.
2. The first segment of `id` equals `module`.
3. No duplicate `id` — `createRegistry()` throws on one.
4. `PERMISSIONS` constants ↔ registry entries is a **bijection**.
5. `category: 'security'` ⇒ `riskLevel: 'critical'`.
6. `category: 'destructive'` ⇒ `riskLevel` ∈ {high, critical}.
7. `category: 'read'` ⇒ `riskLevel ≠ 'critical'`.
8. `analyst` holds **only** `read`-category permissions.
9. **No role other than `super_admin` holds any `security`-category permission.**

Invariant 9 is the important one. It is the machine-checked form of "only a
super_admin administers roles", and it will fail loudly if someone widens
`security.roles.grant` in a hurry.

## 5. Changing this registry

Adding, removing, or re-scoping a permission is a **policy change**, not a
refactor.

1. Edit `DEFINITIONS` in `registry.ts` and add/remove the `PERMISSIONS` constant.
2. **Bump `REGISTRY_VERSION`.** This is not optional — it is what discards
   cached permission sets computed under the old rules. Format: `YYYY-MM-DD.N`.
3. Update this document and the by-role table in §2.
4. If the change alters who can reach an existing call site, update the row in
   `migration.test.ts` — deliberately. That test exists to make silent drift fail.
5. Re-run `npx vitest run src/lib/admin/permissions/`.

Forgetting step 2 is the one mistake with a security consequence: warm instances
would keep serving permission sets resolved against the old registry until TTL.
