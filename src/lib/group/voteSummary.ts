// The state of a group's vote as the clients see it, read with the service role (the caller's right to see it is checked by the route before this is called). Pure parts are in tally.ts.
import { tally, type Tally } from '@/lib/group/tally'

interface Reader {
  from(table: string): { select(cols?: string, o?: { count?: string; head?: boolean }): Record<string, unknown> }
}

export interface VoteSummary extends Tally { mine: string | null; participants: number }

/** The ids of the cards of a group, in order (anything that is not a card with an id is skipped). */
export function optionIdsOf(options: unknown): string[] {
  return (Array.isArray(options) ? options : []).map(o => (o as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 8)
}

/** participants = the creator + the accepted members. */
export async function voteSummary(admin: unknown, groupId: string, optionIds: readonly string[], userId: string): Promise<VoteSummary> {
  const db = admin as Reader
  const { count } = await (db.from('group_members').select('id', { count: 'exact', head: true }) as unknown as { eq(k: string, v: string): { eq(k: string, v: string): Promise<{ count: number | null }> } }).eq('group_id', groupId).eq('status', 'member')
  const participants = 1 + (count ?? 0)
  const { data } = await (db.from('group_votes').select('user_id, option_id') as unknown as { eq(k: string, v: string): Promise<{ data: Array<{ user_id: string; option_id: string }> | null }> }).eq('group_id', groupId)
  const votes = data ?? []
  const t = tally(participants, votes, optionIds)
  const last = new Map<string, string>()
  for (const v of votes) if (optionIds.includes(v.option_id)) last.set(v.user_id, v.option_id)
  return { ...t, mine: last.get(userId) ?? null, participants }
}
