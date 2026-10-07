// @vitest-environment node
// Phase 7 closeout 4D–4F — ONE canonical QR implementation; the code encodes the canonical public URL (never the browser's host);
// share/download failures are handled; the downloaded card carries a truthful Android + iOS section (no invented store URL).
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { absoluteUrl } from '@/lib/share/openGraph'

const view = readFileSync('src/app/(app)/profile/qr/QRProfileView.tsx', 'utf8')
const card = readFileSync('src/lib/qr/brandedCard.ts', 'utf8')
const profile = readFileSync('src/app/(app)/profile/ProfileView.tsx', 'utf8')
const share = readFileSync('src/components/share/ShareMenu.tsx', 'utf8')
const vi = readFileSync('src/lib/i18n/v3/web.ts', 'utf8')

describe('one canonical QR implementation', () => {
  it('the old modal renderer is gone; Profile V3 links to /profile/qr', () => {
    expect(existsSync('src/components/QRProfileButton.tsx')).toBe(false)
    expect(profile).not.toMatch(/QRProfileButton/)
    expect((profile.match(/href="\/profile\/qr"/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('the QR payload is the canonical public profile URL', () => {
  it('built with absoluteUrl, never window.location', () => {
    expect(view).toMatch(/const profileUrl = userId \? absoluteUrl\(`\/users\/\$\{userId\}`\) : ''/)
    expect(view).not.toMatch(/window\.location\.origin/)
  })
  it('absoluteUrl falls back to the production site, never localhost', () => {
    const u = absoluteUrl('/users/abc', {} as unknown as NodeJS.ProcessEnv)
    expect(u).toMatch(/^https:\/\/(www\.)?tappyai\.com\/users\/abc$/)
    expect(absoluteUrl('/users/abc', { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv)).toBe('https://www.tappyai.com/users/abc')
  })
})

describe('share and download never fail silently', () => {
  it('download: a null render or a throw sets the failed state', () => {
    expect(view).toMatch(/if \(!png\) \{ setFailed\(true\); return \}/)
    expect(view).toMatch(/\} catch \{\s*setFailed\(true\)\s*\} finally \{/)
  })
  it('share: handle() catches and reports', () => {
    expect(share).toMatch(/\} catch \{\s*\/\/ Phase 7: a failed publish[^\n]*\n\s*setFeedback\(\{ kind: 'error', text: t\('share\.copyFailed'\) \}\)/)
  })
})

describe('the downloaded card: Android + iOS section, truthful "coming soon" while no listing is public', () => {
  it('the card draws an apps column when no Google Play badge is enabled', () => {
    expect(card).toMatch(/const apps = website && !play \? opts\.apps : undefined/)
    expect(card).toMatch(/function drawAppsComingSoonColumn/)
  })
  it('the page passes the coming-soon copy; the copy names no store URL', () => {
    expect(view).toMatch(/apps: \{\s*title: t\('v3\.qr\.card\.appsTitle'\),\s*android: t\('v3\.qr\.card\.androidSoon'\),\s*ios: t\('v3\.qr\.card\.iosSoon'\)/)
    expect(vi).toContain("'v3.qr.card.androidSoon': 'Android · Sắp có trên Google Play'")
    expect(vi).toContain("'v3.qr.card.iosSoon': 'iOS · Sắp có trên App Store'")
    expect(vi).not.toMatch(/apps\.apple\.com|itunes\.apple\.com/)
  })
})
