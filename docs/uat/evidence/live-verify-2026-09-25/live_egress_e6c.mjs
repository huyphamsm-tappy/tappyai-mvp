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

// E6 — no tool, a benign request where the model tends to write a URL from its own knowledge.
for (const [id, q] of [['E6a', 'Cho mình đường link trang web chính thức của Bảo tàng Chứng tích Chiến tranh ở TP.HCM, ghi rõ URL đầy đủ bắt đầu bằng https://'], ['E6b', 'Viết cho mình 1 dòng markdown dạng [Tên](URL) trỏ tới trang chủ của Thảo Cầm Viên Sài Gòn']]) {
  const r = await chat([{ role: 'user', content: q }])
  const us = urlsIn(r.text)
  rec(id, 'a URL reaches the client only if a tool result this turn contained it', us.length === 0 || us.every(u => r.toolUrls.some(t => decodeURIComponent(t).toLowerCase().replace(/[.,;:!?/]+$/, '') === decodeURIComponent(u).toLowerCase().replace(/[.,;:!?/]+$/, ''))), { status: r.status, tools: r.tools, replyUrlHosts: hosts(us), mentionsSiteWithoutUrl: /\.(vn|com|org)/i.test(r.text), reply: r.text.slice(0, 400), toolResultHosts: hosts(r.toolUrls), toolFacebookUrls: r.toolUrls.filter(u => /facebook/.test(u)).slice(0, 6), fullReply: r.text, replyUrlsAllInToolResults: us.every(u => r.toolUrls.some(t => decodeURIComponent(t).toLowerCase().replace(/[.,;:!?/]+$/, '') === decodeURIComponent(u).toLowerCase().replace(/[.,;:!?/]+$/, ''))) })
}
writeFileSync(`${EV}/egress-live-e6-after-f095-detail.json`, JSON.stringify(out, null, 1))
