import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge'

// GET /api/explore/oembed?url={url}
// Server-side proxy — TikTok blocks direct client-side fetch (CORS).
// Facebook: best-effort OG image scrape (may fail if page requires login).
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  if (url.includes('tiktok.com')) {
    try {
      const res = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TappyAI/1.0)' },
          signal: AbortSignal.timeout(5000),
        }
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

  if (url.includes('facebook.com') || url.includes('fb.watch')) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return NextResponse.json({ thumbnail_url: null, title: '', author_name: '' })
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
