// Final UAT 19/11 (insurance report): two source lines lost their " - site" part, so the reader's list parse skipped them (no [9], no [24] in the list), the same list was drawn a second time as plain
// text, and the marks [9] and [24] stood in the text pointing at nothing.
import { describe, it, expect } from 'vitest'
import { footnotesOf, withoutTrailingSources, isSourcesSection, linkCitations } from './presentation'

const text = [
  '## Body', '', 'A claim [1] and another [2][3].', '',
  '### Sources',
  '1. First page — a.vn, 02/06/2026',
  '2. Second page — b.vn',
  '3. gov.vn',
  '4. Fourth page — d.vn',
  '5. Fifth page — e.vn',
].join('\n')

describe('a sources list with a line that lost its site', () => {
  it('still gives every number its entry', () => {
    expect(footnotesOf(text).map(f => f.n)).toEqual([1, 2, 3, 4, 5])
    expect(footnotesOf(text).find(f => f.n === 3)?.title).toBe('gov.vn')
  })
  it('is recognised as the sources list, so the text copy is not drawn a second time', () => {
    expect(withoutTrailingSources(text)).not.toBeNull()
    expect(withoutTrailingSources(text)).not.toContain('Fifth page')
    expect(isSourcesSection(['### Sources', '1. a — x', '2. b', '3. c — y', '4. d — z', '5. e — w'].join('\n'))).toBe(true)
  })
  it('an ordinary numbered list with no source shape is not mistaken for sources', () => {
    expect(isSourcesSection(['### Steps', '1. Mix it', '2. Bake it', '3. Eat it'].join('\n'))).toBe(false)
    expect(withoutTrailingSources('## A\n\ntext\n\n### Steps\n1. Mix it\n2. Bake it\n')).toBeNull()
  })
  it('a mark of a number the list does not have is dropped once the list has arrived', () => {
    const known = new Map(footnotesOf(text).map(f => [f.n, f.title]))
    expect(linkCitations('claim [9]', 'm', known)).toBe('claim ')
  })
})
