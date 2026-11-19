'use client'
// RFC-001 4.2 / 4.3 (build flag NEXT_PUBLIC_RESPONSE_PRESENTATION): a deep research report as a DOCUMENT - a canvas with a cover, a toolbar (PDF, Markdown, share), a sticky table of
// contents built from the report's REAL headings, footnote-style numbered citations linked to the sources list, and sections that appear one by one, each only once it is complete.
// VIEW ONLY: the report text, its headings and the saved message are exactly what the engine wrote. The five headings of the RFC's example are NOT forced: the contents list what the report has.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ChevronDown, Share2, FileDown } from 'lucide-react'
import './reportLayout.css'
import './presentation.css'
import './v206.css'
import { WORKSPACE_V206 } from '@/lib/chat/v206'
import { ArticleAnswer, type Presentation } from '@/components/chat/ArticleAnswer'
import { reportTitleOf } from '@/components/chat/ReportExportBar'
import type { ResearchChart, ResearchStatus } from '@/lib/ai/research/deepResearch'
import type { DocItemImage } from '@/lib/answerDoc/media'
import { downloadBlob, reportFileName, reportMarkdown, sourceCountOf, withChartTables } from '@/lib/answerDoc/reportExport'
import { downloadReportPdf } from '@/lib/answerDoc/reportPdf'
import { pdfCoverOf } from '@/components/chat/reportPdfCover'
import {
  amendedSections, arrivalOf, buildToc, footnoteId, footnotesOf, isSourcesSection, linkCitations, safeId, sectionId, stripTitleLine, withoutTrailingSources,
  type DocSection, type Footnote, type TocEntry,
} from '@/lib/chat/presentation'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useEntityChips } from '@/components/chat/v206/useEntityChips'
import { chipKeyDown, chipNameOf } from '@/components/chat/v206/EntityChipsScope'

type Format = (markdown: string) => string
type UnderHeading = (title: string) => React.ReactNode

export interface ResearchCanvasProps {
  msgId: string
  /** the report as it stands (what the chat has of it so far) */
  text: string
  /** the reply is still arriving: only complete sections are drawn */
  streaming: boolean
  /** the summary view (REPORT_SUMMARY_VIEW) is folded: `text` is then the title and the first section only; no contents list */
  collapsed?: boolean
  research?: ResearchStatus | null
  format: Format
  images?: readonly DocItemImage[]
  charts?: readonly ResearchChart[]
  under?: UnderHeading
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  /** opens the message's own share sheet; no button when absent */
  onShare?: () => void
}

const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function jumpTo(id: string) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null
  if (!el) return
  el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
  // keyboard and screen reader users land ON the heading, not only near it
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}

interface SectionViewProps {
  prefix: string
  index: number
  section: DocSection
  /** ids of this section's level 2/3 headings, in order */
  headingIds: string[]
  format: Format
  images: readonly DocItemImage[]
  under?: UnderHeading
  known: ReadonlyMap<number, string>
  linked: boolean
  footnotes: readonly Footnote[]
  /** workspace v206: the entity chips' decorator and this section's heading numbers ("01.") by heading ordinal */
  decorate?: (html: string) => string
  numbers: readonly (string | undefined)[]
  activeFootnote: number | null
  amended: boolean
  fresh: boolean
  onBack: () => void
  setRef: (index: number, el: HTMLElement | null) => void
}

// One section. Memoised on what it draws: a section already on the page is not re-rendered by the arrival of the next one.
const SectionView = memo(function SectionView(p: SectionViewProps) {
  const { t } = useTranslation()
  const cite = useMemo(() => (html: string) => linkCitations(html, p.prefix, p.known, p.linked), [p.prefix, p.known, p.linked])
  const presentation: Presentation = useMemo(
    () => ({ variant: 'doc', cite, headingId: k => p.headingIds[k], ...(WORKSPACE_V206 ? { look: true, decorate: p.decorate, headingNumber: (k: number) => p.numbers[k] } : {}) }),
    [cite, p.headingIds, p.decorate, p.numbers],
  )
  const isSources = isSourcesSection(p.section.text) && p.footnotes.length > 0
  const heading = p.section.text.split('\n')[0]
  return (
    <section id={sectionId(p.prefix, p.index)} ref={el => p.setRef(p.index, el)} data-section={p.index} aria-labelledby={p.headingIds[0]} className={p.fresh ? 'tappy-section-in' : undefined}>
      {p.amended && <p role="note" className="tappy-section-note">{t('pres.amended')}</p>}
      {isSources ? (
        <>
          <ArticleAnswer text={heading} images={[]} format={p.format} presentation={presentation} />
          <ol className="m-0 list-none p-0" aria-label={t('pres.sources.list')}>
            {p.footnotes.map(f => (
              <li key={f.n} id={footnoteId(p.prefix, f.n)} tabIndex={-1} className="tappy-fn" data-active={p.activeFootnote === f.n ? 'true' : 'false'} data-footnote={f.n}>
                <span className="tappy-fn-n">{f.n}</span>
                <span className="min-w-0 flex-1 break-words">
                  {f.href ? <a href={f.href} target="_blank" rel="noopener noreferrer">{f.title}</a> : f.title}
                  {' '}<span className="tappy-fn-site">· {f.site}</span>
                  {p.activeFootnote === f.n && <button type="button" onClick={p.onBack} className="ml-2 text-xs underline" aria-label={t('pres.backToText')}>↑</button>}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <ArticleAnswer text={p.section.text} images={p.images} format={p.format} under={p.under} presentation={presentation} />
      )}
    </section>
  )
}, (a, b) => a.section.text === b.section.text && a.index === b.index && a.prefix === b.prefix && a.known === b.known && a.linked === b.linked
  && a.activeFootnote === b.activeFootnote && a.amended === b.amended && a.fresh === b.fresh && a.images === b.images && a.format === b.format
  && a.under === b.under && a.footnotes === b.footnotes && a.headingIds.join('|') === b.headingIds.join('|') && a.decorate === b.decorate && a.numbers.join('|') === b.numbers.join('|'))

function ContentsBar({ entries, activeId, pendingTitle, hasPending, toolbar }: { entries: TocEntry[]; activeId: string | null; pendingTitle: string | null; hasPending: boolean; toolbar: React.ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLOListElement>(null)
  const current = entries.find(e => e.id === activeId)?.title ?? null
  const close = useCallback((refocus: boolean) => { setOpen(false); if (refocus) btn.current?.focus() }, [])
  useEffect(() => {
    if (!open) return
    const onDoc = (e: Event) => { if (!(e.target as HTMLElement)?.closest?.('[data-toc-root]')) setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])
  const move = (dir: 1 | -1) => {
    const links = Array.from(panel.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])
    const at = links.indexOf(document.activeElement as HTMLAnchorElement)
    links[Math.max(0, Math.min(links.length - 1, at + dir))]?.focus()
  }
  return (
    <div className="tappy-doc-bar" data-toc-root data-testid="research-contents-bar">
      <div className="flex items-center gap-2">
        {entries.length > 0 && (
          <nav aria-label={t('pres.toc.nav')} className="tappy-doc-toc min-w-0 flex-1">
            <button ref={btn} type="button" className="tappy-doc-btn w-full max-w-full justify-between" aria-expanded={open} aria-controls="tappy-toc-panel" data-testid="research-toc-toggle"
              onClick={() => setOpen(o => !o)}
              onKeyDown={e => { if (e.key === 'Escape') close(true); if (e.key === 'ArrowDown' && open) { e.preventDefault(); panel.current?.querySelector('a')?.focus() } }}>
              <span className="truncate">{current ? t('pres.toc.current', { title: current }) : t('pres.toc.button', { n: String(entries.filter(e => e.level === 2).length) })}</span>
              <ChevronDown size={14} aria-hidden="true" className={open ? 'rotate-180' : ''} />
            </button>
            {open && (
              <ol id="tappy-toc-panel" ref={panel} className="tappy-doc-toc-panel m-0 list-none" data-testid="research-toc-panel"
                onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); close(true) } else if (e.key === 'ArrowDown') { e.preventDefault(); move(1) } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) } }}>
                {entries.map(e => (
                  <li key={e.id} data-level={e.level}>
                    <a href={`#${e.id}`} aria-current={e.id === activeId ? 'true' : undefined}
                      onClick={ev => { ev.preventDefault(); close(false); jumpTo(e.id) }}>{e.title}</a>
                  </li>
                ))}
                {hasPending && <li aria-disabled="true" className="px-2.5 py-2 text-[13px]" style={{ color: 'var(--rp-ink-3)' }}>{pendingTitle ? `${pendingTitle} · ` : ''}{t('pres.toc.pending')}</li>}
              </ol>
            )}
          </nav>
        )}
        {toolbar}
      </div>
    </div>
  )
}

export default function ResearchCanvas(p: ResearchCanvasProps) {
  const { t, locale } = useTranslation()
  const prefix = safeId(p.msgId)
  const arrival = useMemo(() => arrivalOf(p.text, p.streaming), [p.text, p.streaming])
  // the title is the research card's, else the report's own "# " line; while it is still arriving and has neither, no cover yet
  const title = p.research?.title || (p.streaming && !/^\s{0,3}#(?!#)\s/m.test(p.text) ? '' : reportTitleOf(p.text))
  const fullText = useMemo(() => arrival.complete.map(s => s.text).join(''), [arrival.complete])
  const footnotes = useMemo(() => footnotesOf(p.text, p.research?.links ?? []), [p.text, p.research?.links])
  // the numbers a "[n]" may name: the sources list when it has arrived (linked), else the numbers the text uses so far (drawn as marks, not yet links)
  const known = useMemo(() => {
    if (footnotes.length) return new Map(footnotes.map(f => [f.n, f.title] as const))
    const seen = new Map<number, string>()
    if (p.streaming) for (const m of p.text.matchAll(/\[(\d{1,3})\](?!\()/g)) seen.set(Number(m[1]), '')
    return seen
  }, [footnotes, p.text, p.streaming])
  const linked = footnotes.length > 0

  // contents: the real headings; each section's own ids continue the numbering of the ones before it
  const head = arrival.head === null ? null : stripTitleLine(arrival.head)
  const toc = useMemo(() => buildToc(`${head ?? ''}${fullText}`, prefix), [head, fullText, prefix])
  const idsBySection = useMemo(() => {
    let at = head ? buildToc(head, 'x').length : 0
    return arrival.complete.map(s => { const n = buildToc(s.text, 'x').length; const ids = toc.slice(at, at + n).map(e => e.id); at += n; return ids })
  }, [arrival.complete, toc, head])
  const headIds = useMemo(() => toc.slice(0, head ? buildToc(head, 'x').length : 0).map(e => e.id), [toc, head])
  const showToc = !p.collapsed && toc.filter(e => e.level === 2).length >= 2

  // workspace v206 dossier: "01." in front of each level-2 heading that has no number of its own (the sources list is not numbered); the real entity names of the report become chips
  const numbersBySection = useMemo(() => {
    if (!WORKSPACE_V206) return arrival.complete.map(() => [] as (string | undefined)[])
    const byId = new Map(toc.map(e => [e.id, e] as const))
    let n = 0
    return arrival.complete.map((s, si) => {
      const sources = isSourcesSection(s.text)
      return (idsBySection[si] ?? []).map(id => {
        const e = byId.get(id)
        if (!e || e.level !== 2 || sources || /^\d{1,3}[.)]/.test(e.title)) return undefined
        n++
        return `${String(n).padStart(2, '0')}.`
      })
    })
  }, [arrival.complete, idsBySection, toc])
  const chips = useEntityChips(p.text, WORKSPACE_V206 && !p.streaming)

  // 4.3 arrival: a section drawn before whose text changed is shown with a note, in place; the others stay as they are
  const texts = useMemo(() => arrival.complete.map(s => s.text), [arrival.complete])
  const prevTexts = useRef<string[]>([])
  const seenCount = useRef(0)
  const [amended, setAmended] = useState<ReadonlySet<number>>(() => new Set())
  const [fresh, setFresh] = useState<ReadonlySet<number>>(() => new Set())
  useEffect(() => {
    const changed = amendedSections(prevTexts.current, texts)
    if (changed.length) setAmended(prev => new Set([...prev, ...changed]))
    // only sections that arrive while the reply is being written animate in; a report that is already whole (a reload) appears as it is
    if (texts.length > seenCount.current && p.streaming) setFresh(prev => new Set([...prev, ...texts.map((_, i) => i).filter(i => i >= seenCount.current)]))
    seenCount.current = Math.max(seenCount.current, texts.length)
    prevTexts.current = texts
  }, [texts, p.streaming])

  // a section ABOVE the reading position that changes height (rewritten, a picture loaded) must not move what the person is reading
  const refs = useRef(new Map<number, HTMLElement>())
  const heights = useRef(new Map<number, number>())
  const setRef = useCallback((i: number, el: HTMLElement | null) => { if (el) refs.current.set(i, el); else refs.current.delete(i) }, [])
  useLayoutEffect(() => {
    refs.current.forEach((el, i) => {
      const h = el.offsetHeight
      const before = heights.current.get(i)
      heights.current.set(i, h)
      if (before === undefined || before === h) return
      const box = el.closest('[data-chat-scroll],[data-report-scroll]') as HTMLElement | null
      if (box && el.getBoundingClientRect().bottom <= box.getBoundingClientRect().top) box.scrollTop += h - before
    })
  })

  // the section being read (for the contents bar)
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => {
    if (!showToc) return
    const targets = toc.map(e => document.getElementById(e.id)).filter((x): x is HTMLElement => !!x)
    const box = (targets[0]?.closest('[data-chat-scroll],[data-report-scroll]') as HTMLElement | null) ?? null
    // the heading being read = the last one that has reached the top of the reading area (none yet: the cover is on screen)
    const pick = () => {
      const top = (box?.getBoundingClientRect().top ?? 0) + 96
      let at: string | null = null
      for (const el of targets) { if (el.getBoundingClientRect().top <= top) at = el.id }
      setActiveId(at)
    }
    let raf = 0
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; pick() }) }
    const target: HTMLElement | Window = box ?? window
    target.addEventListener('scroll', onScroll, { passive: true })
    pick()
    return () => { target.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [showToc, toc])

  // footnotes: a mark jumps to its source line and a button comes back
  const [activeFn, setActiveFn] = useState<number | null>(null)
  const lastMark = useRef<HTMLElement | null>(null)
  const onCapture = (e: MouseEvent<HTMLDivElement>) => {
    // an entity chip opens the right-hand profile
    const chipName = chipNameOf(e.target)
    if (chipName && chips.open(chipName)) { e.preventDefault(); e.stopPropagation(); return }
    const mark = (e.target as HTMLElement | null)?.closest?.('a[data-cite]') as HTMLElement | null
    if (!mark) return
    e.preventDefault(); e.stopPropagation() // the footnote jump is not an outbound link: the chat's link tracking must not see it
    const n = Number(mark.getAttribute('data-cite'))
    lastMark.current = mark
    setActiveFn(n)
    const li = document.getElementById(footnoteId(prefix, n))
    if (li) { li.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }); li.focus({ preventScroll: true }) }
  }
  const back = useCallback(() => {
    const m = lastMark.current
    if (!m) return
    m.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }); m.focus({ preventScroll: true }); setActiveFn(null)
  }, [])

  // toolbar (a finished report only: an unfinished text is not exported)
  const links = p.research?.links ?? []
  // 15/11 (owner: "bấm vào là tải về, không phải hành động Ctrl+P"): Markdown, Word and PDF are files that download on one click, built in the browser (the charts' figures go in as tables)
  const [busy, setBusy] = useState(false)
  const exportTitle = (p.research?.title || reportTitleOf(p.text) || 'report')
  const charts = p.charts ?? []
  const asMd = () => downloadBlob(new Blob([reportMarkdown(withChartTables(p.text, charts, locale), links)], { type: 'text/markdown;charset=utf-8' }), reportFileName(exportTitle, 'md'))
  const asPdf = async () => {
    setBusy(true)
    try { await downloadReportPdf(withChartTables(p.text, charts, locale), links, exportTitle, pdfCoverOf(t, locale, exportTitle, p.research?.tier, Math.max(links.length, sourceCountOf(p.text, links)))) } finally { setBusy(false) }
  }
  const asWord = async () => {
    setBusy(true)
    try {
      const { reportDocx } = await import('@/lib/answerDoc/reportDocx')
      downloadBlob(await reportDocx(withChartTables(p.text, charts, locale), links, exportTitle), reportFileName(exportTitle, 'docx'))
    } finally { setBusy(false) }
  }
  const toolbar = !p.streaming && (
    // on a phone the buttons are icons (the bar is sticky: it must stay one short row); the words stay for screen readers and from the `sm` width up
    <div role="group" aria-label={t('pres.toolbar.label')} className="flex shrink-0 items-center gap-1.5" data-testid="research-toolbar">
      <button type="button" className="tappy-doc-btn" onClick={asMd} data-testid="research-export-md" title="Markdown"><FileDown size={15} aria-hidden="true" /><span className="sr-only sm:not-sr-only">Markdown</span></button>
      <button type="button" className="tappy-doc-btn" onClick={() => { void asWord() }} disabled={busy} data-testid="research-export-docx" title="Word"><FileDown size={15} aria-hidden="true" /><span className="sr-only sm:not-sr-only">Word</span></button>
      <button type="button" className="tappy-doc-btn" onClick={() => { void asPdf() }} disabled={busy} data-testid="research-export-pdf" title="PDF"><FileDown size={15} aria-hidden="true" /><span className="sr-only sm:not-sr-only">PDF</span></button>
      {p.onShare && <button type="button" className="tappy-doc-btn" onClick={p.onShare} data-testid="research-share" title={t('pres.share')}><Share2 size={15} aria-hidden="true" /><span className="sr-only sm:not-sr-only">{t('pres.share')}</span></button>}
    </div>
  )

  const date = p.research ? new Date().toLocaleDateString(locale === 'en' ? 'en-GB' : 'vi-VN') : null
  // the number of sources the report LISTS (final UAT 19/11: the pill said 256 over a list of 27: it counted the pages read, not the ones cited)
  const sources = Math.max(links.length, sourceCountOf(p.text, links))
  const hasBar = showToc || !!toolbar

  return (
    <article className={WORKSPACE_V206 ? 'tappy-doc tappy-report v206-doc' : 'tappy-doc tappy-report'} data-testid="research-canvas" aria-labelledby={`${prefix}-title`} aria-busy={p.streaming}>
      {title && (
        <header className="tappy-report-cover">
          {WORKSPACE_V206
            ? <div className="tappy-report-eyebrow v206-dossier-kind" data-testid="dossier-kind">{t('v206.dossier.kind')}{p.research?.tier ? ` · ${t(`report.tier.${p.research.tier}`)}` : ''}</div>
            : <div className="tappy-report-eyebrow">{t('report.eyebrow')}{p.research?.tier ? ` · ${t(`report.tier.${p.research.tier}`)}` : ''}</div>}
          <h1 id={`${prefix}-title`} className="tappy-report-title">{title}</h1>
          {WORKSPACE_V206 && date && !p.streaming && <p className="v206-dossier-by" data-testid="dossier-byline">{t('v206.dossier.byline', { date })}</p>}
          {(date || sources > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {date && !p.streaming && !WORKSPACE_V206 && <span className="tappy-report-pill">{t('report.updated', { date })}</span>}
              {sources > 0 && !p.streaming && <span className="tappy-report-pill">{t('report.sources', { n: String(sources) })}</span>}
            </div>
          )}
        </header>
      )}
      {hasBar && <ContentsBar entries={showToc ? toc : []} activeId={activeId} pendingTitle={arrival.pending?.title ?? null} hasPending={!!arrival.pending} toolbar={toolbar} />}
      <div onClickCapture={onCapture}>
        {head && head.trim() && (
          <ArticleAnswer text={head} images={[]} format={p.format} onClick={p.onClick} onKeyDown={chipKeyDown(chips)} presentation={{ variant: 'doc', headingId: k => headIds[k], ...(WORKSPACE_V206 ? { look: true, decorate: chips.decorate } : {}) }} className="pt-3" />
        )}
        {arrival.complete.map((s0, i) => {
          // a last section that ends with its own "sources" sub-heading and numbered lines: the list below replaces it (each source a link)
          const trimmed = !p.streaming && footnotes.length > 0 && i === arrival.complete.length - 1 && !arrival.pending ? withoutTrailingSources(s0.text) : null
          const s = trimmed === null ? s0 : { ...s0, text: trimmed }
          return (
          <div key={i} onClick={p.onClick} onKeyDown={chipKeyDown(chips)}>
            <SectionView prefix={prefix} index={i} section={s} headingIds={idsBySection[i] ?? []} format={p.format} images={p.images ?? []} under={p.under}
              known={known} linked={linked} footnotes={footnotes} decorate={chips.decorate} numbers={numbersBySection[i] ?? []} activeFootnote={activeFn} amended={amended.has(i)} fresh={fresh.has(i)} onBack={back} setRef={setRef} />
          </div>
          )
        })}
        {/* 16/11 (UAT 60): a report whose own text has no sources section (the Standard one) still lists the sources it cites, each a link, from the research card's links */}
        {!arrival.pending && !p.streaming && footnotes.length > 0 && !arrival.complete.some(s => isSourcesSection(s.text)) && (
          <section data-testid="report-sources" aria-label={t('pres.sources.list')} className="mt-6">
            <h2 className="mb-2 text-base font-semibold">{t('pres.sources.list')}</h2>
            <ol className="m-0 list-none p-0">
              {footnotes.map(f => (
                <li key={f.n} id={footnoteId(prefix, f.n)} tabIndex={-1} className="tappy-fn" data-active={activeFn === f.n ? 'true' : 'false'} data-footnote={f.n}>
                  <span className="tappy-fn-n">{f.n}</span>
                  <span className="min-w-0 flex-1 break-words">
                    {f.href ? <a href={f.href} target="_blank" rel="noopener noreferrer">{f.title}</a> : f.title}
                    {' '}<span className="tappy-fn-site">· {f.site}</span>
                    {activeFn === f.n && <button type="button" onClick={back} className="ml-2 text-xs underline" aria-label={t('pres.backToText')}>↑</button>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
      {arrival.pending && (
        <p role="status" className="tappy-section-pending" data-testid="research-pending">
          {arrival.pending.title ? t('pres.pendingNamed', { title: arrival.pending.title }) : t('pres.pending')}
        </p>
      )}
    </article>
  )
}
