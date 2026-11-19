// 15/11 (owner: "bấm vào link hay tên chủ thể thì hiện thanh bên cạnh để đọc tin luôn - áp dụng chung cho tất cả các câu trả lời, có vài link đang bung ra tab mới"): which links of an answer open the READER
// beside the chat (the side drawer, fed by /api/link-preview) instead of a new tab. ONE rule for every answer and every part of it (the text, the sources list, the cards' article links, an opened report):
// an ordinary https link to another site. What stays as it was: a link that is not a page to read (a map, a video, a social network, a phone, a mail, a download), a partner / affiliate link (a handoff to
// act on, which must land on the partner), a link of this site, a link with a modifier key or a middle click (the person asked for a new tab), and a link that opts out (data-reader="off"). Pure.
import { trackedLinkFacts } from '@/lib/ccp/tracking/trackedLink'

/** Where the links of an answer live: its text, the sources list, the media cards, and the opened report. Place cards, booking buttons, the composer and the menus are not in it. */
export const READER_SCOPE = '.message-content, [data-doc-sources], [data-media], [data-testid="research-canvas"], [data-reader-scope]'

/** Pages that are not articles to read here: maps, video, social networks, messengers. They keep opening where they belong. */
const NOT_READABLE = /(^|\.)(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl|youtube\.com|youtu\.be|tiktok\.com|facebook\.com|fb\.com|fb\.watch|instagram\.com|x\.com|twitter\.com|threads\.net|zalo\.me|t\.me|wa\.me|messenger\.com)$/i
/**
 * 19/11 (owner: "we are an Agoda partner, why does the page not open"): a booking or shopping site is a page to ACT on, not an article to read, and its pages are drawn by script, so the reader showed
 * a "please wait" placeholder and a line of JSON. The partners (Agoda, Vexere, Lazada) and the other travel and shopping platforms always open where they belong, whether or not the address carries a tracking mark.
 */
const ACTION_SITES = /(^|\.)(agoda\.[a-z.]+|vexere\.com|lazada\.[a-z.]+|shopee\.[a-z.]+|tiki\.vn|booking\.com|traveloka\.com|trip\.com|klook\.com|food\.grab\.com|grab\.com|shopeefood\.vn|befood\.vn|baemin\.vn|cellphones\.com\.vn|dienmayxanh\.com|thegioididong\.com|dienmaycholon\.vn)$/i

export interface ReaderLink { url: string; title: string }

export interface AnchorLike {
  href: string
  target?: string
  download?: boolean | string
  textContent?: string | null
  getAttribute(name: string): string | null
}

/** The page a click on this link should open in the reader, or null when the link keeps its usual behaviour. */
export function readerLinkTarget(a: AnchorLike, origin: string): ReaderLink | null {
  const raw = a.href
  if (!raw) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'https:' || u.username || u.password) return null
  if (u.origin === origin) return null
  if (a.getAttribute('data-reader') === 'off') return null
  if (a.download || a.getAttribute('download') !== null) return null
  const host = u.hostname.replace(/^www\./, '')
  if (NOT_READABLE.test(host) || ACTION_SITES.test(host) || (/(^|\.)google\.[a-z.]+$/i.test(host) && u.pathname.startsWith('/maps'))) return null
  if (trackedLinkFacts(raw)) return null
  const label = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
  return { url: u.toString(), title: label.length > 0 && label.length <= 140 && !/^https?:\/\//i.test(label) ? label : '' }
}

export interface ClickLike { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }

/** A plain left click: with a modifier key or another button the browser keeps its own behaviour (a new tab or window the person asked for). */
export const isPlainClick = (e: ClickLike): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented
