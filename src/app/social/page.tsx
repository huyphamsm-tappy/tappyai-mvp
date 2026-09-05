import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SocialView from './SocialView'

// Friends / Social — the discovery layer for the profile system.
//
// Same shape as `/profile/notifications`: the session is resolved server-side and
// the shell's identity comes from `profiles`, so the page never renders a header
// for a user it has not confirmed.
export default async function SocialPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?returnTo=/social')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  // Email from the session, never from `profiles` — the same rule the
  // notification page follows.
  const userInfo = {
    full_name: profile?.full_name ?? user.user_metadata?.full_name,
    avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url,
    email: user.email,
  }

  return <SocialView user={userInfo} />
}
