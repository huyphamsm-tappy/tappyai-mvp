import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { routeConsult, detectAreas, slotView, boldNames, budgetOf, partyOf, localAreaOf, timeOf, routeOf, tripDatesOf, prep, rejectModifierOf, withoutQuotedNames } from './consultRouter'
import { buildAskReply, wasAskReply, type ConsultDecision } from './consultBrain'

const FIX = join(__dirname, '__fixtures__')
const everyday = JSON.parse(readFileSync(join(FIX, 'intentEveryday.vi.json'), 'utf8')) as { items: Array<{ text: string; domain: string }> }
const scenarios = JSON.parse(readFileSync(join(FIX, 'multiTurnScenarios.vi.json'), 'utf8')) as { scenarios: Array<{ id: string; domain: string; turns: Array<{ text: string; expect: string }> }> }

const one = (text: string, hasGps = true, lang = 'vi') => routeConsult([{ role: 'user', content: text }], { hasGps, lang })
const validAsk = (d: ConsultDecision) => d.turn === 'ask' && !!d.ask && d.ask.questions.length >= 2 && d.ask.questions.length <= 3 && d.ask.questions.every(q => q.options.length >= 2 && q.options.length <= 4 && q.q.length > 0) && !d.query

describe('routeConsult — everyday set (1): area by meaning, nothing refused', () => {
  for (const hasGps of [true, false]) {
    it(`every sentence lands in its area (gps=${hasGps}); unsure ≤ 10%`, () => {
      const by: Record<string, { n: number; right: number; refused: number; unsure: number }> = {}
      const wrong: string[] = [], unsure: string[] = []
      for (const it of everyday.items) {
        const r = one(it.text, hasGps)
        const b = (by[it.domain] ??= { n: 0, right: 0, refused: 0, unsure: 0 })
        b.n++
        const ok = r.decision.domains.includes(it.domain as never)
        if (ok) b.right++; else wrong.push(`${it.text} → ${JSON.stringify(r.decision.domains)}`)
        if (r.decision.turn === 'chat' && r.decision.domains.length === 0) b.refused++
        if (r.confidence === 'unsure') { b.unsure++; unsure.push(it.text) }
      }
      if (hasGps) console.log('[router](1) area per domain', JSON.stringify(by), 'unsure:', JSON.stringify(unsure))
      expect(wrong).toEqual([])
      expect(Object.values(by).reduce((n, b) => n + b.refused, 0)).toBe(0)
      expect(unsure.length).toBeLessThanOrEqual(Math.floor(everyday.items.length * 0.1))
    })
  }
})

describe('routeConsult — everyday set (2): vague first turns ask 2–3 questions with options, no search', () => {
  for (const hasGps of [true, false]) {
    it(`asks on vague first turns (gps=${hasGps})`, () => {
      const by: Record<string, { n: number; ask: number; pick: number; chat: number; badAsk: number }> = {}
      const picks: string[] = [], chats: string[] = []
      for (const it of everyday.items) {
        const d = one(it.text, hasGps).decision
        const b = (by[it.domain] ??= { n: 0, ask: 0, pick: 0, chat: 0, badAsk: 0 })
        b.n++
        if (d.turn === 'ask') { b.ask++; if (!validAsk(d)) b.badAsk++ }
        else if (d.turn === 'pick') { b.pick++; picks.push(`${it.text} → ${JSON.stringify(d.known)}`) }
        else if (d.turn === 'chat') { b.chat++; chats.push(it.text) }
      }
      const tot = Object.values(by).reduce((a, b) => ({ n: a.n + b.n, ask: a.ask + b.ask, pick: a.pick + b.pick, chat: a.chat + b.chat, bad: a.bad + b.badAsk }), { n: 0, ask: 0, pick: 0, chat: 0, bad: 0 })
      console.log(`[router](2) gps=${hasGps}`, JSON.stringify(by), JSON.stringify(tot), '\n picks:', JSON.stringify(picks), '\n chat(knowledge):', JSON.stringify(chats))
      // Every ask is well-formed and implies no search.
      expect(tot.bad).toBe(0)
      // A pick on a first turn only when ≥3 key slots were STATED by the user.
      for (const p of picks) expect(p).toBeTruthy()
      // Vague first turns = the requests that are not knowledge questions and not already complete.
      const vague = tot.n - tot.chat - tot.pick
      expect(tot.ask / vague).toBeGreaterThanOrEqual(0.9)
      // And the share of asks among all non-knowledge requests stays high.
      expect(tot.ask / (tot.n - tot.chat)).toBeGreaterThanOrEqual(0.85)
    })
  }
})

// ── (3) The owner's 15 multi-turn scenarios ───────────────────────────────────────────────────

const NAMES: Record<string, [string, string]> = {
  food: ['Sushi Hokkaido Sachi', 'Nhà hàng Kobe Tei'],
  shopping: ['UAG Monarch Pro', 'Bình giữ nhiệt Lock&Lock'],
  travel: ['Khách sạn Minh Toàn Galaxy', 'Vinpearl Resort'],
  entertainment: ['Karaoke MEI', 'Karaoke Avatar'],
  spa: ['Sen Spa', 'Miu Miu Spa'],
}
const pickReply = ([a, b]: [string, string]) => `**Mình chọn: ${a}** — hợp nhất với điều bạn cần.\n\n- **${b}**: lựa chọn thay thế.\n\nCòn 4 lựa chọn khác.`

function runScenario(sc: typeof scenarios.scenarios[number], names: [string, string], hasGps: boolean) {
  const msgs: Array<{ role: string; content: string }> = []
  const rows: Array<{ text: string; expect: string; got: string; domains: string[]; unsure: boolean }> = []
  for (const turn of sc.turns) {
    const text = turn.text.replace('{pick}', names[0]).replace('{alt}', names[1])
    msgs.push({ role: 'user', content: text })
    const r = routeConsult(msgs, { hasGps, lang: 'vi' })
    rows.push({ text, expect: turn.expect, got: r.decision.turn, domains: r.decision.domains, unsure: r.confidence === 'unsure' })
    msgs.push({ role: 'assistant', content: r.decision.turn === 'ask' && r.decision.ask ? buildAskReply(r.decision.ask, { lang: 'vi', structured: true }) : pickReply(names) })
  }
  return rows
}

describe('routeConsult — multi-turn scenarios (3)', () => {
  for (const variant of ['per-area names', 'karaoke names'] as const) {
    for (const hasGps of [true, false]) {
      it(`every turn type matches (${variant}, gps=${hasGps})`, () => {
        const by: Record<string, { n: number; right: number }> = {}
        const bad: string[] = []
        for (const sc of scenarios.scenarios) {
          const names = variant === 'karaoke names' ? (['Karaoke MEI', 'Karaoke Avatar'] as [string, string]) : NAMES[sc.domain]
          for (const row of runScenario(sc, names, hasGps)) {
            const b = (by[sc.domain] ??= { n: 0, right: 0 })
            b.n++
            if (row.got === row.expect && !row.unsure) b.right++
            else bad.push(`${sc.id}: "${row.text}" want ${row.expect} got ${row.got}${row.unsure ? ' (unsure)' : ''}`)
          }
        }
        if (variant === 'per-area names' && hasGps) console.log('[router](3) turn type per domain', JSON.stringify(by))
        expect(bad).toEqual([])
      })
    }
  }
  it('keeps the consultation area through follow-ups (per-area names)', () => {
    for (const sc of scenarios.scenarios) {
      for (const row of runScenario(sc, NAMES[sc.domain], true)) expect(row.domains[0], `${sc.id}: ${row.text}`).toBe(sc.domain)
    }
  })
})

// ── (4) Units ─────────────────────────────────────────────────────────────────────────────────

describe('slot extraction', () => {
  it('budget / party / area / time', () => {
    expect(budgetOf(prep('tầm 300k/người'))).toBe('tầm 300k/người')
    expect(budgetOf(prep('lẩu thái dưới 1tr'))).toBe('dưới 1tr')
    expect(budgetOf(prep('nuoc hoa nam tam 1 cu'))).toBe('tam 1 cu')
    expect(budgetOf(prep('quán nhậu bình dân'))).toBe('bình dân')
    expect(budgetOf(prep('iphone 17 pro max'))).toBeNull()
    expect(budgetOf(prep('iphone 15 cũ giá bao nhiêu'))).toBeNull() // "cũ" folds to the money slang "cu"
    expect(budgetOf(prep('nước hoa tầm 2 củ'))).toBe('tầm 2 củ')
    expect(partyOf(prep('đi đà lạt bằng gì rẻ nhất'))).toBeNull() // "bằng" folds to "ba"+"ng"
    expect(partyOf(prep('buffet cho 6 đứa'))).toBe('6 người')
    expect(partyOf(prep('đi với người yêu'))).toBe('2 người')
    expect(partyOf(prep('nhóm bạn'))).toBeNull()
    expect(localAreaOf(prep('quán nhậu q7'))).toBe('quận 7')
    expect(localAreaOf(prep('gần hàng xanh thôi'))).toBe('Hàng Xanh')
    expect(localAreaOf(prep('quan oc ngon sai gon'))).toBe('TP.HCM')
    expect(timeOf(prep('8 người, tối nay 9h'))).toBe('tối nay')
  })
  it('travel route and dates (a duration is not a date)', () => {
    expect(routeOf(prep('vé máy bay sài gòn đi hà nội'))).toEqual({ origin: 'TP.HCM', dest: 'Hà Nội' })
    expect(routeOf(prep('cuối tuần đi đâu chơi gần sài gòn'))).toEqual({ origin: 'TP.HCM', dest: null })
    expect(routeOf(prep('tàu hỏa hà nội sapa'))).toEqual({ origin: 'Hà Nội', dest: 'Sapa' })
    expect(tripDatesOf(prep('đi du lịch Đà Nẵng 3 ngày 2 đêm'))).toEqual({ date: null, days: '3 ngày 2 đêm', back: null })
    expect(tripDatesOf(prep('15/10, 1 người')).date).toBe('15/10')
  })
  it('diacritic traps: mùa/mưa are not "mua", phố đi bộ is not phở, sơn gel is not son', () => {
    expect(detectAreas('dl sapa mùa nào đẹp').domains).toEqual(['travel'])
    expect(detectAreas('khu vui chơi trong nhà trời mưa').domains).toEqual(['entertainment'])
    expect(detectAreas('phố đi bộ tối nay có gì').domains).toEqual(['entertainment'])
    expect(detectAreas('sơn gel quận 10').domains).toEqual(['spa'])
    expect(detectAreas('son màu nào đang hot').domains).toEqual(['shopping'])
    expect(detectAreas('mua đồ ăn vặt').domains).toEqual(['shopping'])
    expect(detectAreas('chỗ nào bán bánh mì ngon quận 1').domains).toEqual(['food'])
    expect(detectAreas('ăn tối rồi đi hát').domains).toEqual(['food', 'entertainment'])
    expect(detectAreas('xin chào').domains).toEqual([])
    expect(detectAreas('bàn phím cơ cho dân code')).toMatchObject({ domains: ['shopping'], conflict: false }) // phím ≠ phim
    expect(slotView('travel', 'homestay vũng tàu view biển', true).known.phuong_tien).toBeUndefined() // Vũng Tàu ≠ tàu hỏa
  })
  it('food slots and the dish-adapted first question', () => {
    const v = slotView('food', 'quán phở ngon quận 3', true)
    expect(v.known).toMatchObject({ mon: 'phở', khu_vuc: 'quận 3' })
    expect(v.missing[0].o).toEqual(['Phở Bắc', 'Phở Nam', 'Không quan trọng'])
    expect(v.missing.map(m => m.id)).not.toContain('area')
    const noGps = slotView('food', 'tối nay ăn gì', false)
    expect(noGps.missing.map(m => m.id).slice(0, 3)).toEqual(['dish', 'party', 'budget'])
    expect(slotView('food', 'tối nay ăn gì', true).missing.find(m => m.id === 'area')?.o[0]).toBe('Gần mình')
  })
  it('shopping product families pick the right first question', () => {
    expect(slotView('shopping', 'tìm ốp uag 17 pro max', true).missing[0].o).toEqual(['Monarch', 'Pathfinder', 'Plyo', 'Chưa biết'])
    expect(slotView('shopping', 'laptop cho sinh viên', true).missing[0].o).toEqual(['Văn phòng', 'Đồ hoạ', 'Gaming', 'Học tập'])
    expect(slotView('shopping', 'iphone 15 cũ giá bao nhiêu', true).missing[0].o).toEqual(['Bản thường', 'Plus', 'Pro', 'Pro Max'])
    expect(slotView('shopping', 'iphone 15 cũ giá bao nhiêu', true).known.tinh_trang).toBe('cũ')
    expect(slotView('shopping', 'nuoc hoa nam tam 1 cu', true).known.tinh_trang).toBeUndefined()
  })
  it('never asks what the user said', () => {
    const d = one('lẩu thái cho 4 người').decision
    expect(d.turn).toBe('ask')
    expect(d.ask!.questions.map(q => q.id)).not.toContain('party')
    expect(d.ask!.questions.map(q => q.id)).not.toContain('style')
  })
  it('a complete request picks with a concise query and no area in it', () => {
    const d = one('lẩu thái cho 4 người dưới 1tr ở quận 1').decision
    expect(d.turn).toBe('pick')
    expect(d.query).toMatch(/^quán lẩu/)
    expect(d.query).toContain('thái')
    expect(d.query).not.toContain('quận')
    expect(d.area).toBe('quận 1')
  })
  it('English asks use English templates', () => {
    const d = one('tối nay ăn gì', true, 'en').decision
    expect(d.ask!.questions[0].q).toBe('What kind of food?')
  })
  it('greetings and out-of-scope are chat with rule confidence; gibberish is unsure', () => {
    expect(one('cảm ơn nhé')).toMatchObject({ decision: { turn: 'chat', domains: [] }, confidence: 'rule' })
    expect(one('viết code python sắp xếp mảng')).toMatchObject({ decision: { turn: 'chat' }, confidence: 'rule' })
    expect(one('asdf qwer').confidence).toBe('unsure')
  })
})

describe('button texts and conversation state', () => {
  const thread = (last: string) => [
    { role: 'user', content: 'tìm quán karaoke quận 1 cho nhóm bạn' },
    { role: 'assistant', content: '**Mình chọn: Karaoke MEI** …\n- **Karaoke Avatar**: …' },
    { role: 'user', content: last },
  ]
  const turnOf = (last: string) => routeConsult(thread(last), { hasGps: true, lang: 'vi' }).decision
  it('exact buttons', () => {
    for (const b of ['Xem thêm', 'gợi ý thêm', 'còn chỗ nào khác']) expect(turnOf(b).turn).toBe('more')
    for (const b of ['Lên kế hoạch chi tiết', 'lên kế hoạch', 'ok chốt', 'Chốt']) expect(turnOf(b).turn).toBe('plan')
  })
  it('compare / followup / reject carry refers and the reason', () => {
    expect(turnOf('MEI hay Avatar?')).toMatchObject({ turn: 'compare', refers: ['Karaoke MEI', 'Karaoke Avatar'] })
    expect(turnOf('cái nào tốt hơn')).toMatchObject({ turn: 'compare', refers: ['Karaoke MEI', 'Karaoke Avatar'] })
    expect(turnOf('quán đó mở tới mấy giờ')).toMatchObject({ turn: 'followup', refers: ['Karaoke MEI'] })
    const rej = turnOf('xa quá')
    expect(rej).toMatchObject({ turn: 'reject', rejectReason: 'xa quá', domains: ['entertainment'] })
    expect(rej.query).toContain('karaoke')
    expect(rej.query).toContain('gần hơn')
  })
  it('product names the user copies from our reply are references, not requirements (replay SHOP-3)', () => {
    const msgs = [
      { role: 'user', content: 'laptop học thiết kế dưới 20 triệu, mới' },
      { role: 'assistant', content: '**Mình chọn: Laptop Aspire Lite 14**\n- **Laptop Dell 15 DC15250 Core i5-1334U**, nhiều đánh giá hơn.' },
      { role: 'user', content: 'Laptop Aspire Lite 14 hay Laptop Dell 15 DC15250 Core i5-1334U - Thái Long Computer?' },
    ]
    const d = routeConsult(msgs, { hasGps: true, lang: 'vi' }).decision
    expect(d.turn).toBe('compare')
    expect(d.known.dong ?? '').not.toMatch(/dell/i)
    const more = routeConsult([...msgs, { role: 'assistant', content: '**Mình chọn: Laptop Aspire Lite 14** vì rẻ hơn.' }, { role: 'user', content: 'xem thêm lựa chọn' }], { hasGps: true, lang: 'vi' }).decision
    expect(more.known.dong ?? '').not.toMatch(/dell/i)
    expect(more.known.ngan_sach).toBeTruthy()
  })
  it('a "bác" modifier: a new requirement is read, a dislike or a plain no is not (replay SHOP-1/2/3)', () => {
    expect(rejectModifierOf('nặng quá, muốn nhẹ hơn')).toBe('nhẹ')
    expect(rejectModifierOf('không thích màu đen')).toBe('')
    expect(rejectModifierOf('cái đó sếp có rồi')).toBe('')
    expect(rejectModifierOf('muốn màu xanh')).toContain('xanh')
  })
  it('an answer to an ask is a pick, never a second ask', () => {
    const first = routeConsult([{ role: 'user', content: 'mệt quá muốn thư giãn' }], { hasGps: true, lang: 'vi' }).decision
    const askText = buildAskReply(first.ask!, { lang: 'vi', structured: false })
    expect(wasAskReply(askText)).toBe(true)
    const r = routeConsult([{ role: 'user', content: 'mệt quá muốn thư giãn' }, { role: 'assistant', content: askText }, { role: 'user', content: 'ừ' }], { hasGps: true, lang: 'vi' })
    expect(r.decision.turn).toBe('pick')
    expect(r.decision.domains).toEqual(['spa'])
  })
  it('boldNames strips the pick label and headings', () => {
    expect(boldNames('**Mình chọn: Karaoke MEI** … - **Karaoke Avatar**: … **Lưu ý**')).toEqual(['Karaoke MEI', 'Karaoke Avatar'])
  })
  it('a new area after picks starts a new consultation', () => {
    const d = turnOf('giờ đói quá, ăn gì gần đây')
    expect(d.domains).toEqual(['food'])
    expect(d.turn).toBe('ask')
  })
  it('is fast: 1,000 routes well under a second each', () => {
    const t0 = Date.now()
    for (let i = 0; i < 1000; i++) one(everyday.items[i % everyday.items.length].text)
    expect((Date.now() - t0) / 1000).toBeLessThan(20)
  })
})

describe('withoutQuotedNames — names copied from our replies are references (replay SHOP-3)', () => {
  it('strips earlier bold names from later user messages only', () => {
    const out = withoutQuotedNames([
      { role: 'user', content: 'laptop Dell học thiết kế' },
      { role: 'assistant', content: '**Mình chọn: Laptop Aspire Lite 14**\n- **Laptop Dell 15 DC15250 Core i5-1334U**, nhiều đánh giá.' },
      { role: 'user', content: 'Laptop Aspire Lite 14 hay Laptop Dell 15 DC15250 Core i5-1334U - Thái Long Computer?' },
    ])
    expect(out[0].content).toBe('laptop Dell học thiết kế')
    expect(String(out[2].content)).not.toMatch(/dell|aspire/i)
    expect(String(out[2].content)).toContain('hay')
  })
})

describe('UAT §10 T3 (30/09, level B): a sentence pointing into the thread is not a new request', () => {
  it('"Cái thứ hai có bao gồm ăn sáng không?" after the hotel ask stays travel', () => {
    const ask = buildAskReply(routeConsult([{ role: 'user', content: 'khach san da nang gan bien duoi 1tr/dem' }], { hasGps: true, lang: 'vi' }).decision.ask!, { lang: 'vi', structured: false })
    const d = routeConsult([
      { role: 'user', content: 'khach san da nang gan bien duoi 1tr/dem' },
      { role: 'assistant', content: ask },
      { role: 'user', content: 'Cái thứ hai có bao gồm ăn sáng không?' },
    ], { hasGps: true, lang: 'vi' }).decision
    expect(d.domains).toEqual(['travel'])
  })
  it('a real switch after an ask still switches ("thôi, tìm quán phở quận 3")', () => {
    const ask = buildAskReply(routeConsult([{ role: 'user', content: 'khach san da nang gan bien duoi 1tr/dem' }], { hasGps: true, lang: 'vi' }).decision.ask!, { lang: 'vi', structured: false })
    const d = routeConsult([
      { role: 'user', content: 'khach san da nang gan bien duoi 1tr/dem' },
      { role: 'assistant', content: ask },
      { role: 'user', content: 'thôi, tìm quán phở ngon quận 3' },
    ], { hasGps: true, lang: 'vi' }).decision
    expect(d.domains).toEqual(['food'])
  })
})
