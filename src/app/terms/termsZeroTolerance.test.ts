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
    expect(clauses[0]).toMatch(/not a finding that a rule was broken/)
    expect(clauses[0]).toMatch(/review every report within 24 hours/)
    expect(clauses[0]).toMatch(/target, not a guarantee/)
    expect(clauses[0]).not.toMatch(/72 hours|48 hours|artificial intelligence|AI/i)
  })
  it('Vietnamese says the same', () => {
    expect(clauses[1]).toMatch(/không khoan nhượng với nội dung phản cảm và người dùng có hành vi lạm dụng/)
    expect(clauses[1]).toMatch(/báo cáo/)
    expect(clauses[1]).toMatch(/chặn/)
    expect(clauses[1]).toMatch(/không phải kết luận/)
    expect(clauses[1]).toMatch(/mọi báo cáo trong vòng 24 giờ/)
    expect(clauses[1]).toMatch(/không phải cam kết tuyệt đối/)
    expect(clauses[1]).not.toMatch(/72 giờ|48 giờ|AI/)
  })
  it('the Terms effective date is the publication date (no invented past date)', () => {
    expect(legal).toContain("'legal.terms.effective': 'Effective Date: 10 October 2026'")
    expect(legal).toContain("'legal.terms.effective': 'Ngày hiệu lực: 10 tháng 10 năm 2026'")
  })
  it('the Terms page renders the clause', () => {
    expect(page).toContain("key: 'legal.terms.s4.p3'")
  })
})
