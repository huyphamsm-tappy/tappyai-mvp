import { createAdminClient } from '@/lib/supabase/admin'

interface CalendarEvent {
  summary: string
  start: string
  end: string
  location?: string
  description?: string
}

async function refreshAccessToken(userId: string, refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.access_token) return null

    const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()
    const supabase = createAdminClient()
    await supabase
      .from('user_integrations')
      .update({ access_token: data.access_token, expires_at: expiresAt })
      .eq('user_id', userId)
      .eq('provider', 'google_calendar')

    return data.access_token
  } catch {
    return null
  }
}

export async function getUpcomingEvents(userId: string): Promise<CalendarEvent[]> {
  const supabase = createAdminClient()
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google_calendar')
    .single()

  if (!integration) return []

  let accessToken = integration.access_token

  // Refresh if expired (or expiring in next 5 minutes)
  if (!accessToken || new Date(integration.expires_at) <= new Date(Date.now() + 5 * 60 * 1000)) {
    if (!integration.refresh_token) return []
    accessToken = await refreshAccessToken(userId, integration.refresh_token)
    if (!accessToken) return []
  }

  try {
    const now = new Date().toISOString()
    const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const params = new URLSearchParams({
      timeMin: now,
      timeMax: weekLater,
      maxResults: '10',
      singleEvents: 'true',
      orderBy: 'startTime',
    })

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!res.ok) return []
    const data = await res.json()

    return (data.items ?? []).map((e: Record<string, unknown>) => {
      const startObj = e.start as Record<string, string> | undefined
      const endObj = e.end as Record<string, string> | undefined
      return {
        summary: String(e.summary ?? 'Sự kiện'),
        start: startObj?.dateTime ?? startObj?.date ?? '',
        end: endObj?.dateTime ?? endObj?.date ?? '',
        location: e.location ? String(e.location) : undefined,
        description: e.description ? String(e.description).slice(0, 100) : undefined,
      }
    })
  } catch {
    return []
  }
}

export function formatEventsForPrompt(events: CalendarEvent[]): string {
  if (!events.length) return ''
  const lines = events.map(e => {
    const start = new Date(e.start)
    const dateStr = start.toLocaleDateString('vi-VN', { weekday: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
    return `• ${e.summary} — ${dateStr}${e.location ? ` @ ${e.location}` : ''}`
  })
  return `\n===== LỊCH TUẦN NÀY =====\n${lines.join('\n')}\n========================`
}
