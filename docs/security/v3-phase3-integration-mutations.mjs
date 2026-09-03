// V3 Phase 3 — INTEGRATION pass: the invariant Phase 1 satisfies by construction.
//
// Phase 1 added `renderNeedBrief`, the first prompt block in this codebase built
// FROM the user's conversation that is NOT fenced. That is correct: it prints
// constants selected by the user's text (SUBJECTS, PLACES, CUISINES, the label
// tables) plus two numbers, never the text itself.
//
// But nothing HELD that construction in place. The fence architecture guard
// (fenceBoundary.test.ts) checks that every declared LABEL has a producer — it
// cannot see a producer that declares no label, which is exactly what needBrief
// is. So the two realistic drifts below would have shipped silently.
//
// Plain string replacement, not regex: the anchors contain backslashes and
// braces, and every layer of shell/regex escaping between here and the file is
// a chance to write a mutation that quietly matches nothing and reports a false
// pass. Each anchor is asserted UNIQUE before it is used.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ROOT = process.env.TAPPY_ROOT
  || 'C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/v3-integration'

const NEED_PROFILE = ROOT + '/src/lib/ai/consultative/needProfile.ts'
const STREAM = ROOT + '/src/lib/ai/streamEnrichment.ts'
const TEST = 'src/lib/ai/security/needBriefBoundary.test.ts'
const LINK_TEST = 'src/lib/ai/security/linkEgressBoundary.test.ts'

const MUTATIONS = [
  {
    id: 'MI01',
    what: 'the district reader captures words instead of digits',
    file: NEED_PROFILE,
    from: 't.match(/\\bquan\\s+(\\d{1,2})\\b/)',
    to: 't.match(/\\bquan\\s+(\\w{1,30})\\b/)',
  },
  {
    id: 'MI02',
    what: "the location keeps the user's own words instead of the matched place",
    file: NEED_PROFILE,
    from: 'p.location.text = place',
    to: 'p.location.text = t',
  },

  // ── P3-F4 · the link egress boundary ──────────────────────────────────────
  //
  // Two directions, and BOTH have to be detected. Removing the filter lets an
  // invented URL out; removing the allow-set deletes every legitimate link in
  // the product. A test that only noticed the first would let a "fix" ship that
  // silently broke booking links.
  {
    id: 'MI03',
    what: 'the link filter becomes a pass-through',
    file: STREAM,
    from: 'if (!allowed) return text',
    to: 'if (true) return text',
    test: LINK_TEST,
  },
  {
    id: 'MI04',
    what: 'every markdown link is treated as owned',
    file: STREAM,
    from: '(allowed.has(normalizeUrl(url)) ? whole : label)',
    to: '(whole)',
    test: LINK_TEST,
  },
  {
    id: 'MI05',
    what: 'bare URLs stop being checked (drop the brackets, bypass the guard)',
    file: STREAM,
    from: 'return allowed.has(normalizeUrl(bare)) ? url : trailing',
    to: 'return url',
    test: LINK_TEST,
  },
  {
    id: 'MI06',
    what: 'tool-result URLs are never harvested (legitimate links would vanish)',
    file: STREAM,
    from: 'for (const u of extractUrls(line)) allowUrl(u)',
    to: 'void 0',
    test: LINK_TEST,
  },
  {
    id: 'MI07',
    what: 'already-published URLs are forgotten (a repeated link would vanish)',
    file: STREAM,
    from: 'for (const prior of publishedHistory) for (const u of extractUrls(prior)) allowUrl(u)',
    to: 'void 0',
    test: LINK_TEST,
  },
  {
    id: 'MI08',
    what: 'the live gate stops holding a half-arrived token',
    file: STREAM,
    from: 'function formingStart(text: string): number {',
    to: 'function formingStart(text: string): number { if (1) return -1;',
    test: LINK_TEST,
  },

  // ── P3-F5 · the CTA button block ──────────────────────────────────────────
  {
    id: 'MI09',
    what: 'any host is accepted for a CTA button',
    file: STREAM,
    from: "return CTA_ALLOWED_HOSTS.some(a => host === a || host.endsWith('.' + a))",
    to: 'return true',
    test: LINK_TEST,
  },
  {
    id: 'MI10',
    what: 'the CTA button policy becomes a pass-through',
    file: STREAM,
    from: 'function guardCtaButtons(text: string, allowed: ReadonlySet<string>): string {',
    to: 'function guardCtaButtons(text: string, allowed: ReadonlySet<string>): string { if (1) return text;',
    test: LINK_TEST,
  },
  {
    id: 'MI11',
    what: 'prose rules run over structured blocks too (deletes every button url)',
    file: STREAM,
    from: '  const cut = earliestMarker(text)\r\n  const prose = text.slice(0, cut)',
    to: '  const cut = text.length\r\n  const prose = text.slice(0, cut)',
    test: LINK_TEST,
  },
  {
    id: 'MI12',
    what: 'the plan-link policy becomes a pass-through (the other structured channel)',
    file: STREAM,
    from: 'function guardPlanLinks(text: string, allowed: ReadonlySet<string>): string {',
    to: 'function guardPlanLinks(text: string, allowed: ReadonlySet<string>): string { if (1) return text;',
    test: LINK_TEST,
  },

  // ── C-1 · disconnect must revoke, not just forget ─────────────────────────
  {
    id: 'MI13',
    what: 'revocation becomes a no-op (the grant survives the disconnect)',
    file: ROOT + '/src/lib/integrations/googleCalendar.ts',
    from: '  if (typeof token !== \'string\' || token.length === 0) return false',
    to: '  if (true) return false',
    test: 'src/lib/integrations/tokenRevocation.test.ts',
  },
  {
    id: 'MI14',
    what: 'the token is sent in the URL, where every proxy log would capture it',
    file: ROOT + '/src/lib/integrations/googleCalendar.ts',
    from: "    const res = await fetchImpl(GOOGLE_REVOKE_ENDPOINT, {",
    to: "    const res = await fetchImpl(GOOGLE_REVOKE_ENDPOINT + '?token=' + token, {",
    test: 'src/lib/integrations/tokenRevocation.test.ts',
  },
  {
    id: 'MI15',
    what: 'the route goes back to deleting the row without revoking',
    file: ROOT + '/src/app/api/integrations/google-calendar/route.ts',
    from: '    const revoked = await revokeGoogleToken(existing?.refresh_token ?? existing?.access_token)',
    to: '    const revoked = true',
    test: 'src/app/api/integrations/google-calendar/disconnectRevokes.test.ts',
  },
]

let killed = 0
let survived = 0

for (const m of MUTATIONS) {
  const original = readFileSync(m.file, 'utf8')

  const occurrences = original.split(m.from).length - 1
  if (occurrences !== 1) {
    console.log(`ANCHOR!   ${m.id} anchor appears ${occurrences} times, expected exactly 1 — not run`)
    survived++
    continue
  }

  writeFileSync(m.file, original.split(m.from).join(m.to))
  try {
    execSync(`npx vitest run ${m.test ?? TEST}`, { cwd: ROOT, stdio: 'ignore' })
    console.log(`SURVIVED  ${m.id} ${m.what}`)
    survived++
  } catch {
    console.log(`KILLED    ${m.id} ${m.what}`)
    killed++
  } finally {
    writeFileSync(m.file, original)
  }
}

console.log(`\nkilled=${killed} survived=${survived} of ${MUTATIONS.length}`)
process.exit(survived === 0 ? 0 : 1)
