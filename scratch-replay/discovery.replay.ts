import { test } from 'vitest'
import fs from 'node:fs'
import { discoverCommerceHints } from '@/lib/ai/tools/commerceDiscovery'
import { serperSearch } from '@/lib/ai/tools/common'

test('food delivery discovery', async () => {
  const rows = [['Ben.la - Mâm cơm nhà quận 1', '3bis Phan Văn Đạt, Sài Gòn, Hồ Chí Minh 24000, Việt Nam'], ['Hàng Dương Quán Quận 1', '32-34 Ngô Đức Kế, Phường, Sài Gòn, Hồ Chí Minh, Việt Nam'], ['Cơm Niêu Chú Chen - Quận 1', '283 Nguyễn Trãi, Quận 1, Hồ Chí Minh 700000, Việt Nam'], ['Cơm Ngon Hà Nội', '131 Nguyễn Du, Bến Thành, Hồ Chí Minh'], ['Quán Bụi Central, Sài Gòn', '1B Ngô Văn Năm, Quận 1, Hồ Chí Minh']]
  const subjects = rows.map(([n, a], i) => ({ id: String(i), subject: n, address: a, locality: 'Quận 1, TP. Hồ Chí Minh', knownUrls: [] as string[] }))
  const LOG: string[] = []
  const hits = await discoverCommerceHints('food_drink', 'order_delivery', subjects, { maxQueries: 5,
    search: async (q: string) => { const r = await serperSearch(q); LOG.push(['Q', q, '->', (r || []).length].join(' ')); return r },
  })
  fs.writeFileSync('scratch-replay/out.txt', LOG.join('\n') + '\nHITS ' + JSON.stringify(hits.map(h => [h.subjectId, h.providerId, h.title, h.url])))
})
