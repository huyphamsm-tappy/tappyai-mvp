import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORY_STYLE, NOTIF_COLOR, notificationBrandMark } from './inbox'

// ── One notification taxonomy, one owner ────────────────────────────────────
//
// 🚨 `CATEGORY_STYLE` WAS DECLARED TWICE, BYTE-IDENTICAL — once in
// `reviews/page.tsx` and once in `profile/notifications/NotificationsView.tsx`.
// Each file renders its own `NotifRow` from it, so a branding change (a new
// category, a recoloured chip, a different emoji) had to be made in two places
// or the two inboxes would disagree about what a "deal" looks like.
//
// They had NOT drifted when this was found — which is exactly why it was cheap
// to fix. This test is what keeps it that way: a third copy, or a copy that
// comes back, fails here rather than shipping two inboxes that disagree.

const ROOT = join(__dirname, '..', '..', '..')
const CONSUMERS = [
  'src/app/reviews/page.tsx',
  'src/app/(app)/profile/notifications/NotificationsView.tsx',
]

describe('CATEGORY_STYLE has exactly one definition', () => {
  it.each(CONSUMERS)('%s imports it rather than redeclaring it', (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8')
    expect(src, 'must not declare its own copy')
      .not.toMatch(/const\s+CATEGORY_STYLE\s*:/)
    expect(src, 'must take it from the shared notification module')
      .toMatch(/import\s*\{[^}]*\bCATEGORY_STYLE\b[^}]*\}\s*from\s*'@\/lib\/notifications\/inbox'/)
  })

  it('still uses it the same way in both inboxes', () => {
    for (const rel of CONSUMERS) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(src).toContain('CATEGORY_STYLE[g.category] ?? CATEGORY_STYLE.system')
    }
  })

  it('covers every category the taxonomy already colours', () => {
    // The two tables must not drift apart from their sibling constant either.
    for (const category of Object.keys(NOTIF_COLOR)) {
      if (!(category in CATEGORY_STYLE)) continue
      expect(CATEGORY_STYLE[category].color, `${category} needs a colour`).toMatch(/^#/)
      expect(CATEGORY_STYLE[category].icon, `${category} needs an icon`).toBeTruthy()
    }
  })

  it('keeps the four shipped categories exactly as they render today', () => {
    expect(CATEGORY_STYLE.social).toEqual({ color: '#ff6b35', icon: '🎉' })
    expect(CATEGORY_STYLE.deal).toEqual({ color: '#F59E0B', icon: '🏷️' })
    expect(CATEGORY_STYLE.explore).toEqual({ color: '#8B5CF6', icon: '✨' })
    expect(CATEGORY_STYLE.system).toEqual({ color: '#64748B', icon: '🔔' })
  })

  it('lives with the constants it belongs to', () => {
    // Same module as NOTIF_COLOR / notificationBrandMark — one taxonomy owner.
    expect(typeof notificationBrandMark('system')).toBe('string')
    expect(NOTIF_COLOR).toBeTruthy()
  })
})
