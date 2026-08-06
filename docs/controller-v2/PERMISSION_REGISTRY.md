# Permission Registry

**Registry version:** `2026-08-04.2`
**Source of truth:** `src/lib/admin/permissions/registry.ts`
**Count:** 14 permissions across 6 modules

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

## 2. By role — the effective permission set

Roles **union**; they do not inherit. This table is what each role holds on its
own.

| Role | Permissions | Count |
|---|---|---:|
| `analyst` | `dashboard.home.view`, `analytics.auth.read`, `analytics.activation.read`, `analytics.content.read` | 4 |
| `moderator` | same as analyst | 4 |
| `admin` | analyst's 4 + `audit.log.read`, `settings.config.read`, all 5 `commerce.deals.*` | 11 |
| `super_admin` | admin's 11 + all 3 `security.roles.*` | 14 |
| **Platform Owner** | **not applicable** — the Owner bypasses the engine entirely (`OWNER_BYPASS`) and is never resolved against this table | — |

`analyst` and `moderator` are currently identical (4 permissions each). That is inherited, not
designed: under the old ROLE_RANK ladder `moderator` outranked `analyst`, so a
moderator could already read analytics. Preserving it was a deliberate
non-change (see design doc §9). Differentiating them belongs with the Moderation
Hub, when moderator gains permissions of its own.

## 3. Metadata contract

Every definition carries all nine fields. `engine.test.ts` fails if any is
missing or malformed.

| Field | Rule |
|---|---|
| `id` | `module.resource.action`, lowercase, dot-separated. The `module` segment **must** equal the `module` field. |
| `displayName` | Human label for the roles UI. Non-empty. |
| `description` | What the holder can actually do, and what it exposes. Non-empty. |
| `module` | Owning Hub. One of: dashboard, analytics, audit, settings, commerce, security. |
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
