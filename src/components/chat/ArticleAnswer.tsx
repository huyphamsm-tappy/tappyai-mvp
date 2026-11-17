'use client'
// TAPPY_ANSWER_V4 layer 2 (owner 19/10/2026: "format & layout giống ChatGPT… như đang đọc báo"): the answer laid out as an ARTICLE.
//
// The markdown is parsed into blocks (lib/answerDoc/parse.ts) and each block gets its own typography — headings with air above them,
// paragraphs with a reading line height, real bulleted / numbered lists, quotes, rules — instead of one pre-wrapped string. The inline text of
// every block still goes through the chat's formatter (`format` = formatMessage: escaping, bold, link chips, source chips, tables, code), so
// nothing about what may reach the page changes. The server's item pictures (tappy.doc_media.v1) are placed next to the item they belong to,
// matched by title in any script (titleKey); a picture whose item is not found is not shown. Every picture URL is re-checked (safe https).
import { Fragment, useMemo, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import './presentation.css'
import { parseDoc, listItemTitle, headingTitle, titleKey, type DocBlock } from '@/lib/answerDoc/parse'
import type { DocItemImage } from '@/lib/answerDoc/media'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { isAllowedMediaImage, isAllowedMediaPage, type MediaEntity } from '@/lib/media/mediaHosts'
import { embedAnchors, plainHeading } from '@/lib/chat/presentation'
import { embedAnchorsNamed } from '@/lib/chat/placeAnchoring'
import ProfileCards, { pointsFromSummary, type CardItem } from '@/components/chat/ProfileCards'
import type { WikiEntity } from '@/lib/chat/entityProfiles'

type Format = (markdown: string) => string

function ItemPicture({ img, size }: { img: DocItemImage; size: 'thumb' | 'wide' }) {
  if (!isSafeHttpsUrl(img.src)) return null
  const pic = (
    <img src={img.src} alt={img.title} loading="lazy" referrerPolicy="no-referrer" data-zoomable="true"
      onError={e => { (e.currentTarget.closest('[data-doc-pic]') as HTMLElement | null)?.style.setProperty('display', 'none') }}
      className={size === 'thumb'
        ? 'h-20 w-20 sm:h-24 sm:w-24 rounded-xl object-cover bg-gray-100 dark:bg-gray-800'
        : 'w-full max-h-64 rounded-2xl object-cover bg-gray-100 dark:bg-gray-800'} />
  )
  return (
    <span data-doc-pic className={size === 'thumb' ? 'flex-shrink-0' : 'block my-2'}>
      {img.href && isAllowedMediaPage(img.href) ? <a href={img.href} target="_blank" rel="noopener noreferrer">{pic}</a> : pic}
    </span>
  )
}

function Inline({ html, as = 'div', className, id }: { html: string; as?: 'div' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'; className?: string; id?: string }) {
  const Tag = as
  // The same object while the text is the same: React sets the element's HTML again whenever it is handed a NEW object (measured in the browser: every re-render of a section
  // replaced all its nodes, which drops the focus of a footnote mark and the reader's text selection). Same markup, no needless DOM replacement.
  const inner = useMemo(() => ({ __html: html }), [html])
  return <Tag id={id} className={className} dangerouslySetInnerHTML={inner} />
}

/**
 * RFC-001 section 4 (NEXT_PUBLIC_RESPONSE_PRESENTATION): the presentation of the same blocks. `editorial` = an ordinary answer (lead paragraph, reading line height,
 * callout quotes, the rich embeds between the paragraphs); `doc` = a section of a research document (the same, without the lead emphasis). Absent: the former layout, untouched.
 */
export interface Presentation {
  variant: 'editorial' | 'doc'
  /** false for the text that continues after the lead (its first paragraph is not the lead) */
  lead?: boolean
  /** the id of the n-th level 2/3 heading of THIS text (the table of contents jumps to it); undefined: no id */
  headingId?: (ordinal: number) => string | undefined
  /** applied to every formatted paragraph (footnote marks) */
  cite?: (html: string) => string
  /** the rich cards of the turn, placed after the lead and spread between the paragraphs (presentation.embedAnchors) */
  embeds?: ReactNode[]
  /** per embed, the name of the place it is about (or undefined): a card with a name that the text mentions goes under that text instead of being spread by position (placeAnchoring) */
  embedNames?: ReadonlyArray<string | undefined>
  /** applied after `cite` to every formatted paragraph: the answer's resolved entity names become chips (workspace v206) */
  decorate?: (html: string) => string
  /** workspace v206 look: section headings as the mockup's mono caps eyebrows (numbered when the answer has two or more unnumbered ones), tables as a titled data box */
  look?: boolean
  /** a document's own heading number ("01.") by the heading's ordinal; none: no number is added */
  headingNumber?: (ordinal: number) => string | undefined
}

/** A table block (the formatter's table syntax): its first line starts with a pipe. */
const isTableBlock = (raw: string) => /^\s*\|/.test(raw)

/** The data box's title: the short line right before the table that introduces it ("Bảng so sánh:"). A heading before the table is its own title: no second one is made. Pure. */
export function dataBoxTitle(prev: DocBlock | undefined): string | null {
  if (!prev || prev.t !== 'para') return null
  const s = plainHeading(prev.text)
  if (!/[:：]$/.test(s) || s.length > 90 || s.includes('\n')) return null
  return s.replace(/[:：]\s*$/, '').trim() || null
}

/**
 * The chat formatter turns a line that starts "3. " into a numbered row (a flex div): inside a real heading it would be a block in a heading and the number would be
 * drawn small and grey. A zero-width word joiner between the digits and the dot keeps the number part of the heading's own text; nothing is visible.
 * (Built from its code point: a literal invisible character in a source file is a hazard.)
 */
const WORD_JOINER = String.fromCharCode(0x2060)

/** Which top-level heading blocks the table of contents counts (level 2 and 3 with a text): their ordinal, by block index. Shared by buildToc's rule. */
function headingOrdinals(blocks: DocBlock[]): Map<number, number> {
  const out = new Map<number, number>()
  blocks.forEach((b, i) => { if (b.t === 'heading' && (b.level === 2 || b.level === 3) && plainHeading(b.text)) out.set(i, out.size) })
  return out
}

/**
 * Which picture goes where, decided ONCE before rendering: each picture at the first heading / list item (document order, nested lists
 * included) whose title matches it. Measured 28/10: the former "take while rendering" mutated a shared set, so React StrictMode's second
 * render (dev) found every picture already taken and showed none. Keys are positions ("3", "5.2", "5.2/0") so a render is a pure lookup.
 */
function assignPictures(blocks: DocBlock[], pics: Map<string, DocItemImage>, prefix = '', used = new Set<string>(), out = new Map<string, DocItemImage>()): Map<string, DocItemImage> {
  const claim = (site: string, title: string | null) => {
    if (!title) return
    const k = titleKey(title)
    const img = pics.get(k)
    if (!img || used.has(k)) return
    used.add(k)
    out.set(site, img)
  }
  blocks.forEach((b, i) => {
    if (b.t === 'heading') claim(`${prefix}${i}`, headingTitle(b.text))
    if (b.t === 'list') b.items.forEach((it, k) => {
      claim(`${prefix}${i}.${k}`, listItemTitle(it.text))
      if (it.children) assignPictures(parseDoc(it.children), pics, `${prefix}${i}.${k}/`, used, out)
    })
  })
  return out
}

/** What goes right under a heading besides its picture (31/10: a deep research section's chart), by the heading's title; none → null. */
type UnderHeading = (title: string) => ReactNode

function Blocks({ blocks, format, placed, prefix = '', under, pres }: { blocks: DocBlock[]; format: Format; placed: Map<string, DocItemImage>; prefix?: string; under?: UnderHeading; pres?: Presentation }) {
  // the presentation applies to the top level only (a list item's children keep the plain layout); the footnote marks apply everywhere
  const top = !!pres && prefix === ''
  const ords = top ? headingOrdinals(blocks) : null
  const leadIdx = top && pres!.variant === 'editorial' && pres!.lead !== false ? blocks.findIndex(b => b.t === 'para') : -1
  const anchors = top && pres!.embeds?.length
    ? (pres!.embedNames?.some(Boolean) ? embedAnchorsNamed(blocks, pres!.embedNames) : embedAnchors(blocks, pres!.embeds.length))
    : []
  const embedsAfter = (i: number) => anchors.flatMap((a, k) => (a === i ? [<div key={`e${k}`} className="tappy-embed" data-embed>{pres!.embeds![k]}</div>] : []))
  const mono = top && !!pres!.look
  // editorial "1." in front of a level-2 heading that has no number of its own (needs two or more such headings; presentation only)
  const unnumbered = mono && pres!.variant === 'editorial'
    ? blocks.map((b, i) => (b.t === 'heading' && b.level === 2 && !/^\s*\d{1,3}[.)]/.test(plainHeading(b.text)) ? i : -1)).filter(i => i >= 0)
    : []
  const numberOf = (i: number, ord: number | undefined): string => {
    if (!mono) return ''
    if (pres!.variant === 'doc') return ord !== undefined ? pres!.headingNumber?.(ord) ?? '' : ''
    const k = unnumbered.indexOf(i)
    return unnumbered.length >= 2 && k >= 0 ? `${k + 1}.` : ''
  }
  const withCite = pres?.cite
  const withChips = pres?.decorate
  const fmt: Format = withCite || withChips ? s => { let h = format(s); if (withCite) h = withCite(h); if (withChips) h = withChips(h); return h } : format
  const rendered = blocks.map((b, i) => {
        switch (b.t) {
          case 'heading': {
            const img = placed.get(`${prefix}${i}`) ?? null
            const cls0 = b.level <= 2 ? 'text-xl font-semibold mt-6 mb-2 first:mt-0' : b.level === 3 ? 'text-lg font-semibold mt-5 mb-2 first:mt-0' : 'text-base font-semibold mt-4 mb-1.5 first:mt-0'
            // a document section starts with its own heading, which keeps the air above it (each section is drawn as its own block)
            const cls = top && pres!.variant === 'doc' ? cls0.replace(' first:mt-0', '') : cls0
            const ord = ords?.get(i)
            const num = numberOf(i, ord)
            const head = fmt(top ? b.text.replace(/^(\d{1,3})\./, `$1${WORD_JOINER}.`) : b.text)
            return (
              <Fragment key={i}>
                <Inline html={num ? `<span class="v206-hnum">${num}</span> ${head}` : head} as={top ? (`h${Math.min(b.level, 6)}` as 'h1') : 'div'} id={ord !== undefined ? pres!.headingId?.(ord) : undefined}
                  className={`${cls} text-gray-900 dark:text-gray-50 [text-wrap:balance]${ord !== undefined ? ' scroll-mt-16' : ''}${mono && b.level <= 3 ? ' v206-h' : ''}`} />
                {img && <ItemPicture img={img} size="wide" />}
                {under && (() => { const t = headingTitle(b.text); return t ? under(t) : null })()}
              </Fragment>
            )
          }
          case 'para': {
            // the mockup's source line under a data table: one short line straight after a table is its caption (small, mono, muted)
            const prev = blocks[i - 1]
            if (mono && prev && prev.t === 'raw' && isTableBlock(prev.text) && !b.text.includes('\n') && plainHeading(b.text).length <= 160) {
              return <Inline key={i} html={fmt(b.text)} className="v206-caption" />
            }
            return <Inline key={i} html={fmt(b.text)} className={i === leadIdx ? 'my-3 first:mt-0 last:mb-0 whitespace-pre-line text-[17px] text-gray-900 dark:text-gray-50' : 'my-3 first:mt-0 last:mb-0 whitespace-pre-line'} />
          }
          case 'quote':
            return top && pres!.variant === 'editorial'
              ? <Inline key={i} html={fmt(b.text)} className="tappy-callout my-4 rounded-xl border-l-4 border-[#FF9500] bg-[#FFF4E5] px-4 py-3 text-[15px] text-gray-800 dark:bg-[#2a2113] dark:text-amber-50 whitespace-pre-line" />
              : <Inline key={i} html={fmt(b.text)} className="my-3 border-l-4 border-gray-200 dark:border-gray-700 pl-4 text-gray-600 dark:text-gray-300 whitespace-pre-line" />
          case 'hr':
            return <hr key={i} className="my-6 border-gray-200 dark:border-gray-700" />
          case 'raw': {
            if (mono && isTableBlock(b.text)) {
              const title = dataBoxTitle(blocks[i - 1])
              return (
                <div key={i} className="v206-databox" data-testid="v206-databox">
                  {title && <div className="v206-databox-title">{title}</div>}
                  <Inline html={fmt(b.text)} className="whitespace-pre-wrap" />
                </div>
              )
            }
            return <Inline key={i} html={fmt(b.text)} className="my-3 whitespace-pre-wrap" />
          }
          case 'list': {
            const ListTag = b.ordered ? 'ol' : 'ul'
            return (
              <ListTag key={i} start={b.ordered && b.start !== 1 ? b.start : undefined}
                className={`my-3 space-y-2 pl-6 ${b.ordered ? 'list-decimal' : 'list-disc'} marker:text-gray-400 dark:marker:text-gray-500`}>
                {b.items.map((it, k) => {
                  const img = placed.get(`${prefix}${i}.${k}`) ?? null
                  const body = (
                    <>
                      <Inline html={fmt(it.text)} className="whitespace-pre-line" />
                      {it.children && <div className="mt-1.5"><Blocks blocks={parseDoc(it.children)} format={format} placed={placed} prefix={`${prefix}${i}.${k}/`} under={under} pres={pres ? { variant: pres.variant, cite: pres.cite, decorate: pres.decorate } : undefined} /></div>}
                    </>
                  )
                  return (
                    <li key={k} className="pl-1">
                      {img ? <div className="flex items-start gap-3"><div className="min-w-0 flex-1">{body}</div><ItemPicture img={img} size="thumb" /></div> : body}
                    </li>
                  )
                })}
              </ListTag>
            )
          }
        }
      })
  if (!anchors.length) return <>{rendered}</>
  return (
    <>
      {blocks.length === 0 && embedsAfter(-1)}
      {rendered.map((node, i) => <Fragment key={i}>{node}{embedsAfter(i)}</Fragment>)}
    </>
  )
}

/**
 * Owner 28/10 (ChatGPT Go screenshots): the pictures of an answer also open it as a grid under the first paragraph — one large picture and
 * two stacked beside it. Built only from the answer's own item pictures (already re-checked, live-only); fewer than three → no grid.
 */
export function ImageGrid({ images }: { images: readonly DocItemImage[] }) {
  const safe = images.filter(i => isSafeHttpsUrl(i.src)).slice(0, 3)
  if (safe.length < 3) return null
  // the mockup (15/11): each picture carries its name as a small mono chip at the bottom-left, over a soft gradient
  const pic = (img: DocItemImage, cls: string) => (
    <div className="relative h-full w-full">
      <img src={img.src} alt={img.title} loading="lazy" referrerPolicy="no-referrer" data-zoomable="true"
        onError={e => { e.currentTarget.style.setProperty('visibility', 'hidden') }} className={`h-full w-full object-cover bg-gray-100 dark:bg-gray-800 ${cls}`} />
      {img.title && (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
          <span data-doc-caption className="pointer-events-none absolute bottom-2 left-2.5 max-w-[85%] truncate rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur-sm">{img.title}</span>
        </>
      )}
    </div>
  )
  return (
    <div data-doc-grid className="my-3 grid h-48 grid-cols-3 grid-rows-2 gap-1 overflow-hidden rounded-2xl sm:h-60">
      <div className="col-span-2 row-span-2">{pic(safe[0], '')}</div>
      <div>{pic(safe[1], '')}</div>
      <div>{pic(safe[2], '')}</div>
    </div>
  )
}

/** A source of the answer: the link text the model wrote and the page's host. */
export interface AnswerSource { label: string; href: string; host: string }

/** The pages the answer links to, in order, one per host (markdown links with a safe https URL). */
export function answerSources(text: string, max = 8): AnswerSource[] {
  const out: AnswerSource[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(/\[([^\]\n]{1,80})\]\((https:\/\/[^)\s]{1,500})\)/g)) {
    const href = m[2]
    if (!isSafeHttpsUrl(href)) continue
    let host = ''
    try { host = new URL(href).hostname.replace(/^www\./, '') } catch { continue }
    if (!host || seen.has(host)) continue
    seen.add(host)
    out.push({ label: m[1].replace(/[*_`]/g, '').trim() || host, href, host })
    if (out.length >= max) break
  }
  return out
}

/**
 * Owner 28/10: like ChatGPT's "Nguồn" button, the answer ends with the list of pages it used. A letter badge per site (no third-party favicon
 * service: it would tell that service which sources the person reads). Collapsed to a single line; the full list opens on tap.
 */
export function SourcesFooter({ text, lang }: { text: string; lang: string }) {
  const sources = answerSources(text)
  if (!sources.length) return null
  return (
    <details data-doc-sources className="mt-3 group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-[13px] text-gray-600 dark:border-gray-700 dark:text-gray-300">
        <span className="flex -space-x-1.5">
          {sources.slice(0, 3).map(s => (
            <span key={s.host} className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold uppercase text-gray-700 ring-2 ring-white dark:bg-gray-700 dark:text-gray-100 dark:ring-gray-900">{s.host[0]}</span>
          ))}
        </span>
        {lang === 'en' ? 'Sources' : 'Nguồn'} · {sources.length}
      </summary>
      <ul className="mt-2 space-y-1.5 text-[13px]">
        {sources.map(s => (
          <li key={s.host}><a href={s.href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{s.label}</a> <span className="text-gray-500">· {s.host}</span></li>
        ))}
      </ul>
    </details>
  )
}

export function ArticleAnswer({ text, images, format, className, onClick, onKeyDown, under, presentation }: { text: string; images: readonly DocItemImage[]; format: Format; className?: string; onClick?: (e: MouseEvent<HTMLDivElement>) => void; onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void; under?: UnderHeading; presentation?: Presentation }) {
  const pics = new Map<string, DocItemImage>()
  for (const img of images) { const k = titleKey(img.title); if (k && !pics.has(k)) pics.set(k, img) }
  const blocks = parseDoc(text)
  // RFC-001 4.1: an editorial answer reads at line-height 1.65 (the article layout's 1.75rem is 1.8 at this size)
  const type = presentation?.variant === 'editorial' ? 'text-base leading-[1.65]' : 'text-[15.5px] leading-7'
  return (
    <div data-answer="article" {...(presentation ? { 'data-presentation': presentation.variant } : {})} className={`message-content ${type} ${presentation?.look ? 'v206-ed ' : ''}${className ?? ''}`} onClick={onClick} onKeyDown={onKeyDown}>
      <Blocks blocks={blocks} format={format} placed={assignPictures(blocks, pics)} under={under} pres={presentation} />
    </div>
  )
}

/** The opening of a summary, at most `max` characters, cut at a word boundary with "…" (never mid-word, never the end of the text). */
export function summaryOpening(s: string, max = 150): string {
  if (s.length <= max) return s
  const at = s.lastIndexOf(' ', max - 1)
  return `${s.slice(0, at > max / 2 ? at : max - 1).replace(/[\s,;:.–—-]+$/, '')}…`
}

/**
 * TAPPY_ANSWER_V4: the subjects of a comparison - one card each, in the owner's mockup layout (15/11): picture, name with a link mark, one-line subtitle, the first sentences of Wikipedia's summary as the
 * points, "Wikipedia" as the source, and the profile button. The same look as the cards the model declares (ProfileCards.tsx); a tap opens the profile beside the chat.
 */
export function EntityRow({ entities, onOpen, onOpenProfile, label }: {
  entities: readonly MediaEntity[]
  /** the older side panel, from what the server resolved */
  onOpen: (e: MediaEntity) => void
  /** the profile drawer of the workspace layout (the Wikipedia profile found for the name) */
  onOpenProfile?: (profile: WikiEntity) => void
  label: { open: string; sources: string }
}) {
  const ok = entities.filter(e => isAllowedMediaPage(e.href))
  if (ok.length < 2) return null
  const items: CardItem[] = ok.map(e => ({ name: e.name, points: pointsFromSummary(e.summary), sources: [e.source], ...(e.image && isAllowedMediaImage(e.image) ? { image: e.image } : {}) }))
  return (
    <div data-media="entities">
      <ProfileCards items={items} label={label} onOpenProfile={onOpenProfile} onOpenName={name => { const e = ok.find(x => x.name === name); if (e) onOpen(e) }} />
    </div>
  )
}
