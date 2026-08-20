// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter, selectPlacesNeedingEnrichment, injectPlaceEnrichment } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// B7-A: photos used to be resolved inside the tool for up to 8 places, while the
// output path uses at most 3 (prose) — measured, 5 of 8 resolutions were thrown
// away, ~15 billable upstream calls per search. Resolution now happens at
// injection time, when the reply text is already known, for exactly the places
// that will be enriched.
//
// The plan path is the exception: injectPlanPhotos matches photos to plan ITEMS
// and can legitimately need 6-10, so selection must follow the output path
// rather than a flat cap.

const IMG = 'https://img.test'
const line0 = (s: string) => '0:' + JSON.stringify(s)
const place = (name: string) => ({ name })

describe('selectPlacesNeedingEnrichment', () => {
  it('picks only the places the reply actually mentions', () => {
    const places = ['Phở Gà', 'Bún Chả', 'Cơm Tấm', 'Bánh Mì', 'Xôi Xéo'].map(place)
    const text = 'Mình gợi ý **Bún Chả** và **Xôi Xéo** nhé.'
    const chosen = selectPlacesNeedingEnrichment(places, text)
    expect(chosen.map(p => p.name).sort()).toEqual(['Bún Chả', 'Xôi Xéo'])
  })

  it('reaches places OUTSIDE the first three — position must not decide', () => {
    // The old eager path resolved the top 8 and the injector capped at 3, so a
    // reply naming #5 and #7 could end up with no photos at all.
    const places = ['A Quán', 'B Quán', 'C Quán', 'D Quán', 'E Quán', 'F Quán', 'G Quán'].map(place)
    const chosen = selectPlacesNeedingEnrichment(places, 'Thử **E Quán** hoặc **G Quán** xem sao.')
    expect(chosen.map(p => p.name).sort()).toEqual(['E Quán', 'G Quán'])
  })

  it('never selects more than the injector will use for prose', () => {
    const places = ['A Quán', 'B Quán', 'C Quán', 'D Quán', 'E Quán'].map(place)
    const text = '**A Quán**, **B Quán**, **C Quán**, **D Quán**, **E Quán** đều ngon.'
    expect(selectPlacesNeedingEnrichment(places, text).length).toBeLessThanOrEqual(3)
  })

  it('falls back to the leading places when the reply names none of them', () => {
    const places = ['A Quán', 'B Quán', 'C Quán', 'D Quán'].map(place)
    const chosen = selectPlacesNeedingEnrichment(places, 'Mình chưa tìm thấy chỗ nào phù hợp.')
    expect(chosen.length).toBeGreaterThan(0)
    expect(chosen.length).toBeLessThanOrEqual(3)
  })

  it('selects EVERY matching plan item — the 3 cap must not apply to plans', () => {
    const names = ['San San Hotel', 'Hải Sản Mộc', 'Cafe Cộng', 'Bà Nà Hills', 'Chợ Hàn', 'Mì Quảng Bà Mua', 'Cầu Rồng', 'Spa Sen']
    const places = names.map(place)
    const plan = JSON.stringify({
      type: 'trip', title: 'Đà Nẵng',
      days: [{ label: 'Ngày 1', items: names.map((n, i) => ({ time: `0${i}:00`, name: n, category: 'food' })) }],
    })
    const chosen = selectPlacesNeedingEnrichment(places, `[TAPPY_PLAN]\n${plan}\n[/TAPPY_PLAN]`)
    expect(chosen.map(p => p.name).sort()).toEqual([...names].sort())
    expect(chosen.length).toBe(8)
  })

  it('a plan only selects the places it actually references', () => {
    const places = ['San San Hotel', 'Hải Sản Mộc', 'Không Dùng Quán'].map(place)
    const plan = JSON.stringify({
      type: 'trip', title: 'Đà Nẵng',
      days: [{ label: 'Ngày 1', items: [{ time: '14:00', name: 'San San Hotel' }, { time: '18:00', name: 'Hải Sản Mộc' }] }],
    })
    const chosen = selectPlacesNeedingEnrichment(places, `[TAPPY_PLAN]\n${plan}\n[/TAPPY_PLAN]`)
    expect(chosen.map(p => p.name).sort()).toEqual(['Hải Sản Mộc', 'San San Hotel'])
  })

  it('returns nothing when there is nothing to enrich', () => {
    expect(selectPlacesNeedingEnrichment([], 'bất kỳ')).toEqual([])
    expect(selectPlacesNeedingEnrichment([{ name: '' }], 'bất kỳ')).toEqual([])
  })
})

describe('injectPlaceEnrichment — links no longer depend on a photo', () => {
  // Pre-existing behaviour flagged in B4: `usable` required a photo, so when
  // photo lookup failed the order/platform links vanished with it. Nothing about
  // an order link needs a photo to exist.
  it('injects order links for a place with NO photo', () => {
    const places = [{ name: 'Phở Gà', order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/x' }] }]
    const out = injectPlaceEnrichment(places, '**Phở Gà**\nngon lắm.')
    expect(out).toContain('shopeefood.vn/x')
  })

  it('injects platform links for a place with NO photo', () => {
    const places = [{ name: 'Sen Spa', platform_links: [{ name: 'Official Website', url: 'https://senspa.vn' }] }]
    const out = injectPlaceEnrichment(places, '**Sen Spa**\nthư giãn.')
    expect(out).toContain('senspa.vn')
  })

  it('still injects photo + links together when both exist', () => {
    const places = [{
      name: 'Phở Gà',
      photo_urls: [`${IMG}/ga.jpg`],
      order_links: [{ name: 'GrabFood', url: 'https://food.grab.com/y' }],
    }]
    const out = injectPlaceEnrichment(places, '**Phở Gà**\nngon.')
    expect(out).toContain('ga.jpg')
    expect(out).toContain('food.grab.com/y')
  })

  it('leaves text untouched when a place has neither photo nor links', () => {
    const text = '**Phở Gà**\nngon lắm.'
    expect(injectPlaceEnrichment([{ name: 'Phở Gà' }], text)).toBe(text)
  })
})

describe('stream filter — deferred photo resolution', () => {
  async function runFilter(
    lines: string[],
    collector?: ReturnType<typeof createEnrichmentCollector>,
    resolvePhotos?: (places: { name?: string }[]) => Promise<Map<string, string[]>>,
  ): Promise<string> {
    const res = applyPlaceEnrichmentStreamFilter(
      new Response(lines.join('\n') + '\n'), 'vi', collector, resolvePhotos,
    )
    return await new Response(res.body).text()
  }

  const slimFrame = (names: string[]) =>
    `a:{"toolCallId":"t1","result":{"results":${JSON.stringify(names.map(n => ({ name: n })))}}}`

  it('resolves photos ONLY for mentioned places, and injects them', async () => {
    const asked: string[][] = []
    const resolve = async (places: { name?: string }[]) => {
      asked.push(places.map(p => p.name!).sort())
      return new Map(places.map(p => [p.name!, [`${IMG}/${p.name}.jpg`]]))
    }
    const collector = createEnrichmentCollector()
    collector.add(['Phở Gà', 'Bún Chả', 'Cơm Tấm', 'Bánh Mì'].map(n => ({ name: n })))

    const out = await runFilter([
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      slimFrame(['Phở Gà', 'Bún Chả', 'Cơm Tấm', 'Bánh Mì']),
      line0('Thử **Bún Chả** nhé.'),
      'd:{"finishReason":"stop"}',
    ], collector, resolve)

    expect(asked).toEqual([['Bún Chả']])          // resolved 1, not 4
    // The space is percent-encoded since P3-S4. A literal space inside `(...)`
    // is where CommonMark starts a link TITLE, so the un-encoded form was a
    // broken image — the encoded one is the first that actually loads.
    expect(out).toContain('Bún%20Chả.jpg')
    expect(out).not.toContain('Phở%20Gà.jpg')
  })

  it('resolves every plan item, not just three', async () => {
    const names = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7']
    let askedCount = 0
    const resolve = async (places: { name?: string }[]) => {
      askedCount = places.length
      return new Map(places.map(p => [p.name!, [`${IMG}/${p.name}.jpg`]]))
    }
    const collector = createEnrichmentCollector()
    collector.add(names.map(n => ({ name: n })))
    const plan = JSON.stringify({
      type: 'trip', title: 'T', days: [{ label: 'Ngày 1', items: names.map(n => ({ time: '10:00', name: n })) }],
    })
    const out = await runFilter([
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      slimFrame(names),
      line0(`[TAPPY_PLAN]\n${plan}\n[/TAPPY_PLAN]`),
      'd:{"finishReason":"stop"}',
    ], collector, resolve)

    expect(askedCount).toBe(7)
    const full = out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2))).sort((a, b) => b.length - a.length)[0]
    const parsed = JSON.parse(full.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/)![1].trim())
    for (const item of parsed.days[0].items) expect(item.photo_url, item.name).toContain(`${item.name}.jpg`)
  })

  it('order links survive when photo resolution returns nothing', async () => {
    const collector = createEnrichmentCollector()
    collector.add([{ name: 'Phở Gà', order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/x' }] }])
    const out = await runFilter([
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      slimFrame(['Phở Gà']),
      line0('**Phở Gà**\nngon.'),
      'd:{"finishReason":"stop"}',
    ], collector, async () => new Map())
    expect(out).toContain('shopeefood.vn/x')
  })

  it('a resolver that throws degrades to no photos, never to a broken stream', async () => {
    const collector = createEnrichmentCollector()
    collector.add([{ name: 'Phở Gà', order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/x' }] }])
    const out = await runFilter([
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      slimFrame(['Phở Gà']),
      line0('**Phở Gà**\nngon.'),
      'd:{"finishReason":"stop"}',
    ], collector, async () => { throw new Error('serper down') })
    expect(out).toContain('Phở Gà')
    expect(out).toContain('d:{"finishReason":"stop"}')
    expect(out).toContain('shopeefood.vn/x')   // links unaffected by a photo failure
  })

  it('never calls the resolver when no place tool ran', async () => {
    let called = false
    const out = await runFilter(
      [line0('Chào bạn!'), 'd:{"finishReason":"stop"}'],
      createEnrichmentCollector(),
      async () => { called = true; return new Map() },
    )
    expect(called).toBe(false)
    expect(out).toContain('Chào bạn!')
  })

  it('two concurrent requests never see each other\'s photos', async () => {
    const mk = (tag: string) => {
      const c = createEnrichmentCollector()
      c.add([{ name: 'Phở Gà' }])
      return { c, resolve: async () => new Map([['Phở Gà', [`${IMG}/${tag}.jpg`]]]) }
    }
    const a = mk('alpha'), b = mk('beta')
    const lines = [
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      slimFrame(['Phở Gà']),
      line0('**Phở Gà**\nngon.'),
      'd:{"finishReason":"stop"}',
    ]
    const [outA, outB] = await Promise.all([runFilter(lines, a.c, a.resolve), runFilter(lines, b.c, b.resolve)])
    expect(outA).toContain('alpha.jpg')
    expect(outA).not.toContain('beta.jpg')
    expect(outB).toContain('beta.jpg')
    expect(outB).not.toContain('alpha.jpg')
  })

  it('with no resolver, behaves exactly as before (photos inline in the stream)', async () => {
    const out = await runFilter([
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      `a:{"toolCallId":"t1","result":{"results":[{"name":"Phở Gà","photo_url":"${IMG}/legacy.jpg"}]}}`,
      line0('**Phở Gà**\nngon.'),
      'd:{"finishReason":"stop"}',
    ])
    expect(out).toContain('legacy.jpg')
  })
})
