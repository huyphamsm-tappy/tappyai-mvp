import { describe, it, expect } from 'vitest'
import { defaultTextLayer, type OverlayLayer } from '@/lib/media/video/overlay/schema'
import { SHADOW, boxWidthPx, fontPx, paddingPx } from '@/lib/media/video/overlay/layout'
import { OVERLAY_FONT_STACK, hexToRgba, layerBoxStyle, layerTextStyle } from './layerStyle'

const layer = (over: Partial<OverlayLayer> = {}): OverlayLayer => ({ ...defaultTextLayer('a'), ...over })

describe('layerBoxStyle', () => {
  it('positions the centre by the normalised coordinates and rotates about it', () => {
    const s = layerBoxStyle(layer({ x: 0.25, y: 0.75, width: 0.6, rotation: -15, align: 'right' }))
    expect(s).toMatchObject({ position: 'absolute', left: '25%', top: '75%', width: '60%', textAlign: 'right', transform: 'translate(-50%, -50%) rotate(-15deg)' })
  })
})

describe('layerTextStyle — the same sizing rule as the server renderer', () => {
  it('font size is the fraction of the frame WIDTH, in pixels (the renderer uses the same function)', () => {
    expect(layerTextStyle(layer({ size: 0.07 }), 360).fontSize).toBe(`${fontPx({ size: 0.07 }, 360)}px`)
    expect(layerTextStyle(layer({ size: 0.07 }), 720).fontSize).toBe('50px')
    expect(fontPx({ size: 0.07 }, 720)).toBe(2 * fontPx({ size: 0.07 }, 360))
  })
  it('padding is reserved in em, like the renderer, so wrapping agrees', () => {
    const px = fontPx({ size: 0.07 }, 360)
    expect(paddingPx(px).x).toBe(Math.round(px * 0.4))
    expect(layerTextStyle(layer(), 360).padding).toBe('0.2em 0.4em')
    expect(boxWidthPx({ width: 0.8 }, 360)).toBe(288)
  })
  it('colour, weight, family', () => {
    const s = layerTextStyle(layer({ color: '#ff0000', weight: 'normal' }), 360)
    expect([s.color, s.fontWeight, s.fontFamily]).toEqual(['#ff0000', 400, OVERLAY_FONT_STACK])
    expect(layerTextStyle(layer({ weight: 'bold' }), 360).fontWeight).toBe(700)
  })
  it('background, outline and shadow appear only when set', () => {
    const none = layerTextStyle(layer({ background: null, outline: null, shadow: false }), 360)
    expect(none.backgroundColor).toBeUndefined()
    expect(none.textShadow).toBeUndefined()
    expect((none as Record<string, unknown>).WebkitTextStroke).toBeUndefined()
    const all = layerTextStyle(layer({ background: { color: '#102030', opacity: 0.5 }, outline: { color: '#000000', width: 0.1 }, shadow: true, size: 0.1 }), 360)
    expect(all.backgroundColor).toBe('rgba(16, 32, 48, 0.5)')
    expect(all.textShadow).toBe(`${SHADOW.dx}em ${SHADOW.dy}em ${SHADOW.blur}em rgba(0, 0, 0, ${SHADOW.opacity})`)
    // outline: the stroke is centred on the edge, so it is twice the renderer's growth (0.1 em of 36 px = 3.6 px)
    expect((all as Record<string, unknown>).WebkitTextStroke).toBe('7.20px #000000')
  })
  it('text is drawn as text: pre-wrapped, never selectable', () => {
    const s = layerTextStyle(layer(), 360)
    expect([s.whiteSpace, s.userSelect]).toEqual(['pre-wrap', 'none'])
  })
})

describe('hexToRgba', () => {
  it('converts', () => expect(hexToRgba('#ffffff', 1)).toBe('rgba(255, 255, 255, 1)'))
})
