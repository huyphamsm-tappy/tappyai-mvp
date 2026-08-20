import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { translate } from './useTranslation'

// ── V2-UAT-009 — "Mua sắm · via Shopee" on the Vietnamese page ──────────────
//
// The fix shipped on the release branch as a one-line dictionary change and arrived here with no
// test, which is how a one-line fix becomes a one-line regression. Guarded now.
//
// The word matters more than it looks. "via" is a preposition an English reader parses and a
// Vietnamese reader does not; on a page whose every other word was Vietnamese it was the one
// token that gave away that the page had been translated rather than written. Android already
// said "qua", so the two clients disagreed about the same row of the same table.

describe('the deals attribution line is written in the reader\'s language', () => {
  it('Vietnamese says "qua", not "via"', () => {
    const line = translate('vi', 'deals.viaSource', { source: 'Shopee' })
    expect(line).toBe('qua Shopee')
    expect(line).not.toContain('via')
  })

  it('English says "via"', () => {
    expect(translate('en', 'deals.viaSource', { source: 'Shopee' })).toBe('via Shopee')
  })

  it('the two languages are not the same string', () => {
    // The shape of the original defect: one dictionary entry copied into both languages.
    expect(translate('vi', 'deals.viaSource', { source: 'X' }))
      .not.toBe(translate('en', 'deals.viaSource', { source: 'X' }))
  })

  it('the web and Android use the same Vietnamese word', () => {
    // The clients disagreed for months because nothing compared them. `· qua` is what Android's
    // deals row renders; if either side changes, this fails rather than the two drifting again.
    const android = readFileSync('android/app/src/main/res/values-vi/strings_deals.xml', 'utf8')
    const viaWord = translate('vi', 'deals.viaSource', { source: '' }).trim()
    expect(viaWord).toBe('qua')
    expect(android).toContain('qua')
  })

  it('the page actually uses the key rather than an inline string', () => {
    const view = readFileSync('src/app/deals/DealsView.tsx', 'utf8')
    expect(view).toContain("t('deals.viaSource'")
    // No stray literal preposition left behind next to the partner name.
    expect(view).not.toMatch(/>\s*via\s*\{/)
  })
})
