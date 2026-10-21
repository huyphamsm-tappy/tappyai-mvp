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

function Blocks({ blocks, format, pics, used }: { blocks: DocBlock[]; format: Format; pics: Map<string, DocItemImage>; used: Set<string> }) {
  const take = (title: string | null): DocItemImage | null => {
    if (!title) return null
    const k = titleKey(title)
    const img = pics.get(k)
    if (!img || used.has(k)) return null
    used.add(k)
    return img
  }
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'heading': {
            const img = take(headingTitle(b.text))
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
                  const img = take(listItemTitle(it.text))
                  const body = (
                    <>
                      <Inline html={format(it.text)} className="whitespace-pre-line" />
                      {it.children && <div className="mt-1.5"><Blocks blocks={parseDoc(it.children)} format={format} pics={pics} used={used} /></div>}
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

export function ArticleAnswer({ text, images, format, className, onClick }: { text: string; images: readonly DocItemImage[]; format: Format; className?: string; onClick?: (e: MouseEvent<HTMLDivElement>) => void }) {
  const pics = new Map<string, DocItemImage>()
  for (const img of images) { const k = titleKey(img.title); if (k && !pics.has(k)) pics.set(k, img) }
  return (
    <div data-answer="article" className={`message-content text-[15.5px] leading-7 ${className ?? ''}`} onClick={onClick}>
      <Blocks blocks={parseDoc(text)} format={format} pics={pics} used={new Set()} />
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
