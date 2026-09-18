'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Shield, Link2, QrCode, Upload, Loader2, Search, Clock, Globe, Trash2 } from 'lucide-react'
import type { CheckResult, RiskLevel } from '@/lib/scam-shield/types'
import {
  readHistory, recordCheck, clearHistory,
  type ScamCheckHistoryEntry,
} from '@/lib/scam-shield/history'
import V3Shell from '@/components/v3/V3Shell'
import { getAttribution, setSessionSource } from '@/lib/analytics/attribution'
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
  // G1 wedge attribution: a session that STARTED on Scam Shield (no more specific
  // source captured) is a wedge_scam entry. Never overrides a share/GEO/QR source.
  useEffect(() => { if (getAttribution().source === 'direct') setSessionSource('wedge_scam') }, [])

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
      {/* One column, not the twelve-panel Home grid. This page has a single job and the layout
          should say so: the input is the widest thing on screen and nothing competes with it.

          🔑 `--ss-high` is declared HERE, on the feature's own root, and nowhere else. HIGH is
          the one risk level with no colour in the V3 palette (it sits between amber MEDIUM and
          rose CRITICAL), and a colour used by exactly one surface does not belong in `:root` —
          that would hand every other page a seventh brand colour the design system never asked
          for. Scoping it here keeps the light/dark pair that `globals.css` would have given it,
          using the app's own `dark` class, and it reaches both the verdict card and the history
          badges because both render inside this element. */}
      <div className="mx-auto w-full max-w-[680px] space-y-4 [--ss-high:#B4400C] dark:[--ss-high:#FB923C]">

        {/* ── Identity + the check itself ──────────────────────────────── */}
        <section className="v3-panel p-5 sm:p-6">
          <div className="flex items-center gap-3.5">
            <span
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl"
              style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
              aria-hidden="true"
            >
              <Shield size={26} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <h1
                className="text-[19px] font-extrabold uppercase leading-tight tracking-[0.06em] sm:text-[22px]"
                style={{ color: 'var(--v3-fg)' }}
              >
                {t('v3.nav.scamShield')}
              </h1>
              <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>
                {t('v3.scam.tagline')}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
              aria-hidden="true"
            >
              <Link2 size={16} />
            </span>
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--v3-fg)' }}>
              {t('v3.scam.title')}
            </h2>
          </div>

          {/* QR is REAL functionality with its own decoder and SSRF boundary — the reference
              simply did not picture it. Dropping a working capability to match a mockup would be
              a product decision smuggled in as a visual one, so it stays as a second tab. */}
          <div
            className="mt-3 flex gap-1 rounded-xl p-1"
            style={{ background: 'var(--v3-panel-elevated)' }}
            role="tablist"
          >
            {(['url', 'qr'] as const).map(id => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => switchTab(id)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-semibold transition-colors"
                style={tab === id
                  ? { background: 'var(--v3-panel)', color: 'var(--v3-fg)' }
                  : { color: 'var(--v3-fg-muted)' }}
              >
                {id === 'url' ? <Search size={15} /> : <QrCode size={15} />}
                {id === 'url' ? 'URL' : 'QR'}
              </button>
            ))}
          </div>

          {tab === 'url' && (
            <div className="mt-3 space-y-3">
              <div className="relative">
                <Link2
                  size={17}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
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
                  className="w-full rounded-xl border py-3 pl-11 pr-11 text-[14px] outline-none transition-colors focus:border-[var(--v3-accent)] disabled:opacity-50"
                  style={{
                    background: 'var(--v3-panel-elevated)',
                    borderColor: 'var(--v3-border)',
                    color: 'var(--v3-fg)',
                  }}
                />
                {loading && (
                  <Loader2
                    size={18}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin"
                    style={{ color: 'var(--v3-accent)' }}
                  />
                )}
              </div>
              <button
                onClick={() => handleUrlCheck()}
                disabled={!url.trim() || loading}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl text-[14.5px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
              >
                {loading
                  ? <><Loader2 size={17} className="animate-spin" />{t('scamShield.checking')}</>
                  : <><Search size={17} />{t('v3.scam.cta')}</>}
              </button>
            </div>
          )}

          {tab === 'qr' && (
            <div className="mt-3">
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
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-10 transition-colors disabled:opacity-50"
                style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border-strong)' }}
              >
                {loading
                  ? <Loader2 size={30} className="animate-spin" style={{ color: 'var(--v3-accent)' }} />
                  : <Upload size={30} style={{ color: 'var(--v3-fg-muted)' }} />}
                <span className="text-[13px]" style={{ color: 'var(--v3-fg-muted)' }}>
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

        {/* ── Verdict ──────────────────────────────────────────────────── */}
        {result && <ScamShieldResult result={result} />}

        {/* ── Recent checks, on this device ────────────────────────────── */}
        <section className="v3-panel p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
              aria-hidden="true"
            >
              <Clock size={16} />
            </span>
            <h2 className="flex-1 text-[15px] font-bold" style={{ color: 'var(--v3-fg)' }}>
              {t('v3.scam.historyTitle')}
            </h2>
            {history.length > HISTORY_PREVIEW && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-[12.5px] font-semibold hover:underline"
                style={{ color: 'var(--v3-accent)' }}
              >
                {expanded ? t('v3.scam.historyLess') : t('v3.scam.historyAll')}
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="mt-4 text-[13px]" style={{ color: 'var(--v3-fg-muted)' }}>
              {t('v3.scam.empty')}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {shown.map(entry => (
                <li key={`${entry.url}-${entry.checkedAt}`}>
                  {/* Re-runs the check rather than replaying the stored verdict. A row is a
                      shortcut back to the engine, never a cached answer standing in for it. */}
                  <button
                    onClick={() => { setTab('url'); setUrl(entry.url); handleUrlCheck(entry.url) }}
                    disabled={loading}
                    title={`${entry.url} — ${t('v3.scam.recheck')}`}
                    className="v3-tile flex w-full items-center gap-3 p-2.5 text-left disabled:opacity-50"
                  >
                    <span
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{
                        background: LEVEL_TONE[entry.level].soft,
                        color: LEVEL_TONE[entry.level].fg,
                      }}
                      aria-hidden="true"
                    >
                      <Globe size={16} />
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-[13.5px] font-medium"
                      style={{ color: 'var(--v3-fg)' }}
                    >
                      {displayHost(entry.url)}
                    </span>
                    <LevelBadge level={entry.level} size="sm" />
                    <span
                      className="hidden flex-shrink-0 text-[11.5px] sm:block"
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
            <p className="text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
              {t('v3.scam.historyLocal')}
            </p>
            {history.length > 0 && (
              <button
                onClick={forget}
                className="flex flex-shrink-0 items-center gap-1.5 text-[12px] font-semibold hover:underline"
                style={{ color: 'var(--v3-fg-muted)' }}
              >
                <Trash2 size={13} />
                {t('v3.scam.historyClear')}
              </button>
            )}
          </div>
        </section>
      </div>
    </V3Shell>
  )
}
