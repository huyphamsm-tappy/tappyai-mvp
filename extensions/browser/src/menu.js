// Context-menu ids and the pure "click → destination" decision. Separate
// from background.js so the decision can be unit-tested without a Chrome
// runtime (the web repo's suite imports this file).
import { askUrl as defaultAskUrl, askAboutPageUrl as defaultAskAboutPageUrl, scamCheckUrl as defaultScamCheckUrl } from './links.js'

export const MENU = Object.freeze({
  askSelection: 'tappy-ask-selection',
  askPage: 'tappy-ask-page',
  checkLink: 'tappy-check-link',
  checkPage: 'tappy-check-page',
})

/**
 * The URL a menu click opens, from the click info Chrome supplies and nothing
 * else. Returns null when there is nothing forwardable (no selection, a
 * chrome:// page, an unknown menu id).
 */
export function destinationFor(menuItemId, info, tab, settings, links = {}) {
  const askUrl = links.askUrl ?? defaultAskUrl
  const askAboutPageUrl = links.askAboutPageUrl ?? defaultAskAboutPageUrl
  const scamCheckUrl = links.scamCheckUrl ?? defaultScamCheckUrl
  const opts = { origin: settings?.origin, lang: settings?.lang }
  switch (menuItemId) {
    case MENU.askSelection: return askUrl(info?.selectionText, opts)
    case MENU.askPage: return askAboutPageUrl({ url: info?.pageUrl ?? tab?.url, title: tab?.title }, opts)
    case MENU.checkLink: return scamCheckUrl(info?.linkUrl, opts)
    case MENU.checkPage: return scamCheckUrl(info?.pageUrl ?? tab?.url, opts)
    default: return null
  }
}
