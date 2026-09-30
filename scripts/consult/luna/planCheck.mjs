// PHIÊN LUNA — plan-turn checker (owner 30/09). For every plan turn of a replay out dir:
//   [TAPPY_PLAN] parse, headings, turn time, TTFT, cost; and every price / time / distance / venue the plan states that the
//   conversation's tool results and the user's words do not contain ("unsourced" → read by hand for fabrication).
//   node scripts/consult/luna/planCheck.mjs <outDir> [--show]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [dir, ...flags] = process.argv.slice(2)
const show = flags.includes('--show')
const res = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'))
const rows = res.rows ?? res
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const digits = s => String(s).replace(/[^\d]/g, '')

function evidenceOf(conv, uptoTurn) {
  let text = ''
  for (let t = 1; t <= uptoTurn; t++) {
    const f = join(dir, 'raw', `${conv}-t${t}.json`)
    if (!existsSync(f)) continue
    const j = JSON.parse(readFileSync(f, 'utf8'))
    text += ' ' + j.sent + ' ' + JSON.stringify(j.parsed?.tools ?? [])
  }
  return fold(text)
}

const out = []
for (const r of rows) {
  const isPlan = r.server?.turnType === 'plan' || /kế hoạch chi tiết|lên kế hoạch|lịch trình chi tiết|hướng dẫn (?:đặt|mua)/i.test(r.sent)
  if (!isPlan) continue
  const raw = JSON.parse(readFileSync(join(dir, 'raw', `${r.conv}-t${r.turnIndex}.json`), 'utf8'))
  const usage = (raw.logEvents ?? []).filter(e => e.type === 'tappyai_usage').at(-1) ?? {}
  const text = String(r.reply ?? '')
  const m = /\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/.exec(text)
  let plan = null, parse = m ? 'bad' : 'none'
  if (m) { try { plan = JSON.parse(m[1]); parse = 'ok' } catch { parse = 'bad' } }
  const ev = evidenceOf(r.conv, r.turnIndex)
  const unsourced = []
  const prose = text.replace(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS)\][\s\S]*?\[\/\1\]/g, ' ').replace(/\[FOLLOWUPS\][^\n]*/g, '').replace(/\(https?:[^)]*\)/g, '')
  const scan = (s, where) => {
    for (const mm of s.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?\s?(?:k|tr|triệu|nghìn))\s*(?:đ|₫|vnd)?/gi)) {
      const d = digits(mm[1]); if (d.length < 2) continue
      const short = /k$/i.test(mm[1].trim()) ? digits(mm[1]) : d
      if (!ev.includes(d) && !ev.includes(short) && !ev.includes(d.replace(/000$/, ''))) unsourced.push(`${where}:money ${mm[0].trim()}`)
    }
    for (const mm of s.matchAll(/\b(\d{1,2}[:h]\d{2})\b/g)) { const t = mm[1].replace('h', ':'); if (!ev.includes(t) && !ev.includes(mm[1])) unsourced.push(`${where}:time ${mm[1]}`) }
    for (const mm of s.matchAll(/(\d+(?:[.,]\d+)?)\s?(km|phút)\b/gi)) if (!ev.includes(mm[1].replace(',', '.')) && !ev.includes(mm[1])) unsourced.push(`${where}:${mm[2]} ${mm[0]}`)
  }
  scan(prose, 'prose')
  if (plan) {
    for (const d of plan.days ?? []) for (const it of d.items ?? []) {
      if (it.name && it.category !== 'transport' && !ev.includes(fold(it.name).slice(0, 18))) unsourced.push(`plan:venue ${it.name}`)
      scan(`${it.price ?? ''} ${it.description ?? ''}`, 'plan')
    }
  }
  const failed = (r.checks ?? []).filter(c => !c.pass && !c.info).map(c => c.id)
  out.push({ conv: r.conv, t: r.turnIndex, pass: r.pass, failed, parse, items: plan ? (plan.days ?? []).reduce((n, d) => n + (d.items?.length ?? 0), 0) : null,
    ms: r.ms, ttua: usage.ttuaMs ?? null, usd: r.usd, model: r.cost?.model ?? null, reasoning: r.cost?.reasoningTokens ?? 0, fellBack: !!r.cost?.fellBack, unsourced: [...new Set(unsourced)] })
}
for (const o of out) {
  console.log(`${o.pass ? 'PASS' : 'FAIL'} ${o.conv} t${o.t} · plan=${o.parse}${o.items != null ? `(${o.items} items)` : ''} · ${Math.round(o.ms / 1000)}s total · ttua ${o.ttua ?? '-'}ms · $${(o.usd ?? 0).toFixed(4)} · ${o.model ?? ''}${o.reasoning ? ` · reasoning ${o.reasoning}` : ''}${o.fellBack ? ' · FALLBACK' : ''}${o.failed.length ? ' · failed ' + o.failed.join(',') : ''}`)
  if (o.unsourced.length) console.log('   unsourced: ' + o.unsourced.join(' | '))
  if (show) {
    const r = rows.find(x => x.conv === o.conv && x.turnIndex === o.t)
    console.log('   ' + String(r.reply).replace(/\[TAPPY_PLAN\][\s\S]*?\[\/TAPPY_PLAN\]/, '[PLAN]').replace(/\[FOLLOWUPS\][^\n]*/g, '').replace(/\n+/g, '\n   ').slice(0, 2500))
  }
}
const n = out.length, pass = out.filter(o => o.pass).length
console.log(`\nplans ${n} · auto-pass ${pass} · with unsourced items ${out.filter(o => o.unsourced.length).length} · >50s ${out.filter(o => o.ms > 50000).length} · max ${Math.max(...out.map(o => o.ms)) / 1000}s · $ total ${out.reduce((s, o) => s + (o.usd ?? 0), 0).toFixed(4)}`)
