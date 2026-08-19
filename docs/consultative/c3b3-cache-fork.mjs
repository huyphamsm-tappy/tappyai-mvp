// Variant E created a SECOND cache lineage (13,226) while A–D shared one
// (13,101). `shared` is byte-identical across all five (unit test proves it), so
// the fork must come from OUTSIDE `shared` but INSIDE the cached prefix.
//
// Anthropic caches everything up to the cache_control marker, and TOOL
// DEFINITIONS sit ahead of the system blocks. route.ts builds the
// get_hotel_prices description as:
//     '...' + (budget ? `. BUDGET FILTER: ... duoi ${budget.max} ...` : '')
// — so a budget in the user's message rewrites a TOOL DESCRIPTION.
//
// Isolating test: same request, budget vs no budget. Nothing else differs.
const BASE = 'http://localhost:3000'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const cases = [
  'Khách sạn Đà Nẵng',              // no budget
  'Khách sạn Đà Nẵng dưới 2 triệu', // budget → rewrites the get_hotel_prices description
  'Khách sạn Đà Nẵng',              // no budget again — must RE-USE the first lineage
  'Khách sạn Đà Nẵng dưới 3 triệu', // a DIFFERENT budget → a third lineage?
]
for (const text of cases) {
  await sleep(1500)
  const res = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: text }] }) })
  await res.text()
  console.log(`sent: ${text}`)
}
console.log('\nread tappyai_usage from the server log — compare cacheCreationTokens per request')
