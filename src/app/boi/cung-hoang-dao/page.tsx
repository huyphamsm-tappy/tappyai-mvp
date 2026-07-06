import { createClient } from '@/lib/supabase/server'
import CungHoangDaoView from './CungHoangDaoView'

export default async function CungHoangDaoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let userInfo = null
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }
  }

  return <CungHoangDaoView user={userInfo} />
}
