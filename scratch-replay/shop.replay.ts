import { test } from 'vitest'
import fs from 'node:fs'
import { searchProducts } from '@/lib/ai/tools/shopping'
import { normalizeShopping } from '@/lib/ai/consultative/candidate'
import { deriveShoppingConstraints, validateShoppingCandidates } from '@/lib/ai/consultative/shoppingConstraints'
test('shopping', async () => {
  const q = 'ốp iPhone 17 Pro Max UAG chính hãng'
  const r = await searchProducts(q, 'vi') as Record<string, unknown>
  const msgs = [{ role: 'user', content: 'tìm giùm cái ốp 17 promax uag chính hãng, giá rẻ đi' }]
  const cons = deriveShoppingConstraints(msgs as never, null as never)
  const cands = normalizeShopping(r)
  const { kept, rejected } = validateShoppingCandidates(cands, cons)
  const rows = (r.search_results as Array<Record<string, unknown>>) || []
  fs.writeFileSync('scratch-replay/shop.txt', [
    'constraints ' + JSON.stringify(cons),
    ...rows.map(x => `${x.source} | ${x.price ?? '-'} | ${x.title} | ${String(x.link).slice(0, 90)} | photo=${!!x.photo_url}`),
    'KEPT ' + kept.length, ...kept.map(k => '  + ' + (k as { name?: string }).name),
    'REJECTED ' + rejected.length, ...rejected.slice(0, 25).map(x => '  - ' + JSON.stringify({ n: (x as {candidate:{name:string}}).candidate.name, r: (x as Record<string, unknown>).reason ?? (x as Record<string, unknown>).reasons ?? Object.keys(x) })),
  ].join('\n'))
})
