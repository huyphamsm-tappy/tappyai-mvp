import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// App Review 1.2 (build 144 rejection): the Terms the person agrees to before registering must say, in terms, that objectionable
// content and abusive users are not tolerated, and that content can be reported and users blocked. The page must render that clause.

const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8')
const legal = read('src/lib/i18n/legal.ts')
const page = read('src/app/terms/page.tsx')

/** Every value of the key, in file order (the English table comes first, the Vietnamese one second). */
function valuesOf(key: string): string[] {
  const out: string[] = []
  const needle = `'${key}':`
  let from = 0
  for (;;) {
    const at = legal.indexOf(needle, from)
    if (at < 0) return out
    const end = legal.indexOf("\n  '", at + needle.length)
    out.push(legal.slice(at + needle.length, end < 0 ? undefined : end))
    from = at + needle.length
  }
}

describe('Terms §4 — zero tolerance for objectionable content and abusive users', () => {
  const clauses = valuesOf('legal.terms.s4.p3')
  it('exists in both languages', () => {
    expect(clauses).toHaveLength(2)
  })
  it('English says zero tolerance, names objectionable content and abusive users, report, block and the 24 h target', () => {
    expect(clauses[0]).toMatch(/zero tolerance for objectionable content and abusive users/)
    expect(clauses[0]).toMatch(/report any post, comment or user, and block any user/)
    expect(clauses[0]).toMatch(/24 hours/)
  })
  it('Vietnamese says the same', () => {
    expect(clauses[1]).toMatch(/không khoan nhượng với nội dung phản cảm và người dùng có hành vi lạm dụng/)
    expect(clauses[1]).toMatch(/báo cáo/)
    expect(clauses[1]).toMatch(/chặn/)
    expect(clauses[1]).toMatch(/24 giờ/)
  })
  it('the Terms page renders the clause', () => {
    expect(page).toContain("key: 'legal.terms.s4.p3'")
  })
})
