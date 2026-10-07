// The REAL marks of the platforms the share menu hands a link to.
//
// Before this, each destination in the share menu was a coloured circle with
// the first letter of the app's name in it — "F", "Z", "V" — a text label
// pretending to be an icon. A user scanning for WhatsApp or Telegram has to
// read every tile; a real mark is recognised at a glance.
//
// This is deliberately NOT `src/config/brandRegistry.ts`. That registry is the
// platform capability for COMMERCE PARTNERS: every entry carries a Deals
// category and an `approvedSince` date, its schema is mirrored 1:1 by the
// native clients, and adding a row there means "this partner is approved for
// Deals". A messaging app is not a partner and must never surface there. The
// same discipline is kept, though — official artwork only, never redrawn or
// recolored, provenance recorded per file — because the reasons behind it
// (licensing traceability, no approximated logos) apply here just as much.
// See docs/architecture/BRAND_ASSETS.md §9.
//
// Pure data, no React: the validation test reads it, and so can any surface
// that needs a platform mark (native share sheets included).

import type { ShareTargetId } from './shareTargets'

export interface ShareBrandMark {
  readonly id: ShareTargetId
  /** The platform's own name — a proper noun, never localized. */
  readonly displayName: string
  /** Local public path. SVG only: a mark must stay crisp at any device pixel ratio. */
  readonly logo: string
  /** Provenance of the exact asset file — licensing traceability, mandatory. */
  readonly source: string
  /** Licence the source publishes the file under. */
  readonly license: string
}

/**
 * One mark per platform that has one. Email, Copy, Save, the Tappy Inbox and
 * the system sheet are ACTIONS, not brands — they keep neutral glyphs on
 * purpose, so a real platform mark is never confused with a generic one.
 */
export const SHARE_BRAND_MARKS: Readonly<Partial<Record<ShareTargetId, ShareBrandMark>>> = {
  facebook: {
    id: 'facebook',
    displayName: 'Facebook',
    logo: '/brands/share/facebook.svg',
    source: 'Wikimedia Commons — File:2023_Facebook_icon.svg (current "f" roundel)',
    license: 'Public domain (simple geometry / text)',
  },
  messenger: {
    id: 'messenger',
    displayName: 'Messenger',
    logo: '/brands/share/messenger.svg',
    source: 'Wikimedia Commons — File:Facebook_Messenger_logo_2020.svg (current gradient bubble)',
    license: 'Public domain (simple geometry)',
  },
  zalo: {
    id: 'zalo',
    displayName: 'Zalo',
    logo: '/brands/share/zalo.svg',
    source: 'Wikimedia Commons — File:Icon_of_Zalo.svg (official app icon)',
    license: 'Public domain (text / simple geometry)',
  },
  whatsapp: {
    id: 'whatsapp',
    displayName: 'WhatsApp',
    logo: '/brands/share/whatsapp.svg',
    source: 'Wikimedia Commons — File:WhatsApp.svg (official green roundel)',
    license: 'Public domain (simple geometry)',
  },
  telegram: {
    id: 'telegram',
    displayName: 'Telegram',
    logo: '/brands/share/telegram.svg',
    source: 'Wikimedia Commons — File:Telegram_logo.svg (official paper-plane roundel)',
    license: 'Public domain (simple geometry)',
  },
  viber: {
    id: 'viber',
    displayName: 'Viber',
    logo: '/brands/share/viber.svg',
    source: 'Wikimedia Commons — File:Viber_icon.svg (official gradient bubble)',
    license: 'Public domain (simple geometry)',
  },
  line: {
    id: 'line',
    displayName: 'LINE',
    logo: '/brands/share/line.svg',
    source: 'Wikimedia Commons — File:LINE_logo.svg (official green tile)',
    license: 'Public domain (text / simple geometry)',
  },
  tiktok: {
    id: 'tiktok',
    displayName: 'TikTok',
    logo: '/brands/share/tiktok.svg',
    source: 'Wikimedia Commons — File:Tiktok_icon.svg (note mark on the black tile)',
    license: 'CC0 1.0',
  },
}

/** The mark for a destination, or null for the actions that have none. */
export function shareBrandMark(id: ShareTargetId): ShareBrandMark | null {
  return SHARE_BRAND_MARKS[id] ?? null
}
