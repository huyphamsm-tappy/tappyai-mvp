import { test } from 'vitest'
import fs from 'node:fs'
import { serperShopping } from '@/lib/ai/tools/common'
test('shopping endpoint', async () => {
  const out: string[] = []
  for (const q of ['ốp iPhone 17 Pro Max UAG chính hãng giá rẻ', 'ốp iPhone 17 Pro Max UAG chính hãng']) {
    const t = Date.now(); const r = await serperShopping(q, 20); out.push(`${q} -> ${r === null ? 'NULL' : r.length} in ${Date.now() - t}ms`)
  }
  fs.writeFileSync('scratch-replay/sh2.txt', out.join('\n'))
})
