// The people of a group meal, as the clients see them (owner 20/11): the leader and the ACCEPTED members. A person is named by an OPAQUE KEY ('leader' for the creator, the member row id for a member),
// never by account id: the account ids stay on the server. Read with the service role (the route has already checked that the caller is a participant).
import { vi as VI } from '@/lib/i18n/presentation'
import { clipField } from '@/lib/group/fields'

export interface GroupPerson { key: string; name: string; userId: string }
export const LEADER_KEY = 'leader'

type Row = Record<string, unknown>
interface Reader { from(table: string): Record<string, unknown> }

export async function groupPeople(admin: unknown, group: { id: string; creator_id: string }): Promise<GroupPerson[]> {
  const db = admin as Reader
  const profile = await (db.from('profiles') as unknown as { select(c: string): { eq(k: string, v: string): { maybeSingle(): Promise<{ data: Row | null }> } } }).select('full_name').eq('id', group.creator_id).maybeSingle()
  const leaderName = clipField(profile.data?.full_name, 40) || VI['groupDining.leaderName']
  const { data: rows } = await (db.from('group_members') as unknown as { select(c: string): { eq(k: string, v: string): { eq(k: string, v: string): { order(c: string, o: { ascending: boolean }): Promise<{ data: Row[] | null }> } } } })
    .select('id, user_id, name').eq('group_id', group.id).eq('status', 'member').order('created_at', { ascending: true })
  const members = (rows ?? []).filter(r => typeof r.user_id === 'string' && r.user_id).map((r): GroupPerson => ({ key: String(r.id), name: clipField(r.name, 60), userId: String(r.user_id) }))
  return [{ key: LEADER_KEY, name: leaderName, userId: group.creator_id }, ...members]
}
