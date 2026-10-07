// ── Bounded agent — tool input / tool output / trace guards (deterministic) ────────────────────────────────────────────────
//
// The OpenAI Agents SDK layers a tool INPUT guardrail before execution and a tool OUTPUT guardrail after it (docs: "Guardrails",
// tool guardrails). This file is Tappy's deterministic version of both, run by the loop around EVERY agent-callable tool:
//
//   input  : the tool must be allowed for the model (never a side-effect tool), strings are length-capped, and any secret / credential
//            / private-identifier shape is cut from every string argument before it can reach a provider (a search query included).
//   output : credential-like keys are dropped everywhere (model AND client copy); for the MODEL copy only, instruction-like sentences and
//            free-text URLs are removed from third-party text, oversized payloads are truncated, and the result is fenced as DATA — so a
//            webpage, review or affiliate row can never read as an instruction and never supply a link the model may write.
//   trace  : model-written strings (the `why`) are redacted of contact data and secret shapes before they are logged.
//
// Pure: no I/O, no clock, no model.

import { marked } from '@/lib/ai/tools/serperUntrusted'
import { wrapToolResultAsData } from '@/lib/ai/security/toolResultFence'

/** Keys that must never travel in a tool result, to the model or to the client. */
const SENSITIVE_KEY = /^(?:.*_)?(?:api[_-]?key|apikey|secret|client[_-]?secret|token|access[_-]?token|refresh[_-]?token|id[_-]?token|password|passwd|authorization|auth|cookie|set-cookie|session(?:[_-]?id)?|credential[s]?|private[_-]?key|service[_-]?role)$/i
/** Fields whose value IS a link (code-built or provider-structured) — kept; URLs anywhere else in free text are dropped from the model copy. */
const LINK_KEY = /(?:^|_)(?:link|links|url|urls|uri|href|website|maps|booking|deeplink|deep_link|image|photo|thumbnail|logo|icon|source_url)(?:$|_)|^google_maps_search$|^search_url$/i

/** Secret / credential / private-identifier shapes that must never leave in a tool argument (nor be logged). */
const SECRET_SHAPES: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{16,}/g, 'api_key'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, 'google_key'],
  [/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/g, 'git_token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, 'slack_token'],
  [/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?/g, 'jwt'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi, 'bearer'],
  [/\b(?:OPENAI|ANTHROPIC|SERPER|SUPABASE|GOOGLE|VERCEL|KV|UPSTASH|ACCESSTRADE|CRON|STRIPE|SEPAY)_[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)\b(?:\s*=\s*\S+)?/g, 'env_secret'],
  [/\b(?:password|passwd|mật khẩu|mat khau|otp)\s*[:=]?\s*\S{4,}/gi, 'password'],
  [/\b[A-Fa-f0-9]{40,}\b/g, 'hex_secret'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, 'email'],
  [/(?:\+?84|\b0)[\s.-]?\d(?:[\s.-]?\d){7,10}\b/g, 'phone'],
  [/\b\d{12}\b/g, 'national_id'],
  [/\b(?:\d[ -]?){13,19}\b/g, 'card_number'],
]

const SECRET_HINT = /sk-|AIza|gh[pos]_|github_pat|xox[baprs]-|eyJ|Bearer|_(?:KEY|SECRET|TOKEN|PASSWORD)\b|password|passwd|mật khẩu|mat khau|\botp\b|[A-Fa-f0-9]{40}/i

export function cutSecrets(s: string): { text: string; cut: string[] } {
  const cut: string[] = []
  let out = s
  for (const [re, label] of SECRET_SHAPES) {
    const next = out.replace(re, ' ')
    if (next !== out) { cut.push(label); out = next }
  }
  return { text: out.replace(/\s{2,}/g, ' ').trim(), cut: [...new Set(cut)] }
}

export type InputVerdict = { ok: true; args: Record<string, unknown>; cut: string[] } | { ok: false; reason: 'disallowed_tool' | 'invalid_arguments' }

/** Tool INPUT guard: allow-list, string caps, secret cut. `disallowed` = names the model must never execute (side-effect tools). */
export function guardToolInput(name: string, args: Record<string, unknown>, o: { disallowed: ReadonlySet<string>; maxString?: number }): InputVerdict {
  if (o.disallowed.has(name)) return { ok: false, reason: 'disallowed_tool' }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { ok: false, reason: 'invalid_arguments' }
  const cap = o.maxString ?? 400
  const cut: string[] = []
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 6) return undefined
    if (typeof v === 'string') { const c = cutSecrets(v); cut.push(...c.cut); return c.text.slice(0, cap) }
    if (Array.isArray(v)) return v.slice(0, 20).map(x => walk(x, depth + 1))
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 30).map(([k, x]) => [k, walk(x, depth + 1)]))
    return v
  }
  return { ok: true, args: walk(args, 0) as Record<string, unknown>, cut: [...new Set(cut)] }
}

/** Instruction-like payloads beyond the Serper door markers: fake role headers, chat-template tokens, tool/policy talk. */
const ROLE_OR_TEMPLATE = /(?:^|\n|\s)(?:system|developer|assistant)\s*[:：]|<\|[a-z_]+\|>|\[\/?INST\]|###\s*(?:instruction|system)|\b(?:new|updated)\s+(?:instructions?|policy|system prompt)\b|\b(?:call|invoke|use)\s+(?:the\s+)?(?:tool|function)\s+\w+|\b(?:send|reveal|print|show)\s+(?:the\s+|your\s+)?(?:api\s*key|secret|token|password|system prompt)\b|\btransfer\s+(?:money|funds)\b|chuyển\s+(?:tiền|khoản)\s+(?:vào|tới|đến)/i
const URL_IN_TEXT = /!?\[[^\]]*\]\([^)]*\)|https?:\/\/\S+|\bwww\.\S+/gi
export const isInstructionLike = (s: string): boolean => !!marked(s) || ROLE_OR_TEMPLATE.test(s)

function cleanText(key: string, v: string): string {
  let out = LINK_KEY.test(key) ? v : v.replace(URL_IN_TEXT, ' ')
  if (isInstructionLike(out)) out = out.split(/(?<=[.!?…\n])\s+/).filter(sentence => !isInstructionLike(sentence)).join(' ')
  return out.replace(/\s{2,}/g, ' ').trim()
}

export interface OutputGuardStats { droppedKeys: number; cleanedStrings: number; truncated: boolean }

function dropSensitive(v: unknown, stats: OutputGuardStats, depth = 0, key = ''): unknown {
  if (depth > 12) return undefined
  if (Array.isArray(v)) return v.map(x => dropSensitive(x, stats, depth + 1, key))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) { stats.droppedKeys++; continue }
      out[k] = dropSensitive(x, stats, depth + 1, k)
    }
    return out
  }
  // A cheap pre-screen first: the full secret cut (many patterns) runs only on a string that shows a credential marker.
  if (typeof v === 'string' && !LINK_KEY.test(key) && SECRET_HINT.test(v)) { const c = cutSecrets(v); return c.cut.some(l => !['email', 'phone', 'national_id', 'card_number'].includes(l)) ? c.text : v }
  return v
}

function forModelCopy(v: unknown, key: string, stats: OutputGuardStats, depth = 0, maxRows = 12, maxString = 1200): unknown {
  if (depth > 10) return undefined
  if (typeof v === 'string') {
    const c = cleanText(key, v)
    if (c !== v) stats.cleanedStrings++
    if (c.length > maxString) { stats.truncated = true; return `${c.slice(0, maxString)}…` }
    return c
  }
  if (Array.isArray(v)) {
    if (v.length > maxRows) stats.truncated = true
    return v.slice(0, maxRows).map(x => forModelCopy(x, key, stats, depth + 1, maxRows, maxString))
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, forModelCopy(x, k, stats, depth + 1, maxRows, maxString)]))
  return v
}

/** Max serialized size of what the model reads from one tool call. */
export const MAX_TOOL_RESULT_CHARS = 24_000

/**
 * Tool OUTPUT guard. `forClient` = the result minus credential-like keys/values (cards, maps and links need the rest unchanged);
 * `forModel` = that, plus third-party text cleaned of instruction-like sentences and free-text URLs, truncated, and fenced as DATA.
 */
export function guardToolOutput(result: unknown): { forClient: unknown; forModel: unknown; stats: OutputGuardStats } {
  const stats: OutputGuardStats = { droppedKeys: 0, cleanedStrings: 0, truncated: false }
  const forClient = dropSensitive(result, stats)
  let model = forModelCopy(forClient, '', stats)
  if (JSON.stringify(model ?? null).length > MAX_TOOL_RESULT_CHARS) {
    stats.truncated = true
    model = forModelCopy(forClient, '', stats, 0, 5, 400)
    if (JSON.stringify(model ?? null).length > MAX_TOOL_RESULT_CHARS) model = { error: 'result_too_large', note: 'Kết quả quá lớn để đọc; nói rằng phần này chưa kiểm tra được.' }
  }
  return { forClient, forModel: wrapToolResultAsData(model), stats }
}

/** Trace redaction for model-written strings (the `why`): contact data and secret shapes never reach the logs. */
export function redactForTrace(s: string | null | undefined, max = 120): string | null {
  if (!s) return null
  return cutSecrets(s).text.slice(0, max)
}
