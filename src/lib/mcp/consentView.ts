// The pure parts of the OAuth consent screen (/oauth/consent) for connectors: what the user is shown and what the page may do with the answer.
// The OAuth server itself is Supabase's (it must be switched on in the project: Authentication -> OAuth Server, with the consent path set to /oauth/consent). This file builds nothing of the server.
// Checked on 22/11/2026 against the real UAT Supabase OAuth server (authorize -> this screen -> approve -> code -> token): the shapes work. Not yet tried with a real AI Host.

import { SCOPE_TEXT, UNKNOWN_SCOPE, IDENTITY_SCOPES, IDENTITY_TEXT, type ConsentLocale } from '@/lib/i18n/mcpConsent'

/** `authorization_id` is an opaque id minted by Supabase. We accept only a plain token (no slash, no whitespace) of sensible length, so nothing odd reaches the SDK call or the page. */
export const isAuthorizationId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(v)

/** Each requested scope in plain words (text in src/lib/i18n/mcpConsent.ts). An unknown scope is shown as such, never silently dropped: the user must see everything that was asked. */
export function scopeLines(scope: string | undefined | null, locale: ConsentLocale): string[] {
  const parts = (scope ?? '').split(/\s+/).filter(Boolean)
  const identity: readonly string[] = IDENTITY_SCOPES
  const lines: string[] = []
  for (const s of parts) {
    const line = SCOPE_TEXT[s]?.[locale] ?? (identity.includes(s) ? IDENTITY_TEXT[locale] : `${UNKNOWN_SCOPE[locale]} ${s}`)
    if (!lines.includes(line)) lines.push(line)
  }
  // Supabase can only carry OpenID scopes, so a connector asks for "openid profile" and nothing else: what it may do is then the connector's full capability list (the registry default grant), shown in full.
  if (parts.length > 0 && parts.every(s => identity.includes(s))) lines.push(...Object.keys(SCOPE_TEXT).map(k => SCOPE_TEXT[k][locale]))
  return lines
}

/** App schemes a desktop host registers for its OAuth callback. Only `cursor:` (Cursor desktop): the Cursor docs list a separate redirect URL for the desktop app. UNVERIFIED: confirm the exact URL on the real app. */
const APP_SCHEMES: readonly string[] = ['cursor:']

/**
 * The address the browser may be sent to after the decision. It comes from the OAuth server, but the page still refuses anything that is not a plain https address
 * (or http on localhost, for a developer tool such as an editor's callback, or the one app scheme above) and anything that carries credentials or a script scheme.
 */
export function safeOAuthRedirect(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > 4000) return null
  try {
    const u = new URL(url)
    if (u.username || u.password) return null
    if (APP_SCHEMES.includes(u.protocol)) return u.toString()
    if (u.protocol === 'https:') return u.toString()
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')) return u.toString()
    return null
  } catch { return null }
}
