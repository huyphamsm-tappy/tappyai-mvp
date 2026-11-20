'use client'

import { useState } from 'react'
import { Receipt, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// The bill of a group meal (owner 20/11): whoever paid enters the total, the tip, who shares equally and any personal item; everyone sees what they owe the payer; the payer marks who paid back.
// The shares are computed by the server (lib/group/splitBill.ts); this component only draws them. People are opaque keys.

export interface BillPerson { key: string; name: string }
export interface BillShape {
  payerKey: string | null
  payerName: string | null
  totalVnd: number
  tipVnd: number
  items: Array<{ name: string; amountVnd: number; forId: string }>
  excluded: string[]
  paid: Record<string, boolean>
  isPayer: boolean
  settlement: { sharedVnd: number; shares: Array<{ id: string; name: string; personalVnd: number; dueVnd: number }>; transfers: Array<{ fromId: string; toId: string; amountVnd: number }> } | null
}

// the unit written once, as a character code: Vietnamese letters live in the dictionaries, not in the components
const DONG = String.fromCharCode(0x111)
const dong = (n: number) => n.toLocaleString('vi-VN')
const money = (n: number) => `${dong(n)}${DONG}`
type Draft = { total: string; tip: string; shares: Record<string, boolean>; items: Array<{ name: string; amount: string; forId: string }> }

export default function GroupBill({ groupId, people, bill, onChanged }: { groupId: string; people: BillPerson[]; bill: BillShape | null; onChanged: () => void | Promise<void> }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Draft>({ total: '', tip: '', shares: {}, items: [] })

  const startEdit = () => {
    setError('')
    setDraft({
      total: bill ? String(bill.totalVnd) : '',
      tip: bill && bill.tipVnd ? String(bill.tipVnd) : '',
      shares: Object.fromEntries(people.map(p => [p.key, !(bill?.excluded ?? []).includes(p.key)])),
      items: (bill?.items ?? []).map(i => ({ name: i.name, amount: String(i.amountVnd), forId: i.forId })),
    })
    setEditing(true)
  }

  async function call(method: 'PUT' | 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/group/${groupId}/bill`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
      if (!res.ok) { setError(t('groupDining.billInvalid')); return false }
      await onChanged()
      return true
    } catch {
      setError(t('groupDining.actionFailed'))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const total = Number(draft.total.replace(/[^\d]/g, ''))
    const tip = draft.tip.trim() ? Number(draft.tip.replace(/[^\d]/g, '')) : 0
    const items = draft.items.filter(i => i.name.trim() && i.amount.trim()).map(i => ({ name: i.name.trim(), amountVnd: Number(i.amount.replace(/[^\d]/g, '')), forId: i.forId }))
    const excluded = people.filter(p => draft.shares[p.key] === false).map(p => p.key)
    if (await call('PUT', { totalVnd: total, tipVnd: tip, items, excluded })) setEditing(false)
  }

  return (
    <div className="card p-4 space-y-3" data-testid="group-bill">
      <div className="flex items-center gap-2">
        <Receipt size={18} className="text-link" aria-hidden="true" />
        <h2 className="font-bold text-gray-900 dark:text-white">{t('groupDining.billTitle')}</h2>
      </div>

      {!bill && !editing && (
        <>
          <p className="text-sm text-content-secondary">{t('groupDining.billIntro')}</p>
          <button type="button" onClick={startEdit} className="w-full py-2.5 bg-interactive text-white font-semibold rounded-2xl" data-testid="group-bill-start">{t('groupDining.billStart')}</button>
        </>
      )}

      {editing && (
        <form onSubmit={save} className="space-y-3" data-testid="group-bill-form">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('groupDining.billTotal')}
            <input inputMode="numeric" value={draft.total} onChange={e => setDraft(d => ({ ...d, total: e.target.value }))} required className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" data-testid="group-bill-total" />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('groupDining.billTip')}
            <input inputMode="numeric" value={draft.tip} onChange={e => setDraft(d => ({ ...d, tip: e.target.value }))} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('groupDining.billWho')}</legend>
            <div className="flex flex-wrap gap-3">
              {people.map(p => (
                <label key={p.key} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={draft.shares[p.key] !== false} onChange={e => setDraft(d => ({ ...d, shares: { ...d.shares, [p.key]: e.target.checked } }))} />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('groupDining.billItemsTitle')}</p>
            <div className="space-y-2">
              {draft.items.map((it, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2" data-testid="group-bill-item">
                  <input aria-label={t('groupDining.billItemName')} placeholder={t('groupDining.billItemName')} value={it.name} maxLength={40} onChange={e => setDraft(d => ({ ...d, items: d.items.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) }))} className="flex-1 min-w-[6rem] px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
                  <input aria-label={t('groupDining.billItemAmount')} placeholder={t('groupDining.billItemAmount')} inputMode="numeric" value={it.amount} onChange={e => setDraft(d => ({ ...d, items: d.items.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)) }))} className="w-28 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
                  <select aria-label={t('groupDining.billItemFor')} value={it.forId} onChange={e => setDraft(d => ({ ...d, items: d.items.map((x, k) => (k === i ? { ...x, forId: e.target.value } : x)) }))} className="px-2 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                    {people.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                  </select>
                  <button type="button" aria-label={t('groupDining.remove')} onClick={() => setDraft(d => ({ ...d, items: d.items.filter((_, k) => k !== i) }))} className="text-red-500"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            {draft.items.length < 20 && (
              <button type="button" onClick={() => setDraft(d => ({ ...d, items: [...d.items, { name: '', amount: '', forId: people[0]?.key ?? '' }] }))} className="mt-2 flex items-center gap-1 text-sm text-link font-medium" data-testid="group-bill-add-item"><Plus size={14} />{t('groupDining.billAddItem')}</button>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 py-2.5 bg-interactive text-white font-semibold rounded-2xl disabled:opacity-60">{t('groupDining.billSave')}</button>
            <button type="button" onClick={() => setEditing(false)} className="px-4 py-2.5 rounded-2xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200">{t('groupDining.billCancel')}</button>
          </div>
        </form>
      )}

      {bill && !editing && (
        <div className="space-y-3" data-testid="group-bill-view">
          <p className="font-semibold text-gray-900 dark:text-white">{t('groupDining.billPaidBy', { name: bill.payerName ?? '', amount: money(bill.totalVnd + bill.tipVnd) })}</p>
          {bill.settlement ? (
            <>
              <p className="text-xs text-content-secondary">{t('groupDining.billShared', { amount: money(bill.settlement.sharedVnd) })}</p>
              <ul className="space-y-2">
                {bill.settlement.shares.map(s => {
                  const isPayer = s.id === bill.payerKey
                  const items = bill.items.filter(i => i.forId === s.id)
                  const paid = bill.paid[s.id] === true
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 text-sm" data-testid="group-bill-share">
                      <span className="min-w-0">
                        <span className="font-medium text-gray-900 dark:text-white">{isPayer ? s.name : s.dueVnd > 0 ? t('groupDining.billOwes', { name: s.name, payer: bill.payerName ?? '' }) : t('groupDining.billNothing', { name: s.name })}</span>
                        {items.length > 0 && <span className="block text-xs text-content-secondary">{items.map(i => `${i.name} ${money(i.amountVnd)}`).join(', ')}</span>}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {!isPayer && s.dueVnd > 0 && <span className="font-semibold text-gray-900 dark:text-white">{money(s.dueVnd)}</span>}
                        {!isPayer && s.dueVnd > 0 && (bill.isPayer
                          ? <button type="button" disabled={busy} onClick={() => call('PATCH', { memberKey: s.id, paid: !paid })} className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${paid ? 'bg-green-100 text-green-700' : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`} data-testid="group-bill-mark">{paid ? t('groupDining.billPaid') : t('groupDining.billMarkPaid')}</button>
                          : paid && <span className="text-xs font-semibold text-green-600">{t('groupDining.billPaid')}</span>)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm text-amber-700 dark:text-amber-300">{t('groupDining.billNeedsUpdate')}</p>
          )}
          {bill.isPayer && (
            <div className="flex gap-4 pt-1">
              <button type="button" onClick={startEdit} className="text-sm text-link font-medium" data-testid="group-bill-edit">{t('groupDining.billEdit')}</button>
              <button type="button" disabled={busy} onClick={() => { if (window.confirm(t('groupDining.billConfirmDelete'))) void call('DELETE') }} className="text-sm text-red-500 font-medium">{t('groupDining.billDelete')}</button>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </div>
      )}
    </div>
  )
}
