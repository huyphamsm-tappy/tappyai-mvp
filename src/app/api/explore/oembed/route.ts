import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge'

// GET /api/explore/oembed?url={tiktok_url}
// Server-side proxy — TikTok blocks direct client-side fetch (CORS)
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })
  if (!url.includes('tiktok.com')) {
    return NextResponse.json({ error: 'Only TikTok URLs supported' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TappyAI/1.0)' },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) {
      return NextResponse.json({ thumbnail_url: null, title: '', author_name: '' })
    }
    const data = await res.json()
    return NextResponse.json({
      thumbnail_url: data.thumbnail_url ?? null,
      title: data.title ?? '',
      author_name: data.author_name ?? '',
    })
  } catch {
    // Graceful fallback — TikTok oEmbed has no SLA
    return NextResponse.json({ thumbnail_url: null, title: '', author_name: '' })
  }
}
