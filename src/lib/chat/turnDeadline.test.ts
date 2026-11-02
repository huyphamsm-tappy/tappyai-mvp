// review 02/11: with maxDuration 300 (Deep Research) the answer stream of every other turn still ends at the turn's deadline.
import { describe, it, expect } from 'vitest'
import { turnSignal } from './turnDeadline'

describe('turnSignal', () => {
  it('fires at the deadline counted from the turn\'s start, even when the client stays', async () => {
    const client = new AbortController()
    const s = turnSignal(client.signal, Date.now() - 950, 1000)
    expect(s.aborted).toBe(false)
    await new Promise(r => setTimeout(r, 120))
    expect(s.aborted).toBe(true)
    expect(client.signal.aborted).toBe(false)
  })
  it('fires at once when the client leaves', () => {
    const client = new AbortController()
    const s = turnSignal(client.signal, Date.now(), 60_000)
    client.abort(new Error('gone'))
    expect(s.aborted).toBe(true)
  })
  it('a deadline already past fires almost at once; no client signal is fine', async () => {
    const s = turnSignal(undefined, Date.now() - 200_000, 110_000)
    await new Promise(r => setTimeout(r, 20))
    expect(s.aborted).toBe(true)
  })
})
