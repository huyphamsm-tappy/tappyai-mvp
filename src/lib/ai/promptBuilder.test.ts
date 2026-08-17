import { describe, it, expect } from 'vitest'
import { buildSystem } from './promptBuilder'
import { extractBudget } from './budget'

// The cost of this app is dominated by ONE number: how often the ~11k-token
// rulebook has to be re-sent at full price instead of read from the provider's
// cache. That only works while `shared` is byte-identical across requests, and
// nothing in the type system enforces it — one `${}` in the wrong block and the
// saving silently disappears with no test failure and no error. This file is
// what stands between that and production.
//
// Measured 2026-08-10 (see docs/perf/PHASE_B_BASELINE_2026-08-10.md): before the
// split, a one-minute clock tick or a different user's memory re-billed all
// 11,056 tokens.

const GPS = { lat: 10.7769, lng: 106.7009, address: 'Quan 1, TP HCM' }
const MEM_A = '===== THONG TIN VE USER NAY =====\n- Vi tri thuong dung: Quan 3\n=================================='
const MEM_B = '===== THONG TIN VE USER NAY =====\n- Vi tri thuong dung: Hai Ba Trung\n=================================='
const PREFS = '===== SO THICH =====\nNgan sach: cao\n===================='

/** Every meaningfully different way the route can call buildSystem. */
const VARIANTS: Array<[string, ReturnType<typeof buildSystem>]> = [
  ['vi / bare', buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)],
  ['en / bare', buildSystem(null, 'unknown', true, '', 'en', '', null, null, false)],
  ['ja / bare', buildSystem(null, 'unknown', true, '', 'ja', '', null, null, false)],
  ['vi / follow-up', buildSystem(null, 'unknown', false, '', 'vi', '', null, null, false)],
  ['vi / memory A', buildSystem(null, 'unknown', true, MEM_A, 'vi', '', null, null, false)],
  ['vi / memory B', buildSystem(null, 'unknown', true, MEM_B, 'vi', '', null, null, false)],
  ['vi / prefs', buildSystem(null, 'unknown', true, '', 'vi', PREFS, null, null, false)],
  ['vi / gps', buildSystem(null, 'unknown', true, '', 'vi', '', GPS, null, false)],
  ['vi / offline', buildSystem(null, 'offline', true, '', 'vi', '', null, null, false)],
  ['vi / online', buildSystem(null, 'online', true, '', 'vi', '', null, null, false)],
  ['vi / budget', buildSystem(extractBudget('quan an duoi 200k'), 'unknown', true, '', 'vi', '', null, null, false)],
  ['vi / trip', buildSystem(null, 'unknown', true, '', 'vi', '', null, 'trip', false)],
  ['en / trip', buildSystem(null, 'unknown', true, '', 'en', '', null, 'trip', false)],
  ['vi / evening', buildSystem(null, 'unknown', true, '', 'vi', '', null, 'evening', false)],
  ['vi / image', buildSystem(null, 'unknown', true, '', 'vi', '', null, null, true)],
  ['en / everything', buildSystem(extractBudget('khach san duoi 1 trieu'), 'offline', false, MEM_B, 'en', PREFS, GPS, 'trip', true)],
]

describe('buildSystem — cache-stable split', () => {
  it('the shared segment is byte-identical across every call shape', () => {
    const [firstLabel, first] = VARIANTS[0]
    for (const [label, v] of VARIANTS) {
      expect(v.shared, `"${label}" diverged from "${firstLabel}"`).toBe(first.shared)
    }
  })

  it('the shared segment carries no clock, no user and no request state', () => {
    const { shared } = VARIANTS[0][1]
    // A timestamp is the invalidator that actually shipped — it re-billed the
    // whole prefix once a minute.
    expect(shared).not.toMatch(/\d{1,2}:\d{2}/)
    expect(shared).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    // And nothing user- or request-shaped may leak in.
    // Block HEADERS, not loose phrases: ctaBlock legitimately mentions the word
    // limit as an exception to it ("NGOAI LE WORD LIMIT"), and that reference is
    // invariant text, not request state.
    for (const marker of ['THOI GIAN HIEN TAI', 'THONG TIN VE USER', 'SỞ THÍCH NGƯỜI DÙNG', 'VỊ TRÍ GPS', 'BUDGET FILTER - LUAT BAT BUOC', 'WORD LIMIT - REPLY DAU TIEN', 'WORD LIMIT - CO CONTEXT', 'CHẾ ĐỘ LÊN KẾ HOẠCH', 'CAMERA AI MODE', 'LANGUAGE OVERRIDE', 'VI TRI: CUA HANG VAT LY']) {
      expect(shared, `"${marker}" must live in the dynamic segment`).not.toContain(marker)
    }
  })

  it('the shared segment still holds the rules the product depends on', () => {
    const { shared } = VARIANTS[0][1]
    // Assert on each block's OWN header. Loose markers are useless here:
    // SYSTEM_BASE already mentions CTA_BUTTONS and FOLLOWUPS in its formatting
    // rules, so `toContain('CTA_BUTTONS')` still passed with the entire CTA
    // block deleted — caught by mutation, 2026-08-10.
    expect(shared).toContain('Ban la TappyAI')                  // SYSTEM_BASE
    expect(shared).toContain('DANH GIA, REVIEW & ANH')          // reviewBlock
    expect(shared).toContain('CTA ACTION BUTTONS - BAT BUOC')   // ctaBlock
    expect(shared).toContain('PHAM VI HOAT DONG')               // scopeBlock
    expect(shared).toContain('AN TOAN & TRUNG THUC')            // safetyBlock
    // …and the individual guarantees the product is built on.
    expect(shared).toContain('CHONG CHEN LENH')    // prompt-injection guard
    expect(shared).toContain('KHONG BIA')          // anti-fabrication
    expect(shared).toContain('google_rating')      // rating display rules
    expect(shared).toContain('[FOLLOWUPS]')        // follow-up chips the clients parse
    expect(shared).toContain('internal_booking')   // "TappyAI never books" guard
  })

  it('request state lands in the dynamic segment instead of vanishing', () => {
    const byLabel = new Map(VARIANTS)
    expect(byLabel.get('vi / bare')!.dynamic).toContain('THOI GIAN HIEN TAI')
    expect(byLabel.get('vi / memory A')!.dynamic).toContain('Quan 3')
    expect(byLabel.get('vi / prefs')!.dynamic).toContain('SO THICH')
    expect(byLabel.get('vi / gps')!.dynamic).toContain('10.77690')
    expect(byLabel.get('vi / budget')!.dynamic).toContain('BUDGET FILTER')
    expect(byLabel.get('vi / trip')!.dynamic).toContain('[TAPPY_PLAN]')
    expect(byLabel.get('vi / image')!.dynamic).toContain('CAMERA AI MODE')
    expect(byLabel.get('vi / offline')!.dynamic).toContain('CUA HANG VAT LY')
    expect(byLabel.get('en / bare')!.dynamic).toContain('LANGUAGE OVERRIDE')
    // This line used to assert the OPPOSITE for Vietnamese — that it received no override — which
    // is precisely the defect that shipped: production answered Vietnamese messages in English
    // because Vietnamese was the one language the prompt never named (2026-08-15). The override is
    // now emitted for every language; what this test is actually about is that it lands in
    // `dynamic` rather than `shared`, and that still holds.
    expect(byLabel.get('vi / bare')!.dynamic).toContain('LANGUAGE OVERRIDE')
    expect(byLabel.get('vi / bare')!.dynamic).toContain('User is writing in Vietnamese.')
    expect(byLabel.get('vi / bare')!.shared).not.toContain('LANGUAGE OVERRIDE')
  })

  it('the language override still precedes every request-shaped block', () => {
    // It used to sit at byte 0 of the whole prompt. It must stay ahead of the
    // clock, memory and mode blocks it is meant to outrank.
    const { dynamic } = buildSystem(null, 'offline', true, MEM_A, 'en', PREFS, GPS, 'trip', true)
    const lang = dynamic.indexOf('LANGUAGE OVERRIDE')
    expect(lang).toBeGreaterThanOrEqual(0)
    for (const later of ['THOI GIAN HIEN TAI', 'THONG TIN VE USER', 'CHẾ ĐỘ LÊN KẾ HOẠCH', 'CAMERA AI MODE']) {
      expect(dynamic.indexOf(later), `${later} must come after the override`).toBeGreaterThan(lang)
    }
  })

  it('the decision-flow rule lives in the rulebook, and only once', () => {
    const { shared } = VARIANTS[0][1]
    expect(shared).toContain('QUYET DINH TRA LOI THE NAO')   // R7, consolidated in C2
    expect(shared).toContain('TOI DA MOT cau hoi')            // the one-question ceiling
    // R7 was replaced, not stacked on: the old wording must be gone.
    expect(shared).not.toContain('HOI LAM RO khi that su can')
    expect(shared.split('QUYET DINH TRA LOI THE NAO')).toHaveLength(2)
  })

  it('the per-turn decision stage stays OUT of the cached rulebook', () => {
    // Stage is request-shaped. In `shared` it would break the byte-stability the
    // 10,680-token cache depends on.
    const stages = ['refinement', 'comparison', 'confirmation'] as const
    const base = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)
    for (const stage of stages) {
      const built = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, stage)
      expect(built.shared, `stage "${stage}" leaked into shared`).toBe(base.shared)
    }
    expect(buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'refinement').dynamic)
      .toContain('GIAI DOAN: DIEU CHINH')
    expect(buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'comparison').dynamic)
      .toContain('GIAI DOAN: SO SANH')
    expect(buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'confirmation').dynamic)
      .toContain('GIAI DOAN: XAC NHAN')
    expect(base.dynamic).not.toContain('GIAI DOAN:')
  })

  it('a refinement turn is told to keep the current task and not re-ask', () => {
    const { dynamic } = buildSystem(null, 'unknown', false, '', 'vi', '', null, null, false, 'refinement')
    expect(dynamic).toContain('KHONG PHAI YEU CAU MOI')
    expect(dynamic).toContain('GIU NGUYEN')
    expect(dynamic).toContain('TUYET DOI KHONG hoi lai')
    // C2.1: the failure was not "two questions", it was asking INSTEAD of
    // answering — a refinement already has task + place + new constraint, so it
    // must lead with options and put any leftover question last.
    expect(dynamic).toContain('DA DU THONG TIN DE TRA LOI')
    expect(dynamic).toContain('TUYET DOI KHONG mo dau bang cau hoi')
  })

  it('the rulebook is the bulk of the prompt — otherwise the split earns nothing', () => {
    const { shared, dynamic } = VARIANTS[0][1]
    expect(shared.length).toBeGreaterThan(20_000)
    expect(shared.length).toBeGreaterThan(dynamic.length * 10)
  })
})
