import { guardSnippetPricesInText } from 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard/src/lib/ai/snippetPriceGuard'
const user = 'Mình đi Đà Nẵng 2 ngày 1 đêm, 2 người, ngân sách 20 triệu'
const cands = [
  '**Tổng ước tính: ~8.500.000 VND** cho 2 người, còn dư khoảng 11.500.000 VND cho ăn uống, mua sắm, hoặc nâng cấp.',
  '**Tổng ước tính: khoảng 20 triệu cho 2 người**, đã gồm vé máy bay, khách sạn, còn lại cho ăn uống, mua sắm, hoặc nâng cấp.',
  '**Tổng ước tính: 20.000.000 VND** — vừa đủ ngân sách, dư cho ăn uống, mua sắm, hoặc nâng cấp.',
  '**Tổng ước tính:** khoảng 12 triệu, bạn còn khoảng 8 triệu cho ăn uống, mua sắm, hoặc nâng cấp.',
  '**Tổng ước tính** khoảng 12.000.000 VND, còn dư 8 triệu để ăn uống, mua sắm, hoặc nâng cấp.',
]
for (const c of cands) for (const v2 of [false, true]) {
  const r = guardSnippetPricesInText(c, [], user, undefined, v2 ? { v2: true, priceBandsByEntity: new Map() } : undefined)
  console.log((v2 ? 'v2 ' : 'v1 ') + JSON.stringify(r.text))
}
