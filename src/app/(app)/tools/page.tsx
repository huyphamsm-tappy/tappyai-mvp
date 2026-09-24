import { createClient } from '@/lib/supabase/server'
import ToolsView from './ToolsView'

// ── V3 Web · Smart Tools (/tools) ───────────────────────────────────────────
//
// 🚨 NOT AUTH-GATED, AND THAT IS DELIBERATE. Most of these tools are open — a signed-out
// visitor can scan a receipt, convert a currency, split a bill or check a link today, and
// putting a login wall in front of the CATALOGUE would gate ten routes on the strength of
// the one (`/group/new`) that gates itself. The session is read only to render the shell's
// avatar; every tool keeps its own server-side check.
//
// 🚨 NO API AND NO TABLE. The tool list is a static registry, so there is nothing to fetch.

export default async function ToolsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile: { full_name: string | null; avatar_url: string | null } | null = null
  if (user) {
    const { data } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single()
    profile = data
  }

  // Email always from session (auth.users.email); profiles.email is being removed.
  const userInfo = user
    ? {
        full_name: profile?.full_name ?? user.user_metadata?.full_name,
        avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url,
        email: user.email,
      }
    : undefined

  return <ToolsView user={userInfo} />
}
