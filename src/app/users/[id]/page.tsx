import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { BRAND, absoluteUrl, safeOgImageUrl } from '@/lib/share/openGraph'
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
  const fallback: Metadata = { title: `Profile | ${BRAND.name}` }

  try {
    const supabase = createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', params.id)
      .maybeSingle()

    if (!profile?.full_name) return fallback

    const name = String(profile.full_name).slice(0, 60)
    const title = `${name} | ${BRAND.name}`
    const description = `${name} on ${BRAND.name}`
    const url = absoluteUrl(`/users/${params.id}`)
    // The same guard the review page uses: an avatar a crawler cannot fetch produces a broken
    // preview image, which looks worse than the branded card.
    const image = safeOgImageUrl(profile.avatar_url ?? undefined)

    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        type: 'profile',
        title: name,
        description,
        url,
        siteName: BRAND.name,
        images: [{ url: image }],
      },
      twitter: {
        card: 'summary',
        title: name,
        description,
        images: [image],
      },
    }
  } catch {
    return fallback
  }
}

export default function UserProfilePage({ params }: Props) {
  return <UserProfileView userId={params.id} />
}
