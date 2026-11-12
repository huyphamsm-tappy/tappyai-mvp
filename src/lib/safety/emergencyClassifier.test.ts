import { describe, it, expect } from 'vitest'
import { classifyEmergency } from './emergencyClassifier'
import { EMERGENCY_CASES, NON_EMERGENCY_CASES } from './emergencyClassifier.cases'

describe('labelled set', () => {
  it('has at least 60 cases, both languages, all four kinds', () => {
    const all = [...EMERGENCY_CASES, ...NON_EMERGENCY_CASES]
    expect(all.length).toBeGreaterThanOrEqual(60)
    expect(new Set(all.map(c => c.kind)).size).toBe(4)
    expect(all.filter(c => /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i.test(c.text)).length).toBeGreaterThan(20)
    expect(all.filter(c => /^[\x00-\x7f]+$/.test(c.text) && /\b(my|the|is|what|how)\b/i.test(c.text)).length).toBeGreaterThan(20)
  })
})

describe('classifyEmergency: measured on the labelled set', () => {
  const rows = [...EMERGENCY_CASES, ...NON_EMERGENCY_CASES].map(c => ({ c, r: classifyEmergency(c.text) }))
  const tp = rows.filter(x => x.c.expect !== null && x.r.emergency)
  const fn = rows.filter(x => x.c.expect !== null && !x.r.emergency)
  const fp = rows.filter(x => x.c.expect === null && x.r.emergency)
  const precision = tp.length / Math.max(1, tp.length + fp.length)
  const recall = tp.length / Math.max(1, tp.length + fn.length)

  it('prints the numbers (n, precision, recall)', () => {
    console.log(JSON.stringify({ n: rows.length, emergencies: EMERGENCY_CASES.length, others: NON_EMERGENCY_CASES.length, tp: tp.length, fp: fp.length, fn: fn.length, precision, recall, missed: fn.map(x => x.c.text), falseAlarms: fp.map(x => x.c.text) }))
  })
  it('NEVER fires on a topic, a near miss or an everyday sentence (err toward not firing)', () => {
    expect(fp.map(x => x.c.text)).toEqual([])
  })
  it('catches the clear emergencies: recall at least 0.9 on this set, and every hit has the expected category', () => {
    expect(recall).toBeGreaterThanOrEqual(0.9)
    for (const x of tp) expect(x.r.category, x.c.text).toBe(x.c.expect)
  })
  it('a hit carries a stable reason code and a non-hit carries none', () => {
    for (const x of rows) {
      if (x.r.emergency) expect(x.r.reasonCode).toMatch(/^EMERGENCY_(MEDICAL|FIRE_RESCUE|CHILD_PROTECTION|HUMAN_TRAFFICKING|POLICE)$/)
      else { expect(x.r.category).toBeNull(); expect(x.r.reasonCode).toBeNull() }
    }
  })
})

describe('classifyEmergency: rules', () => {
  it('a long pasted text is never an emergency utterance', () => {
    expect(classifyEmergency('Nhà tôi đang cháy, giúp với! ' + 'x'.repeat(900)).emergency).toBe(false)
  })
  it('empty, whitespace and non-strings do not throw and do not fire', () => {
    for (const v of ['', '   ', null, undefined, 42 as unknown as string]) expect(classifyEmergency(v as string).emergency).toBe(false)
  })
  it('curly apostrophes and capitals read the same as plain ones', () => {
    expect(classifyEmergency('MY DAD ISN’T BREATHING').emergency).toBe(true)
  })
  it('a Vietnamese "chạy" (run) is never read as "cháy" (fire), with or without accents elsewhere', () => {
    expect(classifyEmergency('Xe tôi đang chạy trên cao tốc').emergency).toBe(false)
    expect(classifyEmergency('nha toi dang chay bo').emergency).toBe(false)
    expect(classifyEmergency('xe toi dang chay tren cao toc').emergency).toBe(false)
  })
  it('a fiction, hypothetical or past marker wins over an emergency phrase', () => {
    expect(classifyEmergency('Nhà tôi đang cháy, giúp với!').emergency).toBe(true)
    expect(classifyEmergency('Nhà tôi đang cháy trong phim').emergency).toBe(false)
    expect(classifyEmergency('Giả sử nhà tôi đang cháy').emergency).toBe(false)
    expect(classifyEmergency('My house is on fire in the game').emergency).toBe(false)
  })
  it('a how-to question without a person who is in danger now stays quiet, but the same words from a person in danger fire', () => {
    expect(classifyEmergency('How do you help someone who is choking?').emergency).toBe(false)
    expect(classifyEmergency('How do I help, my son is choking right now').emergency).toBe(true)
  })
  it('several categories: the more specific protection categories win over medical or police', () => {
    expect(classifyEmergency('Có người đang bắt cóc một đứa trẻ, bé đang bị đánh').category).toBe('HUMAN_TRAFFICKING')
  })
})
