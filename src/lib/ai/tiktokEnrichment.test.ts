import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

// The consultative TikTok contract, enforced at the stream boundary.
//
// The guarantee is not "the model behaves" — it is that the ONLY TikTok URL able to reach a user
// is one the backend validated. Every tiktok.com link the model writes is removed; the validated
// URL is injected positionally afterwards. So a model that invents `/@quan/video/<place name>`
// publishes nothing, whatever the prompt says.

const VALID = 'https://www.tiktok.com/@banhmihh/video/7312345678901234567'
const FAKE = 'https://www.tiktok.com/@banhmi-huynh-hoa/video/1'
const GCS = 'https://storage.googleapis.com/x/a.jpg'

const call = (q: string) =>
  `9:${JSON.stringify({ toolCallId: 'c1', toolName: 'search_places', args: { query: q } })}`
const result = (place: Record<string, unknown>) =>
  `a:${JSON.stringify({ toolCallId: 'c1', result: { results: [place] } })}`
const say = (t: string) => `0:${JSON.stringify(t)}`

async function through(lines: string[]): Promise<string> {
  const filtered = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'))
  const raw = await new Response(filtered.body).text()
  return raw.split('\n').filter(l => l.startsWith('0:'))
    .map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')
}

const PLACE = (over: Record<string, unknown> = {}) => ({
  name: 'Bánh Mì HH', address: '26 Lê Lợi', maps_link: 'https://maps.google.com/?cid=1', ...over,
})

describe('a validated TikTok review reaches the user', () => {
  it('is injected when the backend supplied it', async () => {
    const out = await through([
      call('banh mi'), result(PLACE({ tiktok_review_url: VALID })),
      say('**Bánh Mì HH** — ngon lắm.'), 'd:{}',
    ])
    expect(out).toContain(VALID)
    expect(out).toContain('🎵')
  })

  it('is not duplicated when the model already linked the same URL', async () => {
    const out = await through([
      call('banh mi'), result(PLACE({ tiktok_review_url: VALID })),
      say(`**Bánh Mì HH** — ngon.\n🎵 [Review TikTok](${VALID})`), 'd:{}',
    ])
    expect((out.match(/7312345678901234567/g) ?? []).length).toBe(1)
  })
})

describe('an unvalidated TikTok URL can never reach the user', () => {
  it('strips a fabricated link the model wrote on its own line', async () => {
    const out = await through([
      call('banh mi'), result(PLACE()),
      say(`**Bánh Mì HH** — ngon.\n🎵 [Review TikTok](${FAKE})`), 'd:{}',
    ])
    expect(out).not.toContain('tiktok.com')
  })

  it('strips a fabricated link the model buried mid-sentence', async () => {
    // The line-wise pass alone would miss this one.
    const out = await through([
      call('banh mi'), result(PLACE()),
      say(`**Bánh Mì HH** — xem [review ở đây](${FAKE}) nhé.`), 'd:{}',
    ])
    expect(out).not.toContain('tiktok.com')
    expect(out).toContain('review ở đây')  // the sentence survives, only the link dies
  })

  it('strips a TikTok search URL presented as a review', async () => {
    const out = await through([
      call('banh mi'), result(PLACE()),
      say('**Bánh Mì HH** — [xem TikTok](https://www.tiktok.com/search?q=banh%20mi)'), 'd:{}',
    ])
    expect(out).not.toContain('tiktok.com')
  })

  it('strips a model link even when ANOTHER url was validated for that place', async () => {
    const out = await through([
      call('banh mi'), result(PLACE({ tiktok_review_url: VALID })),
      say(`**Bánh Mì HH** — [fake](${FAKE})`), 'd:{}',
    ])
    expect(out).not.toContain('/video/1)')
    expect(out).toContain(VALID)
  })

  it('emits no TikTok link at all when the provider found none', async () => {
    const out = await through([
      call('banh mi'), result(PLACE()), say('**Bánh Mì HH** — ngon.'), 'd:{}',
    ])
    expect(out).not.toContain('tiktok.com')
  })
})

describe('TikTok does not disturb the rest of the link contract', () => {
  it('leaves Maps CTA, photos and order links intact', async () => {
    const CTA = '[CTA_BUTTONS]{"buttons":[{"label":"📍 Maps","type":"maps","url":"https://maps.google.com/?cid=1"}]}[/CTA_BUTTONS]'
    const out = await through([
      call('banh mi'),
      result(PLACE({
        tiktok_review_url: VALID, photo_urls: [GCS],
        order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/x' }],
      })),
      say(`**Bánh Mì HH** — ngon.\n${CTA}`), 'd:{}',
    ])
    expect(out).toContain('[CTA_BUTTONS]')
    expect(out).toContain('"type":"maps"')
    expect(out).toContain('shopeefood.vn')
    expect(out).toContain(GCS)
    expect(out).toContain(VALID)
  })

  it('leaves a YouTube link the model wrote completely alone', async () => {
    const yt = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    const out = await through([
      call('banh mi'), result(PLACE()), say(`**Bánh Mì HH** — [YouTube](${yt})`), 'd:{}',
    ])
    expect(out).toContain(yt)
  })

  it('leaves no raw structured marker behind', async () => {
    const out = await through([
      call('banh mi'), result(PLACE({ tiktok_review_url: VALID })), say('**Bánh Mì HH** — ngon.'), 'd:{}',
    ])
    expect(out).not.toContain('tiktok_review_url')
    expect(out).not.toContain('has_tiktok_review')
  })
})
