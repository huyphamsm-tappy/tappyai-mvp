import { describe, it, expect } from 'vitest'
import { classifyEmergency } from './emergencyClassifier'
import { EMERGENCY_CASES, NON_EMERGENCY_CASES, ZH_EMERGENCY_CASES, ZH_NON_EMERGENCY_CASES } from './emergencyClassifier.cases'

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

describe('classifyEmergency: Chinese, measured on the labelled Chinese set (in-sample: same hand as the rules)', () => {
  const rows = [...ZH_EMERGENCY_CASES, ...ZH_NON_EMERGENCY_CASES].map(c => ({ c, r: classifyEmergency(c.text) }))
  const tp = rows.filter(x => x.c.expect !== null && x.r.emergency)
  const fn = rows.filter(x => x.c.expect !== null && !x.r.emergency)
  const fp = rows.filter(x => x.c.expect === null && x.r.emergency)
  const precision = tp.length / Math.max(1, tp.length + fp.length)
  const recall = tp.length / Math.max(1, tp.length + fn.length)
  it('has at least 80 Chinese cases with all four kinds, and Traditional and mixed sentences', () => {
    expect(rows.length).toBeGreaterThanOrEqual(80)
    expect(new Set(rows.map(x => x.c.kind)).size).toBe(4)
    expect(rows.filter(x => /[這裡來廚麼著槍綁搶鄰毆電裡請問]/.test(x.c.text)).length).toBeGreaterThanOrEqual(8)
    expect(rows.filter(x => /[ăâđêôơư]/i.test(x.c.text) && /[一-鿿]/.test(x.c.text)).length).toBeGreaterThanOrEqual(3)
  })
  it('prints the numbers (n, precision, recall)', () => {
    console.log(JSON.stringify({ zh: true, n: rows.length, emergencies: ZH_EMERGENCY_CASES.length, others: ZH_NON_EMERGENCY_CASES.length, tp: tp.length, fp: fp.length, fn: fn.length, precision, recall, missed: fn.map(x => x.c.text), falseAlarms: fp.map(x => x.c.text) }))
  })
  it('NEVER fires on a Chinese topic, near miss, idiom or everyday sentence', () => { expect(fp.map(x => x.c.text)).toEqual([]) })
  it('catches the clear Chinese emergencies with the expected category and lang zh (recall at least 0.9)', () => {
    expect(recall).toBeGreaterThanOrEqual(0.9)
    for (const x of tp) { expect(x.r.category, x.c.text).toBe(x.c.expect); if (!/[ăâđêôơưạảãấầẩẫậắằẳẵặẹẻẽếềểễệịỉĩọỏốồổỗộớờởỡợụủứừửữự]/i.test(x.c.text)) expect(x.r.lang, x.c.text).toBe('zh') }
  })
  it('the sentence from the 38-question UAT now fires as trafficking / abduction, in Chinese', () => {
    expect(classifyEmergency('孩子被人带走了，我在河内，怎么办？')).toMatchObject({ emergency: true, category: 'HUMAN_TRAFFICKING', lang: 'zh', reasonCode: 'EMERGENCY_HUMAN_TRAFFICKING' })
  })
  it('🔑 fail-safe: a how-to or definition question about an emergency never fires, a fiction or hypothetical marker wins', () => {
    for (const t of ['着火了怎么报警', '什么是人口贩卖', '如果我家着火了', '电影里我家着火了', '假设我爸爸没有呼吸', '新闻说有人持刀追我']) expect(classifyEmergency(t).emergency, t).toBe(false)
  })
  it('🔑 fail-safe: how-to wording does not silence a person in danger now, but a general how-to or cause question stays quiet', () => {
    expect(classifyEmergency('我家着火了应该怎么逃生').emergency).toBe(true)
    expect(classifyEmergency('一般家里着火了应该怎么逃生').emergency).toBe(false)
    expect(classifyEmergency('我家着火的原因有哪些').emergency).toBe(false)
    // a bare statement about a building with no "mine / here / below me" anchor is not a person asking for help
    for (const t of ['酒店着火了', '房子着火了', '商场起火了']) expect(classifyEmergency(t).emergency, t).toBe(false)
    // the soft guard itself: the incident words match, nobody first-person speaks, a how-to question -> quiet; add "I am here, now" and it fires
    expect(classifyEmergency('有人晕倒了应该怎么办').emergency).toBe(false)
    expect(classifyEmergency('有人晕倒了，我在旁边，应该怎么办').emergency).toBe(true)
  })
  it('Traditional characters read the same as Simplified', () => {
    for (const [a, b] of [['我家着火了', '我家著火了'], ['有人持枪指着我', '有人持槍指著我'], ['我被抢劫了', '我被搶劫了']]) expect(classifyEmergency(a).category).toBe(classifyEmergency(b).category)
  })
  it('a long pasted Chinese text is not an emergency utterance', () => { expect(classifyEmergency('我家着火了，救命！' + '字'.repeat(900)).emergency).toBe(false) })
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
