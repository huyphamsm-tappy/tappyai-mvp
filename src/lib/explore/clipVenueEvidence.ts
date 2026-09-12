// ── Clip Venue Evidence — the domain boundary between a clip and a venue ─────
//
// "Hỏi Tappy về chỗ này" has to answer one question before Tappy can say a word:
// WHICH venue is this clip about? Today that answer comes from what the poster
// typed (`reviews.place_name` / `place_address`) plus, at upload, what the
// existing content processor extracted from the caption or poster frame. Later
// it may come from on-frame text, a representative frame, or speech. This module
// is the ONE vocabulary all of those speak, so each can be added as a new
// evidence SOURCE without touching the chat route, the Places providers, the
// Explore CTA, the review row or the ranker.
//
// THREE RESPONSIBILITIES, KEPT APART — see docs/architecture/CLIP_VENUE_EVIDENCE_BOUNDARY.md
//
//   Clip evidence  (this module)   "What venue MIGHT this clip be about?"  → candidate(s)
//   Places         (lib/ai/tools)  "What is TRUE about that venue?"        → name/address/hours/rating…
//   Tappy AI       (api/chat)      "How should I answer the user?"         → prose
//
// 🚨 EVIDENCE IS NOT IDENTITY. A candidate here is a claim about a name and an
// area. It becomes a venue only when Places verification (`applyClipTarget`)
// returns exactly one row for it — `withPlacesVerification` is the only path to
// `resolved`, and nothing in this file ever mints a provider id, a maps link or
// any factual field. `reviews.place_id` (`video_<ts>`, `community_<slug>`) is
// not a venue id and is deliberately absent from every type below.
//
// 🚨 NO EXECUTION MODEL. Every function here is pure and synchronous. The
// `ClipVenueEvidenceProvider` seam is a type, not a worker: a future
// implementation may run it inline at the watch threshold, or defer it, but it
// MUST be idempotent per (reviewId, analysisVersion) — fifty viewers of one clip
// are one analysis, not fifty. Where its result would be persisted, and with
// which state machine, is written down in the boundary doc; nothing is persisted
// today because nothing today consumes a persisted result.

// ── Vocabulary ──────────────────────────────────────────────────────────────

/**
 * Where a piece of evidence came from. Domain names, not technologies: a
 * "frame_text" reading may be produced by any OCR engine, "frame_vision" by any
 * multimodal model, "audio" by any transcription service. Only the first five
 * exist today (and only the first four are wired).
 */
export type ClipVenueEvidenceSource =
  | 'metadata'            // reviews.place_name / place_address as the poster typed them
  | 'caption'             // the clip's body text, present as context (not parsed here)
  | 'hashtags'            // the clip's tags, present as context (not parsed here)
  | 'content_processing'  // the existing upload-time extraction (contentProcessor.location / category)
  | 'user_confirmation'   // the user told Tappy which venue it is — outranks every automatic source
  | 'frame_text'          // FUTURE Level 2: text read off representative frames
  | 'frame_vision'        // FUTURE Level 3: a representative frame described
  | 'audio'               // FUTURE Level 4: speech in the clip

/** Which part of a venue's identity a piece of evidence speaks to. */
export type ClipVenueEvidenceField = 'name' | 'address' | 'area' | 'mention'

/**
 * How much an evidence item may be trusted on its own.
 *   strong   — a human asserted it (typed name/address, user confirmation)
 *   moderate — a deterministic or model extraction from the clip's own text/frames
 *   weak     — context that may or may not concern the venue (a caption, a tag)
 */
export type ClipVenueEvidenceStrength = 'strong' | 'moderate' | 'weak'

export interface ClipVenueEvidence {
  source: ClipVenueEvidenceSource
  field: ClipVenueEvidenceField
  strength: ClipVenueEvidenceStrength
  /** The observed text, bounded by the producer. Never a fabricated value. */
  value: string
}

/** A venue the evidence points at. Unverified by definition. */
export interface ClipVenueCandidate {
  name: string | null
  address: string | null
  evidence: ClipVenueEvidence[]
}

/**
 * The five states a clip can be in with respect to its venue.
 *
 *   no_evidence — nothing names a venue (share-only post, empty caption)
 *   candidate   — evidence names ONE candidate; Places has not checked it yet
 *   ambiguous   — Places found several venues matching the candidate
 *   resolved    — Places found exactly one venue matching the candidate
 *   unresolved  — there WAS a candidate and Places could not verify it
 *
 * `unresolved` is a first-class, cacheable result — not an invitation to retry
 * forever. It carries the same `analysisVersion` as any other outcome so a
 * newer analysis can supersede it.
 */
export type ClipVenueStatus = 'no_evidence' | 'candidate' | 'ambiguous' | 'resolved' | 'unresolved'

/**
 * A verified venue, as the Places layer returned it. Only the identity facts
 * needed to point back at the provider row — everything else stays in Places.
 */
export interface VerifiedClipVenue {
  name: string
  address: string | null
  /** The provider row's own id (`place_id` / `cid`), when the provider gave one. */
  providerPlaceId: string | null
  /** The Places envelope `source` (e.g. `serper_places`). Provenance, not a ranking. */
  provider: string | null
}

export interface ClipVenueResolution {
  reviewId: string
  status: ClipVenueStatus
  /** All candidates in play. One for `candidate`/`resolved`, several for `ambiguous`, none for `no_evidence`. */
  candidates: ClipVenueCandidate[]
  verified: VerifiedClipVenue | null
  /** Which analysis produced this. Bump when a source is added or a rule changes; older results are stale. */
  analysisVersion: string
  analyzedAt: string
}

/**
 * The future seam. "Ensure", not "analyze": a call must return the existing
 * result for (reviewId, analysisVersion) when one exists and compute only when
 * it does not. Today the only implementation is the synchronous Level 0/1
 * derivation below, applied by `loadExploreClipContext`; there is no persisted
 * result and no deferred execution.
 */
export interface ClipVenueEvidenceProvider {
  ensureClipVenueEvidence(reviewId: string): Promise<ClipVenueResolution>
}

/**
 * Level 0/1 rules: metadata name/address, caption/hashtags as context, the
 * upload-time extraction as a moderate area hint. Bump on any rule change.
 */
export const CLIP_VENUE_ANALYSIS_VERSION = 'level01-2026-09-12'

// ── Level 0 / 1 ─────────────────────────────────────────────────────────────

export interface Level01Input {
  reviewId: string
  placeName: string | null
  placeAddress: string | null
  caption: string | null
  hashtags: readonly string[]
  /** `contentProcessor.location` if the composer preserved it. An AREA hint, never a venue. */
  contentLocation?: string | null
  now?: () => Date
}

const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t.length > 0 ? t : null
}

/**
 * Build the clip's venue evidence from what the review row already carries.
 *
 * Pure. A typed name yields ONE candidate in state `candidate` — never
 * `resolved`, because nothing has been verified. Caption and hashtags ride along
 * as weak context so a later source can weigh them; they are not parsed into a
 * name here, and no city is ever read out of a venue name.
 */
export function clipVenueFromLevel01(input: Level01Input): ClipVenueResolution {
  const analyzedAt = (input.now ?? (() => new Date()))().toISOString()
  const name = clean(input.placeName)
  const address = clean(input.placeAddress)
  const contentArea = clean(input.contentLocation)
  const caption = clean(input.caption)
  const tags = (input.hashtags ?? []).map(clean).filter((t): t is string => !!t)

  const evidence: ClipVenueEvidence[] = []
  if (name) evidence.push({ source: 'metadata', field: 'name', strength: 'strong', value: name })
  if (address) evidence.push({ source: 'metadata', field: 'address', strength: 'strong', value: address })
  if (contentArea) evidence.push({ source: 'content_processing', field: 'area', strength: 'moderate', value: contentArea })
  if (caption) evidence.push({ source: 'caption', field: 'mention', strength: 'weak', value: caption })
  if (tags.length > 0) evidence.push({ source: 'hashtags', field: 'mention', strength: 'weak', value: tags.join(' ') })

  if (!name) {
    return { reviewId: input.reviewId, status: 'no_evidence', candidates: [], verified: null, analysisVersion: CLIP_VENUE_ANALYSIS_VERSION, analyzedAt }
  }
  return {
    reviewId: input.reviewId,
    status: 'candidate',
    // The typed address wins; the processor's area is a fallback hint for the search, not a fact.
    candidates: [{ name, address: address ?? contentArea, evidence }],
    verified: null,
    analysisVersion: CLIP_VENUE_ANALYSIS_VERSION,
    analyzedAt,
  }
}

// ── Places verification → state ─────────────────────────────────────────────

/** The shape `applyClipTarget` / `narrowToClipTarget` already produce. */
export interface PlacesVerificationOutcome {
  status: 'resolved' | 'ambiguous' | 'unresolved'
  results: ReadonlyArray<Record<string, unknown>>
  /** The Places envelope `source`, when known. */
  provider?: string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Fold the Places layer's verdict into the resolution.
 *
 * This is the ONLY function that can produce `resolved`, and it does so with the
 * provider's row, not the candidate's claim: the verified name/address are what
 * Places returned. `ambiguous` keeps one candidate per matching row (name +
 * address from the provider) so a future confirmation step has something to
 * offer; `unresolved` keeps the original candidate so the failure is attributable.
 * A resolution with no candidate cannot be verified — it is returned unchanged.
 */
export function withPlacesVerification(base: ClipVenueResolution, outcome: PlacesVerificationOutcome): ClipVenueResolution {
  if (base.status === 'no_evidence' || base.candidates.length === 0) return base
  const carried = base.candidates[0].evidence
  const rowCandidate = (row: Record<string, unknown>): ClipVenueCandidate => ({
    name: str(row.name),
    address: str(row.address),
    evidence: carried,
  })

  if (outcome.status === 'resolved' && outcome.results.length === 1) {
    const row = outcome.results[0]
    const name = str(row.name)
    if (!name) return { ...base, status: 'unresolved' }
    return {
      ...base,
      status: 'resolved',
      candidates: [rowCandidate(row)],
      verified: {
        name,
        address: str(row.address),
        providerPlaceId: str(row.place_id) ?? str(row.cid),
        provider: outcome.provider ?? null,
      },
    }
  }
  if (outcome.status === 'ambiguous' && outcome.results.length > 1) {
    return { ...base, status: 'ambiguous', candidates: outcome.results.map(rowCandidate), verified: null }
  }
  return { ...base, status: 'unresolved', verified: null }
}

/**
 * User confirmation as evidence — the strongest automatic-or-human source.
 *
 * Represents "Bạn biết là quán nào không?" → an answer. It replaces the
 * candidate set with the user's claim (still `candidate`: Places must verify it)
 * and records the provenance. No UI calls this yet; it exists so the vocabulary
 * is complete before any flow does.
 */
export function withUserConfirmation(base: ClipVenueResolution, confirmed: { name: string; address?: string | null }): ClipVenueResolution {
  const name = clean(confirmed.name)
  if (!name) return base
  const address = clean(confirmed.address)
  const evidence: ClipVenueEvidence[] = [{ source: 'user_confirmation', field: 'name', strength: 'strong', value: name }]
  if (address) evidence.push({ source: 'user_confirmation', field: 'address', strength: 'strong', value: address })
  return { ...base, status: 'candidate', candidates: [{ name, address, evidence }], verified: null }
}

/** The analytics-facing status: the four values the product measures. */
export type ClipTargetMetric = 'resolved' | 'ambiguous' | 'unresolved' | 'unknown'
export function clipTargetMetric(res: ClipVenueResolution | null | undefined): ClipTargetMetric {
  if (!res) return 'unknown'
  return res.status === 'resolved' || res.status === 'ambiguous' || res.status === 'unresolved' ? res.status : 'unknown'
}

// ── Product measurement ─────────────────────────────────────────────────────

/** The three surfaces that offer "Hỏi Tappy về chỗ này", plus the server's answer. */
export type AskTappyPlaceSurface = 'feed' | 'explore_desktop' | 'review_detail' | 'chat_server'

/**
 * The `ask_tappy_place` event payload — the same shape from every surface.
 *
 *   phase `click`  — a CTA was pressed; the client cannot know the verdict yet, so `unknown`
 *   phase `target` — the chat route's verdict for that review, joined by `review_id`
 *
 * Deliberately small: review id, surface, verdict, whether the row carried an
 * address. No caption, no place name, no user text, no provider payload — the
 * ingestion path rejects PII-shaped metadata and this never gives it any.
 */
export function askTappyPlaceEvent(input: {
  phase: 'click' | 'target'
  reviewId: string
  surface: AskTappyPlaceSurface
  status?: ClipTargetMetric
  hasAddress?: boolean
}): { event_type: 'ask_tappy_place'; metadata: Record<string, unknown> } {
  return {
    event_type: 'ask_tappy_place',
    metadata: {
      phase: input.phase,
      review_id: input.reviewId,
      source_surface: input.surface,
      clip_target_status: input.status ?? 'unknown',
      ...(input.hasAddress === undefined ? {} : { has_address: input.hasAddress }),
    },
  }
}
