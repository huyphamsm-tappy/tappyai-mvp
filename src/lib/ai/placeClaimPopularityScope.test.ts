// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// Round 36 — the Tesla turns of the live chat 357c2bbe… (3018 log, 2026-10-12). Every case runs through the settle path that produces the text the user reads
// (applyPlaceEnrichmentStreamFilter → place_claim guard), with a scripted model text, and records: text before the guard, text after, and the guard line it logged.
// Each case prints one line `CASE {…}`.
//
// TURN 2 text is VERBATIM from the log: the kept sentence (23 chars) + the `samples` entry of the place_claim guard line (130 chars) = chars_in 153.
// TURN 3 has NO original text in the log (audit text was off): the case below is RECONSTRUCTED to the logged length (114 chars) — "dựng lại, không phải nguyên văn".

const T2_KEPT = 'À, Nikola Tesla chứ gì.'
const T2_CUT = 'Ông nổi tiếng nhất với những đóng góp cho hệ thống điện xoay chiều hiện đại; ông cũng phát triển động cơ cảm ứng xoay chiều [S1].'
const T2_TEXT = `${T2_KEPT} ${T2_CUT}`
const SERPER_TESLA = [
  { title: 'Nikola Tesla - Wikipedia', link: 'https://vi.wikipedia.org/wiki/Nikola_Tesla', snippet: 'Nikola Tesla là nhà phát minh, kỹ sư điện và cơ khí. Ông có nhiều đóng góp cho hệ thống điện xoay chiều hiện đại và động cơ cảm ứng xoay chiều.' },
]

type Opt = { flag?: boolean; placeIntent?: boolean; user?: string; rows?: unknown[]; tool?: string; carried?: boolean; prep?: (c: any) => void }
async function run(text: string, o: Opt = {}) {
  const user = o.user ?? 'nhà phát minh á'
  const c: any = createEnrichmentCollector(user)
  c.agentMode = true
  c.semanticRanking = true
  if (o.flag !== false) c.consultative = true
  o.prep?.(c)
  const frames = [
    `9:${JSON.stringify({ toolCallId: 't1', toolName: o.tool ?? 'web_search', args: { queries: ['x'] } })}`,
    `a:${JSON.stringify({ toolCallId: 't1', result: { results: o.rows ?? SERPER_TESLA } })}`,
    `0:${JSON.stringify(text)}`,
    'd:{"finishReason":"stop"}',
  ]
  const logs: string[] = []
  const spy = (await import('vitest')).vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
  let body = ''
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', c, (async () => new Map()) as never, undefined, undefined, false, user, o.placeIntent !== false, (async () => ({ perPlace: new Map(), batch: null })) as never)
    body = await new Response(res.body).text()
  } finally { spy.mockRestore() }
  const final = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  const parsed = logs.map(l => { try { return JSON.parse(l) } catch { return null } })
  const guard = parsed.find(j => j && j.guard === 'place_claim') ?? null
  const diag = parsed.filter(j => j && j.guard === 'place_claim_diag')
  return { final, guard, diag }
}
const record = (name: string, before: string, r: { final: string; guard: any }, verdict: string) =>
  console.log('CASE ' + JSON.stringify({ name, before_guard: before, after_guard: r.final, guard: r.guard ? { in: r.guard.chars_in, kept: r.guard.chars_kept, sentences_removed: r.guard.sentences_removed, reasons: Object.fromEntries(Object.entries(r.guard.reasons).filter(([, v]) => (v as number) > 0)), samples: r.guard.samples } : null, verdict }))

// `it.fails` = the DESIRED behaviour is asserted and it is RED today (the defect). Plain `it` = behaviour that must stay as it is (controls) or that documents today's behaviour.
const DESIRED_BIOGRAPHY = 'đóng góp cho hệ thống điện xoay chiều'

describe('Tesla turn 2 — the logged text (verbatim)', () => {
  it('the logged text is 153 chars (23 + a space + 129), as the guard line says', () => {
    expect(T2_KEPT.length).toBe(23)
    expect(T2_CUT.length).toBe(129)
    expect(T2_TEXT.length).toBe(153)
  })
  it('REPRODUCTION (today): the biography sentence is cut by the popularity rule — 153 → 23 chars, reasons.popularity 1, exactly the logged guard line', async () => {
    const r = await run(T2_TEXT)
    record('t2_verbatim', T2_TEXT, r, 'DEFECT reproduced: content cut')
    expect(r.guard?.chars_in).toBe(153)
    expect(r.guard?.chars_kept).toBe(23)
    expect(r.guard?.sentences_removed).toBe(1)
    expect(r.guard?.reasons.popularity).toBe(1)
    expect(r.final).toBe(T2_KEPT)
  })
  it.fails('DESIRED: the biography sentence is kept', async () => {
    const r = await run(T2_TEXT)
    expect(r.final).toContain(DESIRED_BIOGRAPHY)
  })
  it('the guard is not flag-dependent today: flag OFF gives the same cut (so a fix must be gated by the flag to leave flag-off bytes alone)', async () => {
    const r = await run(T2_TEXT, { flag: false })
    record('t2_verbatim_flag_off', T2_TEXT, r, 'same cut with the flag off')
    expect(r.final).toBe(T2_KEPT)
  })
})

describe('Tesla turn 3 — RECONSTRUCTED (dựng lại, không phải nguyên văn: the log has only 114 → 9 chars, 0 sentences removed, no reason)', () => {
  // length 114; one sentence, four clauses; only the head "Biết chứ" can survive a clause trim
  const T3 = 'Biết chứ, ông nổi tiếng với điện xoay chiều, được nhiều người yêu thích, và nhiều khách khen ngợi khắp thế giới ạ.'
  it('the reconstruction has the logged length', () => { expect(T3.length).toBe(114) })
  it('a one-sentence reply whose later clauses carry popularity words is trimmed to "Biết chứ." with NO sentence removed and NO reason counted (the logged signature)', async () => {
    const r = await run(T3, { user: 'đúng rồi, cha, có biết ko', rows: [] })
    record('t3_reconstructed_popularity', T3, r, 'same signature as the log IF popularity were the trigger — NOT proof')
    expect(r.guard?.sentences_removed).toBe(0)
    expect(Object.values(r.guard?.reasons ?? {}).every(v => v === 0)).toBe(true)
    expect(r.final).toBe('Biết chứ.')
  })
  it('the same signature is reachable through the OTHER trim rules, so the log alone cannot name the regex (candidates by code: QUALITY, POPULARITY, ORDERING, TICKET, TICKET_AVAILABILITY)', async () => {
    const variants: Array<[string, string]> = [
      ['quality', 'Biết chứ, ông được đánh giá cao ở nhiều nơi, rating cao trên mạng, và highly rated bởi nhiều người.'],
      ['ordering', 'Biết chứ, bạn có thể đặt bàn trước, có giao hàng tận nơi, và mang về cũng được luôn nhé bạn.'],
      ['ticket', 'Biết chứ, bạn có thể đặt vé trực tuyến, mua vé tại quầy, và xem lịch chiếu ngay trên trang này.'],
    ]
    for (const [k, t] of variants) {
      const r = await run(t, { user: 'đúng rồi, cha, có biết ko', rows: [] })
      record('t3_candidate_' + k, t, r, 'candidate only')
      expect(r.guard?.sentences_removed).toBe(0)
    }
  })
})

describe('Model wrote short vs model wrote enough and the guard cut it', () => {
  it('model writes only the acknowledgement: nothing to cut, the guard does not touch it (a content problem of the model, not of the guard)', async () => {
    const r = await run(T2_KEPT)
    record('model_short', T2_KEPT, r, 'unchanged')
    expect(r.final).toBe(T2_KEPT)
    expect(r.guard?.chars_in).toBe(r.guard?.chars_kept)
  })
})

describe('Scope of the popularity rule — person / place / general knowledge', () => {
  it.fails('DESIRED: a claim about a famous PERSON, fully written, with its source, is kept', async () => {
    const t = 'Nikola Tesla là nhà phát minh nổi tiếng người Mỹ gốc Serbia, sinh năm 1856 [S1].'
    const r = await run(t)
    record('person_famous', t, r, 'desired kept; today cut')
    expect(r.final).toContain('nhà phát minh')
  })
  it('CONTROL: a claim that a PLACE is "nổi tiếng nhất" with no evidence is still cut', async () => {
    const t = 'Mình tìm được vài chỗ. Phố Hàng Mã nổi tiếng nhất Hà Nội, rất đông khách.'
    const r = await run(t, { rows: [] })
    record('control_place_famous_no_evidence', t, r, 'must stay cut')
    expect(r.final).not.toContain('nổi tiếng')
  })
  it('CONTROL: an invented venue named in bold with "nổi tiếng nhất" and no row for it is still cut', async () => {
    const t = '**Bún Chả Hương Liên** nổi tiếng nhất khu này. Bạn thử xem nhé.'
    const r = await run(t, { rows: [] })
    record('control_invented_venue', t, r, 'must stay cut')
    expect(r.final).not.toContain('nổi tiếng')
  })
  it('CONTROL: "Quán này nổi tiếng nhất" (anaphor to an unnamed venue) is still cut', async () => {
    const t = 'Quán này nổi tiếng nhất khu vực, đông khách quanh năm.'
    const r = await run(t, { rows: [] })
    record('control_anaphor_venue', t, r, 'must stay cut')
    expect(r.final).not.toContain('nổi tiếng')
  })
  it('records today for general knowledge about a landmark (no place data)', async () => {
    const t = 'Tháp Eiffel nổi tiếng ở Paris, cao khoảng 330 m [S1].'
    const r = await run(t, { rows: [] })
    record('general_landmark', t, r, 'today')
  })
  it('FINDING: with an UNRELATED rated restaurant row in the batch the Tesla sentence is NOT cut today — only because ANY retrieved rating satisfies the popularity rule (placeClaimGuard.ts:842 `ratings.length === 0`); the row says nothing about Tesla', async () => {
    const r = await run(T2_TEXT, { tool: 'search_places', rows: [{ name: 'Phở Lệ', address: '1 Nguyễn Trãi', rating: 4.5, user_ratings_total: 300 }] })
    record('person_with_unrelated_place_rows', T2_TEXT, r, 'kept today by an accident of batch-level rating evidence')
    expect(r.final).toContain(DESIRED_BIOGRAPHY)
  })
})

// ── Round 37: PLACE_CLAIM_DIAG (placeClaimGuard.ts placeClaimDiag) is a recording only: same output with the variable on or off ──
describe('PLACE_CLAIM_DIAG — diagnostic line, no effect on the output', () => {
  const T3S: Array<[string, string]> = [
    ['t3_popularity', 'Biết chứ, ông nổi tiếng với điện xoay chiều, được nhiều người yêu thích, và nhiều khách khen ngợi khắp thế giới ạ.'],
    ['t3_quality', 'Biết chứ, ông được đánh giá cao ở nhiều nơi, rating cao trên mạng, và highly rated bởi nhiều người.'],
    ['t3_ordering', 'Biết chứ, bạn có thể đặt bàn trước, có giao hàng tận nơi, và mang về cũng được luôn nhé bạn.'],
    ['t3_ticket', 'Biết chứ, bạn có thể đặt vé trực tuyến, mua vé tại quầy, và xem lịch chiếu ngay trên trang này.'],
  ]
  const CASES: Array<[string, string, Opt]> = [
    ['t2_verbatim', T2_TEXT, {}],
    ['person_famous', 'Nikola Tesla là nhà phát minh nổi tiếng người Mỹ gốc Serbia, sinh năm 1856 [S1].', {}],
    ['place_famous', 'Mình tìm được vài chỗ. Phố Hàng Mã nổi tiếng nhất Hà Nội, rất đông khách.', { rows: [] }],
    ['invented_venue', '**Bún Chả Hương Liên** nổi tiếng nhất khu này. Bạn thử xem nhé.', { rows: [] }],
    ['anaphor_venue', 'Quán này nổi tiếng nhất khu vực, đông khách quanh năm.', { rows: [] }],
    ['unrelated_rows', T2_TEXT, { tool: 'search_places', rows: [{ name: 'Phở Lệ', address: '1 Nguyễn Trãi', rating: 4.5, user_ratings_total: 300 }] }],
    ...T3S.map(([k, t]): [string, string, Opt] => ['turn3_' + k, t, { user: 'đúng rồi, cha, có biết ko', rows: [] }]),
  ]
  it('the user-visible text and the guard statistics are identical with the variable off and on, for every case', async () => {
    for (const [name, text, o] of CASES) {
      delete process.env.PLACE_CLAIM_DIAG
      const off = await run(text, o)
      process.env.PLACE_CLAIM_DIAG = '1'
      const on = await run(text, o)
      delete process.env.PLACE_CLAIM_DIAG
      expect(on.final, name).toBe(off.final)
      expect(JSON.stringify(on.guard), name).toBe(JSON.stringify(off.guard))
      expect(off.diag.length, name + ' (off writes nothing)').toBe(0)
    }
  })
  it('names the regex that really matched: one candidate per reconstructed turn-3 text, and the sentence removal of turn 2', async () => {
    const want: Record<string, string> = { t3_popularity: 'POPULARITY_RE', t3_quality: 'QUALITY_RE', t3_ordering: 'ORDERING_RE', t3_ticket: 'TICKET_RE' }
    process.env.PLACE_CLAIM_DIAG = '1'
    try {
      for (const [k, t] of T3S) {
        const r = await run(t, { user: 'đúng rồi, cha, có biết ko', rows: [] })
        expect(r.diag.length, k).toBe(1)
        expect(r.diag[0].decision, k).toBe('clause_trim')
        expect(r.diag[0].offenders.map((x: any) => x.regex), k).toContain(want[k])
        expect(r.diag[0].before, k).toBe(t)
        expect(r.diag[0].after, k).toBe('Biết chứ.')
        console.log('CASE ' + JSON.stringify({ name: 'diag_' + k, diag: r.diag[0] }))
      }
      const t2 = await run(T2_TEXT)
      const d = t2.diag.find((x: any) => x.decision === 'sentence_removed')
      expect(d).toBeTruthy()
      expect(d.offenders[0].regex).toBe('POPULARITY_RE')
      expect(d.offenders[0].matched).toBe('nổi tiếng')
      // the sentence has clauses ("…; ông cũng phát triển…"): the trim would remove the HEAD clause, the survivor names no place → the whole sentence goes (trimStandsAlone)
      expect(d.why).toBe('trim_head_removed_survivor_names_no_place')
      console.log('CASE ' + JSON.stringify({ name: 'diag_t2_verbatim', diag: d }))
    } finally { delete process.env.PLACE_CLAIM_DIAG }
  })
})
