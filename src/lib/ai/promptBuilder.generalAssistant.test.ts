// @vitest-environment node
// CONSULT_GENERAL_ASSISTANT (Wave 2, default OFF). The legacy scope block of the full rulebook told the model to REFUSE anything outside five areas ("toan hoc, lap trinh, y te, phap luat,
// chinh tri, tin tuc..."), while the Owner principle of 11/10 (scopeCopy.test.ts) is that Tappy answers every kind of question like a general assistant. With the flag ON the block keeps the
// shopping-decision lines and drops the refusal; sensitive topics are answered with care. The safety rules and everything else in the prompt are untouched.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildSystem } from './promptBuilder'
import { consultGeneralAssistantOn } from '@/lib/config/consultFlags'

afterEach(() => { vi.unstubAllEnvs() })
const FLAG = 'CONSULT_GENERAL_ASSISTANT'
const build = (lang = 'vi') => buildSystem(null, 'unknown', true, '', lang, '', null, null, false)
const REFUSAL = [/HAY TU CHOI LICH SU/, /TUYET DOI KHONG tra loi cac cau hoi ngoai pham vi/, /TappyAI CHI ho tro 5 linh vuc/, /NGOAI 5 linh vuc tren/]
const scopeOf = (shared: string) => { const a = shared.indexOf('===== PHAM VI HOAT DONG'); const b = shared.indexOf('===== AN TOAN'); return { before: shared.slice(0, a), scope: shared.slice(a, b), after: shared.slice(b) } }

describe('the flag', () => {
  it('is ON only for exactly "1"', () => {
    for (const v of [undefined, '', '0', 'true', 'on', ' 1', 'yes']) expect(consultGeneralAssistantOn({ [FLAG]: v }), String(v)).toBe(false)
    expect(consultGeneralAssistantOn({ [FLAG]: '1' })).toBe(true)
  })
})

describe('OFF (default): the legacy scope block, unchanged', () => {
  it('unset, "0" and "true" all give the block that refuses topics outside the five areas', () => {
    for (const v of [undefined, '0', 'true']) {
      if (v === undefined) vi.unstubAllEnvs(); else vi.stubEnv(FLAG, v)
      const { scope } = scopeOf(build().shared)
      for (const re of REFUSAL) expect(scope, `flag=${v} ${re}`).toMatch(re)
      expect(scope).toContain('y te, phap luat, chinh tri, tin tuc thoi su quoc te')
    }
  })
})

describe('ON: answer general knowledge, answer sensitive topics with care, keep every safety rule', () => {
  it('no refusal of anything outside the five areas; a direct answer for general knowledge; care for sensitive topics', () => {
    vi.stubEnv(FLAG, '1')
    const { scope } = scopeOf(build().shared)
    for (const re of REFUSAL) expect(scope, String(re)).not.toMatch(re)
    expect(scope).toMatch(/TRA LOI TRUC TIEP nhu mot tro ly tong quat/)
    expect(scope).toMatch(/khong tu choi/)
    expect(scope).toMatch(/NHAY CAM/)
    for (const topic of ['y te', 'phap luat', 'tai chinh', 'chinh tri', 'tin tuc']) expect(scope, topic).toContain(topic)
    expect(scope).toMatch(/VAN TRA LOI, nhung than trong/)
    expect(scope).toMatch(/KHONG dua ket luan chan doan/)
    expect(scope).toMatch(/chua kiem chung duoc/)
  })
  it('the shopping-decision lines survive', () => {
    vi.stubEnv(FLAG, '1')
    const { scope } = scopeOf(build().shared)
    expect(scope).toContain('GIUP QUYET DINH mua')
    expect(scope).toContain('MUA DO CU / DO GIA TRI CAO')
  })
  it('everything else is byte-identical: the part of the shared segment before and after the scope block, and the whole dynamic segment', () => {
    const off = build(); vi.stubEnv(FLAG, '1'); const on = build()
    const a = scopeOf(off.shared), b = scopeOf(on.shared)
    expect(b.before).toBe(a.before)
    expect(b.after).toBe(a.after)
    expect(on.dynamic).toBe(off.dynamic)
    expect(b.scope).not.toBe(a.scope)
  })
  it('the safety rules are still in the prompt', () => {
    vi.stubEnv(FLAG, '1')
    const { after } = scopeOf(build().shared)
    expect(after).toContain('CHONG CHEN LENH')
    expect(after).toContain('KHONG BIA')
    expect(after).toContain('TRUNG THUC')
    expect(after).toContain('QUYET DINH RUI RO CAO')
  })
  it('the shared segment is byte-stable across builds and languages while the flag is ON', () => {
    vi.stubEnv(FLAG, '1')
    expect(build('vi').shared).toBe(build('en').shared)
    expect(build('vi').shared).toBe(build('vi').shared)
  })
})
