// The only thing the extension stores: the person's language for the
// question text ('vi' | 'en'). Kept in chrome.storage.sync so it follows the
// Chrome profile. No history, no URLs, no identifiers are ever written here.
//
// 'origin' is a developer override for pointing the extension at a local or
// staging build; it is never set by the popup and defaults to production.
import { DEFAULT_ORIGIN } from './links.js'

export const SETTINGS_KEY = 'tappy_settings'
export const LANGS = ['vi', 'en']

/** Coerce whatever is in storage to a valid settings object. Pure; exported for tests. */
export function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return {
    lang: LANGS.includes(r.lang) ? r.lang : 'vi',
    origin: typeof r.origin === 'string' && /^https:[/][/]/.test(r.origin) ? r.origin.replace(/[/]+$/, '') : DEFAULT_ORIGIN,
  }
}

export async function readSettings() {
  try {
    const got = await chrome.storage.sync.get(SETTINGS_KEY)
    return normalizeSettings(got?.[SETTINGS_KEY])
  } catch {
    return normalizeSettings(null)
  }
}

export async function writeLang(lang) {
  if (!LANGS.includes(lang)) return
  const current = await readSettings()
  await chrome.storage.sync.set({ [SETTINGS_KEY]: { ...current, lang } })
}
