import { describe, it, expect } from 'vitest'

// ── Gate 2 L4: the stored card list is POSITIONAL, and `cardsOriginal` stays aligned with it (gate2/l4/L4-ADDENDUM.md) ──
//
// Before: `names()` de-duplicated `cards` and `cardsOriginal` with a Set, each on its own. Two different cards with the same shown
// name (T-a: a luxury rename collision; T-b: two branches of one chain) left the lists shorter / misaligned, so "quán thứ hai" and
// the agent's card facts (position = index in cardsOriginal) pointed at another card than the one the user saw at that position.
// LT-* ids are registered in L4-ADDENDUM.md §5 and L4-DECISIONS.json. Public API only (nextChatSessionState / cleanStoredState), so
// this file loads on the unfixed code (Step 0).

import { nextChatSessionState, cleanStoredState, type ChatSessionState } from './chatSessionState'
import { ordinalVenuesFromContext } from './referenceResolver'
import { cardEvidence } from '@/lib/ai/agent/carriedEvidence'

const TA_SHOWN = ['khách sạn Saigon Centre', 'khách sạn Saigon Centre', 'Khách sạn Phố Cổ']
const TA_ORIG = ['Novotel Saigon Centre', 'Pullman Saigon Centre', 'Khách sạn Phố Cổ']
const TB = ['Highlands Coffee', 'Highlands Coffee', 'Phúc Long']

describe('LT-1 — T-a: two cards renamed to the same shown name', () => {
  it('cards and cardsOriginal keep all three positions, aligned', () => {
    const s = nextChatSessionState(null, { replyText: 'x', cardOrder: TA_SHOWN, originalCardOrder: TA_ORIG })
    expect(s.cards).toEqual(TA_SHOWN)
    expect(s.cardsOriginal).toEqual(TA_ORIG)
  })
})

// LT-1b (L4-DECISIONS-3, added after ML-2 survived): two branches with the SAME original name plus a renamed card -- the originals hold a
// duplicate while the pairs differ, so a de-duplicated `cardsOriginal` would be shorter than `cards` and shift every later position.
describe('LT-1b — mixed: two same-original branches and a renamed card', () => {
  it('cards and cardsOriginal both keep three positions, aligned', () => {
    const shown = ['khách sạn Saigon Centre', 'khách sạn Saigon Centre', 'khách sạn Riverside']
    const original = ['Novotel Saigon Centre', 'Novotel Saigon Centre', 'Pullman Riverside']
    const s = nextChatSessionState(null, { replyText: 'x', cardOrder: shown, originalCardOrder: original })
    expect([s.cards, s.cardsOriginal]).toEqual([shown, original])
  })
})

describe('LT-2 — T-b: two cards with the same name (two branches of one chain), no rename', () => {
  it('cards keep all three positions in order; no originals are stored', () => {
    const s = nextChatSessionState(null, { replyText: 'x', cardOrder: TB })
    expect(s.cards).toEqual(TB)
    expect(s.cardsOriginal).toBeUndefined()
    const same = nextChatSessionState(null, { replyText: 'x', cardOrder: TB, originalCardOrder: TB })
    expect([same.cards, same.cardsOriginal]).toEqual([TB, undefined])
  })
})

describe('LT-3 — reading a stored state cleans the two lists pair by pair', () => {
  it('link-free names, same length, same positions', () => {
    const s = cleanStoredState({ v: 1, cards: ['[Quán A](https://evil.example/x)', 'Quán B', 'Quán B'], cardsOriginal: ['[Pullman A](https://evil.example/x)', 'Novotel B', 'Sofitel B'] } as ChatSessionState)
    expect([s.cards, s.cardsOriginal]).toEqual([['Quán A', 'Quán B', 'Quán B'], ['Pullman A', 'Novotel B', 'Sofitel B']])
  })
  it('a shown name that is only a link drops the WHOLE pair (both lists), on write and on read', () => {
    const w = nextChatSessionState(null, { replyText: 'x', cardOrder: ['https://evil.example/only', 'Quán B'], originalCardOrder: ['Pullman X', 'Novotel B'] })
    expect([w.cards, w.cardsOriginal]).toEqual([['Quán B'], ['Novotel B']])
    const r = cleanStoredState({ v: 1, cards: ['https://evil.example/only', 'Quán B'], cardsOriginal: ['Pullman X', 'Novotel B'] } as ChatSessionState)
    expect([r.cards, r.cardsOriginal]).toEqual([['Quán B'], ['Novotel B']])
  })
})

describe('LT-4 — transition (D-L4-2): a session stored before the fix with misaligned lists', () => {
  it('cardsOriginal of another length is dropped; cards are kept', () => {
    const s = cleanStoredState({ v: 1, cards: ['A', 'B'], cardsOriginal: ['X', 'Y', 'Z'] } as ChatSessionState)
    expect(s.cards).toEqual(['A', 'B'])
    expect(s.cardsOriginal).toBeUndefined()
  })
})

describe('LT-5 — C1: "quán thứ hai" resolves to the SECOND card the user saw', () => {
  it('T-b: the second Highlands branch, not Phúc Long', () => {
    const s = nextChatSessionState(null, { replyText: 'x', cardOrder: TB })
    expect(ordinalVenuesFromContext('Quán thứ hai mở cửa mấy giờ?', s.cards ?? [])).toEqual(['Highlands Coffee'])
    expect(ordinalVenuesFromContext('Quán thứ ba mở cửa mấy giờ?', s.cards ?? [])).toEqual(['Phúc Long'])
  })
})

describe('LT-6 — C3: the agent card facts line up with the numbered cards', () => {
  const now = new Date('2026-10-16T12:00:00Z')
  it('T-a: position 2 is the Pullman row, and the shown list has as many entries as the facts', () => {
    const s = nextChatSessionState(null, { replyText: 'x', cardOrder: TA_SHOWN, originalCardOrder: TA_ORIG })
    const rows = [{ name: 'Novotel Saigon Centre', address: '1 A' }, { name: 'Pullman Saigon Centre', address: '2 B' }, { name: 'Khách sạn Phố Cổ', address: '3 C' }]
    const { facts } = cardEvidence(s.cardsOriginal ?? s.cards ?? [], rows, { now })
    expect((s.cards ?? []).length).toBe(facts.length)
    expect(facts.find(f => f.position === 2)?.address).toBe('2 B')
  })
  it('T-b, KNOWN LIMIT (L4-B backlog): positions are right, but the second same-name card reads the FIRST matching row (match by name)', () => {
    const s = nextChatSessionState(null, { replyText: 'x', cardOrder: TB })
    const rows = [{ name: 'Highlands Coffee', address: '10 X' }, { name: 'Highlands Coffee', address: '20 Y' }, { name: 'Phúc Long', address: '30 Z' }]
    const { facts } = cardEvidence(s.cardsOriginal ?? s.cards ?? [], rows, { now })
    expect(facts.map(f => [f.position, f.address])).toEqual([[1, '10 X'], [2, '10 X'], [3, '30 Z']])
  })
})

describe('LT-9 — control: distinct names behave exactly as before', () => {
  it('renamed distinct cards keep their originals; new cards replace both; a turn without cards keeps both', () => {
    const t1 = nextChatSessionState(null, { replyText: 'x', cardOrder: ['khách sạn Garden Inn Hà Nội', 'Khách sạn Phố Cổ'], originalCardOrder: ['Hilton Garden Inn Hà Nội', 'Khách sạn Phố Cổ'] })
    expect([t1.cards, t1.cardsOriginal]).toEqual([['khách sạn Garden Inn Hà Nội', 'Khách sạn Phố Cổ'], ['Hilton Garden Inn Hà Nội', 'Khách sạn Phố Cổ']])
    const t2 = nextChatSessionState(t1, { replyText: 'Còn phòng tối nay.' })
    expect([t2.cards, t2.cardsOriginal]).toEqual([t1.cards, t1.cardsOriginal])
    const t3 = nextChatSessionState(t2, { replyText: 'x', cardOrder: ['Quán A', 'Quán B'] })
    expect([t3.cards, t3.cardsOriginal]).toEqual([['Quán A', 'Quán B'], undefined])
  })
  it('unrenamed distinct cards store no originals; a stored aligned state reads unchanged', () => {
    expect(nextChatSessionState(null, { replyText: 'x', cardOrder: ['Quán A', 'Quán B'], originalCardOrder: ['Quán A', 'Quán B'] }).cardsOriginal).toBeUndefined()
    const s = cleanStoredState({ v: 1, cards: ['Quán A', 'Quán B'], cardsOriginal: ['Hilton A', 'Quán B'] } as ChatSessionState)
    expect([s.cards, s.cardsOriginal]).toEqual([['Quán A', 'Quán B'], ['Hilton A', 'Quán B']])
  })
})
