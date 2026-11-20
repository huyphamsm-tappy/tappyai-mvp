// The bill of a group meal as the participants see it: what the payer entered, who has paid back, and the settlement COMPUTED from those numbers (splitBill.ts). People are opaque keys (people.ts).
// A person who left the group after the bill was entered simply drops out of it; if the payer left there is no settlement until the bill is entered again.
import { splitBill, type SplitInput, type Share, type Transfer } from '@/lib/group/splitBill'
import { groupPeople, type GroupPerson } from '@/lib/group/people'

export interface BillItem { name: string; amountVnd: number; forId: string }
export interface BillView {
  payerKey: string | null
  payerName: string | null
  totalVnd: number
  tipVnd: number
  items: BillItem[]
  excluded: string[]
  paid: Record<string, boolean>
  people: Array<{ key: string; name: string }>
  myKey: string | null
  isPayer: boolean
  settlement: { sharedVnd: number; shares: Share[]; transfers: Transfer[] } | null
}

type Row = Record<string, unknown>
interface Reader { from(table: string): Record<string, unknown> }

export interface BillRow { payer_id: string; total_vnd: number | string; tip_vnd: number | string; items: unknown; excluded: unknown; paid: unknown }

/** The stored bill row of a group, or null. */
export async function readBillRow(admin: unknown, groupId: string): Promise<BillRow | null> {
  const r = await (( admin as Reader).from('group_bills') as unknown as { select(c: string): { eq(k: string, v: string): { maybeSingle(): Promise<{ data: BillRow | null }> } } }).select('payer_id, total_vnd, tip_vnd, items, excluded, paid').eq('group_id', groupId).maybeSingle()
  return r.data
}

export function toBillView(row: BillRow, people: readonly GroupPerson[], userId: string): BillView {
  const known = new Set(people.map(p => p.key))
  const payer = people.find(p => p.userId === row.payer_id) ?? null
  const items = (Array.isArray(row.items) ? row.items : []).filter((it: Row) => it && known.has(String(it.forId))).map((it: Row): BillItem => ({ name: String(it.name ?? ''), amountVnd: Number(it.amountVnd), forId: String(it.forId) }))
  const excluded = (Array.isArray(row.excluded) ? row.excluded : []).map(String).filter(k => known.has(k))
  const paidRaw = (row.paid && typeof row.paid === 'object' ? row.paid : {}) as Record<string, unknown>
  const paid = Object.fromEntries(Object.entries(paidRaw).filter(([k, v]) => known.has(k) && v === true).map(([k]) => [k, true]))
  const input: SplitInput = { participants: people.map(p => ({ id: p.key, name: p.name })), payerId: payer?.key ?? '', totalVnd: Number(row.total_vnd), tipVnd: Number(row.tip_vnd), items, excluded }
  const result = payer ? splitBill(input) : null
  const me = people.find(p => p.userId === userId) ?? null
  return {
    payerKey: payer?.key ?? null,
    payerName: payer?.name ?? null,
    totalVnd: input.totalVnd,
    tipVnd: input.tipVnd,
    items,
    excluded,
    paid,
    people: people.map(p => ({ key: p.key, name: p.name })),
    myKey: me?.key ?? null,
    isPayer: !!payer && payer.userId === userId,
    settlement: result && result.ok ? { sharedVnd: result.sharedVnd, shares: result.shares, transfers: result.transfers } : null,
  }
}

/** The bill of a group for one participant (the route has checked that they take part), or null when there is none. */
export async function billView(admin: unknown, group: { id: string; creator_id: string }, userId: string): Promise<BillView | null> {
  const row = await readBillRow(admin, group.id)
  if (!row) return null
  return toBillView(row, await groupPeople(admin, group), userId)
}
