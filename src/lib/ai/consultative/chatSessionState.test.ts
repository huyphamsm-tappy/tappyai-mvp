import { describe, it, expect, beforeEach } from 'vitest'
import {
  compactProducts, __resetChatSessionStore, chatSessionKey, loadChatSessionState, nextChatSessionState, readChatSessionId, saveChatSessionState,
} from './chatSessionState'

// No KV in tests → the per-process store (the same code path otherwise).
const env = { ...process.env, KV_REST_API_URL: '', KV_REST_API_TOKEN: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' } as NodeJS.ProcessEnv
const SID = '3f2b8c1e-9a4d-4c7e-8b21-5d6f7a8b9c0d'
const ALICE = 'user-alice', BOB = 'user-bob'

beforeEach(() => __resetChatSessionStore())

describe('readChatSessionId (R14 contract)', () => {
  it('accepts a UUID, normalised to lower case', () => {
    expect(readChatSessionId({ chatSessionId: SID.toUpperCase() })).toBe(SID)
  })
  it('ignores anything else without an error', () => {
    for (const v of [undefined, null, '', 'abc', 42, `${SID}x`, SID.replace(/-/g, ''), { id: SID }]) expect(readChatSessionId({ chatSessionId: v })).toBeNull()
    expect(readChatSessionId(null)).toBeNull()
  })
})

describe('owner-scoped state', () => {
  it('the owner reads back what was saved', async () => {
    await saveChatSessionState(ALICE, SID, { v: 1, domains: ['travel'], known: { diem_den: 'Đà Nẵng' }, pick: 'M Hotel' }, env)
    const s = await loadChatSessionState(ALICE, SID, env)
    expect(s?.known?.diem_den).toBe('Đà Nẵng')
    expect(s?.pick).toBe('M Hotel')
  })
  it("another owner sending the same id gets NOTHING — it reads as a new session", async () => {
    await saveChatSessionState(ALICE, SID, { v: 1, known: { diem_den: 'Đà Nẵng' }, evidence: { placeSearch: { args: { query: 'x' } } } }, env)
    expect(await loadChatSessionState(BOB, SID, env)).toBeNull()
    expect(chatSessionKey(ALICE, SID, env)).not.toBe(chatSessionKey(BOB, SID, env))
  })
  it('the key never contains the raw user id or session id', () => {
    const k = chatSessionKey(ALICE, SID, env)
    expect(k).not.toContain(ALICE)
    expect(k).not.toContain(SID)
  })
  it('no owner or no id → nothing stored, nothing read', async () => {
    expect(await saveChatSessionState(null, SID, { v: 1 }, env)).toBe(false)
    expect(await saveChatSessionState(ALICE, null, { v: 1 }, env)).toBe(false)
    expect(await loadChatSessionState(null, SID, env)).toBeNull()
  })
})

describe('nextChatSessionState', () => {
  it('merges slots, records the stated pick and the shown names', () => {
    const a = nextChatSessionState(null, { domains: ['food'], known: { khu_vuc: 'quận 1' }, replyText: 'x **Mình chọn: Izakaya A** y', presentedNames: ['Izakaya A', 'B'] })
    const b = nextChatSessionState(a, { domains: [], known: { so_nguoi: '2 người' }, replyText: 'no pick here', presentedNames: ['C'] })
    expect(b.domains).toEqual(['food'])
    expect(b.known).toEqual({ khu_vuc: 'quận 1', so_nguoi: '2 người' })
    expect(b.pick).toBe('Izakaya A')
    expect(b.shown).toEqual(['Izakaya A', 'B', 'C'])
  })
})

describe('travel "xem thêm" / "bác" continue from the stored hotels (replay r18 TRAVEL-1/2)', () => {
  it('keeps the hotel search until a new one replaces it', () => {
    const stay = { args: { location: 'Đà Nẵng' }, rows: [{ name: 'M Hotel' }, { name: 'Sala Danang Beach Hotel' }, { name: 'Hanami Hotel' }] }
    const s1 = nextChatSessionState(null, { stay })
    expect(nextChatSessionState(s1, { replyText: 'x' }).stay).toEqual(stay)
    expect(nextChatSessionState(s1, { stay: null }).stay).toBeNull()
  })
  it('only unshown hotels are offered again', async () => {
    const { unshownRows } = await import('./consultTravel')
    const rows = [{ name: 'M Hotel Da Nang' }, { name: 'Sala Danang Beach Hotel' }, { name: 'Hanami Hotel Danang' }, { name: 'Muong Thanh' }]
    expect(unshownRows(rows, ['M Hotel Da Nang', 'Sala Danang Beach Hotel']).map(r => r.name)).toEqual(['Hanami Hotel Danang', 'Muong Thanh'])
  })
})

describe('shopping "xem thêm" / "bác" continue from the stored products (replay SHOP-1/3)', () => {
  it('keeps the product search until a new one replaces it; rows are trimmed', () => {
    const rows = compactProducts([{ title: 'Laptop A', price: '14.740.000 ₫', thumbnail: 'x'.repeat(2000), _tappy_rank: 1 }, { title: 'Laptop B', price: '15.990.000 ₫' }])
    expect(rows).toEqual([{ title: 'Laptop A', price: '14.740.000 ₫' }, { title: 'Laptop B', price: '15.990.000 ₫' }])
    const s1 = nextChatSessionState(null, { products: { query: 'laptop thiết kế', rows } })
    expect(nextChatSessionState(s1, { replyText: 'x' }).products?.rows).toHaveLength(2)
    expect(nextChatSessionState(s1, { products: null }).products).toBeNull()
  })
})
