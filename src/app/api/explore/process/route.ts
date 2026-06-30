import { processContent } from '@/lib/explore/contentProcessor'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/explore/process  { thumbnail_url, hint? }
// Calls Haiku ONCE to generate caption + hashtags for a newly uploaded piece of content.
// Only runs on upload — never during feed loading or scrolling.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Return empty result for unauthenticated — don't error, just skip AI
  if (!user) {
    return NextResponse.json({ caption: '', hashtags: [], category: 'other', location: '' })
  }

  let thumbnail_url = ''
  let hint = ''
  try {
    const b = await req.json()
    thumbnail_url = b.thumbnail_url?.trim() || ''
    hint = b.hint?.trim() || ''
  } catch { /* empty body */ }

  if (!thumbnail_url) {
    return NextResponse.json({ caption: '', hashtags: [], category: 'other', location: '' })
  }

  const result = await processContent(thumbnail_url, hint)
  return NextResponse.json(result)
}
