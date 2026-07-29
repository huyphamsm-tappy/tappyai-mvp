# BACKLOG — Hashtag normalization

**Status:** BACKLOG · not scheduled · **not part of any Explore investigation**
**Raised:** 2026-07-29 · **Owner decision required before any work**

## Scope fence (explicit)

This item is **deliberately separate** from the Explore navigation and Explore visibility investigations. It is **not** claimed to affect the Owner's reported behaviour. It was noticed while tracing personalization and is filed on its own so it cannot contaminate that evidence chain. If it is ever proposed as a cause of an Explore symptom, that must be **proven first** with its own RED evidence.

## Observation (evidence)

`reviews.hashtags` is stored under two incompatible conventions in the same production table:

| Account | sample stored tags |
|---|---|
| `d2883fba` (Zalo) | `#nailart`, `#nailsofinstagram`, `#redmani`, `#naildesign`, `#beautyblogger` — **with** a leading `#` |
| `4dcce7cf` (huypham.sm) | `bánh bao`, `ăn vặt`, `đồ ăn ngon`, `street food`, `food lover` — **without** a leading `#` |

Source: `topHashtags` computed per identity from `review_interactions` → `reviews.hashtags` (measured 2026-07-29).

## Why it may matter (unproven)

Matching is **exact string equality** — `src/app/reviews/page.tsx:596-597`:

```ts
const sa = (a.hashtags || []).filter(t => ht.includes(t)).length
```

`"#nailart" !== "nailart"`, so tags written under one convention can never match tags written under the other. Any feature that compares hashtags across posts — personalization ranking today, and hashtag search / topic pages / recommendations later — silently partitions content along the convention boundary rather than by topic.

**Not measured:** whether this changes what any user actually sees. In the 10-row production dataset the effect on ordering was not isolated, and no user-visible defect has been attributed to it. **Status: UNPROVEN impact.**

## Work this would involve (for sizing only — nothing designed yet)

1. Decide the canonical form (proposal: store **without** `#`, lowercase, trimmed, Unicode-normalized NFC — Vietnamese diacritics make NFC vs NFD a real concern).
2. Normalize on write — the composer / upload path.
3. Backfill existing rows (a data migration; **requires Owner approval**, and this document authorises none).
4. Normalize on read/compare wherever hashtags are matched.
5. Decide display form (`#tag` is presentation, not storage).

## Open questions for the Owner

- Is hashtag search / topic browsing on the roadmap? That decides urgency.
- Should the backfill rewrite historical rows, or should reads normalize defensively and leave data untouched?

## Related (context only, not dependencies)

`EXPLORE_AUTHENTICATED_RUNTIME_TRACE.md` — where the two conventions were first measured.
`EXPLORE_ZALO_RENDER_MEASUREMENT.md` — the render measurement that found **no** missing reviews.
