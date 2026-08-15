import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SUPPORT_EMAIL } from '@/components/landing/config'

// ── The published deletion route must exist in the app ───────────────────────
//
// /delete-account is public, indexable, and the URL the Play Console listing points reviewers
// at. It tells them, in EN and VI:
//
//   1. Open TappyAI.  2. Go to Settings.  3. Choose "Request account deletion".
//   4. Confirm — the app opens your email app with the request already prepared.
//
// Google Play compares that page against the shipped app, and a reviewer follows those steps
// literally. Android had no such entry: Settings offered Notifications, Memory, Tappy sound,
// Language, How to use, Terms, Privacy and Sign in, and the only mention of deletion anywhere in
// the app was a sentence inside the Privacy Policy screen ("contact TappyAI support by email")
// with no address and nothing to tap. Step 3 could not be completed.
//
// The page's own source comment already warned about this failure mode — "an earlier revision of
// this page claimed immediate in-app deletion, which did not match the app … this copy must be
// updated in lockstep with the Android flow". Nothing enforced it. This does.
//
// Static source comparison because there is no Kotlin test runner in the web CI job, and the
// drift being guarded is between a TypeScript dictionary and Android resources.

const read = (p: string) => readFileSync(p, 'utf8')
const STRINGS_EN = 'android/app/src/main/res/values/strings_settings.xml'
const STRINGS_VI = 'android/app/src/main/res/values-vi/strings_settings.xml'
const SETTINGS_SCREEN = 'android/app/src/main/java/com/tappyai/app/profile/SettingsScreen.kt'

/** Value of a <string name="…"> entry, with XML escapes unescaped. */
function androidString(xml: string, name: string): string | null {
  const m = new RegExp(`<string name="${name}"[^>]*>([\\s\\S]*?)</string>`).exec(xml)
  return m ? m[1].replace(/\\'/g, "'").replace(/&amp;/g, '&').trim() : null
}

/** "Choose Request account deletion." → "Request account deletion" */
const labelFromStep = (step: string, lead: string) =>
  step.replace(new RegExp(`^${lead}\\s*`), '').replace(/\.$/, '').trim()

describe('Android ships the deletion entry /delete-account promises', () => {
  const en = read(STRINGS_EN)
  const vi = read(STRINGS_VI)
  const screen = read(SETTINGS_SCREEN)

  it('Settings has a request-account-deletion row', () => {
    expect(screen).toContain('R.string.settings_delete_account')
  })

  it('its English label is exactly what the page tells reviewers to look for', () => {
    // legal.ts EN: 'Choose Request account deletion.'
    expect(androidString(en, 'settings_delete_account'))
      .toBe(labelFromStep('Choose Request account deletion.', 'Choose'))
  })

  it('its Vietnamese label matches the Vietnamese page', () => {
    // legal.ts VI: 'Chọn Yêu cầu xóa tài khoản.'
    expect(androidString(vi, 'settings_delete_account'))
      .toBe(labelFromStep('Chọn Yêu cầu xóa tài khoản.', 'Chọn'))
  })

  it('confirms before sending — step 4 says "Confirm"', () => {
    expect(androidString(en, 'settings_delete_account_confirm_title')).toBeTruthy()
    expect(screen).toContain('R.string.settings_delete_account_confirm_title')
  })

  it('opens a prepared email rather than deleting anything client-side', () => {
    expect(screen).toContain('ACTION_SENDTO')
    // No client-side deletion: the request is reviewed by support first.
    expect(screen).not.toMatch(/deleteUser|\.delete\(\)/)
  })

  it('addresses the request to the one published support address', () => {
    expect(screen + en).toContain(SUPPORT_EMAIL)
  })

  it('declares mailto package visibility, or resolveActivity always says "no email app"', () => {
    // Android 11+ hides other packages by default. Without this <queries> entry the intent
    // resolves to null even on a device with Gmail installed, and step 4 of the published
    // flow silently never happens.
    const manifest = read('android/app/src/main/AndroidManifest.xml')
    const queries = /<queries>([\s\S]*?)<\/queries>/.exec(manifest)?.[1] ?? ''
    expect(queries).toContain('android.intent.action.SENDTO')
    expect(queries).toContain('android:scheme="mailto"')
  })

  it('every deletion string is translated — MissingTranslation fails the Android build', () => {
    for (const key of [
      'settings_delete_account',
      'settings_delete_account_confirm_title',
      'settings_delete_account_confirm_body',
      'settings_delete_account_confirm_cta',
      'settings_delete_account_email_subject',
      'settings_delete_account_email_body',
      'settings_delete_account_no_email',
    ]) {
      expect(androidString(en, key), `EN ${key}`).toBeTruthy()
      expect(androidString(vi, key), `VI ${key}`).toBeTruthy()
    }
  })
})
