// TikTok takes a FILE, not a link.
//
// TikTok publishes no web endpoint that accepts a URL (there is no "sharer" for it), and a link
// pasted into TikTok is not a post. What TikTok does accept is an image or a video. So the TikTok
// tile hands over a FILE — the card image rendered in the layout the user is looking at (the same
// generator "Save" uses, see shareCardFile.ts), or an uploaded Explore clip's own video — and the
// caption (title + link) rides along as text:
//
//  1. `share-files`  the browser can share files (`navigator.canShare({ files })`, i.e. a phone):
//                    the OS sheet opens with the file and the user picks TikTok in it.
//  2. `download-open` anywhere else (desktop, or a phone browser without file sharing, or a
//                    share call the browser refused): the file is downloaded and
//                    https://www.tiktok.com/upload opens, with a one-line hint on screen.
//  3. `copy`         no file could be produced at all: the caption is copied, said plainly.
//
// 🔑 SEAM, OFF BY DEFAULT: TikTok's Content Posting API (direct upload into the user's TikTok
// drafts) needs an app registered on developers.tiktok.com plus a per-user OAuth grant. None of
// that exists yet, so nothing here calls it. `TIKTOK_CONTENT_POSTING_ENABLED` is the named switch a
// future integration flips; while it is false (the default) the two paths above are the product.

/** TikTok's own web upload page — where a downloaded file is picked. */
export const TIKTOK_UPLOAD_URL = 'https://www.tiktok.com/upload'

/**
 * The seam for TikTok's Content Posting API. Default OFF — and it stays off until the owner has
 * registered the app on developers.tiktok.com and the OAuth callback exists. Flipping it today
 * changes nothing: no code path posts through the API yet.
 */
export const TIKTOK_CONTENT_POSTING_ENABLED = process.env.NEXT_PUBLIC_TIKTOK_CONTENT_POSTING_ENABLED === 'true'

export type TikTokPath = 'share-files' | 'download-open' | 'copy'

/** Decide the path from what is available. Pure — the menu and the tests share it. */
export function chooseTikTokPath(input: { file: File | null; canShareFiles: boolean }): TikTokPath {
  if (!input.file) return 'copy'
  return input.canShareFiles ? 'share-files' : 'download-open'
}

/** The caption that travels with the file: the title line and the link. */
export function tiktokCaption(subject: string, url: string): string {
  const s = subject.trim()
  const u = url.trim()
  if (!s) return u
  if (!u || s === u) return s
  return `${s}\n${u}`
}

/** Whether this browser will accept `files` in `navigator.share`. Never throws. */
export function canShareFiles(nav: Partial<Navigator> | undefined, file: File | null): boolean {
  if (!nav || !file || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false
  try { return nav.canShare({ files: [file] }) } catch { return false }
}

export type TikTokOutcome =
  /** The OS sheet took the file (the user may have picked TikTok — we cannot know which app). */
  | 'shared'
  /** The user closed the sheet. Not an error, and not a share. */
  | 'cancelled'
  /** The file was downloaded and TikTok's upload page was opened (or attempted). */
  | 'downloaded'
  /** No file; the caption was copied instead. */
  | 'copied'
  | 'failed'

export interface TikTokDeps {
  nav?: Partial<Navigator>
  download: (file: File) => void
  open: (url: string) => unknown
  copy: (text: string) => Promise<boolean>
}

/**
 * Run the TikTok share for an already-prepared file.
 *
 * A `share()` the browser refuses for any reason other than the user cancelling (an expired user
 * activation after a slow render, a NotAllowedError, a type the platform will not share) falls to
 * download + open — the user still ends up with the file and TikTok's upload page.
 */
export async function runTikTokShare(file: File | null, caption: string, deps: TikTokDeps): Promise<TikTokOutcome> {
  const path = chooseTikTokPath({ file, canShareFiles: canShareFiles(deps.nav, file) })
  if (path === 'copy' || !file) return (await deps.copy(caption)) ? 'copied' : 'failed'
  if (path === 'share-files') {
    try {
      await deps.nav!.share!({ files: [file], text: caption, title: caption.split('\n')[0] })
      return 'shared'
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
      // fall through to the desktop path
    }
  }
  deps.download(file)
  deps.open(TIKTOK_UPLOAD_URL)
  return 'downloaded'
}

/** Upper bound for fetching a clip into memory for a share. Bigger clips share the card instead. */
export const MAX_SHARE_VIDEO_BYTES = 100 * 1024 * 1024

/**
 * An uploaded clip's video as a File, or null (network, CORS, oversized, not a video).
 * The caller then shares the card image instead — never nothing.
 */
export async function fetchVideoFile(url: string, name: string, fetchImpl: typeof fetch = fetch): Promise<File | null> {
  try {
    const res = await fetchImpl(url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) return null
    const declared = Number(res.headers.get('content-length') ?? '0')
    if (declared > MAX_SHARE_VIDEO_BYTES) return null
    const blob = await res.blob()
    if (blob.size === 0 || blob.size > MAX_SHARE_VIDEO_BYTES) return null
    const type = (res.headers.get('content-type') ?? blob.type ?? '').split(';')[0].trim().toLowerCase()
    const mime = type.startsWith('video/') ? type : 'video/mp4'
    const ext = mime === 'video/quicktime' ? 'mov' : mime === 'video/webm' ? 'webm' : 'mp4'
    return new File([blob], `${name}.${ext}`, { type: mime })
  } catch {
    return null
  }
}
