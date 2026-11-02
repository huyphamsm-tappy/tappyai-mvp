// @vitest-environment node
// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
//
// L2 prototype (closeout round 4): when the client is shown a display-renamed name (luxury), the state stores the SHOWN name in
// pick / shown (what the user read) AND the entity behind it (pickEntity: original name + place_id when a stored row matches;
// shownOriginal: original shown names), so a follow-up can still resolve the same row. Old rows without the new fields stay readable.
import { describe, it, expect } from 'vitest'
import { nextChatSessionState, cleanStoredState, type ChatSessionState } from './chatSessionState'

const ORIG = '**Mình chọn: Hilton Garden Inn Hà Nội** vì gần Hồ Gươm.'
const SHOWN = '**Mình chọn: khách sạn Garden Inn Hà Nội** vì gần Hồ Gươm.'
const ROWS = [{ name: 'Hilton Garden Inn Hà Nội', place_id: 'h1' }, { name: 'Khách sạn Phố Cổ', place_id: 'h2' }]

describe('pickEntity / shownOriginal (L2 prototype)', () => {
  it('a renamed pick stores the shown name AND the entity (original name + place_id)', () => {
    const s = nextChatSessionState(null, { replyText: SHOWN, presentedNames: ['khách sạn Garden Inn Hà Nội'], originalReplyText: ORIG, originalPresentedNames: ['Hilton Garden Inn Hà Nội'], entityRows: ROWS })
    expect(s.pick).toBe('khách sạn Garden Inn Hà Nội')
    expect(s.pickEntity).toEqual({ name: 'Hilton Garden Inn Hà Nội', placeId: 'h1' })
    expect(s.shown).toEqual(['khách sạn Garden Inn Hà Nội'])
    expect(s.shownOriginal).toEqual(['Hilton Garden Inn Hà Nội'])
  })
  it('no rename: no pickEntity, no shownOriginal (the pick IS the entity name)', () => {
    const s = nextChatSessionState(null, { replyText: ORIG, presentedNames: ['Hilton Garden Inn Hà Nội'] })
    expect(s.pick).toBe('Hilton Garden Inn Hà Nội')
    expect(s.pickEntity).toBeUndefined()
    expect(s.shownOriginal).toBeUndefined()
  })
  it('a rename with no matching stored row keeps the original name without a place_id', () => {
    const s = nextChatSessionState(null, { replyText: SHOWN, originalReplyText: ORIG, entityRows: [{ name: 'Khác', place_id: 'x' }] })
    expect(s.pickEntity).toEqual({ name: 'Hilton Garden Inn Hà Nội' })
  })
  it('a later turn without a pick keeps the pick and its entity together; a new unrenamed pick clears the entity', () => {
    const t1 = nextChatSessionState(null, { replyText: SHOWN, originalReplyText: ORIG, entityRows: ROWS })
    const t2 = nextChatSessionState(t1, { replyText: 'Khách sạn này có hồ bơi.' })
    expect([t2.pick, t2.pickEntity]).toEqual(['khách sạn Garden Inn Hà Nội', { name: 'Hilton Garden Inn Hà Nội', placeId: 'h1' }])
    const t3 = nextChatSessionState(t2, { replyText: '**Mình chọn: Khách sạn Phố Cổ** cho đêm mai.' })
    expect([t3.pick, t3.pickEntity]).toEqual(['Khách sạn Phố Cổ', undefined])
    expect(t3.shownOriginal).toEqual(['Hilton Garden Inn Hà Nội'])
  })
  it('an old stored row without the new fields reads and advances unchanged', () => {
    const old = cleanStoredState({ v: 1, pick: 'Phở Hòa Pasteur', shown: ['Phở Hòa Pasteur'] } as ChatSessionState)
    expect(old.pickEntity).toBeUndefined()
    expect(old.shownOriginal).toBeUndefined()
    const next = nextChatSessionState(old, { replyText: 'Quán mở tới 22:00.' })
    expect([next.pick, next.pickEntity, next.shownOriginal]).toEqual(['Phở Hòa Pasteur', undefined, undefined])
  })
  it('round 5: renamed cards keep their originals in the same order; new cards replace both; a turn without cards keeps both', () => {
    const t1 = nextChatSessionState(null, { replyText: SHOWN, cardOrder: ['khách sạn Garden Inn Hà Nội', 'Khách sạn Phố Cổ'], originalCardOrder: ['Hilton Garden Inn Hà Nội', 'Khách sạn Phố Cổ'] })
    expect([t1.cards, t1.cardsOriginal]).toEqual([['khách sạn Garden Inn Hà Nội', 'Khách sạn Phố Cổ'], ['Hilton Garden Inn Hà Nội', 'Khách sạn Phố Cổ']])
    const t2 = nextChatSessionState(t1, { replyText: 'Còn phòng tối nay.' })
    expect(t2.cardsOriginal).toEqual(['Hilton Garden Inn Hà Nội', 'Khách sạn Phố Cổ'])
    const t3 = nextChatSessionState(t2, { replyText: 'x', cardOrder: ['Quán A', 'Quán B'] })
    expect([t3.cards, t3.cardsOriginal]).toEqual([['Quán A', 'Quán B'], undefined])
  })
  it('round 5: unrenamed cards store no originals', () => {
    const s = nextChatSessionState(null, { replyText: 'x', cardOrder: ['Quán A'], originalCardOrder: ['Quán A'] })
    expect(s.cardsOriginal).toBeUndefined()
  })
  it('a stored entity is cleaned on read: link-free name, place_id-shaped id only', () => {
    const s = cleanStoredState({ v: 1, pick: 'x', pickEntity: { name: '[Hilton](https://evil.example/x)', placeId: 'bad id with spaces' }, shownOriginal: ['A https://evil.example/y'] } as ChatSessionState)
    expect(s.pickEntity).toEqual({ name: 'Hilton' })
    expect(s.shownOriginal).toEqual(['A'])
  })
})
