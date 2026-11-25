// Plan economics from measured UAT costs (17-18/11/2026). Run: node economics.mjs
const FX = 25500, CHAT = 0.014, STD = 0.10, ADV = 0.605 // USD (STD 0.09-0.11, ADV 0.57-0.64 midpoints)
const plans = [
  { id: 'pip trial 7d', vnd: 25000, months: 7 / 30, std: 5, adv: 5 },
  { id: 'coco 1m', vnd: 175000, months: 1, std: 5, adv: 5 },
  { id: 'coco 3m', vnd: 472500, months: 3, std: 5, adv: 5 },
  { id: 'promax 1m', vnd: 225000, months: 1, std: 10, adv: 15 },
  { id: 'promax 3m', vnd: 607500, months: 3, std: 10, adv: 15 },
]
const fee = { web0: 1, store15: 0.85, store30: 0.70 } // web fee unknown in repo: 0% assumed
const f = (n) => (n >= 0 ? '' : '-') + Math.abs(n).toFixed(2)
const rows = []
for (const p of plans) {
  const grossUsd = p.vnd / FX
  const m = p.id.startsWith('pip') ? 1 : p.months // allowances are per VN month; the trial can use a full month's allowance in 7 days
  const allow = m * (p.std * STD + p.adv * ADV)
  const days = p.months * 30
  const chatTypical = 15 * days * CHAT
  const typical = chatTypical + allow / 2
  for (const [k, mult] of Object.entries(fee)) {
    const net = grossUsd * mult
    const worstMargin = (net - allow) / net
    const typMargin = (net - typical) / net
    const be = Math.max(0, Math.floor((net - allow) / CHAT))
    const beHalf = Math.max(0, Math.floor((net - allow / 2) / CHAT))
    rows.push([p.id, k, f(net), f(allow), (worstMargin * 100).toFixed(0) + '%', f(typical), (typMargin * 100).toFixed(0) + '%', be, beHalf, (be / days).toFixed(1), (beHalf / days).toFixed(1)])
  }
}
console.log('plan | channel | netUSD | allowanceCostUSD(all used, 0 chat) | worstMargin | typicalCostUSD(15 chat/day + half allow) | typMargin | breakEvenChatTurns(all allow) | breakEvenChatTurns(half allow) | per day (all) | per day (half)')
for (const r of rows) console.log(r.join(' | '))

// Option b: price for >=30% margin on typical case (web, 15 chat/day + half allowance) and for worst allowances + 8 chat/day
console.log('\nOption b: min price (VND) for 30% web margin')
for (const p of plans) {
  const days = p.months * 30, m = p.id.startsWith('pip') ? 1 : p.months
  const allow = m * (p.std * STD + p.adv * ADV)
  const c1 = (15 * days * CHAT + allow / 2) / 0.7, c2 = (8 * days * CHAT + allow) / 0.7
  console.log(p.id, 'typical15:', Math.round(c1 * FX / 1000) * 1000, 'worst-allow+8chat:', Math.round(c2 * FX / 1000) * 1000)
}
// Option a: allowances that keep worst-case allowance cost <= 35% of web net monthly revenue
console.log('\nOption a: allowance pairs (Std+Adv) with cost <= 35% of monthly web revenue')
for (const [id, vnd, months] of [['coco 1m', 175000, 1], ['coco 3m', 472500, 3], ['promax 1m', 225000, 1], ['promax 3m', 607500, 3]]) {
  const budget = 0.35 * (vnd / FX) / months
  console.log(id, 'monthly budget USD', budget.toFixed(2), 'e.g. Std/Adv ->', [[5, 1], [5, 2], [8, 2], [10, 3], [10, 4]].map(([s, a]) => `${s}+${a}=${(s * STD + a * ADV).toFixed(2)}`).join(', '))
}
// Option c: shared unit pool, Standard=1, Advanced=2 units; worst case = all Advanced
console.log('\nOption c: unit pool, worst case = units/2 Advanced')
for (const [id, units] of [['pro 8 units', 8], ['pro 10 units', 10], ['promax 16 units', 16], ['promax 20 units', 20]]) console.log(id, 'worst USD', (units / 2 * ADV).toFixed(2), 'all-standard USD', (units * STD).toFixed(2))
