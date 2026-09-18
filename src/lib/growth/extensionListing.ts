// ─────────────────────────────────────────────────────────────────────────────
// Browser-extension distribution config — the ONE place that knows where the
// extension can be installed from.
//
// Store URLs are env-gated: until the owner publishes and pastes the listing
// URL, the landing page shows no install button (it never links to a store
// page that does not exist, and never claims the extension is "on the store").
// Everything else here is constant: the version, the welcome path the
// extension opens on install, and the attribution it carries.
// ─────────────────────────────────────────────────────────────────────────────

import { absoluteUrl } from '@/lib/share/openGraph'

export const EXTENSION_PATH = '/extension'
export const EXTENSION_WELCOME_PATH = '/extension/welcome'
export const EXTENSION_PRIVACY_PATH = '/extension/privacy'
/** Must equal `version` in extensions/browser/manifest.json (pinned by test). */
export const EXTENSION_VERSION = '0.1.0'
/** The extension privacy policy's revision date (YYYY-MM-DD). Bump when the manifest's data handling changes. */
export const EXTENSION_PRIVACY_UPDATED = '2026-09-18'

export type ExtensionStore = 'chrome' | 'edge' | 'firefox'

const STORE_HOSTS: Record<ExtensionStore, RegExp> = {
  chrome: /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com)\//,
  edge: /^https:\/\/microsoftedge\.microsoft\.com\//,
  firefox: /^https:\/\/addons\.mozilla\.org\//,
}
const ENV_KEYS: Record<ExtensionStore, string> = {
  chrome: 'NEXT_PUBLIC_EXTENSION_URL_CHROME',
  edge: 'NEXT_PUBLIC_EXTENSION_URL_EDGE',
  firefox: 'NEXT_PUBLIC_EXTENSION_URL_FIREFOX',
}

/** A store listing URL, only if configured AND on that store's real host. Pure. */
export function extensionStoreUrl(store: ExtensionStore, env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env[ENV_KEYS[store]] ?? '').trim()
  return STORE_HOSTS[store].test(raw) ? raw : null
}

/** Every configured store, in display order. Empty until the owner publishes. */
export function extensionStoreLinks(env: NodeJS.ProcessEnv = process.env): Array<{ store: ExtensionStore; url: string }> {
  return (['chrome', 'edge', 'firefox'] as const)
    .map((store) => ({ store, url: extensionStoreUrl(store, env) }))
    .filter((x): x is { store: ExtensionStore; url: string } => x.url !== null)
}

/** The page the extension opens once, right after install. Attributed. */
export function extensionWelcomeUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `${absoluteUrl(EXTENSION_WELCOME_PATH, env)}?src=browser_extension`
}

/** schema.org SoftwareApplication for the landing page — free, browser, from constants only. */
export function extensionJsonLd(input: { name: string; description: string }, env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  const links = extensionStoreLinks(env)
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: input.name,
    description: input.description,
    url: absoluteUrl(EXTENSION_PATH, env),
    applicationCategory: 'BrowserApplication',
    operatingSystem: 'Chrome, Microsoft Edge, Chromium',
    softwareVersion: EXTENSION_VERSION,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'VND' },
    publisher: { '@id': `${absoluteUrl('/', env)}#organization` },
    ...(links.length ? { installUrl: links.map((l) => l.url) } : {}),
  }
}
