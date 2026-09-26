import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { buildPrivateMetadata } from '@/lib/share/openGraph'
import ChatConversation from './ChatConversation'

// A conversation is private. Its metadata is therefore built from the brand
// alone — `buildPrivateMetadata` accepts no content argument, so there is no
// call site at which a message could be passed in by mistake. It also marks the
// URL noindex: a private page is not a destination worth crawling.
export function generateMetadata(): Metadata {
  return buildPrivateMetadata('vi')
}

// Always fetch fresh conversation data — never serve a stale RSC payload from
// the Full Route Cache or the Router Cache (30-second default stale time).
// Without this, pressing Back from the service page restores a snapshot of the
// conversation from *before* the chat session, showing an empty or stale chat.
export const dynamic = 'force-dynamic'

export default async function ConversationPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?returnTo=/chat/${params.id}`)
  const { data: conversation } = await supabase.from('conversations').select('*').eq('id', params.id).eq('user_id', user.id).single()
  if (!conversation) notFound()
  return <ChatConversation conversation={conversation} />
}
