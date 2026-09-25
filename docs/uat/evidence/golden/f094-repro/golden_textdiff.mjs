import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
const G = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard/docs/uat/evidence/golden/'
const load = (d, f) => existsSync(G + d + '/' + f) ? JSON.parse(readFileSync(G + d + '/' + f, 'utf8')) : null
const urls = t => [...new Set(t.match(/https?:\/\/[^\s"'<>()\[\]]+/g) ?? [])]
const host = u => { try { return new URL(u).host } catch { return '?' } }
const cta = t => { const m = t.match(/\[CTA_BUTTONS\]([\s\S]*?)(\[\/CTA_BUTTONS\]|$)/); try { return (JSON.parse(m[1].trim()).buttons ?? []).length } catch { return m ? -1 : 0 } }
const prose = t => t.replace(/\[CTA_BUTTONS\][\s\S]*?(\[\/CTA_BUTTONS\]|$)/g, '').replace(/\[PLAN_[A-Z_]+\][\s\S]*?\[\/PLAN_[A-Z_]+\]/g, '')
const money = t => (prose(t).match(/\d[\d.,]*\s*(k|K|nghìn|ngàn|triệu|tr\b|VND|VNĐ|đ|₫)/g) ?? []).length
const voi = t => (prose(t).match(/(^|[.!?]\s+|\n\s*[-*]?\s*)(Với|với)\s/g) ?? []).length
const artefacts = t => {
  const p = prose(t), out = []
  for (const line of p.split('\n')) {
    const l = line.trim()
    if (/^[-*•]\s*$/.test(l) || /^\*\*\s*\*\*$/.test(l) || /^[:,;.]/.test(l) || /\(\s*\)|\[\s*\]\(\s*\)|\s[,.;:](\s|$)|:\s*$(?![\s\S])/.test(l) && !/^\*\*.*\*\*:?$/.test(l) && !/:$/.test(l)) out.push(l.slice(0, 90))
    if (/\s{2,}\S/.test(line.replace(/^\s+/, '')) ) out.push('double-space: ' + l.slice(0, 80))
  }
  return out
}
const cases = readdirSync(G + 'post-egress-f086').filter(f => /^[A-Z]\d.*\.json$/.test(f))
const rows = []
for (const f of cases) {
  const post = load('post-egress-f086', f)
  const pre = f === 'B4.json' ? load('prelaunch-after-B4', f) : load('prelaunch-after', f)
  post.turns.forEach((pt, i) => {
    const bt = pre?.turns?.[i]
    const a = bt?.text ?? '', b = pt.text ?? ''
    rows.push({
      case: f.replace('.json', '') + ' t' + (i + 1),
      urls: `${urls(a).length}→${urls(b).length}`, hostsPost: [...new Set(urls(b).map(host))].join(','), hostsLost: [...new Set(urls(a).map(host))].filter(h => !urls(b).map(host).includes(h)).join(','),
      cta: `${cta(a)}→${cta(b)}`, money: `${money(a)}→${money(b)}`, voi: `${voi(a)}→${voi(b)}`, chars: `${a.length}→${b.length}`,
      artefactsPost: artefacts(b),
    })
  })
}
const lines = rows.map(r => `${r.case.padEnd(8)} urls ${r.urls.padEnd(6)} cta ${r.cta.padEnd(5)} money ${r.money.padEnd(6)} với ${r.voi.padEnd(5)} chars ${r.chars.padEnd(11)} ${r.hostsLost ? 'LOST:' + r.hostsLost : ''}${r.artefactsPost.length ? '\n         artefacts: ' + JSON.stringify(r.artefactsPost) : ''}`)
console.log(lines.join('\n'))
writeFileSync(G + 'textdiff-prelaunch-after-vs-post-egress-f086.txt', lines.join('\n') + '\n')
