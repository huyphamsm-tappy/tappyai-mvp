/**
 * PHASE 1 AUDIT — controlled DEV baseline runner (NOT EXECUTED in Phase 1).
 *
 * Written so the baseline can be run the moment the safety requirements in
 * docs/audit/consultative-audit-phase1.md §K are satisfied. It was NOT run:
 * the only local environment available points at the production Supabase
 * project and the production KV quota store (see the report), and this runner
 * refuses to start against them.
 *
 * What it does when allowed:
 *   - POSTs each query to <AUDIT_BASE_URL>/api/chat exactly as the web client
 *     does (same body shape; optional x-tappy-surface header; optional
 *     userLocation for the location-dependent queries), using a DEDICATED
 *     test-user bearer token supplied via env — never the owner account.
 *   - Parses the AI-SDK data stream (0: text, 9: tool call, a: tool result,
 *     e: step finish, d: finish, 8: annotation) and records tool order/count.
 *   - Runs each primary query twice; context-dependent queries (#1, #5, #7)
 *     get ONE real setup turn per run through the same pipeline.
 *   - Hard-caps TOTAL LLM/search runs at 36 (setup + primary). No retries.
 *   - Sanitizes: no headers, tokens, cookies, or env values are written.
 *
 * Env:
 *   AUDIT_BASE_URL                 e.g. http://localhost:3000
 *   AUDIT_SUPABASE_REF             the Supabase project ref the server is using
 *   AUDIT_CONFIRMED_NONPROD_REF    must EQUAL AUDIT_SUPABASE_REF and must NOT be
 *                                  the production ref; typed by a human as the
 *                                  isolation attestation
 *   AUDIT_TEST_USER_BEARER         dedicated test user's access token (optional;
 *                                  without it the guest path runs — 5 lifetime cap)
 *   AUDIT_SURFACE                  'web' to send x-tappy-surface: web (default: unset)
 *   AUDIT_DRY_RUN=1                print the plan and exit without any request
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PRODUCTION_SUPABASE_REF = 'fwznnobrdctuskgrvuik' // named as production in docs/backoffice/phase-reports/ANALYTICS_STEP2_ENV_VERIFICATION.md
const TOTAL_RUN_CAP = 36
const D1 = { lat: 10.7769, lng: 106.7009, address: 'District 1, Ho Chi Minh City, Vietnam' }

const QUERIES = [
  { id: 1, text: 'Quán này mở cửa mấy giờ?', setup: 'Tìm cho tôi một quán Nhật yên tĩnh ở Quận 1.' },
  { id: 2, text: 'Tìm cho tôi một quán Nhật ngon và yên tĩnh.' },
  { id: 3, text: 'Tìm quán ăn tối dưới 500k cho 2 người, yên tĩnh.' },
  { id: 4, text: 'Cuối tuần đi đâu được?' },
  { id: 5, text: 'So sánh 3 quán này.', setup: 'Cho tôi 3 quán cafe đẹp ở Thảo Điền.' },
  { id: 6, text: 'Cho tôi 5 quán cafe đẹp ở Thảo Điền.' },
  { id: 7, text: 'Có chỗ nào rẻ hơn không?', setup: 'Tìm nhà hàng tầm 300-500k/người ở Quận 1.' },
  { id: 8, text: 'Tôi đang ở đây, tìm chỗ ăn gần tôi.', location: D1 },
  { id: 9, text: 'Tìm giúp tôi một quán cafe gần Landmark 81.' },
  { id: 10, text: 'Find me a quiet Japanese restaurant nearby.', location: D1 },
  { id: 11, text: 'Find giúp tôi một quán cafe chill gần đây.', location: D1 },
  { id: 12, text: 'Tìm cho tôi một chiếc tai nghe tốt dưới 2 triệu.' },
  { id: 13, text: 'Cuối tuần này tôi muốn đi Đà Lạt, gợi ý giúp tôi.' },
  { id: 14, text: 'Tối nay ở TP.HCM có gì vui?' },
  { id: 15, text: 'Tìm cho tôi một spa thư giãn, sạch sẽ, giá hợp lý.' },
]

function refuse(msg) {
  console.error('AUDIT RUNNER REFUSED: ' + msg)
  process.exit(2)
}

const env = process.env
const baseUrl = env.AUDIT_BASE_URL
const ref = env.AUDIT_SUPABASE_REF
const confirmed = env.AUDIT_CONFIRMED_NONPROD_REF
if (!baseUrl) refuse('AUDIT_BASE_URL not set')
if (!ref) refuse('AUDIT_SUPABASE_REF not set')
if (ref === PRODUCTION_SUPABASE_REF) refuse('server is on the PRODUCTION Supabase project (' + ref + '); baseline may not run')
if (confirmed !== ref) refuse('AUDIT_CONFIRMED_NONPROD_REF must equal AUDIT_SUPABASE_REF (human isolation attestation)')
// The .env.local the server would read is checked too, so a mismatch between
// what the operator believes and what the process loads is caught.
if (existsSync('.env.local')) {
  const txt = readFileSync('.env.local', 'utf8')
  if (txt.includes(PRODUCTION_SUPABASE_REF)) refuse('.env.local still references the production Supabase ref')
  if (/^KV_REST_API_URL=|^UPSTASH_REDIS_REST_URL=/m.test(txt)) refuse('.env.local configures a distributed quota store; the production KV must not be spent by an audit')
}

// Plan: setup + primary, 2 runs each, then verify the cap BEFORE any request.
const plan = []
// AUDIT_RUN_FILTER=1|2 runs only that pass (so the server can be restarted between run 1 and run 2 —
// owner decision SERVER_RESTART_BETWEEN_RUNS=YES); the two outputs are merged afterwards. The 36-run
// cap is still enforced on the plan of each invocation and on the merged total by the merge script.
const RUN_FILTER = env.AUDIT_RUN_FILTER ? Number(env.AUDIT_RUN_FILTER) : null
// AUDIT_QUERY_IDS=1,2,3 restricts the plan to those primary queries (setup turns included automatically).
const QUERY_IDS = env.AUDIT_QUERY_IDS ? env.AUDIT_QUERY_IDS.split(',').map(Number) : null
// AUDIT_SURFACE=mobile simulates the ANDROID client: no x-tappy-surface header and NO userLocation
// (Android sends `messages` only; iOS would send userLocation — recorded as simulated Android).
const MOBILE = env.AUDIT_SURFACE === 'mobile'
const OUT = env.AUDIT_OUT || 'docs/audit/baseline-before.json'
for (let run = 1; run <= 2; run++) {
  if (RUN_FILTER && run !== RUN_FILTER) continue
  for (const q of QUERIES) {
    if (QUERY_IDS && !QUERY_IDS.includes(q.id)) continue
    if (q.setup) plan.push({ queryId: q.id, run, setup_run: true, text: q.setup, location: q.location ?? null })
    plan.push({ queryId: q.id, run, setup_run: false, text: q.text, location: q.location ?? null })
  }
}
if (plan.length > TOTAL_RUN_CAP) refuse(`plan is ${plan.length} runs > cap ${TOTAL_RUN_CAP}`)
console.log(`plan: ${plan.length} runs (cap ${TOTAL_RUN_CAP}); primary=${plan.filter(p => !p.setup_run).length} setup=${plan.filter(p => p.setup_run).length}`)
if (env.AUDIT_DRY_RUN === '1') { console.log(JSON.stringify(plan, null, 2)); process.exit(0) }

function parseFrames(body) {
  const out = { text: '', toolCalls: [], toolResults: [], steps: [], finish: null, annotations: [], errors: [] }
  for (const line of body.split('\n')) {
    if (!line) continue
    const i = line.indexOf(':')
    const tag = line.slice(0, i); let payload
    try { payload = JSON.parse(line.slice(i + 1)) } catch { continue }
    if (tag === '0') out.text += payload
    else if (tag === '9') out.toolCalls.push({ toolName: payload.toolName, args: payload.args })
    else if (tag === 'a') out.toolResults.push({ toolCallId: payload.toolCallId, result: sanitizeResult(payload.result) })
    else if (tag === 'e') out.steps.push(payload)
    else if (tag === 'd') out.finish = payload
    else if (tag === '8') out.annotations.push(payload)
    else if (tag === '3') out.errors.push(String(payload))
  }
  return out
}

/** Keep structure, drop URLs/photos and long strings — enough to read the contract, not the internet. */
function sanitizeResult(r, depth = 0) {
  if (depth > 6) return '[depth]'
  if (Array.isArray(r)) return r.slice(0, 10).map(x => sanitizeResult(x, depth + 1))
  if (r && typeof r === 'object') {
    const o = {}
    for (const [k, v] of Object.entries(r)) {
      if (/url|link|photo|uri|token|key|cookie|auth/i.test(k)) { o[k] = typeof v === 'string' ? '[url]' : Array.isArray(v) ? `[${v.length} urls]` : '[redacted]'; continue }
      o[k] = sanitizeResult(v, depth + 1)
    }
    return o
  }
  if (typeof r === 'string') return r.length > 300 ? r.slice(0, 300) + '…' : r
  return r
}

async function chat(messages, location, bearer) {
  const headers = { 'Content-Type': 'application/json' }
  if (env.AUDIT_SURFACE === 'web') headers['x-tappy-surface'] = 'web'
  if (bearer) headers['Authorization'] = 'Bearer ' + bearer
  const body = { messages, ...(location && !MOBILE ? { userLocation: location } : {}) }
  const t0 = Date.now()
  const res = await fetch(baseUrl + '/api/chat', { method: 'POST', headers, body: JSON.stringify(body) })
  const raw = await res.text()
  return { status: res.status, elapsedMs: Date.now() - t0, evidenceId: res.headers.get('x-decision-evidence-id') ? '[present]' : null, ...parseFrames(raw) }
}

const runs = []
let executed = 0
const history = new Map() // `${queryId}:${run}` → messages so far
for (const p of plan) {
  if (executed >= TOTAL_RUN_CAP) { console.error('cap reached; stopping'); break }
  const key = `${p.queryId}:${p.run}`
  const prior = history.get(key) ?? []
  const messages = [...prior, { role: 'user', content: p.text }]
  const startedAt = new Date()
  let result
  try {
    result = await chat(messages, p.location, env.AUDIT_TEST_USER_BEARER)
  } catch (e) {
    result = { status: 0, errors: [String(e && e.message || e)], text: '', toolCalls: [], toolResults: [], steps: [], finish: null, annotations: [] }
  }
  executed++
  runs.push({
    run_id: `${p.setup_run ? 'S' : 'P'}${p.queryId}-r${p.run}`,
    query_id: p.queryId, run: p.run, setup_run: p.setup_run,
    setup_run_id: p.setup_run ? null : (QUERIES.find(q => q.id === p.queryId)?.setup ? `S${p.queryId}-r${p.run}` : null),
    user_message: p.text,
    mock_location: p.location && !MOBILE ? { lat: p.location.lat, lng: p.location.lng, label: 'District 1, HCMC (fixed mock via userLocation body field)' } : (p.location ? { omitted: 'mobile surface (Android sends no location)' } : null),
    timestamp: startedAt.toISOString(),
    timezone: 'recorded in UTC; server clock block uses Asia/Ho_Chi_Minh',
    client_platform: MOBILE ? 'audit runner simulating ANDROID request shape (messages + bearer only; no surface header, no userLocation; iOS would send userLocation)' : 'audit runner simulating WEB request shape (x-tappy-surface: web when AUDIT_SURFACE=web; userLocation for location queries)',
    backend_endpoint: baseUrl + '/api/chat',
    http_status: result.status, elapsed_ms: result.elapsedMs ?? null,
    tool_calls: result.toolCalls, tool_call_count: result.toolCalls.length,
    tool_results: result.toolResults, steps: result.steps, finish: result.finish,
    annotations: result.annotations.length, final_response: result.text, errors: result.errors,
  })
  // Carry the real reply forward as history for the primary turn (never fabricated).
  history.set(key, [...messages, { role: 'assistant', content: result.text }])
}

mkdirSync('docs/audit', { recursive: true })
writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(), base_url: baseUrl, supabase_ref: ref,
  total_run_cap: TOTAL_RUN_CAP, executed, runs,
}, null, 2) + '\n')
console.log(`wrote ${OUT} (${executed} runs)`)
