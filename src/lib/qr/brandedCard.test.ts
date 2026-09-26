// The downloadable QR card — what may and may not be drawn on it.
//
// Phase 7 RC §8. This file is a printed artefact: people hand it out, pin it up and photograph it,
// so everything on it has to be real and the code has to scan. Three rules, pinned here because
// each one is a thing a later "let's make it look like the mockup" pass would quietly break.
//
//  1. NOTHING IS DRAWN INSIDE THE CODE. The reference sheet shows a version with the app mark in
//     the middle of the matrix; a centre logo spends error-correction budget and costs contrast,
//     and this code exists to be read by a stranger's phone camera. Branding goes around it.
//  2. NO STORE URLS. The reference also shows App Store and Google Play badges. Measured across
//     `src/`, `public/` and `docs/`, this repository holds no canonical listing URL for either
//     platform, and composing one from the Android `applicationId` would be an invented link on a
//     printed card. Until a real listing exists, the badges stay off.
//  3. THE WEBSITE IS CONFIGURATION, NOT A LITERAL. It comes from `NEXT_PUBLIC_SITE_URL`, so a
//     deployment that moves does not ship cards pointing at the old host.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const CARD = 'src/lib/qr/brandedCard.ts'
const VIEW = 'src/app/(app)/profile/qr/QRProfileView.tsx'

describe('the QR itself carries no artwork', () => {
  it('the card draws the matrix and nothing else in that rectangle', () => {
    const src = read(CARD)
    // The one loop that paints the code, followed by nothing that targets the same area.
    expect(src).toContain('if (matrix[r][c]) ctx.fillRect(')
    // A centre overlay needs an image or a fill positioned from the code's midpoint; neither the
    // card nor the on-screen view computes one.
    expect(src).not.toMatch(/qrX \+ qrSide \/ 2/)
    expect(src).not.toMatch(/drawImage\([^)]*qrX/)
  })

  it('the on-screen code says plainly that nothing sits in the middle', () => {
    expect(read(VIEW)).toContain('No logo in the middle')
  })
})

describe('the card links only where the project actually points', () => {
  const stores = /apps\.apple\.com|itunes\.apple\.com|play\.google\.com|market:\/\//i

  it.each([CARD, VIEW])('%s names no app-store URL', (rel) => {
    expect(read(rel)).not.toMatch(stores)
  })

  it('the website comes from the configured site origin, not a hardcoded host', () => {
    const view = read(VIEW)
    expect(view).toContain("new URL(absoluteUrl('/')).host")
    // The literal would survive a domain change; the helper would not.
    expect(view).not.toMatch(/['"`]www\.[a-z0-9-]+\.[a-z]{2,}['"`]/i)
  })

  it('the tagline is the shipped dictionary string, not a second copy of the words', () => {
    expect(read(VIEW)).toContain("tagline: t('v3.page.subtitle')")
    expect(read('src/lib/i18n/v3/web.ts')).toContain("'v3.page.subtitle': 'One Agent. One Conversation. Everyday Life.'")
  })
})

describe('the payload is the profile URL and nothing else', () => {
  it('is encoded from `text`, which the page sets to the profile URL', () => {
    expect(read(CARD)).toContain('const matrix = encodeQR(opts.text)')
    const view = read(VIEW)
    expect(view).toMatch(/text: profileUrl/)
    // The same string the page shows and the share sheet copies — one payload, three surfaces.
    expect(view).toMatch(/profileUrl/)
  })
})
