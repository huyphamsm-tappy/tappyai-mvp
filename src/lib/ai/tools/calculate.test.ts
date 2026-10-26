import { describe, it, expect } from 'vitest'
import { calculate, calcEvidenceNumbers, groundedCalcNumbers, numbersInText, CALC_FUNCTION_NAMES, CALC_LIMITS, type CalcOk } from './calculate'

const ok = (e: string): CalcOk => { const r = calculate(e); if (!r.ok) throw new Error(`expected ok for ${e}: ${r.error} ${r.message}`); return r }
const bad = (e: unknown) => { const r = calculate(e); if (r.ok) throw new Error(`expected a refusal for ${String(e)} but got ${r.value}`); return r }
const num = (e: string): number => Number(ok(e).value)

describe('W4 calculate · exact decimal arithmetic', () => {
  it('money never meets binary floating point', () => {
    expect(ok('0.1 + 0.2').value).toBe('0.3')
    expect(ok('1.1 * 1.1').value).toBe('1.21')
    expect(ok('0.7 + 0.1').value).toBe('0.8')
    expect(ok('4498630 * 12').value).toBe('53983560')
    expect(ok('1000000 * (1 + 0.005) ^ 3').value).toBe('1015075.125')
  })
  it('precedence, signs, power associativity, percent', () => {
    expect(ok('2 + 3 * 4').value).toBe('14')
    expect(ok('(2 + 3) * 4').value).toBe('20')
    expect(ok('-2 ^ 2').value).toBe('-4')
    expect(ok('2 ^ -2').value).toBe('0.25')
    expect(ok('2 ^ 3 ^ 2').value).toBe('512')
    expect(ok('10 - 2 - 3').value).toBe('5')
    expect(ok('100 / 5 / 2').value).toBe('10')
    expect(ok('200 * 15%').value).toBe('30')
    expect(ok('50% + 50%').value).toBe('1')
    expect(ok('3 × 4 ÷ 6 − 1').value).toBe('1')
    expect(ok('  .5 + 0.5 ').value).toBe('1')
  })
  it('division carries 30 decimals and rounds half away from zero; rounded / rounded_2 are for VND and cents', () => {
    expect(ok('1 / 3').value).toBe('0.333333333333333333333333333333')
    expect(ok('2 / 3').value).toBe('0.666666666666666666666666666667')
    expect(ok('10 / 4').value).toBe('2.5')
    const r = ok('1000000 / 3')
    expect(r.rounded).toBe('333333')
    expect(r.rounded_2).toBe('333333.33')
    expect(ok('2.5').rounded).toBe('3')
    expect(ok('-2.5').rounded).toBe('-3')
    expect(ok('0.005').rounded_2).toBe('0.01')
    expect(ok('-0.005').rounded_2).toBe('-0.01')
    expect(ok('round(2.675, 2)').value).toBe('2.68') // decimal, not binary: 2.675 is exactly 2.675 here
    expect(ok('round(1234.5)').value).toBe('1235')
  })
  it('aggregate functions', () => {
    expect(ok('sum(1, 2, 3.5)').value).toBe('6.5')
    expect(ok('avg(1, 2, 4)').rounded_2).toBe('2.33')
    expect(ok('min(3, -1, 2)').value).toBe('-1')
    expect(ok('max(3, -1, 2)').value).toBe('3')
    expect(ok('abs(-7.25)').value).toBe('7.25')
    expect(ok('pow(2, 10)').value).toBe('1024')
  })
  it('records the steps and the literal inputs it used', () => {
    const r = ok('pmt(0.01, 12, 1000) * 12')
    expect(r.steps.some(s => s.startsWith('pmt('))).toBe(true)
    expect(r.inputs).toEqual(['0.01', '12', '1000'])
    expect(r.approximate).toBe(false)
  })
  it('float-backed functions say so', () => {
    expect(ok('sqrt(2)').approximate).toBe(true)
    expect(Math.abs(num('sqrt(2)') - Math.SQRT2)).toBeLessThan(1e-14)
    expect(ok('2 ^ 0.5').approximate).toBe(true)
    expect(Math.abs(num('ln(e)') - 1)).toBeLessThan(1e-12)
    expect(Math.abs(num('exp(1)') - Math.E)).toBeLessThan(1e-12)
    expect(ok('2 ^ 10').approximate).toBe(false)
  })
})

// ── financial functions checked against independent computations ───────────────────────────────────────────────────────────────────────────
describe('W4 calculate · financial functions agree with independent computations', () => {
  /** An amortisation schedule simulated step by step in floating point: after nper payments the balance must be ~0. */
  const balanceAfter = (rate: number, nper: number, pv: number, payment: number): number => { let b = pv; for (let k = 0; k < nper; k++) b = b * (1 + rate) - payment; return b }
  const LOANS: Array<[number, number, number]> = [[0.01, 12, 1000], [0.01, 120, 300_000_000], [0.12 / 12, 240, 1_500_000_000], [0.0075, 36, 85_000_000], [0.02, 6, 12_345_678], [0.0004, 360, 700_000_000]]
  for (const [r, n, pv] of LOANS) {
    it(`pmt(${r}, ${n}, ${pv}) pays the loan off to zero`, () => {
      const p = num(`pmt(${r}, ${n}, ${pv})`)
      expect(Math.abs(balanceAfter(r, n, pv, p))).toBeLessThan(Math.max(1e-6, pv * 1e-9))
      const closed = (pv * r) / (1 - Math.pow(1 + r, -n))
      expect(Math.abs(p - closed) / closed).toBeLessThan(1e-12)
    })
  }
  it('known textbook values', () => {
    expect(ok('pmt(0.01, 12, 1000)').rounded_2).toBe('88.85')
    expect(Math.abs(num('pmt(0.01, 12, 1000)') - 88.8487886783417)).toBeLessThan(1e-9)
    expect(Math.abs(num('fv(0.01, 12, 100)') - 1268.2503013196972)).toBeLessThan(1e-9)
    expect(ok('npv(0.1, 110, 121)').value).toBe('200')
    expect(Math.abs(num('rate_conv(0.01, 12)') - (Math.pow(1.01, 12) - 1))).toBeLessThan(1e-12)
  })
  it('zero rate, and pv / pmt / fv are inverse to each other', () => {
    expect(ok('pmt(0, 10, 1000)').value).toBe('100')
    expect(ok('fv(0, 10, 100, 50)').value).toBe('1050')
    expect(ok('pv(0, 10, 100, 50)').value).toBe('1050')
    for (const [r, n, p] of [[0.01, 12, 500], [0.005, 60, 3_000_000], [0.03, 8, 77]] as const) {
      const back = num(`pmt(${r}, ${n}, pv(${r}, ${n}, ${p}))`)
      expect(Math.abs(back - p) / p).toBeLessThan(1e-12)
    }
    expect(Math.abs(num('pmt(0.01, 12, 1000, 200)') - ((1000 * Math.pow(1.01, 12) - 200) * 0.01) / (Math.pow(1.01, 12) - 1))).toBeLessThan(1e-9)
  })
})

// ── an independent exact evaluator (rational numbers, gcd) checks + - * on random trees ────────────────────────────────────────────────────
describe('W4 calculate · random + - * trees equal an independent rational evaluation, exactly', () => {
  let seed = 20261026
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
  type Q = { n: bigint; d: bigint }
  const Z = BigInt(0), U = BigInt(1), K = BigInt(1000) // the build targets ES2017: no BigInt literals
  const gcd = (a: bigint, b: bigint): bigint => { a = a < Z ? -a : a; b = b < Z ? -b : b; while (b) [a, b] = [b, a % b]; return a || U }
  const q = (n: bigint, d: bigint): Q => { const g = gcd(n, d); return { n: n / g, d: d / g } }
  const qa = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d)
  const qs = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d)
  const qm = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d)
  function tree(depth: number): { text: string; v: Q } {
    if (depth === 0 || rnd() < 0.25) {
      const whole = Math.floor(rnd() * 100000), frac = Math.floor(rnd() * 1000), dec = rnd() < 0.6
      return dec ? { text: `${whole}.${String(frac).padStart(3, '0')}`, v: q(BigInt(whole) * K + BigInt(frac), K) } : { text: String(whole), v: q(BigInt(whole), U) }
    }
    const a = tree(depth - 1), b = tree(depth - 1)
    const op = ['+', '-', '*'][Math.floor(rnd() * 3)]!
    return { text: `(${a.text} ${op} ${b.text})`, v: op === '+' ? qa(a.v, b.v) : op === '-' ? qs(a.v, b.v) : qm(a.v, b.v) }
  }
  const render = (v: Q): string => { // v has a power-of-ten denominator here
    const p10 = BigInt(10) ** BigInt(40); const num = (v.n * p10) / v.d; const exact = (v.n * p10) % v.d === Z
    if (!exact) return 'NONTERMINATING'
    const neg = num < Z; const a = neg ? -num : num
    const s = a.toString().padStart(41, '0'); const ip = s.slice(0, -40).replace(/^0+(?=\d)/, ''); const fp = s.slice(-40).replace(/0+$/, '')
    return `${neg && (ip !== '0' || fp) ? '-' : ''}${ip}${fp ? `.${fp}` : ''}`
  }
  it('300 random trees', () => {
    for (let i = 0; i < 300; i++) {
      const t = tree(4)
      const r = calculate(t.text)
      if (!r.ok) throw new Error(`refused ${t.text}: ${r.message}`)
      expect(r.value, t.text).toBe(render(t.v))
    }
  })
})

// ── evidence ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('W4 calculate · what a result is evidence for', () => {
  const res = (e: string) => ({ ...calculate(e), _tappy_calc: true })
  it('calcEvidenceNumbers: the value, the rounded value and every step result, as whole numbers; nothing for a refusal or a forged object', () => {
    const nums = calcEvidenceNumbers(res('1200000 * 3 + 1600000'))
    expect(nums).toEqual(expect.arrayContaining([5200000, 3600000]))
    expect(calcEvidenceNumbers(res('1 / 0'))).toEqual([])
    expect(calcEvidenceNumbers({ ok: true, value: '5200000', rounded: '5200000', steps: [] })).toEqual([]) // no _tappy_calc: not built by the tool
    expect(calcEvidenceNumbers({ _tappy_calc: true, ok: true, value: 'abc', rounded: '12abc', steps: ['x = y'] })).toEqual([])
    expect(calcEvidenceNumbers(null)).toEqual([])
    expect(calcEvidenceNumbers('5200000')).toEqual([])
  })
  it('numbersInText: grouped thousands, plain integers, decimals; no unit words', () => {
    expect(numbersInText('giá 1.200.000đ hoặc 1,200,000 hay 890000 và 1,2 triệu, lãi 0.01')).toEqual(expect.arrayContaining([1200000, 890000, 1.2, 0.01]))
    expect(numbersInText('không có số')).toEqual([])
    expect(numbersInText('1 2 3 '.repeat(5000), 50).length).toBeLessThanOrEqual(50)
  })
  it('groundedCalcNumbers: money-sized inputs must be known; small literals are structural; a later result may build on an earlier one', () => {
    const a = res('1200000 * 3 + 1600000')
    expect(groundedCalcNumbers([a], [1200000, 1600000])).toContain(5200000)
    expect(groundedCalcNumbers([a], [1200000])).toEqual([])              // 1.600.000 was nobody's
    expect(groundedCalcNumbers([a], [])).toEqual([])
    expect(groundedCalcNumbers([res('pmt(0.01, 120, 300000000)')], [300000000]).length).toBeGreaterThan(0) // rate and months are structural
    expect(groundedCalcNumbers([res('pmt(0.01, 120, 300000000)')], [299999999])).not.toEqual([])           // within 1 dong counts as the same number
    expect(groundedCalcNumbers([res('1200000 * 3'), res('3600000 + 1600000')], [1200000, 1600000])).toContain(5200000) // chained
    expect(groundedCalcNumbers([res('3600000 + 1600000'), res('1200000 * 3')], [1200000, 1600000])).not.toContain(5200000) // order matters: the earlier result is not yet known
    expect(groundedCalcNumbers([res('500 + 9999')], [])).toContain(10499) // everything below 10.000 is structural
    expect(groundedCalcNumbers([res('10000 + 1')], [])).toEqual([])        // 10.000 and above is money-sized
    const many = res(Array.from({ length: 45 }, (_, i) => String(i + 1)).join(' + '))
    expect(groundedCalcNumbers([many], [])).toEqual([])                  // a cut-short input list is not trusted
  })
})

// ── refusals ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('W4 calculate · what it refuses (typed, never thrown)', () => {
  it('empty, non-string, too long', () => {
    expect(bad('').error).toBe('empty')
    expect(bad('   ').error).toBe('empty')
    expect(bad(undefined).error).toBe('empty')
    expect(bad(12).error).toBe('empty')
    expect(bad({ toString: () => '1+1' }).error).toBe('empty')
    expect(bad('1+'.repeat(300)).error).toBe('too_long')
  })
  it('code-shaped input is never evaluated', () => {
    for (const e of ['constructor(1)', '__proto__', 'process.exit(1)', 'eval(1)', 'Function(1)', 'this', 'globalThis', 'require("fs")', 'import("x")', '1; 2', '`1`', '$(1)', '1 // 2', 'a=1', '[1]', '{1}', '"1"', "'1'", '1 && 2', '1 | 2', '1 ? 2 : 3', '!1', '1 < 2', '\\x31', 'toString', 'valueOf(1)', 'hasOwnProperty(1)', '__defineGetter__(1)', 'abs.call(1)']) {
      const r = bad(e)
      expect(['invalid_character', 'unknown_name', 'syntax', 'bad_number'], `${e} -> ${r.error}`).toContain(r.error)
    }
  })
  it('names outside the table do not exist, with or without a call; the message lists what does', () => {
    const r = bad('npv2(1)')
    expect(r.error).toBe('unknown_name')
    expect(r.message).toContain('pmt')
    expect(bad('foo').error).toBe('unknown_name')
    expect(bad('Math.max(1, 2)').error).toBe('bad_number')
    expect(CALC_FUNCTION_NAMES).toEqual(expect.arrayContaining(['pmt', 'fv', 'pv', 'npv', 'rate_conv', 'round', 'min', 'max', 'sum', 'avg', 'pow', 'sqrt', 'ln', 'exp', 'abs']))
  })
  it('number shapes: thousands separator, decimal comma, two dots, trailing dot, too many digits', () => {
    expect(bad('1,000,000 * 2').error).toBe('bad_number')
    expect(bad('sum(1,234)').error).toBe('bad_number')
    expect(ok('sum(1, 234)').value).toBe('235')
    expect(ok('max(1,2)').value).toBe('2')
    expect(bad('1,5 + 2').error).toBe('syntax')
    expect(bad('1.2.3').error).toBe('bad_number')
    expect(bad('5.').error).toBe('bad_number')
    expect(bad('9'.repeat(CALC_LIMITS.maxDigits + 1)).error).toBe('bad_number')
    expect(bad('1e5').error).toBe('syntax') // no exponent notation: "1" then the name "e5"
  })
  it('syntax and arguments', () => {
    for (const e of ['1 +', '(1', '1)', '2 3', '2(3)', '()', 'sum(', 'sum(1,', 'sum(1 2)', '* 3', '1 % 2', '1 +* 2']) expect(bad(e).error, e).toBe('syntax')
    expect(bad('pmt(1, 2)').error).toBe('bad_arguments')
    expect(bad('abs(1, 2)').error).toBe('bad_arguments')
    expect(bad('sum()').error).toBe('bad_arguments')
    expect(bad('round(1, 1.5)').error).toBe('bad_arguments')
    expect(bad('round(1, 13)').error).toBe('bad_arguments')
    expect(bad('pmt(0.01, 0, 100)').error).toBe('bad_arguments')
  })
  it('division by zero and non-finite results', () => {
    expect(bad('1 / 0').error).toBe('division_by_zero')
    expect(bad('1 / (2 - 2)').error).toBe('division_by_zero')
    expect(bad('0 ^ -1').error).toBe('division_by_zero')
    expect(bad('sqrt(-1)').error).toBe('not_finite')
    expect(bad('ln(0)').error).toBe('not_finite')
    expect(bad('(-8) ^ 0.5').error).toBe('not_finite')
  })
  it('size and effort limits', () => {
    expect(bad('9 ^ 9 ^ 9').error).toBe('too_large')
    expect(bad('2 ^ 100000').error).toBe('too_large')
    expect(bad('10 ^ 1000').error).toBeDefined()
    expect(bad('('.repeat(CALC_LIMITS.maxDepth + 5) + '1' + ')'.repeat(CALC_LIMITS.maxDepth + 5)).error).toBe('too_complex')
    expect(bad('-'.repeat(CALC_LIMITS.maxDepth + 5) + '1').error).toBe('too_complex')
    expect(bad(Array.from({ length: CALC_LIMITS.maxOps + 20 }, () => '1').join('+')).error).toMatch(/too_complex|too_long/)
    expect(bad(`sum(${Array.from({ length: CALC_LIMITS.maxArgs + 5 }, () => '1').join(', ')})`).error).toMatch(/too_complex|bad_arguments|too_long/)
    expect(bad('1' + '0'.repeat(100) + ' * 1' + '0'.repeat(100) + ' * 1' + '0'.repeat(100)).error).toBe('bad_number')
  })
  it('a huge product is refused as too large, not computed', () => {
    const big = '9'.repeat(39)
    const e = Array.from({ length: 9 }, () => big).join(' * ') // 9 x 39 digits = 351 digits, under the 400-character limit
    expect(e.length).toBeLessThan(CALC_LIMITS.maxChars)
    expect(bad(e).error).toBe('too_large')
  })
  it('FUZZ: 4000 random strings never throw, always give a typed answer, and finish fast', () => {
    const alphabet = '0123456789 .,+-*/^()%abcdefgpmtnvrswqlexoi_$;`"\'\\[]{}<>!&|?:=×÷−'.split('')
    let seed = 7
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    const t0 = Date.now()
    let oks = 0
    for (let i = 0; i < 4000; i++) {
      const len = 1 + Math.floor(rnd() * 60)
      const s = Array.from({ length: len }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('')
      const r = calculate(s)
      if (r.ok) { oks++; expect(typeof r.value).toBe('string'); expect(r.value).toMatch(/^-?\d+(\.\d+)?$/) } else { expect(typeof r.error).toBe('string'); expect(typeof r.message).toBe('string') }
    }
    expect(Date.now() - t0).toBeLessThan(5000)
    expect(oks).toBeGreaterThan(0)
  })
  it('the module never reaches for eval, Function, vm or dynamic property lookup', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync(new URL('./calculate.ts', import.meta.url), 'utf8')
    const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toMatch(/\beval\s*\(/)
    expect(code).not.toMatch(/\bnew\s+Function\b|\bFunction\s*\(/)
    expect(code).not.toMatch(/node:vm|require\(|import\(/)
    expect(code).not.toMatch(/globalThis|process\./)
  })
})
