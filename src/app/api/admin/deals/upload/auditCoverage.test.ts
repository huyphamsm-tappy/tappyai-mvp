import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// AUDIT-1 — 01_CONTROLLER_V2_ARCHITECTURE.md §3.3.
//
// §3.3 names this exact route as an open gap, by path:
//
//   "Note one existing gap this closes: origin/main:src/app/api/admin/deals/
//    upload/route.ts is authorized and rate-limited but writes NO audit row."
//
// and states the coverage rule it violates: "PDP denials, owner overrides, auth
// failures, and connector calls all audited — not only successful mutations."
//
// MEASURED before this fix: every other admin mutation route wrote 2–3 audit
// rows; this one wrote zero. It mints a signed, client-direct write into object
// storage — an authorization the audit trail had no record of ever granting.
//
// This does NOT redesign audit infrastructure. It calls the same writeAuditLog
// with the same field shape as deals/route.ts.

const writeAuditLog = vi.fn()
const actor = { userId: 'u1', email: 'a@tappyai.com', isOwner: false, roles: ['admin'], highestRole: 'admin' }
const user = { id: 'u1', email: 'a@tappyai.com' }

let sessionResult: { status: number; body: Record<string, unknown> }
let completeResult: { status: number; body: Record<string, unknown> }
let bodyIsComplete = false
let bodyIsSession = false

vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (...args: unknown[]) => writeAuditLog(...args) }))
vi.mock('@/lib/admin/permissions', () => ({
  requirePermission: async () => ({ user, actor }),
  PERMISSIONS: { COMMERCE_DEALS_UPLOAD_MEDIA: 'commerce.deals.upload_media' },
}))
vi.mock('@/lib/admin/permissions/decisionAudit', () => ({ auditActorRole: () => 'admin' }))
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: async () => ({ ok: true }) }))
vi.mock('@/lib/media', () => ({ getMediaProvider: () => ({ id: 'gcs' }) }))
vi.mock('@/lib/media/uploadRoute', () => ({
  isCreateUploadSessionBody: () => bodyIsSession,
  createUploadSessionResponse: async () => sessionResult,
}))
vi.mock('@/lib/media/uploadCompletion', () => ({
  isCompleteUploadBody: () => bodyIsComplete,
  completeUploadResponse: async () => completeResult,
}))
vi.mock('@/lib/admin/rbac', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/rbac')>()),
  isSameOrigin: () => true,
}))

const { POST } = await import('./route')

function req(body: unknown): NextRequest {
  // The handler's signature is NextRequest, but every property it touches
  // (json(), headers, url) is on the Request surface — the cast is confined to
  // this one builder rather than repeated at each call site.
  return new Request('https://www.tappyai.com/api/admin/deals/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

beforeEach(() => {
  writeAuditLog.mockClear()
  bodyIsSession = false
  bodyIsComplete = false
  sessionResult = { status: 200, body: { provider: 'gcs', key: 'deal-logo/u1/abc.png', url: 'https://x/abc.png' } }
  completeResult = { status: 200, body: { key: 'deal-logo/u1/abc.png', url: 'https://x/abc.png' } }
})

describe('§3.3 — minting an upload session is audited', () => {
  it('writes exactly one audit row naming the object key', async () => {
    bodyIsSession = true
    await POST(req({ kind: 'dealLogo' }))

    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    expect(writeAuditLog.mock.calls[0][0]).toMatchObject({
      action: 'deals.media_upload_authorized',
      targetType: 'deal_media',
      targetId: 'deal-logo/u1/abc.png',
      actorId: 'u1',
      actorEmail: 'a@tappyai.com',
      actorRole: 'admin',
    })
  })

  it('records whether the actor was the Platform Owner', async () => {
    // The Owner reaches this handler through OWNER_BYPASS and may hold no role,
    // so the role field alone cannot tell you who acted — the same reason
    // deals/route.ts carries this metadata.
    bodyIsSession = true
    await POST(req({ kind: 'dealLogo' }))

    expect(writeAuditLog.mock.calls[0][0]).toMatchObject({ metadata: { is_platform_owner: false } })
  })

  it('passes the request, so the audit row carries its origin context', async () => {
    bodyIsSession = true
    await POST(req({ kind: 'dealLogo' }))

    expect(writeAuditLog.mock.calls[0][0].req).toBeDefined()
  })

  it('does NOT audit when the media layer refuses the session', async () => {
    // A refused request granted nothing. Auditing it would put a write that
    // never happened into the trail.
    bodyIsSession = true
    sessionResult = { status: 502, body: { error: 'nope' } }
    await POST(req({ kind: 'dealLogo' }))

    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('§3.3 — completing an upload is audited separately', () => {
  it('writes its own action, distinct from authorising the session', async () => {
    bodyIsComplete = true
    await POST(req({ key: 'deal-logo/u1/abc.png', kind: 'dealLogo' }))

    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    expect(writeAuditLog.mock.calls[0][0]).toMatchObject({
      action: 'deals.media_upload_completed',
      targetType: 'deal_media',
      targetId: 'deal-logo/u1/abc.png',
    })
  })

  it('does NOT audit a failed completion', async () => {
    bodyIsComplete = true
    completeResult = { status: 409, body: { error: 'nope' } }
    await POST(req({ key: 'k', kind: 'dealLogo' }))

    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('the retired protocol path', () => {
  it('audits nothing — it authorizes nothing', async () => {
    // Neither body shape matches: the handler returns 409 UPLOAD_PROTOCOL_RETIRED.
    const res = await POST(req({ junk: true }))

    expect(res.status).toBe(409)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('the response is unaffected by auditing', () => {
  it('still returns the media layer body and status', async () => {
    bodyIsSession = true
    const res = await POST(req({ kind: 'dealLogo' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ key: 'deal-logo/u1/abc.png' })
  })
})
