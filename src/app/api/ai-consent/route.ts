import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { AI_DATA_CONSENT_VERSION } from '@/lib/ai/consent/aiDataConsent'
import { createAdminClient } from '@/lib/supabase/admin'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// POST /api/ai-consent — the iOS app reports its use and the person's decision about AI processing of their personal
// data (App Review 5.1.1(i) / 5.1.2(i)). Body: { granted: true | false | null, version, decision?: 'refused' | 'withdrawn' }.
//   granted: true   → agreed.        granted: false → refused or withdrawn (decision says which).
//   granted: null   → the app was used / the sheet was shown and not answered ("asked"). It records iOS use only and never
//                     overwrites an earlier decision.
// Only the current disclosure version is accepted. Writes go through the service role after the account check, because
// a signed-in user must not be able to change their own record (the table revokes client writes).
export async function POST(req: Request) {
  try {
    const { user } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
    // An anonymous visitor has no background messages to consent for: the decision is recorded once they have an account.
    const refused = refuseAnonymousSocialWrite(req, user)
    if (refused) return refused

    const body = await req.json().catch(() => null)
    const granted = body?.granted
    if (body?.version !== AI_DATA_CONSENT_VERSION || (granted !== null && typeof granted !== 'boolean')) {
      return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
    }

    const now = new Date().toISOString()
    let row: Record<string, unknown>
    if (granted === null) {
      // Heartbeat: iOS use only. The upsert below updates only ios_used and updated_at for an existing row.
      row = { user_id: user.id, ios_used: true, updated_at: now }
    } else if (granted === true) {
      row = { user_id: user.id, ios_used: true, granted: true, decision: 'agreed', version: AI_DATA_CONSENT_VERSION, decided_at: now, updated_at: now }
    } else {
      const decision = body?.decision === 'refused' ? 'refused' : 'withdrawn'
      row = { user_id: user.id, ios_used: true, granted: false, decision, version: AI_DATA_CONSENT_VERSION, decided_at: now, updated_at: now }
    }

    const { error } = await createAdminClient()
      .from('ai_data_consent')
      .upsert(row, { onConflict: 'user_id' })
    if (error) {
      console.error('[ai-consent] save failed:', error.message)
      return NextResponse.json({ error: 'save_failed', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 })
    }
    return NextResponse.json({ ok: true, version: AI_DATA_CONSENT_VERSION })
  } catch {
    return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 })
  }
}
