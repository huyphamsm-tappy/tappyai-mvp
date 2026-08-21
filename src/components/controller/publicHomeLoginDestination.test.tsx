// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ControllerPublicHome } from './ControllerPublicHome'
import { isControllerLoginEntry } from '@/lib/auth/controllerLoginEntry'
import { loginPathFor } from '@/lib/auth/returnTo'
import { setLocale } from '@/lib/i18n/useTranslation'

// 🔑 AN INTEGRATION DEFECT NEITHER FEATURE'S OWN TESTS COULD SEE.
//
// The Public Home (PR #143) was written before the Controller sign-in card
// existed, so its button linked to a bare `/login`. The card is chosen by
// `returnTo` (PR #144). Both PRs were green and both were internally correct:
// #143 asserted the link went to `/login`, #144 asserted that `returnTo`
// selects the Controller card. The COMBINATION was wrong, and only appeared
// once both were on main — clicking "Đăng nhập" on the Controller's own front
// door landed on the CONSUMER card, offering Google and Zalo to somebody who
// came to sign in to the Controller.
//
// Found by production browser E2E on `9f246dd`, not by any unit test. This file
// exists so the two halves can never drift apart again: it asserts the link the
// Home renders is a destination the login page actually classifies as
// Controller entry — the two modules checked against each other, not against a
// hardcoded string each.

afterEach(cleanup)

const home = (locale: 'vi' | 'en' = 'vi') => {
  setLocale(locale)
  window.localStorage.clear()
  return render(<ControllerPublicHome />)
}

const signInLinks = () =>
  screen.getAllByRole('link', { name: /Đăng nhập|Sign in/i }).map((a) => a.getAttribute('href') ?? '')

describe('the Controller front door leads to the CONTROLLER sign-in', () => {
  it('every sign-in link carries a destination', () => {
    home()
    for (const href of signInLinks()) {
      expect(href, 'a bare /login gets the consumer card').not.toBe('/login')
    }
  })

  it('🔑 and that destination is one the login page treats as Controller entry', () => {
    // The real invariant. Asserting a literal string here would pass while the
    // login page's rule changed underneath it; this asks the login page.
    home()
    for (const href of signInLinks()) {
      const search = href.includes('?') ? href.slice(href.indexOf('?')) : ''
      expect(isControllerLoginEntry(search), `${href} must select the Controller card`).toBe(true)
    }
  })

  it('it uses the shared destination contract rather than a hand-built query', () => {
    // `loginPathFor` is what the Controller's own guards emit. Building the URL
    // by hand is how the two spellings drift.
    home()
    for (const href of signInLinks()) {
      expect(href).toBe(loginPathFor('/admin'))
    }
  })

  it.each(['vi', 'en'] as const)('[%s] both sign-in links agree on the destination', (locale) => {
    home(locale)
    const hrefs = new Set(signInLinks())
    expect(hrefs.size).toBe(1)
  })

  it('the "learn more" anchor is untouched — it is not a sign-in', () => {
    home()
    const learn = screen.getByRole('link', { name: /Tìm hiểu thêm|Learn more/i })
    expect(learn.getAttribute('href')).toBe('#controller-public-home-features')
  })
})
