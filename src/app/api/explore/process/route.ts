import { processContent } from '@/lib/explore/contentProcessor'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const EMPTY: Record<string, unknown> = { caption: '', hashtags: [], category: 'other', location: '' }

// POST /api/explore/process  { thumbnail_url?, caption?, title? }
// Priority: caption → title → thumbnail_url (never uses thumbnail alone if text is available)
// Only runs on upload — never during feed loading or scrolling.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(EMPTY)

  let thumbnail_url = '', caption = '', title = ''
  try {
    const b = await req.json()
    thumbnail_url = b.thumbnail_url?.trim() || ''
    caption = b.caption?.trim() || ''
    title = b.title?.trim() || ''
  } catch { /* empty body */ }

  if (!thumbnail_url && !caption && !title) return NextResponse.json(EMPTY)

  const result = await processContent({
    thumbnailUrl: thumbnail_url || undefined,
    caption: caption || undefined,
    title: title || undefined,
  })
  return NextResponse.json(result)
}
