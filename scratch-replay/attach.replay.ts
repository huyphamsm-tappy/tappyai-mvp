import { test } from 'vitest'
import fs from 'node:fs'
import { attachCommerceLinks } from '@/lib/ai/tools/commerce'
test('attach food', async () => {
  const raw = fs.readFileSync(process.env.RAW_FILE!, 'utf8')
  const line = raw.split('\n').find(l => l.startsWith('a:'))!
  const res = JSON.parse(line.slice(2)).result
  const log: string[] = []
  const orig = console.log, origE = console.error
  console.log = (...a: unknown[]) => { log.push(a.join(' ')) }; console.error = (...a: unknown[]) => { log.push('ERR ' + a.join(' ')) }
  await attachCommerceLinks('search_places', res, { location: 'Quận 1, TP. Hồ Chí Minh', query: 'quán ăn trưa ngon Quận 1', userTexts: ['nay có món gì ngon ko, cho cái link order về ăn co'], userText: 'nay có món gì ngon ko, cho cái link order về ăn co' })
  console.log = orig; console.error = origE
  fs.writeFileSync('scratch-replay/attach.txt', log.join('\n') + '\n\nROWS\n' + (res.results as Array<Record<string, unknown>>).map(r => `${r.name} | ${JSON.stringify(r.commerce_links ?? null).slice(0, 300)}`).join('\n') + '\nKEYS ' + Object.keys(res).join(','))
})
