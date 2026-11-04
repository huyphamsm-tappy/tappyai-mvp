import type { ChatMessage } from './types'

/** The columns of a `chat_messages` row as Supabase realtime delivers them. The picture columns are absent on a row from before migration 20261109. */
export interface RealtimeMessageRow {
  id: string
  thread_id: string
  sender_id: string | null
  body: string
  created_at: string
  media_path?: string | null
}

/**
 * A realtime row as the message the page uses. A picture's storage path is NEVER carried into the page: the row says only THAT there is a picture (`hasMedia`), and the
 * page reads the thread again to get the SHORT-LIVED signed link the server makes for it (a realtime payload cannot carry one).
 */
export function messageFromRealtimeRow(row: RealtimeMessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    ...(row.media_path ? { hasMedia: true } : {}),
  }
}
