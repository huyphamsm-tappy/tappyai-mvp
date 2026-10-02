'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'
import type { CheckResult, RiskLevel, RecommendedAction, EvidenceItem, OfficialEntity } from '@/lib/scam-shield/types'
import { linkVerdict, type Verdict } from '@/lib/scam-shield/verdict'
import {
  ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, AlertTriangle,
  ExternalLink, Phone, Flag, Search, CircleCheck, CircleAlert,
  ChevronDown, ChevronUp, Globe,
} from 'lucide-react'
import { useState } from 'react'
import ScamShareButton from './ScamShareButton'

/**
 * The appearance of every risk level, in the V3 palette. Exported because the history rows in
 * `ScamShieldView` render the same verdicts and must not invent a second colour language for
 * them — one definition, two call sites.
 *
 * 🚨 SIX LEVELS, EACH WITH ITS OWN HUE, AND THE SCALE IS THE ENGINE'S — NOT A MOCKUP'S.
 * The visual reference showed three badges (safe / warning / danger). Mapping six onto three
 * would be a scoring change made in a stylesheet, so the reference was followed for SHAPE and
 * the engine for MEANING.
 *
 * 🔑 HIGH IS THE ONE HUE THE V3 PALETTE DOES NOT HAVE. It sits between MEDIUM (amber) and
 * CRITICAL (rose), and sharing a colour with either neighbour erases a distinction the engine
 * went to some trouble to make. It reads `--ss-high`, which is declared by THIS FEATURE on the
 * Scam Shield page root (see `ScamShieldView`) rather than by `globals.css` — a colour used on
 * one surface is not a design token, and adding it to `:root` would offer every other page a
 * seventh brand colour nothing in the system asks for. The literal fallback keeps the light
 * value if the component is ever rendered outside that root.
 *
 * Both values are tuned the way the V3 palette tunes its own: dark and saturated for AA on the
 * white card, bright for the dark one.
 *
 * 🚨 INCONCLUSIVE IS NEUTRAL, DELIBERATELY. It is not a point on the scale — it is what the
 * engine reports when too little of the evidence base responded to stand behind ANY answer. A
 * green shield over it would restore precisely the false reassurance the engine was changed to
 * stop, and a red one would invent a threat nobody found. Slate plus the question glyph: visibly
 * not a verdict, and visibly not a clean bill of health.
 *
 * `Record<RiskLevel, …>` is load-bearing — adding a level to the union fails the build here
 * until it has been given a deliberate appearance, rather than rendering as `undefined`.
 */
export const LEVEL_TONE: Record<RiskLevel, {
  fg: string
  soft: string
  border: string
  icon: typeof ShieldCheck
}> = {
  SAFE:         { fg: 'var(--v3-emerald)', soft: 'rgba(16,185,129,0.14)',  border: 'rgba(16,185,129,0.34)',  icon: ShieldCheck },
  LOW:          { fg: 'var(--v3-accent)',  soft: 'var(--v3-accent-soft)',  border: 'rgba(51,145,255,0.34)',  icon: ShieldCheck },
  MEDIUM:       { fg: 'var(--v3-amber)',   soft: 'rgba(245,158,11,0.16)',  border: 'rgba(245,158,11,0.38)',  icon: ShieldAlert },
  HIGH:         { fg: 'var(--ss-high, #B4400C)', soft: 'rgba(249,115,22,0.16)', border: 'rgba(249,115,22,0.40)', icon: ShieldAlert },
  CRITICAL:     { fg: 'var(--v3-rose)',    soft: 'rgba(244,63,94,0.16)',   border: 'rgba(244,63,94,0.42)',   icon: ShieldX },
  INCONCLUSIVE: { fg: 'var(--v3-fg-secondary)', soft: 'var(--v3-panel-elevated)', border: 'var(--v3-border-strong)', icon: ShieldQuestion },
}

export const LEVEL_KEY: Record<RiskLevel, string> = {
  SAFE: 'scamShield.result.safe',
  INCONCLUSIVE: 'scamShield.result.inconclusive',
  LOW: 'scamShield.result.low',
  MEDIUM: 'scamShield.result.medium',
  HIGH: 'scamShield.result.high',
  CRITICAL: 'scamShield.result.critical',
}

const ACTION_ICONS: Record<string, typeof ShieldCheck> = {
  stop: ShieldX,
  link: ExternalLink,
  phone: Phone,
  flag: Flag,
  warning: AlertTriangle,
  search: Search,
  check: CircleCheck,
}

/** The verdict of a link-shaped result (link tab, or a link read from a QR), from the server's `verdict`
 *  when present and otherwise from the level — so a cached or older payload still gets the three states. */
export function verdictOfLinkResult(result: Pick<CheckResult, 'verdict' | 'risk'>): Verdict {
  return result.verdict ?? linkVerdict(result.risk.level)
}

/** Short badge text for a link verdict (history rows) — never a safety word, never a number. */
export function linkBadgeKey(level: RiskLevel): string {
  return `scamVerdict.link.short.${linkVerdict(level)}`
}

/** "TappyAI không thay thế cơ quan chức năng." — printed under EVERY verdict (message, link, QR). */
export function VerdictDisclaimer() {
  const { t } = useTranslation()
  return (
    <p className="mt-4 text-[12px] font-semibold leading-snug" style={{ color: 'var(--v3-fg-muted)' }} data-scam-disclaimer>
      {t('scamVerdict.disclaimer')}
    </p>
  )
}

const SEVERITY_COLOR: Record<string, string> = {
  safe: 'var(--v3-emerald)',
  info: 'var(--v3-accent)',
  warning: 'var(--v3-amber)',
  critical: 'var(--v3-rose)',
}

function SeverityDot({ severity }: { severity: string }) {
  return (
    <span
      className="mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full"
      style={{ background: SEVERITY_COLOR[severity] ?? 'var(--v3-fg-muted)' }}
      aria-hidden="true"
    />
  )
}

function EvidenceSection({ items }: { items: EvidenceItem[] }) {  // eslint-disable-line prefer-const
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  // 02/10: rows that read as reassurance ("certificate valid", "not on a blocklist") are not shown.
  items = items.filter(i => i.severity !== 'safe')
  if (items.length === 0) return null

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-2 text-[13px] font-semibold"
        style={{ color: 'var(--v3-fg-secondary)' }}
      >
        {t('scamShield.evidence')}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="mt-1 space-y-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-lg p-2.5"
              style={{ background: 'var(--v3-panel-elevated)' }}
            >
              <SeverityDot severity={item.severity} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{item.source}</p>
                <p className="mt-0.5 text-[12px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>{item.summary}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionsSection({ actions, locale }: { actions: RecommendedAction[]; locale: string }) {
  const { t } = useTranslation()
  if (actions.length === 0) return null

  return (
    <div className="mt-4">
      <p className="mb-2 text-[13px] font-semibold" style={{ color: 'var(--v3-fg-secondary)' }}>
        {t('scamShield.actions')}
      </p>
      <div className="space-y-2">
        {actions.map((action, i) => {
          const Icon = ACTION_ICONS[action.icon] ?? CircleAlert
          const label = locale === 'vi' ? action.label_vi : action.label_en
          const primary = action.priority === 'primary'
          return (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg p-3 text-[13px] leading-snug"
              style={primary
                ? { background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)', fontWeight: 600 }
                : { background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
            >
              <Icon size={16} className="mt-0.5 flex-shrink-0" />
              <span>{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OfficialSection({ entity }: { entity: OfficialEntity }) {
  const { t } = useTranslation()
  const tone = LEVEL_TONE.INCONCLUSIVE

  return (
    <div
      className="mt-4 rounded-xl border p-3.5"
      style={{ background: tone.soft, borderColor: tone.border }}
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: tone.fg }}>
        <Globe size={15} />
        {t('scamShield.official')}
      </p>
      <div className="mt-2 space-y-1.5">
        <p className="text-[14px] font-bold" style={{ color: 'var(--v3-fg)' }}>{entity.brand}</p>
        <p className="text-[12px]" style={{ color: 'var(--v3-fg-secondary)' }}>
          {t('scamShield.official.website')}:{' '}
          <a href={entity.website} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: tone.fg }}>
            {entity.website}
          </a>
        </p>
        {entity.hotline && (
          <p className="text-[12px]" style={{ color: 'var(--v3-fg-secondary)' }}>
            {t('scamShield.official.hotline')}:{' '}
            <a href={`tel:${entity.hotline.replace(/\s/g, '')}`} className="underline" style={{ color: tone.fg }}>
              {entity.hotline}
            </a>
          </p>
        )}
      </div>
    </div>
  )
}

export default function ScamShieldResult({ result }: { result: CheckResult }) {
  const { t, locale } = useTranslation()
  const verdict = verdictOfLinkResult(result)
  // The card's colour follows the VERDICT (three states), not the engine's six levels.
  const tone = LEVEL_TONE[verdict === 'familiar' ? 'HIGH' : verdict === 'suspicious' ? 'MEDIUM' : 'INCONCLUSIVE']
  const Icon = tone.icon
  // Specific reasons: only what the engine actually found (warning / critical), never "all clear" rows.
  const reasons = result.evidence.items.filter(i => i.severity === 'critical' || i.severity === 'warning').slice(0, 6)

  return (
    <section
      className="v3-panel overflow-hidden"
      // The verdict is the one place on this page where colour carries meaning rather than
      // decoration, so the whole card takes the verdict's tint instead of a neutral panel.
      style={{ background: tone.soft, borderColor: tone.border }}
      aria-live="polite"
      data-scam-link-result={verdict}
    >
      <div className="flex items-center gap-3.5 p-4 sm:p-5">
        <span
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl"
          style={{ background: 'var(--v3-panel)', color: tone.fg }}
          aria-hidden="true"
        >
          <Icon size={26} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[17px] font-extrabold leading-tight" style={{ color: tone.fg }}>
            {t(`scamVerdict.link.${verdict}.title`)}
          </span>
          <p className="mt-0.5 truncate text-[12px]" style={{ color: 'var(--v3-fg-muted)' }} title={result.url}>
            {result.url}
          </p>
        </div>
      </div>

      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <p className="rounded-xl p-3.5 text-[13.5px] leading-relaxed" style={{ background: 'var(--v3-panel)', color: 'var(--v3-fg)' }}>
          {t(`scamVerdict.link.${verdict}.body`)}
        </p>
        {reasons.length > 0 && (
          <div className="mt-4" data-scam-reasons>
            <p className="mb-2 text-[13px] font-semibold" style={{ color: 'var(--v3-fg-secondary)' }}>{t('scamVerdict.link.reasons')}</p>
            <ul className="space-y-2">
              {reasons.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 rounded-lg p-2.5" style={{ background: 'var(--v3-panel-elevated)' }}>
                  <SeverityDot severity={item.severity} />
                  <span className="text-[12.5px] leading-snug" style={{ color: 'var(--v3-fg)' }}>{item.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.officialMatch && <OfficialSection entity={result.officialMatch} />}
        {/* The INCONCLUSIVE action text IS the "unrecognised" body above, so it is not repeated. */}
        <ActionsSection actions={verdict === 'unrecognized' ? result.actions.filter(a => a.action !== 'INCONCLUSIVE') : result.actions} locale={locale} />
        {/* G1 wedge: one tap turns the verdict into a public page the group can be warned with. */}
        <ScamShareButton result={result} />
        <EvidenceSection items={result.evidence.items} />
        <VerdictDisclaimer />
      </div>
    </section>
  )
}
