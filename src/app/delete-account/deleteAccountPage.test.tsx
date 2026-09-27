// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/delete-account',
  useSearchParams: () => new URLSearchParams(),
}))

import DeleteAccountPage from './page'
import { deleteAccountDoc } from './deleteAccountDoc'
import { blockKeys } from '@/components/legal/legalDoc'
import { en as legalEn, vi as legalVi } from '@/lib/i18n/legal'
import { en as delEn, vi as delVi } from '@/lib/i18n/accountDelete'
import { CONFIRM_WORDS } from '@/lib/account/selfDelete'
import { SUPPORT_EMAIL } from '@/components/landing/config'
import { setLocale } from '@/lib/i18n/useTranslation'

// /delete-account is what the Play Console and App Store listings point reviewers at, and a
// reviewer follows its steps literally. It must describe exactly the routes that exist:
//   - the request route (Android and iOS: Settings → "Request account deletion" → email) always;
//   - the self-service route on the website only while ACCOUNT_SELF_DELETE_ENABLED is on — the
//     same switch the API (POST /api/account/delete) and /profile/settings/delete-account read.

const FLAG = 'ACCOUNT_SELF_DELETE_ENABLED'
let saved: string | undefined

beforeEach(() => {
  saved = process.env[FLAG]
  window.localStorage.clear()
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
})
afterEach(() => {
  cleanup()
  if (saved === undefined) delete process.env[FLAG]
  else process.env[FLAG] = saved
})

function renderPage(flag: 'true' | undefined, locale: 'en' | 'vi' = 'en') {
  if (flag) process.env[FLAG] = flag
  else delete process.env[FLAG]
  setLocale(locale)
  render(<DeleteAccountPage />)
  return document.body.textContent ?? ''
}

describe('/delete-account follows the self-delete switch', () => {
  it('switch OFF: only the request route — no self-service promise', () => {
    const text = renderPage(undefined)
    expect(text).toContain(legalEn['legal.delete.s1.step3'])
    expect(text).toContain('is not deleted automatically')
    expect(text).not.toContain(legalEn['legal.delete.self.heading'])
    expect(text).not.toContain('Permanently delete account')
  })

  it('switch ON: the self-service route first, then the request route', () => {
    const text = renderPage('true')
    const self = text.indexOf(legalEn['legal.delete.self.heading'])
    const request = text.indexOf(legalEn['legal.delete.request.heading'])
    expect(self).toBeGreaterThan(-1)
    expect(request).toBeGreaterThan(self)
    // The request route stays: Android and iOS still ship it.
    expect(text).toContain(legalEn['legal.delete.s1.step3'])
  })

  it('any value other than "true" is OFF, exactly as the API reads it', () => {
    process.env[FLAG] = 'TRUE'
    setLocale('en')
    render(<DeleteAccountPage />)
    expect(document.body.textContent).not.toContain(legalEn['legal.delete.self.heading'])
  })

  it('both layouts render in both languages with no raw key, and the support mailto', () => {
    for (const flag of [undefined, 'true'] as const) {
      for (const locale of ['en', 'vi'] as const) {
        cleanup()
        const text = renderPage(flag, locale)
        expect(text, `${flag} ${locale}`).not.toMatch(/legal\.delete\./)
        expect(document.querySelector(`a[href="mailto:${SUPPORT_EMAIL}"]`), `${flag} ${locale}`).toBeTruthy()
      }
    }
  })

  it('every key either layout uses exists in both dictionaries', () => {
    for (const selfDelete of [false, true]) {
      const doc = deleteAccountDoc(selfDelete)
      const keys = [doc.titleKey, doc.effectiveKey, ...doc.sections.flatMap((s) => [s.headingKey, ...s.blocks.flatMap(blockKeys)])]
      for (const k of keys) {
        expect(legalEn[k], `EN missing ${k}`).toBeTruthy()
        expect(legalVi[k], `VI missing ${k}`).toBeTruthy()
      }
    }
  })
})

describe('/delete-account names the controls the apps and the website really show', () => {
  it('request route: the label the parity test pins against Android and iOS', () => {
    // accountDeletionParity.test.ts compares Android/iOS with these literal sentences; this ties
    // those literals to the dictionary the page actually renders.
    expect(legalEn['legal.delete.s1.step3']).toBe('Choose Request account deletion.')
    expect(legalVi['legal.delete.s1.step3']).toBe('Chọn Yêu cầu xóa tài khoản.')
  })

  it('self-service route: the website labels, word for word', () => {
    expect(legalEn['legal.delete.self.step3']).toContain(delEn['settings.deleteAccountSelf'])
    expect(legalVi['legal.delete.self.step3']).toContain(delVi['settings.deleteAccountSelf'])
    expect(legalEn['legal.delete.self.step4']).toContain(delEn['accountDelete.submit'])
    expect(legalVi['legal.delete.self.step4']).toContain(delVi['accountDelete.submit'])
  })

  it('self-service route: the confirm word the page tells people to type is one the API accepts', () => {
    expect(legalEn['legal.delete.self.step4']).toContain(delEn['accountDelete.confirm.word'])
    expect(legalVi['legal.delete.self.step4']).toContain(delVi['accountDelete.confirm.word'])
    expect(CONFIRM_WORDS).toContain(delEn['accountDelete.confirm.word'])
    expect(CONFIRM_WORDS).toContain(delVi['accountDelete.confirm.word'])
  })

  it('self-service route: the timing promise is the in-app confirmation’s, not a new one', () => {
    expect(legalEn['legal.delete.self.p1']).toContain('within 48 hours')
    expect(delEn['accountDelete.done.p1']).toContain('within 48 hours')
  })
})
