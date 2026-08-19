import { createClient } from '@/lib/supabase/server'
import { publishableFilter } from '@/lib/safety/gate/publicationAccess'

/**
 * The row behind the public review detail page.
 *
 * Lives in its own module rather than in `page.tsx` because Next.js allows a
 * page to export only its own reserved names — and this query is worth testing
 * directly rather than inferring from rendered output.
 *
 * 🔑 The publication filter applies UNCONDITIONALLY, including for the author.
 * This is the shareable public URL for a post; an author reaches their own
 * unpublished content through their profile, which is the surface built for it.
 * Making the public URL behave differently for one viewer would produce a link
 * that works for its author and 404s for everyone they send it to.
 *
 * 🚨 Defence in depth, not the boundary. The database's RESTRICTIVE RLS policy
 * is the authority and already refuses held rows to anonymous and to other
 * authenticated callers. This adds the same guard the five review APIs carry, so
 * the page does not stand alone on a policy that lives in another system: an
 * environment where that migration had not been applied would otherwise leak
 * here while every API stayed correct.
 */
export async function getReview(id: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('reviews')
    .select(`
      id, user_id, place_name, place_address, rating, body,
      photos, is_verified, like_count, comment_count, created_at, music,
      content_type, media_url, thumbnail, source_type, source_url,
      profiles(full_name, avatar_url)
    `)
    .eq('id', id)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .or(publishableFilter())
    .single()
  return data
}
