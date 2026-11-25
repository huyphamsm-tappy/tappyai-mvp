// 19/11 (owner: "hide all those buttons: Tư vấn, Giải thích, Tìm quanh đây, Tappy Tối Nay, Lên kế hoạch trip, Theo dõi giá, they belong to the old architecture"): the six shortcut chips above the message box are off
// unless a build turns them on. The nearby-search code they call stays (its own tests turn the flag on).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync('src/components/ChatInterface.tsx', 'utf8')

describe('the six shortcut chips', () => {
  it('are hidden unless NEXT_PUBLIC_ACTION_CHIPS is 1', () => {
    expect(src).toContain("const ACTION_CHIPS_VISIBLE = process.env.NEXT_PUBLIC_ACTION_CHIPS === '1'")
    expect(src).toContain('{ACTION_CHIPS_VISIBLE && <div className="max-w-container-content mx-auto w-full flex gap-2 mb-2 overflow-x-auto scrollbar-none">')
  })
  it('the whole row of six sits inside that condition', () => {
    const start = src.indexOf('{ACTION_CHIPS_VISIBLE && <div')
    const end = src.indexOf('</div>}', start)
    const row = src.slice(start, end)
    for (const key of ['chipAdvice', 'chipExplain', 'chipNearby', 'chipTonight', 'chipTrip', 'chipPriceWatch']) expect(row, key).toContain(`t('chat.${key}')`)
  })
})
