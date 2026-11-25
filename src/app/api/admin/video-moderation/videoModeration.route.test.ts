import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminError } from '@/lib/admin/rbac'

// Explore video VID-03: the review desk routes. Who is refused, which permission each action asks for, that the note is required, that a repeated decision is idempotent, that the
// state machine is the database's (the route only ever calls the one decide function), and that nothing private (object keys, bucket) reaches the browser.

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireAdminIdentity: vi.fn(),
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(),
  writeAuditLog: vi.fn(),
  store: {
    listPending: vi.fn(),
    detail: vi.fn(),
    decide: vi.fn(),
  },
  source: null as null | { provider: { id: string; statObject: (k: string) => Promise<{ size: number; contentType: string } | null>; readRange: (k: string, o: number, l: number) => Promise<Uint8Array> }; bucket: string },
}))

vi.mock('@/lib/admin/rbac', async (orig) => ({ ...((await orig()) as Record<string, unknown>), isSameOrigin: h.isSameOrigin }))
vi.mock('@/lib/admin/permissions', async (orig) => ({ ...((await orig()) as Record<string, unknown>), requirePermission: h.requirePermission, requireAdminIdentity: h.requireAdminIdentity }))
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: h.rateLimit }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: h.writeAuditLog }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/media/video/moderationAdminStore', () => ({ supabaseVideoModerationAdminStore: () => h.store }))
vi.mock('@/lib/media/video/sourceStorage', () => ({ getVideoSourceProvider: () => h.source }))

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { GET as LIST } from './route'
import { GET as GET_ONE } from './[id]/route'
import { GET as FRAME } from './[id]/frame/route'
import { POST as DECIDE } from './[id]/decide/route'

const ACTOR = '22222222-2222-2222-2222-222222222222'
const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const ID = '9a1b2c3d-5f49-4c58-9901-2d586e31352d'
const NOTE = 'Checked the six frames and the transcript: nothing wrong.'

const ctx = () => ({ user: { id: ACTOR, email: 'mod@tappyai.com' }, actor: { userId: ACTOR, isOwner: false, roles: ['moderator'], capabilities: [] }, decision: { allowed: true, reason: 'ROLE_GRANT' } })
const detail = (over: Record<string, unknown> = {}) => ({
  asset: { id: ID, ownerId: OWNER, state: 'review_required', moderationState: 'review_required', hasAudio: true, durationMs: 30_000, width: 720, height: 1280, legalHoldUntil: null, updatedAt: '2026-11-05T10:00:00Z' },
  severe: false,
  results: [{ id: 1, kind: 'automated', decision: 'review_required', category: 'violence', confidence: 0.7, reasonCode: 'category_high', priority: 'high', provider: 'openai', model: 'm', policyVersion: 'vmod-1', evidence: { visual: { status: 'analysed', scores: { violence: 0.7 } } }, transcript: 'xin chào', actor: 'service:video-moderation', note: null, createdAt: '2026-11-05T10:00:00Z' }],
  events: [],
  ...over,
})
const url = (p: string) => `https://www.tappyai.com/api/admin/video-moderation${p}`
const list = () => LIST(new Request(url('')))
const one = (id = ID) => GET_ONE(new Request(url(`/${id}`)), { params: { id } })
const frame = (id = ID) => FRAME(new Request(url(`/${id}/frame`)), { params: { id } })
const decide = (body: unknown, id = ID) => DECIDE(new Request(url(`/${id}/decide`), { method: 'POST', body: JSON.stringify(body) }), { params: { id } })
const on = () => vi.stubEnv('EXPLORE_VIDEO_PIPELINE_ENABLED', 'true')

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  on()
  h.requirePermission.mockResolvedValue(ctx())
  h.requireAdminIdentity.mockResolvedValue({ user: ctx().user, actor: ctx().actor })
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 })
  h.store.listPending.mockResolvedValue([{ assetId: ID, priority: 'urgent', severe: true, category: 'sexual/minors', confidence: 0.6, reasonCode: 'severe_category', hasAudio: true, durationMs: 30_000, waitingSince: '2026-11-05T10:00:00Z' }])
  h.store.detail.mockResolvedValue(detail())
  h.store.decide.mockResolvedValue({ state: 'ready', changed: true })
  h.source = { bucket: 'b', provider: { id: 'gcs', statObject: async () => ({ size: 3, contentType: 'image/jpeg' }), readRange: async () => new Uint8Array([0xff, 0xd8, 0xff]) } }
})

describe('🚨 everything is OFF by default', () => {
  it('404 and nothing runs for every route while EXPLORE_VIDEO_PIPELINE_ENABLED is not true', async () => {
    vi.unstubAllEnvs()
    for (const res of [await list(), await one(), await frame(), await decide({ decision: 'approve', note: NOTE })]) expect(res.status).toBe(404)
    expect(h.requirePermission).not.toHaveBeenCalled()
    expect(h.requireAdminIdentity).not.toHaveBeenCalled()
    expect(h.store.listPending).not.toHaveBeenCalled()
    expect(h.store.decide).not.toHaveBeenCalled()
  })
})

describe('the list', () => {
  it('asks for moderation.queue.read and answers the items (urgent ones come first from the store)', async () => {
    const res = await list()
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.MODERATION_QUEUE_READ)
    expect(res.status).toBe(200)
    expect((await res.json()).data[0]).toMatchObject({ assetId: ID, priority: 'urgent', severe: true })
  })
  it('a refused actor gets the denial and nothing is read or audited', async () => {
    h.requirePermission.mockRejectedValueOnce(new AdminError('FORBIDDEN', 'Forbidden', 403))
    expect((await list()).status).toBe(403)
    expect(h.store.listPending).not.toHaveBeenCalled()
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })
  it('audits that it was read: a count, never the items', async () => {
    await list()
    const a = h.writeAuditLog.mock.calls[0][0]
    expect(a).toMatchObject({ action: 'video_moderation.queue_listed', metadata: { returned: 1 } })
    expect(JSON.stringify(a)).not.toContain(ID)
  })
  it('cross-origin 403, rate limit 429, store failure 500 without detail', async () => {
    h.isSameOrigin.mockReturnValueOnce(false)
    expect((await list()).status).toBe(403)
    h.rateLimit.mockResolvedValueOnce({ ok: false, retryAfter: 7 })
    const limited = await list()
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('7')
    h.store.listPending.mockRejectedValueOnce(new Error('row {"secret":1}'))
    const failed = await list()
    expect(failed.status).toBe(500)
    expect(JSON.stringify(await failed.json())).not.toContain('secret')
  })
})

describe('one video with its evidence', () => {
  it('answers state, scores, transcript, history and the frame address; audits the opening', async () => {
    const res = await one()
    expect(res.status).toBe(200)
    const body = (await res.json()).data
    expect(body.asset).toMatchObject({ id: ID, state: 'review_required' })
    expect(body.results[0]).toMatchObject({ transcript: 'xin chào', category: 'violence', policyVersion: 'vmod-1' })
    expect(body.frameUrl).toBe(`/api/admin/video-moderation/${ID}/frame`)
    expect(h.writeAuditLog.mock.calls[0][0]).toMatchObject({ action: 'video_moderation.opened', targetId: ID })
  })
  it('refuses the unauthorised, a malformed id (422) and an unknown video (404)', async () => {
    h.requirePermission.mockRejectedValueOnce(new AdminError('FORBIDDEN', 'Forbidden', 403))
    expect((await one()).status).toBe(403)
    expect((await one('not-a-uuid')).status).toBe(422)
    h.store.detail.mockResolvedValueOnce(null)
    expect((await one()).status).toBe(404)
  })
})

describe('🚨 the frames are served by the server from the private bucket', () => {
  it('streams the sprite sheet as a never-cached image, reading vstg/<owner>/<asset>/frames…jpeg', async () => {
    const read = vi.fn(async () => new Uint8Array([0xff, 0xd8, 0xff]))
    h.source!.provider.readRange = read
    const res = await frame()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]))
    expect(read).toHaveBeenCalledWith(`vstg/${OWNER}/${ID}/frames0000000000.jpeg`, 0, 3)
    expect(h.writeAuditLog.mock.calls[0][0]).toMatchObject({ action: 'video_moderation.frames_viewed' })
  })
  it('only a video in review is served; a missing sheet is 404; no bucket configured is 503; the unauthorised get nothing', async () => {
    h.store.detail.mockResolvedValueOnce(detail({ asset: { ...detail().asset, state: 'published' } }))
    expect((await frame()).status).toBe(404)
    h.source!.provider.statObject = async () => null
    expect((await frame()).status).toBe(404)
    h.source = null
    expect((await frame()).status).toBe(503)
    h.requirePermission.mockRejectedValueOnce(new AdminError('FORBIDDEN', 'Forbidden', 403))
    expect((await frame()).status).toBe(403)
  })
})

describe('🔑 deciding: the permission follows the outcome', () => {
  it('approve asks moderation.report.dismiss, once', async () => {
    await decide({ decision: 'approve', note: NOTE })
    expect(h.requirePermission).toHaveBeenCalledTimes(1)
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.MODERATION_REPORT_DISMISS)
  })
  it('reject asks moderation.content.hide, once', async () => {
    h.store.decide.mockResolvedValueOnce({ state: 'rejected', changed: true })
    await decide({ decision: 'reject', note: NOTE })
    expect(h.requirePermission).toHaveBeenCalledTimes(1)
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.MODERATION_CONTENT_HIDE)
  })
  it('🚨 APPROVING a suspected child-safety case also needs the permission the moderator role is denied; refused, nothing is written', async () => {
    h.store.detail.mockResolvedValue(detail({ severe: true }))
    // ONE permission decision (single-decision-path rule): a suspected child-safety case asks for the stronger permission up front, which the moderator role is denied.
    h.requirePermission.mockRejectedValueOnce(new AdminError('FORBIDDEN', 'Forbidden', 403))
    const res = await decide({ decision: 'approve', note: NOTE })
    expect(res.status).toBe(403)
    expect(h.requirePermission.mock.calls.map((c) => c[1])).toEqual([PERMISSIONS.MODERATION_CONTENT_DELETE])
    expect(h.store.decide).not.toHaveBeenCalled()
  })
  it('approving a suspected child-safety case with the stronger permission goes through', async () => {
    h.store.detail.mockResolvedValue(detail({ severe: true }))
    expect((await decide({ decision: 'approve', note: NOTE })).status).toBe(200)
    expect(h.requirePermission.mock.calls.map((c) => c[1])).toEqual([PERMISSIONS.MODERATION_CONTENT_DELETE])
  })
  it('rejecting a suspected child-safety case needs only the hide permission', async () => {
    h.store.detail.mockResolvedValue(detail({ severe: true }))
    h.store.decide.mockResolvedValueOnce({ state: 'rejected', changed: true })
    expect((await decide({ decision: 'reject', note: NOTE })).status).toBe(200)
    expect(h.requirePermission).toHaveBeenCalledTimes(1)
  })
  it('an actor that is not an admin at all is refused before anything is read', async () => {
    h.requireAdminIdentity.mockRejectedValueOnce(new AdminError('FORBIDDEN', 'Forbidden', 403))
    expect((await decide({ decision: 'approve', note: NOTE })).status).toBe(403)
    expect(h.store.detail).not.toHaveBeenCalled()
    expect(h.store.decide).not.toHaveBeenCalled()
  })
})

describe('deciding: the note is required and the body is strict', () => {
  it.each([
    ['no note', { decision: 'approve' }],
    ['an empty note', { decision: 'approve', note: '' }],
    ['a blank note', { decision: 'reject', note: '      ' }],
    ['a too short note', { decision: 'reject', note: 'ok' }],
    ['a too long note', { decision: 'reject', note: 'x'.repeat(1001) }],
    ['an unknown decision', { decision: 'publish', note: NOTE }],
    ['a smuggled state', { decision: 'approve', note: NOTE, state: 'published' }],
    ['no body', null],
  ])('%s -> 422 and nothing is written', async (_n, body) => {
    const res = await decide(body)
    expect(res.status).toBe(422)
    expect(h.store.decide).not.toHaveBeenCalled()
  })
  it('a malformed id is 422, an unknown video 404', async () => {
    expect((await decide({ decision: 'approve', note: NOTE }, 'nope')).status).toBe(422)
    h.store.detail.mockResolvedValueOnce(null)
    expect((await decide({ decision: 'approve', note: NOTE })).status).toBe(404)
    expect(h.store.decide).not.toHaveBeenCalled()
  })
  it('cross-origin 403 and rate limit 429 before anything else', async () => {
    h.isSameOrigin.mockReturnValueOnce(false)
    expect((await decide({ decision: 'approve', note: NOTE })).status).toBe(403)
    h.rateLimit.mockResolvedValueOnce({ ok: false, retryAfter: 3 })
    expect((await decide({ decision: 'approve', note: NOTE })).status).toBe(429)
    expect(h.store.decide).not.toHaveBeenCalled()
  })
})

describe('deciding: the outcome', () => {
  it('approve: ready, calls the ONE decide function with the actor and the note, audits without the note', async () => {
    const res = await decide({ decision: 'approve', note: `  ${NOTE}  ` })
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ assetId: ID, state: 'ready', changed: true })
    expect(h.store.decide).toHaveBeenCalledWith(ID, 'approve', NOTE, `user:${ACTOR}`)
    const a = h.writeAuditLog.mock.calls[0][0]
    expect(a).toMatchObject({ action: 'video_moderation.approved', targetId: ID, afterState: { state: 'ready' } })
    expect(JSON.stringify(a)).not.toContain('nothing wrong')
  })
  it('reject: rejected', async () => {
    h.store.decide.mockResolvedValueOnce({ state: 'rejected', changed: true })
    const res = await decide({ decision: 'reject', note: NOTE })
    expect((await res.json()).data).toMatchObject({ state: 'rejected', changed: true })
    expect(h.writeAuditLog.mock.calls[0][0]).toMatchObject({ action: 'video_moderation.rejected' })
  })
  it('🚨 idempotent: the SAME decision repeated is 200 changed=false and no second audit entry (the store writes nothing)', async () => {
    h.store.decide.mockResolvedValueOnce({ state: 'ready', changed: false })
    const res = await decide({ decision: 'approve', note: NOTE })
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ state: 'ready', changed: false })
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })
  it('an approved video that has since been published still answers an approve retry with 200', async () => {
    h.store.decide.mockResolvedValueOnce({ state: 'published', changed: false })
    expect((await decide({ decision: 'approve', note: NOTE })).status).toBe(200)
  })
  it('🚨 the OPPOSITE decision after one was made, or a video that is not in review, is 409 and writes nothing', async () => {
    h.store.decide.mockResolvedValueOnce({ state: 'ready', changed: false })
    expect((await decide({ decision: 'reject', note: NOTE })).status).toBe(409)
    h.store.decide.mockResolvedValueOnce({ state: 'moderating', changed: false })
    expect((await decide({ decision: 'approve', note: NOTE })).status).toBe(409)
    h.store.decide.mockResolvedValueOnce({ state: 'rejected', changed: false })
    expect((await decide({ decision: 'approve', note: NOTE })).status).toBe(409)
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })
  it('a database failure is 500 without its message', async () => {
    h.store.decide.mockRejectedValueOnce(new Error('video moderation store: decide failed (23514) row {"x":1}'))
    const res = await decide({ decision: 'approve', note: NOTE })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('23514')
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })
})
