// Vitest setup (app project): the simulated browser speaks Vietnamese.
//
// jsdom reports `navigator.languages = ['en-US', 'en']`. Public pages follow the browser's language
// (`appSurface.ts` → `useTranslation.appLocale`), so without this every component test that renders
// outside the (app) layout would silently switch to English. Vietnamese is the product's market and
// the default the existing suites were written against. A test that needs an English-speaking
// visitor overrides `navigator.languages` itself (see `src/lib/i18n/appSurface.test.ts`).
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'languages', { value: ['vi-VN', 'vi'], configurable: true })
  Object.defineProperty(navigator, 'language', { value: 'vi-VN', configurable: true })
}
