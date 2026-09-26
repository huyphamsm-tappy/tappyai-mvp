import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { isReportReason } from '@/lib/reviews/reportReasons'
import { createHash } from 'crypto'

// F-031 — the content-report channel for user-generated content.
//
// Retiring music reuse (F-024) removed `/api/music/tracks/[id]/report`, which was the ONLY wired
// user-facing report intake. App Store and Google Play both require a working way to report
// infringing/abusive UGC, so this restores one — for reviews (which includes video clips: a clip is
// a video review) — reusing the EXISTING `content_reports` table rather than building anything new.
//
// content_reports (20260817_content_safety_gate.sql): RLS allows an `authenticated` INSERT (there is
// no UPDATE/SELECT policy for a client, so a reporter can file but never read the queue); the admin
// side reads it through the moderation pipeline. `reporter_source_id` is OPAQUE by design (ADR-026)
// — a per-reporter sha256 token, so a reporter dedupes via UNIQUE(content_id,reporter_source_id,
// reason) without the raw uid being stored. A repeat report of the same content+reason is a no-op.
//
// The accepted reasons live in `@/lib/reviews/reportReasons` so the feed UI offers exactly the set
// this route accepts — the client can never present a reason that 400s here.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  let reason = ''
  try { const b = await req.json(); reason = typeof b?.reason === 'string' ? b.reason.trim() : '' } catch { /* invalid below */ }
  if (!isReportReason(reason)) {
    return NextResponse.json({ error: 'invalid_reason', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
  }

  // Opaque, deterministic per reporter — never the raw uid (ADR-026).
  const reporterSourceId = createHash('sha256').update(`content_report:${user.id}`).digest('hex')

  // Plain INSERT, not upsert: the RLS policy grants only INSERT, and PostgREST's on-conflict path
  // is refused by RLS (42501). A duplicate is handled below as a no-op — the existing report stands.
  const { error } = await supabase
    .from('content_reports')
    .insert({ content_id: params.id, reporter_source_id: reporterSourceId, reason })

  if (error) {
    const code = (error as { code?: string }).code
    // A repeat report of the same content+reason by the same reporter (UNIQUE) — already filed, no-op.
    if (code === '23505') return NextResponse.json({ ok: true, reported: true, alreadyReported: true })
    // FK violation → the review does not exist (content_id REFERENCES reviews(id)).
    if (code === '23503') {
      return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', requestLocale(req)) }, { status: 404 })
    }
    console.error('[reviews/report]', code ?? 'error')
    return NextResponse.json({ error: 'report_failed', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 })
  }

  return NextResponse.json({ ok: true, reported: true })
}
