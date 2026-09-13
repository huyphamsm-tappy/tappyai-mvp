import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import {
  canonicalPlanShareJson, newPlanShareId, planSharePath, planShareUrl, toPlanShareSnapshot,
} from '@/lib/plans/share/planShare'
import { planShareFingerprint } from '@/lib/plans/share/planShareServer'
import type { TappyPlan } from '@/components/TripPlanCard'

// POST /api/plans/share — publish one plan and get its stable link.
//
// The body is the `[TAPPY_PLAN]` payload the sender is looking at. It is
// reduced to the public snapshot here (`toPlanShareSnapshot`: whitelisted,
// clipped, photo hosts checked) BEFORE anything is stored, so the row can only
// ever hold what the page may show. The snapshot is hashed; the same plan from
// the same owner returns the same id, because a link is an identity and a
// second click must not mint a second one.
//
// 🚨 Signed-in, non-anonymous owners only. A guest can make a plan and share
// it as text (the existing brochure); a link that outlives the guest session is
// a social write and takes a real account — the same rule as posting. The
// database policy says the same thing (`plan_shares_insert_own`); this refusal
// is the earlier, legible one.
//
// No LLM, no Places call, no photo fetch: everything needed is already in the
// payload. This route is one insert.

const MAX_BODY_BYTES = 128 * 1024

export async function POST(req: Request) {
  const locale = requestLocale(req)
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const refusal = refuseAnonymousSocialWrite(req, user)
  if (refusal) return refusal

  let body: { plan?: TappyPlan } | null = null
  try {
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'payload_too_large', message: serverMessage('conversation.tooLarge', locale) }, { status: 413 })
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid_json', message: serverMessage('validation.invalid', locale) }, { status: 400 })
  }
  const snapshot = toPlanShareSnapshot(body?.plan)
  if (!snapshot) return NextResponse.json({ error: 'invalid_plan', message: serverMessage('validation.invalid', locale) }, { status: 400 })

  const canonical = canonicalPlanShareJson(snapshot)
  const fingerprint = planShareFingerprint(canonical)

  // Already published by this owner? The unique key says so; reuse its id.
  const existing = await supabase
    .from('plan_shares')
    .select('id')
    .eq('owner_id', user.id)
    .eq('fingerprint', fingerprint)
    .maybeSingle()
  if (existing.error) {
    console.error('[plans/share] lookup', existing.error)
    return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', locale) }, { status: 500 })
  }
  if (existing.data?.id) {
    return NextResponse.json({ id: existing.data.id, path: planSharePath(existing.data.id), url: planShareUrl(existing.data.id), reused: true })
  }

  // A fresh id. On the astronomically unlikely id collision, or on a race that
  // published the same fingerprint between the lookup and here, read back the
  // winner rather than failing the share.
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newPlanShareId()
    const inserted = await supabase
      .from('plan_shares')
      .insert({ id, owner_id: user.id, fingerprint, plan: JSON.parse(canonical) })
      .select('id')
      .single()
    if (!inserted.error && inserted.data?.id) {
      return NextResponse.json({ id: inserted.data.id, path: planSharePath(inserted.data.id), url: planShareUrl(inserted.data.id), reused: false })
    }
    if (inserted.error?.code === '23505') {
      const winner = await supabase.from('plan_shares').select('id').eq('owner_id', user.id).eq('fingerprint', fingerprint).maybeSingle()
      if (winner.data?.id) {
        return NextResponse.json({ id: winner.data.id, path: planSharePath(winner.data.id), url: planShareUrl(winner.data.id), reused: true })
      }
      continue // the id itself collided; try another
    }
    // RLS refused (e.g. an anonymous session the JWT check caught) or a real failure.
    if (inserted.error?.code === '42501') return NextResponse.json({ error: 'forbidden', message: serverMessage('auth.forbidden', locale) }, { status: 403 })
    console.error('[plans/share] insert', inserted.error)
    return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', locale) }, { status: 500 })
  }
  return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', locale) }, { status: 500 })
}
