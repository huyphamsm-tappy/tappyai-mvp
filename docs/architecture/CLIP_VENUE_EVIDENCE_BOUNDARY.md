# Clip Venue Evidence — the boundary between a clip and a venue

Status: **foundation landed, Level 0/1 only** (2026-09-12). Module: `src/lib/explore/clipVenueEvidence.ts`.
Companion code: `src/lib/ai/exploreClipContext.ts` (row → evidence), `src/lib/ai/exploreClipTarget.ts`
(Places verification), `src/app/api/chat/route.ts` (where the two meet).

## 1. Why this boundary exists

"Hỏi Tappy về chỗ này" must answer one question before Tappy says a word: **which venue is this clip
about?** Today that comes from what the poster typed. Tomorrow it may come from on-frame text, a
representative frame, or speech. Each of those is a new *source of evidence* — not a new chat route,
not a new Places provider, not a new review column. This document fixes the vocabulary so they can be
added without touching the answer path.

## 2. Three responsibilities, kept apart

| Layer | Question | Owns | Never does |
|---|---|---|---|
| **Clip evidence** (`lib/explore/clipVenueEvidence.ts`) | What venue *might* this clip be about? | candidates, provenance, status, `analysisVersion` | mint an id, assert a fact, call a provider |
| **Places** (`lib/ai/tools/food.ts`, `exploreClipTarget.ts`) | What is *true* about that venue? | name/address/hours/rating from Google → Serper → OSM; the narrowing verdict | read the clip, guess from a name |
| **Tappy AI** (`api/chat/route.ts`) | How should I *answer*? | prose, the fenced clip block, one-place vs discovery instructions | decide the venue itself |

The boundary is a pure TypeScript module. It imports nothing from Places, the prompt builder, the
ranker, the review row, or any provider SDK.

## 3. Evidence is not identity

A candidate is a *claim* about a name and an area. It becomes a venue only when Places verification
returns exactly one matching row for it. `withPlacesVerification` is the **only** function that
produces `resolved`, and the verified name/address/provider id come from the **provider row**, never
from the candidate. `reviews.place_id` (`video_<ts>`, `community_<slug>`) is a row label, not a venue
id, and is absent from every type in the module by design.

## 4. States

```
no_evidence ──(a name appears)──▶ candidate ──▶ Places ──▶ resolved    (exactly one match)
                                                       ├─▶ ambiguous   (several matches; one candidate per row)
                                                       └─▶ unresolved  (no match; original candidate kept)
user_confirmation ─────────────────▶ candidate (again: Places must verify the user's claim)
```

`unresolved` is a first-class, cacheable outcome, not a retry loop. Every outcome carries the same
`analysisVersion`, so a newer analysis supersedes an older one uniformly.

## 5. Provenance

Every evidence item records `source` (domain name, not technology: `metadata`, `caption`, `hashtags`,
`content_processing`, `user_confirmation`; future `frame_text`, `frame_vision`, `audio`), `field`
(`name` / `address` / `area` / `mention`) and `strength` (`strong` human-asserted, `moderate`
extracted, `weak` context). Provenance survives every transition, including verification — the
failure in `unresolved` is attributable to the evidence that led there.

## 6. Versioning and idempotency

`CLIP_VENUE_ANALYSIS_VERSION` names the rule set. Bump it when a source is added or a rule changes.
The future seam is `ClipVenueEvidenceProvider.ensureClipVenueEvidence(reviewId)`: *ensure*, not
*analyze* — one result per `(reviewId, analysisVersion)`, computed at most once no matter how many
viewers cross the watch threshold. The only implementation today is the synchronous Level 0/1
derivation inside `loadExploreClipContext`; nothing is persisted, nothing is deferred.

## 7. Where the future work plugs in (and what it does NOT touch)

- **Level 2 frame text / Level 3 frame vision / Level 4 audio** → a new evidence producer that
  returns `ClipVenueEvidence[]` for a clip, merged into `candidates`. Touches: this module's
  producers and the version constant. Does **not** touch: `route.ts`, Places, the ranker, the CTA,
  the review row, the composer.
- **Trigger** → the existing watch-duration path (`behaviorTracker` → `/api/reviews/[id]/interact`,
  3-second threshold) is the natural place to *call* `ensureClipVenueEvidence`; whether inline or
  deferred is an implementation choice behind the interface.
- **Persistence** → if a result is stored, it is stored as a `ClipVenueResolution` keyed by
  `(reviewId, analysisVersion)` with the state above; the decision and table are deliberately not
  made here, because nothing consumes a stored result yet.
- **User confirmation UI** ("Bạn biết là quán nào không?") → `withUserConfirmation`, already in the
  vocabulary; the ambiguous state keeps one candidate per Places row so the UI has something to offer.

## 8. What is measured today

`ask_tappy_place` (same taxonomy and table as every `/api/track` event):

| phase | written by | `source_surface` | `clip_target_status` |
|---|---|---|---|
| `click` | the three CTAs (feed, explore desktop, review detail) via `track()` — guests included | `feed` / `explore_desktop` / `review_detail` | `unknown` |
| `target` | `/api/chat` after `applyClipTarget`, fire-and-forget upsert | `chat_server` | `resolved` / `ambiguous` / `unresolved` |

Joined by `review_id`. Payload is ids and enums plus `has_address` — no caption, name, address text
or user question. Rate of resolved vs ambiguous vs unresolved, per surface and per `has_address`, is
the number that decides whether Level 2+ is worth building.

## 9. The upload-side evidence

`POST /api/explore/process` has always returned `location` ("khu vực nếu rõ"). The composer now
pre-fills an **editable** area field with it (shown with a "suggested from the clip" hint) and stores
whatever the poster leaves there as `place_address` — exactly as if they had typed it. This is
`content_processing` evidence reaching the row through the poster's hands; it is never a venue, never
verified, and there is no schema change.

## 10. Invariants pinned by tests

- `clipVenueEvidence.test.ts` — every state reachable by exactly one path; `resolved` only from one
  provider row; provenance and version carried; purity; no `place_id`.
- `exploreClipContext.test.ts` / `exploreClipTarget.test.ts` — row → evidence; narrowing verdicts;
  the alternatives escape.
- `exploreClipContext.route.test.ts` (TEST K/L) — the `target` row per verdict; none for generic
  chat or for the alternatives escape; analytics failure cannot fail the turn.
- `exploreAskTappyBridge.test.tsx`, `exploreV3Desktop.test.tsx`, `reviewDetailAskTappyAnalytics.test.tsx`
  — the `click` row per surface; no sensitive payload; `stopPropagation` preserved.
- `composerPlaceAreaEvidence.test.ts` — area preserved as evidence, never overwriting the poster.
- `api/track/uuidNotPii.test.ts` — a UUID is not a phone number (the pre-existing 1-in-4 silent drop).
