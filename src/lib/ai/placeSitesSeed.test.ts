// Review (final) S2 · the R2(a) input to the price guard (collector.placeSites, seeded into placeSiteHosts in streamEnrichment.ts), at the stream filter itself.
// B4: a host the turn's own place rows already tied to venue X is NOT re-tied to venue Y by placeSites (a price read on X's site stays X's).
// B5: the host table holds at most 60 hosts; placeSites never pushes past it (a 61st venue's site is not learned, its page price is not attributed).
// MOCK ONLY: frames are built by hand; no network, no model.
import { describe, it, expect, vi } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

const Q = 'quán cà phê gần đây'
const PAGE = (url: string) => ({ pages: [{ url, status: 'ok', page_content: '## Đồ uống\nMón | Giá\nBạc xỉu | 52.000đ' }] })
type Row = { name: string; website_uri?: string }

async function run(rows: Row[], placeSites: Array<{ name: string; website: string }>, pageUrl: string, prose: string): Promise<string> {
  const collector = createEnrichmentCollector(Q)
  collector.placeSites = placeSites
  const frames = [
    `9:${JSON.stringify({ toolCallId: 'p1', toolName: 'search_places', args: { query: 'cà phê', type: 'cafe' } })}`,
    `a:${JSON.stringify({ toolCallId: 'p1', result: { results: rows.map(r => ({ ...r, rating_value: 4.5, rating_count: 100 })) } })}`,
    `9:${JSON.stringify({ toolCallId: 'r1', toolName: 'read_page', args: { urls: [pageUrl] } })}`,
    `a:${JSON.stringify({ toolCallId: 'r1', result: PAGE(pageUrl) })}`,
    `0:${JSON.stringify(prose)}`,
    'd:{"finishReason":"stop"}',
  ]
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  let raw = ''
  try { raw = await applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, Q, false).text() } finally { spy.mockRestore() }
  return raw.split('\n').filter(l => l.startsWith('0:')).map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')
}

describe('S2 · B4 — a host already known keeps its venue', () => {
  const rows: Row[] = [{ name: 'Cà phê Mây', website_uri: 'https://caphemay.example/' }, { name: 'Trà Gió' }]
  const claim = [{ name: 'Trà Gió', website: 'https://caphemay.example/' }] // placeSites says the SAME host is Trà Gió's
  it('the page price said of Cà phê Mây (whose row owns the host) stays', async () => {
    expect(await run(rows, claim, 'https://caphemay.example/', 'Mình chọn **Cà phê Mây**. Bạc xỉu **52.000đ**.')).toContain('52.000đ')
  })
  it('the same page price said of Trà Gió is cut: placeSites cannot re-tie a known host to another venue', async () => {
    const out = await run(rows, claim, 'https://caphemay.example/', 'Mình chọn **Trà Gió**. Bạc xỉu **52.000đ**.')
    expect(out).toContain('Trà Gió')
    expect(out).not.toContain('52.000đ')
  })
  it('live control: with no row owning the host, placeSites DOES tie it to Trà Gió and the price stays', async () => {
    const out = await run([{ name: 'Cà phê Mây' }, { name: 'Trà Gió' }], claim, 'https://caphemay.example/', 'Mình chọn **Trà Gió**. Bạc xỉu **52.000đ**.')
    expect(out).toContain('52.000đ')
  })
})

describe('S2 · B5 — at most 60 hosts', () => {
  // The table is filled through placeSites itself (the seed loop the cap guards): n entries with a site of their own, then Quán Z. The turn's rows stay two venues
  // (measured: with 60+ named rows the venue-scoped check no longer ties the sentence to one venue, so the table must be filled without naming 60 venues in the rows).
  const sites = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Nơi khác ${i + 1}`, website: `https://q${i + 1}.example/` }))
  const rowsFor = (_n: number): Row[] => [{ name: 'Cà phê Mây' }, { name: 'Trà Gió' }]
  const gio = { name: 'Trà Gió', website: 'https://tragio.example/' }
  // Measured: a figure on a page whose host is tied to NO venue does not license a sentence about a named venue (the venue-scoped check cuts it), and a figure on a
  // page tied to venue V licenses V only. So whether Trà Gió's site was LEARNED is visible: learned → its page price said of Trà Gió stays; not learned → cut.
  const GIO = 'Mình chọn **Trà Gió**. Bạc xỉu **52.000đ**.'
  it('baseline (measured): Trà Gió\'s site not learned at all (no placeSites) - the figure said of Trà Gió is cut', async () => {
    const out = await run(rowsFor(0), [], 'https://tragio.example/', GIO)
    expect(out).toContain('Trà Gió')
    expect(out).not.toContain('52.000đ')
  })
  it('live control: 59 hosts learned, Trà Gió is the 60th - learned, its page price stays', async () => {
    expect(await run(rowsFor(59), [...sites(59), gio], 'https://tragio.example/', GIO)).toContain('52.000đ')
  })
  it('60 hosts already learned: Trà Gió (the 61st) is NOT learned - exactly the baseline (cut)', async () => {
    const out = await run(rowsFor(60), [...sites(60), gio], 'https://tragio.example/', GIO)
    expect(out).toContain('Trà Gió')
    expect(out).not.toContain('52.000đ')
  })
})
