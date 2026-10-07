// Share metadata for a public profile (/users/<id>) — Zalo / Facebook / Messenger / X previews.
//
// 🚨 BUG 13 (UAT, Oct 2026): a profile link pasted into Zalo showed the generic TappyAI banner.
// Root cause: `generateMetadata` returned ONLY `{ title }` whenever the profile lookup came back empty
// (it inherits the root layout's og:* tags — the generic banner), and even with a name it used the
// avatar or the generic banner as og:image — never the profile's own share card. The profile now
// exposes a rendered 1200x630 card (`/users/<id>/card.png`, the TappyAI QR card composition) as og:image.
//
// Pure functions: no network, no cookies — the page and the card route do the (public-column) read.

import type { Metadata } from 'next'
import { BRAND, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, absoluteUrl } from '@/lib/share/openGraph'

/** Bump to force every crawler to re-fetch every profile card after a DESIGN change. */
export const PROFILE_CARD_VERSION = 1

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isProfileId(id: string): boolean {
  return UUID.test(id)
}

export interface PublicProfileOg {
  full_name: string | null
  avatar_url?: string | null
  /** `profiles.updated_at` (set by trigger on every edit) — the cache-bust token. */
  updated_at?: string | null
}

/**
 * Cache-busting token: design version + the profile's last edit. Zalo/Facebook cache an og:image per
 * URL, so a changed name/avatar must change the URL. Falls back to a hash of the public fields when
 * the row carries no `updated_at`.
 */
export function profileCardVersion(p: PublicProfileOg): string {
  const t = p.updated_at ? Date.parse(p.updated_at) : NaN
  if (Number.isFinite(t)) return `${PROFILE_CARD_VERSION}.${t.toString(36)}`
  let h = 5381
  for (const ch of `${p.full_name ?? ''}|${p.avatar_url ?? ''}`) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0
  return `${PROFILE_CARD_VERSION}.${h.toString(36)}`
}

/** Absolute https URL of the profile's share card (query kept: it is the version, never a token). */
export function profileCardUrl(id: string, version?: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = absoluteUrl(`/users/${id}/card.png`, env)
  return version ? `${base}?v=${encodeURIComponent(version)}` : base
}

/** The metadata for `/users/<id>`. A missing/unreadable profile still gets a (neutral) card URL — never the bare title. */
export function buildProfileMetadata(id: string, profile: PublicProfileOg | null, env: NodeJS.ProcessEnv = process.env): Metadata {
  const url = absoluteUrl(`/users/${id}`, env)
  const name = profile?.full_name ? String(profile.full_name).trim().slice(0, 60) : ''
  if (!name || !profile) {
    // Not found / unnamed: a generic title and the generic brand image — nothing about the account.
    return {
      title: `Profile | ${BRAND.name}`,
      alternates: { canonical: url },
      robots: { index: false, follow: true },
    }
  }
  const title = `${name} | ${BRAND.name}`
  const description = `${name} on ${BRAND.name}`
  const image = {
    url: profileCardUrl(id, profileCardVersion(profile), env),
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    alt: `${name} · ${BRAND.name}`,
    type: 'image/png',
  }
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'profile', title: name, description, url, siteName: BRAND.name, images: [image] },
    twitter: { card: 'summary_large_image', title: name, description, images: [image.url] },
  }
}
