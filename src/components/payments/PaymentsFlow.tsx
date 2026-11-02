'use client'

// PAYMENTS — the web purchase flow, three screens and no more (docs/phase8/PAYMENTS.md):
//   1. pick   — five plan cards, ONE primary button
//   2. pay    — VietQR + live status (Supabase Realtime on the order row, 3 s polling fallback)
//   3. done   — Tappy + "you're a <plan> member" + expiry + one button
// The plan is granted by the SePay webhook only; "I've made the transfer" just shows the wait.
// Prices come from the server catalog (PLAN_CONFIG) — nothing here is hardcoded.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Download } from 'lucide-react'
import { TappyMascot } from '@/components/TappyMascot'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { createClient } from '@/lib/supabase/client'
import type { CatalogPlan } from '@/lib/plans/planConfig'

export interface CurrentPlan {
  name: string
  periodEnd: string
}

export interface CreatedOrder {
  order: { id: string; code: string; plan: string; amountVnd: number; status: string; expiresAt: string }
  bank: { accountNumber: string; accountName: string; bankCode: string }
  qrUrl: string
}

type OrderStatus = 'pending' | 'paid' | 'expired' | 'mismatch'

const POLL_MS = 3_000

export function formatVnd(n: number): string {
  return `${n.toLocaleString('vi-VN')}\u0111`
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

export default function PaymentsFlow({ plans, current }: { plans: CatalogPlan[]; current: CurrentPlan | null }) {
  const { t, locale } = useTranslation()
  const [selected, setSelected] = useState<string>(plans.find((p) => p.popular)?.id ?? plans[0]?.id)
  const [step, setStep] = useState<'pick' | 'pay' | 'done'>('pick')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedOrder | null>(null)
  const [paidUntil, setPaidUntil] = useState<string | null>(null)

  const plan = plans.find((p) => p.id === (created?.order.plan ?? selected))

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/payments/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: selected }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof body?.message === 'string' ? body.message : t('pay.error.generic'))
        return
      }
      setCreated(body as CreatedOrder)
      setStep('pay')
    } catch {
      setError(t('pay.error.network'))
    } finally {
      setBusy(false)
    }
  }

  const onPaid = useCallback(async () => {
    // The authoritative expiry comes from the server, not from the order.
    try {
      const res = await fetch('/api/subscription', { cache: 'no-store' })
      const body = await res.json().catch(() => null)
      setPaidUntil(typeof body?.currentPeriodEnd === 'string' ? body.currentPeriodEnd : null)
    } catch {
      setPaidUntil(null)
    }
    setStep('done')
  }, [])

  if (step === 'done' && plan) {
    return (
      <div className="text-center py-8 space-y-4" data-testid="pay-success">
        <TappyMascot pose="success" size={160} className="mx-auto" />
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">{t('pay.success.title', { plan: plan.name })}</h1>
        {paidUntil && <p className="text-content-secondary text-sm">{t('pay.success.until', { date: formatDate(paidUntil, locale) })}</p>}
        <Link href="/chat" className="inline-flex w-full justify-center py-3 rounded-xl bg-primary-500 text-white font-semibold hover:bg-primary-600">
          {t('pay.success.start')}
        </Link>
      </div>
    )
  }

  if (step === 'pay' && created && plan) {
    return <VietQrScreen created={created} planName={plan.name} onPaid={onPaid} onBack={() => { setCreated(null); setStep('pick') }} />
  }

  return (
    <div className="space-y-5" data-testid="pay-picker">
      <div className="text-center pt-2">
        <TappyMascot pose="wave" size={96} className="mx-auto" />
        <h1 className="text-2xl font-black text-gray-900 dark:text-white mt-2">{t('pay.title')}</h1>
        <p className="text-content-secondary text-sm mt-1">{t('pay.subtitle')}</p>
      </div>

      {current && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
          <p>{t('pay.current', { plan: current.name, date: formatDate(current.periodEnd, locale) })}</p>
          <p className="text-xs mt-1 opacity-80">{t('pay.currentExtend')}</p>
        </div>
      )}

      <div role="radiogroup" aria-label={t('pay.title')} className="space-y-3">
        {plans.map((p) => {
          const on = p.id === selected
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSelected(p.id)}
              className={`w-full text-left rounded-2xl p-4 border-2 transition-colors bg-white dark:bg-gray-900 ${
                on ? 'border-primary-500' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 dark:text-white">{p.name}</span>
                    {p.popular && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-500 text-white">{t('pay.popular')}</span>
                    )}
                  </div>
                  <p className="text-xs text-content-secondary mt-0.5">{p.periodLabel} · {t('pay.perDay', { count: String(p.dailyAiQuestions) })}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-gray-900 dark:text-white">{formatVnd(p.priceVnd ?? 0)}</p>
                  {p.pricePerDayVnd != null && (
                    <p className="text-[11px] text-content-secondary">{t('pay.pricePerDay', { price: formatVnd(p.pricePerDayVnd) })}</p>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>}

      <button
        type="button"
        onClick={start}
        disabled={busy || !selected}
        className="w-full py-3.5 rounded-xl bg-primary-500 text-white font-semibold hover:bg-primary-600 disabled:opacity-60"
      >
        {busy ? t('pay.creating') : t('pay.continue')}
      </button>
    </div>
  )
}

function useCountdown(expiresAt: string): number {
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()))
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now())), 1_000)
    return () => clearInterval(id)
  }, [expiresAt])
  return left
}

/** Live order status: Realtime on the row, plus polling every 3 s (the socket may never connect). */
function useOrderStatus(orderId: string): OrderStatus {
  const [status, setStatus] = useState<OrderStatus>('pending')
  const supabase = useMemo(() => createClient(), [])
  useEffect(() => {
    let stopped = false
    const apply = (s: unknown) => {
      if (!stopped && (s === 'paid' || s === 'mismatch' || s === 'expired' || s === 'pending')) setStatus(s)
    }
    const channel = supabase
      .channel(`payment_orders:${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payment_orders', filter: `id=eq.${orderId}` },
        (payload: { new?: { status?: unknown } }) => apply(payload.new?.status))
      .subscribe()
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/orders?id=${encodeURIComponent(orderId)}`, { cache: 'no-store' })
        if (res.ok) apply((await res.json())?.order?.status)
      } catch { /* keep waiting */ }
    }, POLL_MS)
    return () => {
      stopped = true
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [orderId, supabase])
  return status
}

/**
 * SUBSCRIPTIONS reuses this screen; `onFailed` (optional) is told when the order ends unpaid —
 * a short transfer (`mismatch`) or the 15 minutes ran out. Without it nothing changes.
 */
export function VietQrScreen({ created, planName, onPaid, onBack, onFailed }: {
  created: CreatedOrder; planName: string; onPaid: () => void; onBack: () => void
  onFailed?: (why: 'mismatch' | 'expired') => void
}) {
  const { t } = useTranslation()
  const { order, bank, qrUrl } = created
  const status = useOrderStatus(order.id)
  const left = useCountdown(order.expiresAt)
  const [claimed, setClaimed] = useState(false)
  const [saveHint, setSaveHint] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => {
    if (status === 'paid' && !firedRef.current) {
      firedRef.current = true
      onPaid()
    }
  }, [status, onPaid])

  useEffect(() => {
    if (!onFailed || firedRef.current) return
    if (status === 'mismatch' || status === 'expired' || (status === 'pending' && left === 0)) {
      firedRef.current = true
      onFailed(status === 'mismatch' ? 'mismatch' : 'expired')
    }
  }, [status, left, onFailed])

  const mm = String(Math.floor(left / 60_000)).padStart(2, '0')
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')

  const saveQr = async () => {
    try {
      const blob = await (await fetch(qrUrl)).blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${order.code}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5_000)
    } catch {
      setSaveHint(true)
    }
  }

  return (
    <div className="space-y-4" data-testid="pay-qr">
      <div className="text-center">
        <h1 className="text-xl font-black text-gray-900 dark:text-white">{t('pay.qr.title')}</h1>
        <p className="text-sm text-content-secondary mt-1">{planName} · {formatVnd(order.amountVnd)}</p>
      </div>

      <div className="bg-white rounded-2xl p-3 mx-auto w-full max-w-[18rem] sm:max-w-[22rem] border border-gray-200 dark:border-gray-700">
        {/* eslint-disable-next-line @next/next/no-img-element -- external generated QR image */}
        <img src={qrUrl} alt={t('pay.qr.title')} className="w-full h-auto" />
      </div>

      <p className="text-xs text-content-secondary text-center hidden sm:block">{t('pay.qr.hint')}</p>
      <div className="sm:hidden space-y-2">
        <button type="button" onClick={saveQr} className="w-full py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-white inline-flex items-center justify-center gap-2">
          <Download size={16} /> {t('pay.qr.save')}
        </button>
        <p className="text-xs text-content-secondary text-center">{saveHint ? t('pay.qr.saveFallback') : t('pay.qr.hintMobile')}</p>
      </div>

      <dl className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 text-sm">
        <Row label={t('pay.qr.bank')} value={bank.bankCode} />
        <Row label={t('pay.qr.account')} value={bank.accountNumber} copy />
        <Row label={t('pay.qr.name')} value={bank.accountName} />
        <Row label={t('pay.qr.amount')} value={formatVnd(order.amountVnd)} copyValue={String(order.amountVnd)} copy />
        <Row label={t('pay.qr.content')} value={order.code} copy strong />
      </dl>
      <p className="text-xs text-content-secondary">{t('pay.qr.contentNote')}</p>

      <div aria-live="polite" className="rounded-2xl p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300 space-y-1">
        {status === 'mismatch' ? (
          <p>{t('pay.qr.mismatch')}</p>
        ) : left > 0 ? (
          <>
            <p className="font-semibold">{t('pay.qr.waiting')}</p>
            <p className="tabular-nums">{t('pay.qr.timeLeft', { time: `${mm}:${ss}` })}</p>
            {claimed && <p>{t('pay.qr.doneWaiting')}</p>}
          </>
        ) : (
          <p>{t('pay.qr.expired')}</p>
        )}
      </div>

      {!claimed && status !== 'mismatch' && (
        <button type="button" onClick={() => setClaimed(true)} className="w-full py-3.5 rounded-xl bg-primary-500 text-white font-semibold hover:bg-primary-600">
          {t('pay.qr.done')}
        </button>
      )}
      <button type="button" onClick={onBack} className="w-full py-2 text-sm text-content-secondary hover:underline">
        {t('pay.qr.back')}
      </button>
    </div>
  )
}

function Row({ label, value, copy, copyValue, strong }: { label: string; value: string; copy?: boolean; copyValue?: string; strong?: boolean }) {
  const { t } = useTranslation()
  const [done, setDone] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue ?? value)
      setDone(true)
      setTimeout(() => setDone(false), 1_500)
    } catch { /* clipboard blocked: the value is on screen */ }
  }
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-content-secondary">{label}</dt>
      <dd className="flex items-center gap-2 min-w-0">
        <span className={`truncate text-gray-900 dark:text-white ${strong ? 'font-bold tracking-wider' : 'font-medium'}`}>{value}</span>
        {copy && (
          <button type="button" onClick={onCopy} aria-label={`${t('pay.qr.copy')} ${label}`} className="shrink-0 p-1.5 rounded-lg text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30">
            {done ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
      </dd>
    </div>
  )
}
