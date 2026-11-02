import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter, canonicalMarkers } from './streamEnrichment'

// ── 30/10: "[ FOLLOWUPS ]" written with spaces reached the user as text ────────────────────────────────────────────────────────────
//
// Measured 30/10 on localhost (O-DEV30 k2par Q09, B27): the model wrote "[ FOLLOWUPS ] 256GB|512GB|Ưu tiên chụp zoom xa[/FOLLOWUPS]".
// Every parser (the stream's marker cut, the clients' chips) reads "[FOLLOWUPS]" exactly, so the line was shown raw and no chips came.
// The model's own spelling slip is repaired once, structurally, where its text enters the filter: a marker name we know, with only
// whitespace inside the brackets, is the marker. Nothing else is touched (a bracket with any other word, a markdown link).

const text = (s: string) => `0:${JSON.stringify(s)}`
const finish = 'd:{"finishReason":"stop"}'
async function run(lines: string[]): Promise<string> {
  const f = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', undefined, undefined, undefined, undefined, false, '', false, undefined, undefined, [])
  return new Response(f.body).text()
}
const rendered = (out: string) => out.split('\n').filter(l => l.startsWith('0:')).map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')

describe('canonicalMarkers', () => {
  it('spaces inside a known marker go; the content is kept', () => {
    expect(canonicalMarkers('A.\n[ FOLLOWUPS ] 256GB|512GB[/FOLLOWUPS]')).toBe('A.\n[FOLLOWUPS] 256GB|512GB[/FOLLOWUPS]')
    expect(canonicalMarkers('[FOLLOWUPS]a|b[ /FOLLOWUPS ]')).toBe('[FOLLOWUPS]a|b[/FOLLOWUPS]')
    expect(canonicalMarkers('[ CTA_BUTTONS ]x[/ CTA_BUTTONS]')).toBe('[CTA_BUTTONS]x[/CTA_BUTTONS]')
  })
  it('a server-only marker written with spaces becomes the marker, so the forged-marker rule sees it', () => {
    expect(canonicalMarkers('[ TAPPY_SHOPPING ]{"a":1}[ /TAPPY_SHOPPING ]')).toBe('[TAPPY_SHOPPING]{"a":1}[/TAPPY_SHOPPING]')
  })
  it('anything else is left byte for byte', () => {
    for (const s of ['[ Ghi chú ] xem thêm', '[FOLLOWUPS]a|b[/FOLLOWUPS]', '[Nguồn](https://x.example/a)', '[ followups ] chữ thường', 'không có ngoặc']) expect(canonicalMarkers(s)).toBe(s)
  })
})

describe('the stream filter repairs a spaced marker before any parser reads it', () => {
  it('live path: no "[ FOLLOWUPS ]" reaches the user; the chips line arrives as the marker', async () => {
    const r = rendered(await run([text('Mình chọn bản 256GB. '), text('\n\n[ FOLLOWUPS ] 256GB|512GB|Ưu tiên chụp zoom xa[/FOLLOWUPS]'), finish]))
    expect(r).not.toContain('[ FOLLOWUPS ]')
    expect(r).toContain('[FOLLOWUPS]')
    expect(r).toContain('Mình chọn bản 256GB.')
  })
  it('buffered path (a place tool ran): the spaced marker is repaired before the settle path parses the reply', async () => {
    const call = `9:${JSON.stringify({ toolCallId: 't1', toolName: 'search_places', args: { query: 'cà phê' } })}`
    const res = `a:${JSON.stringify({ toolCallId: 't1', result: { results: [] } })}`
    const r = rendered(await run([call, res, text('Mình chưa có quán phù hợp.\n\n[ FOLL'), text('OWUPS ]Quận 1|Quận 3[/FOLLOWUPS]'), finish]))
    expect(r).not.toContain('[ FOLL')
    expect(r).not.toContain('OWUPS ]')
  })
  it('live path, split across deltas', async () => {
    const r = rendered(await run([text('Chọn đi bạn.\n\n[ FOLL'), text('OWUPS ]Một chiều|Khứ'), text(' hồi[/FOLLOWUPS]'), finish]))
    expect(r).not.toContain('[ FOLL')
    expect(r).toContain('[FOLLOWUPS]')
  })
})
