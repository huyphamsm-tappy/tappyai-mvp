import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAllowedUserIds } from '@/lib/ai/consent/aiDataConsent'
import { aiConsentRequiredMessage } from '@/lib/i18n/aiConsentMessages'

// Server-side gate for every AI endpoint that receives an account's content. It runs whether the request came from the
// app or from a direct API call, so the client-side gate is not the only control.
//
// Returns null when the account's personal data may go to the AI provider now (Web-only accounts, or iOS accounts that
// agreed to the current disclosure). Otherwise returns the 403 to send back, and nothing is sent to the provider.
// A read error or a thrown error blocks: a state that cannot be verified is not assumed to be allowed.
export async function refuseWithoutAiConsent(userId: string, locale: string): Promise<NextResponse | null> {
  let allowed: Set<string>
  try {
    allowed = await loadAllowedUserIds(createAdminClient(), [userId])
  } catch {
    allowed = new Set()
  }
  if (allowed.has(userId)) return null
  return NextResponse.json(
    { error: 'ai_consent_required', message: aiConsentRequiredMessage(locale) },
    { status: 403 },
  )
}
