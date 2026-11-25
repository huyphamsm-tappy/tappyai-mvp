import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMediaProvider } from '@/lib/media'
import { revokeGoogleToken } from '@/lib/integrations/googleCalendar'
import { processAccountDeletionJobs } from '@/lib/account/deletionJobs'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { accountDeletionSchemaReady } from '@/lib/account/deletionReady'
import { createChatMediaDeleter } from '@/lib/messaging/mediaDeletion'
import { getVideoSourceProvider } from '@/lib/media/video/sourceStorage'
import { createVideoSourceDeleter } from '@/lib/media/video/sourceDeletion'
import { getVideoDeliveryProvider } from '@/lib/media/video/deliveryStorage'
import { createVideoDeliveryDeleter } from '@/lib/media/video/deliveryDeletion'
import { getCdnInvalidator } from '@/lib/media/video/cdnInvalidate'

export const runtime = 'nodejs'
export const maxDuration = 60

// account-deletion-jobs cron — F-096. Deleting an account (dashboard or code) queues one job per
// user (trigger on auth.users, migration 20260925c). This drains the queue: revoke the Google
// Calendar grant, delete the user's uploaded files from the public bucket, confirm nothing is
// left. Runs daily; the operator can call it right after a deletion (docs/ops/ACCOUNT-DELETION.md).
// The bucket credential is the deployment's Workload Identity, which is why this runs here and
// not in the database. Counts only are logged — never tokens, never object names.

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // The queue exists only once the clean-up migration is applied. Until then there is nothing to drain: report that, successfully
  // and visibly, instead of failing every night. After it is applied a real failure below is still a 500.
  if (!(await accountDeletionSchemaReady())) {
    console.log(JSON.stringify({ type: 'tappyai_cron', job: 'account-deletion-jobs', ok: true, skipped: 'cleanup_not_installed' }))
    return NextResponse.json({ ok: true, skipped: 'cleanup_not_installed' })
  }

  const media = getMediaProvider(process.env, req)
  if (!media.listObjects || !media.deleteObject) {
    return NextResponse.json({ ok: false, error: 'media_provider_cannot_delete' }, { status: 500 })
  }

  try {
    const db = createAdminClient()
    const result = await processAccountDeletionJobs({
      db,
      media: { listObjects: media.listObjects.bind(media), deleteObject: media.deleteObject.bind(media) },
      // the user's pictures in the private chat-media bucket (Supabase Storage), which the public-bucket listing cannot see
      chatMedia: createChatMediaDeleter(db),
      // the original videos in the PRIVATE source bucket (Explore video); 0 when that bucket is not configured, which is the case until the feature is switched on
      videoSource: createVideoSourceDeleter(getVideoSourceProvider(process.env, req)?.provider ?? null),
      // the approved HLS copies in the DELIVERY bucket (Explore video) and their CDN cache; 0 when that bucket is not configured, the case until the feature is switched on
      videoDelivery: createVideoDeliveryDeleter(getVideoDeliveryProvider(process.env, req)?.provider ?? null, getCdnInvalidator(process.env, req)),
      revoke: (token) => revokeGoogleToken(token),
    })
    console.log(JSON.stringify({ type: 'tappyai_cron', job: 'account-deletion-jobs', ok: true, ...result }))
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error(JSON.stringify({ type: 'tappyai_cron', job: 'account-deletion-jobs', ok: false, error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }))
    return NextResponse.json({ ok: false, error: 'deletion_jobs_failed' }, { status: 500 })
  }
}
