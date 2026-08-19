// C3-B.2 Phases 5 & 6 — isolated prompt A/B.
// Patches ONE clause in promptBuilder.ts, runs the same requests against the
// running dev server, restores the file byte-for-byte. Nothing is committed and
// no variant is left in place: the finally block restores and verifies a hash.

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const TARGET = ROOT + '/src/lib/ai/promptBuilder.ts'
const BASE = process.env.TAPPY_BASE_URL ?? 'http://localhost:3000'
const OUT = process.argv[2] ?? 'ab-out.json'
const PHASE = process.argv[3] ?? '5'
const REPS = Number(process.env.REPS ?? 1)

const original = readFileSync(TARGET, 'utf8')
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const ORIG_HASH = hash(original)

// ── the single clause each phase removes ─────────────────────────────────────
const CLAUSE = {
  // PHASE 5 — the prohibition C3-B ADDED to the scope refusal list. Nothing else changes.
  5: 'tu van cong nghe chung hoac giai thich cong nghe hoat dong the nao ngoai muc dich mua sam, ',
  // PHASE 6 — the clarification sentence C3-B ADDED to the comparison stage block.
  6: ' Neu uu tien cua user chua ro, hoi DUNG MOT cau ngan de chot.',
}[PHASE]

const PROMPTS = {
  5: [
    { id: '14-vi', text: 'Nên mua iPhone hay Samsung?', note: 'owner-approved case (detectLang reads it as EN)' },
    { id: '14-vi-fixture', text: 'Nên mua iPhone hay Samsung? Trả lời bằng tiếng Việt.', note: 'F1 language fixture' },
    { id: '14-en', text: 'Should I buy an iPhone or a Samsung?', note: 'English twin' },
  ],
  6: [
    { id: '05-vi-food', text: 'Nên chọn quán phở hay quán bún bò cho bữa tối?', note: 'food comparison VI' },
    { id: '05-en-food', text: 'Pho or bun bo for dinner, which should I pick?', note: 'food comparison EN' },
    { id: '09-vi-hotel', text: 'Nên ở gần biển Mỹ Khê hay gần trung tâm Đà Nẵng?', note: 'hotel comparison VI' },
    { id: '09-en-hotel', text: 'Should I stay near My Khe beach or Da Nang city centre?', note: 'hotel comparison EN' },
    { id: '14-vi-product', text: 'Nên mua iPhone hay Samsung? Trả lời bằng tiếng Việt.', note: 'product comparison VI (fixture)' },
    // The 8-question questionnaire itself — Phase 5 proved the scope prohibition
    // does not cause it (0/8 refusals, clar=8 in every single run, both variants).
    { id: '14-en-product', text: 'Should I buy an iPhone or a Samsung?', note: 'product comparison EN — the questionnaire case' },
  ],
}[PHASE]

async function ask(text) {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: text }] }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.text()
  let out = ''; const tools = []; let steps = 0; let usage = {}
  for (const line of body.split('\n')) {
    if (line.startsWith('0:')) { try { out += JSON.parse(line.slice(2)) } catch { /* */ } }
    else if (line.startsWith('9:')) { try { tools.push(JSON.parse(line.slice(2)).toolName) } catch { /* */ } }
    else if (line.startsWith('e:')) steps++
    else if (line.startsWith('d:')) { try { usage = JSON.parse(line.slice(2)).usage ?? {} } catch { /* */ } }
  }
  return { text: out.trim(), tools, steps, usage, ms: Date.now() - t0 }
}

// ── deterministic scoring ────────────────────────────────────────────────────
const prose = (s) => {
  let end = s.length
  for (const m of ['[CTA_BUTTONS]', '[FOLLOWUPS]', '[TAPPY_PLAN]']) { const i = s.indexOf(m); if (i !== -1 && i < end) end = i }
  return s.slice(0, end)
}
function clarifications(reply) {
  let t = prose(reply)
  t = t.replace(/\[[^\]]*\]\([^)]*\)/g, ' ').replace(/https?:\/\/\S+/g, ' ')
  t = t.replace(/"[^"]*"/g, ' ').replace(/“[^”]*”/g, ' ').replace(/'[^']*'/g, ' ')
  t = t.replace(/\([^)]*\)/g, ' ')
  return (t.match(/\?/g) || []).length
}
// Candidate option metric (Phase 2): a bold span that HEADS a line or list item,
// excluding spans that are themselves a question or a section label.
function optionsHeaded(reply) {
  const p = prose(reply)
  const hits = []
  for (const line of p.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:[-•*]|\d+[.)])?\s*\*\*([^*]{2,60})\*\*/)
    if (m) { const s = m[1].trim(); if (!/[?:]$/.test(s)) hits.push(s) }
  }
  return hits
}
const boldAll = (reply) => [...prose(reply).matchAll(/\*\*([^*]{2,60})\*\*/g)].map(m => m[1].trim())
const REFUSAL = /(ngoài|nằm ngoài|outside)[^.]{0,50}(chuyên môn|phạm vi|wheelhouse|scope)|specializ\w+ in|chỉ hỗ trợ|only (help|support|assist)|not general tech|không hỗ trợ tư vấn/i
const TRADEOFF = /\b(nhưng|tuy nhiên|đổi lại|bù lại|hạn chế|nhược điểm|đánh đổi|however|but |downside|drawback|trade-?off|although|though)\b/i
const PICK = /\b(mình nghiêng về|mình chọn|mình sẽ chọn|nếu.{0,40}mình (chọn|nghiêng)|lựa chọn tốt nhất là|my pick|i'?d (go with|pick|choose|lean)|best overall|i'?d recommend|my take)\b/i
const VI_LETTERS = /[ăâđêôơư]|[àáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rows = []

try {
  if (!original.includes(CLAUSE)) throw new Error('CLAUSE anchor not found — refusing to run an inert A/B')
  if (original.split(CLAUSE).length - 1 !== 1) throw new Error('CLAUSE anchor is not unique')

  for (const variant of ['A', 'B']) {
    writeFileSync(TARGET, variant === 'A' ? original : original.replace(CLAUSE, ''))
    await sleep(3000) // let next dev pick the change up
    for (const p of PROMPTS) for (let rep = 1; rep <= REPS; rep++) {
      await sleep(1500)
      let r
      try { r = await ask(p.text) } catch (e) { console.log(`${variant} ${p.id} ERROR ${e}`); continue }
      const row = {
        phase: PHASE, variant, rep, id: p.id, note: p.note, prompt: p.text,
        refused: REFUSAL.test(prose(r.text)),
        tools: r.tools, toolCalls: r.tools.length, llmCalls: r.steps,
        clarifications: clarifications(r.text),
        optionsHeaded: optionsHeaded(r.text), optionCount: optionsHeaded(r.text).length,
        boldAll: boldAll(r.text), boldCount: boldAll(r.text).length,
        tradeoff: TRADEOFF.test(prose(r.text)), pick: PICK.test(prose(r.text)),
        repliedVietnamese: VI_LETTERS.test(prose(r.text)),
        cta: r.text.includes('[CTA_BUTTONS]'),
        promptTokens: r.usage.promptTokens ?? 0, completionTokens: r.usage.completionTokens ?? 0,
        ms: r.ms, text: r.text,
      }
      rows.push(row)
      console.log(
        `${variant}${rep} ${p.id.padEnd(16)} refused=${row.refused ? 'YES' : '. '} ` +
        `tools=${JSON.stringify(r.tools).padEnd(20)} clar=${row.clarifications} ` +
        `opt=${row.optionCount} bold=${row.boldCount} trade=${row.tradeoff ? 'Y' : '.'} pick=${row.pick ? 'Y' : '.'} ` +
        `vi=${row.repliedVietnamese ? 'Y' : '.'} llm=${r.steps} out=${row.completionTokens} ${r.ms}ms`)
    }
  }
} finally {
  writeFileSync(TARGET, original)
  const back = hash(readFileSync(TARGET, 'utf8'))
  console.log(`\nrestored ${back} ${back === ORIG_HASH ? 'IDENTICAL ✅' : 'MISMATCH ❌ — RESTORE BY HAND'}`)
  writeFileSync(OUT, JSON.stringify(rows, null, 2))
  console.log(`wrote ${OUT} (${rows.length} rows)`)
}
