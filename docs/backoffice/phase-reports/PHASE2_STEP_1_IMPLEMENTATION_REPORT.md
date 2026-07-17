# Phase 2 — Activation Analytics — Step 1 Implementation Report

**Revision note:** The owner rejected the first version of this step. It introduced two new activation-prefixed events (`activation_ai_answer_received`, `activation_place_saved`), which conflicts with the required architecture:

```
User Action → Domain Event → Activation Engine → Activation Rule → activation_aha_reached
```

Activation-specific events must exist **only** for the final result (`activation_aha_reached`, produced by a later step's Activation Engine). Signals must be **existing domain events**, reused as-is. This revision corrects Step 1 accordingly, after first auditing the frozen Event Catalog (doc `07`) for equivalents.

**Step scope (corrected):** Ensure the two domain events Rule v1 needs are actually emitted, using their **existing, already-cataloged names** — nothing activation-specific. Still **no** Activation Engine, Rule Provider, rollup, service, API, dashboard, or database change.

---

## 1. Event Catalog audit (performed before writing any code)

Read `docs/backoffice/07_Event_Catalog.md` in full. Findings:

| Need (Rule v1 signal) | Existing catalog event | Where | Status before this step |
|---|---|---|---|
| AI response completed successfully | **`chat_response_received`** (§5 Chat/AI Events: *"AI response streamed"*, properties `latency_ms`, `output_tokens`, `model`, `feature`) | doc `07` line 79 | Defined in the catalog; **not yet emitted anywhere in code** (confirmed via repo-wide search) |
| Place saved | **`search_result_saved`** (§15 migration table: the designated canonical replacement for the legacy `place_save` type) | doc `07` line 265 | Defined as the catalog's intended canonical name; **not yet emitted anywhere in code** — only the **legacy** `place_save` name is emitted once today, at `src/app/reviews/page.tsx:1423`, in an unrelated review-detail context |

**Conclusion: both required domain events already exist in the frozen catalog.** No new event needed. The only gap was that neither was actually being emitted from the chat/save-a-place code paths yet — this step closes that gap using the **existing names**, exactly as instructed ("only introduce new events if a required domain event truly does not already exist").

I did not rename the pre-existing legacy `place_save` call in `reviews/page.tsx` — that is a different, already-shipped event in a different context (saving a place tied to a review detail page), and renaming it is an unrelated migration-cleanup task the Event Catalog itself defers ("Migration note: old event names can remain... during transition period"), not part of Activation Analytics Step 1.

---

## 2. What was implemented (corrected)

| File | Change |
|---|---|
| `src/lib/analytics/activationEvents.ts` | **Deleted.** An activation-specific emitter module was the wrong shape entirely — domain events belong to their domain (chat, search), not to Activation. |
| `src/components/ChatInterface.tsx` | Imports `track` directly from `@/lib/tracking/tracker` (removed the deleted module's import). Two call sites, **emitting only existing catalog event names**: (1) inside the existing `useChat({ onFinish })` — `track('chat_response_received', { feature: category })`; (2) inside `SavePlaceButton.handleSave`, after the existing `res.ok` success check — `track('search_result_saved', { place_type: 'saved' })`. |

No activation-prefixed event is emitted anywhere. `activation_aha_reached` is **not** emitted by this step — it belongs to the Activation Engine (a later step), which will consume the two domain events above, not to any client call site.

## 3. Why these are genuinely the right domain events (not just convenient reuse)

- **`chat_response_received`**: the catalog explicitly defines it as "AI response streamed" — the same shared `useChat({ onFinish })` call site instrumented in the prior (rejected) version already fires only on a confirmed-successful stream completion (Vercel AI SDK `onFinish` semantics, unchanged). Reusing this name means the domain event is now honestly and correctly populated for every chat-based tool (`food`/`travel`/`weather`/`gold`/etc. — all `CategoryId` values of the same `/chat` route, confirmed via `CATEGORIES` in `src/lib/utils.ts`), not just for Activation's benefit.
- **`search_result_saved`**: the catalog itself names this as the intended replacement for the legacy, currently-narrow `place_save` usage — i.e. this is the catalog's own designated general-purpose "a place was saved" event, not something invented for Activation. `SavePlaceButton.handleSave`'s existing `res.ok`-gated success branch is a correct, honest emission point for it.
- **Known catalog gap, not fabricated:** `chat_response_received`'s documented properties include `latency_ms`, `output_tokens`, `model` — none of which are cheaply available at this client call site (would require request-timing/token-count plumbing not currently present). Per the catalog's own governance rule ("New optional properties may be added freely; required properties may never be added to an existing event"), the properties table is not a required-fields contract, so emitting with only `feature` populated is valid — the richer properties are a future, additive enhancement, not a blocker, and not built now (no speculative work).

## 4. Reuse discipline (SR-1 → SR-6)

- **Nothing added to the Event Catalog.** Both events already existed there; this step only makes code emit names the catalog already defines — zero catalog edit, zero new event definition.
- **`tracker.ts`/`envelope.ts` unchanged**, exactly as before — `track()` and the envelope (incl. `session_id`) are reused verbatim.
- **No activation-specific abstraction reintroduced.** The previously-created `activationEvents.ts` wrapper is deleted rather than repurposed, because Activation Analytics should not own emission of events that belong to other domains — it will *consume* `chat_response_received`/`search_result_saved` in a later step (the Activation Engine reading from the same `user_events` table every other module reads from), not wrap them.
- **`activation_aha_reached` remains reserved exclusively for the Activation Engine's output**, per the owner's instruction — not touched, not emitted, in this step.

## 5. Verification results (re-run after the correction)

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ Clean |
| `next lint` | ✅ Clean — only 3 **pre-existing** warnings in `ChatInterface.tsx` (2 `exhaustive-deps`, 1 `no-img-element`), unchanged from before this step, none introduced by it |
| `npm test` (vitest) | ✅ 81/81 passing (10 files), unchanged |
| `npm run build` | ✅ "Compiled successfully"; the one logged `Dynamic server usage` line is `/api/subscription`'s pre-existing, unrelated `request.headers` usage |
| `architecture:check` | ✅ 7/7 rules passed |

## 6. Critical audit

- **No activation-prefixed event exists anywhere in the codebase** (`git grep -i activation_` across `src/` returns nothing after this correction) — confirms the architectural requirement is met exactly.
- **Both emitted events are genuine, catalog-defined domain events**, not activation-flavored variants — verified against doc `07` line-by-line before implementation, not assumed.
- **Emission correctness unchanged from the prior version** (same call sites, same success-gating): `onFinish` fires only on a successful stream; `SavePlaceButton` fires only after `res.ok`. No behavior change to either surface beyond the added `track()` calls.
- **Known coverage gaps, still real, still disclosed (carried over from the prior version):** `/translate` and `/scan` (OCR) are not on `ChatInterface`/`useChat`, so `chat_response_received` is not yet emitted from them; `FavoriteToggle` (the other save-a-place control) is optimistic and doesn't check `res.ok`, so it was deliberately left uninstrumented to avoid a dishonest signal; Android/iOS emission is not in this step (Web only, matching Phase 1 Step 1's precedent). None of these block Step 1, which only needs the domain-event contract established correctly at at least one honest emission point per event — full coverage is a later concern.
- **No scope creep:** exactly 1 file deleted, 1 file edited (import + 2 one-line `track()` calls); no rollup/service/API/dashboard/migration touched; the frozen spec untouched.

---

**Step 1 status (corrected): Implemented, code-verified (tsc/lint/build/81 tests/architecture 7/7 all green).** No activation-prefixed signal events exist. Only existing, catalog-defined domain events (`chat_response_received`, `search_result_saved`) are emitted. `activation_aha_reached` is reserved for the Activation Engine (a later step) and is not emitted here.

*Stopping here. Do not proceed to Step 2 until explicitly approved.*
