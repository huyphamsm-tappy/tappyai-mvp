import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── The four post-gate reads must stay PARALLEL, and stay AFTER the gate ─────
//
// Measured on prod 1e6c867: an authenticated tool-free turn showed TTFB 3.6-4.0s
// against 1.0s for the same question anonymously. The gap was four Supabase
// round-trips running one after another before the model was ever called.
//
// Two things can silently undo that, and neither breaks a type or a build:
//   1. someone re-awaits one of the four on its own (back to serial), or
//   2. someone moves the batch above the account-restriction gate, which would
//      make a suspended account pay for memory, calendar, subscription and quota
//      reads — the exact cost route.ts:248 says the ordering exists to avoid.
//
// Source-level assertions because this route has no executable test harness —
// the same mechanism `accountStatus.test.ts` and `accountDeletionParity.test.ts`
// already use to guard it.

const SRC = readFileSync(join(__dirname, 'route.ts'), 'utf8')
/** Source with comments removed — a rule must hold in CODE, not in prose about code. */
const CODE = SRC.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

/** The four reads that were serial and are now batched. */
const BATCHED = [
  'buildChatPromptContext',
  'getUpcomingEvents',
  'subscriptions',
  'countTodayUserMessages',
] as const

/** The single `Promise.all([...])` holding them, extracted for containment checks. */
function batchBlock(): string {
  const start = CODE.indexOf('await Promise.all([')
  expect(start, 'the parallel batch must exist').toBeGreaterThan(-1)
  // Walk brackets so a nested array/call inside the batch cannot end it early.
  let depth = 0
  for (let i = CODE.indexOf('[', start); i < CODE.length; i++) {
    if (CODE[i] === '[') depth++
    else if (CODE[i] === ']') { depth--; if (depth === 0) return CODE.slice(start, i + 1) }
  }
  throw new Error('unterminated Promise.all([')
}

describe('the account-restriction short-circuit still runs FIRST', () => {
  it('awaits getAccountRestriction before the parallel batch starts', () => {
    const gate = CODE.search(/await\s+getAccountRestriction\s*\(\s*supabase\s*,\s*user\.id\s*\)/)
    const batch = CODE.indexOf('await Promise.all([')
    expect(gate, 'the guard call must exist').toBeGreaterThan(-1)
    expect(batch).toBeGreaterThan(-1)
    expect(gate, 'a blocked account must be rejected BEFORE the batch spends reads').toBeLessThan(batch)
  })

  it('returns 403 on restriction.blocked, still between the gate and the batch', () => {
    const gate = CODE.search(/await\s+getAccountRestriction/)
    const four03 = CODE.indexOf('403', gate)
    const batch = CODE.indexOf('await Promise.all([')
    expect(four03).toBeGreaterThan(gate)
    expect(four03, 'the 403 must short-circuit before any batched read').toBeLessThan(batch)
    expect(CODE).toMatch(/if\s*\(\s*restriction\.blocked\s*\)\s*\{[\s\S]{0,400}?403/)
  })

  it('does not put any batched read above the gate', () => {
    const gate = CODE.search(/await\s+getAccountRestriction/)
    for (const name of BATCHED) {
      const first = CODE.indexOf(name)
      if (first === -1) continue
      // An import line may legitimately precede the gate; a CALL may not.
      const callBefore = new RegExp(`${name}\\s*\\(`).exec(CODE.slice(0, gate))
      expect(callBefore, `${name} must not be invoked before the restriction gate`).toBeNull()
    }
  })
})

describe('all four reads still happen, and happen together', () => {
  it.each(BATCHED)('%s is inside the Promise.all batch', (name) => {
    expect(batchBlock(), `${name} must be one of the parallel tasks`).toContain(name)
  })

  it('awaits the batch exactly once — not four separate awaits', () => {
    const block = batchBlock()
    // `getUpcomingEvents` is deliberately exempt: it lives inside the calendar
    // async IIFE, which awaits its own dynamic import and lookup. That await is
    // INSIDE one task, so it runs concurrently with the other three — it does
    // not serialise the batch. The other three must appear as bare expressions.
    for (const name of BATCHED.filter(n => n !== 'getUpcomingEvents')) {
      const serial = new RegExp(`await\\s+${name}\\s*\\(`)
      expect(serial.test(block), `${name} must not be awaited as its own step inside the batch`).toBe(false)
    }
  })

  it('keeps the calendar await inside a task, not at batch level', () => {
    const block = batchBlock()
    // The await is fine; what is not fine is it sitting directly in the array
    // (`await getUpcomingEvents(...)` as an element), which would make the batch
    // wait for calendar before even starting the others.
    expect(block).toMatch(/\(\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]*?await\s+getUpcomingEvents/)
  })

  it('has no second, sequential await of a batched read anywhere in the route', () => {
    // `buildChatPromptContext` and `countTodayUserMessages` are the two that were
    // previously `const x = await f(...)`. Re-introducing that form is the exact
    // regression this guards.
    expect(CODE).not.toMatch(/await\s+buildChatPromptContext\s*\(/)
    expect(CODE).not.toMatch(/await\s+countTodayUserMessages\s*\(/)
  })
})

describe('calendar cannot take the batch down with it', () => {
  it('wraps the calendar task in its own try/catch INSIDE the batch', () => {
    const block = batchBlock()
    const cal = block.indexOf('getUpcomingEvents')
    expect(cal, 'calendar must be in the batch').toBeGreaterThan(-1)
    const around = block.slice(0, cal)
    expect(around, 'calendar needs its own try — a rejection must not reject the batch').toContain('try')
    expect(block.slice(cal), 'and its own catch').toMatch(/catch/)
  })

  it('still only extends the memory block, never replaces it', () => {
    // Order matters: buildMemoryBlock first, calendar appended after. Reversing
    // it would drop the user's stored memory on any turn with calendar events.
    // Anchored to the CALL, not the identifier: `buildMemoryBlock` also appears
    // in the import at the top of the file, and matching that made this
    // comparison trivially true — mutation M6 survived on exactly that.
    const built = CODE.search(/memoryBlock\s*=\s*buildMemoryBlock\s*\(/)
    const appends = [...CODE.matchAll(/memoryBlock\s*=\s*\(\s*memoryBlock\s*\|\|\s*''\s*\)\s*\+/g)]
    expect(built, 'the memory block must actually be built').toBeGreaterThan(-1)
    expect(appends, 'calendar must be appended exactly once').toHaveLength(1)
    expect(appends[0].index, 'calendar must be appended AFTER memory is built').toBeGreaterThan(built)
  })
})

describe('isPro semantics for the quota count are unchanged', () => {
  it('enforces the free cap only when the user is not Pro', () => {
    // The count may now be computed for everyone (it is speculative, off the
    // serial path) — but ENFORCEMENT must still be gated on !isPro.
    expect(CODE).toMatch(/if\s*\(\s*!\s*isPro\s*&&\s*todayMsgCount\s*>=\s*FREE_DAILY_LIMIT\s*\)/)
  })

  it('still derives isPro from an active subscription with a future period end', () => {
    expect(CODE).toMatch(/subData\?\.status\s*===\s*'active'/)
    expect(CODE).toMatch(/isPro\s*=\s*new Date\(subData\.current_period_end\)\s*>\s*new Date\(\)/)
  })

  it('still answers 429 with free_limit_reached', () => {
    expect(CODE).toContain("error: 'free_limit_reached'")
    expect(CODE).toMatch(/status:\s*429/)
  })
})
