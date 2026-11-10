import { describe, it, expect } from 'vitest'
import {
  MAX_LAYERS, MAX_TEXT_LENGTH, OVERLAY_FONTS, OVERLAY_SCHEMA_VERSION,
  emptyOverlay, newLayerId, overlayTextOf, parseOverlay, serializeOverlay, validateOverlayDoc, defaultTextLayer,
  type OverlayLayer,
} from './schema'

const layer = (over: Partial<OverlayLayer> = {}): OverlayLayer => ({ ...defaultTextLayer('a1'), text: 'Xin chào Đà Nẵng!', start_ms: 1000, end_ms: 4000, ...over })
const doc = (layers: unknown[] = [layer()]) => ({ schema_version: OVERLAY_SCHEMA_VERSION, layers })
const bad = (input: unknown, opts?: { durationMs?: number }) => {
  const r = validateOverlayDoc(input, opts)
  if (r.ok) throw new Error('expected a rejection')
  return r.errors
}

describe('validateOverlayDoc', () => {
  it('accepts a normal document and returns it normalised (colours lower-cased)', () => {
    const r = validateOverlayDoc(doc([layer({ color: '#FFAA00' })]), { durationMs: 6000 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.doc.layers[0].color).toBe('#ffaa00')
  })

  it('an empty document is valid', () => {
    expect(validateOverlayDoc(emptyOverlay()).ok).toBe(true)
  })

  it('requires schema_version, and only version 1', () => {
    expect(bad({ layers: [] })).toContain('schema_version')
    expect(bad({ schema_version: 2, layers: [] })).toContain('schema_version')
    expect(bad({ schema_version: '1', layers: [] })).toContain('schema_version')
  })

  it('rejects anything that is not an object, and unknown fields at every level', () => {
    expect(bad(null)).toEqual(['doc'])
    expect(bad([])).toEqual(['doc'])
    expect(bad('x')).toEqual(['doc'])
    expect(bad({ ...doc(), extra: 1 })).toContain('doc.extra')
    expect(bad(doc([{ ...layer(), evil: true }]))).toContain('layers.0.evil')
    expect(bad(doc([layer({ background: { color: '#000000', opacity: 0.5, x: 1 } as never })]))).toContain('layers.0.background.x')
    expect(bad(doc([layer({ outline: { color: '#000000', width: 0.05, y: 1 } as never })]))).toContain('layers.0.outline.y')
  })

  it('bounds the number of layers', () => {
    const many = Array.from({ length: MAX_LAYERS + 1 }, (_, i) => layer({ id: `l${i}` }))
    expect(bad(doc(many))).toContain('layers')
    expect(validateOverlayDoc(doc(many.slice(0, MAX_LAYERS))).ok).toBe(true)
  })

  it('layer ids are stable-looking and unique', () => {
    expect(bad(doc([layer({ id: 'bad id!' })]))).toContain('layers.0.id')
    expect(bad(doc([layer({ id: '' })]))).toContain('layers.0.id')
    expect(bad(doc([layer({ id: 'same' }), layer({ id: 'same' })]))).toContain('layers.1.id')
  })

  it('bounds the text: not empty, not blank, not longer than the limit, no control or direction-changing characters', () => {
    expect(bad(doc([layer({ text: '' })]))).toContain('layers.0.text')
    expect(bad(doc([layer({ text: '   \n ' })]))).toContain('layers.0.text')
    expect(bad(doc([layer({ text: 'a'.repeat(MAX_TEXT_LENGTH + 1) })]))).toContain('layers.0.text')
    expect(validateOverlayDoc(doc([layer({ text: 'a'.repeat(MAX_TEXT_LENGTH) })])).ok).toBe(true)
    expect(bad(doc([layer({ text: 'a\u0000b' })]))).toContain('layers.0.text')
    expect(bad(doc([layer({ text: 'a‮b' })]))).toContain('layers.0.text')
    expect(bad(doc([layer({ text: 'a​b' })]))).toContain('layers.0.text')
    expect(validateOverlayDoc(doc([layer({ text: 'dòng 1\ndòng 2' })])).ok).toBe(true)
    expect(bad(doc([layer({ text: 'a\nb\nc\nd\ne\nf\ng' })]))).toContain('layers.0.text')
  })

  it('coordinates are normalised to 0..1 and numbers must be finite', () => {
    expect(bad(doc([layer({ x: -0.1 })]))).toContain('layers.0.x')
    expect(bad(doc([layer({ y: 1.01 })]))).toContain('layers.0.y')
    expect(bad(doc([layer({ x: Number.NaN })]))).toContain('layers.0.x')
    expect(bad(doc([layer({ y: Infinity })]))).toContain('layers.0.y')
    expect(bad(doc([layer({ width: 0.01 })]))).toContain('layers.0.width')
    expect(bad(doc([layer({ size: 0.9 })]))).toContain('layers.0.size')
    expect(bad(doc([layer({ x: '0.5' as never })]))).toContain('layers.0.x')
  })

  it('rotation is within -180..180', () => {
    expect(bad(doc([layer({ rotation: 181 })]))).toContain('layers.0.rotation')
    expect(validateOverlayDoc(doc([layer({ rotation: -180 })])).ok).toBe(true)
  })

  it('only allowed fonts, weights and alignments', () => {
    expect(OVERLAY_FONTS.length).toBeGreaterThan(0)
    expect(bad(doc([layer({ font: 'comic-sans' as never })]))).toContain('layers.0.font')
    expect(bad(doc([layer({ weight: 'black' as never })]))).toContain('layers.0.weight')
    expect(bad(doc([layer({ align: 'justify' as never })]))).toContain('layers.0.align')
  })

  it('colours are #rrggbb only; opacity 0..1; outline width bounded; shadow is a boolean', () => {
    expect(bad(doc([layer({ color: 'red' })]))).toContain('layers.0.color')
    expect(bad(doc([layer({ color: 'url(javascript:1)' })]))).toContain('layers.0.color')
    expect(bad(doc([layer({ background: { color: '#12345', opacity: 0.5 } })]))).toContain('layers.0.background.color')
    expect(bad(doc([layer({ background: { color: '#000000', opacity: 1.5 } })]))).toContain('layers.0.background.opacity')
    expect(bad(doc([layer({ outline: { color: '#000000', width: 0.9 } })]))).toContain('layers.0.outline.width')
    expect(bad(doc([layer({ shadow: 'yes' as never })]))).toContain('layers.0.shadow')
    expect(validateOverlayDoc(doc([layer({ background: null, outline: null, shadow: false })])).ok).toBe(true)
  })

  it('times are whole milliseconds, start < end, and inside the clip when its duration is known', () => {
    expect(bad(doc([layer({ start_ms: 2000, end_ms: 2000 })]))).toContain('layers.0.end_ms')
    expect(bad(doc([layer({ start_ms: -1 })]))).toContain('layers.0.start_ms')
    expect(bad(doc([layer({ start_ms: 1000.5 })]))).toContain('layers.0.start_ms')
    expect(bad(doc([layer({ end_ms: 7000 })]), { durationMs: 6000 })).toContain('layers.0.end_ms')
    expect(validateOverlayDoc(doc([layer({ end_ms: 6000 })]), { durationMs: 6000 }).ok).toBe(true)
    // Unknown duration: only the order is checked.
    expect(validateOverlayDoc(doc([layer({ end_ms: 7_000_000 })])).ok).toBe(true)
  })

  it('does not trust prototype tricks', () => {
    const evil = JSON.parse('{"schema_version":1,"layers":[],"__proto__":{"x":1}}')
    expect(validateOverlayDoc(evil).ok).toBe(false)
  })
})

describe('serialisation', () => {
  it('is stable: the same document always gives the same text, whatever the key order', () => {
    const a = validateOverlayDoc(doc())
    expect(a.ok).toBe(true)
    if (!a.ok) return
    const reordered = { layers: a.doc.layers.map(l => Object.fromEntries(Object.entries(l).reverse())), schema_version: 1 }
    const c = validateOverlayDoc(reordered)
    expect(c.ok).toBe(true)
    if (c.ok) expect(serializeOverlay(c.doc)).toBe(serializeOverlay(a.doc))
  })

  it('round-trips through parseOverlay', () => {
    const r = validateOverlayDoc(doc())
    if (!r.ok) throw new Error('x')
    const back = parseOverlay(serializeOverlay(r.doc))
    expect(back.ok && back.doc).toEqual(r.doc)
    expect(parseOverlay('{not json').ok).toBe(false)
  })
})

describe('overlayTextOf (read by moderation)', () => {
  it('returns every text layer, in layer order', () => {
    expect(overlayTextOf(doc([layer({ id: 'a', text: 'một' }), layer({ id: 'b', text: 'hai' })]))).toEqual(['một', 'hai'])
  })
  it('never throws and still reads text from a document that no longer validates (moderation must see everything)', () => {
    expect(overlayTextOf(null)).toEqual([])
    expect(overlayTextOf('x')).toEqual([])
    expect(overlayTextOf({ layers: 'no' })).toEqual([])
    expect(overlayTextOf({ schema_version: 99, layers: [{ text: 'cũ' }, { nope: 1 }, null, { text: 5 }] })).toEqual(['cũ'])
  })
})

describe('newLayerId', () => {
  it('makes ids that pass the validator and do not repeat', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newLayerId()))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(validateOverlayDoc(doc([layer({ id })])).ok).toBe(true)
  })
})
