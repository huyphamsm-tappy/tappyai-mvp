import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { resolveFirstName } from '@/lib/i18n/displayName'
import AccountView from './AccountView'

// Session and data only. Presentation lives in AccountView, which is a client component because the
// chosen locale is only knowable there — see the note in that file (C14/C15).
export default async function AccountPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const userInfo = {
    full_name: profile?.full_name || user.user_metadata?.full_name,
    avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url,
    email: profile?.email || user.email,
    created_at: profile?.created_at || user.created_at,
  }

  return (
    <AccountView
      userInfo={userInfo}
      firstName={resolveFirstName(userInfo)}
      joinDateIso={userInfo.created_at ?? null}
    />
  )
}
