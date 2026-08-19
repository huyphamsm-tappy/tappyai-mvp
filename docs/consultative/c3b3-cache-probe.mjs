// STEP 6 — B1 cache contract, live. Five variants that differ ONLY in `dynamic`
// (language, history, GPS, budget, stage). If `shared` is byte-stable they must
// all hit the same cached prefix: one creation on the cold call, reads after.
// Cache counters live in the SERVER log (tappyai_usage), not the HTTP stream —
// read them with preview_logs after this finishes.
const BASE = 'http://localhost:3000'

const V = [
  { id: 'A vi · cold comparison', body: { messages: [{ role: 'user', content: 'Nên chọn iPhone 15 hay Galaxy S24?' }] } },
  { id: 'B en · cold comparison', body: { messages: [{ role: 'user', content: 'Compare iPhone and Samsung' }] } },
  { id: 'C vi · refinement (prior assistant turn)', body: { messages: [
    { role: 'user', content: 'Tìm khách sạn ở Đà Nẵng' },
    { role: 'assistant', content: 'Mình tìm được vài khách sạn ở Đà Nẵng nhé.' },
    { role: 'user', content: 'Rẻ hơn.' }] } },
  { id: 'D vi · GPS attached', body: { messages: [{ role: 'user', content: 'Quán cà phê nào ngon' }], userLocation: { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP HCM' } } },
  { id: 'E vi · budget + prefs', body: { messages: [{ role: 'user', content: 'Tai nghe bluetooth dưới 1 triệu' }], userPreferences: ['thích màu đen', 'hay đi làm bằng xe máy'] } },
]

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
for (const v of V) {
  await sleep(1500)
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v.body) })
  const body = await res.text()
  let steps = 0
  for (const line of body.split('\n')) if (line.startsWith('e:')) steps++
  console.log(`${v.id.padEnd(42)} HTTP ${res.status}  steps=${steps}  ${Date.now() - t0}ms`)
}
console.log('\nnow read the server log for tappyai_usage cacheReadTokens / cacheCreationTokens')
