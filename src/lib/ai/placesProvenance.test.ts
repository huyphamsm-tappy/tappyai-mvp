import { describe, it, expect } from 'vitest'
import { placesGroundedInProse } from './streamEnrichment'
import { splitToolResult } from './toolResultSplit'

/**
 * A ranked "Tappy recommends" rail asserts relevance. Only a provider that ranked against the
 * user's words has established any.
 *
 * Measured 2026-09-08: with Google Places returning 403, "Quán bún bò ngon ở TP.HCM?" fell through
 * to the OpenStreetMap path and produced Nhà Hàng Jaspas, Nhà Hàng Au Tresor and Nhà Hàng Crazy
 * Buffalo — a Western restaurant, a French restaurant and a steakhouse. All three are real, nearby
 * and correctly tagged `amenity=restaurant`; none answers the dish. That is not a ranking bug to
 * tune, it is structural: `searchPlacesOSM` reads the query only to guess an amenity tag and then
 * asks Overpass for that tag within a radius. The query text never reaches the filter.
 *
 * The fixtures below are those exact names.
 */
describe('a durable card is gated on the provider having ranked by query text', () => {
  const prose = 'Mình gợi ý **Nhà Hàng Jaspas** và **Nhà Hàng Au Tresor** nhé.'

  it('a Google textSearch result may become a card', () => {
    const carded = placesGroundedInProse(
      [{ name: 'Nhà Hàng Jaspas', text_ranked: true }, { name: 'Nhà Hàng Au Tresor', text_ranked: true }],
      prose,
    )
    expect(carded).toHaveLength(2)
    expect(carded.map(p => p.name)).toContain('Nhà Hàng Jaspas')
  })

  it('an OSM category-radius result may NOT become a card, even when the prose names it', () => {
    const carded = placesGroundedInProse(
      [{ name: 'Nhà Hàng Jaspas', text_ranked: false }, { name: 'Nhà Hàng Au Tresor', text_ranked: false }],
      prose,
    )
    expect(carded).toEqual([])
  })

  it('unknown provenance is treated as not ranked — a provider must earn the card', () => {
    expect(placesGroundedInProse([{ name: 'Nhà Hàng Jaspas' }], prose)).toEqual([])
  })

  it('a mixed batch keeps only the text-ranked places', () => {
    const carded = placesGroundedInProse(
      [{ name: 'Nhà Hàng Jaspas', text_ranked: false }, { name: 'Nhà Hàng Au Tresor', text_ranked: true }],
      prose,
    )
    expect(carded.map(p => p.name)).toEqual(['Nhà Hàng Au Tresor'])
  })

  it('prose is never suppressed — the fallback still informs what the model writes', () => {
    // Nothing earns a card, but nothing here touches the reply text itself.
    expect(placesGroundedInProse([{ name: 'Nhà Hàng Jaspas', text_ranked: false }], prose)).toEqual([])
    expect(prose).toContain('Nhà Hàng Jaspas')
  })
})

describe('provenance is carried from the tool result, not guessed', () => {
  const rows = [{ name: 'Quán A', photo_url: 'https://img.example/a.jpg', address: '1 Lê Lợi' }]

  it("marks Google Maps results as text-ranked", () => {
    const { enrichment } = splitToolResult('search_places', { source: 'Google Maps', results: rows })
    expect(enrichment).toHaveLength(1)
    expect(enrichment[0].text_ranked).toBe(true)
  })

  it('marks OpenStreetMap results as not text-ranked', () => {
    const { enrichment } = splitToolResult('search_places', { source: 'OpenStreetMap', results: rows })
    expect(enrichment[0].text_ranked).toBe(false)
  })

  it('treats a missing source as not text-ranked', () => {
    const { enrichment } = splitToolResult('search_places', { results: rows })
    expect(enrichment[0].text_ranked).toBe(false)
  })

  it('leaves the model-facing payload otherwise unchanged', () => {
    const { model } = splitToolResult('search_places', { source: 'OpenStreetMap', count: 1, results: rows })
    const m = model as { source: string; count: number; results: unknown[] }
    expect(m.source).toBe('OpenStreetMap')
    expect(m.count).toBe(1)
    expect(m.results).toHaveLength(1)
  })
})
