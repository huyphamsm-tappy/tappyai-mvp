# TappyAI V3 — Web Visual Redesign: Current → Target → Change

**Scope:** Web only. Android and iOS are untouched in this pass.
**Visual source of truth:** the supplied V3 Web reference screenshot, read together with the
approved Phase 4A design package.
**Baseline:** `v3-phase4b-baseline` (`055138d`) on `design/v3-phase4`.

---

## 0. Two recorded decisions the reference resolves

Both are called out here rather than silently contradicted.

### 0.1 OD-6 / DD-010 — the desktop sidebar

`V3_WEB_DESIGN_PROPOSAL.md` recorded **"responsive only, no persistent sidebar"** as the V3
direction, marked **🟡 PROVISIONAL — subject to final Web design approval**, with the sidebar
listed as a deferred alternative.

The reference has a **persistent left sidebar** as its primary navigation. Since OD-6 was
explicitly provisional pending exactly this review, the reference **is** the final Web design
approval, and OD-6 now resolves in favour of the sidebar.

**Status change: OD-6 🟡 PROVISIONAL → ✅ RESOLVED (persistent sidebar at desktop widths).**
Mobile keeps the bottom tab bar; the sidebar is a desktop affordance, not a replacement for it.

### 0.2 "Home is not a dashboard"

The Phase 4A audit criticised the old Home as "a tool launcher… ~12 near-equal tiles with no
hierarchy" (IA-1, IA-2). The reference is unmistakably **dense and multi-panel**. That is not a
reversal, because the two differ on the point that actually mattered:

| Old Home | V3 reference |
|---|---|
| Search box above a flat grid of ~12 equal tiles | A **hero that is the assistant** — greeting, Tappy, composer, quick chips, personalised cards |
| No hierarchy; everything the same weight | Clear rank: AI Agent panel dominates, everything else is a supporting panel with its own header and "Xem tất cả" |
| Tools were the page | Tools are one row near the bottom |

So the reference keeps DD-002 intact: **the assistant is the primary action and the top of the
visual hierarchy**, and Home is still Home — it never renders a thread. Density is not the defect;
undifferentiated density was.

---

## 1. Global Web Shell

| | |
|---|---|
| **Current** | Light theme. Sticky top `Header` (logo, language, avatar) + fixed bottom `BottomNav` (5 tabs) at every width. Single centred 768px column. No sidebar, no desktop nav. |
| **Target** | Dark app shell. **Left sidebar** (~230px): brand lockup, grouped nav — Trang chính / Cộng đồng / Thương mại / Công cụ & tiện ích / Tài khoản / Cài đặt — plus a Premium upsell card pinned at the bottom. **Top bar**: page title + subtitle on the left, a centred pill **tab bar** (AI Agent · Explore · Deals · Marketplace · Inbox · Tools), and right-hand controls (notifications with badge, messages, avatar+plan, primary CTA). Content is a **wide multi-column grid**, not a 768px column. |
| **Change** | New `V3Shell` (sidebar + topbar + tabs) wrapping the redesigned surfaces. Dark token layer added. `Header`/`BottomNav` retained for routes not yet migrated and for mobile. |

## 2. Home

| | |
|---|---|
| **Current** | Hero gradient card (greeting + search) → suggestions → categories → Continue → tools heading → nine tool sections. One column. |
| **Target** | **Row 1:** `AI AGENT — HOME` panel (greeting "Hi Huy! 👋", Tappy mascot, Ask-Tappy composer with mic + send, quick-suggestion chips, then a **"Gợi ý dành cho bạn"** card strip with rating/price/category) · `EXPLORE — VIDEO FEED` panel (category tabs + video cards with view counts) · `INBOX` panel (filter chips + message rows + "Xem tất cả"). **Row 2:** `DEALS / GROUPON` · `MARKETPLACE` (reserved) · `SCAM SHIELD` · `AI PLANNER` · `POST / UPLOAD`. **Row 3:** `SMART TOOLS` strip. **Row 4:** `SAVED` · `HISTORY` · `MY PLANS` · `AI CAPABILITIES` · `PROFILE`. Footer capability bar. |
| **Change** | Home is rebuilt as a V3 panel grid, not the old column reordered. Every existing capability keeps a home; none is deleted. |

## 3. Explore

| | |
|---|---|
| **Current** | `/reviews` feed with its own TikNav, always-dark, global nav hidden. |
| **Target** | Same discovery capability in V3 visual language: category tabs (For You / Following / Food / Travel / Lifestyle / Shopping / Entertainment), media cards with creator handle, title, view count. The **Chat bridge is preserved**. |
| **Change** | Home gets an Explore *panel*; the full `/reviews` surface keeps its identity (OD-2) and is restyled only where it meets the shell. |

## 4. Deals

| | |
|---|---|
| **Current** | Card list, light theme, partner logo + discount badge + voucher. |
| **Target** | V3 dark card treatment: filter chips (Tất cả / Ăn uống / Du lịch / Làm đẹp / Giải trí), thumbnail, discount pill, strike-through original price, "Lấy deal" action. Stays a separate top-level capability. |
| **Change** | Restyle. **Not** merged into Marketplace. |

## 5. Marketplace — RESERVED

| | |
|---|---|
| **Current** | Does not exist. |
| **Target** | The reference shows it in the nav and as a Home panel with product tiles. |
| **Change** | **Place reserved only.** A nav entry and a Home panel that state plainly it is coming, with **no catalogue, cart, checkout, payment, merchant onboarding or CS-Cart UI**, and **no fabricated products or prices**. Commerce remains FUTURE (DD-001, DD-013). |

## 6. Inbox / Notifications

| | |
|---|---|
| **Current** | Unread badge on the Explore tab; inbox lives inside Explore (OD-4 HOLD). |
| **Target** | An Inbox panel on Home and a top-bar bell with a count — filter chips (Tất cả / Tin nhắn / Thông báo / Hoạt động) and message rows with avatar, title, preview, timestamp. |
| **Change** | **Presentation only.** Delivery, consent and push identity are untouched. OD-4 stays held: this adds a *surface*, not a sixth tab, and does not relocate the existing inbox. |

## 7. Tools

| | |
|---|---|
| **Current** | Nine separate stacked sections dominating Home. |
| **Target** | One `SMART TOOLS` strip of compact, uniform tiles — icon, name, one-line description — with "Mở tất cả". |
| **Change** | Presentation only. **Every tool preserved**, same routes. |

## 8. Profile

| | |
|---|---|
| **Current** | `/profile` list of links. |
| **Target** | A `PROFILE (ME)` panel: avatar, name, plan badge, post/follower/following counts, "Xem profile". |
| **Change** | Presentation only; account and auth behaviour untouched. |

## 9. Chat

| | |
|---|---|
| **Current** | 768px thread; structured blocks wired (Phase 4B) but styled for the light theme. |
| **Target** | One coherent V3 conversation — the same structured components in the V3 dark card language, reading as one product rather than a component showcase. |
| **Change** | Restyle the existing components. **No behaviour change**; the marker contract, the action boundary and the honesty rule all stand. |

## 10. Responsive

| | |
|---|---|
| **Current** | Single column at every width. |
| **Target** | Desktop: sidebar + multi-column grid. Tablet: sidebar collapses to icons, grid reflows to 2 columns. Mobile: no sidebar, bottom tab bar returns, panels stack in the same priority order. |
| **Change** | The hierarchy survives the reflow — the assistant stays first at every width. |

---

## Guardrails held throughout

- No backend, API, AI, Phase 1 consultative, Phase 2 cost, Phase 3 security, auth or notification-delivery changes.
- No Marketplace functionality and no CS-Cart UI.
- No Android or iOS changes in this pass.
- No production deployment.
- Every existing capability keeps a route and a home in the new composition.
