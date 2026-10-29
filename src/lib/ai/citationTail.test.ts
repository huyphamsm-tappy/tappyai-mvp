// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { isCitationOnly, maskLinks } from './citationTail'
import { guardTravelClaimsInText } from './travelGuard'
import { guardPlanTripFacts, guardUngivenTravelDate } from './planTripFactsGuard'
import { releasableLiveText } from './streamEnrichment'

// 30/10 (localhost, Hội An 2 ngày 1 đêm): when a guard removed a sentence, the citation written with it stayed behind on screen —
// "Vietravel).", "Dự báo thời tiết", "Phố cổ Hội An Hãy xác nhận…". A citation now goes with its sentence.
const VT = 'https://travel.com.vn/hoi-an'
const LEAD = 'Hội An đẹp nhất về đêm.\n\n'

describe('isCitationOnly / maskLinks', () => {
  it('a link with brackets and punctuation around it is a citation; any word outside a link is not', () => {
    expect(isCitationOnly(`[Vietravel](${VT})`)).toBe(true)
    expect(isCitationOnly(` ([Vietravel](${VT})).`)).toBe(true)
    expect(isCitationOnly(`${VT}`)).toBe(true)
    expect(isCitationOnly(`theo [Vietravel](${VT})`)).toBe(false)
    expect(isCitationOnly(').')).toBe(false)
    expect(isCitationOnly('Dự báo thời tiết')).toBe(false)
  })
  it('masks a link with the same length, so offsets hold and its brackets are gone', () => {
    const s = `vé 120.000đ (theo [Vietravel](${VT})).`
    const m = maskLinks(s)
    expect(m.length).toBe(s.length)
    expect(m.indexOf('(')).toBe(s.indexOf('('))
    expect(m.split('(').length).toBe(2)
  })
})

describe('a removed price sentence takes its citation with it (travel guard → money clause cut)', () => {
  const run = (s: string) => guardTravelClaimsInText(LEAD + s, [], 'lịch trình Hội An 2 ngày 1 đêm', { lang: 'vi' }).text
  it('a citation inside the sentence, in brackets: no "Vietravel)." left', () => {
    const out = run(`- **Vé tham quan:** Vé phố cổ 120.000đ/người (theo [Vietravel](${VT})).`)
    expect(out).not.toContain('Vietravel')
    expect(out).not.toContain(')).')
    expect(out).not.toContain('120.000')
  })
  it('a citation after the stop, on the same line: it goes too', () => {
    const out = run(`- **Vé tham quan:** Vé phố cổ 120.000đ/người. [Vietravel](${VT})`)
    expect(out).not.toContain('Vietravel')
  })
  it('a label head and its cited price go; the next sentence stays whole, no label glued to it', () => {
    const out = run(`- **Phố cổ Hội An:** vé tham quan 120.000đ/người với khách Việt ([Vietravel](${VT})). Hãy xác nhận mức vé tại quầy vì chính sách có thể đổi.`)
    expect(out).toContain('Hãy xác nhận mức vé tại quầy vì chính sách có thể đổi.')
    expect(out).not.toContain('Phố cổ Hội An')
    expect(out).not.toContain('Vietravel')
  })
  it('only the cited price clause goes: the head of the sentence stays, clean, with its stop', () => {
    // (a head of 4 words or fewer is read as a label and the sentence goes whole: an older rule, unchanged)
    const out = run(`Phố cổ Hội An về đêm rất đẹp, vé tham quan 120.000đ/người (theo [Vietravel](${VT})).`)
    expect(out).toContain('Phố cổ Hội An về đêm rất đẹp.')
    expect(out).not.toContain('Vietravel')
    expect(out).not.toMatch(/đẹp\S*\)/u)
  })
  it('a kept sentence keeps its citation; a link on a line of its own after a removed sentence is not touched', () => {
    const kept = `Phố cổ đẹp nhất lúc lên đèn ([Vietravel](${VT})).`
    expect(run(kept)).toContain(kept)
    const own = `- **Vé:** Vé phố cổ 120.000đ/người.\n[Bản đồ phố cổ](${VT})`
    expect(run(own)).toContain(`[Bản đồ phố cổ](${VT})`)
  })
})

describe('the travel schedule cut and the trip-date cut take the citation after the sentence', () => {
  it('schedule: a departure no row states goes with its citation', () => {
    const out = guardTravelClaimsInText(`${LEAD}Xe khởi hành lúc 23:10 mỗi tối. [Vexere](https://vexere.com/x)`, [], 've xe hoi an', { lang: 'vi' }).text
    expect(out).not.toContain('Vexere')
  })
  it('trip date: a forecast for a date the user never gave goes with its citation; the bullet does not leave a source line behind', () => {
    const w = '- **Lưu ý thời tiết:** Dự báo ngày 29–30/10/2026 tại Hội An có mưa. [Dự báo thời tiết](https://open-meteo.com/)'
    const out = guardUngivenTravelDate(LEAD + w, ['lịch trình Hội An 2 ngày 1 đêm']).text
    expect(out).not.toContain('Dự báo thời tiết')
    expect(out).toContain('Hội An đẹp nhất về đêm.')
    // a date the user GAVE: nothing goes
    expect(guardUngivenTravelDate(LEAD + w, ['Hội An ngày 29/10 đến 30/10']).text).toBe(LEAD + w)
  })
  it('trip plan prose (the brochure path, measured live 30/10): the dated forecast and its source both go, the plan stays', () => {
    const plan = { type: 'trip', title: 'Hội An 2 ngày 1 đêm', days: [{ label: 'Ngày 1', items: [{ time: '09:00', category: 'sightseeing', name: 'Chùa Cầu' }] }] }
    const before = '- **Lưu ý thời tiết:** Dự báo ngày 29–30/10/2026 tại Hội An có mưa. [Dự báo thời tiết](https://open-meteo.com/)\n\nLịch chi tiết ở thẻ kế hoạch.\n'
    const r = guardPlanTripFacts(`${before}[TAPPY_PLAN]\n${JSON.stringify(plan)}\n[/TAPPY_PLAN]`, ['lịch trình Hội An 2 ngày 1 đêm'])
    expect(r.text).not.toContain('Dự báo thời tiết')
    expect(r.text).toContain('Lịch chi tiết ở thẻ kế hoạch.')
    expect(r.text).toContain('Chùa Cầu')
  })
})

describe('egress: a citation after its sentence whose link is not ours goes whole (no bare source name left)', () => {
  const allowed = new Set<string>()
  it('after the stop: label and link both go', () => {
    const t = 'Mang áo mưa, đừng cố đi thuyền. [Dự báo thời tiết](https://open-meteo.com/)\n\nLịch chi tiết ở thẻ kế hoạch.'
    const out = releasableLiveText(t, true, allowed)
    expect(out).not.toContain('Dự báo thời tiết')
    expect(out).not.toContain('open-meteo')
    expect(out).toContain('Mang áo mưa, đừng cố đi thuyền.')
  })
  it('inside the sentence, or alone on its line: the label stays as before, the link goes', () => {
    const inside = releasableLiveText('Ăn ở [Quán Bá Lễ](https://x.example/ba-le) rất ngon.', true, allowed)
    expect(inside).toContain('Quán Bá Lễ')
    expect(inside).not.toContain('x.example')
    const alone = releasableLiveText('Các trang nên xem:\n[Trang du lịch Hội An](https://x.example/hoi-an)', true, allowed)
    expect(alone).toContain('Trang du lịch Hội An')
  })
})
