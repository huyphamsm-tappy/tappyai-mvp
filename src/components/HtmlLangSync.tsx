'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { siteTitle, isSiteTitle } from '@/lib/share/openGraph'

/**
 * Keeps `<html lang>` AND `document.title` equal to the language the page is actually rendered in.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 * `layout.tsx` hardcoded `<html lang="vi">`. An English user got `lang="vi"` on every page for
 * the whole session, so a screen reader pronounced English text with Vietnamese phonetics, and
 * `:lang()` styling, hyphenation and translation prompts were all told the wrong thing
 * (V2-UAT-014).
 *
 * ============================================================================
 * WHY AN EFFECT, AND NOT A SERVER-RENDERED ATTRIBUTE
 * ============================================================================
 * This app has no server-side notion of the locale. It lives in `localStorage` under
 * `tappy_lang` and is read by a client module store (`useTranslation`), which is why
 * `getServerSnapshot()` returns `'vi'` — SSR must be deterministic, and a module-scope value on
 * the server is shared across concurrent requests, so seeding it per request would leak one
 * user's language into another's response.
 *
 * The consequence is that server-rendered markup IS Vietnamese, for everyone. `lang="vi"` is
 * therefore CORRECT for that markup, and reconciling the attribute at the same moment the text
 * reconciles is what keeps them honest about each other. Rendering `lang="en"` on the server
 * over Vietnamese text would not be an improvement — it would move the mismatch rather than
 * remove it.
 *
 * 🚨 So this deliberately does NOT read `cookies()` in the root layout. That would give the
 * server the locale, but at the cost of opting every route in the app out of static rendering to
 * fix an attribute — and it still would not fix the text, because the dictionary lookup is
 * client-side. The real fix for the first paint is a server-side i18n layer, which is a
 * different piece of work.
 *
 * No hydration mismatch is possible here: React renders `lang="vi"` on both sides, and this runs
 * afterwards as a DOM mutation. Assistive technology reads the live DOM, so it gets the right
 * answer; a crawler that runs no JavaScript sees `lang="vi"` over the Vietnamese markup it was
 * actually served, which is consistent rather than wrong.
 */
export default function HtmlLangSync() {
  const { locale } = useTranslation()
  const pathname = usePathname()

  useEffect(() => {
    document.documentElement.lang = locale

    // R03. `metadata` in the root layout is evaluated once, on the server, with a hardcoded 'vi',
    // so every response ships the Vietnamese <title>. The browser tab, the bookmark name, the
    // history entry and the label an OS task-switcher shows all stayed Vietnamese for a session
    // the user had explicitly switched to English. Same reasoning as the attribute above: the
    // locale is only knowable on the client, so the client is where the title is reconciled — at
    // the same moment the text it describes is.
    //
    // 🚨 Only a title this app produced for the SITE is replaced. Eleven routes set their own, and
    // /reviews/[id] sets the review's own subject — not ours to overwrite because the user changed
    // language. `isSiteTitle` is what keeps those two cases apart; without it this fix would trade
    // a stale-language tab for a destroyed one.
    if (isSiteTitle(document.title)) document.title = siteTitle(locale)
  }, [locale, pathname])
  // `pathname` is in the deps because a client-side navigation installs the new route's title
  // after this effect last ran. Returning from /privacy to a site-titled page would otherwise
  // reinstate the Vietnamese title and leave it there until the next language change.

  return null
}
