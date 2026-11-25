// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 19/11 (layout S5c): source-level contract, like chatStructuredWiring.test.tsx. A turn that shows venue or product cards keeps the model's declared comparison table.
 * It was hidden for every such turn (commit 0e5e19e), so the text said "the price in the table" over a page with no table (the iPhone 16 vs Galaxy S25 question: no table in 3 of 5 runs of the blind eval).
 * The declared table is hidden in exactly one case: the page already draws a comparison from the tool's own data (cmpNode), so there is one table, never two.
 */
const SOURCE = readFileSync(resolve(process.cwd(), 'src/components/ChatInterface.tsx'), 'utf8')

describe('the declared comparison table on a turn with cards', () => {
  it('is hidden only when the page already draws a comparison from the tool data', () => {
    expect(SOURCE).toContain("const compareBlocks = ownLayout && cmpNode ? [] : declaredBlocks.filter(b => b.type === 'compare')")
  })
  it('is no longer hidden for every turn that has cards', () => {
    expect(SOURCE).not.toContain("const compareBlocks = ownLayout ? [] :")
  })
  it('the model subject cards (avatar cards) stay hidden beside venue and product cards, as decided on 18/11', () => {
    expect(SOURCE).toContain('const profileBlocks = ownLayout ? [] : declaredBlocks')
  })
  it('cmpNode is declared before compareBlocks reads it', () => {
    expect(SOURCE.indexOf('const cmpNode =')).toBeGreaterThan(-1)
    expect(SOURCE.indexOf('const cmpNode =')).toBeLessThan(SOURCE.indexOf('const compareBlocks ='))
  })
})
