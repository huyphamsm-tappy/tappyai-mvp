import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── R-3: a turn that reaches the model is counted by somebody ────────────────────────────────
//
// 🚨 THE DEFECT. `/api/chat` resolves identity, subscription and quota inside one try/catch, and
// the catch proceeds rather than failing the request. That part is deliberate — a transient auth
// blip should not take chat down. The hole was the flag: `quotaMetered = true` was set on the
// line ABOVE the `await consumeAiQuestion(...)`, and `quotaMetered` is the only thing stopping
// the IP-keyed backstop further down from charging the request a second time.
//
// So a throw anywhere between that assignment and the end of the block left the flag true, the
// backstop skipped, and the turn reached the model charged to NOBODY — a metering bypass an
// attacker provokes by making the quota store fail, not a rare accident.
//
// The fix is ordering, not a new refusal: the flag is set once a spend is known to have
// happened. A failure now falls through to the backstop and is metered by IP as the anonymous
// tier — stricter than the tier the user would have had. Chat stays up; the answer stays counted.
//
// Asserted by source shape. The route is ~1500 lines with a streaming model call in the middle;
// standing up the whole handler to prove an ordering property would test the mocks, not the
// route. Each assertion below names the exact line it pins.

const ROUTE = join(__dirname, 'route.ts')
const src = readFileSync(ROUTE, 'utf8')

/** The route text with newlines flattened, so ordering can be matched across lines. */
const flat = src.replace(/\r?\n/g, ' ')

describe('the quota flag is set after the spend, never before', () => {
  it('no `quotaMetered = true` sits directly above a consumeAiQuestion await', () => {
    // The original defect, written exactly as it was. This is the R-3 invariant and it is unchanged.
    expect(flat).not.toMatch(/quotaMetered = true\s+const spend = await consumeAiQuestion/)
    expect(flat).not.toMatch(/quotaMetered = true\s+if \(!isPro && !\(await consumeAiQuestion/)
  })

  it('the anonymous branch, on the spend path, spends first then marks metered', () => {
    // 🔧 EXTENDED 2026-09-24: the anon branch now forks on `quotaExempt` (deterministic-is-free —
    // asserted in the next describe). The R-3 ordering is asserted on the path that DOES spend: the
    // `else`. quotaMetered on the exempt path is set without a spend, which is correct and separate.
    const branch = src.slice(src.indexOf('if (user?.is_anonymous)'), src.indexOf('} else if (user) {'))
    const elseBranch = branch.slice(branch.indexOf('} else {'))
    expect(elseBranch).toContain('const spend = await consumeAiQuestion')
    expect(elseBranch.indexOf('const spend = await consumeAiQuestion')).toBeLessThan(elseBranch.indexOf('quotaMetered = true'))
  })

  it('the signed-in branch marks it inside each outcome, not ahead of the spend', () => {
    // 🔧 EXTENDED 2026-09-24: Pro AND a deterministic/canned turn (quotaExempt) are metered without
    // a spend; the free-model tier is metered only once the spend is ok. The R-3 ordering (metered
    // AFTER the spend, in the else) is preserved.
    expect(flat).toMatch(/if \(isPro \|\| quotaExempt\) \{\s*quotaMetered = true\s*\} else \{\s*const spend = await consumeAiQuestion/)
    expect(flat).toMatch(/\{ status: 429[^}]*\}[^}]*\}\s*\)\s*\}\s*quotaMetered = true/)
  })
})

describe('deterministic (canned) turns are free — 0 quota, and never reach the model', () => {
  // 🔧 ADDED 2026-09-24. Owner principle: a deterministic/canned answer costs 0 quota; quota is spent
  // ONLY when the LLM is called. These assertions pin that the exemption is server-computed, that an
  // exempt turn spends nothing, and that it returns before the single AI.stream() call.
  it('quotaExempt is computed on the SERVER from the turn, never from client input', () => {
    // Derived from `cannedEarly` (a canned reply) and `clarifyGate` (a clarification question), both
    // built in this route from `messages`/`intent` — not from a request body flag, header or query.
    expect(src).toMatch(/let quotaExempt = cannedEarly !== null \|\| clarifyGate !== null/)
    expect(src).not.toMatch(/quotaExempt\s*=\s*(req\b|body\b|searchParams|headers|\.json\()/)
  })

  it('an exempt turn spends nothing — neither exempt branch calls consumeAiQuestion', () => {
    // Anon: the `if (quotaExempt)` arm has no spend; the spend lives only in its `else`.
    const anon = src.slice(src.indexOf('if (user?.is_anonymous)'), src.indexOf('} else if (user) {'))
    const anonExempt = anon.slice(anon.indexOf('if (quotaExempt) {'), anon.indexOf('} else {'))
    expect(anonExempt).not.toContain('consumeAiQuestion')
    // Signed-in: exempt is folded into `if (isPro || quotaExempt)`, whose arm only marks metered.
    expect(flat).toMatch(/if \(isPro \|\| quotaExempt\) \{\s*quotaMetered = true\s*\}/)
  })

  it('an exempt turn returns the canned reply before the single AI.stream() call', () => {
    const cannedReturn = src.indexOf('return cannedDataStreamResponse(canned')
    const modelCall = src.indexOf('result = AI.stream(')
    expect(cannedReturn).toBeGreaterThan(-1)
    expect(modelCall).toBeGreaterThan(-1)
    expect(cannedReturn).toBeLessThan(modelCall)
  })
})

describe('the backstop is what catches a failed resolution', () => {
  it('an unmetered request is still charged to the caller IP', () => {
    const backstop = src.slice(src.indexOf('if (!quotaMetered) {'))
    expect(backstop).toContain('consumeAiQuestion(aiQuotaIdentity(null, clientIp(req)))')
    expect(backstop).toContain('anon_limit_reached')
  })

  it('the backstop runs after the catch, so a thrown resolution reaches it', () => {
    expect(src.indexOf('auth/quota resolution failed')).toBeLessThan(src.indexOf('if (!quotaMetered) {'))
  })

  it('the catch no longer describes the request as unmetered', () => {
    // The old log said "proceeding unmetered", which was accurate and is now wrong.
    expect(src).not.toContain('proceeding unmetered')
    expect(src).toContain('falling back to IP-keyed metering')
  })
})

describe('the age gate is untouched and still fails closed', () => {
  // R-3 is about counting, not about who may reach the model. The gate below the catch is the
  // control that keeps an unidentified caller out, and this change must not have moved it.
  it('still withholds the model when no eligible declaration is present', () => {
    expect(src).toContain('if (!ageGatePassed) {')
    const gate = src.slice(src.indexOf('if (!ageGatePassed) {'))
    expect(gate).toContain('GUEST_AGE_DECLARATION_REQUIRED')
    expect(gate.slice(0, 900)).toContain('status: 403')
  })
})
