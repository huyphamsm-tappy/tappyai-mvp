import { getRequestUser } from '@/lib/auth/getRequestUser'
import { revokeGoogleToken } from '@/lib/integrations/googleCalendar'
import { NextRequest, NextResponse } from 'next/server'
import { searchParam } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-calendar/callback`

// GET /api/integrations/google-calendar → redirect to Google OAuth
export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  const action = searchParam(req, 'action')

  // Disconnect
  if (action === 'disconnect') {
    // C-1. Revoke at Google BEFORE dropping our copy.
    //
    // Deleting the row only removes the credential from the live database. The
    // grant itself lives at Google, so without this the token stays usable —
    // and every backup or replica taken before now still holds a WORKING
    // credential. Revocation is the one action that reaches copies we do not
    // control.
    //
    // Read under the caller's own client: `user_integrations` is
    // `FOR ALL USING (auth.uid() = user_id)`, so this can only ever return the
    // caller's own row and needs no elevated access.
    const { data: existing } = await supabase
      .from('user_integrations')
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .eq('provider', 'google_calendar')
      .maybeSingle()

    // Best-effort, and the delete happens either way: disconnecting is the
    // user's instruction, and a Google outage must not trap them in a
    // connection they asked to end.
    const revoked = await revokeGoogleToken(existing?.refresh_token ?? existing?.access_token)
    if (!revoked && existing) {
      // No token in the log line — only the fact and the user it concerns.
      console.warn('[integrations][google_calendar] revocation failed; row deleted anyway', user.id)
    }

    await supabase
      .from('user_integrations')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'google_calendar')
    return NextResponse.redirect(new URL('/profile/integrations', req.url))
  }

  // Connect — redirect to Google OAuth
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state: user.id, // passed back in callback for verification
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  )
}
