# TappyAI V3 — Screen Specification

**Phase:** 4A — **Revision V2** (post human review) · **Status:** Reflects APPROVED decisions
**Implementation:** NOT STARTED · **Production:** UNCHANGED · **Phase 4B:** BLOCKED

> **Revision V2 — binding constraints applied throughout**
> - **S-01 Home is AI-first but NOT Chat** — no thread, no streaming, no in-place replies;
>   submitting navigates to S-02. **No tool removed.** (DD-002 / OD-1)
> - **Five tabs unchanged**; no Inbox tab (DD-003, OD-4 HOLD).
> - **S-07 Explore keeps its identity**; bridge only (OD-2). **S-08 Deals stays top-level** and is
>   not a Marketplace (OD-3).
> - **S-04 Comparison:** ≤4 entities, ≤6 differing attributes, identical rows collapsed, explicit
>   reason; **no dedicated route** (DD-005).
> - **S-05 Confirmation:** Web modal / App sheet; boundary visible; AI is never the authority
>   (DD-006).
> - **S-11 Notifications:** presentation and destination only (DD-012).
> - **Spacing:** specs state values, not token names — OD-5 is on HOLD.

Screen-by-screen specification for the surfaces Phase 4 touches. Screens not listed are
**unchanged** and out of Phase 4's scope.

**State vocabulary** (every screen declares all that apply): `default` · `loading` · `streaming` ·
`empty` · `error` · `partial data` · `unknown data` · `offline` · `disabled` · `confirmation` ·
`success`.

---

## S-01 · Home

**Purpose.** Give a person the shortest path from "I need something" to a consultation, while
keeping every existing capability reachable.
**User intent.** Start a request · resume something · browse · reach a tool.
**Entry points.** App launch · Home tab · logo · deep link `/`.

**Information hierarchy**

| Rank | Element | Collapsible |
|---|---|---|
| 1 | Greeting + composer | No |
| 2 | Contextual prompt chips | No |
| 3 | Fast starts — voice/camera/nearby (**App only**) | No |
| 4 | Continue (recent threads / active plans) | Hidden when empty |
| 5 | **For You** — discovery/content preview (ND-001) | Hidden on failure |
| 6 | Tools, grouped | Yes — "see all" |

**Primary CTA.** Ask Tappy (composer) — **submitting navigates to S-02**.
**Secondary.** Fast starts (App) · resume · open a tool · open discovery.
**AI behaviour.** **None on this screen.** Home never streams, never renders a thread, and never
displays an assistant reply in place. Contextual chips may vary with **signals already available**
(category, recent activity, time of day) — **no new profiling, scoring or ranking** (ND-001); they
are **suggestions, never claims**.
**Structured UI.** None — Home is navigational.

> **Binding limit (DD-002 / OD-1).** Home is AI-first in *hierarchy*, not in *behaviour*. It is a
> door to the assistant, not the assistant itself. Tools stay on Home; **none is removed**.

> **"For You" — binding definition (ND-001).** A **discovery/content preview** surface built on
> **existing V3-available content sources — exact source to be validated during implementation.**
> It is **not** a personalization system. It must not require, and Phase 4 must not build: user
> profiling infrastructure · a recommendation or ranking engine · behavioural scoring · a
> personalization backend · new AI ranking logic. If no content is available, the section is
> **hidden**, never filled with placeholder or invented items.

**States**

| State | Behaviour |
|---|---|
| default | Full layout |
| loading | Skeletons for Continue + For you; **composer usable immediately** |
| empty (new user) | No Continue; general prompt chips |
| error | Failing section omitted silently; composer and tools unaffected |
| offline | Composer disabled with plain explanation; offline-capable tools stay enabled |
| partial data | Sections render independently; one failure never blocks another |

**Responsive / native.** Web: 1 column, tools 2→3-up, capped at 768px, centred on desktop.
App: fast-start row is mobile-only; For you scrolls horizontally.
**Accessibility.** Composer is a labelled control, not a bare input · tool tiles ≥44×44 with text
labels (never icon-only) · groups are real headings · logical focus order.
**Trust.** No fabricated personalisation. No banner implies Tappy acted on the user's behalf.

---

## S-02 · Chat thread

**Purpose.** The consultative loop: understand → clarify → recommend → compare → decide → act →
follow up.
**User intent.** Get help making a decision.
**Entry points.** Composer · prompt chip · Continue · "Ask Tappy about this" · "Continue in chat" ·
notification deep link · `/chat?q=` · `/chat/[id]`.

**Information hierarchy.** Latest exchange → structured blocks in the latest reply → actions →
follow-ups → history above.

**Primary CTA.** Contextual — the primary action of the latest structured block, else the composer.
**Secondary.** Message actions (copy/share/speak/like/regenerate) · alternatives · comparison ·
attachments.

**AI behaviour.** Understands goal and constraints · clarifies **only when genuinely needed**
(≤1 clarification turn, ≤2 questions) · presents options · explains trade-offs · recommends **with
reasoning** · states uncertainty explicitly · **never executes** a consequential action.

**Structured UI.** `RecommendationCard` · `DecisionBlock` · `OfferRow` · `MatchBadge` ·
`ComparisonBlock` · `PlanCard` · CTA row · `FollowUpChips` · `ConfirmationPrompt`.

**States**

| State | Behaviour |
|---|---|
| default | Full thread; actions available |
| loading | Typing dots + rotating hint + tool hint |
| streaming | Progressive text; **no layout shift**; blocks only when complete; actions suppressed; stop available |
| empty | Greeting + 3 contextual prompts |
| error | Typed taxonomy (auth / quota / network / safety / unknown); **user input preserved** |
| partial data | Block renders with what exists |
| unknown data | Explicit "chưa rõ" — **never blank, never inferred** |
| offline | Composer disabled; thread readable; draft preserved |
| disabled | Send disabled while empty; actions disabled while streaming |
| confirmation | Modal (Web) / sheet (App); cancel safe; navigate-away cancels |
| success | Plain result line |

**Responsive / native.** Web: 768px column, bubbles 85%/75%, comparison inline-expandable.
App: full width − gutter, comparison in a sheet, keyboard-inset-aware composer.
**Accessibility.** `aria-live="polite"` for streaming · comparison is a real table with headers ·
every action labelled · ≥44×44 targets · focus never trapped mid-stream · reduced motion disables
the streaming cursor.
**Trust.** No marker, JSON, model name or tool name ever visible · advice is visually distinct from
action · nothing consequential without confirmation · the assistant never claims to have acted.

---

## S-03 · Recommendation set *(a block within S-02, not a destination)*

**Purpose.** Turn consultation into a small number of concrete, comparable options.
**User intent.** "Show me what you'd actually pick, and why."
**Entry points.** A consultative turn in S-02 that produced one or more options. No other entry —
this block has no route of its own.
**Hierarchy.** Leading recommendation → compact alternatives → comparison entry → follow-ups.
**Primary CTA.** The leading option's action. **Exactly one primary.**
**Secondary actions.** Open an alternative · "So sánh N lựa chọn" (→ S-04) · secondary action on
the lead card (e.g. map) · message actions on the parent message.
**AI behaviour.** Supplies the options, the ordering, the match verdicts and the recommendation
**with its reason**. The client renders only what the backend supplied — it groups nothing and
infers nothing.
**Structured UI.** `RecommendationCard` (lead) + `OfferRow` rows + `MatchBadge`.

**States**

| State | Behaviour |
|---|---|
| default | Lead card + compact alternatives + comparison entry |
| loading | None of its own — it appears only when the parent message completes |
| streaming | **Not rendered.** Structured blocks never appear partially (S-02 streaming rule) |
| empty | Block omitted entirely; the reply stays prose-only. Never an empty card frame |
| error | If the block cannot be decoded it is **stripped, not shown** — prose still renders |
| partial data | Card renders with the slots it has; a missing image collapses rather than showing a placeholder box |
| unknown data | "chưa rõ" with the `chua_ro` badge |
| disabled | Actions suppressed while the parent message is still streaming |
| confirmation | Delegated to S-05 when an action is consequential |
| success | Delegated to S-05 |

**Responsive / native.** Web: full column width inside the 768px thread. App: full width minus
gutter; alternatives expand in place.
**Accessibility.** The block is a labelled region · the lead card's title is a heading · match
badges carry text, never colour alone · every action has an accessible name · targets ≥44×44.
**Trust.** Every value is backend-supplied · nothing is grouped or inferred client-side · the
recommendation always carries a stated reason · alternatives are never hidden.

---

## S-04 · Comparison

**Purpose.** Resolve several viable options into one decision.
**User intent.** "Which of these should I actually choose, and what's the difference?"
**Entry points.** "So sánh N lựa chọn" on a recommendation set (S-03). **No dedicated route**
(DD-005) — Web expands inline; App opens a bottom sheet.
**Hierarchy.** Entities (≤4) × differing attributes (≤6) → recommendation + **reason** → actions.
**Primary CTA.** Act on the recommended entity.
**Secondary actions.** Act on a non-recommended entity · collapse / dismiss · scroll the
attribute grid.
**AI behaviour.** Supplies the entities, the comparable attributes, the recommendation and its
**reason**. The client selects nothing and ranks nothing.
**Structured UI.** `ComparisonBlock` (+ `MatchBadge`, `OfferRow` where the entities carry them).

**States**

| State | Behaviour |
|---|---|
| default | Grid + recommendation + reason + actions |
| loading | Derived from an already-received recommendation set — **no separate fetch, no spinner** |
| streaming | Not applicable; offered only after the parent message completes |
| empty | **Not offered below 2 entities** |
| error | If the block cannot be assembled the entry point is not shown; S-03 remains usable |
| partial data | Attribute missing for one entity → "chưa rõ"; missing for **all** entities → row dropped |
| unknown data | "chưa rõ" — never blank, never inferred |
| disabled | Entry suppressed while the parent message is streaming |
| confirmation | Delegated to S-05 |
| success | Delegated to S-05 |

**Responsive / native.** Web: inline, expandable, horizontal scroll with a pinned attribute column
on narrow widths. App: bottom sheet (a 4-column table is unreadable at 360dp).
**Accessibility.** Real table semantics · headers associated with cells · never below `small`
text · the scrollable region is keyboard-reachable and announced · collapse/expand state exposed.
**Trust.** Identical rows collapse (no false differentiation) · **a recommendation without a
stated reason is not shipped** · no entity is hidden to simplify the grid.

---

## S-05 · Confirmation

**Purpose.** Make the action boundary visible: the user decides, the Controller executes.
**User intent.** "Before this actually happens, tell me exactly what it does."
**Entry points.** Any irreversible, financial, outward-facing or destructive action — from S-03,
S-04, S-06 (a consequential step), or a tool surface.
**Hierarchy.** What will happen → what changes → confirm / cancel.
**Primary CTA.** Confirm (never default-focused for destructive actions).
**Secondary actions.** Cancel (always safe, always reachable) · dismiss (equivalent to cancel).
**AI behaviour.** **None. The AI does not confirm and does not execute.** It prepared the
recommendation; the user decides here; the Controller executes afterwards. This screen is the
visible form of that boundary.
**Structured UI.** `ConfirmationPrompt`.

**States**

| State | Behaviour |
|---|---|
| default | Consequence stated; confirm + cancel |
| loading | In flight; **both buttons disabled**; no double-submit |
| streaming | Not applicable |
| empty | Not applicable — never shown without an action to confirm |
| error | What failed + what to do. **The action is not retried silently** |
| partial data | If the consequence cannot be stated in full, the action is **not offered** |
| unknown data | Never guessed — an unknown consequence blocks the action |
| disabled | Confirm disabled until the consequence is fully rendered |
| confirmation | This *is* the confirmation state |
| success | Plain result line; the prompt closes |

**Responsive / native.** Web modal (focus-trapped, Esc = cancel, focus restored on close).
App bottom sheet (swipe-dismiss = cancel).
**Accessibility.** Focus moves to the prompt on open · the consequence is announced · cancel is
always reachable · destructive confirm is never the initial focus.
**Trust.** States the real consequence, never "Are you sure?" · destructive variants name the
object · **abandonment fails closed** · the result is always reported · the UI never implies the
assistant has financial authority.

---

## S-06 · Plan

**Purpose.** Present a multi-step outcome as something followable.
**User intent.** "Give me the plan, and let me act on it step by step."
**Entry points.** A planning turn in S-02 · Home "Continue" (an active plan) · a notification
deep link (S-11).
**Hierarchy.** Title → steps (≤5 visible, then "show all") → per-step actions → completion.
**Primary CTA.** The active step's action.
**Secondary actions.** Expand "show all" · act on a non-active step · message actions on the
parent message.
**AI behaviour.** Supplies the plan, its steps and their order. The client **never invents,
reorders, merges or drops a step.**
**Structured UI.** `PlanCard`.

**States**

| State | Behaviour |
|---|---|
| default | Title + steps + per-step actions |
| loading | None of its own — appears when the parent message completes |
| streaming | **Not rendered until complete** (a half-arrived plan is never shown) |
| empty | Block omitted; the reply stays prose-only |
| error | An undecodable plan is **stripped, not shown**; prose still renders |
| partial data | **A truncated plan says so plainly.** Steps are never silently dropped |
| unknown data | A step without a time simply omits the time — never a guessed one |
| disabled | Step actions suppressed while the parent message is streaming |
| confirmation | A consequential step delegates to S-05 |
| success | Step marked done; completion updates |

**Responsive / native.** Web: full column width; collapse after ~5 steps. App: same, with the
step list scrolling inside the card rather than the thread.
**Accessibility.** Steps are a real ordered list · status is text, not colour alone · each step
action has an accessible name naming its step · targets ≥44×44.
**Trust.** Steps and their order are backend-supplied; the client never invents or reorders ·
truncation is always disclosed.

---

## S-07 · Explore (feed)

**Purpose.** Discovery for users without a formed question.
**V3 change.** **One additive affordance** — "Hỏi Tappy về chỗ này". Feed behaviour, TikNav and
the always-dark treatment are **unchanged**.
**States.** Unchanged, plus `offline` (cached items readable; the ask affordance disabled).
**Trust.** The affordance carries an **entity reference**, never a fabricated question.

---

## S-08 · Deals

**Purpose.** Browse current offers.
**V3 change.** Same additive affordance. No commerce behaviour is added — commerce is FUTURE.
**Trust.** Prices and terms are shown exactly as supplied; the assistant never restates a price it
cannot source.

---

## S-09 · Tools

**Purpose.** Preserved utilities (Scan · Scam Shield · Split Bill · Translate · Currency ·
Group Dining · Music · Fortune · Viet Content · Games · Price Watch).
**V3 change.** Restyle to tokens as files are touched; **"Tiếp tục trong chat"** where a tool
produces a discussable result. **Function, routes and behaviour unchanged.**
**Trust.** Scam Shield's verdicts and copy are **not** redesigned — it is completed work and out
of scope for redesign.

---

## S-10 · Profile / Account

**Purpose.** Identity, history, preferences, subscription, notifications, legal.
**V3 change.** Token restyle only. Notification location pending **OD-4**.
**States.** Unchanged.
**Trust.** Account status and subscription state are shown exactly as the backend reports them.

---

## S-11 · Notifications *(App)*

**Purpose.** Bring the user back to a specific object.
**Entry.** Push · in-app inbox.
**V3 change.** **Presentation and destination only.** Delivery, consent and push-identity
implementation are untouched.
**States.** `empty` (no notifications) · `error` (fetch failure, cached list readable) · `offline`.
**Trust.** Lands on the specific object, never a generic tab · plain language, no internal ids ·
**never implies an action was taken on the user's behalf.**

---

## S-12 · Login / Onboarding

**Purpose.** Authenticate; capture nothing that is not needed.
**V3 change.** Fix the hard-coded `Đăng nhập để tiếp tục` (audit §5.3) so an English session sees
English. Token restyle. **No auth logic changes.**
**Trust.** Transcript is preserved across login (already implemented — preserve it).

---

## Screens explicitly NOT in Phase 4

Controller / Back Office (`/controller`, `/admin`) · Legal and How-to-use content ·
Scam Shield verdict logic · Reviews composer and feed mechanics · Subscription/payment flows ·
any Marketplace, Tappy Business or CS-Cart surface.

---

## Cross-screen invariants

Applies to every screen above:

1. **Unknown is shown as unknown.** Never blank, never inferred, never fabricated.
2. **No internal vocabulary reaches the user** — marker, JSON, model, role, planner, tool, token,
   orchestration, inference, or cost mechanic.
3. **Advice ≠ action.** Consequential actions are always confirmed and always reported.
4. **User input is never lost** to an error, a navigation, or a stream interruption.
5. **Every interactive element** meets ≥44×44, has an accessible name, and shows visible focus.
6. **Colour is never the only carrier of meaning.**
7. **Structured results are persisted and re-read, never regenerated.**
8. **No layout shift** during streaming.
