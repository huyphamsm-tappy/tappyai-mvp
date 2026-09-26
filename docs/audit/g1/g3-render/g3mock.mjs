// G3 render harness: a stand-in for /api/chat on host :3000 (the debug app's default
// API_BASE_URL is http://10.0.2.2:3000/). Streams a pre-injected captured reply so the
// Android renderer shows the SAME text under v1 and v2. Ignores auth headers (never logged).
// usage: node g3mock.mjs v1|v2
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
const MODE = process.argv[2] === 'v2' ? 'v2' : 'v1'
const fixtures = JSON.parse(readFileSync('D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod/docs/audit/g3-render/fixtures.json', 'utf8'))
const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/chat')) {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      let key = 'G3-1'
      try {
        const msgs = JSON.parse(body).messages ?? []
        const last = [...msgs].reverse().find(m => m.role === 'user')
        const t = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '')
        const m = /G3-(\d)/i.exec(t); if (m) key = `G3-${m[1]}`
      } catch { /* default fixture */ }
      const text = (fixtures[key] ?? fixtures['G3-1'])[MODE]
      console.log(`${new Date().toISOString()} chat → ${key} ${MODE} (${text.length} chars)`)
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'x-vercel-ai-data-stream': 'v1', 'cache-control': 'no-cache' })
      // stream in a few chunks so the client's incremental path runs
      const parts = text.match(/[\s\S]{1,120}/g) ?? [text]
      let i = 0
      const tick = () => { if (i < parts.length) { res.write(`0:${JSON.stringify(parts[i++])}\n`); setTimeout(tick, 40) } else { res.write('d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n'); res.end() } }
      tick()
    })
    return
  }
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} → 404`)
  res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"mock"}')
})
const PORT = Number(process.env.G3_PORT ?? 3410)
server.listen(PORT, '0.0.0.0', () => console.log(`g3 mock listening on :${PORT} mode=${MODE}`))
