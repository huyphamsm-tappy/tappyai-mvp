import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_CANDIDATES,
  MAX_STATE_BYTES,
  STATE_TTL_SECONDS,
  __setStoreForTests,
  clampState,
  createState,
  isExpired,
  isValidConversationId,
  isWellFormed,
  loadState,
  newConversationId,
  ownerScopeFor,
  saveState,
  type Candidate,
  type ConversationState,
} from './conversationState'

/** In-memory stand-in for Upstash. `fail` simulates the store being down. */
function fakeStore(opts: { fail?: boolean } = {}) {
  const data = new Map<string, string>()
  return {
    data,
    client: {
      async get(k: string) { if (opts.fail) throw new Error('store down'); return data.get(k) ?? null },
      async set(k: string, v: string) { if (opts.fail) throw new Error('store down'); data.set(k, v); return 'OK' },
      async del(k: string) { data.delete(k); return 1 },
    },
  }
}

const ALICE = ownerScopeFor({ userId: 'alice' })
const BOB = ownerScopeFor({ userId: 'bob' })

afterEach(() => __setStoreForTests(null))

describe('owner scoping', () => {
  it('never stores a raw user id', () => {
    expect(ALICE).not.toContain('alice')
    expect(ALICE).toMatch(/^[0-9a-f]{32}$/)
  })

  it('separates authenticated from anonymous identities with the same string', () => {
    // 'u:x' and 'a:x' must not collide — otherwise signing in would inherit
    // someone else's anonymous conversation.
    expect(ownerScopeFor({ userId: 'x' })).not.toBe(ownerScopeFor({ anonId: 'x' }))
  })

  it('yields no scope at all when there is no identity', () => {
    expect(ownerScopeFor({})).toBe('')
  })
})

describe('conversation id', () => {
  it('mints uuids that validate', () => {
    expect(isValidConversationId(newConversationId())).toBe(true)
  })

  it('rejects ids we did not mint, so they never become store keys', () => {
    for (const bad of ['', 'abc', '../../etc/passwd', 'tappy:convstate:*', null, 42, {}]) {
      expect(isValidConversationId(bad)).toBe(false)
    }
  })
})

describe('persistence round trip', () => {
  it('saves and loads for the owner', async () => {
    const { client } = fakeStore()
    __setStoreForTests(client)
    const s = createState(newConversationId(), ALICE)
    s.goal = 'buy a used mac'

    expect(await saveState(s)).toBe(true)
    const back = await loadState(s.conversationId, ALICE)

    expect(back?.goal).toBe('buy a used mac')
  })

  it('refreshes the TTL window on every write', async () => {
    const { client } = fakeStore()
    __setStoreForTests(client)
    const s = createState(newConversationId(), ALICE, 1_000)
    const later = 5_000_000

    await saveState(s, later)
    const back = await loadState(s.conversationId, ALICE, later)

    expect(back?.expiresAt).toBe(later + STATE_TTL_SECONDS * 1000)
  })
})

describe('ownership enforcement — a conversationId alone is not authorisation', () => {
  it('refuses a different authenticated owner', async () => {
    const { client } = fakeStore()
    __setStoreForTests(client)
    const s = createState(newConversationId(), ALICE)
    await saveState(s)

    // Bob knows the id and asks for it directly.
    expect(await loadState(s.conversationId, ALICE)).not.toBeNull()
    expect(await loadState(s.conversationId, BOB)).toBeNull()
  })

  it('refuses one anonymous session reading another', async () => {
    const { client } = fakeStore()
    __setStoreForTests(client)
    const anonA = ownerScopeFor({ anonId: 'anon-a' })
    const anonB = ownerScopeFor({ anonId: 'anon-b' })
    const s = createState(newConversationId(), anonA)
    await saveState(s)

    expect(await loadState(s.conversationId, anonB)).toBeNull()
  })

  it('refuses an empty scope even when the id is real', async () => {
    const { client } = fakeStore()
    __setStoreForTests(client)
    const s = createState(newConversationId(), ALICE)
    await saveState(s)

    expect(await loadState(s.conversationId, '')).toBeNull()
  })
})

describe('safe degradation', () => {
  it('returns null rather than throwing when the store is unreachable', async () => {
    const { client } = fakeStore({ fail: true })
    __setStoreForTests(client)

    await expect(loadState(newConversationId(), ALICE)).resolves.toBeNull()
    await expect(saveState(createState(newConversationId(), ALICE))).resolves.toBe(false)
  })

  it('returns null when no store is configured at all', async () => {
    __setStoreForTests(null)

    expect(await loadState(newConversationId(), ALICE)).toBeNull()
    expect(await saveState(createState(newConversationId(), ALICE))).toBe(false)
  })

  it('ignores expired state instead of serving it', async () => {
    const { client } = fakeStore()
    __setStoreForTests(client)
    const s = createState(newConversationId(), ALICE, 1_000)
    await saveState(s, 1_000)
    const afterTtl = 1_000 + STATE_TTL_SECONDS * 1000 + 1

    expect(await loadState(s.conversationId, ALICE, afterTtl)).toBeNull()
  })

  it('ignores a malformed blob someone wrote into the key', async () => {
    const { data, client } = fakeStore()
    __setStoreForTests(client)
    const id = newConversationId()
    data.set('tappy:convstate:' + id, JSON.stringify({ conversationId: id, nope: true }))

    expect(await loadState(id, ALICE)).toBeNull()
  })

  it('refuses to persist an oversized state', async () => {
    const { client } = fakeStore()
    __setStoreForTests(client)
    const s = createState(newConversationId(), ALICE)
    s.goal = 'x'.repeat(MAX_STATE_BYTES + 1)

    expect(await saveState(s)).toBe(false)
  })
})

describe('bounds', () => {
  it('keeps only the newest candidates', () => {
    const s: ConversationState = createState(newConversationId(), ALICE)
    s.candidates = Array.from({ length: MAX_CANDIDATES + 5 }, (_, i): Candidate => ({
      candidateId: `c${i}`, name: `Place ${i}`, type: 'place', source: 'search_places',
      retrievedAt: 0, facts: {},
    }))

    const out = clampState(s)

    expect(out.candidates).toHaveLength(MAX_CANDIDATES)
    expect(out.candidates.at(-1)!.name).toBe(`Place ${MAX_CANDIDATES + 4}`)
  })
})

describe('shape guards', () => {
  it('accepts a freshly created state and rejects junk', () => {
    expect(isWellFormed(createState(newConversationId(), ALICE))).toBe(true)
    for (const bad of [null, 42, 'x', {}, { conversationId: 'nope' }]) {
      expect(isWellFormed(bad)).toBe(false)
    }
  })

  it('reports expiry against the stored deadline', () => {
    const s = createState(newConversationId(), ALICE, 0)
    expect(isExpired(s, 1)).toBe(false)
    expect(isExpired(s, STATE_TTL_SECONDS * 1000 + 1)).toBe(true)
  })
})
