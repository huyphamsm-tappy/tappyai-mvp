'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeftRight, RefreshCw, ChevronLeft, ChevronDown, Coins, Zap, Globe, BadgeCheck, Info, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import TappyPresence from '@/components/v3/TappyPresence'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { formatAmount, formatRate } from '@/lib/finance/format'
import { crossRate, MissingCurrencyError } from '@/lib/finance/exchange'

// Currency names are localized through `currency.<code>`; the code and flag identify the currency
// on their own, so only the name varies by language (B07).
const CURRENCIES = [
  { code: 'VND', flag: '🇻🇳', decimals: 0 },
  { code: 'USD', flag: '🇺🇸', decimals: 2 },
  { code: 'EUR', flag: '🇪🇺', decimals: 2 },
  { code: 'JPY', flag: '🇯🇵', decimals: 0 },
  { code: 'KRW', flag: '🇰🇷', decimals: 0 },
  { code: 'GBP', flag: '🇬🇧', decimals: 2 },
  { code: 'AUD', flag: '🇦🇺', decimals: 2 },
  { code: 'SGD', flag: '🇸🇬', decimals: 2 },
  { code: 'THB', flag: '🇹🇭', decimals: 2 },
  { code: 'CNY', flag: '🇨🇳', decimals: 2 },
  { code: 'HKD', flag: '🇭🇰', decimals: 2 },
  { code: 'TWD', flag: '🇹🇼', decimals: 0 },
]

/** The four presets the page has always offered. Values, not a new feature. */
const PRESETS = ['100000', '500000', '1000000', '5000000']

function CurrencySelect({
  value, onChange, label,
}: { value: string; onChange: (v: string) => void; label: string }) {
  const { t } = useTranslation()
  const cur = CURRENCIES.find(c => c.code === value)
  const id = `fx-${label}`
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="v3-fx-label mb-2 block text-[13px] font-semibold">{label}</label>
      {/* A native <select>: keyboard, screen readers and mobile pickers all come for free.
          The flag is painted once, to the left; option text is code + localized name. */}
      <div className="v3-fx-select-wrap">
        <span className="v3-fx-select-flag" aria-hidden="true">{cur?.flag}</span>
        <select id={id} value={value} onChange={e => onChange(e.target.value)} className="v3-fx-select">
          {CURRENCIES.map(c => (
            <option key={c.code} value={c.code}>{c.code} — {t(`currency.${c.code}`)}</option>
          ))}
        </select>
        <ChevronDown size={18} className="v3-fx-select-caret" aria-hidden="true" />
      </div>
    </div>
  )
}

export default function CurrencyPage() {
  const { t, locale } = useTranslation()
  const [rates, setRates] = useState<Record<string, number> | null>(null)
  const [rateDate, setRateDate] = useState<string | null>(null)
  const [fallback, setFallback] = useState(false)
  const [loadingRates, setLoadingRates] = useState(true)

  const [amount, setAmount] = useState('1000000')
  const [from, setFrom] = useState('VND')
  const [to, setTo] = useState('USD')

  useEffect(() => {
    fetch('/api/rates')
      .then(r => r.json())
      .then(d => {
        setRates(d.rates)
        setRateDate(d.date)
        setFallback(d.fallback)
      })
      .catch(() => setFallback(true))
      .finally(() => setLoadingRates(false))
  }, [])

  const swap = useCallback(() => {
    setFrom(to)
    setTo(from)
  }, [from, to])

  const fromCur = CURRENCIES.find(c => c.code === from)!
  const toCur = CURRENCIES.find(c => c.code === to)!

  const numAmount = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0

  // Cross rate via the finance library. A missing currency throws (never silently
  // uses 1), so we surface an error instead of a wrong number.
  let converted: number | null = null
  let rate: number | null = null
  let missingCode: string | null = null
  if (rates && numAmount > 0) {
    try {
      rate = crossRate(rates, from, to)
      converted = numAmount * rate
    } catch (e) {
      if (e instanceof MissingCurrencyError) missingCode = e.code
    }
  }

  const formattedDate = rateDate
    ? new Date(rateDate).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  const numberLocale = locale === 'vi' ? 'vi-VN' : 'en-GB'

  return (
    // `v3-theme` brings the shared tokens to a page that keeps its own back-bar and bottom nav.
    <div className="v3-theme v3-fx-page min-h-dvh pb-24">
      {/* Back-bar: the same link and the same title, on the shell's header tokens. */}
      <div className="v3-fx-topbar sticky top-0 z-30 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="-ml-1.5 flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2" aria-label={t('currency.title')}>
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
          <span className="text-[15px] font-semibold">{t('currency.title')}</span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-7" data-fx-main>
        {/* ── Hero ── */}
        <section className="v3-fx-hero" aria-labelledby="fx-hero-title" data-fx-hero>
          <div className="v3-fx-stars" aria-hidden="true" />
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-4">
                <span className="v3-fx-brand flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl sm:h-16 sm:w-16" aria-hidden="true">
                  <ArrowLeftRight size={30} strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <h1 id="fx-hero-title" className="text-[26px] font-extrabold leading-tight tracking-[-0.01em] sm:text-[34px]">{t('currency.title')}</h1>
                  {/* Hourly, because that is what /api/rates does (revalidate = 3600). */}
                  <p className="v3-fx-hero-muted mt-1 text-[14px] sm:text-[16px]">{t('currency.heroSubtitle')}</p>
                </div>
              </div>
              <ul className="mt-6 flex flex-wrap gap-2.5" data-fx-chips>
                <li className="v3-fx-chip" data-tone="violet"><span className="v3-fx-chip-icon" aria-hidden="true"><Zap size={14} /></span>{t('currency.chipFast')}</li>
                <li className="v3-fx-chip" data-tone="emerald"><span className="v3-fx-chip-icon" aria-hidden="true"><BadgeCheck size={14} /></span>{t('currency.chipCurrencies', { n: String(CURRENCIES.length) })}</li>
                <li className="v3-fx-chip" data-tone="blue"><span className="v3-fx-chip-icon" aria-hidden="true"><Globe size={14} /></span>{t('currency.chipSource')}</li>
              </ul>
            </div>

            {/* The scene: globe, orbit, three currency coins and Tappy (the owner's default
                `wave` pose — no coin-holding pose exists, and none is invented). Illustration. */}
            <div className="relative mx-auto h-[220px] w-full max-w-[340px] flex-shrink-0 sm:h-[250px] md:w-[42%] md:max-w-[400px]" aria-hidden="true" data-fx-scene>
              <span className="v3-fx-globe" style={{ width: '70%', height: '70%', right: '-2%', top: '2%', aspectRatio: '1' }} />
              <span className="v3-fx-orbit" style={{ width: '118%', height: '118%', left: '-9%', top: '-8%' }} />
              <span className="v3-fx-coin" data-tone="blue" style={{ left: '4%', top: '26%' }}>$</span>
              <span className="v3-fx-coin" data-tone="violet" style={{ right: '2%', top: '8%' }}>€</span>
              <span className="v3-fx-coin" data-tone="gold" style={{ right: '4%', top: '52%' }}>¥</span>
              <div className="v3-fx-mascot absolute inset-x-0 bottom-0 flex justify-center">
                <TappyPresence pose="wave" size={210} aura="calm" className="max-w-[200px] sm:max-w-[230px]" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Amount ── */}
        <section className="v3-fx-card p-4 sm:p-5" aria-labelledby="fx-amount-label" data-fx-amount>
          <label id="fx-amount-label" htmlFor="fx-amount" className="v3-fx-label block text-[13px] font-semibold">{t('currency.amountLabel')}</label>
          <div className="v3-fx-field mt-2 min-h-[64px]">
            <span className="v3-fx-field-icon" aria-hidden="true"><Coins size={22} /></span>
            <input
              id="fx-amount"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={t('currency.amountPlaceholder')}
              className="v3-fx-input px-4 text-[28px] sm:text-[32px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="v3-fx-field-code text-[16px] sm:text-[18px]" aria-hidden="true">{from}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t('currency.quickAmounts')}>
            {PRESETS.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(v)}
                aria-pressed={amount === v}
                className="v3-fx-preset min-h-[44px] px-3 text-[13.5px] tabular-nums"
              >
                + {parseInt(v).toLocaleString(numberLocale)}
              </button>
            ))}
          </div>
        </section>

        {/* ── From ⇄ To ── */}
        <section className="v3-fx-card p-4 sm:p-5" data-fx-pair>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <CurrencySelect value={from} onChange={setFrom} label={t('currency.fromLabel')} />
            <div className="flex justify-center sm:pb-0">
              <button type="button" onClick={swap} className="v3-fx-swap" aria-label={t('currency.swapDirection')} data-fx-swap>
                <ArrowLeftRight size={22} aria-hidden="true" />
              </button>
            </div>
            <CurrencySelect value={to} onChange={setTo} label={t('currency.toLabel')} />
          </div>
        </section>

        {/* ── Result ── */}
        <section className="v3-fx-result p-5 sm:p-7" aria-live="polite" aria-labelledby="fx-result-title" data-fx-result>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="fx-result-title" className="sr-only">{t('currency.resultLabel')}</h2>
            {loadingRates ? (
              <div className="w-full" data-fx-loading aria-busy="true">
                <p className="v3-fx-result-muted flex items-center gap-2 text-[14px]">
                  <RefreshCw size={15} className="animate-spin" aria-hidden="true" />
                  {t('currency.loadingRates')}
                </p>
                <div className="v3-fx-shimmer mt-4 h-12 w-2/3 sm:h-16" />
                <div className="v3-fx-shimmer mt-3 h-4 w-1/3" />
              </div>
            ) : missingCode ? (
              <p role="alert" className="flex items-start gap-2 text-[15px] font-semibold" data-fx-missing>
                <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                {t('currency.missingRate', { code: missingCode })}
              </p>
            ) : converted !== null ? (
              <>
                {/* Below `sm` the status pill takes its own row above the number, so the number
                    keeps the full card width and never breaks mid-digit. */}
                <div className="order-2 min-w-0 w-full sm:order-1 sm:flex-1">
                  <p className="v3-fx-result-muted text-[15px] sm:text-[17px]" data-fx-from>
                    {formatAmount(numAmount, fromCur.decimals)} {from} =
                  </p>
                  <p className="mt-1 break-all text-[44px] font-black leading-none tracking-[-0.02em] tabular-nums sm:text-[64px]" data-fx-converted>
                    {formatAmount(converted, toCur.decimals)}
                  </p>
                  <p className="mt-2 text-[20px] font-bold sm:text-[26px]" data-fx-to>{toCur.flag} {to}</p>
                </div>
                {/* Hourly cache or the estimated table — never "live". */}
                <span className="v3-fx-status order-1 flex-shrink-0 self-start sm:order-2" data-fallback={fallback} data-fx-status>
                  <span className="v3-fx-status-dot" aria-hidden="true" />
                  {fallback ? t('currency.rateStatusFallback') : t('currency.rateStatusLive')}
                </span>
                {rate !== null && (
                  <div className="v3-fx-result-rule order-3 mt-5 w-full pt-4 text-[14px] sm:text-[15px]" data-fx-rates>
                    <p className="v3-fx-result-muted">{t('currency.rateLine', { from, rate: formatRate(rate), to })}</p>
                    <p className="v3-fx-result-muted mt-1">{t('currency.rateLine', { from: to, rate: formatRate(1 / rate), to: from })}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="v3-fx-result-muted text-[15px]" data-fx-empty>{t('currency.emptyPrompt')}</p>
            )}
          </div>
        </section>

        {/* ── Rate info + disclaimer ── */}
        <div className="v3-fx-note space-y-1.5 px-2 text-center text-[13px]" data-fx-note>
          {fallback ? (
            <p className="flex items-center justify-center gap-2" role="status">
              <AlertTriangle size={14} className="flex-shrink-0" aria-hidden="true" />
              {t('currency.fallbackNotice')}
            </p>
          ) : formattedDate ? (
            <p className="flex items-center justify-center gap-2">
              <Info size={14} className="flex-shrink-0" aria-hidden="true" />
              {t('currency.ratesUpdated', { date: formattedDate })}
            </p>
          ) : null}
          <p>{t('currency.disclaimer')}</p>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
