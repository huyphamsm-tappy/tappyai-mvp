'use client'
// TAPPY_ANSWER_V4 layer 2 (owner 19/10/2026: "format & layout giống ChatGPT… như đang đọc báo"): the answer laid out as an ARTICLE.
//
// The markdown is parsed into blocks (lib/answerDoc/parse.ts) and each block gets its own typography — headings with air above them,
// paragraphs with a reading line height, real bulleted / numbered lists, quotes, rules — instead of one pre-wrapped string. The inline text of
// every block still goes through the chat's formatter (`format` = formatMessage: escaping, bold, link chips, source chips, tables, code), so
// nothing about what may reach the page changes. The server's item pictures (tappy.doc_media.v1) are placed next to the item they belong to,
// matched by title in any script (titleKey); a picture whose item is not found is not shown. Every picture URL is re-checked (safe https).
import { Fragment, type MouseEvent } from 'react'
import { parseDoc, listItemTitle, headingTitle, titleKey, type DocBlock } from '@/lib/answerDoc/parse'
import type { DocItemImage } from '@/lib/answerDoc/media'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { isAllowedMediaImage, isAllowedMediaPage, type MediaEntity } from '@/lib/media/mediaHosts'

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

function Inline({ html, as = 'div', className }: { html: string; as?: 'div' | 'span'; className?: string }) {
  const Tag = as
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />
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

function Blocks({ blocks, format, placed, prefix = '' }: { blocks: DocBlock[]; format: Format; placed: Map<string, DocItemImage>; prefix?: string }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'heading': {
            const img = placed.get(`${prefix}${i}`) ?? null
            const cls = b.level <= 2 ? 'text-xl font-semibold mt-6 mb-2 first:mt-0' : b.level === 3 ? 'text-lg font-semibold mt-5 mb-2 first:mt-0' : 'text-base font-semibold mt-4 mb-1.5 first:mt-0'
            return (
              <Fragment key={i}>
                <Inline html={format(b.text)} className={`${cls} text-gray-900 dark:text-gray-50 [text-wrap:balance]`} />
                {img && <ItemPicture img={img} size="wide" />}
              </Fragment>
            )
          }
          case 'para':
            return <Inline key={i} html={format(b.text)} className="my-3 first:mt-0 last:mb-0 whitespace-pre-line" />
          case 'quote':
            return <Inline key={i} html={format(b.text)} className="my-3 border-l-4 border-gray-200 dark:border-gray-700 pl-4 text-gray-600 dark:text-gray-300 whitespace-pre-line" />
          case 'hr':
            return <hr key={i} className="my-6 border-gray-200 dark:border-gray-700" />
          case 'raw':
            return <Inline key={i} html={format(b.text)} className="my-3 whitespace-pre-wrap" />
          case 'list': {
            const ListTag = b.ordered ? 'ol' : 'ul'
            return (
              <ListTag key={i} start={b.ordered && b.start !== 1 ? b.start : undefined}
                className={`my-3 space-y-2 pl-6 ${b.ordered ? 'list-decimal' : 'list-disc'} marker:text-gray-400 dark:marker:text-gray-500`}>
                {b.items.map((it, k) => {
                  const img = placed.get(`${prefix}${i}.${k}`) ?? null
                  const body = (
                    <>
                      <Inline html={format(it.text)} className="whitespace-pre-line" />
                      {it.children && <div className="mt-1.5"><Blocks blocks={parseDoc(it.children)} format={format} placed={placed} prefix={`${prefix}${i}.${k}/`} /></div>}
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
      })}
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
  const pic = (img: DocItemImage, cls: string) => (
    <img src={img.src} alt={img.title} loading="lazy" referrerPolicy="no-referrer" data-zoomable="true"
      onError={e => { e.currentTarget.style.setProperty('visibility', 'hidden') }} className={`h-full w-full object-cover bg-gray-100 dark:bg-gray-800 ${cls}`} />
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

export function ArticleAnswer({ text, images, format, className, onClick }: { text: string; images: readonly DocItemImage[]; format: Format; className?: string; onClick?: (e: MouseEvent<HTMLDivElement>) => void }) {
  const pics = new Map<string, DocItemImage>()
  for (const img of images) { const k = titleKey(img.title); if (k && !pics.has(k)) pics.set(k, img) }
  const blocks = parseDoc(text)
  return (
    <div data-answer="article" className={`message-content text-[15.5px] leading-7 ${className ?? ''}`} onClick={onClick}>
      <Blocks blocks={blocks} format={format} placed={assignPictures(blocks, pics)} />
    </div>
  )
}

/** The opening of a summary, at most `max` characters, cut at a word boundary with "…" (never mid-word, never the end of the text). */
export function summaryOpening(s: string, max = 150): string {
  if (s.length <= max) return s
  const at = s.lastIndexOf(' ', max - 1)
  return `${s.slice(0, at > max / 2 ? at : max - 1).replace(/[\s,;:.–—-]+$/, '')}…`
}

/** TAPPY_ANSWER_V4: the subjects of a comparison side by side — one Wikipedia card each (picture, name, two lines), opening the side panel. */
export function EntityRow({ entities, onOpen }: { entities: readonly MediaEntity[]; onOpen: (e: MediaEntity) => void }) {
  const ok = entities.filter(e => isAllowedMediaPage(e.href))
  if (ok.length < 2) return null
  return (
    <div data-media="entities" className={`my-3 grid gap-2 ${ok.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
      {ok.map(e => (
        // the summary is cut HERE to its opening (UAT 19/10: CSS line clamping showed the END of the summary in the headless browser)
        <div key={e.href} role="button" tabIndex={0} onClick={() => onOpen(e)} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(e) } }}
          className="min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 text-left">
          {e.image && isAllowedMediaImage(e.image)
            ? <img src={e.image} alt={e.name} loading="lazy" onError={ev => { ev.currentTarget.style.display = 'none' }} className="h-36 w-full object-cover object-top" />
            : <div className="h-2" />}
          <div className="p-2.5">
            <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{e.name}</div>
            <p className="mt-0.5 text-xs leading-snug text-gray-600 dark:text-gray-300">{summaryOpening(e.summary)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
