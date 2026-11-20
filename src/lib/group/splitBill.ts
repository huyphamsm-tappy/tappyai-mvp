// Splitting the bill of a group meal (owner 20/11: equal split by default, editable by hand, with optional personal items). Whole dong only. The payer fronted the money; everyone else owes the payer
// their share: an equal part of what is shared (total + tip minus the personal items) among the people who share, plus their own personal items. The rounding dong go to the payer, so the others
// owe whole round parts and the shares add up to the bill exactly. Pure.
export interface SplitPerson { id: string; name: string }
export interface SplitItem { name: string; amountVnd: number; forId: string }
export interface SplitInput { participants: readonly SplitPerson[]; payerId: string; totalVnd: number; tipVnd: number; items: readonly SplitItem[]; excluded: readonly string[] }
export interface Share { id: string; name: string; personalVnd: number; dueVnd: number }
export interface Transfer { fromId: string; toId: string; amountVnd: number }
export type SplitResult =
  | { ok: true; sharedVnd: number; shares: Share[]; transfers: Transfer[] }
  | { ok: false; error: 'invalid_amount' | 'unknown_person' | 'items_exceed_bill' | 'nobody_shares' }

export const MAX_BILL_VND = 1_000_000_000
const whole = (n: unknown, min: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= MAX_BILL_VND

export function splitBill(input: SplitInput): SplitResult {
  const { participants, payerId, totalVnd, tipVnd, items, excluded } = input
  if (!whole(totalVnd, 1) || !whole(tipVnd, 0)) return { ok: false, error: 'invalid_amount' }
  const ids = new Set(participants.map(p => p.id))
  if (!ids.has(payerId) || excluded.some(id => !ids.has(id))) return { ok: false, error: 'unknown_person' }
  for (const it of items) {
    if (!whole(it.amountVnd, 1)) return { ok: false, error: 'invalid_amount' }
    if (!ids.has(it.forId)) return { ok: false, error: 'unknown_person' }
  }
  const bill = totalVnd + tipVnd
  const personalTotal = items.reduce((s, it) => s + it.amountVnd, 0)
  if (personalTotal > bill) return { ok: false, error: 'items_exceed_bill' }
  const out = new Set(excluded)
  const sharers = participants.filter(p => !out.has(p.id))
  if (sharers.length === 0) return { ok: false, error: 'nobody_shares' }

  const sharedVnd = bill - personalTotal
  const part = Math.floor(sharedVnd / sharers.length)
  const rest = sharedVnd - part * sharers.length
  const payerShares = sharers.some(p => p.id === payerId)

  const shares: Share[] = participants.map(p => {
    const personalVnd = items.filter(it => it.forId === p.id).reduce((s, it) => s + it.amountVnd, 0)
    const shares = sharers.some(s => s.id === p.id)
    // the rounding dong: the payer takes them when the payer shares, otherwise the first people who share
    const extra = !shares ? 0 : payerShares ? (p.id === payerId ? rest : 0) : (sharers.findIndex(s => s.id === p.id) < rest ? 1 : 0)
    return { id: p.id, name: p.name, personalVnd, dueVnd: (shares ? part + extra : 0) + personalVnd }
  })
  const transfers: Transfer[] = shares.filter(s => s.id !== payerId && s.dueVnd > 0).map(s => ({ fromId: s.id, toId: payerId, amountVnd: s.dueVnd }))
  return { ok: true, sharedVnd, shares, transfers }
}
