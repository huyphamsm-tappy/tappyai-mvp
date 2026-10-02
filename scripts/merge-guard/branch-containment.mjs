// branch-containment — protected work may not sit on a side branch forever.
//
// The F-065 class: the 09-03 group read-boundary fix (a migration + two routes) lived on
// integration/v3-foundation, the branch was never merged, and three weeks later the shipping
// branch and production still had `groups` readable with the public anon key. No merge was
// ever wrong — there simply was no merge — so merge-guard cannot see it. This can.
//
// For every branch other than the shipping branch, every non-merge commit that is NOT on the
// shipping branch, OLDER than --days (default 7), NEWER than --since-days (default 60, so a
// long-dead branch is not re-reported forever), and that ADDS content to a PROTECTED path
// (migrations, DB boundary tests, security / auth / RLS / quota / payment code, guards) is
// reported — unless that content has reached the shipping branch anyway:
//   · same patch (patch-id of anything that landed on the shipping branch in the window), or
//   · the file exists on the shipping branch and at least --threshold (default 0.6) of the
//     commit's added, non-trivial lines are present in it — which also recognises a
//     cherry-pick with edits and a later re-implementation that kept the code.
// Deliberate exceptions go in scripts/merge-guard/containment-allow.json, each with a reason and
// an expiry date, so "parked" is a decision on the record with a deadline, not a silence.
//
// Usage (local and CI; exits 1 on any unallowed finding):
//   node scripts/merge-guard/branch-containment.mjs --ship <ref> [--days 7] [--since-days 60]
//        [--branches <regex>] [--remote-only] [--allow <file>] [--json <file>] [--repo <dir>]
//        [--now <ISO date>]   (evaluate as of a date — used to replay a past situation)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { makeGit, isProtected, isIgnored, trivialLine, linesSet, parseArgs } from './lib.mjs'

const DAY = 86_400_000

/**
 * @param {ReturnType<typeof makeGit>} git
 * @param {{ ship: string, days?: number, sinceDays?: number, threshold?: number, branches?: string | null, remoteOnly?: boolean, allow?: Array<{ branch: string, reason: string, until?: string }>, now?: number }} opts
 */
export function checkContainment(git, { ship, days = 7, sinceDays = 60, threshold = 0.6, branches: branchRe = null, remoteOnly = false, allow = [], now = Date.now() }) {
  const shipSha = git.run(['rev-parse', ship]).trim()
  const refs = git.run(['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes']).trim().split('\n').filter(Boolean)
    .filter(r => !r.endsWith('/HEAD'))
    .filter(r => !remoteOnly || r.startsWith('refs/remotes/'))
    .map(r => ({ ref: r, name: r.replace(/^refs\/(heads|remotes)\//, '') }))
    .filter(b => !branchRe || new RegExp(branchRe).test(b.name))
  const shipLines = new Map()
  const inShip = (path) => {
    if (!shipLines.has(path)) shipLines.set(path, linesSet(git.strict(['show', `${shipSha}:${path}`])))
    return shipLines.get(path)
  }
  // Only commits committed inside the window can be findings: older than `days`, newer than
  // `sinceDays`. Filtering by date AND by protected path BEFORE any patch work is what keeps a
  // run over every branch fast (a per-branch `git cherry` over long-diverged histories took >10 min).
  const since = new Date(now - sinceDays * DAY).toISOString()
  const until = new Date(now - days * DAY).toISOString()
  // Patch-ids of everything that landed on the shipping branch since the window opened — a
  // commit cherry-picked unchanged is "reached" even though it is not an ancestor.
  const patchId = (input) => execFileSync('git', ['-C', git.repo ?? '.', 'patch-id', '--stable'], { input, encoding: 'utf8', maxBuffer: 1 << 30 })
    .split('\n').filter(Boolean).map(l => l.split(' ')[0])
  const shipPatches = new Set(patchId(git.run(['log', '--no-merges', '-p', '--no-color', `--since=${since}`, shipSha])))
  const seenCommit = new Map() // a commit on several branches is judged once
  const results = []
  for (const b of refs) {
    const tip = git.run(['rev-parse', b.ref]).trim()
    if (tip === shipSha) continue
    const log = git.run(['log', '--no-merges', '--no-renames', '--name-status', '--format=@@%H%x00%ct%x00%s', `--since=${since}`, `--until=${until}`, `${shipSha}..${tip}`])
    const candidates = log.split('@@').slice(1).map(chunk => {
      const [head, ...rest] = chunk.split('\n')
      const [sha, ctime, subject] = head.split('\x00')
      const files = rest.map(l => l.split('\t')).filter(p => p.length >= 2 && p[0] !== 'D' && isProtected(p[1]) && !isIgnored(p[1])).map(p => p[1])
      return { sha, ctime: Number(ctime), subject: (subject ?? '').trim(), files }
    }).filter(x => x.files.length)
    const findings = []
    for (const cand of candidates) {
      const c = cand.sha
      if (!seenCommit.has(c)) {
        const subject = cand.subject
        const age = (now - cand.ctime * 1000) / DAY
        let verdict = null
        const samePatch = patchId(git.run(['show', '--no-color', c])).some(p => shipPatches.has(p))
        if (!samePatch && age >= days && age <= sinceDays) {
          const files = cand.files
          const missing = []
          for (const path of files) {
            const added = git.run(['diff', '--no-color', '--unified=0', `${c}^`, c, '--', path]).split('\n')
              .filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1).trim()).filter(l => !trivialLine(l))
            if (added.length === 0) continue
            const have = inShip(path)
            const present = have ? added.filter(l => have.has(l)).length / added.length : 0
            if (present < threshold) missing.push({ path, addedLines: added.length, presentOnShip: Math.round(present * 100) / 100, fileOnShip: have !== null })
          }
          if (missing.length) verdict = { commit: c.slice(0, 7), subject, ageDays: Math.floor(age), files: missing }
        }
        seenCommit.set(c, verdict)
      }
      const v = seenCommit.get(c)
      if (v) findings.push(v)
    }
    if (!findings.length) continue
    const a = allow.find(x => new RegExp(x.branch).test(b.name) && (!x.until || Date.parse(x.until) >= now))
    results.push({ branch: b.name, findings, allowedBy: a ? `${a.reason} (until ${a.until ?? 'no expiry'})` : null })
  }
  return results
}

function main() {
  const args = parseArgs(process.argv.slice(2), { ship: '', days: '7', 'since-days': '60', threshold: '0.6', branches: '', 'remote-only': false, allow: 'scripts/merge-guard/containment-allow.json', json: '', repo: process.cwd(), now: '' })
  if (!args.ship) { console.error('branch-containment: --ship <ref> is required (the shipping branch, e.g. origin/rc/web-uat)'); return 2 }
  const git = makeGit(args.repo)
  const allowPath = args.allow && existsSync(args.allow) ? args.allow : null
  const allow = allowPath ? JSON.parse(readFileSync(allowPath, 'utf8')).allow ?? [] : []
  const now = args.now ? Date.parse(args.now) : Date.now()
  const results = checkContainment(git, { ship: args.ship, days: Number(args.days), sinceDays: Number(args['since-days']), threshold: Number(args.threshold), branches: args.branches || null, remoteOnly: args['remote-only'], allow, now })
  console.log(`branch-containment — protected work older than ${args.days} day(s) that has not reached ${args.ship} (docs/uat/MERGE-LOSS-AUDIT.md §4)`)
  if (args.now) console.log(`(evaluated as of ${new Date(now).toISOString().slice(0, 10)})`)
  for (const r of results) {
    console.log(`\n${r.allowedBy ? '○' : '✖'} ${r.branch}${r.allowedBy ? `  — allowed: ${r.allowedBy}` : ''}`)
    for (const f of r.findings) {
      console.log(`    ${f.commit} (${f.ageDays}d) ${f.subject.slice(0, 90)}`)
      for (const p of f.files) console.log(`        ${p.path}  — ${p.fileOnShip ? `${Math.round(p.presentOnShip * 100)}% of ${p.addedLines} added lines on ship` : `file absent on ship (${p.addedLines} added lines)`}`)
    }
  }
  if (args.json) writeFileSync(args.json, JSON.stringify(results, null, 1))
  const open = results.filter(r => !r.allowedBy)
  console.log(open.length ? `\n✖ ${open.length} branch(es) hold protected work that has not reached ${args.ship}. Merge it, or record the decision in ${args.allow} (reason + until).` : '\n✓ nothing protected is stranded')
  return open.length ? 1 : 0
}

if (/branch-containment\.mjs$/.test(process.argv[1] ?? '')) {
  process.exit(main())
}
