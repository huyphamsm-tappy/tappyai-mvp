import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { buildProfileMetadata, isProfileId } from '@/lib/share/profileOg'
import UserProfileView from './UserProfileView'

interface Props {
  params: { id: string }
}

/**
 * Share metadata for a public profile — U12.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * This route was a `'use client'` module, and a client module cannot export `generateMetadata`.
 * So every shared profile link previewed with the generic site title and tagline, while a shared
 * REVIEW link previewed with the review's own subject. Two links to the same product, one of them
 * anonymous.
 *
 * (The generic title is deliberately not quoted here: it is Vietnamese, and the hardcoded-strings
 * ratchet counts quoted Vietnamese per line without knowing this one is an explanation.)
 *
 * The interactive part moved to `UserProfileView`; this file is the server shell. Same split as
 * /profile/account and /profile/bookings, and for the same reason.
 *
 * 🚨 Only PUBLIC fields are read. `profiles` has a public SELECT policy, and the three columns
 * below are the ones `GET /api/users/[id]` already serves to any caller — nothing here exposes
 * anything a visitor could not already see. A profile that cannot be read falls back to a generic
 * title rather than failing the page: a missing preview is a smaller problem than a 500.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    if (!isProfileId(params.id)) return buildProfileMetadata(params.id, null)
    const supabase = createClient()
    // `updated_at` is the og:image cache-bust token; if a deployment lacks the column, read without it.
    let { data: profile, error } = await supabase
      .from('profiles')
      .select('full_name, avatar_url, updated_at')
      .eq('id', params.id)
      .maybeSingle()
    if (error?.code === '42703') {
      ;({ data: profile } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', params.id).maybeSingle())
    }
    return buildProfileMetadata(params.id, profile ?? null)
  } catch {
    return buildProfileMetadata(params.id, null)
  }
}

export default function UserProfilePage({ params }: Props) {
  return <UserProfileView userId={params.id} />
}
