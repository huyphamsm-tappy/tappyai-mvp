import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ChatConversation from './ChatConversation'

export default async function ConversationPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: conversation } = await supabase.from('conversations').select('*').eq('id', params.id).eq('user_id', user?.id).single()
  if (!conversation) notFound()
  return <ChatConversation conversation={conversation} />
}
