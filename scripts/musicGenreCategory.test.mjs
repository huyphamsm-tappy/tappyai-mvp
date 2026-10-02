import { describe, it, expect } from 'vitest'
import {
  MUSIC_CATEGORY_SLUGS,
  TRENDING_TOP_N,
  categorySlugForGenres,
  categorySlugForTrack,
} from './musicGenreCategory.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// The Music Library's category tabs were all empty except "Tất cả".
//
// Not a filtering bug: `getTracks()` applies `.eq('category_id', id)` correctly
// and the tabs pass the right ids. The catalog itself had never been
// classified — `ingest-jamendo.mjs` inserted every row without `category_id`,
// so all 50 live tracks carried `categoryId: null` and each tab honestly
// matched nothing.
//
// These tests pin the classification that now runs at ingest time, so a
// silently uncategorised catalog cannot come back.
// ─────────────────────────────────────────────────────────────────────────────

describe('categorySlugForGenres — Jamendo tags map to the seeded categories', () => {
  it.each([
    [['chillout'], 'chill'],
    [['lounge', 'pop'], 'chill'],
    [['pop'], 'upbeat'],
    [['acoustic', 'folk'], 'acoustic'],
    [['electronic'], 'electronic'],
    [['soundtrack'], 'cinematic'],
  ])('%j -> %s', (genres, expected) => {
    expect(categorySlugForGenres(genres)).toBe(expected)
  })

  it('reads the same genre through Jamendo\'s spelling variants', () => {
    // "Chill Out", "chill-out" and "chillout" are the same genre on Jamendo.
    for (const spelling of ['Chill Out', 'chill-out', 'CHILLOUT', ' chillout ']) {
      expect(categorySlugForGenres([spelling])).toBe('chill')
    }
    expect(categorySlugForGenres(['Drum n Bass'])).toBe('electronic')
    expect(categorySlugForGenres(['Hip Hop'])).toBe('upbeat')
  })

  it('takes the first RECOGNISED genre, not the first genre', () => {
    // Jamendo lists the most representative genre first, but that one is not
    // always in our vocabulary; skipping to the next is what keeps a track
    // classified instead of dropped.
    expect(categorySlugForGenres(['experimental', 'house'])).toBe('electronic')
  })

  it('🚨 returns null for an unknown genre rather than guessing a category', () => {
    // An uncategorised track is honest. A track filed under a category it does
    // not belong to is the failure this whole mapping exists to avoid.
    expect(categorySlugForGenres(['gamelan'])).toBeNull()
    expect(categorySlugForGenres([])).toBeNull()
    expect(categorySlugForGenres(undefined)).toBeNull()
    expect(categorySlugForGenres(null)).toBeNull()
  })

  it('only ever returns a slug the database actually has', () => {
    const seen = [
      ['chillout'], ['pop'], ['acoustic'], ['electronic'], ['soundtrack'], ['jazz'], ['metal'],
    ].map((g) => categorySlugForGenres(g))
    for (const slug of seen) {
      expect(MUSIC_CATEGORY_SLUGS).toContain(slug)
    }
  })
})

describe('categorySlugForTrack — trending comes from popularity, not from a tag', () => {
  it('files the most popular arrivals under trending', () => {
    expect(categorySlugForTrack({ genres: ['pop'], popularityRank: 0 })).toBe('trending')
    expect(categorySlugForTrack({ genres: ['electronic'], popularityRank: TRENDING_TOP_N - 1 })).toBe('trending')
  })

  it('falls back to the genre once past the trending window', () => {
    expect(categorySlugForTrack({ genres: ['electronic'], popularityRank: TRENDING_TOP_N })).toBe('electronic')
    expect(categorySlugForTrack({ genres: ['chillout'], popularityRank: 40 })).toBe('chill')
  })

  it('leaves a track uncategorised when it is neither popular enough nor recognised', () => {
    expect(categorySlugForTrack({ genres: ['gamelan'], popularityRank: 40 })).toBeNull()
    expect(categorySlugForTrack({})).toBeNull()
  })

  it('does not treat a missing rank as rank 0', () => {
    // A caller that forgets the rank must not silently mark everything trending.
    expect(categorySlugForTrack({ genres: ['pop'] })).toBe('upbeat')
  })

  it('spreads a realistic popularity-ordered page across several categories', () => {
    // The shape that matters to the UAT: after ingest, more than one tab has content.
    const page = [
      ['pop'], ['rock'], ['chillout'], ['electronic'], ['acoustic'], ['soundtrack'],
      ['pop'], ['house'], ['lounge'], ['folk'], ['techno'], ['orchestral'],
    ]
    const slugs = page.map((genres, i) => categorySlugForTrack({ genres, popularityRank: i }))
    expect(new Set(slugs.filter(Boolean)).size).toBeGreaterThan(3)
    expect(slugs.filter((s) => s === 'trending')).toHaveLength(TRENDING_TOP_N)
  })
})
