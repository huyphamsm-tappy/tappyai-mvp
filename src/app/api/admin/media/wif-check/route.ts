// GET /api/admin/media/wif-check — does this deployment have production GCS
// write authority?
//
// The media bridge is fail-closed, so while MEDIA_PROVIDER=blob nothing
// exercises the credential chain. Without this, the first evidence that
// federation works (or doesn't) would arrive after the flag was flipped, with
// every new upload failing. This answers the question before the switch, and
// stays useful afterwards whenever the WIF or bucket configuration changes.
//
// It is read-only and non-mutating: it opens a resumable upload session and
// never PUTs to it, which leaves no object behind. It returns a stage, not a
// credential — no OIDC token, no impersonated access token, no session URI.
//
// Authorization reuses the permission that already governs media uploads. No
// new permission, no new role.

import { NextRequest, NextResponse } from 'next/server'
import { adminErrorResponse, adminError, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { rateLimit } from '@/lib/security/rateLimit'
import { checkWifHealth } from '@/lib/media/wifHealth'
import { createGcsProvider } from '@/lib/media/providers/gcs'
import { createWifTokenSource, readDeploymentOidcToken } from '@/lib/media/gcpAuth'

export async function GET(req: NextRequest) {
  try {
    const { user } = await requirePermission(req, PERMISSIONS.COMMERCE_DEALS_UPLOAD_MEDIA)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    // Each call costs two Google round-trips; keep it well away from a loop.
    if (!rateLimit(`admin:media:wif-check:${user.id}`, 10, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const env = process.env
    const bucket = env.GCS_MEDIA_BUCKET ?? 'tappyai-media-prod'

    // Built explicitly rather than via getMediaProvider(): the whole point is to
    // test the GCS chain regardless of which provider is currently active.
    const provider = createGcsProvider({
      bucket,
      getAccessToken: createWifTokenSource({
        config: {
          projectNumber: env.GCP_PROJECT_NUMBER ?? '1023373437508',
          poolId: env.GCP_WIF_POOL ?? 'vercel-oidc',
          providerId: env.GCP_WIF_PROVIDER ?? 'vercel',
          serviceAccountEmail:
            env.GCP_MEDIA_SERVICE_ACCOUNT ??
            'tappyai-media-bridge@aerobic-lock-498409-u7.iam.gserviceaccount.com',
        },
        getOidcToken: () => readDeploymentOidcToken(req, env),
      }),
    })

    const result = await checkWifHealth({
      bucket,
      getOidcToken: () => env.VERCEL_OIDC_TOKEN ?? null,
      createUploadSession: (r) => provider.createUploadSession!(r),
    })

    // The active provider is reported too, so an operator can tell a healthy
    // chain apart from a chain that is healthy AND already carrying traffic.
    return NextResponse.json(
      { ...result, activeProvider: env.MEDIA_PROVIDER === 'gcs' ? 'gcs' : 'blob' },
      { status: result.ok ? 200 : 503 }
    )
  } catch (err) {
    return adminErrorResponse(err)
  }
}
