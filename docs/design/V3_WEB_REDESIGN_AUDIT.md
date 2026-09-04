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

## 0.0 CORRECTION — the roadmap is an order of PAGES, not a Home composition

> **What went wrong.** The implementation roadmap — shell → Home → Explore → Deals → Marketplace
> → Inbox → Tools → Profile → Chat → responsive — was read as a **list of panels to put on Home**.
> The result was a fifteen-panel Home rendering a slice of every destination in the product:
> an Explore feed, an Inbox, Deals, Marketplace, Scam Shield, AI Planner, Post/Upload, Saved,
> History, AI Capabilities and a Profile panel, all on one screen.
>
> **What it actually means.** Each roadmap item is a **separate page with its own route and its
> own composition**. Design page 1 → finish it → visually review it → design page 2. Never
> page 1 + page 2's content underneath it.

**Home now contains exactly the four sections `V3_WEB_DESIGN_PROPOSAL §2.1` approves** and nothing
else:

| # | Section | Source |
|---|---|---|
| 1 | Greeting · Tappy · Ask-Tappy composer · contextual chips | — |
| 2 | **Tiếp tục** — ≤2 recent threads, or the guest/empty state | server `conversations` |
| 3 | **Dành cho bạn** — discovery/content preview, **omitted entirely when empty** (ND-001) | server `suggestions` |
| 4 | **Công cụ** — ten tools in the three named groups the layout specifies | existing routes |

**Nothing was deleted.** Every destination removed from Home is reached through the shell's
navigation, and every tool route still has a tile on Home — `/recommendations` gained one it never
had. "Off Home" is not "gone".

**Why the tests did not catch it.** They asserted *every capability is reachable from Home*, which
a dashboard satisfies perfectly — they measured the wrong property. `homeAiFirst.test.tsx` now
asserts the inverse: Home renders **exactly four** `data-home-section` regions and reproduces no
other destination's content. Reachability is the shell's job and is guarded where the shell lives.

**Still to do, one page at a time.** §3–§9 below were implemented under the previous reading. Each
is a real separate route with its own composition — none of them is Home content — but each still
needs its own design pass and its own visual review gate, in roadmap order, before it can be
called done.

---
## 0.1 VISUAL POLISH PASS — grid, theme control, brand art

A correction pass against the approved reference. No page structure changed; Home is still Home,
Explore still Explore, Marketplace still reserved.

### The grid was never defined anywhere

The sidebar width, the header height and the content width were written as literals at each call
site, so pages had no shared grid to disagree about — and duly disagreed. They are tokens now
(`--v3-sidebar-w` 240 · `--v3-header-h` 64 · `--v3-content-max` 1160 · `--v3-gutter` 28), and one
`.v3-container` carries both the header row and `<main>`, so a page title and the content under it
share a left edge by construction rather than by coincidence.

**Measured after the change, at 1440:** header title, hero, "Tiếp tục" heading and "Công cụ"
heading all begin at **x=286**; the header's right control ends at **x=1390**, the same line the
content ends on; no horizontal overflow.

Two misalignments were found by measuring rather than looking, and both were invisible in a
screenshot but wrong:

| | |
|---|---|
| **1px hairline stagger** | The sidebar's brand block put its border *inside* a 64px box (border-box); the header put its border *outside* one. The two hairlines across the top of every page sat at y=64 and y=65. |
| **2px heading inset** | `px-0.5` on the section headings pushed every one of them 2px right of the grid line its own cards sit on. |

Home also stopped declaring its own `max-w-[720px]`: a second, narrower container inside the
shell's container is what left the page stranded in empty space on a wide screen. Pages now choose
a **column count**, never a width.

### The Light/Dark control

Added to the header, beside the notification control. It reuses the app's existing mechanism and
adds no second one: the `dark` class on `<html>`, persisted under `localStorage.theme` — exactly
what `Header.tsx` has always done. That logic moved into `useThemeMode` so the two surfaces share
one implementation instead of holding two copies that drift.

🚨 The shell used to render `className="v3-theme dark"` — it pinned itself to dark. With that
literal in place a toggle could exist, look right, pass tests and change nothing on screen. The
class is gone and `.v3-theme` / `.dark .v3-theme` carry the two palettes.

### The accent was one token doing two contradictory jobs

`--v3-accent` was both interactive **text** on a dark ground (wants to be light) and a **fill**
under white text (wants to be dark). It cannot be both, and the shipped value was not: **white on
`#3391FF` measures 3.17:1**, so every filled button on the surface — send, "Chat ngay", "Lấy deal",
the Premium upsell — was below AA while the palette comment claimed the accent passed. Split into
`--v3-accent` (text/icon) and `--v3-accent-fill` + `--v3-on-accent`; 11 filled controls moved.

### Brand art — found, not drawn

| | |
|---|---|
| **Logo** | The sidebar drew a `Sparkles` glyph beside hand-styled text — a wordmark invented at the call site. It now renders `/branding/otter-logo.png`, the app's established mark (favicon, `Header`, login, onboarding; `controllerLoginComposition.test.tsx` already names it approved brand art) with Header's own `rounded-[22%] object-cover` treatment. |
| **Mascot** | Already the approved asset — `TappyMascot` over the owner's 18-pose library at `/tappy/<pose>.png`, `welcome` on Home. Two real faults fixed: it was declared `size={40}` (the default) and stretched to 80px by a class, so its intrinsic size disagreed with its layout; and at a fixed 104px it squeezed the greeting on a 375px screen hard enough to push the wave emoji onto its own line. It is declared at its rendered size and scales down on narrow screens. **No new mascot art was made, and none of the 18 poses was altered — art is the owner's domain.** |

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
| **Done** | ✅ Feed mechanics, tab set, TikNav model and immersive black media stage all **unchanged**. The chrome now speaks V3: the desktop sidebar carries the same brand lockup, panel surface, hairline and accent as `V3Shell` (it was pure black with a `#fe2c55` CTA and a `white/10` active state); the bottom nav and its unread badge move to V3 tokens; the search and inbox panes sit on the V3 ground instead of `#000`. The Chat bridge on `/reviews/[id]` is untouched. |
| **Page pass** | ✅ Reviewed as its OWN page, not as a Home panel. The global shell nav stays hidden here exactly as the approved layout requires — Explore keeps its own sidebar and tab bar, and this pass did not give it `V3Shell`. |
| **The one change** | The approved layout allows Explore **one** addition: a bridge into `/chat` carrying an entity reference. It existed on the detail view but **not on the feed**, which is where the layout sketch puts it. It now sits on the feed item under the caption and place line — deliberately **not** on the action rail, where a filled accent control would have been the brightest thing on the surface and would have changed the rail's identity (OD-2). |
| **Honesty** | 🚨 The bridge shares the place line's `isShareOnlyName` guard: **no place, no bridge.** One built from an empty name looks like a working button and opens a thread about nothing. It carries *what the item is*, never *what the user wants* — that text arrives in the thread as if the user typed it. |
| **Not visible on dev data** | ⚠️ Both reviews in this dev database are share-only posts (`place_name` = "Chia sẻ"), so the bridge is correctly **invisible** there — the guard working, not a missing feature. The visible branch is proven by `exploreAskTappyBridge.test.tsx`, mutation-checked: replacing the guard with `true` fails the test. |

## 4. Deals

| | |
|---|---|
| **Current** | Card list, light theme, partner logo + discount badge + voucher. |
| **Target** | V3 dark card treatment: filter chips (Tất cả / Ăn uống / Du lịch / Làm đẹp / Giải trí), thumbnail, discount pill, strike-through original price, "Lấy deal" action. Stays a separate top-level capability. |
| **Change** | Restyle. **Not** merged into Marketplace. |
| **Done** | ✅ Deals now renders inside `V3Shell` as a responsive tile grid on the V3 ground. Filter chips are **derived from the categories actually loaded**, so a chip never promises deals that do not exist. Voucher copy, countdown, brand logos, click tracking, the notify button, the MFS 3.10 disclosure and the `AskTappyButton` bridge all survive unchanged. |
| **Not done, deliberately** | ⛔ **No struck-through original price.** The reference shows one; `/api/deals` has no original-price field, and inventing "was 250k" is a price claim this product cannot source. ⛔ **No thumbnail yet.** `bannerImage` *is* in the payload, but `androidDealsParity.test.ts` derives Android's required field set from `DealsView.tsx`, and Android's `DealDto` does not decode it — rendering it here would put Web silently ahead of Android. Android is out of scope for this pass, so the thumbnail is **deferred to the Android/iOS parity pass**. |

## 5. Marketplace — RESERVED

| | |
|---|---|
| **Current** | Does not exist. |
| **Target** | The reference shows it in the nav and as a Home panel with product tiles. |
| **Change** | **Place reserved only.** A nav entry and a Home panel that state plainly it is coming, with **no catalogue, cart, checkout, payment, merchant onboarding or CS-Cart UI**, and **no fabricated products or prices**. Commerce remains FUTURE (DD-001, DD-013). |
| **Done** | ✅ `/marketplace` now **resolves**. Adding it to the sidebar and tab bar in §1 without a route left both links 404-ing — a nav entry that dead-ends is worse than no entry. The route states plainly that it is not open, makes **no promise about when**, and points at the two capabilities that do exist today (Deals, Chat). No product, no price, no cart, no checkout, no merchant surface, and no backend call of any kind. |
| **Guarded** | `src/app/marketplace/marketplaceReserved.test.tsx` pins both halves: that the route resolves, and that it stays empty of commerce. It also walks **every `href` in `V3Shell`** against the real route tree, so no future nav entry can 404 the way this one did. |

## 6. Inbox / Notifications

| | |
|---|---|
| **Current** | Unread badge on the Explore tab; inbox lives inside Explore (OD-4 HOLD). |
| **Target** | An Inbox panel on Home and a top-bar bell with a count — filter chips (Tất cả / Tin nhắn / Thông báo / Hoạt động) and message rows with avatar, title, preview, timestamp. |
| **Change** | **Presentation only.** Delivery, consent and push identity are untouched. OD-4 stays held: this adds a *surface*, not a sixth tab, and does not relocate the existing inbox. |
| **Done** | ✅ The Home Inbox panel and both shell badges now read the app-level notification store (ADR-014) — the same source the bottom nav already used. Filter chips work; an empty store renders the empty state, never a placeholder message. |
| **Fixed** | 🚨 §1 shipped a **permanent rose dot** on the Inbox tab. That told every user something was waiting whether or not it was — a claim about their account with nothing behind it. The badge now shows the real unread count and renders **nothing at zero**. |

## 7. Tools

| | |
|---|---|
| **Current** | Nine separate stacked sections dominating Home. |
| **Target** | One `SMART TOOLS` strip of compact, uniform tiles — icon, name, one-line description — with "Mở tất cả". |
| **Change** | Presentation only. **Every tool preserved**, same routes. |
| **Done** | ✅ Nine uniform tiles on Home under `#smart-tools`, which is where the sidebar and tab bar both point. The panel's "open all" action was **removed**: all nine tools are already on the strip, so it linked to the panel the user was looking at. |

## 8. Profile

| | |
|---|---|
| **Current** | `/profile` list of links. |
| **Target** | A `PROFILE (ME)` panel: avatar, name, plan badge, post/follower/following counts, "Xem profile". |
| **Change** | Presentation only; account and auth behaviour untouched. |
| **Done** | ✅ Both `/profile` views moved into `V3Shell`. Auth is untouched — the server page still does `getUser()` and still renders the guest view for anonymous visitors, and every destination keeps its own server-side check. |
| **Also** | The signed-in and guest screens hand-wrote the same eleven rows twice, each with its own copy of both product-flag gates. They are now one shared inventory (`ProfileRows.tsx`), pinned by `profileRowParity.test.tsx` — "same rows, same order" is the guest screen's whole purpose, and two hand-written lists drift. |
| **Not done, deliberately** | ⛔ No post/follower/following counts. The server sends a conversation count and nothing else; a "0 followers" it never sent is a claim about the user's account. |

## 9. Chat

| | |
|---|---|
| **Current** | 768px thread; structured blocks wired (Phase 4B) but styled for the light theme. |
| **Target** | One coherent V3 conversation — the same structured components in the V3 dark card language, reading as one product rather than a component showcase. |
| **Change** | Restyle the existing components. **No behaviour change**; the marker contract, the action boundary and the honesty rule all stand. |
| **Done** | ✅ Both chat routes now render on the V3 ground with the thread's existing, already-designed dark treatment active, so the conversation reads as part of the same product rather than a light page reached from a dark one. The structured components inherit it through their own `dark:` variants — **they were not rewritten**, because they are shared with `ShoppingDecision` and pinning them to V3 tokens would have broken them on every other surface. Zero behaviour change. |

## 10. Responsive

| | |
|---|---|
| **Current** | Single column at every width. |
| **Target** | Desktop: sidebar + multi-column grid. Tablet: sidebar collapses to icons, grid reflows to 2 columns. Mobile: no sidebar, bottom tab bar returns, panels stack in the same priority order. |
| **Change** | The hierarchy survives the reflow — the assistant stays first at every width. |
| **Verified** | ✅ Rendered at 1440 (desktop), 768 (tablet) and 375 (mobile) on the Phase 4B worktree. Sidebar present at desktop, `display:none` below `lg`; grid reflows 12-col → 2-col → 1-col; bottom nav returns on mobile; AI Agent panel first at every width; **no horizontal overflow at any width** on Home, Deals, Marketplace, Profile or Explore. |
| **Fixed while verifying** | 🚨 **The shell hosted app-level components in their LIGHT variants** — a white bottom nav and a white deal-notify pill on a `#0A0F1C` page. Those components have designed dark variants keyed on Tailwind's class strategy, so the shell now carries `dark` alongside `v3-theme`, the same mechanism the chat routes use. 🚨 **Home's suggestion tiles clipped their text mid-word**: `line-clamp-*` resolves its `display` to `flow-root` on this surface, so the clamp degrades to a hard clip with no ellipsis. The tiles now grow to their content. 🚨 **The Inbox entries pointed at `/profile`**, so the Inbox row opened an account menu and standing on Profile lit the "Inbox" tab; they now point at `/profile/notifications`, and the duplicate "Notifications" sidebar row — a second label for the same idea leading somewhere else again — is gone. |

---

## Guardrails held throughout

- No backend, API, AI, Phase 1 consultative, Phase 2 cost, Phase 3 security, auth or notification-delivery changes.
- No Marketplace functionality and no CS-Cart UI.
- No Android or iOS changes in this pass.
- No production deployment.
- Every existing capability keeps a route and a home in the new composition.
