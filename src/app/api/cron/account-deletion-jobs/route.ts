import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMediaProvider } from '@/lib/media'
import { revokeGoogleToken } from '@/lib/integrations/googleCalendar'
import { processAccountDeletionJobs } from '@/lib/account/deletionJobs'

export const runtime = 'nodejs'
export const maxDuration = 60

// account-deletion-jobs cron — F-096. Deleting an account (dashboard or code) queues one job per
// user (trigger on auth.users, migration 20260925c). This drains the queue: revoke the Google
// Calendar grant, delete the user's uploaded files from the public bucket, confirm nothing is
// left. Runs daily; the operator can call it right after a deletion (docs/ops/ACCOUNT-DELETION.md).
// The bucket credential is the deployment's Workload Identity, which is why this runs here and
// not in the database. Counts only are logged — never tokens, never object names.

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const media = getMediaProvider(process.env, req)
  if (!media.listObjects || !media.deleteObject) {
    return NextResponse.json({ ok: false, error: 'media_provider_cannot_delete' }, { status: 500 })
  }

  try {
    const result = await processAccountDeletionJobs({
      db: createAdminClient(),
      media: { listObjects: media.listObjects.bind(media), deleteObject: media.deleteObject.bind(media) },
      revoke: (token) => revokeGoogleToken(token),
    })
    console.log(JSON.stringify({ type: 'tappyai_cron', job: 'account-deletion-jobs', ok: true, ...result }))
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error(JSON.stringify({ type: 'tappyai_cron', job: 'account-deletion-jobs', ok: false, error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }))
    return NextResponse.json({ ok: false, error: 'deletion_jobs_failed' }, { status: 500 })
  }
}
