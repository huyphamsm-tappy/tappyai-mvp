// V3 Phase 3 — security mutations. Every guard must have a mutation that DIES.
//
// 🚨 WHY THIS REPLACED scripts/p3-mutation.sh.
// The bash version drove `perl -0pi -e "s/…/…/"` and checked nothing about the
// anchor. When the P3-F4/F5 work refactored `streamEnrichment.ts`, three of its
// anchors stopped matching — and a substitution that matches nothing is a no-op,
// so the suite passed and the harness reported "NOT DETECTED" for guards that
// were in fact working perfectly. A mutation harness that can silently stop
// mutating is worse than none: it reports a security regression that is not
// real, and would just as happily report a pass for a protection that had been
// deleted.
//
// So: plain string replacement (no regex, no shell escaping), and every anchor
// asserted to occur EXACTLY ONCE before it is used. A stale anchor is now a
// loud ANCHOR! line, not a false verdict.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ROOT = process.env.TAPPY_ROOT
  || 'C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/v3-integration'

const RATE = ROOT + '/src/lib/security/rateLimit.ts'
const STREAM = ROOT + '/src/lib/ai/streamEnrichment.ts'
const CONTENT = ROOT + '/src/lib/explore/contentProcessor.ts'

const IP_TEST = 'src/lib/security/__tests__/clientIpTrust.test.ts'
const IMG_TEST = 'src/lib/ai/security/imageEgressBoundary.test.ts'
const CONTENT_TEST = 'src/lib/explore/contentProcessorBoundary.test.ts'

const MUTATIONS = [
  // ── P3-F1 · request identity ─────────────────────────────────────────────
  {
    id: 'M1', what: 'clientIp trusts the leftmost x-forwarded-for again',
    file: RATE, test: IP_TEST,
    from: '  const platform =\r\n    normalizeIpAddress(req.headers.get(\'x-vercel-forwarded-for\')) ??',
    to: '  const platform =\r\n    normalizeIpAddress((req.headers.get(\'x-forwarded-for\')||\'\').split(\',\')[0]) ??',
  },
  {
    id: 'M2', what: 'clientIp skips IP validation (a hostile string reaches INET)',
    file: RATE, test: IP_TEST,
    from: 'const nearest = normalizeIpAddress(hops[hops.length - 1])',
    to: 'const nearest = hops[hops.length - 1]',
  },
  {
    id: 'M3', what: 'the client hop is preferred over the platform header',
    file: RATE, test: IP_TEST,
    from: "normalizeIpAddress(req.headers.get('x-vercel-forwarded-for'))",
    to: "normalizeIpAddress((req.headers.get('x-forwarded-for')||'').split(',')[0])",
  },

  // ── P3-F2 · image egress ─────────────────────────────────────────────────
  {
    id: 'M4', what: 'the buffered path stops stripping un-owned images',
    file: STREAM, test: IMG_TEST,
    from: 'stripUnownedLinks(stripUnownedImages(withoutTikTok, owned), allowedUrls)',
    to: 'stripUnownedLinks(withoutTikTok, allowedUrls)',
  },
  {
    id: 'M5', what: 'the ownership oracle always says owned',
    file: STREAM, test: IMG_TEST,
    from: 'isOwnedImageUrl(url, owned) ? whole : alt',
    to: 'whole',
  },
  {
    id: 'M6', what: 'the live gate becomes a pass-through',
    file: STREAM, test: IMG_TEST,
    from: '  allowedUrls?: ReadonlySet<string>,\r\n): string {\r\n  if (!endOfStream) {',
    to: '  allowedUrls?: ReadonlySet<string>,\r\n): string {\r\n  if (1) return text;\r\n  if (!endOfStream) {',
  },
  {
    id: 'M7', what: 'an unterminated image token is released instead of dropped',
    file: STREAM, test: IMG_TEST,
    from: 'if (endOfStream || stripped.length - open <= FORMING_IMAGE_LIMIT) return stripped.slice(0, open)',
    to: 'if (false) return stripped.slice(0, open)',
  },

  // ── P3-F3 · content processor ────────────────────────────────────────────
  {
    id: 'M8', what: 'contentProcessor stops fencing',
    file: CONTENT, test: CONTENT_TEST,
    from: "fenceUntrusted('explore_content', value.slice(0, limit))",
    to: 'value.slice(0, limit)',
  },
  {
    id: 'M9', what: 'contentProcessor stops capping input length',
    file: CONTENT, test: CONTENT_TEST,
    from: "fenceUntrusted('explore_content', value.slice(0, limit))",
    to: "fenceUntrusted('explore_content', value)",
  },
  {
    id: 'M10', what: 'the category validator accepts anything',
    file: CONTENT, test: CONTENT_TEST,
    from: "typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)",
    to: "typeof value === 'string'",
  },
]

let killed = 0
let survived = 0
let stale = 0

for (const m of MUTATIONS) {
  const original = readFileSync(m.file, 'utf8')
  const occurrences = original.split(m.from).length - 1
  if (occurrences !== 1) {
    console.log(`ANCHOR!   ${m.id} anchor occurs ${occurrences}x, expected 1 — NOT RUN, fix the anchor`)
    stale++
    continue
  }

  writeFileSync(m.file, original.split(m.from).join(m.to))
  try {
    execSync(`npx vitest run ${m.test}`, { cwd: ROOT, stdio: 'ignore' })
    console.log(`SURVIVED  ${m.id} ${m.what}`)
    survived++
  } catch {
    console.log(`KILLED    ${m.id} ${m.what}`)
    killed++
  } finally {
    writeFileSync(m.file, original)
  }
}

console.log(`\nkilled=${killed} survived=${survived} stale=${stale} of ${MUTATIONS.length}`)
process.exit(survived === 0 && stale === 0 ? 0 : 1)
