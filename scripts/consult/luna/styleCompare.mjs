// node scripts/consult/luna/styleCompare.mjs <A1 dirs> <A2 dirs> <B dirs> [<json out>]   (each = comma list of replay out dirs: scenarios,realTyping)
// STYLE_LUNA6 measurement (owner 01/10, D7): A1/A2 = flag OFF twice (noise floor), B = flag ON, same retrieved data (Serper replay).
// Structural delta = what code builds (turn type, tool rows, card names, picks, alternatives, markers). Everything that is the MODEL's
// own choice is listed per turn against the A1↔A2 noise, never waved away.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const [a1d, a2d, bd, outFile] = process.argv.slice(2)
const load = ds => ds.split(',').flatMap(d => JSON.parse(readFileSync(join(d, 'results.json'), 'utf8')).rows.map(r => ({ ...r, conv: d.split('-')[0] + ':' + r.conv })))
const key = r => `${r.conv}#${r.turnIndex}`
const A1 = new Map(load(a1d).map(r => [key(r), r])), A2 = new Map(load(a2d).map(r => [key(r), r])), B = new Map(load(bd).map(r => [key(r), r]))
const keys = [...A1.keys()].filter(k => A2.has(k) && B.has(k))
const markers = t => [...(t || '').matchAll(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]([\s\S]*?)\[\/\1\]/g)].map(m => m[1] + ':' + m[2])
const askBlock = t => (/\[TAPPY_ASK\]([\s\S]*?)\[\/TAPPY_ASK\]/.exec(t || '') || [])[1] || ''
const norm = r => JSON.stringify({ type: r.server?.turnType ?? r.type, toolRows: r.toolRows, pick: r.mainPick ?? null, alts: r.alternatives ?? [], serper: r.serperCalls })
const codeBuilt = r => JSON.stringify({ markers: markers(r.reply).filter(m => !m.startsWith('FOLLOWUPS:') ), ask: askBlock(r.reply) })
const EMOJI = /\p{Extended_Pictographic}/u
const FORBID = [/Chắc chắn rồi/i, /Tất nhiên!/i, /Hy vọng (?:những )?thông tin/i, /Rất vui được hỗ trợ/i, /tôi xin đề xuất/i, /tuyệt vời/i, /hoàn hảo/i, /không thể bỏ qua/i, /đáng trải nghiệm/i]
const OPENER = /^\s*(?:Mình|Tôi|Tui)\s+hiểu\s+bạn/i
const ASSUME = /giả định|giả sử|tính cho|tính theo/i
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0)
const stats = m => {
  const rows = keys.map(k => m.get(k)); const picks = rows.filter(r => (r.server?.turnType ?? r.type) === 'pick')
  return {
    turns: rows.length, tokensIn: sum(rows, r => r.tokensIn || 0), tokensOut: sum(rows, r => r.tokensOut || 0), usd: +sum(rows, r => r.usd || 0).toFixed(4),
    emojiReplies: rows.filter(r => EMOJI.test(r.reply || '')).length, emojiMax: Math.max(...rows.map(r => ((r.reply || '').match(/\p{Extended_Pictographic}/gu) || []).length)),
    forbidden: rows.reduce((n, r) => n + FORBID.filter(re => re.test(r.reply || '')).length, 0),
    pickOpenerUnderstand: picks.filter(r => OPENER.test(r.reply || '')).length, picks: picks.length, pickWithAssumption: picks.filter(r => ASSUME.test(r.reply || '')).length,
    meanChars: Math.round(sum(rows, r => (r.reply || '').length) / rows.length), maxChars: Math.max(...rows.map(r => (r.reply || '').length)),
  }
}
const res = { keys: keys.length, stats: { A1: stats(A1), A2: stats(A2), B: stats(B) }, codeBuiltDelta: [], structuralDeltaAB: [], noiseAA: [], onlyInBNotNoise: [] }
for (const k of keys) {
  const a1 = A1.get(k), a2 = A2.get(k), b = B.get(k)
  const noise = norm(a1) !== norm(a2)
  const dAB = norm(a1) !== norm(b) || norm(a2) !== norm(b)
  if (noise) res.noiseAA.push(k)
  if (dAB) res.structuralDeltaAB.push({ k, a1: norm(a1), a2: norm(a2), b: norm(b), noise })
  if (!noise && dAB) res.onlyInBNotNoise.push(k)
  if (codeBuilt(a1) !== codeBuilt(b) && codeBuilt(a1) === codeBuilt(a2)) res.codeBuiltDelta.push({ k, a: codeBuilt(a1).slice(0, 300), b: codeBuilt(b).slice(0, 300) })
}
console.log(JSON.stringify(res, null, 1))
if (outFile) writeFileSync(outFile, JSON.stringify(res, null, 1))
