// PHIÊN LUNA — side-by-side plan page (owner 30/09). Collects every plan turn from labelled replay out dirs and writes
// one self-contained HTML page: per case, each model's reply (prose + the [TAPPY_PLAN] days), auto checks, time, $,
// reasoning tokens, and the numbers/venues the plan states that no tool result or user message contains.
//   node scripts/consult/luna/planPage.mjs <out.html> <label>=<outDir>[,<outDir>…] …  [--verdicts <json>]
// --verdicts: {"<label>|<conv>": {"pass": true, "fab": 0, "note": "…"}} — the hand classification, shown on each card.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const outFile = args.shift()
let verdicts = {}
const vi = args.indexOf('--verdicts')
if (vi >= 0) { verdicts = JSON.parse(readFileSync(args[vi + 1], 'utf8')); args.splice(vi, 2) }
// --only <ids>: the owner's exact test set (older Haiku runs also hold R11 / R15-2..5, which are not in it).
let only = null
const oi = args.indexOf('--only')
if (oi >= 0) { only = new Set(args[oi + 1].split(',')); args.splice(oi, 2) }
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const digits = s => String(s).replace(/[^\d]/g, '')

const runs = [] // {label, conv, area, runIdx, ...}
for (const spec of args) {
  const [label, dirs] = spec.split('=')
  // each dir: <path>[@ID+ID…][#runIndex] — a per-dir case filter and the run index the verdict keys use
  dirs.split(',').forEach((dirSpec, pos) => {
    const m = /^(.*?)(?:@([^#]+))?(?:#(\d+))?$/.exec(dirSpec)
    const dir = m[1], dirOnly = m[2] ? new Set(m[2].split('+')) : null, runIdx = m[3] != null ? Number(m[3]) : pos
    const res = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'))
    for (const r of res.rows ?? res) {
      const isPlan = r.server?.turnType === 'plan' || /kế hoạch chi tiết|lịch trình chi tiết/i.test(r.sent)
      if (!isPlan || (only && !only.has(r.conv)) || (dirOnly && !dirOnly.has(r.conv))) continue
      // The owner's set is the plan TURN (the last turn of each planHard case); a first message that says "lên kế hoạch"
      // is the consult opener, not the detailed plan.
      if (r.conv.match(/^(R\d|E1-|DN-)/) && r.turnIndex !== Math.max(...(res.rows ?? res).filter(x => x.conv === r.conv).map(x => x.turnIndex))) continue
      const rawF = join(dir, 'raw', `${r.conv}-t${r.turnIndex}.json`)
      let ev = ''
      for (let t = 1; t <= r.turnIndex; t++) { const f = join(dir, 'raw', `${r.conv}-t${t}.json`); if (existsSync(f)) { const j = JSON.parse(readFileSync(f, 'utf8')); ev += ' ' + j.sent + ' ' + JSON.stringify(j.parsed?.tools ?? []) } }
      ev = fold(ev)
      const raw = existsSync(rawF) ? JSON.parse(readFileSync(rawF, 'utf8')) : {}
      const usage = (raw.logEvents ?? []).filter(e => e.type === 'tappyai_usage').at(-1) ?? {}
      const text = String(r.reply ?? '')
      const m = /\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/.exec(text)
      let plan = null; if (m) { try { plan = JSON.parse(m[1]) } catch { /* bad */ } }
      const prose = text.replace(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS)\][\s\S]*?\[\/\1\]/g, ' ').replace(/\[FOLLOWUPS\][^\n]*/g, '').trim()
      const unsourced = []
      const scan = s => {
        for (const mm of s.replace(/\(https?:[^)]*\)/g, '').matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?\s?(?:k|tr|triệu|nghìn))\s*(?:đ|₫|vnd)?/gi)) { const d = digits(mm[1]); if (d.length >= 2 && !ev.includes(d) && !ev.includes(d.replace(/000$/, ''))) unsourced.push(mm[0].trim()) }
        for (const mm of s.matchAll(/\b(\d{1,2}[:h]\d{2})\b/g)) if (!ev.includes(mm[1].replace('h', ':')) && !ev.includes(mm[1])) unsourced.push(mm[1])
      }
      scan(prose)
      if (plan) for (const d of plan.days ?? []) for (const it of d.items ?? []) {
        if (it.name && it.category !== 'transport' && !ev.includes(fold(it.name).slice(0, 18))) unsourced.push(`địa điểm: ${it.name}`)
        scan(`${it.price ?? ''} ${it.description ?? ''}`)
      }
      runs.push({
        label, runIdx, conv: r.conv, area: r.area, turn: r.turnIndex, sent: r.sent, pass: r.pass,
        failed: (r.checks ?? []).filter(c => !c.pass && !c.info).map(c => c.id),
        ms: r.ms, ttua: usage.ttuaMs ?? null, usd: r.usd ?? 0, model: r.cost?.model ?? '', reasoning: r.cost?.reasoningTokens ?? 0, fellBack: !!r.cost?.fellBack,
        prose, plan, unsourced: [...new Set(unsourced)], verdict: verdicts[`${label}|${r.conv}`] ?? verdicts[`${label}|${r.conv}|${runIdx}`] ?? null,
      })
    }
  })
}
const labels = [...new Set(runs.map(r => r.label))]
const NAMES = { Haiku: 'Haiku 4.5', LunaMed: 'Luna — du lịch medium · khác none', LunaLow: 'Luna — du lịch low', LunaFinal: 'Luna CUỐI (sau 3 sửa code) — du lịch low · khác none' }
const data = JSON.stringify({ labels, names: NAMES, runs, at: new Date().toISOString() }).replace(/</g, '\\u003c')

const html = `<title>Plan Side-by-Side</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root{--bg:#f6f5f1;--panel:#fffefb;--fg:#1d1f1c;--mute:#6b6d66;--line:#e2e0d8;--accent:#0f6b5c;--pass:#1f7a3f;--passbg:#e5f3e8;--fail:#a4331f;--failbg:#f8e5df;--warn:#8a5a00;--warnbg:#fbf0d6;--chip:#eeece5}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141614;--panel:#1c1f1c;--fg:#e8e8e2;--mute:#9a9d94;--line:#2d312d;--accent:#58c2ad;--pass:#6fd08f;--passbg:#1d3324;--fail:#f08a73;--failbg:#3a221c;--warn:#e7b85a;--warnbg:#342a14;--chip:#262a26;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#141614;--panel:#1c1f1c;--fg:#e8e8e2;--mute:#9a9d94;--line:#2d312d;--accent:#58c2ad;--pass:#6fd08f;--passbg:#1d3324;--fail:#f08a73;--failbg:#3a221c;--warn:#e7b85a;--warnbg:#342a14;--chip:#262a26;color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font:14px/1.55 "Be Vietnam Pro",system-ui,sans-serif;margin:0;padding-inline:16px;padding-block:24px 48px}
.wrap{max-width:1500px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
h1{font-size:22px;margin:0;text-wrap:balance}
.sub{color:var(--mute);margin:4px 0 0}
.num{font-family:"JetBrains Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
table.sum{border-collapse:collapse;width:100%;background:var(--panel);border:1px solid var(--line)}
.scroll{overflow-x:auto}
table.sum th,table.sum td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
table.sum th:first-child,table.sum td:first-child{text-align:left}
table.sum th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:600}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.bar button{font:inherit;border:1px solid var(--line);background:var(--panel);color:var(--fg);padding:5px 12px;border-radius:999px;cursor:pointer}
.bar button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--bg)}
.case{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px}
.case h2{font-size:15px;margin:0;display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}
.case h2 .ask{font-weight:400;color:var(--mute)}
.cols{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.col{min-width:0;border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px}
.col h3{margin:0;font-size:13px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{background:var(--chip);border-radius:4px;padding:1px 7px;font-size:12px}
.p{background:var(--passbg);color:var(--pass)} .f{background:var(--failbg);color:var(--fail)} .w{background:var(--warnbg);color:var(--warn)}
.prose{white-space:pre-wrap;font-size:13px;max-height:340px;overflow:auto;border-top:1px dashed var(--line);padding-top:8px}
.days{font-size:13px;display:flex;flex-direction:column;gap:6px}
.days b{color:var(--accent)}
.days ul{margin:2px 0 0;padding-left:18px}
.uns{font-size:12px;color:var(--warn)}
.note{font-size:12px;color:var(--mute)}
details summary{cursor:pointer;color:var(--mute);font-size:12px}
</style>
<div class="wrap">
  <header><h1>Kế hoạch chi tiết — Haiku và Luna, cạnh nhau</h1>
  <p class="sub">Mỗi ô là một lượt "Lên kế hoạch chi tiết" trong replay. Tiền/giờ/địa điểm màu vàng: kế hoạch nêu mà không có trong kết quả tìm kiếm hay lời người dùng — đọc tay để xếp bịa hay không. <span class="num" id="at"></span></p></header>
  <section class="scroll"><table class="sum" id="sum"></table></section>
  <div class="bar" id="filters"></div>
  <main id="cases" style="display:flex;flex-direction:column;gap:14px"></main>
</div>
<script id="d" type="application/json">${data}</script>
<script>
const D=JSON.parse(document.getElementById('d').textContent);document.getElementById('at').textContent='· '+D.at.slice(0,16).replace('T',' ')+'Z'
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
const fmt$=v=>'$'+v.toFixed(4)
// summary
const S=document.getElementById('sum')
const rowsFor=l=>D.runs.filter(r=>r.label===l)
const pct=(a,n)=>n?Math.round(100*a/n)+'%':'–'
const p50=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0}
S.innerHTML='<tr><th>mô hình</th><th>kế hoạch</th><th>đạt (tự động)</th><th>đạt (đọc tay)</th><th>có số/địa điểm không nguồn</th><th>bịa (đọc tay)</th><th>$ / kế hoạch</th><th>$ / kế hoạch ĐẠT</th><th>thời gian p50</th><th>tối đa</th><th>rơi về Haiku</th></tr>'+D.labels.map(l=>{const r=rowsFor(l),n=r.length,auto=r.filter(x=>x.pass).length,hv=r.filter(x=>x.verdict),hand=hv.filter(x=>x.verdict.pass).length,fab=hv.reduce((s,x)=>s+(x.verdict.fab||0),0),usd=r.reduce((s,x)=>s+x.usd,0),passN=hv.length?hand:auto
return '<tr><td><b>'+esc(D.names[l]||l)+'</b></td><td class=num>'+n+'</td><td class=num>'+auto+' ('+pct(auto,n)+')</td><td class=num>'+(hv.length?hand+'/'+hv.length:'–')+'</td><td class=num>'+r.filter(x=>x.unsourced.length).length+'</td><td class=num>'+(hv.length?fab:'–')+'</td><td class=num>'+fmt$(usd/Math.max(1,n))+'</td><td class=num>'+(passN?fmt$(usd/passN):'–')+'</td><td class=num>'+(p50(r.map(x=>x.ms))/1000).toFixed(1)+' s</td><td class=num>'+(Math.max(0,...r.map(x=>x.ms))/1000).toFixed(1)+' s</td><td class=num>'+r.filter(x=>x.fellBack).length+'</td></tr>'}).join('')
// filters
const areas=['tất cả',...new Set(D.runs.map(r=>r.area))];let cur='tất cả'
const F=document.getElementById('filters')
function drawF(){F.innerHTML=areas.map(a=>'<button aria-pressed="'+(a===cur)+'" data-a="'+esc(a)+'">'+esc(a)+'</button>').join('')}
F.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;cur=b.dataset.a;drawF();draw()})
function planHtml(p){if(!p)return '';return '<div class=days>'+(p.days||[]).map(d=>'<div><b>'+esc(d.title||('Ngày '+(d.day??'')))+'</b><ul>'+(d.items||[]).map(it=>'<li>'+(it.time?'<span class=num>'+esc(it.time)+'</span> ':'')+esc(it.name||'')+(it.price?' · <span class=num>'+esc(it.price)+'</span>':'')+(it.description?' — <span class=note>'+esc(it.description)+'</span>':'')+'</li>').join('')+'</ul></div>').join('')+'</div>'}
function card(r){const v=r.verdict
return '<div class=col><h3><span>'+esc(D.names[r.label]||r.label)+(r.runIdx?' #'+(r.runIdx+1):'')+'</span><span class=chips><span class="chip '+(r.pass?'p':'f')+'">'+(r.pass?'đạt tự động':'trượt: '+esc(r.failed.join(', ')))+'</span>'+(v?'<span class="chip '+(v.pass?'p':'f')+'">tay: '+(v.pass?'đạt':'trượt')+(v.fab?' · bịa '+v.fab:'')+'</span>':'')+'</span></h3>'+
'<div class="chips num"><span class=chip>'+(r.ms/1000).toFixed(1)+' s</span><span class=chip>'+fmt$(r.usd)+'</span>'+(r.reasoning?'<span class=chip>suy luận '+r.reasoning+'</span>':'')+'<span class=chip>'+esc(r.model)+'</span>'+(r.fellBack?'<span class="chip w">rơi về Haiku</span>':'')+'</div>'+
(v&&v.note?'<div class=note>'+esc(v.note)+'</div>':'')+
(r.unsourced.length?'<div class=uns>không nguồn: '+r.unsourced.map(esc).join(' · ')+'</div>':'')+
planHtml(r.plan)+'<details '+(r.plan?'':'open')+'><summary>lời trả lời</summary><div class=prose>'+esc(r.prose)+'</div></details></div>'}
function draw(){const byCase={};for(const r of D.runs){if(cur!=='tất cả'&&r.area!==cur)continue;(byCase[r.conv]??=[]).push(r)}
document.getElementById('cases').innerHTML=Object.entries(byCase).map(([c,rs])=>'<section class=case><h2>'+esc(c)+' <span class=chip>'+esc(rs[0].area)+'</span><span class=ask>“'+esc(rs[0].sent)+'”</span></h2><div class=cols>'+D.labels.flatMap(l=>rs.filter(r=>r.label===l)).map(card).join('')+'</div></section>').join('')}
drawF();draw()
</script>`
writeFileSync(outFile, html)
console.log(`wrote ${outFile}: ${runs.length} plan turns, labels ${labels.join(', ')}`)
