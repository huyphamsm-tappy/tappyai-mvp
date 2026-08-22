import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HistoryView from './HistoryView'

export default async function ProfileHistoryPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, title, category, updated_at, messages')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50)

  const userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }

  return (
    <HistoryView
      userInfo={userInfo}
      conversations={(conversations ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        updated_at: c.updated_at,
        messageCount: Array.isArray(c.messages) ? c.messages.length : 0,
      }))}
    />
  )
}
