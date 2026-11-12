'use client'
// RFC-001 4.2 / 4.3 (build flag NEXT_PUBLIC_RESPONSE_PRESENTATION): a deep research report as a DOCUMENT - a canvas with a cover, a toolbar (PDF, Markdown, share), a sticky table of
// contents built from the report's REAL headings, footnote-style numbered citations linked to the sources list, and sections that appear one by one, each only once it is complete.
// VIEW ONLY: the report text, its headings and the saved message are exactly what the engine wrote. The five headings of the RFC's example are NOT forced: the contents list what the report has.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ChevronDown, Copy, FileDown, Share2, Check } from 'lucide-react'
import './reportLayout.css'
import './presentation.css'
import { ArticleAnswer, type Presentation } from '@/components/chat/ArticleAnswer'
import { reportTitleOf } from '@/components/chat/ReportExportBar'
import type { ResearchChart, ResearchStatus } from '@/lib/ai/research/deepResearch'
import type { DocItemImage } from '@/lib/answerDoc/media'
import { printHtml, reportHtml, reportMarkdown, sourceCountOf, type ReportImage } from '@/lib/answerDoc/reportExport'
import {
  amendedSections, arrivalOf, buildToc, footnoteId, footnotesOf, isSourcesSection, linkCitations, safeId, sectionId, stripTitleLine,
  type DocSection, type Footnote, type TocEntry,
} from '@/lib/chat/presentation'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { REPORT_LAYOUT_A } from '@/components/chat/ReportCover'

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
  const presentation: Presentation = useMemo(() => ({ variant: 'doc', cite, headingId: k => p.headingIds[k] }), [cite, p.headingIds])
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
  && a.under === b.under && a.footnotes === b.footnotes && a.headingIds.join('|') === b.headingIds.join('|'))

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
      const box = el.closest('[data-chat-scroll]') as HTMLElement | null
      if (box && el.getBoundingClientRect().bottom <= box.getBoundingClientRect().top) box.scrollTop += h - before
    })
  })

  // the section being read (for the contents bar)
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => {
    if (!showToc) return
    const targets = toc.map(e => document.getElementById(e.id)).filter((x): x is HTMLElement => !!x)
    const box = (targets[0]?.closest('[data-chat-scroll]') as HTMLElement | null) ?? null
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
  const [copied, setCopied] = useState(false)
  const asMd = async () => {
    try { await navigator.clipboard.writeText(reportMarkdown(p.text, links)); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* the browser refused the clipboard: nothing to say */ }
  }
  const asPdf = () => printHtml(reportHtml(p.text, { title, images: (p.images ?? []) as readonly ReportImage[], links, format: p.format, lang: locale, charts: p.charts ?? [], ...(REPORT_LAYOUT_A ? { design: 'a' as const } : {}) }))
  const toolbar = !p.streaming && (
    // on a phone the buttons are icons (the bar is sticky: it must stay one short row); the words stay for screen readers and from the `sm` width up
    <div role="group" aria-label={t('pres.toolbar.label')} className="flex shrink-0 items-center gap-1.5" data-testid="research-toolbar">
      <button type="button" className="tappy-doc-btn" onClick={asPdf} data-testid="research-pdf" title={t('pres.pdf')}><FileDown size={15} aria-hidden="true" /><span className="sr-only sm:not-sr-only">{t('pres.pdf')}</span></button>
      <button type="button" className="tappy-doc-btn" onClick={() => { void asMd() }} data-testid="research-copy-md" title={t('pres.copyMd')}>
        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}<span className="sr-only sm:not-sr-only" aria-live="polite">{copied ? t('pres.copied') : t('pres.copyMd')}</span>
      </button>
      {p.onShare && <button type="button" className="tappy-doc-btn" onClick={p.onShare} data-testid="research-share" title={t('pres.share')}><Share2 size={15} aria-hidden="true" /><span className="sr-only sm:not-sr-only">{t('pres.share')}</span></button>}
    </div>
  )

  const date = p.research ? new Date().toLocaleDateString(locale === 'en' ? 'en-GB' : 'vi-VN') : null
  const sources = Math.max(links.length, p.research?.sources ?? 0, sourceCountOf(p.text, links))
  const hasBar = showToc || !!toolbar

  return (
    <article className="tappy-doc tappy-report" data-testid="research-canvas" aria-labelledby={`${prefix}-title`} aria-busy={p.streaming}>
      {title && (
        <header className="tappy-report-cover">
          <div className="tappy-report-eyebrow">{t('report.eyebrow')}{p.research?.tier ? ` · ${t(`report.tier.${p.research.tier}`)}` : ''}</div>
          <h1 id={`${prefix}-title`} className="tappy-report-title">{title}</h1>
          {(date || sources > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {date && !p.streaming && <span className="tappy-report-pill">{t('report.updated', { date })}</span>}
              {sources > 0 && !p.streaming && <span className="tappy-report-pill">{t('report.sources', { n: String(sources) })}</span>}
            </div>
          )}
        </header>
      )}
      {hasBar && <ContentsBar entries={showToc ? toc : []} activeId={activeId} pendingTitle={arrival.pending?.title ?? null} hasPending={!!arrival.pending} toolbar={toolbar} />}
      <div onClickCapture={onCapture}>
        {head && head.trim() && (
          <ArticleAnswer text={head} images={[]} format={p.format} onClick={p.onClick} presentation={{ variant: 'doc', headingId: k => headIds[k] }} className="pt-3" />
        )}
        {arrival.complete.map((s, i) => (
          <div key={i} onClick={p.onClick}>
            <SectionView prefix={prefix} index={i} section={s} headingIds={idsBySection[i] ?? []} format={p.format} images={p.images ?? []} under={p.under}
              known={known} linked={linked} footnotes={footnotes} activeFootnote={activeFn} amended={amended.has(i)} fresh={fresh.has(i)} onBack={back} setRef={setRef} />
          </div>
        ))}
      </div>
      {arrival.pending && (
        <p role="status" className="tappy-section-pending" data-testid="research-pending">
          {arrival.pending.title ? t('pres.pendingNamed', { title: arrival.pending.title }) : t('pres.pending')}
        </p>
      )}
    </article>
  )
}
