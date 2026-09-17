'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'
import type { MessageAnalysisResult, MessageSignal, AdviceItem, UrlCheckSummary } from '@/lib/scam-shield/message/types'
import { Ban, CheckCircle2, Crosshair, Globe, Info, ScanText, Sparkles } from 'lucide-react'
import { LEVEL_TONE, LEVEL_KEY, ConfidenceBadge } from './ScamShieldResult'
import { FREE_DAILY_LIMIT } from '@/lib/config/product'

// ── Scam Shield · the message verdict card ──────────────────────────────────
//
// The same skin as the URL card (`ScamShieldResult`): the level's tint on the whole card, the
// same six-level vocabulary, the same confidence badge. What differs is the body — a message
// verdict is about what the sender is trying to make the reader DO, so the card reads top to
// bottom as: verdict → why → what they want → what NOT to do → what to do now → the links.
//
// Every string here is a dictionary key or a value the server localised (rule explanations,
// advice labels in both languages, model text in the request locale). Nothing is hardcoded.

/** The response shape, with the route's quota block — the ONE shared Tappy AI question pool. */
export type MessageAnalysisResponse = MessageAnalysisResult & {
  quota: {
    kind: 'user' | 'anon' | 'guest'
    limit: number
    period: 'day' | 'lifetime'
    used: number | null
    remaining: number | null
    exhausted: boolean
    pro: boolean
  } | null
}

const SEVERITY_COLOR: Record<MessageSignal['severity'], string> = {
  low: 'var(--v3-accent)',
  medium: 'var(--v3-amber)',
  high: 'var(--v3-rose)',
}

function Heading({ icon: Icon, children, color }: { icon: typeof Info; children: React.ReactNode; color?: string }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold" style={{ color: color ?? 'var(--v3-fg-secondary)' }}>
      <Icon size={15} aria-hidden="true" />
      {children}
    </p>
  )
}

function AdviceList({ items, locale, tone }: { items: AdviceItem[]; locale: string; tone: 'stop' | 'go' }) {
  const Icon = tone === 'stop' ? Ban : CheckCircle2
  const color = tone === 'stop' ? 'var(--v3-rose)' : 'var(--v3-emerald)'
  return (
    <ul className="space-y-2">
      {items.map(item => (
        <li
          key={item.code}
          className="flex items-start gap-3 rounded-lg p-3 text-[13px] leading-snug"
          style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg)' }}
        >
          <Icon size={16} className="mt-0.5 flex-shrink-0" style={{ color }} aria-hidden="true" />
          <span>{locale === 'vi' ? item.label_vi : item.label_en}</span>
        </li>
      ))}
    </ul>
  )
}

function hostOf(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

function LinkRow({ check }: { check: UrlCheckSummary }) {
  const { t } = useTranslation()
  const level = check.status === 'checked' && check.level ? check.level : 'INCONCLUSIVE'
  const tone = LEVEL_TONE[level]
  return (
    <li className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: 'var(--v3-panel-elevated)' }}>
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: tone.soft, color: tone.fg }} aria-hidden="true">
        <Globe size={15} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }} title={check.url}>
        {hostOf(check.url)}
      </span>
      <span className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: tone.soft, color: tone.fg, border: `1px solid ${tone.border}` }}>
        {check.status === 'checked' ? t(LEVEL_KEY[level]) : t('v3.scam.msg.linkUnchecked')}
      </span>
    </li>
  )
}

/**
 * The one line that says how the verdict was reached — and, when the shared allowance is spent,
 * why the model was not consulted — plus the GLOBAL counter (remaining-of-limit for a guest's
 * lifetime trial, used-of-limit for an account's day), so nobody reads Scam Alerts as having an
 * allowance of its own. (The ratchet counts block comments, so the labels are not quoted here.)
 */
function AnalysisNote({ result }: { result: MessageAnalysisResponse }) {
  const { t } = useTranslation()
  const status = result.analysis.aiStatus
  const q = result.quota
  const key =
    status === 'used' ? 'v3.scam.msg.aiUsed'
    : status === 'not_needed' ? 'v3.scam.msg.aiNotNeeded'
    : status === 'quota_exhausted' ? 'v3.scam.msg.aiQuota'
    : status === 'unavailable' ? 'v3.scam.msg.aiUnavailable'
    : 'v3.scam.msg.aiFailed'
  const vars = q
    ? { n: String(q.limit), used: String(q.used ?? q.limit), period: t(q.period === 'lifetime' ? 'v3.scam.msg.perLifetime' : 'v3.scam.msg.perDay') }
    : { n: '', used: '', period: '' }
  const counter = !q ? null
    : q.pro ? t('v3.scam.msg.aiPro')
    : q.period === 'lifetime'
      ? t('v3.scam.msg.aiLeft', { remaining: String(q.remaining ?? 0), n: String(q.limit) })
      : t('v3.scam.msg.aiToday', { used: String(q.used ?? q.limit), n: String(q.limit) })
  return (
    <div className="mt-4 space-y-1 text-[12px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }} data-scam-ai-note={status}>
      <p className="flex items-start gap-2">
        <Sparkles size={13} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
        <span>{t(key, vars)}</span>
      </p>
      {counter && (
        <p className="pl-5 font-semibold" style={{ color: q?.exhausted ? 'var(--v3-rose)' : 'var(--v3-fg-secondary)' }} data-scam-ai-counter>
          {counter}
          {q?.exhausted && q.period === 'lifetime' && <span className="ml-1 font-normal">· {t('v3.scam.msg.aiQuotaGuest', { n: String(FREE_DAILY_LIMIT) })}</span>}
        </p>
      )}
    </div>
  )
}

export default function ScamMessageResult({ result }: { result: MessageAnalysisResponse }) {
  const { t, locale } = useTranslation()
  const tone = LEVEL_TONE[result.risk.level]
  const Icon = tone.icon
  const dangerous = result.risk.level === 'MEDIUM' || result.risk.level === 'HIGH' || result.risk.level === 'CRITICAL'

  return (
    <section
      className="v3-panel overflow-hidden"
      style={{ background: tone.soft, borderColor: tone.border }}
      aria-live="polite"
      data-scam-message-result={result.risk.level}
    >
      <div className="flex items-center gap-3.5 p-4 sm:p-5">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl" style={{ background: 'var(--v3-panel)', color: tone.fg }} aria-hidden="true">
          <Icon size={26} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-extrabold leading-tight" style={{ color: tone.fg }}>
              {t(LEVEL_KEY[result.risk.level])}
            </span>
            <ConfidenceBadge confidence={result.risk.confidence} />
          </div>
          {result.scamType && (
            <p className="mt-0.5 text-[12.5px] font-semibold" style={{ color: 'var(--v3-fg-secondary)' }}>
              {t(`v3.scam.msg.type.${result.scamType}`)}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-[24px] font-extrabold leading-none" style={{ color: tone.fg }}>{result.risk.score}</div>
          <div className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.11em]" style={{ color: 'var(--v3-fg-muted)' }}>
            {/* Language-neutral; the same word in both dictionaries. */}
            Score
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {/* The plain-language summary — the model's, or the server's deterministic fallback. */}
        {result.reasoningSummary && (
          <p className="rounded-xl p-3.5 text-[13.5px] leading-relaxed" style={{ background: 'var(--v3-panel)', color: 'var(--v3-fg)' }}>
            {result.reasoningSummary}
          </p>
        )}

        {result.attackGoal && (
          <div className="mt-4">
            <Heading icon={Crosshair}>{t('v3.scam.msg.goal')}</Heading>
            <p className="text-[13.5px] font-bold" style={{ color: tone.fg }}>{t(`v3.scam.msg.goal.${result.attackGoal}`)}</p>
          </div>
        )}

        {result.signals.length > 0 && (
          <div className="mt-4">
            <Heading icon={Info}>{t('v3.scam.msg.why')}</Heading>
            <ul className="space-y-2">
              {result.signals.map((s, i) => (
                <li key={`${s.type}-${i}`} className="flex items-start gap-2.5 rounded-lg p-2.5" style={{ background: 'var(--v3-panel-elevated)' }}>
                  <span className="mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[s.severity] }} aria-hidden="true" />
                  <span className="text-[12.5px] leading-snug" style={{ color: 'var(--v3-fg)' }}>{s.explanation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.requestedActions.length > 0 && (
          <div className="mt-4">
            <Heading icon={Crosshair}>{t('v3.scam.msg.wants')}</Heading>
            <ul className="list-disc space-y-1 pl-5 text-[12.5px]" style={{ color: 'var(--v3-fg-secondary)' }}>
              {result.requestedActions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        {result.advice.doNot.length > 0 && (
          <div className="mt-4">
            <Heading icon={Ban} color="var(--v3-rose)">{t('v3.scam.msg.doNot')}</Heading>
            <AdviceList items={result.advice.doNot} locale={locale} tone="stop" />
          </div>
        )}

        {result.advice.doNow.length > 0 && (
          <div className="mt-4">
            <Heading icon={CheckCircle2} color={dangerous ? 'var(--v3-emerald)' : undefined}>{t('v3.scam.msg.doNow')}</Heading>
            <AdviceList items={result.advice.doNow} locale={locale} tone="go" />
          </div>
        )}

        {result.urlChecks.length > 0 && (
          <div className="mt-4">
            <Heading icon={Globe}>{t('v3.scam.msg.links')}</Heading>
            <ul className="space-y-2">
              {result.urlChecks.map(c => <LinkRow key={c.url} check={c} />)}
            </ul>
          </div>
        )}

        {result.extractedText && (
          <details className="mt-4">
            <summary className="cursor-pointer text-[13px] font-semibold" style={{ color: 'var(--v3-fg-secondary)' }}>
              <ScanText size={14} className="mr-1.5 inline-block align-[-2px]" aria-hidden="true" />
              {t('v3.scam.msg.extracted')}
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg p-3 text-[12px] leading-snug" style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}>
              {result.extractedText}
            </pre>
          </details>
        )}

        <AnalysisNote result={result} />
      </div>
    </section>
  )
}
