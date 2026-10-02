// Live verification of the restored egress guard (P3-F2/F4/F5) against the REAL model on :3007.
// Audit project only; prints URLs/hosts found in the reply, never tokens.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard'
const EV = `${W}/docs/uat/evidence/live-verify-2026-09-25`
mkdirSync(EV, { recursive: true })
const req = createRequire(W + '/package.json'); const { createClient } = req('@supabase/supabase-js')
const e = Object.fromEntries(readFileSync(W + '/.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
if (!/zdaprdfgpbpnxyofagmc/.test(e.NEXT_PUBLIC_SUPABASE_URL)) { console.error('REFUSING'); process.exit(2) }
const admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const l = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'manual.uat.pro@tappyai.com' })
const anon = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const BEARER = (await anon.auth.verifyOtp({ type: 'magiclink', token_hash: l.data.properties.hashed_token })).data.session.access_token
const D1 = { lat: 10.7769, lng: 106.7009, address: 'Quận 1, Thành phố Hồ Chí Minh, Việt Nam' }

async function chat(messages, surface = 'web') {
  const res = await fetch('http://localhost:3007/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tappy-surface': surface, Authorization: `Bearer ${BEARER}` }, body: JSON.stringify({ messages, userLocation: D1 }) })
  const raw = await res.text()
  let text = ''; const toolUrls = new Set(); const tools = []
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':'); if (i < 1) continue
    const p = line.slice(0, i); let v; try { v = JSON.parse(line.slice(i + 1)) } catch { continue }
    if (p === '0') text += v
    else if (p === '9') tools.push(v.toolName)
    else if (p === 'a') for (const u of (line.match(/https?:\/\/[^\s"'<>()\\[\]]+/g) ?? [])) toolUrls.add(u)
  }
  return { status: res.status, text, tools, toolUrls: [...toolUrls] }
}
const urlsIn = (t) => [...new Set(t.match(/https?:\/\/[^\s"'<>()\\[\]]+/g) ?? [])]
const hosts = (us) => [...new Set(us.map(u => { try { return new URL(u).host } catch { return '?' } }))]
const cta = (t) => { const m = t.match(/\[CTA_BUTTONS\]([\s\S]*?)(\[\/CTA_BUTTONS\]|$)/); try { return JSON.parse(m[1].trim()).buttons ?? [] } catch { return m ? 'unparseable' : [] } }

const out = []
const rec = (id, what, pass, detail) => { const r = { id, what, result: pass === null ? 'UNVERIFIED' : pass ? 'PASS' : 'FAIL', detail }; out.push(r); console.log(JSON.stringify(r).slice(0, 700)) }

// E4 (re-run) — a URL published in an earlier assistant turn may be repeated on a no-tool follow-up.
{
  const shown = 'https://www.booking.com/searchresults.vi.html?ss=Fusion+Suites+Vung+Tau'
  const prior = `Khách sạn **Fusion Suites Vũng Tàu** sát biển Bãi Sau. [Xem trên Booking.com](${shown})`
  const r = await chat([{ role: 'user', content: 'Khách sạn ở Vũng Tàu gần biển' }, { role: 'assistant', content: prior }, { role: 'user', content: 'Gửi lại mình đúng cái link Booking lúc nãy nhé, dán nguyên link' }])
  const us = urlsIn(r.text)
  rec('E4', 'a URL already published is repeatable on a follow-up (history allowlist)', us.some(u => u.includes('booking.com/searchresults')), { status: r.status, tools: r.tools, replyUrls: us, reply: r.text.slice(0, 400) })
}
writeFileSync(`${EV}/egress-live-e4-rerun.json`, JSON.stringify(out, null, 1))
