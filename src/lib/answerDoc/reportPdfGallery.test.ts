import { describe, it, expect } from 'vitest'
import { reportPdfDesigned } from './reportPdfDesign'
import type { PdfCover } from './reportPdf'

// Plan PDF pictures (20/11): the designed page can close its sections with a gallery (title, then each picture with its caption), drawn only from the pictures the caller loaded.
const cover: PdfCover = { eyebrow: 'Trip', title: 'Quy Nhon', facts: [], kind: 'TRIP', updated: 'Updated 20/11', sources: 0, sourcesWord: '', words: { scope: 'Scope', caveats: 'Notes', sources: 'Sources', footer: 'Updated' }, labels: { line: 'L', note: 'N', footerBrand: 'F' } }
const TEXT = '# Quy Nhon\n\n## Day 1\n\n- **09:00 - Ky Co** - beach\n\n## Tips\n\n- Book ahead\n'
const GIF = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const imagesOf = (def: Record<string, unknown> | null): Array<Record<string, unknown>> => {
  const out: Array<Record<string, unknown>> = []
  const walk = (n: unknown): void => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { const o = n as Record<string, unknown>; if (typeof o.image === 'string' && o.image === GIF) out.push(o); Object.values(o).forEach(walk) } }
  walk(def?.content)
  return out
}
const textOf = (def: Record<string, unknown> | null) => JSON.stringify(def?.content)

describe('the designed PDF page: gallery', () => {
  it('draws each loaded picture with its caption under the gallery title, after the sections', () => {
    const def = reportPdfDesigned(TEXT, [], { cover, gallery: { title: 'Photos of the stops', items: [{ name: 'Ky Co', dataUrl: GIF }, { name: 'Eo Gio', dataUrl: GIF }] } })
    expect(imagesOf(def)).toHaveLength(2)
    const t = textOf(def)
    expect(t).toContain('Photos of the stops')
    expect(t).toContain('Ky Co')
    expect(t).toContain('Eo Gio')
    expect(t.indexOf('Book ahead')).toBeLessThan(t.indexOf('Photos of the stops'))
  })
  it('no gallery, or an empty one, changes nothing', () => {
    const none = reportPdfDesigned(TEXT, [], { cover })
    const empty = reportPdfDesigned(TEXT, [], { cover, gallery: { title: 'Photos of the stops', items: [] } })
    expect(textOf(empty)).toBe(textOf(none))
    expect(textOf(none)).not.toContain('Photos of the stops')
  })
  it('only data URLs of pictures are drawn: any other string is skipped', () => {
    const def = reportPdfDesigned(TEXT, [], { cover, gallery: { title: 'Photos', items: [{ name: 'A', dataUrl: 'https://evil.example/x.jpg' }, { name: 'B', dataUrl: GIF }] } })
    expect(imagesOf(def)).toHaveLength(1)
    expect(textOf(def)).not.toContain('evil.example')
  })
})
