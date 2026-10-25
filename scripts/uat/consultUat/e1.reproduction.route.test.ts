// @vitest-environment node
// Investigation E1 (baseline stopped at the first turn) · REPRODUCTION through the same path the launcher runs: the REAL chat route, the REAL AI layer
// (OpenAI adapter, fallback wrapper, metered model), the REAL spend gate and request cap, and the REAL launcher core (runLiveTrial: its fetch wrapper, allow-list,
// ledger and summary), with the environment of the Owner's baseline (extension mode, 1.75 / 0.05, L1 15, L2 450, CONSULT_REQUEST_CAP=1, CONSULTATIVE_V1=1, CONSULT_V2=1).
// The ONLY simulated thing is the network: api.openai.com answers HTTP 401 "Incorrect API key provided" (what the real run logged); google.serper.dev answers normally.
// MOCK ONLY: no key, no real host, no model. The question text is written for this test; it is not from the acceptance set or the extension set.
//
// What it pins: the E1 signature is produced by a rejected OpenAI key and by nothing in the request cap, the Serper wiring or the route; every other symptom
// (cost NaN, 5 refused paid calls, 3 blocked hosts, the stream error, the 176-character fallback answer) is a deterministic consequence. And two perimeter fixes
// found on the way: the summary now NAMES a provider credential rejection, and the redaction masks the key fragment OpenAI echoes in that very message.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { searchPlaces } from '@/lib/ai/tools/food'
import { __resetRequestCap, createRequestCapTurn, runWithRequestCapTurn } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests, redactSecrets } from './liveRunner'
import { formatSummary, runLiveTrial, type TrialSummary } from './liveTrial'
import { memFs } from './liveRunner.testkit'
import { GuardSpendGate } from './spendGateAdapter'
import { redactText } from './liveTrialLauncher.mjs'
import type { UatTurn } from './questions'

const h = vi.hoisted(() => {
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      update: () => b, delete: () => b, then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  const evidence = new Map<string, unknown>()
  const rpc = (fn: string, args: { p_id?: string; p_evidence?: unknown }) => {
    if (fn === 'decision_evidence_save' && args?.p_id) { evidence.set(args.p_id, JSON.parse(JSON.stringify(args.p_evidence ?? null))); return Promise.resolve({ data: null, error: null }) }
    if (fn === 'decision_evidence_load' && args?.p_id) return Promise.resolve({ data: evidence.get(args.p_id) ?? null, error: null })
    return Promise.resolve({ data: null, error: null })
  }
  return { client: { from: () => builder(), rpc } }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000e1001' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

// A masked fragment in the shape OpenAI echoes it: first four and last four characters of what was typed. Synthetic — not any real key, and not the shape of one.
const ECHOED = 'key_abcd********wxyz'
const net = { openai: [] as string[], serper: [] as string[], osm: [] as string[], other: [] as string[] }
const reached: string[] = []
const apiError = (status: number, message: string) => new Response(JSON.stringify({ error: { message, type: 'invalid_request_error', code: 'invalid_api_key' } }), { status, headers: { 'content-type': 'application/json' } })
const fakeNetwork = (async (input: unknown) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  reached.push(u.hostname + u.pathname)
  if (u.hostname === 'api.openai.com') { net.openai.push(u.pathname); return apiError(401, `Incorrect API key provided: ${ECHOED}. You can find your API key at https://platform.openai.com/account/api-keys.`) }
  if (u.hostname === 'google.serper.dev') { net.serper.push(u.pathname); return new Response(JSON.stringify({ organic: [], places: [], credits: 1 }), { status: 200 }) }
  // Option B: in the extension mode (this environment) the wrapper lets the three OSM fallback hosts through, so the fake network answers them like an empty-but-valid OSM
  if (u.hostname === 'nominatim.openstreetmap.org') { net.osm.push(u.hostname); return new Response(JSON.stringify([{ lat: '10.73', lon: '106.72' }]), { status: 200 }) }
  if (u.hostname === 'overpass-api.de' || u.hostname === 'maps.mail.ru') { net.osm.push(u.hostname); return new Response(JSON.stringify({ elements: [] }), { status: 200 }) }
  net.other.push(u.href); throw new Error('UNEXPECTED host: ' + u.hostname)
}) as typeof fetch

/** What the run sends to the three OSM fallback hosts once the extension mode lets them through (the tool's own fallback, run twice: district, then city). */
const OSM_COUNTS_E1 = { 'nominatim.openstreetmap.org': 1, 'overpass-api.de': 2, 'maps.mail.ru': 0 } // one geocode (the second run reuses it), two Overpass queries, the mirror is not needed

let POST: (req: never) => Promise<Response>
beforeAll(async () => { ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) }, 120_000)
const OWNER_ENV: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-closure2/investigation-e1/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap()
  net.openai.length = 0; net.serper.length = 0; net.osm.length = 0; net.other.length = 0; reached.length = 0
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) vi.stubEnv(k, undefined)
  for (const [k, v] of Object.entries(OWNER_ENV)) vi.stubEnv(k, v)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

const TURNS: UatTurn[] = [
  { id: 'R1', conversation: 'R1', turn: 1, text: 'Tối nay quận 7 có rạp nào chiếu phim hành động sau 20:00 không? Nêu rạp, giờ chiếu và giá vé.' },
  { id: 'R2', conversation: 'R2', turn: 1, text: 'Giá vàng SJC hôm nay thế nào?' },
]
/** One run of the real path with the console silenced; every paid-call decision of the spend gate is recorded in order. */
async function reproduce(): Promise<{ summary: TrialSummary; decisions: string[]; lines: string[]; resultText: string; resultJson: string }> {
  const lines: string[] = []
  const decisions: string[] = []
  const origReserve = GuardSpendGate.prototype.reserve
  vi.spyOn(GuardSpendGate.prototype, 'reserve').mockImplementation(function (this: InstanceType<typeof GuardSpendGate>, label: string, maxUsd: number, detail?: unknown) {
    try { const r = origReserve.call(this, label, maxUsd, detail as never); decisions.push(`${label}: granted`); return r } catch (e) { decisions.push(`${label}: REFUSED (${(e as { reason?: string }).reason})`); throw e }
  })
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ').slice(0, 400)) }))
  const fs = memFs()
  let out
  try { out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: fakeNetwork, fs, repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: TURNS, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('the run was refused: ' + JSON.stringify(out.reasons))
  const resultFile = [...fs.files.entries()].find(([p]) => /bench-\d+\.json$/.test(p))
  return { summary: out.summary, decisions, lines, resultText: [...fs.files.values()].join('\n'), resultJson: resultFile ? resultFile[1] : '' }
}

describe('E1 reproduction: the baseline stop is produced by a rejected OpenAI key (HTTP 401) on the FIRST call, and by nothing else', () => {
  // OPTION B CHANGED TWO ASSERTIONS HERE, and only these (explained, nothing weakened): before it, the extension-mode wrapper blocked the three OSM hosts, so this test pinned
  // `hostRequests = {openai: 1}`, `hostsBlocked = [3 hosts]` and `reached = [openai]`. Now the extension mode lets those three exact endpoints through (they are free, counted per
  // host), so the same run SENDS them: hostsBlocked is empty, the OSM counts are pinned exactly, and `reached` is the exact sequence. Every other assertion (the 401, NaN, the 5
  // refusals and their order, 176 characters, cap 0/0, no Serper request) is unchanged. The old blocked-in-this-mode behaviour is pinned for every non-extension mode in liveTrial.hostb.test.ts.
  it('the observed signature is reproduced exactly: stop at the first turn, cost NaN, 5 paid calls refused, stream error, 176-character fallback answer; OpenAI once, no Serper, the OSM fallback counted per host', async () => {
    const { summary: s, decisions } = await reproduce()
    expect(s.turnsRun).toBe(1)
    expect(s.stopped).toBe('invalid-cost at R1: reported cost NaN could not be reconciled')
    expect(s.turnOk).toBe(false); expect(s.runValid).toBe(false); expect(s.benchmarkEligible).toBe(false); expect(s.trialClean).toBe(false)
    expect(s.costState).toBe('unknown'); expect(s.usd).toBeNull()
    expect(s.refusals).toBe(5)
    expect(s.tools).toEqual(['search_places'])
    expect(s.hostRequests).toEqual({ 'api.openai.com': 1, 'nominatim.openstreetmap.org': 1, 'overpass-api.de': 2 }) // a host that was not asked has no entry here (its 0 is in osmRequests)
    expect(s.hostsBlocked).toEqual([])
    expect(s.osmRequests).toEqual(OSM_COUNTS_E1)
    expect(s.problems.join(' | ')).toContain('R1: degraded: 5 paid call(s) refused by the gate')
    expect(s.problems.join(' | ')).toContain('R1: stream errors: An error occurred.')
    expect(s.problems.join(' | ')).toContain('the cost book is not fully accounted')
    expect(s.answerChars).toBe(176)
    expect(net.openai).toEqual(['/v1/chat/completions']) // exactly one OpenAI request
    expect(net.serper).toEqual([]) // Serper was not even asked
    expect(net.other).toEqual([]) // and nothing outside the allow-list reached the network
    expect(reached.every(r => r.startsWith('api.openai.com/') || /^(nominatim\.openstreetmap\.org|overpass-api\.de|maps\.mail\.ru)\//.test(r))).toBe(true)
    // the gate's decisions, in order: the first paid call is granted and fails with the 401 (cost unknown → the run is blocked); every later one is refused as `blocked`
    expect(decisions).toEqual([
      'llm:intent: granted',
      'llm:intent:retry: REFUSED (blocked)',
      'serper:maps: REFUSED (blocked)',
      'serper:maps: REFUSED (blocked)',
      'llm:consult: REFUSED (blocked)',
      'llm:consult:retry: REFUSED (blocked)',
    ])
  })

  it('the Serper refusals were the SPEND GATE (run blocked: cost-unknown), NOT the request cap: the turn object existed, the cap let both through and refused nothing', async () => {
    const { summary: s, lines } = await reproduce()
    expect(s.requestCap).toEqual({ perTurnLimit: 15, runLimit: 450, sent: 0, refused: 0 }) // reserved, then given back when the gate said no: sent 0, refused 0
    const capLog = lines.filter(l => l.includes('tappyai_serper_request_cap'))
    expect(capLog.filter(l => l.includes('"refused":true'))).toEqual([]) // no per-request cap refusal line at all
    expect(capLog.some(l => l.includes('tappyai_serper_request_cap_turn') && l.includes('"limit":15') && l.includes('"sent":0') && l.includes('"refused":0'))).toBe(true) // the turn object was created with L1 = 15
    expect(lines.filter(l => l.includes('"tappyai_spend_gate"') && l.includes('"endpoint":"maps"') && l.includes('"reason":"blocked"'))).toHaveLength(2)
  })

  it('the cost is NaN on purpose: a turn whose cost is unknown is reported as NaN so that the run stops (liveRunner.ts), and the unknown cost is the 401 call (an open reservation, never counted as 0)', async () => {
    const { summary: s, resultJson } = await reproduce()
    expect(s.costState).toBe('unknown')
    const result = JSON.parse(resultJson)
    expect(result.report.stopped.reason).toBe('invalid-cost')
    expect(result.openReservations[0].reservations).toEqual([expect.objectContaining({ label: 'llm:intent', state: 'unknown' })])
    expect(result.turns[0].llmCalls[0]).toEqual(expect.objectContaining({ role: 'intent', usd: null, state: 'unknown' }))
  })

  it('the OSM hosts were asked by search_places itself (its own fallback when the Serper search returns nothing), not by the benchmark; in the extension mode the wrapper now lets them through and COUNTS them', async () => {
    const { summary: s, lines } = await reproduce()
    expect(lines.filter(l => l.includes('osm_fallback_used'))).toHaveLength(2) // the tool ran its OSM fallback twice (the route searches the district, then the city)
    expect(s.hostsBlocked).toEqual([])
    expect(s.osmRequests).toEqual(OSM_COUNTS_E1)
    expect(net.osm.length).toBe(Object.values(OSM_COUNTS_E1).reduce((a, b) => a + b, 0)) // what the fake network saw is exactly what the summary counted
    expect(s.requestCap).toEqual({ perTurnLimit: 15, runLimit: 450, sent: 0, refused: 0 }) // free hosts: nothing for the cap to count
    expect(s.serperRequests).toBe(0)
  })
})

describe('E1 fix 1 — the summary NAMES a rejected credential instead of leaving only "reported cost NaN"', () => {
  it('HTTP 401 from api.openai.com is listed in the summary (host + status only; no body, no key) and makes the trial NOT CLEAN', async () => {
    const { summary: s } = await reproduce()
    expect(s.providerRejections).toEqual([{ host: 'api.openai.com', status: 401 }])
    expect(s.warnings.join(' | ')).toContain('api.openai.com answered HTTP 401: the provider rejected the credentials')
    const text = formatSummary(s)
    expect(text).toContain('api.openai.com answered HTTP 401: the provider rejected the credentials')
    expect(text).not.toContain(ECHOED)
    expect(text).not.toContain('sk-test-not-a-real-key')
  })
  it('a run with no rejection lists none (the field is always present)', async () => {
    // the rejection list is part of the shape for every run; this one has its OpenAI answers replaced by a plain 500 (not a credential problem)
    const net500 = (async (input: unknown) => { const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url); if (u.hostname === 'api.openai.com') return apiError(500, 'server error'); return new Response('{}', { status: 200 }) }) as typeof fetch
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation(() => undefined))
    let out
    try { out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: net500, fs: memFs(), repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: TURNS.slice(0, 1), afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
    expect(out.kind).toBe('ran')
    if (out.kind === 'ran') { expect(out.summary.providerRejections).toEqual([]); expect(out.summary.warnings.join(' ')).not.toContain('rejected the credentials') }
  })
})

describe('E1 fix 2 — the key fragment OpenAI echoes in "Incorrect API key provided: …" is masked in every saved or printed text', () => {
  const MESSAGE = `{"type":"tappyai_llm_fallback","reason":"Incorrect API key provided: ${ECHOED}. You can find your API key at https://platform.openai.com/account/api-keys.","ms":1025}`
  it('the benchmark redaction masks the fragment (any shape, not only sk-…) and keeps the rest of the sentence', () => {
    const out = redactSecrets(MESSAGE, {})
    expect(out).not.toContain(ECHOED); expect(out).not.toContain('abcd'); expect(out).not.toContain('wxyz')
    expect(out).toContain('Incorrect API key provided: ***')
    expect(out).toContain('You can find your API key')
  })
  it('the launcher redaction (the redacted copy of the child output) masks it too', () => {
    const out = redactText(MESSAGE, {})
    expect(out).not.toContain(ECHOED); expect(out).not.toContain('abcd'); expect(out).not.toContain('wxyz')
    expect(out).toContain('Incorrect API key provided: ***')
  })
  it('both still mask the exact keys and sk-shaped text as before, and leave unrelated text alone', () => {
    const env = { OPENAI_API_KEY: 'sk-test-SECRET-123456', SERPER_API_KEY: 'serper-SECRET-456789' }
    for (const f of [(t: string) => redactSecrets(t, env), (t: string) => redactText(t, env)]) {
      const out = f('a sk-test-SECRET-123456 b serper-SECRET-456789 c sk-abcdef123456 d plain text')
      expect(out).not.toContain('SECRET'); expect(out).not.toContain('abcdef123456'); expect(out).toContain('plain text')
    }
  })
  it('end to end in the reproduction: the result file written by the run carries no fragment of what the provider echoed', async () => {
    const { resultText, lines } = await reproduce()
    expect(resultText).not.toContain(ECHOED); expect(resultText).not.toContain('wxyz')
    expect(lines.join('\n')).toContain('Incorrect API key provided') // the message itself is still visible (that is the diagnosis)…
  })
})

describe('2b control: the OSM hosts are the tool\'s OWN fallback when Serper /maps returns nothing — reached with HEALTHY keys, outside the cap and the spend gate', () => {
  it('Serper answers 200 with no places → searchPlaces asks nominatim, overpass-api.de and then the maps.mail.ru mirror; the request cap counts only the Serper request', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', '')
    vi.stubEnv('BENCH_SPEND_GATE', undefined) // the spend gate plays no part in this control (it is about which hosts the tool asks)
    const hosts: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
      hosts.push(u.hostname)
      if (u.hostname === 'google.serper.dev') return new Response(JSON.stringify({ places: [], organic: [], credits: 3 }), { status: 200 })
      if (u.hostname === 'nominatim.openstreetmap.org') return new Response(JSON.stringify([{ lat: '10.73', lon: '106.72' }]), { status: 200 })
      if (u.hostname === 'overpass-api.de') return new Response('upstream error', { status: 504 })
      return new Response(JSON.stringify({ elements: [] }), { status: 200 })
    }))
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')].map(s => s.mockImplementation(() => undefined))
    const turn = createRequestCapTurn()!
    try { await runWithRequestCapTurn(turn, () => searchPlaces('xem phim', 'khu vuc thu nghiem', 'attraction', 'vi', null)) } finally { spies.forEach(s => s.mockRestore()) }
    expect(hosts).toContain('google.serper.dev')
    expect(hosts).toContain('nominatim.openstreetmap.org')
    expect(hosts).toContain('overpass-api.de')
    expect(hosts).toContain('maps.mail.ru')
    expect(turn.sent).toBe(1) // only the Serper /maps request is counted
  })
})
