import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import NotificationSettings from '@/components/notifications/NotificationSettings'

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

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile/settings" title="Thông báo" />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <NotificationSettings />
      </main>

      <BottomNav />
    </div>
  )
}
