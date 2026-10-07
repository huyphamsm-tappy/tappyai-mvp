import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * P4-09 — accessibility audit of the V3 surfaces, not only the new components.
 *
 * The brief was explicit that auditing the shiny new components proves little: the risk lives in
 * the surfaces V3 TOUCHED. So these assertions read the actual sources and check the rules that
 * have a history of being broken in this codebase — BUG-009 shipped a 5×16px like control, and
 * `prefers-reduced-motion` covered the mascot but not the two infinite loops in the chat.
 *
 * A source-level audit cannot replace a screen reader or a contrast meter, and it is not claimed
 * to. What it can do is fail when a rule is dropped, which a manual pass performed once cannot.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

const V3_COMPONENTS = [
  'src/components/chat/structured/ComparisonBlock.tsx',
  'src/components/chat/structured/ConfirmationPrompt.tsx',
  'src/components/chat/structured/EntityCard.tsx',
  'src/components/chat/AskTappyButton.tsx',
]

describe('touch targets — every V3 control is thumb-reachable', () => {
  // BUG-009 shipped a 5×16px like button. The rule is 44×44 (design system §10.1), and the visual
  // size may be smaller only if the HIT AREA is not.
  it.each(V3_COMPONENTS)('%s sizes its interactive elements', (path) => {
    const src = read(path)
    const interactive = (src.match(/<button|<a\s/g) ?? []).length
    if (interactive === 0) return
    expect(src, `${path}: interactive elements must declare a 44px minimum`).toContain('min-h-[44px]')
  })
})

describe('reduced motion — the chat stops moving, without going silent', () => {
  const css = read('src/app/globals.css')

  it('disables the two infinite loops a user actually sits and watches', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block).toContain('.typing-dot')
    expect(block).toContain('.streaming-cursor::after')
  })

  it('keeps the thinking indicator visible rather than removing it', () => {
    // Stopping the motion must not remove the signal — a user who cannot see the dots move still
    // needs to know Tappy is working.
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    const typingRule = block.slice(block.indexOf('.typing-dot'), block.indexOf('.typing-dot') + 120)
    expect(typingRule).toContain('opacity: 1')
    expect(typingRule).not.toContain('display: none')
  })

  it('covers Tailwind animation utilities by default', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block, 'a future animate-* call site should be covered without remembering this file')
      .toContain('[class*="animate-"]')
  })
})

describe('colour is never the only carrier of meaning', () => {
  it('the match verdict always renders its label as text', () => {
    const src = read('src/components/chat/structured/MatchBadge.tsx')
    expect(src).toContain('t(MATCH_KEY[m])')
  })

  it('the comparison recommendation is marked with a glyph and a word, not just a tint', () => {
    const src = read('src/components/chat/structured/ComparisonBlock.tsx')
    expect(src).toContain("✓ {t('comparison.recommended')}")
  })
})

describe('the confirmation prompt is announced and operable', () => {
  const src = read('src/components/chat/structured/ConfirmationPrompt.tsx')

  it('is a labelled dialog', () => {
    expect(src).toContain('role="dialog"')
    expect(src).toContain('aria-modal="true"')
    expect(src).toContain('aria-label={consequence}')
  })

  it('moves focus to the safe control on open', () => {
    expect(src).toContain('cancelRef.current?.focus()')
  })

  it('closes on Escape', () => {
    expect(src).toContain("e.key === 'Escape'")
  })

  it('announces its outcome to assistive technology', () => {
    expect(src).toContain('role="status"')
    expect(src).toContain('aria-live="polite"')
    expect(src).toContain('role="alert"') // the failure, which the user must not miss
  })

  it('marks the in-flight state as busy rather than only greying out', () => {
    expect(src).toContain('aria-busy={working}')
  })
})

describe('the comparison is a real table, not a grid of divs', () => {
  const src = read('src/components/chat/structured/ComparisonBlock.tsx')

  it('associates headers with their cells', () => {
    expect(src).toContain('scope="col"')
    expect(src).toContain('scope="row"')
  })

  it('names the region and captions the table for a screen reader', () => {
    expect(src).toContain('aria-label={t(\'comparison.title\'')
    expect(src).toContain('<caption className="sr-only">')
  })

  it('keeps wide content inside its own scroller so the page never scrolls sideways', () => {
    expect(src).toContain('overflow-x-auto')
  })
})

describe('icon-only affordances carry an accessible name', () => {
  it('the Ask Tappy bridge labels itself and hides its decorative icon', () => {
    const src = read('src/components/chat/AskTappyButton.tsx')
    expect(src).toContain('aria-label={label}')
    expect(src).toContain('aria-hidden="true"')
  })
})

describe('streaming is announced politely, never assertively', () => {
  it('the chat status regions use polite live regions', () => {
    const src = read('src/components/ChatInterface.tsx')
    expect(src).toContain('aria-live="polite"')
    // An assertive region on a token stream interrupts the user on every frame.
    expect(src).not.toContain('aria-live="assertive"')
  })
})
