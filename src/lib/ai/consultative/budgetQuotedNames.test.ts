import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractBudget } from '../budget'
import { budgetFromHistory } from './shoppingConstraints'
import { withoutQuotedNames } from './consultRouter'

// Luna 30/09 (level B, present since Phase 7): the budget was read from the RAW history, so the product name the user
// copied back in "A hay B?" — "… Core i5-1334U …" — became a 5.000đ–1.334.000đ budget and filtered the laptops.
// Texts verbatim from replay SHOP-3 (29/09 17:13Z).
const msgs = [
  { role: 'user', content: 'laptop cho sinh viên' },
  { role: 'user', content: 'học thiết kế, dưới 20 triệu, mới' },
  { role: 'assistant', content: 'Mình hiểu bạn cần laptop mới để học thiết kế. **Mình chọn: Laptop Aspire Lite 14**, đánh giá 5 sao và nằm trong ngân sách.\n\n- **Laptop Dell 15 DC15250 Core i5-1334U**, nhưng có 53 đánh giá (nhiều hơn) nên tin cậy hơn về độ ổn định.' },
  { role: 'user', content: 'Laptop Aspire Lite 14 pin được mấy tiếng' },
  { role: 'assistant', content: 'Trang hiện tại không ghi thời lượng pin của **Laptop Aspire Lite 14**.' },
  { role: 'user', content: 'Laptop Aspire Lite 14 hay Laptop Dell 15 DC15250 Core i5-1334U - Thái Long Computer?' },
]

describe('budget — never from a product name the user copied back (SHOP-3)', () => {
  it('the defect, as measured on the raw text', () => {
    expect(extractBudget(msgs[5].content)).toMatchObject({ max: 1_334_000 })
  })
  it('the copied names removed: the compare turn states no budget', () => {
    const u = withoutQuotedNames(msgs)
    expect(extractBudget(String(u[5].content))).toBeNull()
  })
  it('the budget the user DID state ("dưới 20 triệu") is the one read from history', () => {
    const b = budgetFromHistory(withoutQuotedNames(msgs) as never, extractBudget)
    expect(b?.max).toBe(20_000_000)
  })
  it('route.ts reads both the turn budget and the history budget from the unquoted messages', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    expect(route).toMatch(/const budgetMessages = withoutQuotedNames\(messages/)
    expect(route).toMatch(/const budget = extractBudget\(budgetLastText\)/)
    expect(route).toMatch(/budgetFromHistory\(currentSubjectMessages\(budgetMessages/)
  })
})
