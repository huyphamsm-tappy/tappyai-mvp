import { describe, it, expect } from 'vitest'
import {
  CLIP_VENUE_ANALYSIS_VERSION,
  askTappyPlaceEvent,
  clipTargetMetric,
  clipVenueFromLevel01,
  withPlacesVerification,
  withUserConfirmation,
  type ClipVenueEvidenceProvider,
  type ClipVenueResolution,
} from './clipVenueEvidence'

// ── The clip → venue boundary, pinned ──────────────────────────────────────
//
// What this vocabulary must never do is the whole point of it: turn a typed
// name into a verified venue, mint an id, or read a city out of a name. Each
// state below is reached by exactly one path, and the provenance of every
// candidate survives the transitions — a future Level 2/3/4 source adds
// evidence items, it does not change these rules.

const REVIEW = '9d4cdf3b-a93f-427c-880a-9950472e3705'
const NOW = () => new Date('2026-09-12T09:00:00.000Z')
const base = (over: Partial<Parameters<typeof clipVenueFromLevel01>[0]> = {}) =>
  clipVenueFromLevel01({ reviewId: REVIEW, placeName: 'GÓC HUẾ', placeAddress: '155 Nguyễn Thái Bình, Quận 1, TP.HCM', caption: 'Bún bò chuẩn vị Huế', hashtags: ['#bunbo', '#quan1'], now: NOW, ...over })

describe('Level 0/1 — what the review row already says', () => {
  it('a typed name is a CANDIDATE, never resolved, with strong metadata provenance', () => {
    const r = base()
    expect(r.status).toBe('candidate')
    expect(r.verified).toBeNull()
    expect(r.candidates).toHaveLength(1)
    expect(r.candidates[0]).toMatchObject({ name: 'GÓC HUẾ', address: '155 Nguyễn Thái Bình, Quận 1, TP.HCM' })
    expect(r.candidates[0].evidence).toEqual([
      { source: 'metadata', field: 'name', strength: 'strong', value: 'GÓC HUẾ' },
      { source: 'metadata', field: 'address', strength: 'strong', value: '155 Nguyễn Thái Bình, Quận 1, TP.HCM' },
      { source: 'caption', field: 'mention', strength: 'weak', value: 'Bún bò chuẩn vị Huế' },
      { source: 'hashtags', field: 'mention', strength: 'weak', value: '#bunbo #quan1' },
    ])
  })

  it('no name → NO_EVIDENCE: no candidates, nothing verified — even with a caption and an address', () => {
    for (const placeName of [null, '', '   ']) {
      const r = base({ placeName })
      expect(r.status, JSON.stringify(placeName)).toBe('no_evidence')
      expect(r.candidates).toEqual([])
      expect(r.verified).toBeNull()
    }
  })

  it('carries the analysis version and a timestamp on every outcome', () => {
    for (const r of [base(), base({ placeName: null })]) {
      expect(r.reviewId).toBe(REVIEW)
      expect(r.analysisVersion).toBe(CLIP_VENUE_ANALYSIS_VERSION)
      expect(r.analyzedAt).toBe('2026-09-12T09:00:00.000Z')
    }
    expect(CLIP_VENUE_ANALYSIS_VERSION).toMatch(/^level01-\d{4}-\d{2}-\d{2}$/)
  })

  it('the content-processor area is MODERATE evidence and only a fallback for the address', () => {
    const withArea = base({ placeAddress: null, contentLocation: 'Quận 1, TP.HCM' })
    expect(withArea.candidates[0].address).toBe('Quận 1, TP.HCM')
    expect(withArea.candidates[0].evidence).toContainEqual({ source: 'content_processing', field: 'area', strength: 'moderate', value: 'Quận 1, TP.HCM' })
    // The typed address wins when both exist; the area is still recorded as evidence.
    const both = base({ contentLocation: 'Quận 3, TP.HCM' })
    expect(both.candidates[0].address).toBe('155 Nguyễn Thái Bình, Quận 1, TP.HCM')
    expect(both.candidates[0].evidence.map(e => e.source)).toContain('content_processing')
  })

  it('never reads a city out of the venue NAME (the audit trap)', () => {
    const r = base({ placeName: 'Bún Bò Huế Cô Ba', placeAddress: null, contentLocation: null })
    expect(r.candidates[0].address).toBeNull()
    expect(r.candidates[0].evidence.some(e => e.field === 'address' || e.field === 'area')).toBe(false)
  })

  it('normalises whitespace and drops junk tags; the reviewId is never derived from the row', () => {
    const r = base({ placeName: '  GÓC   HUẾ ', hashtags: ['', '  ', '#ok'] })
    expect(r.candidates[0].name).toBe('GÓC HUẾ')
    expect(r.candidates[0].evidence.find(e => e.source === 'hashtags')?.value).toBe('#ok')
  })

  it('is pure — the same input yields the same resolution (idempotency of the future seam)', () => {
    expect(base()).toEqual(base())
  })
})

// A provider row as the Places layer returns it.
const row = (name: string, address: string, extra: Record<string, unknown> = {}) => ({ name, address, rating: 4.4, maps_link: 'https://maps.google.com/?q=x', ...extra })

describe('Places verification — the ONLY path to resolved', () => {
  it('exactly one matching row → RESOLVED, with the PROVIDER row as the verified venue', () => {
    const r = withPlacesVerification(base(), {
      status: 'resolved',
      results: [row('GÓC HUẾ - Nguyễn Thái Bình', '155 Nguyễn Thái Bình, Phường Nguyễn Thái Bình, Quận 1', { place_id: 'ChIJabc' })],
      provider: 'serper_places',
    })
    expect(r.status).toBe('resolved')
    expect(r.verified).toEqual({
      name: 'GÓC HUẾ - Nguyễn Thái Bình',
      address: '155 Nguyễn Thái Bình, Phường Nguyễn Thái Bình, Quận 1',
      providerPlaceId: 'ChIJabc',
      provider: 'serper_places',
    })
    // The candidate now reads as the provider row, but the ORIGINAL evidence is kept.
    expect(r.candidates).toHaveLength(1)
    expect(r.candidates[0].evidence.map(e => e.source)).toEqual(['metadata', 'metadata', 'caption', 'hashtags'])
    // Untouched: id, version, time.
    expect(r).toMatchObject({ reviewId: REVIEW, analysisVersion: CLIP_VENUE_ANALYSIS_VERSION, analyzedAt: '2026-09-12T09:00:00.000Z' })
  })

  it('falls back to `cid` for the provider id and to null when the provider gave none', () => {
    expect(withPlacesVerification(base(), { status: 'resolved', results: [row('A', 'B', { cid: '123' })] }).verified?.providerPlaceId).toBe('123')
    const none = withPlacesVerification(base(), { status: 'resolved', results: [row('A', 'B')] })
    expect(none.verified?.providerPlaceId).toBeNull()
    expect(none.verified?.provider).toBeNull()
  })

  it('several matching rows → AMBIGUOUS: one candidate per row, nothing verified, evidence carried', () => {
    const r = withPlacesVerification(base({ placeAddress: null }), {
      status: 'ambiguous',
      results: [row('GÓC HUẾ - Nguyễn Thái Bình', '155 Nguyễn Thái Bình, Quận 1'), row('GÓC HUẾ - Ân Dương', '12 Ân Dương, Quận 7')],
    })
    expect(r.status).toBe('ambiguous')
    expect(r.verified).toBeNull()
    expect(r.candidates.map(c => [c.name, c.address])).toEqual([
      ['GÓC HUẾ - Nguyễn Thái Bình', '155 Nguyễn Thái Bình, Quận 1'],
      ['GÓC HUẾ - Ân Dương', '12 Ân Dương, Quận 7'],
    ])
    for (const c of r.candidates) expect(c.evidence.map(e => e.source)).toEqual(['metadata', 'caption', 'hashtags'])
  })

  it('no matching row → UNRESOLVED: the original candidate is KEPT so the failure is attributable', () => {
    const r = withPlacesVerification(base(), { status: 'unresolved', results: [] })
    expect(r.status).toBe('unresolved')
    expect(r.verified).toBeNull()
    expect(r.candidates[0]).toMatchObject({ name: 'GÓC HUẾ', address: '155 Nguyễn Thái Bình, Quận 1, TP.HCM' })
    expect(r.analysisVersion).toBe(CLIP_VENUE_ANALYSIS_VERSION)
  })

  it('🚨 a "resolved" verdict without exactly one usable row cannot produce resolved', () => {
    // Two rows labelled resolved, zero rows labelled resolved, a nameless row: all unresolved.
    expect(withPlacesVerification(base(), { status: 'resolved', results: [row('A', 'x'), row('B', 'y')] }).status).toBe('unresolved')
    expect(withPlacesVerification(base(), { status: 'resolved', results: [] }).status).toBe('unresolved')
    expect(withPlacesVerification(base(), { status: 'resolved', results: [{ address: 'x' }] }).status).toBe('unresolved')
    // And an ambiguous verdict with a single row is not ambiguous.
    expect(withPlacesVerification(base(), { status: 'ambiguous', results: [row('A', 'x')] }).status).toBe('unresolved')
  })

  it('no evidence cannot be verified — returned unchanged, whatever Places says', () => {
    const none = base({ placeName: null })
    expect(withPlacesVerification(none, { status: 'resolved', results: [row('A', 'x')] })).toBe(none)
  })

  it('never uses reviews.place_id as a venue id — only the PROVIDER row identifies the venue', () => {
    // A fake `place_id` on the CANDIDATE side has no way in: the type has no such field, and the
    // verified id comes from the provider row alone.
    const r = withPlacesVerification(base(), { status: 'resolved', results: [row('A', 'x')] })
    expect(JSON.stringify(r)).not.toContain('video_')
    expect(JSON.stringify(r)).not.toContain('community_')
    expect(r.verified?.providerPlaceId).toBeNull()
  })

  it('is pure — the base is not mutated', () => {
    const b = base()
    const snapshot = JSON.stringify(b)
    withPlacesVerification(b, { status: 'resolved', results: [row('A', 'x')] })
    withPlacesVerification(b, { status: 'unresolved', results: [] })
    expect(JSON.stringify(b)).toBe(snapshot)
  })
})

describe('user confirmation — strongest source, still only a candidate', () => {
  it('replaces the candidate set with the user’s claim and records the provenance', () => {
    const amb = withPlacesVerification(base({ placeAddress: null }), { status: 'ambiguous', results: [row('A', 'x'), row('B', 'y')] })
    const r = withUserConfirmation(amb, { name: 'GÓC HUẾ - Ân Dương', address: '12 Ân Dương, Quận 7' })
    expect(r.status).toBe('candidate')
    expect(r.verified).toBeNull()
    expect(r.candidates).toEqual([{
      name: 'GÓC HUẾ - Ân Dương', address: '12 Ân Dương, Quận 7',
      evidence: [
        { source: 'user_confirmation', field: 'name', strength: 'strong', value: 'GÓC HUẾ - Ân Dương' },
        { source: 'user_confirmation', field: 'address', strength: 'strong', value: '12 Ân Dương, Quận 7' },
      ],
    }])
  })

  it('an empty confirmation changes nothing', () => {
    const b = base()
    expect(withUserConfirmation(b, { name: '   ' })).toBe(b)
  })
})

describe('the product metric', () => {
  it('maps the three verdicts through and everything else to unknown', () => {
    expect(clipTargetMetric(withPlacesVerification(base(), { status: 'resolved', results: [row('A', 'x')] }))).toBe('resolved')
    expect(clipTargetMetric(withPlacesVerification(base(), { status: 'ambiguous', results: [row('A', 'x'), row('B', 'y')] }))).toBe('ambiguous')
    expect(clipTargetMetric(withPlacesVerification(base(), { status: 'unresolved', results: [] }))).toBe('unresolved')
    expect(clipTargetMetric(base())).toBe('unknown')            // candidate: not yet checked
    expect(clipTargetMetric(base({ placeName: null }))).toBe('unknown')
    expect(clipTargetMetric(null)).toBe('unknown')
    expect(clipTargetMetric(undefined)).toBe('unknown')
  })

  it('ask_tappy_place: one shape from every surface, ids and enums only', () => {
    expect(askTappyPlaceEvent({ phase: 'click', reviewId: REVIEW, surface: 'feed', hasAddress: true })).toEqual({
      event_type: 'ask_tappy_place',
      metadata: { phase: 'click', review_id: REVIEW, source_surface: 'feed', clip_target_status: 'unknown', has_address: true },
    })
    expect(askTappyPlaceEvent({ phase: 'target', reviewId: REVIEW, surface: 'chat_server', status: 'resolved' }).metadata).toEqual({
      phase: 'target', review_id: REVIEW, source_surface: 'chat_server', clip_target_status: 'resolved',
    })
    for (const surface of ['feed', 'explore_desktop', 'review_detail'] as const) {
      const ev = askTappyPlaceEvent({ phase: 'click', reviewId: REVIEW, surface })
      expect(ev.metadata.source_surface).toBe(surface)
      expect(Object.keys(ev.metadata).sort()).toEqual(['clip_target_status', 'phase', 'review_id', 'source_surface'])
    }
  })

  it('cannot carry free text — the builder has no field for a name, caption, address or question', () => {
    const ev = askTappyPlaceEvent({ phase: 'click', reviewId: REVIEW, surface: 'feed', hasAddress: false })
    for (const v of Object.values(ev.metadata)) expect(['string', 'boolean']).toContain(typeof v)
    // Every string value is either the id or a closed enum member.
    const strings = Object.values(ev.metadata).filter((v): v is string => typeof v === 'string')
    expect(strings.sort()).toEqual([REVIEW, 'click', 'feed', 'unknown'].sort())
  })
})

describe('the future seam', () => {
  it('is an interface a sync Level 0/1 implementation already satisfies — no worker, no queue', async () => {
    const provider: ClipVenueEvidenceProvider = {
      ensureClipVenueEvidence: async (reviewId) => base({ reviewId }),
    }
    const a = await provider.ensureClipVenueEvidence(REVIEW)
    const b = await provider.ensureClipVenueEvidence(REVIEW)
    // Idempotent per (reviewId, analysisVersion): fifty viewers, one analysis.
    expect(a).toEqual(b)
    const shape: Record<keyof ClipVenueResolution, true> = { reviewId: true, status: true, candidates: true, verified: true, analysisVersion: true, analyzedAt: true }
    expect(Object.keys(a).sort()).toEqual(Object.keys(shape).sort())
  })
})
