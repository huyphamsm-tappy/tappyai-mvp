import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NotificationsView from './NotificationsView'

export default async function NotificationsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  // Email always from session (auth.users.email); profiles.email is being removed.
  const userInfo = { full_name: profile?.full_name ?? user.user_metadata?.full_name, avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url, email: user.email }

  return <NotificationsView user={userInfo} />
}
