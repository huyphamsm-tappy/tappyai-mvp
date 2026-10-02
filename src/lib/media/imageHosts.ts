// Which image URLs next/image may be handed (F-057, owner decision 2026-09-26).
//
// next/image only optimises hosts listed in `images.remotePatterns` (next.config.mjs). Handed any
// other host it THROWS in development — a whole page 500s and the mobile Explore feed shows the
// error screen because one review photo lives on an unlisted host — and in production the
// optimiser answers 400, a broken image. Stored URLs are not ours to trust: seeds, imports, old
// rows, a future provider. So every component that renders a stored URL asks this first and falls
// back to a placeholder (SafeImage) instead of letting one bad image take down the page.
//
// 🔑 MUST EQUAL `images.remotePatterns` in next.config.mjs — imageHosts.test.ts reads that file and
// fails on any drift. Add a host in both places or in neither.

/** Hostname patterns, same syntax as remotePatterns: exact, or `*.` = exactly one extra label. */
export const OPTIMIZABLE_IMAGE_HOSTS = [
  'lh3.googleusercontent.com',
  '*.supabase.co',
  '*.public.blob.vercel-storage.com',
  'storage.googleapis.com',
  '*.jamendo.com',
  '*.zadn.vn',
] as const

function hostMatches(host: string, pattern: string): boolean {
  if (!pattern.startsWith('*.')) return host === pattern
  const suffix = pattern.slice(1) // ".supabase.co"
  if (!host.endsWith(suffix)) return false
  const label = host.slice(0, -suffix.length)
  return label.length > 0 && !label.includes('.')
}

/**
 * True when next/image can render `src` without throwing: a same-origin path, an inline data/blob
 * URL, or an https URL on an allowed host. Anything else — another host, http:, protocol-relative,
 * unparsable, empty — is false.
 */
export function isOptimizableImageSrc(src: string | null | undefined): boolean {
  if (!src) return false
  if (src.startsWith('/')) return !src.startsWith('//')
  if (src.startsWith('data:') || src.startsWith('blob:')) return true
  let url: URL
  try {
    url = new URL(src)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  return OPTIMIZABLE_IMAGE_HOSTS.some((p) => hostMatches(host, p))
}
