import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { runChatMediaRetention } from '@/lib/messaging/mediaRetention'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// chat-media-retention cron (owner 04/11/2026, like Zalo): removes Messenger pictures older than the retention period from the private bucket (the message stays,
// the picture shows "expired") and removes uploaded pictures that no message ever used. Daily; CRON secret required. Counts only are logged — never paths.

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await runChatMediaRetention(createAdminClient())
    console.log(JSON.stringify({ type: 'tappyai_cron', job: 'chat-media-retention', ok: true, ...result }))
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error(JSON.stringify({ type: 'tappyai_cron', job: 'chat-media-retention', ok: false, error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }))
    return NextResponse.json({ ok: false, error: 'retention_failed' }, { status: 500 })
  }
}
