import { describe, it, expect, vi, beforeEach } from 'vitest'

// Captures the RPC call itself, so the assertions are about what the route ASKED
// the database to do — not merely about it returning 200.
const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1' } as any,
    rpcArgs: null as any,
    rpcName: null as string | null,
    data: false as any,
    error: null as any,
  }
  const supabase: any = {
    rpc: (name: string, args: any) => {
      state.rpcName = name
      state.rpcArgs = args
      return Promise.resolve({ data: state.data, error: state.error })
    },
  }
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase }))
  return { state, getRequestUser }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
import { POST } from './route'

const CREDENTIAL = 'https://fcm.googleapis.com/fcm/send/TEST-DEVICE:APA91bExample'

const post = (body?: unknown) =>
  new Request('http://localhost/api/notifications/subscribe/reconcile', {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: 'u1' }
  h.state.rpcArgs = null
  h.state.rpcName = null
  h.state.data = false
  h.state.error = null
})

describe('POST /api/notifications/subscribe/reconcile', () => {
  it('requires a session', async () => {
    h.state.user = null
    const res = await POST(post({ credential: CREDENTIAL }))
    expect(res.status).toBe(401)
    expect(h.state.rpcName).toBeNull()
  })

  it('🚨 refuses an ANONYMOUS session — 403, and the database is never touched', async () => {
    // An anonymous session is a real auth.users row whose JWT role is
    // `authenticated`, so it passes both `!user` and the function's EXECUTE
    // grant. Allowing it would make this a denial-of-push surface reachable by
    // anyone willing to spend one request minting a visitor identity.
    h.state.user = { id: 'anon-1', is_anonymous: true }
    const res = await POST(post({ credential: CREDENTIAL }))
    expect(res.status).toBe(403)
    expect(h.state.rpcName).toBeNull()
  })

  it('403 rather than 401 for an anonymous caller', async () => {
    // 401 would tell a client to authenticate, and a client that answers by
    // minting another anonymous session loops forever.
    h.state.user = { id: 'anon-1', is_anonymous: true }
    const res = await POST(post({ credential: CREDENTIAL }))
    expect(res.status).not.toBe(401)
    expect(await res.json()).toMatchObject({ error: 'account_required' })
  })

  it('a registered account is not mistaken for an anonymous one', async () => {
    h.state.user = { id: 'u1', is_anonymous: false }
    const res = await POST(post({ credential: CREDENTIAL }))
    expect(res.status).toBe(200)
  })

  it('releases the credential and reports that the caller does not own it', async () => {
    h.state.data = false
    const res = await POST(post({ credential: CREDENTIAL }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mine: false })
    expect(h.state.rpcName).toBe('disown_push_credential')
    expect(h.state.rpcArgs).toEqual({ p_credential: CREDENTIAL })
  })

  it('reports ownership when the credential is already the caller\'s', async () => {
    h.state.data = true
    const res = await POST(post({ credential: CREDENTIAL }))
    expect(await res.json()).toEqual({ mine: true })
  })

  it('🚨 the body cannot name the account — the RPC is given a credential and nothing else', async () => {
    // The obvious attack is to reconcile on somebody else's behalf. Identity
    // comes from the session and the function reads auth.uid() itself, so there
    // is no parameter to point anywhere. Same rule the subscribe route pins.
    await POST(post({ credential: CREDENTIAL, user_id: 'victim', p_user_id: 'victim' }))
    expect(h.state.rpcArgs).toEqual({ p_credential: CREDENTIAL })
    expect(Object.keys(h.state.rpcArgs)).toEqual(['p_credential'])
  })

  it('rejects a malformed credential without touching the database', async () => {
    for (const body of [
      undefined,
      {},
      { credential: '' },
      { credential: '   ' },
      { credential: 123 },
      { credential: null },
      { credential: 'x'.repeat(4097) },
    ]) {
      h.state.rpcName = null
      const res = await POST(post(body))
      expect(res.status, `body=${JSON.stringify(body)}`).toBe(400)
      expect(h.state.rpcName).toBeNull()
    }
  })

  it('trims surrounding whitespace rather than sending a credential that can never match', async () => {
    await POST(post({ credential: `  ${CREDENTIAL}  ` }))
    expect(h.state.rpcArgs).toEqual({ p_credential: CREDENTIAL })
  })

  it('surfaces an RPC failure as 500 instead of answering "not mine"', async () => {
    // Reporting mine:false on a failed call would tell the client it is not
    // subscribed, which is indistinguishable from a real answer and would let a
    // broken deployment look like a working one.
    h.state.error = { code: '42883', message: 'function does not exist' }
    const res = await POST(post({ credential: CREDENTIAL }))
    expect(res.status).toBe(500)
    expect(await res.json()).not.toHaveProperty('mine')
  })

  it('never echoes the credential back to the caller', async () => {
    // The endpoint names one person's browser and is the single input that can
    // silence it. The only thing that leaves this route is a boolean.
    h.state.data = true
    const res = await POST(post({ credential: CREDENTIAL }))
    const text = await res.text()
    expect(text).not.toContain(CREDENTIAL)
    expect(JSON.parse(text)).toEqual({ mine: true })
  })
})

describe('regression — 2026-08-29: one row, and its owner left', () => {
  it('B arriving on A\'s browser is told the truth and is not subscribed for them', async () => {
    // Production held exactly ONE enabled row, owned by A, while the browser was
    // signed in as B. The database releases A's claim; the answer to B is false,
    // never a silent "you are subscribed".
    h.state.user = { id: 'account-B' }
    h.state.data = false

    const res = await POST(post({ credential: CREDENTIAL }))

    expect(h.state.rpcName).toBe('disown_push_credential')
    expect(h.state.rpcArgs).toEqual({ p_credential: CREDENTIAL })
    expect(await res.json()).toEqual({ mine: false })
  })
})
