// The two places of the chat workspace reserved for art that is not decided yet (14/11/2026, owner: "banner nền bố cục cứ để lại, vẽ khung và code vị trí trước thôi"):
//   · the BANNER: a panel of its own at the top of the right column, ABOVE the conversation's panel (not inside it) and level with the top of the history panel, full column width,
//     BANNER_SIZE tall (the owner's reference: the banner and the conversation are two separate rounded panels);
//   · the BACKGROUND layer: behind the whole workspace, under every panel, softened so the chat stays readable.
// Both need NEXT_PUBLIC_SHELL_REF (the first layout's shell) and do nothing until told to:
//   NEXT_PUBLIC_SHELL_SLOTS=1            draws each slot as a dashed frame with its size, to see and judge the position (no art needed);
//   NEXT_PUBLIC_SHELL_BANNER_IMAGE       the banner picture: a path on this site ("/banners/a.webp") or an https URL; unset = the owner's banner (DEFAULT_BANNER), "off" = none;
//   NEXT_PUBLIC_SHELL_BACKGROUND_IMAGE   the background picture, same rule (no default: the owner will give it later).
// With NEXT_PUBLIC_SHELL_REF off, nothing is rendered and the layout is byte-for-byte what it was. How the banner behaves (a link, a rotation, per person) is not decided: it is a picture in a place.
import { SHELL_REF } from './shellRef'

/** Only a path of this site or an https URL ever becomes an image address; anything else (a script URL, http, a data URI) is no image. */
export function slotImageUrl(raw: string | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v || v.length > 500 || /[\s"'()<>\\]/.test(v)) return null
  if (v.startsWith('/') && !v.startsWith('//')) return v
  return /^https:\/\/[^/]/i.test(v) ? v : null
}

/** Where a click on the banner goes (owner 15/11: the banner is the Explore banner): the same destination as the rail's "Khám phá". */
export const BANNER_HREF = '/reviews'
/**
 * The size to make the banner art at: 3200 x 300 px (the box's own 1600 : 150 at 2x). The box takes the column's width, which on a 1920 px wide screen is about 1368 CSS px, so the art shows
 * at about 1368 x 128 there; 2x keeps it sharp on high-density screens. Only the RATIO matters to the layout; keep the art about 24 px (at display size) away from the corners, which are rounded.
 */
export const BANNER_ART = { width: 3200, height: 300 } as const
/** The banner's proportions (1600 : 150): the box takes the column's full width and this ratio, and the picture is shown whole, never cropped. A picture of another ratio is letterboxed, so make art at this size. */
export const BANNER_SIZE = { width: 1600, height: 150 } as const

/** The banner the owner gave (14/11/2026, 1600 x 150): what the banner place shows unless NEXT_PUBLIC_SHELL_BANNER_IMAGE names another picture, or says "off". */
export const DEFAULT_BANNER = '/banners/shell-banner.webp'
/** Unset or empty = the default banner; "off" = no banner; any other value is the picture to use, and an address that is not safe draws nothing (never falls back). */
export function bannerFrom(setting: string | undefined): string | null {
  const v = (setting ?? '').trim()
  if (!v) return DEFAULT_BANNER
  if (v.toLowerCase() === 'off') return null
  return slotImageUrl(v)
}

/** The background the owner gave (15/11/2026, Hồ Gươm at dusk, 1672 x 941): what the background place shows unless NEXT_PUBLIC_SHELL_BACKGROUND_IMAGE names another picture, or says "off". Best made at 2560 x 1440. */
export const DEFAULT_BACKGROUND = '/backgrounds/shell-background.webp'
/** Same rule as the banner: unset or empty = the default picture; "off" = none; any other value is the picture to use, and an unsafe address draws nothing (never falls back). */
export function backgroundFrom(setting: string | undefined): string | null {
  const v = (setting ?? '').trim()
  if (!v) return DEFAULT_BACKGROUND
  if (v.toLowerCase() === 'off') return null
  return slotImageUrl(v)
}

export const SHELL_SLOTS = {
  frame: SHELL_REF && process.env.NEXT_PUBLIC_SHELL_SLOTS === '1',
  banner: SHELL_REF ? bannerFrom(process.env.NEXT_PUBLIC_SHELL_BANNER_IMAGE) : null,
  background: SHELL_REF ? backgroundFrom(process.env.NEXT_PUBLIC_SHELL_BACKGROUND_IMAGE) : null,
}

/** True when the workspace has anything to draw for the slots. */
export const SHELL_SLOTS_ACTIVE = SHELL_SLOTS.frame || !!SHELL_SLOTS.banner || !!SHELL_SLOTS.background
