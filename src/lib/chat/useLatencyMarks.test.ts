import { describe, it, expect } from 'vitest'
import { createClientLatencyTracker } from './useLatencyMarks'

describe('C2 browser latency tracker', () => {
  const clock = () => { let t = 0; return { now: () => t, at: (x: number) => { t = x } } }

  it('B-1 records headers, FIRST VISIBLE text, done and reveal-done as separate numbers from submit', () => {
    const c = clock(); const tr = createClientLatencyTracker(c.now)
    c.at(1000); tr.submit()
    c.at(1400); tr.headers()
    c.at(1450); tr.visible('')            // nothing readable yet
    c.at(1460); tr.visible('   \n')       // whitespace is not visible text
    c.at(9000); tr.done()                 // stream finished (a buffered reply: everything arrived at once)
    c.at(9100); tr.visible('Xin')         // first readable characters — the display-only reveal starts here
    c.at(11500); tr.visible('Xin chào, đây là câu trả lời.')
    const rec = tr.finish()!
    expect(rec).toMatchObject({ headers: 400, first_visible_text: 8100, done: 8000, visible_chars_at_first: 3, visible_chars_final: 29, aborted: false })
    expect(rec.reveal_done).toBe(10500)
  })
  it('B-2 a streamed reply shows its first text long before done (the number the user feels)', () => {
    const c = clock(); const tr = createClientLatencyTracker(c.now)
    c.at(0); tr.submit(); c.at(120); tr.headers(); c.at(1300); tr.visible('Chào'); c.at(9000); tr.visible('Chào bạn, đây là…'); c.at(9050); tr.done()
    const rec = tr.finish()!
    expect(rec.first_visible_text).toBe(1300); expect(rec.done).toBe(9050); expect(rec.first_visible_text!).toBeLessThan(rec.done!)
  })
  it('B-3 first visible text is recorded once; later text never moves it; marks outside a turn are ignored; finish resets', () => {
    const c = clock(); const tr = createClientLatencyTracker(c.now)
    tr.visible('ignored'); tr.headers(); tr.done(); expect(tr.finish()).toBeNull()
    c.at(10); tr.submit(); c.at(50); tr.visible('a'); c.at(90); tr.visible('ab'); tr.done(true)
    const rec = tr.finish()!
    expect(rec.first_visible_text).toBe(40); expect(rec.aborted).toBe(true); expect(tr.active()).toBe(false)
  })
  it('B-5 the record must not be closed before the first visible text has been seen: isDone/hasVisible tell the hook when it may close', () => {
    const c = clock(); const tr = createClientLatencyTracker(c.now)
    c.at(0); tr.submit(); expect(tr.isDone()).toBe(false); c.at(50); tr.done()
    expect(tr.isDone()).toBe(true); expect(tr.hasVisible()).toBe(false)   // done, but no text frame rendered yet → hook waits
    c.at(66); tr.visible('Xin chào'); expect(tr.hasVisible()).toBe(true)  // now it may close
    expect(tr.finish()!.first_visible_text).toBe(66)
  })
  it('B-4 a turn that never shows text reports null, not zero', () => {
    const c = clock(); const tr = createClientLatencyTracker(c.now); c.at(5); tr.submit(); c.at(100); tr.done()
    const rec = tr.finish()!; expect(rec.first_visible_text).toBeNull(); expect(rec.headers).toBeNull(); expect(rec.done).toBe(95)
  })
})
