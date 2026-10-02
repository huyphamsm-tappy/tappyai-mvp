// Live UAT probe (release 2026-09-28). Sends chat turns to a deployment through the Vercel
// protection bypass and stores the RAW stream plus a parsed summary as evidence.
//
//   node scripts/uat/liveProbe.mjs <baseUrl> <outDir> <caseId> <turn1> [<turn2> ...]
//
// The bypass secret is read from D:/TappyAI-backups/vercel-bypass.txt and never printed.
// A guest turn (no account): x-tappy-age-declared: 18plus, x-tappy-surface: web.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [, , base, outDir, caseId, ...turns] = process.argv
const bypass = readFileSync('D:/TappyAI-backups/vercel-bypass.txt', 'utf8').trim()
mkdirSync(outDir, { recursive: true })

function safeJson(s) {
  try { return JSON.parse(s) } catch (e) { return { BROKEN_JSON: String(e.message), head: s.slice(0, 160) } }
}

function parseStream(raw) {
  let text = ''
  const annotations = []
  for (const line of raw.split('\n')) {
    const m = line.match(/^([0-9a-z]+):(.*)$/)
    if (!m) continue
    try {
      const v = JSON.parse(m[2])
      if (m[1] === '0') text += v
      else if (m[1] === '8') annotations.push(...(Array.isArray(v) ? v : [v]))
    } catch { /* partial frame */ }
  }
  return { text, annotations }
}

// A guest session, exactly as the web client mints one for a visitor (POST /api/auth/anonymous):
// anonymous identity on the deployment's own database, 5 lifetime turns. Kept in memory only.
const anon = await fetch(`${base}/api/auth/anonymous`, { method: 'POST', headers: { 'x-vercel-protection-bypass': bypass } })
if (anon.status !== 200) { console.log(JSON.stringify({ anonStatus: anon.status, body: (await anon.text()).slice(0, 200) })); process.exit(1) }
const { access_token: guestToken } = await anon.json()

const messages = []
const summary = { caseId, base, at: new Date().toISOString(), guest: 'anonymous session (token not stored)', turns: [] }
for (const [i, content] of turns.entries()) {
  messages.push({ role: 'user', content })
  const t0 = Date.now()
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept-language': 'vi',
      'x-vercel-protection-bypass': bypass,
      authorization: `Bearer ${guestToken}`,
      'x-tappy-age-declared': '18plus',
      'x-tappy-surface': 'web',
    },
    body: JSON.stringify({ messages }),
  })
  const raw = await res.text()
  const ms = Date.now() - t0
  writeFileSync(join(outDir, `${caseId}.t${i + 1}.raw.txt`), raw)
  const { text, annotations } = parseStream(raw)
  const places = annotations.filter(a => a && a.kind === 'tappy.places.v1')
  const lastPlaces = places[places.length - 1]
  const placeActions = (lastPlaces?.items ?? []).map(p => ({ name: p.name, actions: (p.actions ?? []).map(a => `${a.kind}${a.primary ? '*' : ''}:${a.labelKey ?? a.label ?? ''}:${(a.url || '').slice(0, 90)}`) }))
  const shopping = text.match(/\[TAPPY_SHOPPING\]([\s\S]*?)\[\/TAPPY_SHOPPING\]/)?.[1]
  const plan = text.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/)?.[1]
  const prose = text.replace(/\[(TAPPY_[A-Z]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*?\[\/\1\]/g, '').trim()
  const turn = {
    user: content, status: res.status, ms,
    literalDoubleStar: (text.match(/\*\*/g) ?? []).length,
    unbalancedBoldLines: prose.split('\n').filter(l => ((l.match(/\*\*/g) ?? []).length % 2) === 1),
    proseTail: prose.slice(-400),
    placeActions,
    shopping: shopping ? safeJson(shopping) : null,
    plan: plan ? safeJson(plan) : null,
    cta: text.match(/\[CTA_BUTTONS\]([\s\S]*?)\[\/CTA_BUTTONS\]/)?.[1]?.trim() ?? null,
    error: res.status !== 200 ? raw.slice(0, 300) : undefined,
  }
  summary.turns.push(turn)
  messages.push({ role: 'assistant', content: text })
}
writeFileSync(join(outDir, `${caseId}.summary.json`), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary.turns.map(t => ({ status: t.status, ms: t.ms, stars: t.literalDoubleStar, unbalanced: t.unbalancedBoldLines.length, places: t.placeActions.length, shopping: t.shopping ? (t.shopping.BROKEN_JSON ? 'BROKEN' : 'ok') : false, plan: t.plan ? (t.plan.BROKEN_JSON ? 'BROKEN' : 'ok') : false }))))
