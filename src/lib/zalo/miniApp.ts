// ─────────────────────────────────────────────────────────────────────────────
// Zalo Mini App — the integration boundary (G1-E).
//
// Architecture (see docs/growth/ZALO_MINI_APP.md):
//
//   Tappy Core ── SharedResultPayload ──┬── Web /r/<slug>
//                                       └── Zalo Mini App (reads the SAME payload
//                                           over GET /api/shared-results/<slug>)
//
// The Mini App is a THIN CLIENT of the frozen public payload. It has no result
// engine of its own, no second AI endpoint, and no identity model of its own:
// an AI question from inside Zalo goes to the same /api/chat, under the same
// anonymous quota, plus a per-Zalo-identity cap (see ./identity.ts).
//
// Nothing here calls Zalo. This file is pure: link builders and the launch
// parameter contract, so the web share layer can offer "open in Zalo Mini App"
// once the Mini App exists, and so tests can pin the URL shape.
//
// 🚨 The Mini App ID and the deep-link format are OWNER-CONFIGURED. The link
// template below follows Zalo's published `https://zalo.me/s/<MINI_APP_ID>/…`
// shape; it must be verified against the registered app before any link is
// distributed — see the manual steps in the doc. Until `ZALO_MINI_APP_ID` is
// set, `miniAppResultUrl` returns null and every caller falls back to the web.
// ─────────────────────────────────────────────────────────────────────────────

import { isValidSlug } from '@/lib/share/slug'

export const ZALO_MINI_APP_ID_ENV = 'NEXT_PUBLIC_ZALO_MINI_APP_ID'

/** The path the Mini App routes a shared result on. Mirrors the web path on purpose. */
export const MINI_APP_RESULT_PATH = 'r'

export function zaloMiniAppId(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = (env[ZALO_MINI_APP_ID_ENV] ?? '').trim()
  return /^\d{6,32}$/.test(id) ? id : null
}

/**
 * Deep link into the Mini App for a shared result, or null when the Mini App
 * is not configured. Carries `src=zalo_mini` so the landing is attributed.
 */
export function miniAppResultUrl(slug: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const appId = zaloMiniAppId(env)
  if (!appId || !isValidSlug(slug)) return null
  return `https://zalo.me/s/${appId}/${MINI_APP_RESULT_PATH}/${slug}?src=zalo_mini`
}

/** The launch parameters the Mini App reads. Pure parse of its own URL/query. */
export interface MiniAppLaunch { slug: string | null; source: 'zalo_mini' }

export function parseMiniAppLaunch(input: { path?: string | null; query?: Record<string, string | undefined> | null }): MiniAppLaunch {
  const segments = (input.path ?? '').split('/').filter(Boolean)
  const idx = segments.indexOf(MINI_APP_RESULT_PATH)
  const candidate = idx >= 0 ? segments[idx + 1] : input.query?.slug
  return { slug: isValidSlug(candidate) ? candidate : null, source: 'zalo_mini' }
}
