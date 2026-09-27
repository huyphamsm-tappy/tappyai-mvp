// ─────────────────────────────────────────────────────────────────────────────
// App Links (Android) / Universal Links (iOS) association files.
//
// ANDROID — prepared, not active. `assetlinks.json` is served only once the
// owner sets the signing fingerprints; until then the route 404s. The
// fingerprint is NOT in this repository: it comes from Play Console →
// Setup → App signing (app signing key + upload key SHA-256).
//
// iOS — LIVE. The iOS app is signed with the `applinks:www.tappyai.com`
// Associated Domains entitlement, so the association file is built from
// constants rather than an env var: the Team ID and bundle id are public, and
// they cannot change without the app itself changing, so an env var could only
// add a way for the file to be missing or wrong (which is what happened — see
// `IOS_APP_ID` below).
//
// Neither file carries a secret — only app ids and certificate fingerprints
// that the stores already publish.
// ─────────────────────────────────────────────────────────────────────────────

/** Comma-separated SHA-256 fingerprints of the Android signing certs. */
export const ANDROID_FINGERPRINTS_ENV = 'ANDROID_APP_LINKS_SHA256'
export const ANDROID_PACKAGE = 'com.tappyai.app'

const SHA256_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

/**
 * The certificate of the legacy Trusted Web Activity `com.tappyai.twa` — the fingerprint the
 * static `public/.well-known/assetlinks.json` carried until 2026-09-27 (superseded by the native
 * app, docs/Android_Sprint_Go_NoGo.md §8). It is a real certificate, but not `com.tappyai.app`'s,
 * so pasting it into the env would publish a statement that verifies nothing.
 */
export const LEGACY_TWA_FINGERPRINT =
  '19:3F:97:CF:83:36:96:F7:DA:70:E1:8E:69:31:D3:E4:81:12:E3:EA:BD:FB:B1:64:56:12:8B:44:31:2F:C3:A4'

/**
 * A value shaped like a fingerprint but made up — `AA:BB:CC:…`, `00:00:…`, `12:34:56:…`.
 *
 * A real SHA-256 has ~30 distinct bytes out of 32; fewer than 20 happens with negligible
 * probability, while every hand-typed sample repeats a short cycle (the docs' own
 * `AA:BB:…:99` pattern has 16).
 */
export function isPlaceholderFingerprint(fp: string): boolean {
  return new Set(fp.split(':')).size < 20
}

export function androidFingerprints(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env[ANDROID_FINGERPRINTS_ENV] ?? '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => SHA256_RE.test(s) && !isPlaceholderFingerprint(s) && s !== LEGACY_TWA_FINGERPRINT)
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

/** Apple Developer Team ID the iOS app is signed with. */
export const APPLE_TEAM_ID = '6UAG75G2US'
/** Release bundle id — `PRODUCT_BUNDLE_IDENTIFIER` in `ios/Config/Release.xcconfig`. */
export const IOS_BUNDLE_ID = 'com.tappyai.ios'
/**
 * `<TEAMID>.<bundle id>`.
 *
 * 🚨 Until 2026-09-27 production served a static `public/.well-known/apple-app-site-association`
 * whose appID was the literal placeholder `APPLE_TEAM_ID.com.tappyai.ios`. The static file also
 * shadowed the route below, so no env var could have fixed it. That file is gone, and
 * `appLinks.test.ts` fails if one comes back.
 */
export const IOS_APP_ID = `${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`

/** One AASA `components` entry (iOS 13+ format). */
export interface AasaComponent {
  '/': string
  exclude?: true
  comment: string
}

/**
 * What iOS opens in the app instead of Safari.
 *
 * 🚨 ONLY PAGES THE APP RENDERS NATIVELY, the rule `docs/growth/APP_LINKS.md` §2 already set:
 * claiming a page with no native destination opens the app on a screen that is not the page.
 * Every entry here maps to a case in `ios/TappyAI/Core/Navigation/DeepLinkHandler.swift`
 * (`appLinks.test.ts` checks it against that file). Everything else — `/r/*`, the hubs, `/login`,
 * `/auth/*`, `/privacy`, `/chat`, `/profile/*` — stays in Safari.
 *
 * ORDER MATTERS: iOS takes the first entry that matches, so exclusions come first.
 */
export const IOS_UNIVERSAL_LINK_COMPONENTS: readonly AasaComponent[] = [
  // Web routes under /reviews that the app would otherwise read as a review id
  // (DeepLinkHandler turns `/reviews/{x}` into `.review(id: x)`).
  { '/': '/reviews/new', exclude: true, comment: 'web composer, not a review id' },
  { '/': '/reviews/creator/*', exclude: true, comment: 'web creator page, not a review id' },
  { '/': '/', comment: 'Home tab' },
  { '/': '/reviews', comment: 'Explore tab' },
  { '/': '/reviews/*', comment: 'a shared review' },
  { '/': '/deals', comment: 'Deals tab' },
  { '/': '/users/*', comment: 'a public profile' },
  { '/': '/group/*', comment: 'a group-dining room, or /group/new' },
]

/** apple-app-site-association (iOS 13+ `components` format). Pure. */
export function appleAppSiteAssociation(): Record<string, unknown> {
  return {
    applinks: {
      details: [{ appIDs: [IOS_APP_ID], components: IOS_UNIVERSAL_LINK_COMPONENTS.map(c => ({ ...c })) }],
    },
    // Matches the app's `webcredentials:www.tappyai.com` entitlement (password autofill).
    webcredentials: { apps: [IOS_APP_ID] },
  }
}
