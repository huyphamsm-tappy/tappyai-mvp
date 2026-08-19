# Controller V2 — Hub Taxonomy

**Status:** CONTRACT — authoritative and current · **Date:** 2026-08-19
**Authority:** [Owner Decision G, 2026-08-19](OWNER_DECISIONS_2026-08-19.md#g--hub-taxonomy-merged--8-hubs-contain-the-20-modules) — resolves [Open Decision #4](00_LEGACY_AUDIT.md) (open since 2026-08-03)
**Sources reconciled:** [`01_CONTROLLER_V2_ARCHITECTURE.md`](01_CONTROLLER_V2_ARCHITECTURE.md) §2.2 (8 Hubs) × [`docs/backoffice/03_Module_Architecture.md`](../backoffice/03_Module_Architecture.md) (20 Modules, APPROVED v1.1 2026-07-13)

---

## 0. What this document decides, and what it refuses to decide

It decides **which Hub owns which Module**. That is the whole of Decision G.

It does **not** invent module scope, KPIs, schemas or UI. Where the two approved sources do not jointly determine an answer, the row says **AMBIGUOUS** and names what is missing. An AMBIGUOUS row blocks that module's implementation, not the Hub's.

Hub ids follow the shipped convention `tappy.hub.<name>` (see [`registry/adminModules.ts`](../../src/lib/controller/registry/adminModules.ts)). Two hubs registered today are **containers of convenience** created before this taxonomy existed and are reconciled in §3.

---

## 1. The mapping

`✅ shipped` = a module registered in `ADMIN_MODULES` today and reachable in production.

| Hub | `01_ARCH` §2.2 entries | Backoffice v1.1 module | Status today |
|---|---|---|---|
| **🏠 Founder** `tappy.hub.founder` | Executive KPIs · Revenue · AI Cost · Growth · Alerts · Investor Report | **01** Home Dashboard | ⚠️ stub — `ControllerHome` shows registry counts, not KPIs |
| | | **05** Business Analytics | ❌ not started |
| | | **06** Investor Dashboard | ❌ not started |
| **👥 User** `tappy.hub.user` | Users · Subscriptions · Devices · Sessions · Support · Moderation | **08** User Management | ❌ not started |
| | | **09** Content Moderation | ❌ not started |
| | | **11** CRM (User 360) | ❌ not started |
| | | *Sessions* — C11 | ⚠️ API only (`/api/admin/security/sessions`), no module, no UI |
| **📈 Analytics** `tappy.hub.analytics` | Auth ✅ · Activation ✅ · Retention · Funnels · Events · Custom Reports | **02** Product Analytics | ✅ shipped as `analytics.content` |
| | | **04** User Analytics | ⚠️ partial — `analytics.auth` + `analytics.activation` shipped |
| | | **07** Reporting | ❌ not started |
| | | **19** Export Center | ❌ not started |
| **📣 Marketing** `tappy.hub.marketing` | Campaigns · Push · Banners · Coupons · Referral · A/B Testing | **10** Engagement Center | ❌ not started |
| **🛒 Commerce** `tappy.hub.commerce` | Deals ✅ · Marketplace · Merchants · Orders · Payments · Commission | *(no v1.1 module — Commerce is V2-only)* | ✅ `commerce.deals` shipped |
| **🤖 AI** `tappy.hub.ai` | Prompts · Models · Token & Cost · Evaluation · Safety | **03** AI Analytics | ❌ not started |
| | | **15** AI Cost Monitoring | ❌ not started |
| **🛠 Operations** `tappy.hub.operations` | Health · Cron · Queues · Logs · API Monitoring | **14** System Monitoring | ❌ not started |
| | | **16** Release Management & Version Analytics | ❌ not started |
| | | **18** Developer Tools | ❌ not started |
| **🔒 Security** `tappy.hub.security` | RBAC ✅ · Audit ✅ · Sessions · Risk · Plugin Governance | **12** Audit Log | ✅ shipped |
| | | **13** RBAC | ✅ shipped |

**Coverage:** 17 of 20 v1.1 modules are placed. The remaining three are §2.

## 2. AMBIGUOUS — not placed, and not guessed

| Module | Why it is not placed |
|---|---|
| **17** Settings | Appears in **no** `01_ARCH` §2.2 Hub. It ships today under `tappy.hub.configuration`, a container invented by the registry, not by the architecture. Settings is plausibly Operations, plausibly its own governance surface. **Needs an Owner decision** before the Configuration hub is retired |
| **20** Shared Services | Not a UI module. `03_Module_Architecture.md` describes it as a cross-cutting service layer, which in V2 terms is **kernel + capability territory**, not a Hub member. Placing it under a Hub would contradict `01_ARCH` §5 |
| **Feature Flags** ([bo-31](../backoffice/31_Feature_Flags.md)) · **Experimentation** ([bo-32](../backoffice/32_Experimentation_AB_Testing.md)) | Approved v1.1 documents that are **not** among the 20 numbered modules. `01_ARCH` §2.2 lists *A/B Testing* under Marketing, so Experimentation has a home; Feature Flags is a Configuration Provider concern (`FOUNDATION_01_CONTRACTS.md` §7), not a module. Recorded so the omission is deliberate |

## 3. Reconciling the two hubs registered today

Both predate this taxonomy. Neither is in `01_ARCH` §2.2.

| Registered hub | Contains | Disposition |
|---|---|---|
| `tappy.hub.dashboard` | `dashboard.home` → `/admin` | **RENAME to `tappy.hub.founder`.** It is the Founder Hub under a placeholder name; module 01 is a Founder module |
| `tappy.hub.configuration` | `configuration.settings` → `/admin/settings` | **HOLD.** Blocked on the module 17 decision in §2. Retiring it before that decision would move a live route on a guess |

A hub id is part of a module's manifest and of the audit trail (`controller.hub.registered`). Renaming is therefore a migration with a real cutover, not a string edit — it is scheduled as its own phase step, not folded into unrelated work.

## 4. Two source defects found while reconciling

Recorded because both mislead a reader, and neither is fixed here.

1. **`docs/backoffice/03_Module_Architecture.md` numbers itself twice, inconsistently.** The Mermaid overview graph uses `M12 RBAC`, `M13 Audit Log`, `M17 Reporting`, `M18 Settings`, `M21 Developer Tools`. The section headings — the structure this document treats as authoritative — use `## Module 12 — Audit Log`, `## Module 13 — Role-Based Access Control`, `## Module 07 — Reporting`, `## Module 17 — Settings`, `## Module 18 — Developer Tools`. The graph also names an `M21` in a 20-module set. **This taxonomy uses the headings.**
2. **`01_ARCH` §2.2 marks six modules "✅ exists today".** Five do (`analytics.auth`, `analytics.activation`, `commerce.deals`, `security.rbac`, `security.audit`). The sixth depends on reading `Analytics ✅` as one module or two. Not a defect that changes any placement above.

## 5. What this unblocks

Phases 8–10 (business Hubs and their modules) may proceed against §1. Rows marked ❌ are scope, not commitments of date. Rows in §2 are **blocked pending an Owner decision** and must not be implemented on an assumption.
