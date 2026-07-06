import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileView from './ProfileView'

export default async function ProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { count: conversationCount } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const userInfo = {
    full_name: profile?.full_name || user.user_metadata?.full_name,
    avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url,
    email: profile?.email || user.email,
  }
  const firstName = userInfo.full_name?.split(' ').pop() || userInfo.email?.split('@')[0] || 'bạn'

  return (
    <ProfileView
      userId={user.id}
      userInfo={userInfo}
      firstName={firstName}
      conversationCount={conversationCount || 0}
    />
  )
}
