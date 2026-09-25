// merge-guard — a merge may not silently drop what one side brought in.
//
// Compares a merge RESULT with git's own AUTOMATIC merge of the same parents
// (`git merge-tree --write-tree`, i.e. what `git show --remerge-diff` shows) and fails when the
// result:
//   R1  removes a line git had merged CLEANLY (outside any conflict) that one side had added —
//       in any code file (docs / *.md / lockfiles excluded). The a6ca9f0 shape: the Android share
//       wiring merged without conflict and the resolution took the other file wholesale.
//   R2  deletes a whole file that one side had ADDED. The 1e7b77e shape: the review_likes privacy
//       migration and its DB test left with a "parked" feature.
//   R3  resolves a conflict against one side's added lines in a PROTECTED path (migrations, DB
//       tests, security / auth / RLS / quota / payment code, deterministic guards).
// A line that still appears anywhere in the result file is "moved", not lost.
//
// The only way past a finding is to SAY so in the merge message, one trailer per path:
//     Merge-Drop: <path or glob> — <reason>
// Waived findings are still printed, so a reviewer sees "this migration was dropped" in the log.
//
// Usage (local and CI; exits 1 on any unwaived finding):
//   node scripts/merge-guard/merge-guard.mjs --commit <sha>          one merge commit
//   node scripts/merge-guard/merge-guard.mjs --range <base>..<head>  every merge commit in a range
//   node scripts/merge-guard/merge-guard.mjs --staged                an in-progress merge (MERGE_HEAD),
//                                                                    before it is committed
//   add --message <file> with --staged to read the merge message (and its Merge-Drop trailers)
//   from <file> instead of MERGE_MSG — the commit-msg hook passes the message being committed.
//   add --json <file> to write the findings as JSON; --repo <dir> to point at another checkout.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { makeGit, parseAutoToResultDiff, parseDropTrailers, linesSet, isProtected, isIgnored, parseArgs } from './lib.mjs'

/**
 * Check one merge. `result` is a tree-ish of the proposed result; `parents` the merged commits;
 * `message` the merge message (for Merge-Drop trailers).
 */
export function checkMerge(git, { label, parents, result, message }) {
  if (parents.length !== 2) return { label, skipped: `octopus/non-merge (${parents.length} parents)`, findings: [], waived: [] }
  const base = git.strict(['merge-base', ...parents])?.trim() ?? null
  // First line of `merge-tree --write-tree` is the auto-merge tree (written even with conflicts,
  // conflicted files carrying their markers — exactly the remerge-diff baseline).
  const mt = git.ok(['merge-tree', '--write-tree', '--no-messages', ...parents]) ?? ''
  const autoTree = mt.split('\n')[0].trim()
  if (!/^[0-9a-f]{40}$/.test(autoTree)) throw new Error(`merge-tree failed for ${label}`)
  const diff = git.run(['diff', '--no-color', '--no-renames', autoTree, result])
  const cache = new Map()
  const lines = (rev, path) => {
    const k = `${rev}:${path}`
    if (!cache.has(k)) cache.set(k, linesSet(git.strict(['show', k])))
    return cache.get(k)
  }
  const trailers = parseDropTrailers(message)
  const findings = []
  for (const f of parseAutoToResultDiff(diff)) {
    if (isIgnored(f.path)) continue
    const inBase = base ? lines(base, f.path) : null
    const sides = parents.map(p => lines(p, f.path))
    if (f.deleted) {
      const addedBy = sides.map((s, i) => (s !== null && inBase === null ? i + 1 : 0)).filter(Boolean)
      if (addedBy.length) findings.push({ rule: 'R2', path: f.path, protected: isProtected(f.path), detail: `file added by parent ${addedBy.join('+')} is deleted in the result`, lines: [] })
      continue
    }
    const inResult = lines(result, f.path)
    const clean = [], conflict = []
    for (const [line, region] of f.removed) {
      if (inResult && inResult.has(line)) continue
      const bySide = sides.some(s => s && s.has(line) && !(inBase && inBase.has(line)))
      if (!bySide) continue
      ;(region === 'clean' ? clean : conflict).push(line)
    }
    if (clean.length) findings.push({ rule: 'R1', path: f.path, protected: isProtected(f.path), detail: `${clean.length} line(s) git merged cleanly were dropped`, lines: clean.slice(0, 3) })
    if (conflict.length && isProtected(f.path)) findings.push({ rule: 'R3', path: f.path, protected: true, detail: `${conflict.length} line(s) of one side's change lost in a protected-path conflict`, lines: conflict.slice(0, 3) })
  }
  const waived = [], open = []
  for (const x of findings) {
    const t = trailers.find(tr => tr.re.test(x.path))
    if (t) waived.push({ ...x, waivedBy: `Merge-Drop: ${t.glob} — ${t.reason}` })
    else open.push(x)
  }
  return { label, base: base?.slice(0, 7) ?? null, findings: open, waived }
}

function print(r) {
  if (r.skipped) { console.log(`• ${r.label}: skipped — ${r.skipped}`); return }
  const status = r.findings.length ? `✖ ${r.findings.length} finding(s)` : '✓ clean'
  console.log(`• ${r.label}: ${status}${r.waived.length ? `, ${r.waived.length} waived` : ''}`)
  const order = (x) => (x.protected ? 0 : 1)
  for (const x of [...r.findings].sort((a, b) => order(a) - order(b))) {
    console.log(`    ${x.rule}${x.protected ? ' [protected]' : ''}  ${x.path} — ${x.detail}`)
    for (const l of x.lines) console.log(`        − ${l.slice(0, 110)}`)
  }
  for (const x of r.waived) console.log(`    (waived) ${x.rule}  ${x.path} — ${x.waivedBy}`)
}

function main() {
  const args = parseArgs(process.argv.slice(2), { commit: '', range: '', staged: false, message: '', json: '', repo: process.cwd() })
  const git = makeGit(args.repo)
  const results = []
  if (args.staged) {
    const gitDir = git.run(['rev-parse', '--absolute-git-dir']).trim()
    const mh = join(gitDir, 'MERGE_HEAD')
    if (!existsSync(mh)) { console.log('merge-guard: no merge in progress (no MERGE_HEAD) — nothing to check'); return 0 }
    const theirs = readFileSync(mh, 'utf8').trim().split('\n')
    const tree = git.strict(['write-tree'])?.trim()
    if (!tree) { console.error('merge-guard: unresolved conflicts in the index — resolve them first, then re-run'); return 1 }
    const msgFile = args.message || join(gitDir, 'MERGE_MSG')
    results.push(checkMerge(git, { label: `staged merge of ${theirs.map(h => h.slice(0, 7)).join(',')} into HEAD`, parents: ['HEAD', ...theirs], result: tree, message: existsSync(msgFile) ? readFileSync(msgFile, 'utf8') : '' }))
  } else {
    const shas = args.commit ? [args.commit] : args.range ? git.run(['rev-list', '--merges', '--reverse', args.range]).trim().split('\n').filter(Boolean) : []
    if (!shas.length) { console.log(`merge-guard: no merge commits ${args.range ? `in ${args.range}` : '(pass --commit, --range or --staged)'}`); return args.range ? 0 : 2 }
    for (const sha of shas) {
      const [h, ...parents] = git.run(['rev-list', '--parents', '-n', '1', sha]).trim().split(' ')
      const subject = git.run(['log', '-1', '--format=%s', h]).trim()
      results.push(checkMerge(git, { label: `${h.slice(0, 7)} ${subject.slice(0, 70)}`, parents, result: `${h}^{tree}`, message: git.run(['log', '-1', '--format=%B', h]) }))
    }
  }
  console.log('merge-guard — a merge may not silently drop what one side brought in (docs/uat/MERGE-LOSS-AUDIT.md §4)')
  results.forEach(print)
  if (args.json) writeFileSync(args.json, JSON.stringify(results, null, 1))
  const open = results.reduce((n, r) => n + r.findings.length, 0)
  console.log(open ? `\n✖ ${open} unwaived finding(s). Restore the dropped change, or state it in the merge message: "Merge-Drop: <path> — <reason>".` : '\n✓ no unwaived findings')
  return open ? 1 : 0
}

if (/merge-guard.mjs$/.test(process.argv[1] ?? '')) {
  process.exit(main())
}
