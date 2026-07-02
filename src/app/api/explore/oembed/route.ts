import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge'

// GET /api/explore/oembed?url={url}
// Server-side proxy — TikTok blocks direct client-side fetch (CORS).
// Facebook: best-effort OG image scrape (may fail if page requires login).
//
// SSRF HARDENING: the provider URL is parsed with new URL(), restricted to an
// EXACT hostname allowlist, HTTPS-only, and rejected if it resolves to a
// localhost/loopback/private/link-local address. Redirects are not auto-followed;
// a single hop is allowed only when the redirect target is itself allowlisted.

const TIKTOK_HOSTS = new Set(['www.tiktok.com', 'tiktok.com', 'vm.tiktok.com', 'm.tiktok.com'])
const FACEBOOK_HOSTS = new Set(['www.facebook.com', 'facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.watch'])

// Reject hostnames that point at internal/loopback/private networks. The exact
// allowlist below already excludes these, but this is defense-in-depth in case
// the allowlist ever grows or a provider host is spoofed via an IP literal.
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true // IPv6 loopback/link-local/ULA
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1]), b = Number(m[2])
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true          // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    return true // any other bare-IP literal is not an allowlisted provider host → reject
  }
  return false
}

// Parse + validate: HTTPS only, hostname EXACTLY in the allowlist, not private.
function validate(raw: string, allowed: Set<string>): URL | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  if (isPrivateHost(host)) return null
  if (!allowed.has(host)) return null
  return u
}

// Fetch that blocks redirect-based SSRF: no auto-follow; a single redirect hop
// is followed only if its target is also allowlisted (covers fb.watch → facebook.com).
async function safeFetch(u: URL, allowed: Set<string>, headers: Record<string, string>): Promise<Response | null> {
  let res = await fetch(u.toString(), { headers, redirect: 'manual', signal: AbortSignal.timeout(6000) })
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location')
    if (!loc) return null
    let next: URL
    try { next = new URL(loc, u) } catch { return null }
    if (!validate(next.toString(), allowed)) return null
    res = await fetch(next.toString(), { headers, redirect: 'error', signal: AbortSignal.timeout(6000) })
  }
  return res
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url')
  if (!raw) return NextResponse.json({ error: 'url required' }, { status: 400 })

  // TikTok: the fetch target is the hardcoded TikTok oembed API; the user URL is
  // only passed as a query value. We still validate it is a genuine TikTok URL.
  const tk = validate(raw, TIKTOK_HOSTS)
  if (tk) {
    try {
      const res = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(tk.toString())}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TappyAI/1.0)' }, signal: AbortSignal.timeout(5000) }
      )
      if (!res.ok) return NextResponse.json({ thumbnail_url: null, title: '', author_name: '' })
      const data = await res.json()
      return NextResponse.json({
        thumbnail_url: data.thumbnail_url ?? null,
        title: data.title ?? '',
        author_name: data.author_name ?? '',
      })
    } catch {
      return NextResponse.json({ thumbnail_url: null, title: '', author_name: '' })
    }
  }

  // Facebook: direct OG scrape of the user URL — must be an allowlisted FB host.
  const fb = validate(raw, FACEBOOK_HOSTS)
  if (fb) {
    try {
      const res = await safeFetch(fb, FACEBOOK_HOSTS, {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        Accept: 'text/html',
      })
      if (!res || !res.ok) return NextResponse.json({ thumbnail_url: null, title: '', author_name: '' })
      const html = await res.text()
      const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
        ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1]
        ?? null
      const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
        ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1]
        ?? ''
      return NextResponse.json({ thumbnail_url: ogImage, title: ogTitle, author_name: '' })
    } catch {
      return NextResponse.json({ thumbnail_url: null, title: '', author_name: '' })
    }
  }

  return NextResponse.json({ error: 'Unsupported URL' }, { status: 400 })
}
