import { describe, it, expect } from 'vitest'
import { MAX_LAYERS, defaultTextLayer, emptyOverlay, validateOverlayDoc, type OverlayDoc } from '@/lib/media/video/overlay/schema'
import { MIN_LAYER_MS, addLayer, formatSeconds, moveLayer, movedPosition, nudgeLayer, removeLayer, rotationAt, scaledSize, updateLayer } from './editorOps'

const D = 6000
const docOf = (...ids: string[]): OverlayDoc => ({ schema_version: 1, layers: ids.map(id => ({ ...defaultTextLayer(id, D), text: id })) })
const valid = (doc: OverlayDoc) => validateOverlayDoc(doc, { durationMs: D }).ok

describe('addLayer', () => {
  it('adds a valid layer at the current position, three seconds long, clamped to the clip', () => {
    const r = addLayer(emptyOverlay(), D, 1500, 'n1')
    expect(r.id).toBe('n1')
    expect(r.doc.layers[0]).toMatchObject({ start_ms: 1500, end_ms: 4500, x: 0.5, y: 0.5 })
    expect(valid(r.doc)).toBe(true)
    const late = addLayer(emptyOverlay(), D, 5900, 'n2').doc.layers[0]
    expect(late.end_ms).toBe(D)
    expect(late.end_ms - late.start_ms).toBeGreaterThanOrEqual(MIN_LAYER_MS)
    expect(valid(addLayer(emptyOverlay(), D, 99_999, 'n3').doc)).toBe(true)
    expect(valid(addLayer(emptyOverlay(), 1000, -50, 'n4').doc)).toBe(true)
  })
  it('stops at the layer limit', () => {
    let doc = emptyOverlay()
    for (let i = 0; i < MAX_LAYERS; i++) doc = addLayer(doc, D, 0, `l${i}`).doc
    const r = addLayer(doc, D, 0, 'extra')
    expect(r.id).toBeNull()
    expect(r.doc).toBe(doc)
  })
  it('a generated id is valid and a second add does not reuse it', () => {
    const a = addLayer(emptyOverlay(), D)
    const b = addLayer(a.doc, D)
    expect(valid(b.doc)).toBe(true)
    expect(new Set(b.doc.layers.map(l => l.id)).size).toBe(2)
  })
})

describe('removeLayer / moveLayer', () => {
  it('removes by id', () => expect(removeLayer(docOf('a', 'b', 'c'), 'b').layers.map(l => l.id)).toEqual(['a', 'c']))
  it('reorders one step and stops at the ends', () => {
    expect(moveLayer(docOf('a', 'b', 'c'), 'a', 1).layers.map(l => l.id)).toEqual(['b', 'a', 'c'])
    expect(moveLayer(docOf('a', 'b', 'c'), 'c', -1).layers.map(l => l.id)).toEqual(['a', 'c', 'b'])
    const d = docOf('a', 'b')
    expect(moveLayer(d, 'a', -1)).toBe(d)
    expect(moveLayer(d, 'b', 1)).toBe(d)
    expect(moveLayer(d, 'zzz', 1)).toBe(d)
  })
})

describe('updateLayer — every result stays inside the schema', () => {
  const base = docOf('a')
  it.each([
    ['x far outside', { x: 9 }],
    ['negative y', { y: -3 }],
    ['size too big', { size: 5 }],
    ['size too small', { size: 0 }],
    ['rotation 700', { rotation: 700 }],
    ['width tiny', { width: 0 }],
    ['text too long', { text: 'x'.repeat(500) }],
    ['outline too thick', { outline: { color: '#000000', width: 9 } }],
    ['background opacity > 1', { background: { color: '#000000', opacity: 4 } }],
    ['start after end', { start_ms: 5000, end_ms: 1000 }],
    ['end past the clip', { end_ms: 999_999 }],
    ['negative start', { start_ms: -500 }],
    ['fractional ms', { start_ms: 100.7, end_ms: 2000.2 }],
  ] as const)('%s', (_name, patch) => {
    expect(valid(updateLayer(base, 'a', patch as never, D))).toBe(true)
  })

  it('a handle that crosses the other gives way, keeping the minimum length', () => {
    const doc = updateLayer(base, 'a', { start_ms: 1000, end_ms: 2000 }, D)
    const pushedStart = updateLayer(doc, 'a', { start_ms: 3000 }, D).layers[0]
    expect(pushedStart.end_ms - pushedStart.start_ms).toBeGreaterThanOrEqual(MIN_LAYER_MS)
    expect(pushedStart.end_ms).toBe(2000)
    const pulledEnd = updateLayer(doc, 'a', { end_ms: 500 }, D).layers[0]
    expect(pulledEnd.end_ms - pulledEnd.start_ms).toBeGreaterThanOrEqual(MIN_LAYER_MS)
    expect(pulledEnd.start_ms).toBe(1000)
  })

  it('other layers and the original are untouched', () => {
    const doc = docOf('a', 'b')
    const next = updateLayer(doc, 'a', { text: 'đổi' }, D)
    expect(next.layers[1]).toBe(doc.layers[1])
    expect(doc.layers[0].text).toBe('a')
    expect(next.layers[0].text).toBe('đổi')
  })
})

describe('nudge and pointer geometry', () => {
  it('nudges and stays inside the frame', () => {
    const d = nudgeLayer(docOf('a'), 'a', 0.01, -0.01, D).layers[0]
    expect([d.x, d.y]).toEqual([0.51, 0.49])
    expect(nudgeLayer(docOf('a'), 'a', 5, -5, D).layers[0]).toMatchObject({ x: 1, y: 0 })
  })

  const rect = { left: 100, top: 50, width: 200, height: 400 }
  it('a drag moves by the pointer travel as a fraction of the frame, clamped', () => {
    expect(movedPosition({ x: 0.5, y: 0.5 }, { x: 0, y: 0 }, { x: 20, y: 40 }, rect)).toEqual({ x: 0.6, y: 0.6 })
    expect(movedPosition({ x: 0.5, y: 0.5 }, { x: 0, y: 0 }, { x: 9999, y: -9999 }, rect)).toEqual({ x: 1, y: 0 })
    expect(movedPosition({ x: 0.3, y: 0.3 }, { x: 0, y: 0 }, { x: 50, y: 50 }, { ...rect, width: 0 })).toEqual({ x: 0.3, y: 0.3 })
  })

  it('scaling follows the distance from the centre, within the size limits', () => {
    const l = { x: 0.5, y: 0.5, size: 0.07 } // centre at (200, 250)
    expect(scaledSize(l, { x: 300, y: 250 }, { x: 400, y: 250 }, rect)).toBeCloseTo(0.14, 5)
    expect(scaledSize(l, { x: 300, y: 250 }, { x: 250, y: 250 }, rect)).toBeCloseTo(0.035, 5)
    expect(scaledSize(l, { x: 300, y: 250 }, { x: 9999, y: 250 }, rect)).toBe(0.2)
    expect(scaledSize(l, { x: 300, y: 250 }, { x: 201, y: 250 }, rect)).toBe(0.02)
    expect(scaledSize(l, { x: 200, y: 250 }, { x: 400, y: 250 }, rect)).toBe(0.07) // grabbed on the centre: no division by zero
  })

  it('rotating: straight above is 0, to the right is 90, snapped within 3 degrees', () => {
    const l = { x: 0.5, y: 0.5 } // centre (200, 250)
    expect(rotationAt(l, { x: 200, y: 100 }, rect)).toBe(0)
    expect(rotationAt(l, { x: 350, y: 250 }, rect)).toBe(90)
    expect(Math.abs(rotationAt(l, { x: 200, y: 400 }, rect))).toBe(180) // straight down: 180 and -180 are the same picture
    expect(rotationAt(l, { x: 50, y: 250 }, rect)).toBe(-90)
    expect(rotationAt(l, { x: 203, y: 100 }, rect)).toBe(0) // ~1.1 degrees: snaps
    const free = rotationAt(l, { x: 300, y: 150 }, rect) // up-right: 45
    expect(free).toBeCloseTo(45, 0)
    expect(free).toBeGreaterThanOrEqual(-180)
    expect(free).toBeLessThanOrEqual(180)
  })
})

describe('formatSeconds', () => {
  it('one decimal', () => expect(formatSeconds(1500)).toBe('1.5 s'))
})
