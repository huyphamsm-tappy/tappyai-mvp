// ─────────────────────────────────────────────────────────────────────────────
// App Links (Android) / Universal Links (iOS) association files — PREPARED,
// not active. Both files are served only when the owner has configured the
// signing identities; until then the routes 404 and nothing changes for any
// platform. No manifest/entitlement in either app claims https links yet, so
// serving these is inert by construction (see docs/growth/DISTRIBUTION.md).
//
// Why prepare them at all: they are the ONE server-side prerequisite both
// platforms share for "a /r/<slug> link opens the app when installed", and
// they carry no secrets — only the app ids and certificate fingerprints that
// the stores already publish.
// ─────────────────────────────────────────────────────────────────────────────

/** Comma-separated SHA-256 fingerprints of the Android signing certs. */
export const ANDROID_FINGERPRINTS_ENV = 'ANDROID_APP_LINKS_SHA256'
export const ANDROID_PACKAGE = 'com.tappyai.app'
/** `<TEAMID>.<bundle id>` for the iOS app. */
export const IOS_APP_ID_ENV = 'IOS_UNIVERSAL_LINKS_APP_ID'

const SHA256_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/
const APP_ID_RE = /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/

export function androidFingerprints(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env[ANDROID_FINGERPRINTS_ENV] ?? '').split(',').map(s => s.trim().toUpperCase()).filter(s => SHA256_RE.test(s))
}

/** Digital Asset Links statement list, or null when not configured. Pure. */
export function assetLinks(env: NodeJS.ProcessEnv = process.env): unknown[] | null {
  const fps = androidFingerprints(env)
  if (!fps.length) return null
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: fps },
  }]
}

/** The paths the app would claim. Public surfaces only — never /chat, /api, /admin. */
export const UNIVERSAL_LINK_PATHS = ['/r/*', '/food', '/shopping', '/travel', '/entertainment', '/spa'] as const

/** apple-app-site-association, or null when not configured. Pure. */
export function appleAppSiteAssociation(env: NodeJS.ProcessEnv = process.env): Record<string, unknown> | null {
  const appId = (env[IOS_APP_ID_ENV] ?? '').trim()
  if (!APP_ID_RE.test(appId)) return null
  return { applinks: { apps: [], details: [{ appID: appId, paths: [...UNIVERSAL_LINK_PATHS] }] } }
}
