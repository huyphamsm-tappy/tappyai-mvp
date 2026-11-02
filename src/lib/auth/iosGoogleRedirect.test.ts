import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// TestFlight build 154 (09/10): Google sign-in on iOS ended on the website Home page instead of returning to the app. Cause: the iOS
// redirect (`tappyai://auth/callback`) was not in Supabase's Redirect URLs, so Supabase fell back to the Site URL. The allow-listed
// native entry is `tappyai://auth-callback`, which Android already uses. This pins the iOS value to the recorded list and to Android.

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const swift = read('ios/TappyAI/Features/Auth/Web/AuthCallbackState.swift')
const repo = read('ios/TappyAI/Features/Auth/AuthRepository.swift')
const allowDoc = read('docs/ios/SUPABASE-REDIRECT-ALLOWLIST.md')

function iosGoogleRedirect(): string {
  const needle = 'static let googleRedirect = URL(string: "'
  const at = swift.indexOf(needle)
  expect(at, 'AuthCallbackURL.googleRedirect must exist').toBeGreaterThan(-1)
  const start = at + needle.length
  return swift.slice(start, swift.indexOf('"', start))
}

describe('iOS Google OAuth redirect', () => {
  it('is the allow-listed native entry, with the hyphen', () => {
    expect(iosGoogleRedirect()).toBe('tappyai://auth-callback')
  })

  it('is listed in the recorded Supabase Redirect URLs', () => {
    expect(allowDoc).toContain('`' + iosGoogleRedirect() + '`')
  })

  it('never uses the slash form that is not allow-listed', () => {
    expect(allowDoc).not.toContain('`tappyai://auth/callback`   ←')
    expect(repo).not.toContain('URL(string: "tappyai://auth/callback")')
    expect(repo).toContain('googleRedirect = AuthCallbackURL.googleRedirect')
  })

  it('matches the host Android registers for the same redirect', () => {
    const manifest = 'android/app/src/main/AndroidManifest.xml'
    if (!existsSync(join(root, manifest))) return   // the Android tree is not part of every checkout
    const xml = read(manifest)
    const host = new URL(iosGoogleRedirect()).host
    expect(xml).toContain('android:host="' + host + '"')
  })
})
