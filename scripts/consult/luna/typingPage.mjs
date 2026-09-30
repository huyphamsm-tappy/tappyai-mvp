// PHIÊN LUNA — side-by-side page for the everyday-typing suite (owner 30/09).
//   node scripts/consult/luna/typingPage.mjs <out.html> "Haiku=<dir>" "Luna none=<dir>" "Luna low=<dir>"
// One row per turn: the original sentence, the typed variant, each configuration's reply (markers stripped, pass/fail,
// understood intent), and an empty "ChatGPT Go" box the owner pastes into (kept in the viewer's own browser only).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [outFile, ...cfgArgs] = process.argv.slice(2)
const cfgs = cfgArgs.map(a => { const i = a.indexOf('='); return { name: a.slice(0, i), dir: a.slice(i + 1) } })
const pairs = []
{
  let conv = null, n = 0
  for (const raw of readFileSync('docs/uat/luna-real-typing.txt', 'utf8').split(/\r?\n/)) {
    const head = /^#\s*([A-Z]+-\d+)\s*$/.exec(raw.trim())
    if (head) { conv = head[1]; n = 0; continue }
    if (!raw.trim() || raw.trim().startsWith('#') || !conv) continue
    const [orig, variant] = raw.split('|').map(s => s.trim())
    pairs.push({ conv, turn: ++n, orig, variant })
  }
}
const strip = t => String(t ?? '')
  .replace(/\[TAPPY_ASK\]([\s\S]*?)\[\/TAPPY_ASK\]/g, (_m, j) => { try { return JSON.parse(j).questions.map(q => `• ${q.q} (${q.options.join(' / ')})`).join('\n') } catch { return '' } })
  .replace(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS)\][\s\S]*?\[\/\1\]/g, '').replace(/\[FOLLOWUPS\][^\n]*/g, '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\(https?:[^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '(link)')
  .replace(/\n{3,}/g, '\n\n').trim()
const data = pairs.map(p => ({
  ...p,
  cols: cfgs.map(c => {
    const res = JSON.parse(readFileSync(join(c.dir, 'results.json'), 'utf8'))
    const row = (res.rows ?? res).find(r => r.conv === p.conv && r.turnIndex === p.turn)
    let decision = null
    try { decision = JSON.parse(readFileSync(join(c.dir, 'raw', `${p.conv}-t${p.turn}.json`), 'utf8')).logEvents.filter(e => e.type === 'tappyai_consult_decision').at(-1) ?? null } catch { /* none */ }
    return { name: c.name, reply: strip(row?.reply), pass: !!row?.pass, failed: (row?.checks ?? []).filter(x => !x.pass && !x.info).map(x => x.id), turnType: row?.server?.turnType ?? null, decision: decision ? { turn: decision.turn, domains: decision.domains, known: decision.known } : null }
  }),
}))

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
const html = `<title>Bộ gõ đời thường</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
/* Layout: one card per turn — the two inputs on top, then the answers side by side (stacked on phones). */
:root { --bg:#f5f6f4; --panel:#ffffff; --fg:#1d2320; --muted:#5d6862; --line:#d9dfdb; --accent:#146c5b; --ok:#1c7a43; --bad:#b3372c; --chip:#e8efeb;
  --ui:"IBM Plex Sans", system-ui, sans-serif; --mono:"IBM Plex Mono", ui-monospace, monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#141816; --panel:#1c211f; --fg:#e4e9e6; --muted:#9aa6a0; --line:#2f3733; --accent:#5fc4ad; --ok:#5ccf8a; --bad:#f08a80; --chip:#25302b; color-scheme: dark } }
:root[data-theme="dark"] { --bg:#141816; --panel:#1c211f; --fg:#e4e9e6; --muted:#9aa6a0; --line:#2f3733; --accent:#5fc4ad; --ok:#5ccf8a; --bad:#f08a80; --chip:#25302b; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 14px/1.5 var(--ui); }
main { max-width: 1400px; margin: 0 auto; padding-block: 24px 64px; padding-inline: 16px; display: grid; gap: 16px; }
h1 { font-size: 1.5rem; margin: 0; text-wrap: balance; }
.lede { color: var(--muted); margin: 0; max-width: 70ch; }
.turn { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; display: grid; gap: 12px; }
.head { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: baseline; }
.id { font: 600 12px var(--mono); letter-spacing: .04em; color: var(--accent); }
.inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
.inputs div { min-width: 0; } .label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.variant { font-family: var(--mono); }
.cols { display: grid; grid-template-columns: repeat(${cfgs.length + 1}, minmax(0, 1fr)); gap: 12px; }
.col { min-width: 0; border-top: 2px solid var(--line); padding-top: 8px; display: grid; gap: 6px; align-content: start; }
.col h3 { margin: 0; font-size: 13px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pill { font: 600 11px var(--mono); padding: 1px 6px; border-radius: 99px; background: var(--chip); }
.pill.ok { color: var(--ok); } .pill.bad { color: var(--bad); }
.reply { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
.intent { font: 12px var(--mono); color: var(--muted); overflow-wrap: anywhere; }
textarea { width: 100%; min-height: 160px; box-sizing: border-box; font: 13px/1.5 var(--ui); color: var(--fg); background: var(--bg); border: 1px dashed var(--line); border-radius: 6px; padding: 8px; }
textarea:focus-visible { outline: 2px solid var(--accent); }
@media (max-width: 900px) { .cols, .inputs { grid-template-columns: 1fr; } }
</style>
<main>
  <h1>Bộ gõ đời thường — Haiku, Luna và ChatGPT Go</h1>
  <p class="lede">Mỗi thẻ là một lượt: câu gốc, câu gõ kiểu đời thường đã gửi, và câu trả lời của từng cấu hình. Dán câu trả lời ChatGPT Go vào cột cuối — nội dung chỉ lưu trong trình duyệt của anh.</p>
  ${data.map((p, i) => `<section class="turn">
    <div class="head"><span class="id">${esc(p.conv)} · lượt ${p.turn}</span></div>
    <div class="inputs"><div><div class="label">Câu gốc</div>${esc(p.orig)}</div><div><div class="label">Đã gửi (gõ đời thường)</div><span class="variant">${esc(p.variant)}</span></div></div>
    <div class="cols">
      ${p.cols.map(c => `<div class="col"><h3>${esc(c.name)} <span class="pill ${c.pass ? 'ok' : 'bad'}">${c.pass ? 'đạt' : 'trượt'}</span>${c.turnType ? `<span class="pill">${esc(c.turnType)}</span>` : ''}</h3>
        ${c.failed.length ? `<div class="intent">trượt: ${esc(c.failed.join(', '))}</div>` : ''}
        ${c.decision ? `<div class="intent">hiểu: ${esc(c.decision.domains.join('+') || '—')} · ${esc(Object.entries(c.decision.known).map(([k, v]) => `${k}=${v}`).join('; ') || '—')}</div>` : ''}
        <p class="reply">${esc(c.reply || '(không có câu trả lời)')}</p></div>`).join('')}
      <div class="col"><h3>ChatGPT Go</h3><label class="label" for="go-${i}">Dán câu trả lời</label><textarea id="go-${i}" data-key="go-${esc(p.conv)}-${p.turn}"></textarea></div>
    </div>
  </section>`).join('\n  ')}
</main>
<script>
for (const t of document.querySelectorAll('textarea[data-key]')) {
  try { t.value = localStorage.getItem(t.dataset.key) ?? '' } catch {}
  t.addEventListener('input', () => { try { localStorage.setItem(t.dataset.key, t.value) } catch {} })
}
</script>
`
writeFileSync(outFile, html)
console.log(`wrote ${outFile}: ${data.length} turns × ${cfgs.length} configurations`)
