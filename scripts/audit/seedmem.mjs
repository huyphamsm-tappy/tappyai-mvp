// Seeds the AUDIT user's user_memory row (NON-PROD only) with a LARGE legacy memory — the residue a
// real user accumulates after ~30+ ordinary turns under the pre-fix write path (measured shape:
// docs/audit/eval/memory/replay-first20.json, extrapolated to 30+ turns). Used as the "large memory"
// gate for the CONSULTATIVE-40 eval: the model must still recommend. Prints counts only.
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod/.env.local', 'utf8')
  .split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const PROD_REF = 'fwznnobrdctuskgrvuik'
const url = env.NEXT_PUBLIC_SUPABASE_URL
const ref = url.match(/https:\/\/([a-z]+)\.supabase\.co/)?.[1]
if (!ref || ref === PROD_REF || ref !== env.AUDIT_CONFIRMED_NONPROD_REF) throw new Error('refusing: not the confirmed non-prod ref')
const key = env.SUPABASE_SERVICE_ROLE_KEY
const uid = env.AUDIT_TEST_USER_ID
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }

export const LARGE_MEMORY = {
  location_base: 'Sài Gòn',
  discovery_city: 'Đà Nẵng',
  companions: 'gia đình 4 người',
  timing: '3 ngày 2 đêm',
  personality: 'lãng mạn, yên tĩnh',
  preferences: {
    food: ['bún bò', 'phở', 'lẩu', 'hải sản', 'cơm tấm', 'bánh mì', 'sushi', 'bò né', 'ốc', 'gà nướng'],
    entertainment: ['chỗ đậu xe ô tô', 'phòng riêng', 'khách sạn gần biển', 'karaoke', 'rạp phim', 'bar nhạc sống'],
    shopping: ['tai nghe bluetooth', 'laptop văn phòng', 'robot hút bụi', 'máy lọc không khí', 'nồi chiên không dầu'],
    spa: ['massage chân', 'gội đầu dưỡng sinh', 'spa couple'],
  },
  budget: { food: { min: 0, max: 80000 }, shopping: { min: 5000000, max: 7000000 }, trip: { min: 0, max: 6000000 }, spa: { min: 0, max: 300000 } },
  history: [
    'quán ăn Quận 1', 'bún bò Quận 1', 'quán ăn lãng mạn Quận 3', 'quán ăn gia đình Phú Nhuận', 'sinh nhật sếp tiếp khách',
    'mua laptop văn phòng', 'robot hút bụi cho nhà có chó', 'trip Đà Nẵng 3 ngày 2 đêm', 'khách sạn Đà Nẵng gần biển',
    'khách sạn Đà Nẵng dưới 1 triệu/đêm, bao gồm ăn sáng',
  ],
}

const r = await fetch(`${url}/rest/v1/user_memory?on_conflict=user_id`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ user_id: uid, ...LARGE_MEMORY, updated_at: new Date().toISOString() }),
})
console.log('ref', ref, '| seed user_memory →', r.status, r.status >= 300 ? await r.text() : '')
const c = await fetch(`${url}/rest/v1/user_memory?user_id=eq.${uid}&select=history,preferences`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
const rows = await c.json()
console.log('row: history', rows[0]?.history?.length, 'food prefs', rows[0]?.preferences?.food?.length)
