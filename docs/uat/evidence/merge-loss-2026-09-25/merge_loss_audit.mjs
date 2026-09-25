// Systematic merge-loss audit. For every merge commit M reachable from the shipping branch since a
// date, compare the AUTOMATIC re-merge of M's parents (`git show --remerge-diff`) with M itself.
// A line that the auto-merge contained but M does not is a candidate LOSS. It is kept only when:
//   - it is real content (not a conflict marker / blank / lone brace), and
//   - it appears NOWHERE in M's version of that file (a moved line is not lost), and
//   - it is a CHANGE one side made: present in that parent's file and absent from the merge base
//     (base content removed by the resolution is reported as `base`).
// Each loss is tagged by REGION: 'clean' = git had merged it without conflict and the merge commit
// dropped it anyway (an "evil merge" loss — the a6ca9f0 planJson shape); 'conflict' = one half of
// a conflict the resolution chose against (may be a legitimate supersede).
// Then: is it back at the audited tip (anywhere in the tree, so a later move still counts)?
// Read-only: only `git show` / `git log` / `git merge-base` / `git grep`.
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const [repo, tip, since, outDir] = process.argv.slice(2)
const git = (args, opts = {}) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 30, ...opts })
const gitOk = (args) => { try { return git(args, { stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }

const merges = git(['log', '--merges', `--since=${since}`, '--format=%H %P', tip]).trim().split('\n').filter(Boolean)
  .map(l => { const [h, ...p] = l.split(' '); return { h, parents: p } })

const MARKER = /^(<<<<<<<|=======|>>>>>>>|\|\|\|\|\|\|\|)( |$)/
const trivial = (s) => s.length < 6 || /^[\s{}()[\];,]*$/.test(s) || /^(\/\/|\*|#|--)\s*$/.test(s)
const fileLines = new Map()
const linesOf = (rev, path) => {
  const k = rev + ':' + path
  if (!fileLines.has(k)) {
    const t = gitOk(['show', `${rev}:${path}`])
    fileLines.set(k, t === null ? null : new Set(t.split('\n').map(s => s.trim())))
  }
  return fileLines.get(k)
}

const PRIORITY = [
  ['security', /(^|\/)security\/|rls|polic|boundary|egress|fence|clientIp|rateLimit|addressPolicy|getRequestUser|admin\/permissions|rbac/i],
  ['migration', /^supabase\/migrations\//],
  ['db-test', /^supabase\/tests\//],
  ['auth', /(^|\/)auth\/|login|register|age-?check|ageGate|session|anonymous/i],
  ['quota', /quota|chatCaps/i],
  ['payment', /stripe|subscription|billing|checkout|payment|affiliate|commerce|(^|\/)ccp\//i],
  ['guard', /Guard\.ts$|guard\.ts$|streamEnrichment|moneyGuard|placeClaim|provenance|constraint|riskBackstop/i],
]
const classify = (path) => (PRIORITY.find(([, re]) => re.test(path)) ?? ['other'])[0]

const results = []
for (const m of merges) {
  const base = gitOk(['merge-base', ...m.parents])?.trim() ?? null
  const raw = git(['show', '--remerge-diff', '--format=', '--no-color', '--no-renames', m.h])
  const sections = raw.split(/^diff --git /m).slice(1)
  const files = []
  for (const sec of sections) {
    const pathMatch = sec.match(/^a\/(.+?) b\/(.+?)\n/)
    if (!pathMatch) continue
    const path = pathMatch[2]
    const conflicted = /^remerge CONFLICT/m.test(sec)
    const regionOf = new Map()
    let inConflict = false
    for (const l of sec.split('\n')) {
      if (l.length === 0) continue
      const body = l.slice(1)
      if (/^<<<<<<< /.test(body)) { inConflict = true; continue }
      if (/^>>>>>>> /.test(body)) { inConflict = false; continue }
      if (l[0] !== '-' || l.startsWith('---') || MARKER.test(body)) continue
      const t = body.trim()
      if (trivial(t)) continue
      const prev = regionOf.get(t)
      regionOf.set(t, prev === 'clean' || !inConflict ? 'clean' : 'conflict')
    }
    if (regionOf.size === 0) continue
    const inM = linesOf(m.h, path)
    const inBase = base ? linesOf(base, path) : null
    const sides = m.parents.map(p => linesOf(p, path))
    const lost = []
    for (const [l, region] of regionOf) {
      if (inM && inM.has(l)) continue
      const bySide = sides.map((s, i) => (s && s.has(l) && !(inBase && inBase.has(l)) ? i + 1 : 0)).filter(Boolean)
      const kind = bySide.length ? `side${bySide.join('+')}` : (inBase && inBase.has(l) ? 'base' : 'unknown')
      if (kind === 'unknown') continue
      lost.push({ line: l, kind, region })
    }
    if (lost.length === 0) continue
    files.push({ path, category: classify(path), conflicted, deletedInM: inM === null, lost })
  }
  results.push({ merge: m.h.slice(0, 7), parents: m.parents.map(p => p.slice(0, 7)), base: base?.slice(0, 7) ?? null, subject: git(['log', '-1', '--format=%s', m.h]).trim(), files })
}

const tmp = mkdtempSync(join(tmpdir(), 'mla-'))
const allLost = [...new Set(results.flatMap(r => r.files.flatMap(f => f.lost.map(x => x.line))))]
const present = new Set()
const CHUNK = 400
for (let i = 0; i < allLost.length; i += CHUNK) {
  const pf = join(tmp, `p${i}.txt`)
  writeFileSync(pf, allLost.slice(i, i + CHUNK).join('\n') + '\n')
  // `git grep <tree>` prefixes every hit with "<tree>:<path>:" (and -h does not remove the tree
  // part), so the prefix is stripped by matching a known pattern line inside the hit rather than by
  // cutting at the first ':' — content with ':' in it (URLs, ternaries, object literals) was being
  // mis-cut and reported as missing. A hit counts for a pattern when the hit's text, after the
  // "<tree>:<path>:" prefix, equals the pattern once both are trimmed.
  // Live code only: `docs/` holds PARKED copies of dropped work (e.g. docs/audit/overnight/stepC/
  // profile-v2-notmerged/*.txt), and counting those as "present" hid the review_likes loss.
  const out = gitOk(['grep', '-F', '-f', pf, tip, '--', '.', ':(exclude)docs/**', ':(exclude)**/*.notmerged']) ?? ''
  const prefix = new RegExp('^' + tip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[^:]*:')
  const lines = new Set(out.split('\n').map(s => s.replace(prefix, '').trim()))
  for (const l of allLost.slice(i, i + CHUNK)) if (lines.has(l)) present.add(l)
}
for (const r of results) for (const f of r.files) {
  for (const x of f.lost) x.atTip = present.has(x.line)
  f.lostCount = f.lost.length
  f.missingAtTip = f.lost.filter(x => !x.atTip).length
  f.cleanMissingAtTip = f.lost.filter(x => !x.atTip && x.region === 'clean').length
}

writeFileSync(join(outDir, 'merge-loss-audit.json'), JSON.stringify({ repo, tip, since, merges: results }, null, 1))
const tsv = ['merge\tfile\tcategory\tconflicted\tdeleted_in_merge\tlost_lines\tmissing_at_tip\tclean_region_missing\tkinds\tsample_missing']
for (const r of results) for (const f of r.files) {
  const kinds = [...new Set(f.lost.map(x => x.kind))].join(',')
  const sample = f.lost.filter(x => !x.atTip).sort((a, b) => (a.region === 'clean' ? -1 : 1) - (b.region === 'clean' ? -1 : 1)).slice(0, 2).map(x => x.line.slice(0, 90).replace(/\t/g, ' ')).join(' ‖ ')
  tsv.push([r.merge, f.path, f.category, f.conflicted ? 'y' : 'n', f.deletedInM ? 'y' : 'n', f.lostCount, f.missingAtTip, f.cleanMissingAtTip, kinds, sample].join('\t'))
}
writeFileSync(join(outDir, 'merge-loss-audit.tsv'), tsv.join('\n') + '\n')
for (const r of results) {
  const sum = (k) => r.files.reduce((n, f) => n + f[k], 0)
  console.log(`${r.merge}  files=${r.files.length}  lost=${sum('lostCount')}  missing_at_tip=${sum('missingAtTip')}  clean_region_missing=${sum('cleanMissingAtTip')}  ${r.subject.slice(0, 80)}`)
}
