'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  BookOpenCheck, BadgeCheck, ExternalLink, ChevronDown, ChevronUp, Ban, CheckCircle2, Crosshair, Info, Phone,
  ShieldAlert, Landmark, Bot, TrendingUp, ShoppingBag, DatabaseZap, type LucideIcon,
} from 'lucide-react'
import {
  KNOWLEDGE_CATEGORIES, datasetOf, scenariosIn,
  type KnowledgeCategory, type ScamScenario,
} from '@/lib/scam-shield/knowledge'

// ── Scam Shield · official anti-fraud knowledge library ─────────────────────
//
// A browsable, STATIC list of scam scenarios from an official authority. Nothing here fetches,
// calls a model, or touches a quota: the dataset is imported, filtered in memory, and rendered.
//
// 🚨 TWO KINDS OF TEXT, VISIBLY SEPARATED. Each open card shows the official text under
// "Thông tin từ nguồn chính thức" with the source link, and TappyAI's own guidance under a heading
// that says it is TappyAI's and not a quotation. The dataset keeps them in different fields
// (`official` / `guidance`), and this component keeps them in different blocks.
//
// Every chrome string is a dictionary key; scenario content is the dataset's Vietnamese, as
// published, in either UI language (the EN note says so).

/** How many cards show before "see more" — enough to browse, not a wall. */
const PREVIEW = 6

const CATEGORY_ICON: Record<KnowledgeCategory, LucideIcon> = {
  impersonation: Landmark,
  ai_deepfake: Bot,
  investment_jobs: TrendingUp,
  online_trading: ShoppingBag,
  data_theft: DatabaseZap,
}

/** Card tint per official group — the V3 palette's own hues, one per group. */
const CATEGORY_TONE: Record<KnowledgeCategory, { fg: string; soft: string }> = {
  impersonation: { fg: 'var(--v3-rose)', soft: 'rgba(244,63,94,0.12)' },
  ai_deepfake: { fg: 'var(--v3-accent)', soft: 'var(--v3-accent-soft)' },
  investment_jobs: { fg: 'var(--v3-emerald)', soft: 'rgba(16,185,129,0.12)' },
  online_trading: { fg: 'var(--v3-amber)', soft: 'rgba(245,158,11,0.14)' },
  data_theft: { fg: 'var(--ss-high, #B4400C)', soft: 'rgba(249,115,22,0.14)' },
}

function List({ items, icon: Icon, color }: { items: string[]; icon: LucideIcon; color: string }) {
  return (
    <ul className="space-y-1.5">
      {items.map(line => (
        <li key={line} className="flex items-start gap-2 text-[13px] leading-snug" style={{ color: 'var(--v3-fg)' }}>
          <Icon size={14} className="mt-0.5 flex-shrink-0" style={{ color }} aria-hidden="true" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  )
}

function ScenarioDetail({ scenario }: { scenario: ScamScenario }) {
  const { t, locale } = useTranslation()
  const dataset = datasetOf(scenario)
  const group = dataset.groups.find(g => g.category === scenario.category)
  const tone = CATEGORY_TONE[scenario.category]

  return (
    <div className="mt-3 space-y-4" data-kb-detail={scenario.id}>
      {/* ── Official block: verbatim text, source, dates. ── */}
      <div className="rounded-xl border p-3.5" style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.34)' }} data-kb-official>
        <p className="flex items-center gap-2 text-[12.5px] font-bold" style={{ color: 'var(--v3-emerald)' }}>
          <BadgeCheck size={15} aria-hidden="true" />
          {t('v3.scam.kb.official')}
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'var(--v3-fg)' }}>{scenario.official.summary}</p>
        {group && (
          <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: 'var(--v3-fg-secondary)' }}>
            <span className="font-semibold">{group.officialNumber}. {group.label}:</span> {group.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: 'var(--v3-fg-secondary)' }}>
          <span>{t('v3.scam.kb.source')}: <span className="font-semibold" style={{ color: 'var(--v3-fg)' }}>{scenario.source.organization}</span></span>
          {scenario.source.publishedAt && <span>{t('v3.scam.kb.published')} {scenario.source.publishedAt}</span>}
          <span>{t('v3.scam.kb.verifiedAt')} {scenario.source.verifiedAt}</span>
          <span>{t('v3.scam.kb.officialNumber', { n: String(scenario.officialNumber) })}</span>
        </div>
        <a
          href={scenario.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 text-[13px] font-semibold underline"
          style={{ color: 'var(--v3-emerald)' }}
          data-kb-source-link
        >
          <ExternalLink size={14} aria-hidden="true" />
          {t('v3.scam.kb.openSource')}: {scenario.source.title}
        </a>
      </div>

      {/* ── TappyAI block: derived guidance, labelled as such. ── */}
      <div className="rounded-xl p-3.5" style={{ background: 'var(--v3-panel-elevated)' }} data-kb-guidance>
        <p className="flex items-center gap-2 text-[12.5px] font-bold" style={{ color: 'var(--v3-fg-secondary)' }}>
          <Info size={15} aria-hidden="true" />
          {t('v3.scam.kb.guidance')}
        </p>
        <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.scam.kb.guidanceNote')}</p>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold" style={{ color: tone.fg }}>{t('v3.scam.kb.signs')}</p>
            <List items={scenario.guidance.warningSigns} icon={ShieldAlert} color={tone.fg} />
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold" style={{ color: tone.fg }}>{t('v3.scam.kb.requests')}</p>
            <List items={scenario.guidance.commonRequests} icon={Crosshair} color={tone.fg} />
            <p className="mt-3 mb-1 text-[12.5px] font-semibold" style={{ color: tone.fg }}>{t('v3.scam.kb.goal')}</p>
            <p className="text-[13px]" style={{ color: 'var(--v3-fg)' }}>{t(`v3.scam.msg.goal.${scenario.attackerGoal}`)}</p>
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold" style={{ color: 'var(--v3-rose)' }}>{t('v3.scam.kb.doNot')}</p>
            <List items={scenario.guidance.whatNotToDo} icon={Ban} color="var(--v3-rose)" />
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold" style={{ color: 'var(--v3-emerald)' }}>{t('v3.scam.kb.doNow')}</p>
            <List items={scenario.guidance.whatToDo} icon={CheckCircle2} color="var(--v3-emerald)" />
          </div>
        </div>
      </div>

      {/* ── The source's own prevention measures + hotline, verbatim. ── */}
      <div className="rounded-xl border p-3.5" style={{ borderColor: 'var(--v3-border-strong)' }} data-kb-prevention>
        <p className="text-[12.5px] font-bold" style={{ color: 'var(--v3-fg-secondary)' }}>{t('v3.scam.kb.prevention')}</p>
        <div className="mt-2">
          <List items={dataset.official.preventionMeasures} icon={CheckCircle2} color="var(--v3-emerald)" />
        </div>
        <p className="mt-3 flex items-start gap-2 text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
          <Phone size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--v3-rose)' }} aria-hidden="true" />
          <span>{t('v3.scam.kb.report')}: {dataset.official.reportAdvice}</span>
        </p>
      </div>
      {locale === 'en' && (
        <p className="text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.scam.kb.contentLanguage')}</p>
      )}
    </div>
  )
}

export default function ScamKnowledgeSection() {
  const { t } = useTranslation()
  const [category, setCategory] = useState<KnowledgeCategory | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const scenarios = scenariosIn(category)
  const shown = expanded ? scenarios : scenarios.slice(0, PREVIEW)

  function pick(next: KnowledgeCategory | 'all') {
    setCategory(next)
    setOpenId(null)
    setExpanded(false)
  }

  return (
    <section className="v3-scam-tool p-4 sm:p-5" aria-labelledby="scam-kb-title" data-scam-knowledge>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(16,185,129,0.14)', color: 'var(--v3-emerald)' }} aria-hidden="true">
          <BookOpenCheck size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="scam-kb-title" className="text-[16px] font-bold uppercase tracking-[0.02em]" style={{ color: 'var(--v3-fg)' }}>
            {t('v3.scam.kb.title')}
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.scam.kb.subtitle')}</p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--v3-emerald)' }}>
            <BadgeCheck size={13} aria-hidden="true" />
            {t('v3.scam.kb.official')} · {t('v3.scam.kb.source')}: {scenarios[0]?.source.organization}
          </p>
        </div>
      </div>

      {/* Category filters — the source's own five groups, plus "all". Wrapping, never scrolling.
          Filters, not tabs: they narrow one list rather than switch panels, so they are toggle
          buttons (`aria-pressed`) and do not compete with the tool's real tablist. */}
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t('v3.scam.kb.title')} data-kb-filters>
        {(['all', ...KNOWLEDGE_CATEGORIES] as const).map(id => (
          <button
            key={id}
            type="button"
            aria-pressed={category === id}
            onClick={() => pick(id)}
            className={`v3-chip v3-scam-tab flex-shrink-0 ${category === id ? 'v3-chip-active' : ''}`}
          >
            {id === 'all' ? t('v3.scam.kb.all') : t(`v3.scam.kb.cat.${id}`)}
          </button>
        ))}
      </div>

      <p className="mt-3 text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.scam.kb.count', { n: String(scenarios.length) })}</p>

      <ul className="mt-2 space-y-2" data-kb-cards>
        {shown.map(s => {
          const Icon = CATEGORY_ICON[s.category]
          const tone = CATEGORY_TONE[s.category]
          const open = openId === s.id
          return (
            <li key={s.id} className="v3-scam-row p-2.5" data-kb-card={s.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : s.id)}
                aria-expanded={open}
                aria-controls={`kb-${s.id}`}
                className="flex min-h-[56px] w-full items-center gap-3 text-left"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: tone.soft, color: tone.fg }} aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold leading-tight" style={{ color: 'var(--v3-fg)' }}>{s.official.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>{s.official.summary}</span>
                </span>
                <span className="hidden flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-block" style={{ background: tone.soft, color: tone.fg }}>
                  {t(`v3.scam.kb.cat.${s.category}`)}
                </span>
                {open ? <ChevronUp size={16} className="flex-shrink-0" aria-hidden="true" /> : <ChevronDown size={16} className="flex-shrink-0" aria-hidden="true" />}
              </button>
              {open && (
                <div id={`kb-${s.id}`}>
                  <ScenarioDetail scenario={s} />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {scenarios.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="v3-scam-seeall mt-3 inline-flex min-h-[40px] items-center gap-1 text-[13px] font-semibold"
          data-kb-toggle
        >
          {expanded ? t('v3.scam.kb.showLess') : t('v3.scam.kb.showMore')}
          {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>
      )}
    </section>
  )
}
