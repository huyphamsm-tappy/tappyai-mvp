import type { ChatParticipant, ChatThreadSummary, ChatThreadKind } from './types'

/** One row as `chat_thread_summaries()` returns it. */
export interface ThreadSummaryRow {
  thread_id: string
  kind: ChatThreadKind
  title: string | null
  last_message_at: string
  last_body: string | null
  last_sender_id: string | null
  last_created_at: string | null
  unread_count: number
}

/**
 * The narrow slice of the Supabase client this module uses.
 *
 * 🚨 `unknown` rather than the real `SupabaseClient`, and that is not laziness.
 * Structurally matching the generated client type here made `tsc` give up with
 * TS2589 "type instantiation is excessively deep" at the CALL SITE, not in this
 * file — PostgREST's builder types are recursive and resolving them through a
 * second structural interface multiplies the depth. Narrowing the contract to
 * the three calls this module actually makes keeps the compiler honest about
 * everything that matters (the table names, the columns, the shape of the
 * result) without dragging the whole builder in behind it.
 */
export interface SummaryQueryClient {
  from(table: string): {
    select(columns: string): {
      in(column: string, values: string[]): PromiseLike<{ data: unknown; error: unknown }>
    }
  }
}

/**
 * Joins the summary rows to the people in them.
 *
 * 🔑 THREE QUERIES, NOT N+1. `chat_thread_summaries()` returns the list and its
 * unread counts in one round trip; this adds one query for the rosters and one
 * for the profiles behind them. A per-thread fetch would have been simpler to
 * write and would issue one request per conversation on every inbox open.
 *
 * 🚨 The profile lookup is a separate query rather than a PostgREST join
 * because `chat_participants.user_id` references `auth.users`, not
 * `public.profiles` — there is no foreign key for PostgREST to infer, and
 * inventing one to make the join work would put a second owner on a column the
 * auth schema already owns.
 *
 * Both reads are RLS-scoped: `chat_participants` to the caller's own threads,
 * and `profiles` is public by policy. A missing profile row degrades to a null
 * name rather than dropping the participant, so a thread never loses a member
 * because their profile has not been created yet.
 */
export async function assembleSummaries(
  supabase: SummaryQueryClient,
  rows: ThreadSummaryRow[],
): Promise<ChatThreadSummary[]> {
  if (rows.length === 0) return []

  const threadIds = rows.map(r => r.thread_id)
  const { data: participantRows } = await supabase
    .from('chat_participants')
    .select('thread_id, user_id')
    .in('thread_id', threadIds)

  const roster = (participantRows ?? []) as { thread_id: string; user_id: string }[]
  const userIds = [...new Set(roster.map(p => p.user_id))]

  const profiles = new Map<string, { fullName: string | null; avatarUrl: string | null }>()
  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds)
    for (const p of (profileRows ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]) {
      profiles.set(p.id, { fullName: p.full_name, avatarUrl: p.avatar_url })
    }
  }

  const byThread = new Map<string, ChatParticipant[]>()
  for (const p of roster) {
    const profile = profiles.get(p.user_id)
    const list = byThread.get(p.thread_id) ?? []
    list.push({
      userId: p.user_id,
      fullName: profile?.fullName ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    })
    byThread.set(p.thread_id, list)
  }

  return rows.map(r => ({
    id: r.thread_id,
    kind: r.kind,
    title: r.title,
    lastMessageAt: r.last_message_at,
    // A thread with no messages yet is a real thread — someone just started it.
    lastMessage: r.last_body === null || r.last_created_at === null
      ? null
      : { body: r.last_body, senderId: r.last_sender_id, createdAt: r.last_created_at },
    unreadCount: r.unread_count ?? 0,
    participants: byThread.get(r.thread_id) ?? [],
  }))
}
