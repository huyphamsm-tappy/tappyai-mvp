import { processContent } from '@/lib/explore/contentProcessor'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { NextRequest, NextResponse } from 'next/server'

const EMPTY: Record<string, unknown> = { caption: '', hashtags: [], category: 'other', location: '' }

// POST /api/explore/process  { thumbnail_url?, caption?, title? }
// Priority: caption → title → thumbnail_url (never uses thumbnail alone if text is available)
// Only runs on upload — never during feed loading or scrolling.
export async function POST(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json(EMPTY)

  let thumbnail_url = '', caption = '', title = ''
  try {
    const b = await req.json()
    thumbnail_url = b.thumbnail_url?.trim() || ''
    caption = b.caption?.trim() || ''
    title = b.title?.trim() || ''
  } catch { /* empty body */ }

  // SSRF guard: the thumbnail URL is fetched server-side (AI SDK image input).
  // Only allow https URLs to public hosts; drop anything pointing at
  // localhost/loopback/private/link-local/internal or a non-https scheme.
  if (thumbnail_url && !isSafeHttpsUrl(thumbnail_url)) {
    console.warn('[explore/process] rejected unsafe thumbnail_url')
    thumbnail_url = ''
  }

  if (!thumbnail_url && !caption && !title) return NextResponse.json(EMPTY)

  const result = await processContent({
    thumbnailUrl: thumbnail_url || undefined,
    caption: caption || undefined,
    title: title || undefined,
  })
  return NextResponse.json(result)
}
