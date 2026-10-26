// ── Wave 3 · W4 · a deterministic calculator for the consult model (CONSULT_DETERMINISTIC_MATH) ─────────────────────────────────────────────
//
// The model used to do money arithmetic in its head (or ask a web search to) and was off by a few thousand dong on an instalment. This module evaluates ONE arithmetic expression exactly
// (decimal numbers held as BigInt / 10^scale, so money never meets binary floating point) with a hand-written recursive-descent parser. There is NO eval, NO Function, NO vm and NO property
// lookup by user text: the only names that exist are the constants and functions listed in FUNCTIONS below, looked up in a Map.
//
// Grammar (lowest to highest precedence): additive (+ -)  <  multiplicative (* / and the signs × ÷)  <  unary sign  <  power (^, right-associative, the exponent may carry a sign)  <  postfix percent (x% = x/100)  <  primary.
// There is no implicit multiplication and no modulo. Decimal point is "." only; a thousands separator or a decimal comma is refused with a message that says so.
//
// Exact: + - * and integer powers; division and fractional results are carried to 30 decimals, then rounded half away from zero. Float-backed (about 15 significant digits, stated in the result):
// a non-integer exponent, sqrt, ln, exp.

export type CalcErrorCode = 'empty' | 'too_long' | 'invalid_character' | 'bad_number' | 'syntax' | 'unknown_name' | 'bad_arguments' | 'division_by_zero' | 'too_large' | 'too_complex' | 'not_finite'

export interface CalcOk {
  ok: true
  expression: string
  /** The exact result, dot as the decimal point, trailing zeros trimmed (at most 30 decimals). */
  value: string
  /** The result rounded half away from zero to a whole number (VND). */
  rounded: string
  /** The result rounded half away from zero to 2 decimals. */
  rounded_2: string
  /** True when a float-backed function took part (non-integer power, sqrt, ln, exp): then the value is exact only to about 15 significant digits. */
  approximate: boolean
  /** Every function call and operation that was evaluated, in order (at most 40). */
  steps: string[]
  /** The distinct number literals the expression used (at most 40). */
  inputs: string[]
}
export interface CalcErr { ok: false; error: CalcErrorCode; message: string }
export type CalcResult = CalcOk | CalcErr

export const CALC_LIMITS = { maxChars: 400, maxDepth: 30, maxOps: 300, maxDigits: 40, maxResultDigits: 160, maxArgs: 60, maxIntPow: 1000, decimals: 30, carry: 60, maxSteps: 40 } as const

// ── decimals ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface Dec { n: bigint; s: number } // value = n / 10^s, s >= 0
class CalcError extends Error { constructor(readonly code: CalcErrorCode, message: string) { super(message) } }
const fail = (code: CalcErrorCode, message: string): never => { throw new CalcError(code, message) }

// The build targets ES2017: BigInt LITERALS (1n) do not compile there, the BigInt() function and the operators do.
const B0 = BigInt(0), B1 = BigInt(1), B2 = BigInt(2), B5 = BigInt(5), B12 = BigInt(12), B100 = BigInt(100), TEN = BigInt(10)
const pow10 = (k: number): bigint => TEN ** BigInt(k)
const norm = (d: Dec): Dec => { let { n, s } = d; while (s > 0 && n % TEN === B0) { n /= TEN; s-- } return n === B0 ? { n: B0, s: 0 } : { n, s } }
const digitsOf = (n: bigint): number => (n < B0 ? -n : n).toString().length
const ONE: Dec = { n: B1, s: 0 }
const ZERO: Dec = { n: B0, s: 0 }
const isZero = (d: Dec): boolean => d.n === B0

/** Round half away from zero to `to` decimals (a no-op when the scale is already <= to). */
function roundTo(d: Dec, to: number): Dec {
  if (d.s <= to) return d
  const f = pow10(d.s - to)
  const negative = d.n < B0
  const a = negative ? -d.n : d.n
  let q = a / f
  if ((a % f) * B2 >= f) q += B1
  return norm({ n: negative ? -q : q, s: to })
}
function guard(d: Dec): Dec {
  const r = d.s > CALC_LIMITS.carry ? roundTo(d, CALC_LIMITS.carry) : norm(d)
  if (digitsOf(r.n) - r.s > CALC_LIMITS.maxResultDigits) fail('too_large', 'ket qua qua lon')
  if (digitsOf(r.n) > CALC_LIMITS.maxResultDigits + CALC_LIMITS.carry) fail('too_large', 'ket qua qua lon')
  return r
}
const add = (a: Dec, b: Dec): Dec => { const s = Math.max(a.s, b.s); return guard({ n: a.n * pow10(s - a.s) + b.n * pow10(s - b.s), s }) }
const neg = (a: Dec): Dec => ({ n: -a.n, s: a.s })
const sub = (a: Dec, b: Dec): Dec => add(a, neg(b))
const mul = (a: Dec, b: Dec): Dec => guard({ n: a.n * b.n, s: a.s + b.s })
function div(a: Dec, b: Dec): Dec {
  if (isZero(b)) return fail('division_by_zero', 'chia cho 0')
  const prec = CALC_LIMITS.decimals
  // a/b = (a.n * 10^b.s) / (b.n * 10^a.s); carry prec + 1 digits so the last one can round
  let num = a.n * pow10(b.s + prec + 1)
  let den = b.n * pow10(a.s)
  if (den < B0) { den = -den; num = -num }
  const negative = num < B0
  const absNum = negative ? -num : num
  let q = absNum / den
  const lastDigit = q % TEN
  q /= TEN
  if (lastDigit >= B5) q += B1
  return guard({ n: negative ? -q : q, s: prec })
}
const cmp = (a: Dec, b: Dec): number => { const s = Math.max(a.s, b.s); const x = a.n * pow10(s - a.s); const y = b.n * pow10(s - b.s); return x < y ? -1 : x > y ? 1 : 0 }
const isInt = (d: Dec): boolean => d.s === 0

function toNumber(d: Dec): number { return Number(decToString(d)) }
function fromNumber(x: number): Dec {
  if (!Number.isFinite(x)) return fail('not_finite', 'ket qua khong huu han')
  const t = x.toPrecision(15)
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(t)
  if (!m) return fail('not_finite', 'ket qua khong doc duoc')
  const frac = m[3] ?? ''
  let n = BigInt(`${m[2]}${frac}`)
  let s = frac.length
  const e = m[4] ? Number(m[4]) : 0
  if (e > 0) { if (e >= s) { n *= pow10(e - s); s = 0 } else s -= e } else s += -e
  if (s > CALC_LIMITS.carry * 2) return ZERO
  return guard({ n: m[1] ? -n : n, s })
}
function decToString(d: Dec): string {
  const n = d.n < B0 ? -d.n : d.n
  const sign = d.n < B0 ? '-' : ''
  if (d.s === 0) return `${sign}${n}`
  const str = n.toString().padStart(d.s + 1, '0')
  return `${sign}${str.slice(0, -d.s)}.${str.slice(-d.s)}`
}
const showDec = (d: Dec): string => decToString(roundTo(d, CALC_LIMITS.decimals))

// ── lexer ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Tok = { t: 'num'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string }
function lex(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i
      while (j < src.length && src[j]! >= '0' && src[j]! <= '9') j++
      if (src[j] === '.') { j++; const k = j; while (j < src.length && src[j]! >= '0' && src[j]! <= '9') j++; if (j === k) return fail('bad_number', 'so thap phan phai co chu so sau dau cham') }
      const lit = src.slice(i, j)
      if (lit === '.') return fail('bad_number', 'dau cham dung mot minh')
      if (lit.replace('.', '').length > CALC_LIMITS.maxDigits) return fail('bad_number', `so qua dai (toi da ${CALC_LIMITS.maxDigits} chu so)`)
      // "1,000" (a comma, exactly three digits, no space) reads as a thousands separator, which would silently become two arguments inside a call: refused. Arguments are written with a space after the comma.
      if (/^,\d{3}(?!\d)/.test(src.slice(j))) return fail('bad_number', 'dung dau cham cho so thap phan va KHONG dung dau phan cach hang nghin; giua cac doi so cua ham viet dau phay roi dau cach')
      if (src[j] === '.' ) return fail('bad_number', 'so co hai dau cham')
      out.push({ t: 'num', v: lit.startsWith('.') ? `0${lit}` : lit }); i = j; continue
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let j = i
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) j++
      out.push({ t: 'id', v: src.slice(i, j).toLowerCase() }); i = j; continue
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^' || c === '(' || c === ')' || c === ',' || c === '%') { out.push({ t: 'op', v: c }); i++; continue }
    if (c === '×') { out.push({ t: 'op', v: '*' }); i++; continue }
    if (c === '÷') { out.push({ t: 'op', v: '/' }); i++; continue }
    if (c === '−') { out.push({ t: 'op', v: '-' }); i++; continue }
    return fail('invalid_character', `ky tu khong duoc phep: ${JSON.stringify(c)}`)
  }
  return out
}

// ── functions: the ONLY names the expression can reach ─────────────────────────────────────────────────────────────────────────────────────
interface Ctx { approximate: boolean; steps: string[]; ops: number }
type Fn = (args: Dec[], ctx: Ctx) => Dec
function need(name: string, args: Dec[], min: number, max: number): void {
  if (args.length < min || args.length > max) fail('bad_arguments', `${name} nhan ${min === max ? min : `${min}-${max}`} doi so, nhan duoc ${args.length}`)
}
function powDec(base: Dec, e: Dec, ctx: Ctx): Dec {
  if (isInt(e)) {
    const k = Number(e.n)
    if (Math.abs(k) > CALC_LIMITS.maxIntPow) return fail('too_large', `so mu qua lon (toi da ${CALC_LIMITS.maxIntPow})`)
    if (k === 0) return ONE
    let result = ONE
    let b = base
    let m = Math.abs(k)
    while (m > 0) { if (m & 1) result = mul(result, b); m >>= 1; if (m > 0) b = mul(b, b) }
    return k < 0 ? div(ONE, result) : result
  }
  ctx.approximate = true
  const x = toNumber(base), y = toNumber(e)
  if (x < 0) return fail('not_finite', 'khong luy thua phan so cua so am')
  return fromNumber(Math.pow(x, y))
}
const FUNCTIONS = new Map<string, Fn>([
  ['abs', (a) => { need('abs', a, 1, 1); return a[0]!.n < B0 ? neg(a[0]!) : a[0]! }],
  ['min', (a) => { need('min', a, 1, CALC_LIMITS.maxArgs); return a.reduce((m, x) => (cmp(x, m) < 0 ? x : m)) }],
  ['max', (a) => { need('max', a, 1, CALC_LIMITS.maxArgs); return a.reduce((m, x) => (cmp(x, m) > 0 ? x : m)) }],
  ['sum', (a) => { need('sum', a, 1, CALC_LIMITS.maxArgs); return a.reduce((m, x) => add(m, x), ZERO) }],
  ['avg', (a) => { need('avg', a, 1, CALC_LIMITS.maxArgs); return div(a.reduce((m, x) => add(m, x), ZERO), { n: BigInt(a.length), s: 0 }) }],
  ['round', (a) => {
    need('round', a, 1, 2)
    const d = a[1] ? a[1] : ZERO
    if (!isInt(d) || d.n < B0 || d.n > B12) return fail('bad_arguments', 'round: so chu so thap phan phai la so nguyen tu 0 den 12')
    return roundTo(a[0]!, Number(d.n))
  }],
  ['pow', (a, ctx) => { need('pow', a, 2, 2); return powDec(a[0]!, a[1]!, ctx) }],
  ['sqrt', (a, ctx) => { need('sqrt', a, 1, 1); if (a[0]!.n < B0) return fail('not_finite', 'can bac hai cua so am'); ctx.approximate = true; return fromNumber(Math.sqrt(toNumber(a[0]!))) }],
  ['ln', (a, ctx) => { need('ln', a, 1, 1); if (a[0]!.n <= B0) return fail('not_finite', 'ln cua so khong duong'); ctx.approximate = true; return fromNumber(Math.log(toNumber(a[0]!))) }],
  ['exp', (a, ctx) => { need('exp', a, 1, 1); ctx.approximate = true; return fromNumber(Math.exp(toNumber(a[0]!))) }],
  // pmt(rate, nper, pv, fv = 0): the constant payment at the END of each period that pays off pv (a positive amount borrowed) down to fv. rate is per period, as a fraction (0.01 = 1%).
  ['pmt', (a, ctx) => {
    need('pmt', a, 3, 4)
    const [r, n, pv] = [a[0]!, a[1]!, a[2]!]; const fv = a[3] ?? ZERO
    if (n.n <= B0) return fail('bad_arguments', 'pmt: so ky phai duong')
    if (isZero(r)) return div(sub(pv, fv), n)
    const g = powDec(add(ONE, r), n, ctx)
    if (isZero(sub(g, ONE))) return fail('division_by_zero', 'pmt: lai suat qua nho de tinh')
    return div(mul(sub(mul(pv, g), fv), r), sub(g, ONE))
  }],
  // fv(rate, nper, pmt, pv = 0): value after nper periods of pv invested at the start plus pmt paid at the END of every period (all positive amounts).
  ['fv', (a, ctx) => {
    need('fv', a, 3, 4)
    const [r, n, p] = [a[0]!, a[1]!, a[2]!]; const pv = a[3] ?? ZERO
    if (isZero(r)) return add(pv, mul(p, n))
    const g = powDec(add(ONE, r), n, ctx)
    return add(mul(pv, g), div(mul(p, sub(g, ONE)), r))
  }],
  // pv(rate, nper, pmt, fv = 0): today's value of pmt paid at the END of every period for nper periods plus a lump fv at the end.
  ['pv', (a, ctx) => {
    need('pv', a, 3, 4)
    const [r, n, p] = [a[0]!, a[1]!, a[2]!]; const fv = a[3] ?? ZERO
    if (isZero(r)) return add(mul(p, n), fv)
    const g = powDec(add(ONE, r), n, ctx)
    return add(div(mul(p, sub(g, ONE)), mul(r, g)), div(fv, g))
  }],
  // npv(rate, cf1, cf2, ...): sum of cf_i / (1 + rate)^i with i starting at 1 (add a cash flow of today yourself).
  ['npv', (a, ctx) => {
    need('npv', a, 2, CALC_LIMITS.maxArgs)
    const r1 = add(ONE, a[0]!)
    let total = ZERO
    for (let i = 1; i < a.length; i++) total = add(total, div(a[i]!, powDec(r1, { n: BigInt(i), s: 0 }, ctx)))
    return total
  }],
  // rate_conv(rate, periods): the compound rate over `periods` periods of the same length as `rate`: (1 + rate)^periods - 1 (12 monthly periods -> the effective annual rate).
  ['rate_conv', (a, ctx) => { need('rate_conv', a, 2, 2); return sub(powDec(add(ONE, a[0]!), a[1]!, ctx), ONE) }],
])
export const CALC_FUNCTION_NAMES: readonly string[] = [...FUNCTIONS.keys()]
const CONSTANTS = new Map<string, Dec>([['pi', { n: BigInt('3141592653589793238462643383279'), s: 30 }], ['e', { n: BigInt('2718281828459045235360287471352'), s: 30 }]])

// ── parser + evaluator ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
class Parser {
  private i = 0
  private depth = 0
  readonly inputs: string[] = []
  readonly ctx: Ctx = { approximate: false, steps: [], ops: 0 }
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok | undefined { return this.toks[this.i] }
  private isOp(v: string): boolean { const t = this.peek(); return !!t && t.t === 'op' && t.v === v }
  private eat(v: string): void { if (!this.isOp(v)) fail('syntax', `thieu ${JSON.stringify(v)}`); this.i++ }
  private enter(): void { if (++this.depth > CALC_LIMITS.maxDepth) fail('too_complex', 'bieu thuc long qua sau') }
  private leave(): void { this.depth-- }
  private tick(): void { if (++this.ctx.ops > CALC_LIMITS.maxOps) fail('too_complex', 'bieu thuc co qua nhieu phep tinh') }
  private note(s: string): void { if (this.ctx.steps.length < CALC_LIMITS.maxSteps) this.ctx.steps.push(s) }

  parse(): Dec {
    const v = this.additive()
    if (this.i < this.toks.length) fail('syntax', `khong hieu o ky hieu ${JSON.stringify(this.toks[this.i]!.v)} (khong co phep nhan ngam; dau phay chi ngan cach doi so cua ham)`)
    return v
  }
  private additive(): Dec {
    this.enter()
    let v = this.multiplicative()
    for (;;) {
      if (this.isOp('+')) { this.i++; this.tick(); const r = this.multiplicative(); const o = add(v, r); this.note(`${showDec(v)} + ${showDec(r)} = ${showDec(o)}`); v = o }
      else if (this.isOp('-')) { this.i++; this.tick(); const r = this.multiplicative(); const o = sub(v, r); this.note(`${showDec(v)} - ${showDec(r)} = ${showDec(o)}`); v = o }
      else break
    }
    this.leave()
    return v
  }
  private multiplicative(): Dec {
    let v = this.unary()
    for (;;) {
      if (this.isOp('*')) { this.i++; this.tick(); const r = this.unary(); const o = mul(v, r); this.note(`${showDec(v)} * ${showDec(r)} = ${showDec(o)}`); v = o }
      else if (this.isOp('/')) { this.i++; this.tick(); const r = this.unary(); const o = div(v, r); this.note(`${showDec(v)} / ${showDec(r)} = ${showDec(o)}`); v = o }
      else break
    }
    return v
  }
  private unary(): Dec {
    this.enter()
    try {
      if (this.isOp('-')) { this.i++; return neg(this.unary()) }
      if (this.isOp('+')) { this.i++; return this.unary() }
      return this.power()
    } finally { this.leave() }
  }
  private power(): Dec {
    const base = this.postfix()
    if (this.isOp('^')) {
      this.i++; this.tick()
      const e = this.unary() // right-associative, and the exponent may carry a sign
      const o = powDec(base, e, this.ctx)
      this.note(`${showDec(base)} ^ ${showDec(e)} = ${showDec(o)}`)
      return o
    }
    return base
  }
  private postfix(): Dec {
    let v = this.primary()
    while (this.isOp('%')) { this.i++; this.tick(); v = div(v, { n: B100, s: 0 }) }
    return v
  }
  private primary(): Dec {
    const t = this.peek()
    if (!t) return fail('syntax', 'bieu thuc ket thuc som')
    if (t.t === 'num') {
      this.i++
      if (!this.inputs.includes(t.v) && this.inputs.length < CALC_LIMITS.maxSteps) this.inputs.push(t.v)
      const [ip, fp = ''] = t.v.split('.')
      return norm({ n: BigInt(`${ip}${fp}`), s: fp.length })
    }
    if (t.t === 'op' && t.v === '(') {
      this.i++
      const v = this.additive()
      this.eat(')')
      return v
    }
    if (t.t === 'id') {
      this.i++
      if (this.isOp('(')) {
        const fn = FUNCTIONS.get(t.v)
        if (!fn) return fail('unknown_name', `ham khong ton tai: ${t.v} (ham co: ${CALC_FUNCTION_NAMES.join(', ')})`)
        this.i++
        const args: Dec[] = []
        if (!this.isOp(')')) {
          for (;;) {
            args.push(this.additive())
            if (args.length > CALC_LIMITS.maxArgs) fail('too_complex', 'qua nhieu doi so')
            if (this.isOp(',')) { this.i++; continue }
            break
          }
        }
        this.eat(')')
        this.tick()
        const o = guard(fn(args, this.ctx))
        this.note(`${t.v}(${args.map(showDec).join(', ')}) = ${showDec(o)}`)
        return o
      }
      const c = CONSTANTS.get(t.v)
      if (!c) return fail('unknown_name', `ten khong ton tai: ${t.v} (hang so co: ${[...CONSTANTS.keys()].join(', ')})`)
      return c
    }
    return fail('syntax', `khong hieu o ky hieu ${JSON.stringify(t.v)}`)
  }
}

/**
 * The whole numbers a successful `calculate` result makes evidence for: its value, the value rounded to a whole number, and the result of every step (as whole numbers, rounded half away from zero).
 * Anything that is not a successful calculator result gives []. Pure; reads the plain result object the tool returned (a model or a page cannot add to it: it is built by `calculate` only).
 */
export function calcEvidenceNumbers(result: unknown): number[] {
  const r = result as { _tappy_calc?: unknown; ok?: unknown; value?: unknown; rounded?: unknown; steps?: unknown } | null | undefined
  if (!r || r._tappy_calc !== true || r.ok !== true) return []
  const out = new Set<number>()
  const add = (s: unknown): void => {
    if (typeof s !== 'string' || !/^-?\d+(\.\d+)?$/.test(s)) return
    const n = Math.round(Math.abs(Number(s)))
    if (Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER) out.add(n)
  }
  add(r.value); add(r.rounded)
  if (Array.isArray(r.steps)) for (const st of r.steps.slice(0, CALC_LIMITS.maxSteps)) if (typeof st === 'string') add(st.slice(st.lastIndexOf(' = ') + 3).trim())
  return [...out]
}

/** Amounts below this are structural (a count of months, nights, people; a rate; a percentage), not money a source must state. */
export const STRUCTURAL_BELOW = 10_000

/**
 * Every number a text states, as plain values: grouped integers ("1.200.000", "1,200,000"), plain integers ("890000") and decimals ("1,2", "0.01"), without any unit word (the callers add the unit-aware
 * money amounts of the money guard). Bounded; pure.
 */
export function numbersInText(text: string, max = 2000): number[] {
  const out = new Set<number>()
  for (const m of text.matchAll(/\d+(?:[.,]\d+)*/g)) {
    if (out.size >= max) break
    const raw = m[0]
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) { out.add(Number(raw.replace(/[.,]/g, ''))); continue } // grouped thousands
    const dec = raw.replace(',', '.')
    if (/^\d+(?:\.\d+)?$/.test(dec)) out.add(Number(dec))
    else for (const part of raw.split(/[.,]/)) if (/^\d+$/.test(part)) out.add(Number(part))
  }
  return [...out].filter(n => Number.isFinite(n))
}

/**
 * The whole numbers the turn's calculator results make evidence for - but ONLY a result whose every MONEY-SIZED input literal (>= STRUCTURAL_BELOW) is a number the turn already had: the user's own, a number a
 * tool result stated, or an earlier calculator result of the turn. A calculation is evidence of its arithmetic, never of its inputs: an input the model made up leaves the result unbacked. Small literals
 * (counts, rates, percentages) are structural. Results are taken in order, so a later calculation may use an earlier result.
 */
export function groundedCalcNumbers(results: readonly unknown[], ground: readonly number[]): number[] {
  const known: number[] = [...ground]
  const near = (x: number): boolean => known.some(g => Math.abs(g - x) <= 1)
  const out = new Set<number>()
  for (const r of results) {
    const nums = calcEvidenceNumbers(r)
    if (nums.length === 0) continue
    const inputs = (r as { inputs?: unknown }).inputs
    if (!Array.isArray(inputs)) continue
    const grounded = inputs.length < CALC_LIMITS.maxSteps /* a full list may be cut short: then not all inputs are known */ && inputs.every(s => typeof s === 'string' && /^\d+(\.\d+)?$/.test(s) && (Number(s) < STRUCTURAL_BELOW || near(Number(s))))
    if (!grounded) continue
    for (const n of nums) { out.add(n); known.push(n) }
  }
  return [...out]
}

/** Evaluates one arithmetic expression. Never throws: every refusal is a typed {ok:false}. */
export function calculate(expression: unknown): CalcResult {
  try {
    if (typeof expression !== 'string' || expression.trim() === '') return { ok: false, error: 'empty', message: 'bieu thuc rong' }
    if (expression.length > CALC_LIMITS.maxChars) return { ok: false, error: 'too_long', message: `bieu thuc qua dai (toi da ${CALC_LIMITS.maxChars} ky tu)` }
    const p = new Parser(lex(expression))
    const v = p.parse()
    return {
      ok: true, expression: expression.trim(), value: showDec(v), rounded: decToString(roundTo(v, 0)), rounded_2: decToString(roundTo(v, 2)),
      approximate: p.ctx.approximate, steps: p.ctx.steps, inputs: p.inputs,
    }
  } catch (e) {
    if (e instanceof CalcError) return { ok: false, error: e.code, message: e.message }
    if (e instanceof RangeError) return { ok: false, error: 'too_large', message: 'ket qua qua lon' }
    return { ok: false, error: 'syntax', message: 'bieu thuc khong tinh duoc' }
  }
}
