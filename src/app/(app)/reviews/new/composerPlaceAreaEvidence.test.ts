/**
 * The composer preserves the content processor's `location` as EVIDENCE.
 *
 * Audit 2026-09-12: `POST /api/explore/process` has always returned `location`
 * ("khu vuc neu ro") next to `hashtags`, and the composer kept the tags and threw
 * the area away — every clip was stored with `place_address: ''`, and the reader's
 * "Hỏi Tappy về chỗ này" met a bare name. Now the area pre-fills an EDITABLE field
 * the poster sees before publishing, and what they leave there is stored as
 * `place_address`. No schema change; no venue is named, verified or given an id.
 *
 * Structure is pinned, not vocabulary, in the style of the neighbouring F2 file:
 * the branch exists, it feeds the state, the state feeds the payload, and the
 * poster's own typing is never overwritten.
 */

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { en, vi } from '@/lib/i18n/w2/reviewNew'

const SRC = readFileSync('src/app/(app)/reviews/new/page.tsx', 'utf8')

describe('the processor area reaches the review row as place_address', () => {
  it('reads `location` from the AI result in BOTH upload paths (video file and pasted link)', () => {
    // One helper, called after each `/api/explore/process` response.
    expect(SRC).toMatch(/const suggestArea = \(ai: \{ location\?: unknown \}\) => \{/)
    const calls = SRC.match(/^\s*suggestArea\(ai\)\s*$/gm) ?? []
    expect(calls, 'both AI branches must offer the area').toHaveLength(2)
    // Each call sits right after the hashtags/caption handling of its branch.
    for (const idx of [...SRC.matchAll(/^\s*suggestArea\(ai\)\s*$/gm)].map(m => m.index!)) {
      expect(SRC.slice(Math.max(0, idx - 400), idx)).toContain('setAiHashtags(ai.hashtags)')
    }
  })

  it('is a string-only, bounded read — junk from the model is not turned into an address', () => {
    const helper = SRC.slice(SRC.indexOf('const suggestArea'), SRC.indexOf('const suggestArea') + 400)
    expect(helper).toMatch(/if \(typeof ai\.location !== 'string'\) return/)
    expect(helper).toMatch(/\.trim\(\)\.slice\(0, 100\)/)
  })

  it('🚨 never overwrites what the poster typed', () => {
    const helper = SRC.slice(SRC.indexOf('const suggestArea'), SRC.indexOf('const suggestArea') + 400)
    expect(helper).toMatch(/if \(area && !placeArea\.trim\(\)\) \{ setPlaceArea\(area\); setAreaFromAi\(true\) \}/)
    // Editing the field by hand drops the "suggested" mark, so the hint disappears.
    expect(SRC).toContain("onChange={e => { setPlaceArea(e.target.value); setAreaFromAi(false) }}")
  })

  it('the payload carries the FIELD, not the raw AI value — what the poster sees is what is stored', () => {
    expect(SRC).toMatch(/placeAddress: placeArea\.trim\(\),/)
    expect(SRC, "the old discard — placeAddress: '' — must be gone").not.toMatch(/placeAddress: '',/)
    // The AI result is never written to the payload directly.
    expect(SRC).not.toMatch(/placeAddress: ai\./)
  })

  it('the field is visible and editable, and says where the suggestion came from', () => {
    expect(SRC).toContain('data-testid="review-place-area"')
    expect(SRC).toMatch(/\{\(showPlaceInput \|\| placeArea\) && \(/)
    expect(SRC).toContain('data-testid="review-place-area-hint"')
    expect(SRC).toMatch(/\{areaFromAi && placeArea && \(/)
  })

  it('a suggested area is cleared with the clip it came from — a new file or link, a fresh suggestion', () => {
    expect((SRC.match(/if \(areaFromAi\) \{ setPlaceArea\(''\); setAreaFromAi\(false\) \}/g) ?? []).length).toBe(2)
  })

  it('🚨 names no venue and mints nothing: no place id, no verified flag, no Places call from the composer', () => {
    for (const forbidden of ['place_id:', 'is_verified: true', 'searchPlaces(', '/api/places', 'resolveVenue']) {
      expect(SRC, forbidden).not.toContain(forbidden)
    }
  })

  it('has the copy in both languages, and neither falls back', () => {
    for (const key of ['reviewNew.areaPlaceholder', 'reviewNew.areaSuggested']) {
      expect(vi[key], `${key} missing from vi`).toBeTruthy()
      expect(en[key], `${key} missing from en`).toBeTruthy()
      expect(vi[key], `${key} not translated`).not.toBe(en[key])
    }
  })
})
