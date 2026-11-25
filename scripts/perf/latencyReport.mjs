// Latency report from the server's own `tappyai_usage` records (no change to the chat path, nothing sent to the browser).
//
// Where the records come from: the chat route already logs ONE JSON line per turn with `type: "tappyai_usage"` and the stage marks
// (preModelMs, firstStepFinishMs, toolMs, modelFinishMs, postModelMs, ttftMs, ttuaMs, elapsedMs). On Vercel: Project → Logs → filter
// `tappyai_usage` → export (JSON/text), or `vercel logs <deployment-url> --json > logs.txt`. Any text where a line contains that JSON works.
//
// Usage:   node scripts/perf/latencyReport.mjs logs.txt [--by=intent]        (or pipe the logs on stdin)
//
// The stages are DERIVED from the marks, all measured from the request's start:
//   chuẩn bị (pre-model)        preModelMs
//   lượt model 1 (decide/tool)  firstStepFinishMs - preModelMs      (the first model round-trip; on a tool turn it ends with the tool call)
//   công cụ (tools)             toolMs                               (time inside tool executions, e.g. web search)
//   viết câu trả lời            modelFinishMs - firstStepFinishMs    (everything from the end of round 1 to the end of generation; includes tools + round 2)
//   đuôi (tail)                 postModelMs                          (guards, enrichment, media cards after generation)
//   thấy chữ đầu tiên           ttftMs
//   tổng (to last byte)         elapsedMs
import { readFileSync } from 'node:fs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)

/** Every `tappyai_usage` JSON object found in the text (one per line, or embedded in a longer log line). */
export function parseUsage(text) {
  const out = []
  for (const line of String(text).split(/\r?\n/)) {
    const at = line.indexOf('{"type":"tappyai_usage"')
    if (at < 0) continue
    // Try the whole tail first, then trim trailing noise until it parses.
    let s = line.slice(at)
    for (let cut = s.length; cut > 20; cut = s.lastIndexOf('}', cut - 1) + 1) {
      if (cut <= 0) break
      try { out.push(JSON.parse(s.slice(0, cut))); break } catch { /* keep trimming */ }
    }
  }
  return out
}

/** The derived stages of one record, in milliseconds (null where a mark is missing). */
export function stagesOf(r) {
  const pre = num(r.preModelMs)
  const first = num(r.firstStepFinishMs)
  const finish = num(r.modelFinishMs)
  return {
    prepare: pre,
    firstModelRound: pre !== null && first !== null && first >= pre ? first - pre : null,
    tools: num(r.toolMs),
    writeAnswer: first !== null && finish !== null && finish >= first ? finish - first : null,
    tail: num(r.postModelMs),
    firstText: num(r.ttftMs),
    total: num(r.elapsedMs),
  }
}

export function percentile(sorted, p) {
  if (!sorted.length) return null
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[i]
}

/** { count, stages: { name: { n, p50, p90, max } } } for the records given. */
export function summarize(records) {
  const buckets = {}
  for (const r of records) {
    const st = stagesOf(r)
    for (const [k, v] of Object.entries(st)) if (v !== null) (buckets[k] ??= []).push(v)
  }
  const stages = {}
  for (const [k, arr] of Object.entries(buckets)) {
    arr.sort((a, b) => a - b)
    stages[k] = { n: arr.length, p50: percentile(arr, 50), p90: percentile(arr, 90), max: arr[arr.length - 1] }
  }
  return { count: records.length, stages }
}

const LABEL = {
  prepare: 'chuẩn bị (trước model)',
  firstModelRound: 'lượt model đầu',
  tools: 'công cụ (tìm web…)',
  writeAnswer: 'từ lượt 1 đến hết viết',
  tail: 'đuôi (kiểm tra, thẻ phụ)',
  firstText: 'thấy chữ đầu tiên',
  total: 'TỔNG đến byte cuối',
}
const sec = (ms) => (ms === null ? '   -  ' : (ms / 1000).toFixed(1).padStart(5) + 's')

export function render(records, by) {
  const groups = by ? Object.entries(Object.groupBy ? Object.groupBy(records, (r) => String(r[by] ?? 'khác')) : records.reduce((m, r) => ((m[String(r[by] ?? 'khác')] ??= []).push(r), m), {})) : [['tất cả', records]]
  const lines = []
  for (const [name, recs] of groups) {
    const s = summarize(recs)
    lines.push(`\n== ${by ? by + ' = ' : ''}${name}  (${s.count} lượt) ==`)
    lines.push('chặng'.padEnd(30) + 'p50'.padStart(7) + 'p90'.padStart(8) + 'max'.padStart(8) + '    n')
    for (const k of Object.keys(LABEL)) {
      const x = s.stages[k]
      if (x) lines.push(LABEL[k].padEnd(30) + sec(x.p50) + ' ' + sec(x.p90) + ' ' + sec(x.max) + String(x.n).padStart(5))
    }
  }
  return lines.join('\n')
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('latencyReport.mjs')) {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const by = (process.argv.find((a) => a.startsWith('--by=')) ?? '').slice(5) || ''
  const text = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8')
  const recs = parseUsage(text)
  if (!recs.length) { console.log('Không thấy dòng tappyai_usage nào trong dữ liệu.'); process.exit(1) }
  console.log(render(recs, by))
}
