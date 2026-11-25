// Layout metrics of the web chat (16/11/2026): reads the UAT server log, takes the LAST N `tappyai_one_brain_media` lines (one per answered turn, in order) and tallies them against the fixed
// question set (docs/uat/LAYOUT-QUESTIONS-20261116.json, which says the order to ask in). Counts and kinds only - the log never carries the question or the answer.
// Usage: node scripts/uat/layout-metrics.mjs <path to uat log> [N = 30]
import { readFileSync } from 'node:fs'

const logPath = process.argv[2]
const n = Number(process.argv[3] ?? 30)
if (!logPath) { console.log('usage: node scripts/uat/layout-metrics.mjs <log> [N]'); process.exit(1) }
const set = JSON.parse(readFileSync(new URL('../../docs/uat/LAYOUT-QUESTIONS-20261116.json', import.meta.url), 'utf8'))
const lines = readFileSync(logPath, 'utf8').split('\n')
const media = lines.filter(l => l.startsWith('{"type":"tappyai_one_brain_media"')).slice(-n).map(l => { try { return JSON.parse(l) } catch { return null } })
const sense = lines.filter(l => l.startsWith('{"type":"tappyai_image_sense"')).slice(-n * 2).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

const kinds = ['compare', 'look', 'abstract', 'howto', 'short']
const rows = set.questions.slice(0, media.length).map((q, i) => ({ ...q, m: media[i] }))
const out = {}
for (const k of kinds) {
  const rs = rows.filter(r => r.kind === k && r.m)
  const declared = (r, t) => (r.m.declared ?? []).includes(t)
  out[k] = {
    turns: rs.length,
    cards: rs.filter(r => declared(r, 'profiles')).length,
    gallery_declared: rs.filter(r => declared(r, 'gallery')).length,
    gallery_drawn: rs.filter(r => (r.m.gallery_images ?? 0) >= 1).length,
    quote_line: rs.filter(r => (r.m.quotes ?? 0) >= 1).length,
    two_tables: rs.filter(r => (r.m.md_tables ?? 0) + (declared(r, 'compare') ? 1 : 0) >= 2).length,
  }
}
console.log(JSON.stringify(out, null, 2))
console.log('image checks:', sense.length, 'pictures checked:', sense.reduce((s, x) => s + (x.checked ?? 0), 0), 'kept:', sense.reduce((s, x) => s + (x.kept ?? 0), 0), 'errors:', sense.filter(x => x.error).length)
console.log('per question:')
for (const r of rows) console.log(String(r.id).padStart(2), r.kind.padEnd(8), JSON.stringify({ shape: r.m?.shape, declared: r.m?.declared, gallery: r.m?.gallery_images, subj: r.m?.subject_images, quotes: r.m?.quotes, tables: r.m?.md_tables, chars: r.m?.chars }))
