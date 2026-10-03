'use client'

// SUBSCRIPTIONS — the web plan screens (docs/payments/PLAN.md), behind SUBSCRIPTIONS_ENABLED, laid out
// after Huy's mockups (web page + app screens 3–9). Written by the security session (p8/subscriptions).
//
//   home        hero (badge, title, 3 benefits) + "Gói hiện tại" when ACTIVE
//               desktop: 7 columns — Khách, Miễn phí, Pip … Sunny (Sunny "Phổ biến nhất")
//               mobile:  "Quyền truy cập hiện tại" + the 5 plans as app-style list cards
//               + 4 trust tiles
//   detail      gradient hero card in the plan colour, 4 lines, "Chọn {plan}"; Sunny only: "Chỉ khoảng …/tháng"
//   method      "Thanh toán": summary + ONLY the method that works (SePay VietQR); card / Apple Pay /
//               Google Pay are not drawn. Disclosure right above "Thanh toán {giá}" + lock line.
//   pay         the VietQR screen (shared with the Phase 8 flow)
//   processing  "Đang xử lý thanh toán…" while the server confirms the plan
//   success     only once the SERVER says ACTIVE
//   failure     "Thanh toán chưa thành công. Gói của bạn chưa thay đổi." + "Thử lại" (keeps the plan)
//   manage      "Quản lý gói": plan card, end date, "Mua lại" once ended, payment history
//
// Web = ONE payment per period (Huy 2026-10-01): no auto-renew, no reminder, no "next payment", no
// cancel. All prices VND from the server catalog; no price per day, no savings %.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Check, ChevronRight, Crown, Lock, MapPin, MessageCircle, ShieldCheck, Star, Sparkles,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { VietQrScreen, formatVnd, type CreatedOrder } from '@/components/payments/PaymentsFlow'
import { TappyMascot } from '@/components/TappyMascot'
import type { SubscriptionCatalog, SubscriptionPlanCard } from '@/lib/payments/subscriptionCatalog'
import type { MySubscription } from '@/lib/payments/subscriptionState'
import { PlanAvatar } from './PlanAvatar'
import { planStyle } from './planStyle'

export type Screen = 'home' | 'detail' | 'method' | 'pay' | 'processing' | 'success' | 'failure' | 'manage'

export interface MyPlanResponse {
  signedIn: boolean
  subscription: MySubscription
  /** Pip is a one-time trial: true once this account has bought it (the server enforces it). */
  pipUsed?: boolean
  quota: { limit: number; used: number; remaining: number; period: 'day' | 'lifetime' }
}

export interface HistoryItem {
  date: string
  plan: { id: string; name: string } | null
  amountVnd: number
  status: 'paid' | 'mismatch'
}

type T = (k: string, v?: Record<string, string>) => string

const STORE_URL = {
  google_play: 'https://play.google.com/store/account/subscriptions',
  app_store: 'https://apps.apple.com/account/subscriptions',
} as const

export function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

export function periodText(days: number, t: T): string {
  if (days % 30 === 0 || days === 365) return t('sub.period.months', { count: String(days === 365 ? 12 : days / 30) })
  return t('sub.period.days', { count: String(days) })
}

/** When a purchase made now would end (nothing can be bought while a plan is active). */
export function endIfBoughtNow(plan: SubscriptionPlanCard, now = Date.now()): string {
  return new Date(now + plan.durationDays * 86_400_000).toISOString()
}

const card = 'bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm'
const btnBlue = 'w-full py-3.5 rounded-2xl bg-[#007AFF] hover:bg-blue-600 text-white font-semibold disabled:opacity-60'

/** The list price shown on every plan: "$1 · 7 ngày", and for the Pip trial "$1 · 7 ngày · Dùng thử 1 lần".
 *  The bank transfer itself is in VND (`priceVnd`), shown on the payment screens only. */
function priceLine(p: SubscriptionPlanCard, t: T) {
  const base = t('sub.price.usd', { usd: String(p.priceUsd), period: periodText(p.durationDays, t) })
  return p.trialOnce ? `${base} · ${t('sub.trial.once')}` : base
}

/** "about $5.5 a month" for the long plan (list price / months, one decimal). */
function usdMonthly(p: SubscriptionPlanCard): string {
  const months = p.durationDays === 365 ? 12 : p.durationDays / 30
  return `$${Math.round((p.priceUsd / months) * 10) / 10}`
}

/** Plans the account may still choose: a Pip already used is not offered again (the server refuses it too). */
function offeredPlans(catalog: SubscriptionCatalog, me: MyPlanResponse): SubscriptionPlanCard[] {
  return me.signedIn && me.pipUsed ? catalog.plans.filter((p) => !p.trialOnce) : catalog.plans
}

function PipUsedNotice() {
  const { t } = useTranslation()
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200" data-testid="sub-pip-used" role="note">
      <p className="font-semibold">{t('sub.pip.used')}</p>
      <p>{t('sub.trial.note')}</p>
    </div>
  )
}

/** The 3 web-card lines (mockup web) and the detail lines (mockup app 4: 4 for Sunny, 3 for the others). */
function cardLines(p: SubscriptionPlanCard, t: T): string[] {
  return [t('sub.plan.quota', { count: String(p.dailyAiQuestions) }), t('sub.plan.allAi'), t(`sub.plan.${p.id}.extra`)]
}
function detailLines(p: SubscriptionPlanCard, t: T): string[] {
  // Sunny: the two lines of Huy's mockup. Other plans: their own line only (Huy 2026-10-02).
  const rest = p.id === 'sunny' ? [t('sub.plan.milo.extra'), t('sub.plan.sunny.extra')] : [t(`sub.plan.${p.id}.extra`)]
  return [t('sub.plan.quota', { count: String(p.dailyAiQuestions) }), t('sub.plan.allAi'), ...rest]
}

function PopularBadge({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-[#FF9500] px-2.5 py-0.5 text-[11px] font-semibold text-white ${className}`}>
      <Crown size={12} aria-hidden="true" /> {t('sub.badge.popular')}
    </span>
  )
}

export default function SubscriptionFlow({ catalog, initialMe, initial, initialHistory }: {
  catalog: SubscriptionCatalog
  initialMe: MyPlanResponse
  /** Local preview only (src/app/dev/subscription-preview): open a given screen with fixtures. */
  initial?: { screen: Screen; planId?: string; order?: CreatedOrder; failure?: 'mismatch' | 'expired' }
  initialHistory?: HistoryItem[]
}) {
  const { t, locale } = useTranslation()
  const [me, setMe] = useState<MyPlanResponse>(initialMe)
  const [screen, setScreen] = useState<Screen>(initial?.screen ?? (initialMe.subscription.state === 'ACTIVE' ? 'manage' : 'home'))
  const [planId, setPlanId] = useState<string | null>(initial?.planId ?? null)
  const [order, setOrder] = useState<CreatedOrder | null>(initial?.order ?? null)
  const [failure, setFailure] = useState<'mismatch' | 'expired' | 'error'>(initial?.failure ?? 'error')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const plan = catalog.plans.find((p) => p.id === planId) ?? null
  const sub = me.subscription

  const refresh = useCallback(async (): Promise<MyPlanResponse | null> => {
    try {
      const res = await fetch('/api/payments/me', { cache: 'no-store' })
      if (!res.ok) return null
      const body = (await res.json()) as MyPlanResponse
      setMe(body)
      return body
    } catch {
      return null
    }
  }, [])

  const choose = (id: string) => { setPlanId(id); setError(null); setScreen('detail') }

  const pay = async () => {
    if (!plan) return
    if (!me.signedIn) { window.location.assign('/login?returnTo=%2Fsubscription'); return }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/payments/orders', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: plan.id }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof body?.message === 'string' ? body.message : t('pay.error.generic'))
        return
      }
      setOrder(body as CreatedOrder)
      setScreen('pay')
    } catch {
      setError(t('pay.error.network'))
    } finally {
      setBusy(false)
    }
  }

  const onPaid = useCallback(async () => {
    // The order row says "paid"; the plan is only shown as active once the SERVER says so.
    setScreen('processing')
    const fresh = await refresh()
    if (fresh?.subscription.state === 'ACTIVE') setScreen('success')
    else { setFailure('error'); setScreen('failure') }
  }, [refresh])

  const onFailed = useCallback((why: 'mismatch' | 'expired') => { setFailure(why); setScreen('failure') }, [])

  const back = (to: Screen) => (
    <button type="button" onClick={() => { setError(null); setScreen(to) }} className="inline-flex items-center gap-1 text-sm text-content-secondary hover:underline">
      <ArrowLeft size={16} aria-hidden="true" /> {t('sub.back')}
    </button>
  )

  if (screen === 'pay' && order && plan) {
    return (
      <div className="mx-auto max-w-lg">
        <VietQrScreen created={order} planName={plan.name} onPaid={onPaid} onFailed={onFailed} onBack={() => { setOrder(null); setScreen('method') }} />
      </div>
    )
  }

  if (screen === 'processing') {
    return (
      <div className="mx-auto max-w-lg py-10 text-center space-y-4" data-testid="sub-processing" aria-live="polite">
        <TappyMascot pose="phone" size={180} className="mx-auto" />
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">{t('sub.processing.title')}</h1>
        <p className="text-sm text-content-secondary">{t('sub.processing.hint')}</p>
        <div className="mx-auto h-2 w-64 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800" role="progressbar" aria-label={t('sub.processing.title')}>
          <div className="h-full w-2/3 animate-pulse rounded-full bg-[#007AFF]" />
        </div>
      </div>
    )
  }

  if (screen === 'success' && plan) {
    return (
      <div className="mx-auto max-w-lg text-center py-8 space-y-4" data-testid="sub-success">
        <div className="relative mx-auto w-fit">
          <TappyMascot pose="success" size={180} />
          <span className="absolute right-0 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
            <Check size={26} strokeWidth={3} aria-hidden="true" />
          </span>
        </div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">{t('sub.success.title', { plan: plan.name })}</h1>
        <p className="text-content-secondary">{t('sub.success.welcome', { plan: plan.name })}</p>
        {sub.periodEnd && <p className="text-sm text-content-secondary">{t('sub.success.until', { date: formatDay(sub.periodEnd, locale) })}</p>}
        <Link href="/chat" className="inline-flex w-full justify-center py-3.5 rounded-2xl bg-[#FF9500] hover:bg-orange-600 text-white font-semibold">
          {t('sub.success.start')}
        </Link>
        <button type="button" onClick={() => setScreen('manage')} className="w-full py-3 rounded-2xl border border-gray-300 dark:border-gray-700 font-semibold text-gray-900 dark:text-white">
          {t('sub.success.details')}
        </button>
      </div>
    )
  }

  if (screen === 'failure') {
    return (
      <div className="mx-auto max-w-lg text-center py-8 space-y-4" data-testid="sub-failure" role="alert">
        <TappyMascot pose="sorry" size={140} className="mx-auto" />
        <h1 className="text-xl font-black text-gray-900 dark:text-white">{t('sub.fail.title')}</h1>
        {failure !== 'error' && <p className="text-sm text-content-secondary">{t(`sub.fail.${failure}`)}</p>}
        <button type="button" className={btnBlue} onClick={() => { setOrder(null); setError(null); setScreen(plan ? 'method' : 'home') }}>
          {t('sub.fail.retry')}
        </button>
      </div>
    )
  }

  if (screen === 'manage') {
    return <ManageScreen me={me} catalog={catalog} onChoose={() => setScreen('home')} initialHistory={initialHistory} />
  }

  if (screen === 'detail' && plan) {
    const st = planStyle(plan.character.color)
    return (
      <div className="mx-auto max-w-lg space-y-4" data-testid="sub-detail">
        {back('home')}
        <div className={`relative overflow-hidden rounded-3xl p-6 text-center text-white shadow-lg ${st.hero}`}>
          {plan.badge === 'popular' && <PopularBadge className="absolute right-4 top-4" />}
          <PlanAvatar plan={plan} size={200} className="mx-auto" />
          <h1 className="mt-2 text-3xl font-black">{t('sub.plan.fullName', { plan: plan.name })}</h1>
          <p className="text-white/85">{t(`sub.plan.${plan.id}.tagline`)}</p>
          <p className="mt-4"><span className="text-4xl font-black">${plan.priceUsd}</span> <span className="text-lg font-semibold">/ {periodText(plan.durationDays, t)}</span></p>
          {plan.trialOnce && (
            <div className="mt-1 text-sm text-white/90" data-testid="sub-trial">
              <p className="font-semibold">{t('sub.trial.once')}</p>
              <p>{t('sub.trial.note')}</p>
            </div>
          )}
          {plan.monthlyApproxVnd != null && (
            <p className="text-sm text-white/85" data-testid="sub-monthly">{t('sub.detail.monthly', { price: usdMonthly(plan) })}</p>
          )}
          <ul className="mt-5 space-y-2.5 text-left">
            {detailLines(plan, t).map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/90"><Check size={13} strokeWidth={3} className={st.check} aria-hidden="true" /></span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setScreen('method')} className={`mt-6 w-full rounded-2xl py-3.5 font-semibold shadow ${st.button}`}>
            {t('sub.plan.choose', { plan: plan.name })}
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'method' && plan) {
    const price = formatVnd(plan.priceVnd ?? 0)
    return (
      <div className="mx-auto max-w-lg space-y-5" data-testid="sub-method">
        {back('detail')}
        <h1 className="text-center text-xl font-black text-gray-900 dark:text-white">{t('sub.pay.title')}</h1>
        <div className={`${card} flex items-center gap-4 p-4`}>
          <PlanAvatar plan={plan} size={72} />
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{t('sub.plan.fullName', { plan: plan.name })}</p>
            <p className="text-gray-700 dark:text-gray-300">{priceLine(plan, t)}</p>
            <p className="text-sm text-content-secondary" data-testid="sub-charged">{t('sub.pay.chargedVnd', { vnd: price, usd: String(plan.priceUsd) })}</p>
          </div>
        </div>
        <h2 className="font-semibold text-gray-900 dark:text-white">{t('sub.pay.method')}</h2>
        <div role="radiogroup" aria-label={t('sub.pay.method')}>
          <div role="radio" aria-checked="true" className="flex items-center gap-3 rounded-2xl border-2 border-[#007AFF] bg-white p-4 dark:bg-gray-900">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#007AFF] text-white"><Check size={14} strokeWidth={3} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 dark:text-white">{t('sub.pay.sepay')}</p>
              <p className="text-xs text-content-secondary">{t('sub.pay.sepay.desc')}</p>
            </div>
            <Building2 size={22} className="shrink-0 text-[#007AFF]" aria-hidden="true" />
          </div>
        </div>
        {/* Pre-purchase disclosure — next to the button, before any money moves. */}
        <div className="rounded-2xl bg-gray-100 p-4 text-sm text-gray-700 space-y-1.5 dark:bg-gray-800/60 dark:text-gray-300" data-testid="sub-disclosure">
          <p className="font-semibold text-gray-900 dark:text-white">{t('sub.disclose.price', { plan: plan.name, price, period: periodText(plan.durationDays, t) })}</p>
          <p>{t('sub.disclose.noAutoDebit')}</p>
          <p>{t('sub.disclose.until', { date: formatDay(endIfBoughtNow(plan), locale) })}</p>
          <p className="text-xs text-content-secondary">
            {t('sub.disclose.agree')} <Link href="/terms" className="underline">{t('sub.disclose.terms')}</Link> {t('sub.disclose.and')}{' '}
            <Link href="/privacy" className="underline">{t('sub.disclose.privacy')}</Link>.
          </p>
        </div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>}
        <button type="button" className={btnBlue} disabled={busy} onClick={pay}>
          {busy ? t('pay.creating') : me.signedIn ? t('sub.pay.button', { price }) : t('sub.pay.signIn')}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-content-secondary"><Lock size={13} aria-hidden="true" /> {t('sub.pay.secure')}</p>
      </div>
    )
  }

  return <PlansHome catalog={catalog} me={me} onChoose={choose} onManage={() => setScreen('manage')} />
}

// ── home: hero + 7 columns (desktop) / list (mobile) + trust tiles ──────────────────────────────

function PlansHome({ catalog, me, onChoose, onManage }: {
  catalog: SubscriptionCatalog; me: MyPlanResponse; onChoose: (id: string) => void; onManage: () => void
}) {
  const { t, locale } = useTranslation()
  const sub = me.subscription
  const active = sub.state === 'ACTIVE'
  const plans = offeredPlans(catalog, me)
  const benefits = [
    { icon: MessageCircle, tone: 'bg-violet-500', title: t('sub.benefit.ai'), desc: t('sub.benefit.ai.desc') },
    { icon: MapPin, tone: 'bg-[#007AFF]', title: t('sub.benefit.personal'), desc: t('sub.benefit.personal.desc') },
    { icon: Star, tone: 'bg-[#FF9500]', title: t('sub.benefit.full'), desc: t('sub.benefit.full.desc') },
  ]
  const trust = [
    { icon: Sparkles, tone: 'text-violet-500', title: t('sub.trust.ai'), desc: t('sub.trust.ai.desc') },
    { icon: MapPin, tone: 'text-[#007AFF]', title: t('sub.trust.places'), desc: t('sub.trust.places.desc') },
    { icon: Star, tone: 'text-[#FF9500]', title: t('sub.trust.rich'), desc: t('sub.trust.rich.desc') },
    { icon: ShieldCheck, tone: 'text-[#007AFF]', title: t('sub.trust.safe'), desc: t('sub.trust.safe.desc') },
  ]
  return (
    <div className="space-y-6" data-testid="sub-home">
      <section className="relative grid items-center gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF9500] px-3 py-1 text-sm font-semibold text-[#FF9500]">
            <Crown size={15} aria-hidden="true" /> {t('sub.hero.badge')}
          </span>
          <h1 className="text-3xl font-black leading-tight text-gray-900 dark:text-white sm:text-5xl">
            {t('sub.hero.title')}<br />{t('sub.hero.with')} <span className="text-[#007AFF]">Tappy</span>
          </h1>
          <p className="max-w-xl text-gray-600 dark:text-gray-300">{t('sub.hero.body')}</p>
          <ul className="grid gap-3 sm:grid-cols-3">
            {benefits.map((b) => (
              <li key={b.title} className="flex items-center gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${b.tone}`}><b.icon size={19} aria-hidden="true" /></span>
                <span><span className="block text-sm font-semibold text-gray-900 dark:text-white">{b.title}</span><span className="block text-xs text-content-secondary">{b.desc}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden lg:block"><TappyMascot pose="travel" size={260} className="mx-auto" /></div>
      </section>

      {active && sub.plan && (
        <button type="button" onClick={onManage} className={`${card} flex w-full items-center justify-between p-4 text-left`}>
          <span>
            <span className="block text-xs font-semibold text-[#007AFF]">{t('sub.card.current')}</span>
            <span className="block font-bold text-gray-900 dark:text-white">{t('sub.plan.fullName', { plan: sub.plan.name })}</span>
            {sub.periodEnd && <span className="block text-xs text-content-secondary">{t('sub.manage.until', { date: formatDay(sub.periodEnd, locale) })}</span>}
          </span>
          <ChevronRight size={18} className="text-content-secondary" aria-hidden="true" />
        </button>
      )}

      {me.signedIn && me.pipUsed && <PipUsedNotice />}

      <div className="space-y-4 lg:hidden">
        {!active && (
          <div className={`${card} p-4`} data-testid="sub-access">
            <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">{t('sub.access.title')}</p>
            <div className="mt-1 flex items-center justify-between">
              <span>
                <span className="block font-bold text-gray-900 dark:text-white">{me.signedIn ? t('sub.freeTier.name') : t('sub.guest.name')}</span>
                <span className="block text-sm text-content-secondary">{me.signedIn
                  ? t('sub.free.quota', { count: String(catalog.free.dailyAiQuestions) })
                  : t('sub.guest.quota', { count: String(catalog.guest.aiQuestions) })}</span>
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-content-secondary dark:bg-gray-800">{t('sub.card.current')}</span>
            </div>
          </div>
        )}
        <h2 className="text-center text-lg font-bold text-gray-900 dark:text-white">{t('sub.list.title')}</h2>
        <ul className="space-y-3">
          {plans.map((p) => {
            const st = planStyle(p.character.color)
            const current = active && sub.plan?.id === p.id
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={!sub.canBuy}
                  onClick={() => onChoose(p.id)}
                  data-plan={p.id}
                  className={`relative flex w-full items-center gap-3 overflow-hidden rounded-3xl p-3 pr-4 text-left shadow-sm ${st.listCard} ${!sub.canBuy && !current ? 'opacity-60' : ''}`}
                >
                  {p.badge === 'popular' && <PopularBadge className="absolute right-0 top-0 rounded-none rounded-bl-2xl" />}
                  <PlanAvatar plan={p} size={84} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-xl font-black ${st.accentOnLight}`}>{p.name}</span>
                    <span className={`block ${st.accentOnLight}`}><span className="text-lg font-black">${p.priceUsd}</span> <span className="text-sm font-semibold">/ {periodText(p.durationDays, t)}</span></span>
                    {p.trialOnce && <span className={`block text-xs font-semibold ${st.accentOnLight}`}>{t('sub.trial.once')}</span>}
                    {current && <span className="mt-0.5 inline-block rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-gray-700">{t('sub.card.current')}</span>}
                  </span>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${st.button}`}><ChevronRight size={18} aria-hidden="true" /></span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className={`hidden gap-3 lg:grid ${plans.length === catalog.plans.length ? 'lg:grid-cols-7' : 'lg:grid-cols-6'}`} data-testid="sub-columns">
        <AccessColumn
          image="/subscription/guest.webp" name={t('sub.guest.name')} tagline={t('sub.guest.tagline')}
          lines={[t('sub.guest.quota', { count: String(catalog.guest.aiQuestions) }), t('sub.guest.basic')]}
          action={me.signedIn
            ? <Link href="/chat" className="block rounded-2xl border border-gray-300 py-2.5 text-center text-sm font-semibold text-gray-900 dark:border-gray-600 dark:text-white">{t('sub.guest.cta')}</Link>
            : <span className="block rounded-2xl bg-gray-100 py-2.5 text-center text-sm font-semibold text-content-secondary dark:bg-gray-800">{t('sub.card.current')}</span>}
        />
        <AccessColumn
          image="/subscription/tappy.webp" name={t('sub.freeTier.name')} tagline={t('sub.freeTier.tagline')}
          lines={[t('sub.free.quota', { count: String(catalog.free.dailyAiQuestions) }), t('sub.free.most')]}
          action={!me.signedIn
            ? <Link href="/login?returnTo=%2Fsubscription" className="block rounded-2xl border border-gray-300 py-2.5 text-center text-sm font-semibold text-gray-900 dark:border-gray-600 dark:text-white">{t('sub.free.signIn')}</Link>
            : !active
              ? <span className="block rounded-2xl bg-gray-100 py-2.5 text-center text-sm font-semibold text-content-secondary dark:bg-gray-800">{t('sub.card.current')}</span>
              : <span className="block py-2.5" />}
        />
        {plans.map((p) => {
          const st = planStyle(p.character.color)
          const current = active && sub.plan?.id === p.id
          return (
            <div key={p.id} className={`relative flex flex-col rounded-3xl border p-4 ${st.column}`} data-plan-col={p.id}>
              {p.badge === 'popular' && <PopularBadge className="absolute -top-3 right-3" />}
              <PlanAvatar plan={p} size={96} className="mx-auto" />
              <p className={`mt-2 text-center text-2xl font-black ${st.accent}`}>{p.name}</p>
              <p className="min-h-[2.5rem] text-center text-xs text-content-secondary">{t(`sub.plan.${p.id}.tagline`)}</p>
              <p className={`mt-3 text-center text-xl font-black ${st.accent}`}>${p.priceUsd}</p>
              <p className={`text-center text-sm font-semibold ${st.accent}`}>/ {periodText(p.durationDays, t)}</p>
              {p.trialOnce && <p className={`text-center text-xs font-semibold ${st.accent}`}>{t('sub.trial.once')}</p>}
              <ul className="mt-4 flex-1 space-y-2 text-xs text-gray-700 dark:text-gray-300">
                {cardLines(p, t).map((line) => (
                  <li key={line} className="flex items-start gap-2"><Check size={15} strokeWidth={3} className={`mt-0.5 shrink-0 ${st.check}`} aria-hidden="true" />{line}</li>
                ))}
              </ul>
              {current ? (
                <span className="mt-4 block rounded-2xl bg-gray-100 py-2.5 text-center text-sm font-semibold text-content-secondary dark:bg-gray-800">{t('sub.card.current')}</span>
              ) : (
                <button type="button" disabled={!sub.canBuy} onClick={() => onChoose(p.id)} className={`mt-4 rounded-2xl py-2.5 text-sm font-semibold disabled:opacity-50 ${st.button}`}>
                  {t('sub.plan.choose', { plan: p.name })}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <ul className={`${card} grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4`}>
        {trust.map((x) => (
          <li key={x.title} className="flex items-start gap-3">
            <x.icon size={26} className={`shrink-0 ${x.tone}`} aria-hidden="true" />
            <span><span className="block text-sm font-semibold text-gray-900 dark:text-white">{x.title}</span><span className="block text-xs text-content-secondary">{x.desc}</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AccessColumn({ image, name, tagline, lines, action }: {
  image: string; name: string; tagline: string; lines: string[]; action: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied art in /public/subscription */}
      <img src={image} alt="" width={96} height={96} className="mx-auto h-24 w-24 rounded-2xl object-cover" />
      <p className="mt-2 text-center text-2xl font-black text-gray-900 dark:text-white">{name}</p>
      <p className="min-h-[2.5rem] text-center text-xs text-content-secondary">{tagline}</p>
      <p className="mt-3 text-center text-xl font-black text-gray-900 dark:text-white">{t('sub.price.free')}</p>
      <p className="text-sm">&nbsp;</p>
      <ul className="mt-4 flex-1 space-y-2 text-xs text-gray-700 dark:text-gray-300">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-2"><Check size={15} strokeWidth={3} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />{line}</li>
        ))}
      </ul>
      <div className="mt-4">{action}</div>
    </div>
  )
}

// ── manage ──────────────────────────────────────────────────────────────────────────────────────

function ManageScreen({ me, catalog, onChoose, initialHistory }: {
  me: MyPlanResponse
  catalog: SubscriptionCatalog
  onChoose: () => void
  initialHistory?: HistoryItem[]
}) {
  const { t, locale } = useTranslation()
  const sub = me.subscription
  const plan = sub.plan ? catalog.plans.find((p) => p.id === sub.plan!.id) ?? null : null
  const [history, setHistory] = useState<HistoryItem[] | null>(initialHistory ?? null)

  useEffect(() => {
    if (initialHistory) return
    let live = true
    fetch('/api/payments/history', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (live) setHistory(Array.isArray(b?.items) ? b.items : []) })
      .catch(() => { if (live) setHistory([]) })
    return () => { live = false }
  }, [initialHistory])

  const badgeTone = sub.state === 'ACTIVE'
    ? 'bg-emerald-500 text-white'
    : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'

  return (
    <div className="mx-auto max-w-lg space-y-5" data-testid="sub-manage">
      <h1 className="text-2xl font-black text-gray-900 dark:text-white">{t('sub.manage.title')}</h1>
      {sub.state === 'NONE' || !sub.plan ? (
        <div className={`${card} p-4 space-y-3`}>
          <p className="text-gray-700 dark:text-gray-300">{t('sub.manage.none')}</p>
          <button type="button" className={btnBlue} onClick={onChoose}>{t('sub.manage.choose')}</button>
        </div>
      ) : (
        <div className={`${card} p-4 space-y-4`}>
          <div className="flex items-center gap-3">
            {plan && <PlanAvatar plan={plan} size={72} />}
            <div className="min-w-0">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{t('sub.plan.fullName', { plan: sub.plan.name })}</p>
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeTone}`}>{t(`sub.manage.state.${sub.state}`)}</span>
              {sub.periodEnd && (
                <p className="mt-0.5 text-sm text-content-secondary">
                  {sub.state === 'ACTIVE' ? t('sub.manage.until', { date: formatDay(sub.periodEnd, locale) }) : t('sub.manage.ended', { date: formatDay(sub.periodEnd, locale) })}
                </p>
              )}
            </div>
          </div>

          {sub.state === 'ACTIVE' && sub.channel === 'web' && sub.periodEnd && (
            <p className="text-sm text-gray-700 dark:text-gray-300">{t('sub.manage.web', { date: formatDay(sub.periodEnd, locale) })}</p>
          )}

          {sub.state === 'ACTIVE' && (sub.channel === 'google_play' || sub.channel === 'app_store') && (
            <>
              <p className="text-sm text-gray-700 dark:text-gray-300">{t(`sub.manage.store.${sub.channel}`)}</p>
              {sub.periodEnd && (
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {sub.autoRenew ? t('sub.manage.autoRenewOn') : t('sub.manage.autoRenewOff', { date: formatDay(sub.periodEnd, locale) })}
                </p>
              )}
              <a href={STORE_URL[sub.channel]} target="_blank" rel="noopener noreferrer" className="block w-full rounded-2xl border border-gray-200 py-3 text-center text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-white">
                {t(`sub.manage.openStore.${sub.channel}`)}
              </a>
            </>
          )}

          {sub.state === 'ACTIVE' && sub.channel === 'manual' && <p className="text-sm text-gray-700 dark:text-gray-300">{t('sub.manage.manual')}</p>}
          {sub.canBuy && <button type="button" className={btnBlue} onClick={onChoose}>{t('sub.manage.buyAgain')}</button>}
        </div>
      )}

      {history && history.length > 0 && (
        <section className={`${card} p-4`} data-testid="sub-history">
          <h2 className="mb-2 font-semibold text-gray-900 dark:text-white">{t('sub.history.title')}</h2>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {history.map((h, i) => (
              <li key={`${h.date}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <span className="block font-medium text-gray-900 dark:text-white">{h.plan ? t('sub.plan.fullName', { plan: h.plan.name }) : '-'}</span>
                  <span className="block text-xs text-content-secondary">{formatDay(h.date, locale)}</span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold text-gray-900 dark:text-white">{formatVnd(h.amountVnd)}</span>
                  <span className={`block text-xs ${h.status === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{t(`sub.history.status.${h.status}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
