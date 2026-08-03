'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'
import type { CheckResult, RiskLevel, RecommendedAction, EvidenceItem, OfficialEntity } from '@/lib/scam-shield/types'
import {
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, Info,
  ExternalLink, Phone, Flag, Search, CircleCheck, CircleAlert,
  ChevronDown, ChevronUp, Globe,
} from 'lucide-react'
import { useState } from 'react'

const LEVEL_STYLES: Record<RiskLevel, { bg: string; text: string; border: string; icon: typeof ShieldCheck }> = {
  SAFE: { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-400', border: 'border-green-200 dark:border-green-800', icon: ShieldCheck },
  LOW: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800', icon: ShieldCheck },
  MEDIUM: { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-200 dark:border-yellow-800', icon: ShieldAlert },
  HIGH: { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800', icon: ShieldX },
  CRITICAL: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800', icon: ShieldX },
}

const LEVEL_KEY: Record<RiskLevel, string> = {
  SAFE: 'scamShield.result.safe',
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

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const { t } = useTranslation()
  if (confidence >= 80) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{t('scamShield.confidence.high')}</span>
  }
  if (confidence >= 50) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">{t('scamShield.confidence.medium')}</span>
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">{t('scamShield.confidence.low')}</span>
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    safe: 'bg-green-500',
    info: 'bg-blue-500',
    warning: 'bg-yellow-500',
    critical: 'bg-red-500',
  }
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[severity] ?? 'bg-gray-400'}`} />
}

function EvidenceSection({ items }: { items: EvidenceItem[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  if (items.length === 0) return null

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {t('scamShield.evidence')}
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="space-y-2 mt-1">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm">
              <SeverityDot severity={item.severity} />
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 dark:text-white font-medium text-xs">{item.source}</p>
                <p className="text-gray-600 dark:text-gray-400 text-xs mt-0.5">{item.summary}</p>
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

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {t('scamShield.actions')}
      </p>
      <div className="space-y-2">
        {actions.map((action, i) => {
          const Icon = ACTION_ICONS[action.icon] ?? CircleAlert
          const label = locale === 'vi' ? action.label_vi : action.label_en
          return (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
                action.priority === 'primary'
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-medium'
                  : 'bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
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

  return (
    <div className="mt-4 p-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
      <p className="text-sm font-medium text-green-800 dark:text-green-300 flex items-center gap-2">
        <Globe className="w-4 h-4" />
        {t('scamShield.official')}
      </p>
      <div className="mt-2 space-y-1.5 text-xs text-green-700 dark:text-green-400">
        <p className="font-semibold text-sm">{entity.brand}</p>
        <p>
          <span className="text-green-600 dark:text-green-500">{t('scamShield.official.website')}: </span>
          <a href={entity.website} target="_blank" rel="noopener noreferrer" className="underline">{entity.website}</a>
        </p>
        {entity.hotline && (
          <p>
            <span className="text-green-600 dark:text-green-500">{t('scamShield.official.hotline')}: </span>
            <a href={`tel:${entity.hotline.replace(/\s/g, '')}`} className="underline">{entity.hotline}</a>
          </p>
        )}
      </div>
    </div>
  )
}

export default function ScamShieldResult({ result }: { result: CheckResult }) {
  const { t, locale } = useTranslation()
  const style = LEVEL_STYLES[result.risk.level]
  const Icon = style.icon

  return (
    <div className={`mt-5 rounded-2xl border ${style.border} ${style.bg} overflow-hidden`}>
      {/* Score header */}
      <div className="p-4 flex items-center gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${style.bg}`}>
          <Icon className={`w-6 h-6 ${style.text}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${style.text}`}>
              {t(LEVEL_KEY[result.risk.level])}
            </span>
            <ConfidenceBadge confidence={result.risk.confidence} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {result.url}
          </p>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${style.text}`}>{result.risk.score}</div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Score</div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-4">
        {result.officialMatch && <OfficialSection entity={result.officialMatch} />}
        <ActionsSection actions={result.actions} locale={locale} />
        <EvidenceSection items={result.evidence.items} />
      </div>
    </div>
  )
}
