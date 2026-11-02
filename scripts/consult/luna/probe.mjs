// PHIÊN LUNA — one-off probe (LOCAL only). Reads the OpenAI key from a file, never prints it.
// Checks: the key works, `gpt-6-luna` answers on Chat Completions with an explicit reasoning effort, and what the
// RAW usage object carries (cached / cache-write / reasoning tokens) — the SDK does not surface cache writes.
//   node scripts/consult/luna/probe.mjs [keyFile]
import { readFileSync } from 'node:fs'

const keyFile = process.argv[2] || process.env.REPLAY_OPENAI_KEY_FILE || 'D:/TappyAI-backups/openai-key.txt'
const key = readFileSync(keyFile, 'utf8').trim()
const model = process.env.LUNA_MODEL || 'gpt-6-luna'
// A long fixed prefix (> 1024 tokens) sent twice, so the second call can show cache reads/writes.
const prefix = 'Bạn là Tappy, người tư vấn ăn uống ở TP.HCM. '.repeat(160)

async function call(effort, i) {
  const t0 = Date.now()
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, reasoning_effort: effort, max_completion_tokens: 200, messages: [{ role: 'system', content: prefix }, { role: 'user', content: `Gợi ý 1 món cho bữa tối, 1 câu. (${effort}#${i})` }] }),
  })
  const j = await r.json()
  return { effort, i, status: r.status, ms: Date.now() - t0, error: j.error?.message?.slice(0, 160), usage: j.usage, text: j.choices?.[0]?.message?.content?.slice(0, 80) }
}

for (const effort of ['none', 'low']) for (const i of [1, 2]) console.log(JSON.stringify(await call(effort, i)))
