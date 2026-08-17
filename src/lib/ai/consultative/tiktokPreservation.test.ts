import { describe, it, expect } from 'vitest'
import { normalizePlaces } from './candidate'
import { rankCandidates } from './rank'
import { derivePick, buildPickPayload } from './pick'
import type { NeedProfile } from './needProfile'

// ── TIKTOK-01…05 — preservation, not prohibition ────────────────────────────
//
// CONTRACT, corrected 2026-08-17 on owner decision.
//
// The old V1 rule ("TikTok review links are unsupported and must always be
// stripped") is SUPERSEDED. The STEP 9 production probe of `main` (d0d221e)
// returned a live `🎵 [Review TikTok](…)` line, and the production tool result
// carried `has_tiktok_review: true`. The shipped
// `feat/tiktok-consultative-review-links` capability is the source of truth, and
// production is not to be downgraded to this branch's older baseline.
//
// The risk the consultative work actually introduces is DIFFERENT and specific:
// the ranker REORDERS the candidate array. Read from `main`'s searchPlaces(), the
// review URL is attached like this:
//
//     const tiktokUrl = pickTikTokReviewUrl(tiktokResults)
//     extra.results = places.map((place, i) => ({
//       ...place,
//       ...(i === 0 && tiktokUrl
//         ? { tiktok_review_url: tiktokUrl, has_tiktok_review: true }
//         : { has_tiktok_review: false }),
//     }))
//
// It is attached to the RECORD at index 0, by spread — so the URL is a property
// of that object, not of that position. Reordering must therefore carry it along.
// These tests prove it does, and prove the failure mode (A's URL surfacing on B)
// cannot happen. Deterministic and network-free throughout.
//
// The fixture shape below is read from `main`'s source, because this branch
// (f49d6c0) predates the capability. No production data is copied and no live
// call is made.

const TIKTOK_URL = 'https://www.tiktok.com/@trangtit10/video/7665216518027857160'

/** A search_places result in the shape main's searchPlaces() emits for food. */
const FOOD_RESULT = {
  source: 'Google Maps',
  count: 3,
  results: [
    {
      place_id: 'ChIJ_first',
      name: 'Bún chả ngon',
      address: '4 P. Nguyễn Siêu, Phố cổ Hà Nội',
      google_rating: '4.9⭐ (986 đánh giá Google Maps)',
      maps_link: 'https://maps.google.com/?cid=1',
      // Attached to index 0 by searchPlaces, per the comment above.
      tiktok_review_url: TIKTOK_URL,
      has_tiktok_review: true,
      order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/tim-kiem?q=Bun+cha+ngon' }],
    },
    {
      place_id: 'ChIJ_second',
      name: 'Bún Chả CỘI phố cổ',
      address: '57 P. Nguyễn Hữu Huân, Phố cổ Hà Nội',
      google_rating: '4.8⭐ (1.264 đánh giá Google Maps)',
      maps_link: 'https://maps.google.com/?cid=2',
      has_tiktok_review: false,
      vegetarian: true,
      order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/tim-kiem?q=Bun+Cha+COI' }],
    },
    {
      place_id: 'ChIJ_third',
      name: 'Bún chả 22 ngõ Huyện',
      address: '22 Ng. Huyện, Hoàn Kiếm',
      google_rating: '5⭐ (621 đánh giá Google Maps)',
      maps_link: 'https://maps.google.com/?cid=3',
      has_tiktok_review: false,
      distance_km: 0.4,
    },
  ],
}

function profile(over: Partial<NeedProfile> = {}): NeedProfile {
  return {
    domain: 'places', subject: null, budget: null, budgetStated: null,
    location: { text: null, gps: null },
    useCases: [], priorities: [], mustHave: [], avoid: [],
    turnsObserved: 1, changedAtTurn: {},
    ...over,
  }
}

const prio = (key: string, weight = 2) => ({ key, weight, source: 'stated' as const })

/** Read the review URL back off a candidate's preserved raw record. */
const reviewUrlOf = (raw: unknown) => (raw as { tiktok_review_url?: string }).tiktok_review_url

describe('TIKTOK-01 — a valid review link survives normalization and ranking', () => {
  const candidates = normalizePlaces(FOOD_RESULT)

  it('normalization keeps the review URL on its own candidate', () => {
    const withReview = candidates.find(c => c.name === 'Bún chả ngon')!
    expect(reviewUrlOf(withReview.raw)).toBe(TIKTOK_URL)
  })

  it('the whole original record is carried through untouched', () => {
    const withReview = candidates.find(c => c.name === 'Bún chả ngon')!
    expect(withReview.raw).toBe(FOOD_RESULT.results[0])
    expect((withReview.raw as { has_tiktok_review: boolean }).has_tiktok_review).toBe(true)
  })

  it('order_links and every other enrichment field survive too', () => {
    const withReview = candidates.find(c => c.name === 'Bún chả ngon')!
    expect((withReview.raw as { order_links: unknown[] }).order_links).toHaveLength(1)
  })

  it('the link is still there after ranking reorders the set', () => {
    // Rank by distance: the THIRD place wins, so the review-carrying record moves.
    const ranked = rankCandidates(candidates, profile({ priorities: [prio('distance')] }))
    const moved = ranked.ranked.find(e => e.candidate.name === 'Bún chả ngon')!
    expect(reviewUrlOf(moved.candidate.raw)).toBe(TIKTOK_URL)
  })

  it('the review URL is NOT promoted into rankable attributes', () => {
    // A review link is evidence for the reader, not a ranking signal. Scoring it
    // would let a provider's coverage decide the recommendation.
    const withReview = candidates.find(c => c.name === 'Bún chả ngon')!
    expect(JSON.stringify(withReview.attrs)).not.toContain('tiktok')
  })
})

describe('TIKTOK-02 — reordering never cross-associates a link', () => {
  const candidates = normalizePlaces(FOOD_RESULT)

  for (const [label, need] of [
    ['distance-first', profile({ priorities: [prio('distance')] })],
    ['rating-first', profile({ priorities: [prio('rating')] })],
    ['vegetarian-first', profile({ priorities: [prio('vegetarian')] })],
    ['no priorities', profile()],
  ] as const) {
    it(`under ${label}, exactly one candidate carries a review URL and it is the right one`, () => {
      const ranked = rankCandidates(candidates, need)
      const carriers = ranked.ranked.filter(e => reviewUrlOf(e.candidate.raw) !== undefined)
      expect(carriers).toHaveLength(1)
      expect(carriers[0].candidate.name).toBe('Bún chả ngon')
      expect(reviewUrlOf(carriers[0].candidate.raw)).toBe(TIKTOK_URL)
    })

    it(`under ${label}, no OTHER candidate acquires a review URL`, () => {
      const ranked = rankCandidates(candidates, need)
      for (const e of ranked.ranked) {
        if (e.candidate.name === 'Bún chả ngon') continue
        expect(reviewUrlOf(e.candidate.raw), `${e.candidate.name} must not inherit a review URL`).toBeUndefined()
        expect((e.candidate.raw as { has_tiktok_review?: boolean }).has_tiktok_review).toBe(false)
      }
    })
  }

  it('the binding is by RECORD IDENTITY, not by array position', () => {
    // This is the property that makes reordering safe. searchPlaces attaches the
    // URL at index 0 by spread, so it belongs to the object; the ranker moves
    // objects. If either side ever switched to index-based association, this fails.
    const ranked = rankCandidates(candidates, profile({ priorities: [prio('distance')] }))
    expect(ranked.ranked[0].candidate.name).not.toBe('Bún chả ngon')  // order really did change
    expect(reviewUrlOf(ranked.ranked[0].candidate.raw)).toBeUndefined()
  })
})

describe('TIKTOK-03 — a Pick keeps the correct review link', () => {
  const candidates = normalizePlaces(FOOD_RESULT)

  // A dedicated fixture where the review-carrying place is unambiguously best, so
  // the assertion is about PRESERVATION and not about tie-break arithmetic. (My
  // first attempt tuned weights to force the winner and picked the wrong one —
  // a test whose premise depends on scoring internals is the wrong test.)
  const REVIEW_WINS = normalizePlaces({
    results: [
      {
        place_id: 'ChIJ_best', name: 'Quán Có Review', maps_link: 'https://maps.google.com/?cid=10',
        google_rating: '4.9⭐ (5.000 đánh giá Google Maps)', distance_km: 0.2,
        tiktok_review_url: TIKTOK_URL, has_tiktok_review: true,
      },
      {
        place_id: 'ChIJ_other', name: 'Quán Thường', maps_link: 'https://maps.google.com/?cid=11',
        google_rating: '3.4⭐ (40 đánh giá Google Maps)', distance_km: 8.0,
        has_tiktok_review: false,
      },
    ],
  })

  it('when the review-carrying candidate wins, the Pick carries its own URL', () => {
    const need = profile({ priorities: [prio('rating')] })
    const pick = derivePick(rankCandidates(REVIEW_WINS, need), need)
    expect(pick).not.toBeNull()
    expect(pick!.candidate.name).toBe('Quán Có Review')
    expect(reviewUrlOf(pick!.candidate.raw)).toBe(TIKTOK_URL)
  })

  it('the runner-up in that same turn still has none', () => {
    const need = profile({ priorities: [prio('rating')] })
    const pick = derivePick(rankCandidates(REVIEW_WINS, need), need)!
    expect(reviewUrlOf(pick.runnerUp!.candidate.raw)).toBeUndefined()
  })

  it('when a candidate WITHOUT a review link wins, the Pick carries no URL', () => {
    const need = profile({ priorities: [prio('distance', 4)] })
    const pick = derivePick(rankCandidates(candidates, need), need)!
    expect(pick.candidate.name).toBe('Bún chả 22 ngõ Huyện')
    expect(reviewUrlOf(pick.candidate.raw)).toBeUndefined()
  })

  it('the Pick payload sent to the model contains no URL at all', () => {
    // The payload is a DECISION, not a link carrier. Links reach the user through
    // the existing enrichment pipeline, bound to their own records — putting one
    // in the payload would create a second, competing source of truth.
    const need = profile({ priorities: [prio('rating', 1), { key: 'reviewCount', weight: 6, source: 'stated' }] })
    const payload = buildPickPayload(derivePick(rankCandidates(candidates, need), need)!)
    expect(JSON.stringify(payload)).not.toContain('http')
    expect(JSON.stringify(payload)).not.toContain('tiktok')
  })
})

describe('TIKTOK-04 — TikTok Shop and TikTok Review Link stay distinct', () => {
  it('a shop.tiktok.com URL is not a review URL and is not treated as one', () => {
    const withShop = {
      results: [{
        place_id: 'x', name: 'Shop Place', maps_link: 'https://maps.google.com/?cid=9',
        website_uri: 'https://shop.tiktok.com/@someseller',
        has_tiktok_review: false,
      }],
    }
    const c = normalizePlaces(withShop)[0]
    expect(reviewUrlOf(c.raw)).toBeUndefined()
    expect((c.raw as { has_tiktok_review: boolean }).has_tiktok_review).toBe(false)
    // The shop URL is preserved as what it is — a website — and not reclassified.
    expect((c.raw as { website_uri: string }).website_uri).toBe('https://shop.tiktok.com/@someseller')
  })

  it('the consultative layer classifies neither — it only orders records', () => {
    // Both fields ride through on `raw` untouched. The normalizer has no branch
    // on either, which is why the two capabilities cannot bleed into each other.
    const c = normalizePlaces(FOOD_RESULT)
    for (const x of c) expect(JSON.stringify(x.attrs)).not.toMatch(/tiktok|shop/i)
  })
})

describe('TIKTOK-05 — no review URL is ever fabricated', () => {
  it('a candidate set with NO review links produces none', () => {
    const noReviews = {
      results: FOOD_RESULT.results.map(r => {
        const copy: Record<string, unknown> = { ...r }
        delete copy.tiktok_review_url
        copy.has_tiktok_review = false
        return copy
      }),
    }
    const ranked = rankCandidates(normalizePlaces(noReviews), profile({ priorities: [prio('rating')] }))
    for (const e of ranked.ranked) expect(reviewUrlOf(e.candidate.raw)).toBeUndefined()
    expect(JSON.stringify(ranked)).not.toContain('tiktok.com')
  })

  it('the number of review URLs out never exceeds the number in', () => {
    const before = FOOD_RESULT.results.filter(r => 'tiktok_review_url' in r).length
    const ranked = rankCandidates(normalizePlaces(FOOD_RESULT), profile({ priorities: [prio('rating')] }))
    const after = ranked.ranked.filter(e => reviewUrlOf(e.candidate.raw) !== undefined).length
    expect(after).toBe(before)
    expect(after).toBe(1)
  })

  it('hard-filtering a candidate removes its link with it, and invents no replacement', () => {
    const need = profile({ avoid: ['non-vegetarian'] })
    const withMeat = normalizePlaces({
      results: [
        { ...FOOD_RESULT.results[0], vegetarian: false },
        FOOD_RESULT.results[1],
      ],
    })
    const ranked = rankCandidates(withMeat, need)
    expect(ranked.filtered.map(f => f.candidate.name)).toContain('Bún chả ngon')
    for (const e of ranked.ranked) expect(reviewUrlOf(e.candidate.raw)).toBeUndefined()
  })
})
