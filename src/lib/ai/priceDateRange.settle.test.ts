// @vitest-environment node
// Round 42 round 3, STEP 1 (reproduction only — no product code changed): PRICE-DATE-01 and RANGE-27-33, through the settle step (applyPlaceEnrichmentStreamFilter),
// the stage that decides the text the user reads. Source rows are FIXED, written here (live 2026-10-12 shapes); the model text is scripted; every fetch fails.
// CONSULTATIVE_IN_AGENT is the collector's `consultative` field: each case runs with the flag OFF and ON.
// `it.fails` = the PROPOSED desired behaviour (to be confirmed by Huy at stop point 1), red today. Plain `it` = today's behaviour recorded, or a control.
import { describe, it, expect, beforeAll } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

beforeAll(() => { globalThis.fetch = (async (input: unknown) => { throw new Error('network disabled: ' + String(input).slice(0, 60)) }) as typeof fetch })

const record = (name: string, o: Record<string, unknown>) => console.log('CASE ' + JSON.stringify({ name, ...o }))
const textOf = (body: string) => body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

async function settle(user: string, frames: string[], flag: boolean, opt: { travel?: boolean; prep?: (c: any) => void } = {}) {
  const c: any = createEnrichmentCollector(user)
  c.agentMode = true
  c.semanticRanking = true
  if (flag) c.consultative = true
  opt.prep?.(c)
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', c, (async () => new Map()) as never, undefined, undefined, !!opt.travel, user, false, (async () => ({ perPlace: new Map(), batch: null })) as never)
  return textOf(await new Response(res.body).text())
}
const f9 = (id: string, name: string, args: unknown) => '9:' + JSON.stringify({ toolCallId: id, toolName: name, args })
const fa = (id: string, result: unknown) => 'a:' + JSON.stringify({ toolCallId: id, result })
const ft = (t: string) => '0:' + JSON.stringify(t)
const FIN = 'd:{"finishReason":"stop"}'

// ── PRICE-DATE-01 ── Round 40 case 12 (86ac12a, live 12/10): the user named 24/10/2026; the Vexere snippet says "chỉ từ 410000 đ" with NO date.
const QB = 'Đi xe khách từ TP.HCM đến Quy Nhơn ngày 24/10/2026 thì giá bao nhiêu?'
const QB_NODATE = 'Đi xe khách từ TP.HCM đến Quy Nhơn giá bao nhiêu?'
const BUS = [
  { title: 'FUTA Bus Lines', link: 'https://futabus.vn/', snippet: 'Đặt vé xe Phương Trang đi liên tỉnh trực tuyến. Số điện thoại tổng đài đặt vé xe phương trang: 1900 6067.' },
  { title: 'công ty phương trang khai trương tuyến bến xe an sương', link: 'https://futabus.vn/tin-tuc/cong-ty-phuong-trang-khai-truong-tuyen-ben-xe-an-suong-ben-xe-quy-nhon', snippet: 'Với mức giá ưu đãi chỉ 350.000 VNĐ, Quý Khách sẽ được trải nghiệm hành trình 625km trên dòng xe cao cấp KimLong 99 VIP.' },
  { title: 'Vé xe Phương Trang từ Sài Gòn đi Quy Nhơn - Bình Định', link: 'https://vexere.com/vi-VN/ve-xe-khach-phuong-trang-tu-sai-gon-di-quy-nhon-binh-dinh-129t2681-11071.html', snippet: 'Với giá vé chỉ từ 410000 đ và các tiện ích trên xe như: Đang cập nhật. Mỗi ngày nhà xe Phương Trang có 29 chuyến xe đi Sài Gòn đi Quy Nhơn - Bình Định.' },
]
const BUS_DATED = [{ title: 'Vé xe TP.HCM - Quy Nhơn ngày 24/10/2026', link: 'https://dated.example/hcm-quy-nhon-24-10-2026', snippet: 'Chuyến ngày 24/10/2026 TP.HCM đi Quy Nhơn: giá vé 410.000đ, khởi hành 19:00.' }]
const busFrames = (rows: unknown[], text: string, date: string | null = '2026-10-24') => [
  f9('t1', 'get_transport_options', { origin: 'TP.HCM', destination: 'Quy Nhơn', mode: 'intercity', ...(date ? { date } : {}) }),
  fa('t1', { type: 'intercity', origin: 'TP.HCM', destination: 'Quy Nhơn', bus_search_results: rows, train_search_results: [], note: 'Gia/chuyen xe-tau la tham khao tu ket qua tim kiem hien tai, co the khac theo gio chay, loai ghe va da thay doi.' }),
  ft(text), FIN,
]
// Round 40 case 12, the model's text (report-batch1.md §Ca 12) and the Round 34 live variant (harness LIVE3_TEXT).
const CASE12 = 'Vé xe khách TP.HCM – Quy Nhơn ngày **24/10/2026** hiện thấy giá **từ 410.000đ/chiều** trên Vexere; giá thực tế tùy nhà xe và loại ghế. Mức 350.000đ được nêu trong tin khai trương của Phương Trang, nhưng không xác nhận là giá áp dụng cho ngày bạn đi.'
const R34 = 'Vé xe khách TP.HCM–Quy Nhơn ngày **24/10/2026** đang được niêm yết **từ 410.000đ/chiều** trên Vexere.'
// the sentence of the reply that holds the 410.000 figure
const sentenceWith = (out: string, fig: string) => out.split(/(?<=[.!?])\s+|\n+/).find(s => s.includes(fig)) ?? ''
const DATE_IN = /24\/10(?:\/2026)?/
const NOT_FOR_DATE = /chưa theo ngày|không theo ngày|chưa (?:xác nhận|xác minh)[^.]{0,30}ngày|không (?:phải|xác nhận)[^.]{0,30}(?:giá )?(?:cho |của )?ngày|không ghi ngày/i

describe('PRICE-DATE-01 — an undated "từ" price told as the price of the travel date', () => {
  for (const flag of [false, true]) {
    const env = flag ? 'ON' : 'OFF'
    // Pre-fix (53b0e80, all flags): the date and the undated "từ 410.000đ" reached the user in ONE sentence with no qualifier (price-step1.md §2).
    for (const [name, text] of [['case12', CASE12], ['r34', R34]] as const) {
      it(`flag ${env} (${name}): the undated "từ" price is labelled (giá "từ" ở vexere.com, chưa theo ngày) and followed by the not-verified-for-24/10/2026 sentence; no word removed`, async () => {
        const out = await settle(QB, busFrames(BUS, text), flag, { travel: true })
        const s = sentenceWith(out, '410.000')
        record('pd_' + name, { flag, out, sentence: s })
        expect(s).toContain('410.000')
        expect(NOT_FOR_DATE.test(s)).toBe(true)
        expect(out).toContain('**từ 410.000đ/chiều** (giá "từ" ở vexere.com, chưa theo ngày) trên Vexere')
        expect(out).toContain(' Mình chưa xác minh được mức giá này có áp dụng cho ngày 24/10/2026 hay không.')
        for (const w of text.replace(/\*\*/g, '').split(/\s+/).filter(x => /\p{L}/u.test(x) && !/^(?:giá|tùy|nhà|xe|và|loại|ghế\.)$/u.test(x))) if (flag === false) expect(out.replace(/\*\*/g, '')).toContain(w)
      })
    }
    it(`flag ${env}: English — the same step writes the approved English sentence`, async () => {
      const { labelUndatedFareDates } = await import('./consultative/coachFares')
      const rows = BUS.map(r => ({ host: new URL(r.link).hostname.replace(/^www\./, ''), url: r.link, text: `${r.title} ${r.snippet}` }))
      const r = labelUndatedFareDates('Coach TP.HCM–Quy Nhon on 24/10/2026 is listed from 410,000 VND on Vexere.', rows, 'en')
      record('pd_en', { flag, out: r.text })
      expect(r.text).toContain("I haven't verified that this price applies to 24/10/2026.")
      expect(r.labelled).toBe(1)
    })
    it(`CONTROL flag ${env}: a reply that already says the "từ" price is not for the date is left as written`, async () => {
      const text = 'Vexere đang ghi giá từ 410.000đ/chiều, giá này không theo ngày; giá đúng ngày 24/10/2026 chưa xác minh được.'
      const out = await settle(QB, busFrames(BUS, text), flag, { travel: true })
      record('pd_ctl_qualified', { flag, out })
      expect(out.startsWith(text)).toBe(true)
    })
    it(`CONTROL flag ${env}: a source that STATES the date and the fare — the dated sentence is left as written`, async () => {
      const text = 'Chuyến ngày 24/10/2026 TP.HCM đi Quy Nhơn có giá vé 410.000đ, khởi hành 19:00.'
      const out = await settle(QB, busFrames(BUS_DATED, text), flag, { travel: true })
      record('pd_ctl_dated_source', { flag, out })
      expect(out.startsWith(text)).toBe(true)
    })
    it(`CONTROL flag ${env}: no date in the request — "từ 410.000đ" is left as written`, async () => {
      const text = 'Vé xe khách TP.HCM–Quy Nhơn có giá từ 410.000đ/chiều trên Vexere.'
      const out = await settle(QB_NODATE, busFrames(BUS, text, null), flag, { travel: true })
      record('pd_ctl_no_date', { flag, out })
      expect(out.startsWith(text)).toBe(true)
    })
    it(`CONTROL flag ${env}: a dated fare NO source states (520.000đ) — record today's handling (must not get better treatment after a fix)`, async () => {
      const text = 'Vé xe khách TP.HCM–Quy Nhơn ngày 24/10/2026 có giá 520.000đ/chiều.'
      const out = await settle(QB, busFrames(BUS, text), flag, { travel: true })
      record('pd_ctl_unsourced', { flag, out })
      expect(out).not.toContain('520.000') // cut, both flags (must stay cut)
      // Pre-fix (53b0e80): the cut left "…có giá /chiều." behind (PRICE-CUT-RESIDUE-01). Commit 3a: the sentence goes whole, the travel notice stays.
      expect(out).not.toContain('/chiều')
      expect(out).toBe(flag ? 'Giá vé cụ thể mình chưa xác nhận được từ nguồn đã tìm.' : 'Giá vé cụ thể mình chưa xác nhận được từ nguồn đã tìm — bạn xem trên trang đặt vé.')
    })
  }
})

// ── RANGE-27-33 ── live 12/10 (Round 33 predecessor): rows state 26.990.000đ and 32,500,000 đ; the model wrote its own range "27–33 triệu" (33 triệu: no source).
const QM = 'tui mua macbook pro M1 32GB 512GB giá bao nhiêu'
const PAGE = 'https://shop-a.example/hang-cu/macbook-pro.html'
const MAC = [
  { title: 'Macbook Pro cũ giá rẻ', link: PAGE, snippet: 'Mua Macbook Pro cũ giá rẻ - giảm HSSV 10%, trả góp 0%.', host: 'shop-a.example' },
  { title: 'Macbook Pro 14inch M1 Pro 32GB 512GB', link: 'https://shop-b.example/macbook-pro-14inch-m1-pro-32gb-512gb', snippet: 'Macbook Pro 14inch M1 Pro 32GB 512GB. 26.990.000đ', host: 'shop-b.example' },
  { title: 'MacBook Pro M1 cũ', link: 'https://shop-c.example/macbook-pro-m1-cu/', snippet: 'MacBook Pro 14" 2021 - M1 Pro 10core / RAM 32GB / SSD 512GB - Likenew 99%. 32,500,000 đ.', host: 'shop-c.example' },
  { title: 'Bảng giá MacBook Pro', link: 'https://shop-d.example/bang-gia', snippet: 'MacBook Pro 14" M1 Pro 10-core/16-core GPU/16GB/512GB: Khoảng 27.000.000 - 29.000.000 VNĐ', host: 'shop-d.example' },
]
const macFrames = (text: string) => [f9('t1', 'web_search', { queries: ['macbook pro m1 32gb 512gb giá'] }), fa('t1', { results: MAC }), ft(text), FIN]
const page = (c: any) => {
  c.citationSources = [{ id: 'S1', host: 'shop-a.example', url: PAGE }]
  c.guardEvidence = { sources: [{ id: 'S1', host: 'shop-a.example', sourceType: 'merchant', passages: ['Trang này không nêu giá.'] }], conflicts: [], carried: [], constraintsSig: null, userText: QM }
}
// the live sentence (consultativeMoneyForms.test.ts) with this file's hosts
const LIVE_RANGE = 'Khoảng 27–33 triệu đồng: shop-b niêm yết 26,99 triệu, còn shop-c ghi máy likenew 32,5 triệu.[S1] Giá còn tùy tình trạng máy.'

describe('RANGE-27-33 — a range the model made, one end stated by no source', () => {
  for (const flag of [false, true]) {
    const env = flag ? 'ON' : 'OFF'
    it(`COMMIT 2 flag ${env}: the live sentence — the head clause carrying the range goes, both sourced figures stay (allowlist 2E-8, G1 / G2)`, async () => {
      const out = await settle(QM, macFrames(LIVE_RANGE), flag, { prep: page })
      record('rg_live', { flag, out, has_33: /33 triệu|27–33/.test(out), has_2699: out.includes('26,99'), has_325: out.includes('32,5') })
      expect(out.startsWith('Shop-b niêm yết 26,99 triệu, còn shop-c ghi máy likenew 32,5 triệu. Giá còn tùy tình trạng máy.')).toBe(true)
      expect(out).not.toMatch(/27–33|33 triệu/)
      expect(out).not.toMatch(/Mình chưa xác minh được (?:số này|giá hiện tại)/)
    })
    it(`PROPOSED flag ${env}: the unsourced range is still gone AND the two sourced figures (26,99 triệu at shop-b, 32,5 triệu at shop-c) still reach the user`, async () => {
      const out = await settle(QM, macFrames(LIVE_RANGE), flag, { prep: page })
      expect(out).not.toMatch(/27–33|33 triệu/)
      expect(out).toContain('26,99 triệu')
      expect(out).toContain('32,5 triệu')
    })
    it(`CONTROL flag ${env}: a range whose ends are far from every stated amount ("27–36 triệu": 36 is 10,8 % above 32,5) — record`, async () => {
      const out = await settle(QM, macFrames(LIVE_RANGE.replace('27–33', '27–36')), flag, { prep: page })
      record('rg_ctl_far_end', { flag, out })
      expect(out).not.toMatch(/27–36|36 triệu/)
    })
    it(`CONTROL flag ${env}: a range a source states (27.000.000 - 29.000.000 VNĐ) is left as written`, async () => {
      const text = 'Bản 16GB/512GB có bảng giá khoảng 27–29 triệu ở shop-d.[S1]'
      const out = await settle(QM, macFrames(text), flag, { prep: page })
      record('rg_ctl_sourced_range', { flag, out })
      expect(out).toContain('27–29 triệu')
    })
    it(`CONTROL flag ${env}: a range NO source states (40–45 triệu) is still cut`, async () => {
      const out = await settle(QM, macFrames('Giá khoảng 40–45 triệu.[S1]'), flag, { prep: page })
      record('rg_ctl_unsourced_range', { flag, out })
      expect(out).not.toMatch(/40–45|45 triệu/)
    })
    it(`CONTROL flag ${env}: the sourced figures written in full, no range — kept`, async () => {
      const text = 'Giá niêm yết mình tra được là 26.990.000đ ở shop-b; shop-c niêm yết máy likenew 32.500.000đ.[S1] Giá có thể thay đổi.'
      const out = await settle(QM, macFrames(text), flag, { prep: page })
      record('rg_ctl_sourced_figures', { flag, out })
      expect(out).toContain('26.990.000đ')
      expect(out).toContain('32.500.000đ')
    })
  }
})

// ── Step 2B probes (today's output recorded; they become rows/controls of the updated allowlist) ──
describe('Step 2B probes — today', () => {
  for (const flag of [false, true]) {
    const env = flag ? 'ON' : 'OFF'
    it(`flag ${env}: an unsourced range sentence FOLLOWED by another sentence (residue: leading space?)`, async () => {
      const out = await settle(QM, macFrames('Giá khoảng 40–45 triệu.[S1] Giá còn tùy tình trạng máy.'), flag, { prep: page })
      record('probe_residue_lead', { flag, out: JSON.stringify(out) })
    })
    it(`flag ${env}: a range built from TWO configurations (27.000.000 = 16GB row, 32,500,000 = 32GB row), both ends stated`, async () => {
      const out = await settle(QM, macFrames('Khoảng 27–32,5 triệu: shop-b niêm yết 26,99 triệu.[S1] Giá còn tùy tình trạng máy.'), flag, { prep: page })
      record('probe_cross_config', { flag, out: JSON.stringify(out) })
    })
    it(`flag ${env}: the same cross-configuration range alone`, async () => {
      const out = await settle(QM, macFrames('Giá khoảng 27–32,5 triệu.[S1]'), flag, { prep: page })
      record('probe_cross_config_alone', { flag, out: JSON.stringify(out) })
    })
    it(`flag ${env}: an in-tolerance range alone ("khoảng 27–33 triệu", no other figure)`, async () => {
      const out = await settle(QM, macFrames('Giá khoảng 27–33 triệu.[S1]'), flag, { prep: page })
      record('probe_tolerance_alone', { flag, out: JSON.stringify(out) })
    })
    it(`flag ${env}: coach range across two pages, same kind ("từ" 165.000 redbus, "từ" 410.000 vexere)`, async () => {
      const rows = [...BUS, { title: 'Xe Phương Trang | Đặt Vé Online, Giá Vé 2026', link: 'https://www.redbus.vn/ve-xe-khach/nha-xe/phuong-trang', snippet: 'Đặt vé xe Phương Trang (FUTA Bus Lines) online tại redBus. Giá vé từ 165.000đ, 92 tuyến, 350+ điểm bán.' }]
      const out = await settle(QB, busFrames(rows, 'Vé xe khách TP.HCM–Quy Nhơn có giá từ 165.000–410.000đ/chiều.'), flag, { travel: true })
      record('probe_coach_same_kind', { flag, out: JSON.stringify(out) })
    })
    it(`flag ${env}: coach range across two pages, different kinds (the Round 32 live sentence)`, async () => {
      const out = await settle(QB, busFrames(BUS, 'Giá tham khảo mình tìm được cho xe khách TP.HCM–Quy Nhơn là **từ 350.000–410.000đ/chiều**, tùy nhà xe và loại xe. Giá đúng ngày **24/10/2026** chưa xác minh được; bạn có thể kiểm tra chuyến và giá theo ngày trên Vexere.'), flag, { travel: true })
      record('probe_coach_mixed', { flag, out: JSON.stringify(out) })
    })
    it(`flag ${env}: a coach fare stated with its date by one row, cited with another undated row's same figure`, async () => {
      const out = await settle(QB, busFrames([...BUS, ...BUS_DATED], 'Ngày 24/10/2026 vé xe khách TP.HCM–Quy Nhơn có giá 410.000đ/chiều.'), flag, { travel: true })
      record('probe_dated_and_undated', { flag, out: JSON.stringify(out) })
    })
  }
})

// ── PRICE-CUT-RESIDUE-01 — which step leaves "…có giá /chiều." behind (direct calls) ──
describe('PRICE-CUT-RESIDUE-01 — the step that cuts the unsourced fare, called directly', () => {
  const S = 'Vé xe khách TP.HCM–Quy Nhơn ngày 24/10/2026 có giá 520.000đ/chiều.'
  it('travelGuard (guardTravelClaimsInText) with the coach rows\' fares', async () => {
    const { guardTravelClaimsInText } = await import('./travelGuard')
    const r = guardTravelClaimsInText(S, [350000, 410000], QB, { lang: 'vi' })
    const { extractMoneyClaims } = await import('./moneyGuard')
    record('residue_travel_guard', { out: r.text, redacted: r.redacted, claims: extractMoneyClaims(S).map(c => ({ raw: S.slice(c.start, c.end), start: c.start, end: c.end, kind: c.kind })) })
    // Pre-fix: "…có giá /chiều.\n\n<notice>". Commit 3a (travelGuard opts in to noAmountOnlyFallback): the notice alone.
    expect(r.text).toBe('Giá vé cụ thể mình chưa xác nhận được từ nguồn đã tìm — bạn xem trên trang đặt vé.')
    expect(r.redacted).toBe(1)
  })
  it('the shared redaction (moneyGuard.redactUnsupportedClaims) on a one-sentence reply: path (3) "only the amounts go" — DEFAULT unchanged (RS-3, not this commit)', async () => {
    const { redactUnsupportedClaims, extractMoneyClaims } = await import('./moneyGuard')
    const t = 'Phòng đôi có giá 1.500.000đ/đêm.'
    const bad = extractMoneyClaims(t).map(c => ({ ...c, verdict: 'UNVERIFIED' })) as never
    const out = redactUnsupportedClaims(t, bad)
    record('residue_redact_path3', { out })
    expect(out).toBe('Phòng đôi có giá /đêm.') // default (every caller but travelGuard): unchanged
    expect(redactUnsupportedClaims(t, bad, { noAmountOnlyFallback: true })).toBe('') // the opt-in: no amount-only step; the caller writes its notice
  })
})

// Step 2D probe: on the LEGACY place path, is the "có giá /tô." residue made by snippetPriceGuard v1? Same turn with v1 (env unset) and v2 (SNIPPET_PRICE_GUARD_V2=1).
describe('RS-3 probe — legacy place path, v1 vs v2', () => {
  const Qpho = 'quán phở ngon quận 3 giá bao nhiêu'
  const PHO = { source: 'Serper Maps', count: 1, location: 'Quận 3', results: [{ name: 'Phở Hòa', address: '260C Pasteur, Quận 3', place_id: 'p1', rating: 4.5, user_ratings_total: 1200, snippet: 'Phở bò tô 60.000đ.' }] }
  async function legacy(v2: boolean) {
    const prev = process.env.SNIPPET_PRICE_GUARD_V2
    if (v2) process.env.SNIPPET_PRICE_GUARD_V2 = '1'; else delete process.env.SNIPPET_PRICE_GUARD_V2
    try {
      const c: any = createEnrichmentCollector(Qpho)
      const frames = [f9('t1', 'search_places', { query: 'phở', location: 'Quận 3' }), fa('t1', PHO), ft('Phở Hòa có giá 85.000đ/tô.'), FIN]
      const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', c, (async () => new Map()) as never, undefined, undefined, false, Qpho, true, (async () => ({ perPlace: new Map(), batch: null })) as never)
      return textOf(await new Response(res.body).text())
    } finally { if (prev === undefined) delete process.env.SNIPPET_PRICE_GUARD_V2; else process.env.SNIPPET_PRICE_GUARD_V2 = prev }
  }
  it('records both', async () => {
    const v1 = await legacy(false), v2 = await legacy(true)
    record('rs3_legacy_v1_vs_v2', { v1, v2 })
    expect(typeof v1).toBe('string')
  })
})

// Which guard decides, called directly (no stream): flag OFF = noFabricationGate (a range passes when BOTH ends are within ±2 % of some stated amount, noFabricationGate.ts:236-238,
// `near` rel 0.02 at :142); flag ON = shieldSupported with cutUnsourcedMoney (guardEvidence.ts:269-270: an amount stated by no page and no retrieved text cuts its sentence).
describe('RANGE-27-33 — the deciding guard, called directly', () => {
  const corpus = [JSON.stringify({ results: MAC })]
  const sentence = 'Khoảng 27–33 triệu đồng: shop-b niêm yết 26,99 triệu, còn shop-c ghi máy likenew 32,5 triệu.'
  it('OFF (noFabricationGate): "27–33 triệu" is supported — 27 = shop-d\'s 27.000.000 (a 16GB config), 33 is 1,5 % from 32.500.000 (±2 %)', async () => {
    const { noFabricationGate } = await import('./noFabricationGate')
    const r = noFabricationGate(sentence, { corpus, userTexts: [QM], tools: ['web_search'] })
    record('rg_direct_off', { removed: r.removedSentences, text: r.text, claims: r.claims.map(c => ({ v: (c as any).value, s: (c as any).state })) })
    expect(r.removedSentences).toBe(0)
    // same sentence, upper end 4,6 % away from every stated amount → no longer supported
    const far = noFabricationGate(sentence.replace('27–33', '27–34'), { corpus, userTexts: [QM], tools: ['web_search'] })
    record('rg_direct_off_far', { removed: far.removedSentences, text: far.text })
    expect(far.text).not.toContain('27–34')
  })
  it('ON (shieldSupported, cutUnsourcedMoney): the sentence is judged as ONE unit — 33 triệu stated nowhere cuts it, sourced figures included', async () => {
    const { shieldSupported } = await import('./guardEvidence')
    const ev = { sources: [{ id: 'S1', host: 'shop-a.example', sourceType: 'merchant' as never, passages: ['Trang này không nêu giá.'] }], conflicts: [], carried: [], constraintsSig: null, userText: QM }
    const r = shieldSupported(sentence + '[S1]', ev as never, { cutUnsourcedMoney: true, canonMoney: true, retrievedTexts: MAC.map(m => `${m.title} ${m.snippet}`) })
    record('rg_direct_on', { report: r.report, text: r.text })
    expect(r.report.reasons?.unsourced_money_cut).toBe(1)
    expect(r.text).not.toContain('26,99')
  })
})

// ── S5 (commit 3a) ── a travel sentence with a VERIFIED fare and an unverified one: the verified fare always stays, the unverified part goes, no residue.
// Strings = price-allowlist-3a.md (gọi thẳng), approved by Huy 13/10. S5h3: the direct path here; the stream path is the last describe of this file (TG-VERIFIED-LOSS-PRE-01 — the place-claim guard took the sentence as a venue ordering claim; fixed in placeClaimGuard.isOrderingClaim).
describe('S5 — travelGuard cuts around a verified fare (commit 3a)', () => {
  const NL = 'Giá vé cụ thể mình chưa xác nhận được từ nguồn đã tìm — bạn xem trên trang đặt vé.'
  const Qf = 'vé máy bay TP.HCM Đà Nẵng ngày 24/10/2026 giá bao nhiêu'
  const cases: Array<[string, string, number[], string]> = [
    ['S5a', 'Vietjet 387.000 VND, nhưng cũng có chuyến chỉ 99.000 VND.', [387000], 'Vietjet 387.000 VND.'],
    ['S5b', 'Có chuyến chỉ 99.000 VND, còn Vietjet 387.000 VND.', [387000], 'Vietjet 387.000 VND.'],
    ['S5c', 'Vietjet 387.000 VND hoặc chuyến khác chỉ 99.000 VND.', [387000], 'Vietjet 387.000 VND.'],
    ['S5d', 'Vietjet 387.000 VND, Bamboo 412.000 VND, nhưng có chuyến chỉ 99.000 VND.', [387000, 412000], 'Vietjet 387.000 VND, Bamboo 412.000 VND.'],
    ['S5h1', 'Vietjet 387.000 VND một chiều hoặc chuyến khác chỉ 99.000 VND.', [387000], 'Vietjet 387.000 VND một chiều.'],
    ['S5h2a', 'Vietjet 387.000 VND một chiều hoặc khứ hồi, nhưng có chuyến chỉ 99.000 VND.', [387000], 'Vietjet 387.000 VND một chiều hoặc khứ hồi.'],
    ['S5h2b', 'Vietjet 387.000 VND một chiều hoặc khứ hồi nhưng có chuyến chỉ 99.000 VND.', [387000], 'Vietjet 387.000 VND một chiều hoặc khứ hồi.'],
    ['S5h3', 'Đặt qua app hoặc website, Vietjet 387.000 VND còn chuyến khác chỉ 99.000 VND.', [387000], 'Đặt qua app hoặc website, Vietjet 387.000 VND.'],
    ['S5m1', 'Vietjet 387.000 VND nhưng Bamboo 412.000 VND hoặc chuyến khác chỉ 99.000 VND.', [387000, 412000], 'Vietjet 387.000 VND nhưng Bamboo 412.000 VND.'],
    ['S5m2', 'Vietjet 387.000 VND hoặc chuyến chỉ 99.000 VND nhưng Bamboo 412.000 VND.', [387000, 412000], 'Vietjet 387.000 VND nhưng Bamboo 412.000 VND.'],
  ]
  for (const [id, text, fares, kept] of cases) {
    it(`${id}: keeps the verified fare, drops the unverified part`, async () => {
      const { guardTravelClaimsInText } = await import('./travelGuard')
      const r = guardTravelClaimsInText(text, fares, Qf, { lang: 'vi' })
      expect(r).toEqual({ text: `${kept}\n\n${NL}`, redacted: 1, enforced: true })
    })
  }
  it('S5e1 / S5e2: no verified fare → the sentence goes whole; only a verified fare → unchanged', async () => {
    const { guardTravelClaimsInText } = await import('./travelGuard')
    expect(guardTravelClaimsInText('Vé máy bay chặng này có giá 99.000 VND một chiều.', [387000], Qf, { lang: 'vi' })).toEqual({ text: NL, redacted: 1, enforced: true })
    expect(guardTravelClaimsInText('Vietjet 387.000 VND một chiều.', [387000], Qf, { lang: 'vi' })).toEqual({ text: 'Vietjet 387.000 VND một chiều.', redacted: 0, enforced: true })
  })
  it('other callers (option off) keep the former path: the clause cut takes the verified amount in S5h3', async () => {
    const { redactUnsupportedClaims, extractMoneyClaims } = await import('./moneyGuard')
    const t = 'Đặt qua app hoặc website, Vietjet 387.000 VND còn chuyến khác chỉ 99.000 VND.'
    const judged = extractMoneyClaims(t).map(c => ({ ...c, entity: null, verdict: t.slice(c.start, c.end).startsWith('387') ? 'VERIFIED' : 'UNVERIFIED' })) as never
    expect(redactUnsupportedClaims(t, judged)).toBe('Đặt qua app hoặc website.')
  })
})

// ── S5h3 through the stream filter ── the verified fare is fetched evidence: a get_flight_prices row whose snippet states 387.000 VND adds
// 387000 to travelFares (streamEnrichment.ts, the get_transport_options / get_flight_prices branch), so travelGuard judges it VERIFIED; 99.000 VND is in no row → UNVERIFIED.
describe('S5h3 — the stream filter, not the guard called directly', () => {
  it('S5h3 settle preserves a verified 387000 VND fare through the stream filter', async () => {
    const rows = [{ title: 'Vietjet Air - vé máy bay TP.HCM Đà Nẵng', link: 'https://example.test/vietjet-flights', snippet: 'Vé Vietjet một chiều 387.000 VND.' }]
    const frames = [
      f9('t1', 'get_flight_prices', { origin: 'TP.HCM', destination: 'Đà Nẵng', date: '2026-10-24' }),
      fa('t1', { type: 'flight', origin: 'TP.HCM', destination: 'Đà Nẵng', bus_search_results: rows, train_search_results: [] }),
      ft('Đặt qua app hoặc website, Vietjet 387.000 VND còn chuyến khác chỉ 99.000 VND.'), FIN,
    ]
    const out = await settle('Vé máy bay TP.HCM Đà Nẵng ngày 24/10/2026 giá bao nhiêu', frames, false, { travel: true })
    record('s5h3_stream', { out })
    expect(out).toContain('Đặt qua app hoặc website, Vietjet 387.000 VND.')
    expect(out).not.toContain('99.000')
  })
  it('S5h3 settle: the unverified fare and an unbacked venue ordering claim still go, unrelated prose stays', async () => {
    const rows = [{ title: 'Vietjet Air - vé máy bay TP.HCM Đà Nẵng', link: 'https://example.test/vietjet-flights', snippet: 'Vé Vietjet một chiều 387.000 VND.' }]
    const frames = [
      f9('t1', 'get_flight_prices', { origin: 'TP.HCM', destination: 'Đà Nẵng', date: '2026-10-24' }),
      fa('t1', { type: 'flight', origin: 'TP.HCM', destination: 'Đà Nẵng', bus_search_results: rows, train_search_results: [] }),
      ft('Đặt qua app hoặc website, Vietjet 387.000 VND còn chuyến khác chỉ 99.000 VND. Các quán quanh sân bay đều có giao hàng tận nhà. Chúc bạn có chuyến đi vui vẻ.'), FIN,
    ]
    const out = await settle('Vé máy bay TP.HCM Đà Nẵng ngày 24/10/2026 giá bao nhiêu', frames, false, { travel: true })
    record('s5h3_stream_mixed', { out })
    expect(out).toContain('Đặt qua app hoặc website, Vietjet 387.000 VND.')
    expect(out).not.toContain('99.000')
    expect(out).not.toContain('giao hàng tận nhà')
    expect(out).toContain('Chúc bạn có chuyến đi vui vẻ.')
  })
  it('isOrderingClaim: a booking-channel instruction is not a venue claim; every venue ordering claim still is', async () => {
    const { isOrderingClaim } = await import('./placeClaimGuard')
    expect(isOrderingClaim('Đặt qua app hoặc website, Vietjet 387.000 VND.')).toBe(false)
    expect(isOrderingClaim('Đặt qua app hoặc website thì quán giao tận nhà.')).toBe(true)
    expect(isOrderingClaim('Đặt qua GrabFood, quán nhận đơn online.')).toBe(true)
    expect(isOrderingClaim('Đặt qua GrabFood.')).toBe(true)
    expect(isOrderingClaim('Quán này có thể order qua GrabFood.')).toBe(true)
    expect(isOrderingClaim('Quán Phở Hòa có giao hàng tận nhà.')).toBe(true)
  })
})

// ── S5h3 and PLACE-ORDERING-EMPTY-01 with the consultative flag ON as well as OFF ── the Round 42 register passes a fix only when the verified fare survives the
// settle path under BOTH flags (settle's third argument sets collector.consultative). Same frames, same stream filter (applyPlaceEnrichmentStreamFilter) as above.
describe('S5h3 / PLACE-ORDERING-EMPTY-01 — consultative flag ON and OFF through the stream filter', () => {
  const Q = 'Vé máy bay TP.HCM Đà Nẵng ngày 24/10/2026 giá bao nhiêu'
  const fareFrames = (text: string) => [
    f9('t1', 'get_flight_prices', { origin: 'TP.HCM', destination: 'Đà Nẵng', date: '2026-10-24' }),
    fa('t1', { type: 'flight', origin: 'TP.HCM', destination: 'Đà Nẵng', bus_search_results: [{ title: 'Vietjet Air - vé máy bay TP.HCM Đà Nẵng', link: 'https://example.test/vietjet-flights', snippet: 'Vé Vietjet một chiều 387.000 VND.' }], train_search_results: [] }),
    ft(text), FIN,
  ]
  it('S5h3 settle (consultative ON) preserves a verified 387000 VND fare through the stream filter', async () => {
    const out = await settle(Q, fareFrames('Đặt qua app hoặc website, Vietjet 387.000 VND còn chuyến khác chỉ 99.000 VND.'), true, { travel: true })
    record('s5h3_stream_on', { out })
    expect(out).toContain('Đặt qua app hoặc website, Vietjet 387.000 VND.')
    expect(out).not.toContain('99.000')
  })
  it('S5h3 settle (consultative ON): the unverified fare and an unbacked venue ordering claim still go, unrelated prose stays', async () => {
    const out = await settle(Q, fareFrames('Đặt qua app hoặc website, Vietjet 387.000 VND còn chuyến khác chỉ 99.000 VND. Các quán quanh sân bay đều có giao hàng tận nhà. Chúc bạn có chuyến đi vui vẻ.'), true, { travel: true })
    record('s5h3_stream_mixed_on', { out })
    expect(out).toContain('Đặt qua app hoặc website, Vietjet 387.000 VND.')
    expect(out).not.toContain('99.000')
    expect(out).not.toContain('giao hàng tận nhà')
    expect(out).toContain('Chúc bạn có chuyến đi vui vẻ.')
  })
  for (const flag of [false, true]) {
    const env = flag ? 'ON' : 'OFF'
    it(`PLACE-ORDERING-EMPTY-01 (consultative ${env}): a reply that is only a verified fare behind a booking channel is not emptied, keeps the fare, no venue ordering claim, no fragment`, async () => {
      const out = await settle(Q, fareFrames('Đặt qua app hoặc website, Vietjet 387.000 VND.'), flag, { travel: true })
      record('place_ordering_empty_' + env.toLowerCase(), { out })
      expect(out.trim().length).toBeGreaterThan(0)
      expect(out).toContain('Đặt qua app hoặc website, Vietjet 387.000 VND.')
      expect(out).not.toContain('99.000')
      expect(out).not.toMatch(/giao hàng|giao tận|đặt bàn|nhận đơn/i)
      // Prose lines end like sentences. The source line the stream adds with the flag ON ("Giá theo kết quả tìm kiếm của: [host](url)") is a citation, not prose.
      const lines = out.split('\n').map(l => l.trim()).filter(Boolean)
      for (const line of lines.filter(l => !/^(?:Nguồn|Giá theo kết quả tìm kiếm của):/u.test(l))) expect(line).toMatch(/[.!?…]$/u)
      for (const line of lines.filter(l => /^(?:Nguồn|Giá theo kết quả tìm kiếm của):/u.test(l))) expect(line).toContain('example.test')
    })
  }
})
