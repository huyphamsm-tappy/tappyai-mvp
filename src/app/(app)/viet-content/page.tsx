import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SHOW_VIET_CONTENT } from '@/lib/config/product'
import VietContentView from './VietContentView'

export const metadata = {
  title: 'Viết content mạng xã hội — TappyAI',
  description: 'Tạo caption hấp dẫn cho Facebook, TikTok, Instagram chỉ trong vài giây.',
}

export default async function VietContentPage() {
  // Hidden feature (SHOW_VIET_CONTENT): a direct hit 404s before any session or profile read.
  if (!SHOW_VIET_CONTENT) notFound()
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let userInfo = null
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    userInfo = profile || {
      full_name: user.user_metadata?.full_name,
      avatar_url: user.user_metadata?.avatar_url,
      email: user.email,
    }
  }

  return <VietContentView user={userInfo} />
}
