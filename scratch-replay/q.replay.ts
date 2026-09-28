import { test } from 'vitest'
import fs from 'node:fs'
import { serperSearch } from '@/lib/ai/tools/common'
test('query variants', async () => {
  const qs = [
    'Ben.la Mâm cơm nhà site:shopeefood.vn',
    'Ben.la Mâm cơm nhà (site:food.grab.com/vn OR site:shopeefood.vn)',
    '"Hàng Dương Quán" (site:food.grab.com/vn OR site:shopeefood.vn)',
    'Hàng Dương Quán Ngô Đức Kế site:shopeefood.vn',
    '"Cơm Niêu Chú Chen" (site:food.grab.com/vn OR site:shopeefood.vn)',
    'Cơm Niêu Chú Chen Nguyễn Trãi site:shopeefood.vn',
    'Cơm Ngon Hà Nội Nguyễn Du site:shopeefood.vn',
    'ốp iPhone 17 Pro Max UAG (site:shopee.vn OR site:lazada.vn OR site:tiki.vn OR site:cellphones.com.vn)',
    'ốp lưng iPhone 17 Pro Max UAG chính hãng site:cellphones.com.vn',
  ]
  const out: string[] = []
  for (const q of qs) { const r = await serperSearch(q); out.push(`Q ${q} -> ${(r||[]).length}\n   ` + (r||[]).slice(0,5).map(x => `${x.link} :: ${x.title}`).join('\n   ')) }
  fs.writeFileSync('scratch-replay/out2.txt', out.join('\n'))
})
