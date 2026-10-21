import { describe, it, expect } from 'vitest'
import { toPersisted, renderPlacesMarker, PLACES_MARKER_OPEN, PLACES_MARKER_CLOSE } from './marker'
import { buildProductEntity } from './buildEntity'
import { buildRecommendations } from './recommendation'
import { EMIT_TAPPY_PLACES } from '@/lib/config/product'

// ── Gate 2 F-B (B1): a persisted [TAPPY_PLACES] image is a safe https URL or nothing ──
//
// The marker is frozen into the message text and iOS / Android render `image` straight into an
// image view (`URL(string:)` / Coil), whatever the scheme. toPersisted is the one place every
// persisted image passes, so the check lives there — and it holds while EMIT_TAPPY_PLACES is still
// off, so flipping the flag later cannot ship an unchecked image.
//
// buildImages() already keeps only `http…` strings; `data:` / `javascript:` are set directly on the
// entity here to pin toPersisted's own contract, independent of how an entity was built.

const recWithImage = (url: string) => {
  const rec = buildRecommendations([buildProductEntity({
    title: 'MacBook Air M2', link: 'https://shop.example/mba', price_vnd: 24990000, source: 'CellphoneS', photo_url: 'https://cdn.example/x.jpg',
  })])[0]
  rec.entity.images.primary = { ...rec.entity.images.primary!, url }
  return rec
}

const UNSAFE = [
  'data:image/png;base64,iVBORw0KGgo',
  'http://cdn.example/a.jpg',
  'https://localhost/a.jpg',
  'https://127.0.0.1/a.jpg',
  'https://u:p@cdn.example/a.jpg',
  'javascript:alert(1)',
  'https://[::1]/a.jpg',
]

describe('FB-T1 — toPersisted writes `image` only for a safe https URL', () => {
  for (const url of UNSAFE) {
    it(`drops ${url.slice(0, 40)}`, () => {
      expect(toPersisted(recWithImage(url)).image).toBeUndefined()
    })
  }

  it('control: a public https image is kept', () => {
    expect(toPersisted(recWithImage('https://cdn.example/a.jpg')).image).toBe('https://cdn.example/a.jpg')
  })
})

describe('FB-T2 — renderPlacesMarker, with EMIT_TAPPY_PLACES still off', () => {
  it('the marker JSON carries no unsafe image; the https one stays', () => {
    expect(EMIT_TAPPY_PLACES).toBe(false)
    const m = renderPlacesMarker([recWithImage('data:image/png;base64,iVBORw0KGgo'), recWithImage('https://cdn.example/b.jpg')])
    expect(m).not.toContain('data:')
    const payload = JSON.parse(m.slice(PLACES_MARKER_OPEN.length, -PLACES_MARKER_CLOSE.length)) as { items: Array<{ image?: string }> }
    expect(payload.items.map(i => i.image)).toEqual([undefined, 'https://cdn.example/b.jpg'])
  })
})
