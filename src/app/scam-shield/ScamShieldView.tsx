'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  Shield, Link2, QrCode, Upload, Loader2, Search, Clock, Globe, Trash2, ArrowRight,
  ShieldCheck, ShieldAlert, Lock, Radar, Zap, BadgeCheck, type LucideIcon,
} from 'lucide-react'
import type { CheckResult, RiskLevel } from '@/lib/scam-shield/types'
import {
  readHistory, recordCheck, clearHistory,
  type ScamCheckHistoryEntry,
} from '@/lib/scam-shield/history'
import V3Shell from '@/components/v3/V3Shell'
import TappyPresence from '@/components/v3/TappyPresence'
import ScamShieldResult, { LEVEL_TONE, LEVEL_KEY } from './ScamShieldResult'

type Tab = 'url' | 'qr'

const ERROR_I18N: Record<string, string> = {
  rate_limit: 'scamShield.error.rateLimit',
  daily_limit: 'scamShield.error.dailyLimit',
  invalid_input: 'scamShield.error.invalidUrl',
  private_url: 'scamShield.error.privateUrl',
  check_failed: 'scamShield.error.checkFailed',
  qr_decode_failed: 'scamShield.error.qrDecode',
  qr_no_url: 'scamShield.error.qrNoUrl',
  no_image: 'scamShield.error.qrFailed',
  too_large: 'scamShield.error.qrFailed',
  invalid_content_type: 'scamShield.error.qrFailed',
}

/** How many rows the history shows before "see all". The rest are stored, just not on screen. */
const HISTORY_PREVIEW = 5

/**
 * The four capability tiles under the hero copy.
 *
 * 🚨 EACH ONE NAMES A PROVIDER THE ENGINE RUNS (`lib/scam-shield/providers`): blocklists + Web
 * Risk, a bounded fast check, SSL + redirect-chain inspection, the official brand directory. The
 * reference's "data protection" tile names nothing this engine does, so it is not a tile.
 */
const FEATURES: { titleKey: string; descKey: string; icon: LucideIcon; tone: 'rose' | 'emerald' | 'blue' | 'violet' }[] = [
  { titleKey: 'v3.scam.featDetect', descKey: 'v3.scam.featDetectDesc', icon: Radar, tone: 'rose' },
  { titleKey: 'v3.scam.featFast', descKey: 'v3.scam.featFastDesc', icon: Zap, tone: 'emerald' },
  { titleKey: 'v3.scam.featHttps', descKey: 'v3.scam.featHttpsDesc', icon: Lock, tone: 'blue' },
  { titleKey: 'v3.scam.featBrand', descKey: 'v3.scam.featBrandDesc', icon: BadgeCheck, tone: 'violet' },
]

/**
 * Relative time from the app's existing `time.*` strings — no new vocabulary, and no
 * `Intl.RelativeTimeFormat`, which would render English units inside a Vietnamese session.
 */
function useTimeAgo() {
  const { t } = useTranslation()
  return (ts: number) => {
    const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000))
    if (mins < 1) return t('time.justNow')
    if (mins < 60) return t('time.minutesAgo', { n: String(mins) })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('time.hoursAgo', { n: String(hours) })
    return t('time.daysAgo', { n: String(Math.floor(hours / 24)) })
  }
}

/** `https://vietcombank.com.vn/login` → `vietcombank.com.vn`, with the full URL kept in `title`. */
function displayHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * The verdict badge, in the V3 palette.
 *
 * 🚨 SIX LEVELS, NOT THREE. The visual reference showed three chips (safe / warning / danger) and
 * the engine reports six — so the reference is followed for SHAPE and the engine for MEANING.
 * Collapsing them here would be a scoring change made in a stylesheet: `LOW` is not `SAFE`, and
 * `INCONCLUSIVE` is not a verdict at all. `LEVEL_TONE` is a `Record<RiskLevel, …>` in the result
 * component, so a seventh level fails the build rather than rendering untinted.
 */
function LevelBadge({ level, size = 'md' }: { level: RiskLevel; size?: 'sm' | 'md' }) {
  const { t } = useTranslation()
  const tone = LEVEL_TONE[level]
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full font-semibold ${
        size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-[12.5px]'
      }`}
      style={{ background: tone.soft, color: tone.fg, border: `1px solid ${tone.border}` }}
    >
      <tone.icon size={size === 'sm' ? 13 : 15} aria-hidden="true" />
      {t(LEVEL_KEY[level])}
    </span>
  )
}

export default function ScamShieldView() {
  const { t } = useTranslation()
  const timeAgo = useTimeAgo()

  const [tab, setTab] = useState<Tab>('url')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ScamCheckHistoryEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /**
   * 🚨 Read AFTER mount, never during render. The server has no `localStorage`, so seeding state
   * from it directly would hydrate a server-rendered empty list against a client-rendered
   * populated one. Starting empty and filling in an effect is also honest about the real initial
   * state: a first-time visitor genuinely has no history.
   */
  useEffect(() => { setHistory(readHistory()) }, [])

  /** The one place a history row is created, and only from a result the engine actually returned. */
  const remember = useCallback((checked: CheckResult) => {
    setHistory(recordCheck(checked))
  }, [])

  async function handleUrlCheck(raw?: string) {
    const target = (raw ?? url).trim()
    if (!target || loading) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/scam-shield/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as Record<string, string>))
        const key = ERROR_I18N[data.error as string]
        setError(key ? t(key) : t('scamShield.error.checkFailed'))
        return
      }
      const checked: CheckResult = await res.json()
      setResult(checked)
      remember(checked)
    } catch {
      setError(t('scamShield.error.invalidUrl'))
    } finally {
      setLoading(false)
    }
  }

  async function handleQrUpload(file: File) {
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch('/api/scam-shield/qr', { method: 'POST', body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as Record<string, string>))
        const key = ERROR_I18N[data.error as string]
        setError(key ? t(key) : t('scamShield.error.qrFailed'))
        return
      }
      const checked: CheckResult = await res.json()
      setResult(checked)
      remember(checked)
    } catch {
      setError(t('scamShield.error.qrDecode'))
    } finally {
      setLoading(false)
    }
  }

  function switchTab(next: Tab) {
    setTab(next)
    setResult(null)
    setError(null)
  }

  function forget() {
    clearHistory()
    setHistory([])
    setExpanded(false)
  }

  const shown = expanded ? history : history.slice(0, HISTORY_PREVIEW)

  return (
    <V3Shell
      title={t('v3.nav.scamShield')}
      subtitle={t('v3.scam.tagline')}
      activeTab="/scam-shield"
    >
      {/* One column, wide: the input is still the widest thing on screen and nothing competes
          with it — the hero above it says what the input is for.

          🔑 `--ss-high` is declared HERE, on the feature's own root, and nowhere else. HIGH is
          the one risk level with no colour in the V3 palette (it sits between amber MEDIUM and
          rose CRITICAL), and a colour used by exactly one surface does not belong in `:root` —
          that would hand every other page a seventh brand colour the design system never asked
          for. Scoping it here keeps the light/dark pair that `globals.css` would have given it,
          using the app's own `dark` class, and it reaches both the verdict card and the history
          badges because both render inside this element. */}
      <div className="v3-scam-frame mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8 [--ss-high:#B4400C] dark:[--ss-high:#FB923C]" data-scam-root>
        <div className="space-y-5">

          {/* ── Header: identity + the way to the history further down ── */}
          <header className="flex flex-wrap items-center gap-4" data-scam-header>
            <span className="v3-scam-brand flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl sm:h-16 sm:w-16" aria-hidden="true">
              <Shield size={30} strokeWidth={2.1} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.01em] sm:text-[30px]" style={{ color: 'var(--v3-fg)' }}>
                {t('v3.nav.scamShield')}
              </h1>
              <p className="mt-0.5 text-[13.5px] leading-snug sm:text-[15px]" style={{ color: 'var(--v3-fg-muted)' }}>
                {t('v3.scam.tagline')}
              </p>
            </div>
            {/* The history lives on THIS page (device-local store); the button is an anchor to it. */}
            {/* Below `sm` the link takes its own row, so the title never fights it for width. */}
            <a
              href="#scam-shield-history"
              className="v3-chip v3-scam-tab v3-scam-seeall inline-flex w-full items-center justify-center gap-2 sm:w-auto"
              data-scam-history-link
            >
              <Clock size={16} aria-hidden="true" />
              {t('v3.scam.historyLink')}
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </header>

          {/* ── Hero ── */}
          <section className="v3-scam-hero" aria-labelledby="scam-hero-title" data-scam-hero>
            <div className="v3-scam-stars" aria-hidden="true" />
            <div className="flex flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8 md:flex-row md:items-center lg:gap-8">
              <div className="min-w-0 flex-1">
                <span className="v3-scam-eyebrow inline-flex min-h-[36px] items-center gap-2 rounded-full px-4 text-[12.5px] font-bold uppercase tracking-[0.08em]">
                  <ShieldCheck size={15} aria-hidden="true" />
                  {t('v3.scam.heroEyebrow')}
                </span>
                <h2 id="scam-hero-title" className="mt-4 text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[40px] lg:text-[46px]">
                  {t('v3.scam.heroTitle1')}
                  <br />
                  <span className="v3-scam-hero-accent">{t('v3.scam.heroTitle2')}</span>
                </h2>
                <p className="v3-scam-hero-muted mt-4 max-w-[52ch] text-[14.5px] leading-relaxed sm:text-[16px]">
                  {t('v3.scam.heroBody')}
                </p>
              </div>

              {/* The scene: a globe outline, an orbit, three ILLUSTRATION chips (icon-only — no
                  verdict words, because nothing has been checked yet) and Tappy holding the shield
                  — the owner's `recommendation` pose, reused. */}
              <div className="relative mx-auto h-[240px] w-full max-w-[360px] flex-shrink-0 sm:h-[280px] md:w-[46%] md:max-w-[440px]" aria-hidden="true" data-scam-scene>
                <span className="v3-scam-globe" style={{ width: '70%', height: '70%', right: '-4%', top: '4%', aspectRatio: '1' }} />
                <span className="v3-scam-orbit" style={{ width: '120%', height: '120%', left: '-10%', top: '-8%' }} />
                <span className="v3-scam-float" data-tone="https" style={{ left: '4%', top: '12%' }}><Lock size={14} />https://</span>
                <span className="v3-scam-float" data-tone="ok" style={{ left: '0%', top: '52%' }}><ShieldCheck size={16} /></span>
                <span className="v3-scam-float" data-tone="risk" style={{ right: '0%', top: '30%' }}><ShieldAlert size={16} /></span>
                <div className="v3-scam-mascot absolute inset-x-0 bottom-0 flex justify-center">
                  <TappyPresence pose="recommendation" size={200} aura="calm" className="max-w-[200px] sm:max-w-[240px]" />
                </div>
              </div>
            </div>

            <ul className="grid grid-cols-1 gap-2.5 px-5 pb-6 sm:grid-cols-2 sm:gap-3 sm:px-8 sm:pb-8 xl:grid-cols-4" data-scam-features>
              {FEATURES.map(f => (
                <li key={f.titleKey} className="v3-scam-feat" data-tone={f.tone}>
                  <span className="v3-scam-feat-icon" aria-hidden="true"><f.icon size={20} /></span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold leading-tight sm:text-[14px]">{t(f.titleKey)}</span>
                    <span className="v3-scam-feat-desc mt-0.5 block text-[11.5px] leading-snug sm:text-[12px]">{t(f.descKey)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* ── The check itself ── */}
          <section className="v3-scam-tool p-4 sm:p-5" aria-label={t('v3.scam.title')} data-scam-tool>
            {/* QR is REAL functionality with its own decoder and SSRF boundary — the reference
                simply did not picture it. Dropping a working capability to match a mockup would be
                a product decision smuggled in as a visual one, so it stays as a second tab. */}
            <div className="v3-scroll-x -mx-1 flex gap-2 px-1 pb-1" role="tablist">
              {(['url', 'qr'] as const).map(id => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => switchTab(id)}
                  className={`v3-chip v3-scam-tab flex-shrink-0 ${tab === id ? 'v3-chip-active' : ''}`}
                >
                  {id === 'url' ? <Link2 size={16} aria-hidden="true" /> : <QrCode size={16} aria-hidden="true" />}
                  {id === 'url' ? t('v3.scam.tabUrl') : t('scamShield.qrUpload')}
                </button>
              ))}
            </div>

            {tab === 'url' && (
              // Input and button share a row from `sm`; below that the button stacks under it.
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Link2
                    size={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--v3-fg-muted)' }}
                  />
                  <input
                    type="url"
                    inputMode="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUrlCheck()}
                    placeholder={t('scamShield.urlPlaceholder')}
                    disabled={loading}
                    aria-label={t('v3.scam.title')}
                    className="v3-scam-input min-h-[52px] w-full rounded-2xl py-3 pl-12 pr-11 text-[15px] disabled:opacity-50"
                  />
                  {loading && (
                    <Loader2
                      size={18}
                      className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin"
                      style={{ color: 'var(--v3-accent)' }}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleUrlCheck()}
                  disabled={!url.trim() || loading}
                  className="v3-scam-brand v3-scam-cta flex min-h-[52px] flex-shrink-0 items-center justify-center gap-2 rounded-2xl px-6 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {loading
                    ? <><Loader2 size={17} className="animate-spin" aria-hidden="true" />{t('scamShield.checking')}</>
                    : <><Search size={17} aria-hidden="true" />{t('v3.scam.cta')}</>}
                </button>
              </div>
            )}

            {tab === 'qr' && (
              <div className="mt-4">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleQrUpload(file)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={loading}
                  className="v3-scam-drop flex min-h-[44px] w-full flex-col items-center justify-center gap-3 rounded-2xl py-10 disabled:opacity-50"
                >
                  {loading
                    ? <Loader2 size={30} className="animate-spin" style={{ color: 'var(--v3-accent)' }} aria-hidden="true" />
                    : <Upload size={30} aria-hidden="true" />}
                  <span className="text-[13.5px]">
                    {loading ? t('scamShield.checking') : t('scamShield.qrUpload')}
                  </span>
                </button>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mt-3 rounded-xl border px-3.5 py-3 text-[13px]"
                style={{
                  background: 'rgba(248,113,113,0.10)',
                  borderColor: 'var(--v3-rose)',
                  color: 'var(--v3-rose)',
                }}
              >
                {error}
              </div>
            )}
          </section>

          {/* ── Verdict ── */}
          {result && <ScamShieldResult result={result} />}

          {/* ── Recent checks, on this device ── */}
          <section id="scam-shield-history" className="v3-scam-tool scroll-mt-24 p-4 sm:p-5" aria-labelledby="scam-history-title" data-scam-history>
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
                aria-hidden="true"
              >
                <Clock size={16} />
              </span>
              <h2 id="scam-history-title" className="flex-1 text-[16px] font-bold" style={{ color: 'var(--v3-fg)' }}>
                {t('v3.scam.historyTitle')}
              </h2>
              {history.length > HISTORY_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setExpanded(v => !v)}
                  className="v3-scam-seeall inline-flex min-h-[40px] items-center gap-1 text-[13px] font-semibold"
                >
                  {expanded ? t('v3.scam.historyLess') : t('v3.scam.historyAll')}
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="mt-4 text-[13.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
                {t('v3.scam.empty')}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {shown.map(entry => (
                  <li key={`${entry.url}-${entry.checkedAt}`}>
                    {/* Re-runs the check rather than replaying the stored verdict. A row is a
                        shortcut back to the engine, never a cached answer standing in for it. */}
                    <button
                      type="button"
                      onClick={() => { setTab('url'); setUrl(entry.url); handleUrlCheck(entry.url) }}
                      disabled={loading}
                      title={`${entry.url} — ${t('v3.scam.recheck')}`}
                      className="v3-scam-row flex min-h-[56px] w-full items-center gap-3 p-2.5 text-left disabled:opacity-50"
                    >
                      <span
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background: LEVEL_TONE[entry.level].soft,
                          color: LEVEL_TONE[entry.level].fg,
                        }}
                        aria-hidden="true"
                      >
                        <Globe size={17} />
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-[13.5px] font-semibold"
                        style={{ color: 'var(--v3-fg)' }}
                      >
                        {displayHost(entry.url)}
                      </span>
                      <LevelBadge level={entry.level} size="sm" />
                      <span
                        className="hidden flex-shrink-0 text-[12px] sm:block"
                        style={{ color: 'var(--v3-fg-muted)' }}
                      >
                        {timeAgo(entry.checkedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>
                {t('v3.scam.historyLocal')}
              </p>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={forget}
                  className="flex min-h-[40px] flex-shrink-0 items-center gap-1.5 text-[12.5px] font-semibold hover:underline focus:outline-none focus-visible:ring-2"
                  style={{ color: 'var(--v3-fg-muted)' }}
                >
                  <Trash2 size={13} aria-hidden="true" />
                  {t('v3.scam.historyClear')}
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </V3Shell>
  )
}
