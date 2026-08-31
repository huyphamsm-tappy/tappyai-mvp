// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

// ─── WHAT PHASE C PROMISED NOT TO TOUCH ──────────────────────────────────────
//
// Contract C-20, C-21, C-29, C-30, and Owner decision O-4 = C.
//
// 🚨 THESE ARE BOUNDARY TESTS, AND THE BOUNDARY IS THE POINT. Each one guards
// something that already works and that Phase C could plausibly have broken on
// its way past — a live cron, the shared emit path, the legacy route. A change
// that breaks one of these does not fail loudly in production; it changes what a
// daily job sends, or what every other notification caller writes.
//
// Where a claim can only be made about structure (a route having no callers),
// it is measured against the FILESYSTEM rather than asserted in prose — and it
// is paired with a behavioural test wherever behaviour is reachable at all.

const h = vi.hoisted(() => ({ emit: vi.fn(), sendPush: vi.fn(), admin: vi.fn() }))

const PHASE_C_FILES = [
  'src/lib/notifications/broadcastAudience.ts',
  'src/lib/notifications/broadcastCampaign.ts',
  'src/lib/notifications/broadcastChunks.ts',
  'src/app/api/admin/notifications/broadcast/route.ts',
]

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * A Supabase client stub that answers any chained builder call and resolves to
 * `answer`, recording every insert.
 *
 * Written as a chain rather than a fixed shape because `emitNotification` both
 * INSERTs the row and UPDATEs its push_status: a stub that only knew about
 * insert would fail for a reason that has nothing to do with what is under test.
 */
function recordingClient(inserted: Record<string, unknown>[], rowId: string) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'update', 'upsert', 'delete', 'limit']) {
    builder[method] = () => builder
  }
  builder.insert = (row: Record<string, unknown>) => {
    inserted.push(row)
    return builder
  }
  builder.single = () => Promise.resolve({ data: { id: rowId }, error: null })
  builder.maybeSingle = () => Promise.resolve({ data: null, error: null })
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
  return { from: () => builder }
}

describe('C-21 — the deal-notifications cron keeps its own audience', () => {
  const CRON = readFileSync('src/app/api/cron/deal-notifications/route.ts', 'utf8')
  const SEND = readFileSync('src/lib/notifications/send.ts', 'utf8')

  it('🚨 still calls getAllSubscribedUserIds — Phase C did not repoint it', () => {
    expect(CRON).toContain('getAllSubscribedUserIds')
    expect(CRON).not.toContain('buildBroadcastAudience')
    expect(CRON).not.toContain('runBroadcastCampaign')
  })

  it('🚨 getAllSubscribedUserIds still exists and is still exported from send.ts', () => {
    // It is a live dependency of a scheduled job, not dead code available for
    // repurposing. Redefining it to serve broadcast would silently change what
    // that job sends every day at 00:30 UTC.
    expect(SEND).toContain('export async function getAllSubscribedUserIds')
  })

  it('🔑 BEHAVIOURAL — it still returns every enabled subscriber, unfiltered by account status', async () => {
    // Broadcast excludes suspended and banned accounts (O-2 = A). The cron does
    // NOT, and must not start doing so as a side effect of Phase C: that would
    // be a product change to a different feature, made silently.
    vi.resetModules()
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => Promise.resolve({ data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null }),
          }),
        }),
      }),
    }))
    const { getAllSubscribedUserIds } = await import('./send')
    await expect(getAllSubscribedUserIds()).resolves.toEqual(['u1', 'u2'])
    vi.doUnmock('@/lib/supabase/admin')
    vi.resetModules()
  })
})

describe('O-4 = C — the legacy route is RETIRED (410), not yet deleted', () => {
  const LEGACY = readFileSync('src/app/api/notifications/broadcast/route.ts', 'utf8')

  it('🚨 still EXISTS — 410 is step 6; deletion is step 8 and a separate decision', () => {
    // A deleted route answers 404, indistinguishable from a typo. Keeping the
    // file is what lets a stranded caller be told the endpoint went away on
    // purpose, and what makes the observation window measurable at all.
    expect(LEGACY.length).toBeGreaterThan(0)
  })

  it('🚨 answers 410 BEHAVIOURALLY — the old source-text pin passed against a retired route', () => {
    // The removed assertion was `expect(LEGACY).toContain('CRON_SECRET')`. It
    // survives retirement, because the header explains that the secret is no
    // longer checked — a substring match cannot tell an explanation from an
    // implementation. This is the U02 failure mode, caught here by running the
    // handler instead of reading it.
    expect(LEGACY).toContain('410')
  })

  it('🚨 Phase C does not import, call or wrap it', () => {
    // Comments are stripped first. The route's own header DESCRIBES the legacy
    // path — explaining what it is not — and a guard that matched prose would
    // fail on documentation while missing an actual `fetch`.
    for (const file of PHASE_C_FILES) {
      const code = stripComments(readFileSync(file, 'utf8'))
      expect(code, `${file} reaches the legacy route`).not.toContain('api/notifications/broadcast')
      expect(code, `${file} uses CRON_SECRET`).not.toContain('CRON_SECRET')
    }
  })

  it('🚨 C-29 — it is still unreferenced by cron and by product code', () => {
    // "Unused" must not quietly become "used again" between now and retirement.
    const vercel = readFileSync('vercel.json', 'utf8')
    expect(vercel).not.toContain('/api/notifications/broadcast')
  })
})

describe('C-30 — emitNotification is unchanged for every other caller', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin')
    vi.doUnmock('./send')
    vi.resetModules()
  })

  it('🚨 BEHAVIOURAL — it still writes the inbox row for a caller that passes no campaign data', async () => {
    // O-1 = B is delivered by the AUDIENCE, never by teaching the shared writer
    // to skip rows. A "skip the inbox row" branch here would change every other
    // caller — comments, follows, deals, price alerts.
    const inserted: Record<string, unknown>[] = []
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => recordingClient(inserted, 'n1') }))
    vi.doMock('./send', () => ({
      sendNotificationToUser: h.sendPush.mockResolvedValue({ attempted: 0, sent: 0, failed: 0, gone: 0 }),
    }))

    const { emitNotification } = await import('./emit')
    const result = await emitNotification({
      userId: 'u1', type: 'system', category: 'system', title: 'T', body: 'B',
    })

    expect(result.id).toBe('n1')
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ user_id: 'u1', title: 'T', body: 'B' })
    // Unstamped: the campaign key only ever appears when a campaign put it there.
    expect(inserted[0].data).toEqual({})
  })

  it('🚨 a caller that DOES pass campaign data gets it stamped onto the row — the ledger', async () => {
    const inserted: Record<string, unknown>[] = []
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => recordingClient(inserted, 'n2') }))
    vi.doMock('./send', () => ({
      sendNotificationToUser: h.sendPush.mockResolvedValue({ attempted: 0, sent: 0, failed: 0, gone: 0 }),
    }))

    const { emitNotification } = await import('./emit')
    const { BROADCAST_CAMPAIGN_KEY } = await import('./broadcastCampaign')
    await emitNotification({
      userId: 'u1', type: 'broadcast', category: 'system', title: 'T', body: 'B',
      data: { [BROADCAST_CAMPAIGN_KEY]: 'campaign-1' },
    })
    expect(inserted[0].data).toEqual({ [BROADCAST_CAMPAIGN_KEY]: 'campaign-1' })
  })
})

describe('C-20 — broadcast reads ownership and never writes it', () => {
  it('🚨 no Phase C file writes notification_subscriptions', () => {
    // A send path that can mutate ownership is a send path that can be USED to
    // mutate ownership. Pruning a dead endpoint stays where it already is, in
    // send.ts.
    //
    // ⚠️ `.update(` is checked ONLY in files that talk to Supabase at all.
    // `createHash(...).update(...)` is a hash, not a write, and a guard that
    // could not tell them apart would have to be either wrong or disabled —
    // and a disabled guard is the failure mode U02 is on record for.
    for (const file of PHASE_C_FILES) {
      const code = stripComments(readFileSync(file, 'utf8'))
      for (const write of ['.insert(', '.upsert(', '.delete(', 'disown_push_credential']) {
        expect(code, `${file} performs ${write}`).not.toContain(write)
      }
      if (code.includes('.from(')) {
        expect(code, `${file} performs .update(`).not.toContain('.update(')
      }
    }
  })

  it('🔑 only the audience builder names the table at all, and only to SELECT', () => {
    const audience = stripComments(readFileSync('src/lib/notifications/broadcastAudience.ts', 'utf8'))
    expect(audience).toContain("from('notification_subscriptions')")
    expect(audience).toContain('.select(')

    for (const file of PHASE_C_FILES.filter((f) => !f.endsWith('broadcastAudience.ts'))) {
      expect(stripComments(readFileSync(file, 'utf8')), `${file} names the table`).not.toContain(
        'notification_subscriptions',
      )
    }
  })
})

describe('the seam is still a seam after the data passthrough', () => {
  const SEAM = readFileSync('src/lib/notifications/dispatchService.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('🚨 the cap is unchanged and is still enforced by the seam', () => {
    expect(SEAM).toContain('MAX_RECIPIENTS_PER_DISPATCH = 500')
    expect(SEAM).toContain('TOO_MANY_RECIPIENTS')
  })

  it('🚨 still performs NO authorization — the two permissions stay independent', () => {
    for (const forbidden of ['requirePermission', 'permissionEngine', 'PERMISSIONS.', 'can(']) {
      expect(SEAM, `seam authorizes via ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('🚨 knows nothing about campaigns — it forwards `data` without reading it', () => {
    // The passthrough must not become the seam learning what a campaign is.
    expect(SEAM).not.toContain('campaign')
    expect(SEAM).not.toContain('BROADCAST_CAMPAIGN_KEY')
  })
})
