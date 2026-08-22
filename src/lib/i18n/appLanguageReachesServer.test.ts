import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── V2-UAT-015, resolved: the app language, not the browser's ────────────────
//
// 015 was filed as "the server falls back to Accept-Language when ?lang= is absent — by design,
// recorded for consistency". The fallback IS by design. What was not by design is that no client
// sent `?lang=` on the endpoints that carry the SAFETY NOTICE, so the fallback was not a fallback
// — it was the only path, and it reads the wrong thing.
//
//   POST /api/reviews        → tells an author their post was held, in the request language
//   GET  /api/reviews/feed   → same notice, on the author's own profile
//
// Accept-Language is the BROWSER's locale on web and, on Android, nothing at all (OkHttp sends no
// such header), so both fell through to the Vietnamese default. An English user who had a post
// held was told so in Vietnamese — on Android, always; on web, whenever the browser was
// Vietnamese. That directly contradicts the release requirement that EN and VI warning content
// both be correct, so 015 belongs in the locale workstream rather than being marked accepted.
//
// The Android half is an interceptor (`AppLanguageInterceptor`) with its own behavioural test,
// because there `Accept-Language` can be set and setting it once fixes every endpoint at once.
// The web half has to be `?lang=`: `Accept-Language` is a forbidden header name, so a browser
// will not let fetch() override it. Hence a per-call-site guard, here.

const read = (path: string) => readFileSync(path, 'utf8')

/** Call sites that receive the author-facing moderation notice and must ask for a language. */
const OWN_CONTENT_CALLERS = [
  {
    file: 'src/app/reviews/new/page.tsx',
    what: 'the composer POSTs a review and renders the held-post notice from the response',
  },
  {
    file: 'src/app/profile/bookings/BookingReviewButton.tsx',
    what: 'the booking flow POSTs a review through the same endpoint',
  },
  {
    file: 'src/app/profile/posts/page.tsx',
    what: "the author's own posts page renders the notice per held post",
  },
  {
    file: 'src/app/reviews/ProfileTab.tsx',
    what: 'the profile tab does the same when the viewer is the author',
  },
]

describe('every client that can receive a safety notice asks for a language', () => {
  for (const { file, what } of OWN_CONTENT_CALLERS) {
    it(`${file} — ${what}`, () => {
      const source = read(file)
      // The locale has to come from the app's own store, not from a literal or the browser.
      expect(source).toContain("from '@/lib/i18n/useTranslation'")
      expect(source).toMatch(/lang=\$\{encodeURIComponent\(locale\)\}/)
    })
  }

  it('a language switch re-fetches, so the notice does not keep its first wording', () => {
    // Without `locale` in the dependency array the page would fetch once in Vietnamese and then
    // sit there in Vietnamese while every other string on the page turned English.
    for (const file of ['src/app/profile/posts/page.tsx', 'src/app/reviews/ProfileTab.tsx']) {
      const source = read(file)
      expect(source).toMatch(/\}, \[[^\]]*locale[^\]]*\]\)/)
    }
  })
})

describe('the Android client sends the app language on every request', () => {
  // Source-level, because CI does not run Gradle. The behaviour itself is covered by
  // android/app/src/test/.../AppLanguageInterceptorTest.kt, which drives a real OkHttp chain.
  const INTERCEPTOR =
    'android/core/network/src/main/java/com/tappyai/core/network/AppLanguageInterceptor.kt'
  const NETWORK_MODULE =
    'android/core/network/src/main/java/com/tappyai/core/network/NetworkModule.kt'
  const APP_MODULE = 'android/app/src/main/java/com/tappyai/app/di/AppModule.kt'
  const RESOLVER = 'android/app/src/main/java/com/tappyai/app/language/AppLanguageResolver.kt'

  it('the interceptor exists and sets Accept-Language', () => {
    const source = read(INTERCEPTOR)
    expect(source).toContain('Accept-Language')
    // Host-scoped, same rule AuthInterceptor follows — a shared OkHttp client must not hand a
    // user attribute to a third-party host.
    expect(source).toContain('isOwnApiHost')
  })

  it('the interceptor is actually installed on the shared client', () => {
    // An interceptor that exists but is never added is the quietest possible regression: every
    // source assertion above still passes and no request carries the header.
    expect(read(NETWORK_MODULE)).toContain('.addInterceptor(appLanguageInterceptor)')
  })

  it('the language is read per request, not captured once', () => {
    // A captured value would put the language back on process lifetime: changing it in Settings
    // would not reach the server until the next cold start.
    expect(read(APP_MODULE)).toContain('AppLanguageProvider { AppLanguageResolver.currentTag() }')
  })

  it('the resolver reads the app locale first and the device locale only as its meaning', () => {
    const source = read(RESOLVER)
    expect(source).toContain('AppCompatDelegate.getApplicationLocales')
    // Locale.getDefault() appears exactly once, in the branch where AppCompat itself is following
    // the system locale — never as an unconditional source.
    expect(source.match(/Locale\.getDefault\(\)/g)?.length).toBe(1)
  })
})

describe('the html lang attribute follows the rendered language', () => {
  it('a client component syncs it to the active locale', () => {
    const source = read('src/components/HtmlLangSync.tsx')
    expect(source).toContain('document.documentElement.lang = locale')

    // The property is that the effect RE-RUNS when the locale changes — an empty dependency array
    // would freeze the attribute at first render, which is the bug this guards. Extra dependencies
    // are legitimate, and there is one now: R03 added `pathname` so the title half re-runs after a
    // client-side navigation installs a new route's title. Pinning the literal text `[locale])`
    // would have made that correct addition look like a regression.
    const deps = source.match(/\},\s*\[([^\]]*)\]\)/)?.[1]
    expect(deps, 'no useEffect dependency array found').toBeDefined()
    expect(deps!.split(',').map(s => s.trim())).toContain('locale')
  })

  it('the document title follows it too', () => {
    // R03. `lang` and `title` describe the same thing to two different audiences — assistive
    // technology and the person looking at their tab strip. Fixing one and leaving the other
    // relocates the defect rather than removing it. Behaviour is proven in
    // src/components/htmlLangSync.test.tsx; this pins that the two stay in one place.
    const source = read('src/components/HtmlLangSync.tsx')
    expect(source).toContain('document.title = siteTitle(locale)')
    expect(source).toContain("from '@/lib/share/openGraph'")
  })

  it('the layout mounts it', () => {
    const layout = read('src/app/layout.tsx')
    expect(layout).toContain('<HtmlLangSync />')
    expect(layout).toContain("import HtmlLangSync from '@/components/HtmlLangSync'")
  })

  it('the SSR value is still the language SSR actually renders in', () => {
    // These two have to agree. `getServerSnapshot` returning 'vi' is what makes `lang="vi"` in
    // the layout honest rather than a leftover; if someone changes one, this fails until they
    // change the other.
    expect(read('src/app/layout.tsx')).toContain('<html lang="vi"')
    expect(read('src/lib/i18n/useTranslation.ts')).toMatch(
      /function getServerSnapshot\(\): Locale \{\s*return 'vi'/,
    )
  })
})
