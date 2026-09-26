# TappyAI V3 — UX Specification

**Status:** UPDATED in Phase 4A — PROPOSED, REQUIRES HUMAN APPROVAL
**Depends on:** `V3_DESIGN_SYSTEM.md` (values) · `MASTER_UX_UI_SPECIFICATION.md` (philosophy)
**Extends:** `V3_PRODUCT_STRUCTURE.md` · `V3_INFORMATION_ARCHITECTURE.md` ·
`V3_SCREEN_SPECIFICATION.md` · `V3_DESIGN_DECISIONS.md`

> **Phase 4A changes to this document**
> 1. §1 journeys are mapped to concrete screens and expanded into a full journey table.
> 2. J7 (Discover) reclassified from "V3 foundation" to **CURRENT V3** (DD-004).
> 3. §8 commerce scope corrected against the V3 master scope: commerce is **FUTURE**; only
>    entity-agnostic primitives are V3 FOUNDATION (DD-001, DD-013).
> Everything else in this document is preserved unchanged.

Defines **what the user sees, what they can do, and what happens at every interaction** for the V3
consultative experience. Behaviour is shared across Web, Android and iOS; presentation is native
(see `V3_PLATFORM_PARITY.md`).

---

## 0. Design commitments

Five rules that resolve every ambiguity below.

1. **V3 must feel like a significantly better TappyAI, not a different app.** Existing merchant
   and user behaviour is preserved. No relearning is required.
2. **Technology stays invisible.** Never show the user: model, role, planner, classifier, tool
   call, orchestration, token, inference, marker, or JSON. This is a hard constraint — §2.1 of the
   audit shows what happens when it is broken.
3. **The interface recedes so the help comes forward** (MUXS §1). Structured UI replaces walls of
   text; it does not add ceremony.
4. **Honesty over completeness.** An unknown value is shown as unknown. The product never
   fabricates a number, a price, or a confidence to fill a slot.
5. **No new interaction complexity.** No new tabs, dashboards, modal chains, or AI concepts to
   learn. Every V3 addition must be understandable without explanation.

---

## 1. Primary journeys

> **Updated in Phase 4A** — each journey is now mapped to concrete screens
> (`V3_SCREEN_SPECIFICATION.md`) so it is implementable. J7 is reclassified from
> "V3 foundation" to **CURRENT V3**: the discovery surfaces already exist; V3 adds one entry
> affordance (DD-004).

| # | Journey | Entry | Screens | Outcome |
|---|---|---|---|---|
| J1 | **Ask → answer** | Home, chat, deep link | S-01 → S-02 | A clear answer with next actions |
| J2 | **Ask → clarify → recommend** | Ambiguous request | S-01 → S-02 → S-03 | A recommendation the user trusts |
| J3 | **Compare → decide** | Multiple viable options | S-03 → S-04 | A confident choice |
| J4 | **Plan** | Multi-step / multi-day intent | S-02 → S-06 | A structured, followable plan |
| J5 | **Act** | A recommendation with an action | S-03/S-04 → S-05 | Action taken, result understood |
| J6 | **Continue** | Any completed turn | S-02 (follow-ups) / S-01 (Continue) | Next step without re-prompting |
| J7 | **Discover** | Browse intent | S-07/S-08 → S-02 | Entities carried into the loop |

### 1.1 Journey detail

Each journey follows the same spine — *goal → entry → screen → interaction → AI response →
structured UI → decision → action → confirmation → follow-up* — and every one of them crosses the
action boundary at the same place.

| | J1 Ask | J2 Consult | J3 Compare | J4 Plan | J5 Act | J6 Continue | J7 Discover |
|---|---|---|---|---|---|---|---|
| **Goal** | Get an answer | Get a trusted recommendation | Choose between options | Get a followable plan | Make something happen | Keep going cheaply | Find something without asking |
| **Entry** | Composer / chip | Composer | Recommendation set | Planning intent | A recommendation's CTA | Follow-up chip / Home Continue | Explore / Deals item |
| **Screen** | S-01 → S-02 | S-02 | S-04 | S-06 | S-05 | S-02 / S-01 | S-07/S-08 → S-02 |
| **Interaction** | Type / speak / attach | Answer ≤2 chips | Expand comparison | — | Tap CTA | Tap chip | "Hỏi Tappy về chỗ này" |
| **AI response** | Direct answer | Clarify once, then recommend **with reasoning** | Attribute set + reason | Ordered steps | *(none — AI does not act)* | Contextual continuation | Contextual opening |
| **Structured UI** | Text + CTA + follow-ups | `RecommendationCard`, `MatchBadge`, `OfferRow` | `ComparisonBlock` | `PlanCard` | `ConfirmationPrompt` | `FollowUpChips` | `RecommendationCard` |
| **Decision** | — | Accept / refine | Pick one | Accept plan | **Confirm or cancel** | — | Ask or return |
| **Action** | — | — | — | Per-step action | **Controller executes** | — | — |
| **Confirmation** | — | — | — | Per step if consequential | **Always** | — | — |
| **Follow-up** | ≤3 chips | ≤3 chips | Act / refine | Next step | Result + next step | Loops | Loops |

**Invariant across all seven:** the AI never crosses from recommendation into execution. J5 is the
only journey that reaches the Controller, and it does so **only** through an explicit user
confirmation (S-05).

---

## 2. Chat flow (J1)

### 2.1 States

```
empty → composing → sending → thinking → streaming → complete
                                   ↓          ↓          ↓
                                 error ←──────┴──────────┘
```

| State | What the user sees | What they can do |
|---|---|---|
| **empty** | Tappy avatar, one-line greeting, 3 quick prompts | Tap a prompt, type, attach, speak |
| **composing** | Live text, send enabled, composer grows | Edit, attach, send |
| **sending** | User message appears immediately, right-aligned | Wait or stop |
| **thinking** | Avatar `active`, typing dots, rotating hint | Stop |
| **streaming** | Text appears progressively; avatar `active` | Read, stop, scroll |
| **complete** | Full message, structured blocks, actions, follow-ups | Everything |
| **error** | Avatar `error`, plain-language cause, recovery action | Retry, log in, edit and resend |

### 2.2 Thinking and tool hints

The existing rotating think-hints and tool-specific hints are **kept**. They are the product's
loading identity (MUXS §7.1) and good perceived-performance work.

**Constraint:** hints describe *what is happening for the user* ("Looking up places nearby…"),
never the mechanism ("calling `places_search` tool"). Existing hints comply; new ones must.

### 2.3 Streaming rules

1. **No layout shift.** Text streams into a container whose width is already final. Structured
   blocks reserve their geometry via skeletons or appear only when complete.
2. **Structured blocks appear complete, never partially.** A half-arrived plan or decision is
   never shown mid-decode. This is not only aesthetic: a partially-parsed block is exactly how
   raw JSON reached users (audit §2).
3. **Actions are unavailable during streaming.** CTAs and follow-ups appear only at `complete`.
   All three platforms already do this — keep it.
4. **Auto-scroll follows the bottom while the user is at the bottom.** If the user scrolls up,
   auto-scroll stops and a "jump to latest" affordance appears. Never yank the viewport.
5. **Stop is always available** while streaming, and stopping preserves the partial answer.
6. Streaming announces via `aria-live="polite"` (never assertive).

---

## 3. Consultative flow (J2)

The defining V3 behaviour: the assistant understands the **goal**, not just the literal query.

### 3.1 Clarification

When information is missing, the assistant asks — but asking must feel like conversation, not a form.

**Rules**
- **At most one clarification turn** before giving value. If the second turn still lacks detail,
  answer with the best available assumption and **state the assumption plainly**.
- **Ask at most 2 questions at once**, and only for information that actually changes the answer.
- Offer **tappable options** alongside the question wherever the answer space is small
  (budget bands, party size, district, timing). A chip is faster than typing and cheaper than a
  second round trip.
- Free-text is always still available. Chips are a shortcut, never a gate.
- The user may **ignore** the clarification and restate. That is not an error.

**Anti-pattern:** a clarification that asks for something the user already said, or that must be
answered before anything useful appears. If the assistant can give partial value now, it does.

### 3.2 Recommendation

Recommendations are **actionable UI, not prose lists**.

Presentation by count:

| Count | Pattern |
|---|---|
| 1 | Single `RecommendationCard`, leading |
| 2–3 | Stacked cards, best first |
| 4+ | One leading card + compact rows (the `ShoppingDecision` shape) |
| Comparable set | `ComparisonBlock` (§4) |

Prose above the block says **why** — one or two sentences, in the user's language. The block
carries the *what*. Never repeat the card's contents in the prose.

### 3.3 Assumptions and confidence

When the assistant proceeds on an assumption, it says so in one short line, and that line is
**editable** — tapping it offers to change the assumption and re-answer. This is the cheapest way
to prevent a wrong answer from becoming a new prompt.

Confidence is expressed as **match verdicts on the entity**, not as a percentage:

| Verdict | Label (vi / en) | Meaning |
|---|---|---|
| `khop` | Khớp / Exact match | Meets the stated request |
| `khac` | Khác / Different | Viable, but differs — the difference is named |
| `chua_ro` | Chưa rõ / Unknown | Not enough information |

Never show a numeric confidence score. It is internal, and users over-read it.

---

## 4. Comparison flow (J3)

A compact pattern — comparison is not a spreadsheet.

**Anatomy:** 2–4 entities as columns; shared attributes as rows; differing values emphasised;
identical values de-emphasised or collapsed.

**Rules**
- **Maximum 4 entities**, **maximum 6 attribute rows**. Beyond that, comparison stops helping.
- Only compare attributes **all entities have a value for**; an attribute missing everywhere is
  dropped, and missing for one is shown as "unknown" (never blank, never inferred).
- **Emphasise difference.** If every entity shares a value, that row is collapsed by default.
- The recommended entity is marked, and **the reason is stated** — a recommendation without a
  reason is an assertion.
- Mobile: horizontal scroll with the attribute column pinned. **Never** shrink text below `small`
  to fit more columns.
- Every entity keeps its primary action inside the comparison.

---

## 5. Structured content patterns

### 5.1 RecommendationCard

| Slot | Required | Notes |
|---|---|---|
| Image | No | 16:9 or 4:3; graceful absence — no placeholder box |
| Title | **Yes** | 2 lines max, then ellipsis |
| Summary | No | 2 lines max; why this, not a description |
| Metadata | No | ≤3 items (distance · rating · category) |
| Price | No | Formatted per locale; a range is a range; unknown is "chưa rõ" |
| Match badge | No | §3.3 |
| Primary action | **Yes** | One only |
| Secondary action | No | One only |

**Rules:** exactly one primary action; the whole card is tappable where a natural detail
destination exists; the card never shows a value the backend did not supply.

### 5.2 DecisionBlock

Generalised from `ShoppingDecision.tsx` — **the existing behaviour is the spec**:
one recommended configuration leads; alternatives remain as compact rows so a valid option is
never hidden; no alternative is promoted to a full card; every verdict, range and recommendation is
read from the backend view, which "groups NOTHING and infers NOTHING".

Anatomy: leading recommendation (title, price range, match badge, offers) · alternative rows ·
optional comparison entry point.

### 5.3 PlanCard

| Slot | Notes |
|---|---|
| Title | What the plan achieves |
| Steps | Ordered; each has a label, optional time, optional place |
| Step status | `pending` / `active` / `done` |
| Step action | Optional — map, book, call |
| Completion | Progress shown when steps have status |

**Rules:** steps are readable without expanding; a long plan collapses after ~5 steps with a
"show all" affordance; a step's action is the *step's*, never the plan's. Truncation must never
lose a step silently — if a plan arrives truncated, say so plainly.

### 5.4 CTA

| Type | Style | Rule |
|---|---|---|
| Primary | Filled `interactive` | **Exactly one** per block |
| Secondary | Outline / ghost | Up to 2 |
| Destructive | `danger` | **Always requires confirmation** (§6) |

**Rules:** labels are verbs in the user's language ("Xem trên Maps" / "View on Maps"); an action
leaving the app is marked; buttons appear only when the message is complete; a failed action says
what failed and what to do — it never fails silently.

### 5.5 FollowUpChips

≤3, latest assistant message only, after streaming completes. Phrased as the *user's* next
utterance ("Rẻ hơn?" / "Cheaper options?"), not as a command to the assistant. Tapping sends
immediately. They disappear when the user types.

Follow-ups are how V3 keeps the conversation cheap and easy at the same time — the user continues
without composing a new complex prompt (see §9).

---

## 6. Confirmation flow

Any action that is **irreversible, financial, outward-facing, or destructive** requires explicit
confirmation. This is where Phase 3's security boundaries become user-facing.

**`ConfirmationPrompt` anatomy:** what will happen (plain language) · what changes · confirm ·
cancel. Cancel is always available and always safe.

**Rules**
1. **The user confirms, never the assistant.** The UI must never imply the assistant has
   authority to spend, transfer, or commit on the user's behalf.
2. Confirmation states the **actual consequence** ("This sends your booking request to X"), not a
   generic "Are you sure?".
3. **Destructive confirmations name the object** and are never the default focus.
4. **The result is always reported** — success or failure, in plain language. A confirmed action
   that silently does nothing is the worst outcome in the product.
5. Presentation: inline for lightweight confirmations; Sheet (mobile) / Modal (web) for
   consequential ones. **Never a modal chain.**
6. **Nothing consequential happens on a single tap without confirmation.** No hidden destructive
   actions (MUXS trust).

---

## 7. Error experience

Plain cause · preserved input · a way forward. The existing web taxonomy is the model:

| Class | Message | Recovery |
|---|---|---|
| Auth required | You need to be signed in to continue | Log in — **transcript preserved across login** |
| Quota reached | Server-owned copy (backend owns quota wording) | Log in / upgrade |
| Network | Connection problem | Retry — message preserved |
| Blocked by safety | What is not possible, without accusation (`warning`, not `danger`) | Rephrase |
| Unknown | Something went wrong on our side | Retry |

**Rules:** never show a stack trace, error code, or model/provider name; the user's message is
**never** lost to an error; errors are announced to assistive tech; the assistant never claims to
have done something it did not do.

---

## 8. Commerce & discovery foundations (J7)

> **Corrected in Phase 4A.** The V3 master scope states that Marketplace, Tappy Business, CS-Cart
> implementation and the commerce ecosystem are **future work**, explicitly outside current V3.
> This section is narrowed accordingly (DD-001, DD-013). Discovery itself (Explore, Deals) is
> CURRENT V3 because those surfaces already exist; V3 adds one entry affordance (DD-004).

Phase 4 prepares the interface; it does **not** build the commerce platform.

**V3 FOUNDATION — design primitives only:** `RecommendationCard` generalised to an entity-agnostic
card (place / product / merchant variants) · `OfferRow` · `MatchBadge` · `ComparisonBlock` ·
`DecisionBlock`. These exist so that a future commerce entity does not force a rewrite.

**Explicitly out of scope for Phase 4:** cart, checkout, payment, order management, merchant
onboarding, catalogue browse, and any commerce-specific navigation.

**Documented extension points** — the primitives are shaped so these can be added later without
redesign:

| Future capability | Extension point |
|---|---|
| Product discovery | `EntityCard` variant `product` |
| Merchant discovery | `EntityCard` variant `merchant` |
| Cart | An action type on `EntityCard`; no new surface |
| Commerce comparison | `ComparisonBlock` with price/offer rows |

**The UI must not look like CS-Cart.** CS-Cart remains the commerce backend/API; the experience is
Tappy's own conversational surface. No CS-Cart layouts, terminology, or navigation reach the user.

---

## 9. Cost-efficiency through UX

Phase 2's cost mechanics are **never** exposed. No token counts, model names, quotas-as-mechanics,
or "cheaper mode" toggles. Instead the interface reduces unnecessary AI work by design:

| Pattern | Effect |
|---|---|
| **Follow-up chips** | The next turn is a short, well-formed prompt instead of a long re-explanation |
| **Clarification chips** | Resolves ambiguity in one cheap turn instead of two wrong expensive ones |
| **Editable assumptions** | Correcting an assumption is a targeted re-ask, not a full restart |
| **Persisted structured results** | A rendered plan or decision is re-read, not regenerated |
| **Explicit action states** | Users don't re-send because they can't tell if something worked |
| **Stop preserves partial output** | A stopped answer stays useful; no reflexive retry |
| **No auto-regeneration** | Nothing re-queries the model without an explicit user action |

The product should feel fast and efficient **without the user ever learning why**.

---

## 10. Trust & safety UX

Phase 3 establishes the boundaries; Phase 4 makes their consequences understandable while keeping
the controls invisible.

1. **Security controls stay invisible; their consequences are legible.** The user never sees a
   fence, a rate limiter, or a policy name — they see a clear statement of what is not possible
   and what they can do instead.
2. **No implied financial authority.** The assistant recommends and prepares; the user commits.
   No copy may suggest the assistant can pay, transfer, or purchase autonomously.
3. **Clear ownership.** It is always apparent whose data and whose action is in play.
4. **No misleading AI claims.** The assistant does not claim certainty it lacks, nor that it
   performed an action it did not perform.
5. **Blocked content is explained without accusation** — `warning`, not `danger` (see the
   `warning` token's rationale in the design system).
6. **Rate limits read as a human message**, never as an HTTP status.

---

## 11. Onboarding & empty states

**First run:** one screen, one sentence of value, three example prompts. No tour, no carousel, no
account wall before first value. Preferences are captured **contextually during conversation**,
never as an upfront form.

**Empty chat:** greeting + 3 contextual quick prompts (category-aware, as today).
**Empty list (saved, history, favourites):** illustration + one line + one action.

---

## 12. Journey walkthrough (the V3 experience, end to end)

> **User:** "gợi ý quán ăn tối cho 2 người"
>
> **1 · Clarify (one turn, with chips)** — "Bạn muốn quanh khu nào, và tầm giá bao nhiêu?"
> with chips: `Quận 1` `Quận 3` `Gần tôi` · `<300k` `300–600k` `>600k`
>
> **2 · Recommend** — two sentences of *why*, then a leading `RecommendationCard` with a
> `Khớp` badge and two compact alternative rows. Prices formatted; one shows "chưa rõ" honestly.
>
> **3 · Compare** — user taps `So sánh`. A `ComparisonBlock` shows 3 places × 4 differing
> attributes. Identical rows collapsed. The recommendation is marked with its reason.
>
> **4 · Act** — user taps `Đặt bàn` on the leading card. A `ConfirmationPrompt` states exactly
> what will be sent. User confirms. Result reported plainly.
>
> **5 · Continue** — follow-up chips: `Gần đó có gì vui?` · `Quán rẻ hơn?` · `Lên kế hoạch tối`
>
> **6 · Plan** — user taps the third. A `PlanCard` with 4 timed steps, each with its own action.

At no point does the user see a marker, a model name, a tool, or a JSON payload — and at no point
do they need to compose a complicated prompt to continue.
