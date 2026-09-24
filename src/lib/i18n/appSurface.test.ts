// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { APP_SURFACE_ATTR } from './appSurface'

// Public pages speak the visitor's language silently; the app keeps the product default until the
// first-visit picker records a choice. The side is read from the DOM marker the (app) layout
// renders — never from the pathname.

function speak(...langs: string[]) {
  Object.defineProperty(navigator, 'languages', { value: langs, configurable: true })
  Object.defineProperty(navigator, 'language', { value: langs[0], configurable: true })
}

async function freshLocale() {
  vi.resetModules()
  const { appLocale } = await import('./useTranslation')
  return appLocale()
}

describe('the default language on each side of the public / app boundary', () => {
  beforeEach(() => { window.localStorage.clear(); document.body.innerHTML = '' })
  afterEach(() => speak('vi-VN', 'vi'))

  it('a public page follows an English-speaking browser — no modal, no question', async () => {
    speak('en-US', 'en')
    expect(await freshLocale()).toBe('en')
  })

  it('a public page follows a Vietnamese-speaking browser', async () => {
    speak('vi-VN', 'vi', 'en')
    expect(await freshLocale()).toBe('vi')
  })

  it('inside the app the product default holds until the picker is answered', async () => {
    speak('en-US', 'en')
    document.body.innerHTML = `<span hidden ${APP_SURFACE_ATTR}></span>`
    expect(await freshLocale()).toBe('vi')
  })

  it('an explicit choice beats the browser everywhere', async () => {
    speak('en-US', 'en')
    window.localStorage.setItem('tappy_lang', 'vi')
    expect(await freshLocale()).toBe('vi')
  })
})
