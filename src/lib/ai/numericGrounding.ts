import type { ConversationState } from './conversationState'
import { normalizeVN } from './intent'

/**
 * Which numbers a reply is entitled to use (Task 3F-2.1).
 *
 * With zero candidate evidence the model kept offering figures nothing
 * supported — "nâng ngân sách lên 28–30 triệu" when no tool returned 28 or 30.
 * A blanket "no digits" rule would be worse than the bug: it would suppress the
 * user's own requirements ("32GB", "25 triệu") and, once search works, real
 * prices and ratings. So the guard is built from PROVENANCE, not from digits.
 *
 * Three legitimate sources:
 *   USER-STATED   — the user said it, so restating it invents nothing.
 *   TOOL-EVIDENCE — a tool returned it on a candidate.
 *   DERIVED       — arithmetic over two grounded values (e.g. "800 nghìn over
 *                   your 25 triệu") — legitimate, but only when both inputs are.
 * Anything else is unsupported.
 */

/** Every number in a string, normalised so "25.800.000" and "25800000" match. */
function numbersIn(text: string): string[] {
  const t = normalizeVN(text.toLowerCase())
  const out: string[] = []
  for (const m of t.matchAll(/\d[\d.,]*/g)) {
    const raw = m[0]
    // Strip thousand separators but keep a decimal comma/point meaningful:
    // "25.8" -> "25.8", "25.800.000" -> "25800000".
    const digitsOnly = raw.replace(/[.,]/g, '')
    out.push(digitsOnly)
    // A figure like 25.8 (triệu) is also written 25,8 — keep the short form too.
    const short = raw.replace(/[.,](?=\d{3}\b)/g, '')
    if (short !== raw) out.push(short.replace(/[.,]/g, ''))
    if (/^\d+[.,]\d{1,2}$/.test(raw)) out.push(raw.replace(',', '.'))
  }
  return out
}

/**
 * Numbers this conversation may legitimately use.
 *
 * Deliberately generous within the grounded sources: scale variants of the same
 * figure ("25" and "25000000" for "25 triệu") all count as the same permission,
 * because the reply may phrase it either way.
 */
export function collectAllowedNumbers(
  state: ConversationState | null,
  userTexts: string[] = [],
): Set<string> {
  const allowed = new Set<string>()
  const add = (v: string | number | undefined | null) => {
    if (v == null) return
    for (const n of numbersIn(String(v))) allowed.add(n)
  }
  const addScaled = (n: number) => {
    add(n)
    if (n >= 1_000_000) add(Math.round(n / 1_000_000))   // 25000000 -> 25 (triệu)
    if (n >= 1_000) add(Math.round(n / 1_000))           // 800000 -> 800 (nghìn)
  }

  // USER-STATED: both the parsed value and the user's own wording.
  for (const c of state?.hardConstraints ?? []) {
    if (typeof c.value === 'number') addScaled(c.value)
    else add(c.value)
    add(c.statedAs)
  }
  for (const p of state?.softPreferences ?? []) {
    add(p.statedAs)
    const m = p.key.match(/^budget~(\d+)$/)
    if (m) addScaled(parseInt(m[1], 10))
  }
  add(state?.goal)
  for (const t of userTexts) add(t)

  // TOOL-EVIDENCE: anything a tool actually returned on a candidate.
  for (const c of state?.candidates ?? []) {
    add(c.name)
    for (const v of Object.values(c.facts)) add(v)
  }

  return allowed
}

/**
 * MEASUREMENT ONLY — never used to mutate a reply.
 *
 * Post-generation deletion is explicitly out of bounds (it hides the symptom and
 * mangles legitimate text), so this exists purely so tests and runtime probes
 * can COUNT unsupported figures. The actual prevention is the structured
 * directive built from `collectAllowedNumbers`.
 */
export function findUnsupportedNumericClaims(text: string, allowed: Set<string>): string[] {
  const unsupported: string[] = []
  // Strip URLs first. Percent-encoded Vietnamese ("%C3%A0") made the classifier
  // report "3%" and "0%" as invented percentages — 18 phantom claims in one
  // cafe reply that contained only markdown links. A measurement tool that
  // cries wolf is worse than none.
  const withoutUrls = text.replace(/https?:\/\/\S+/g, ' ').replace(/\]\([^)]*\)/g, '] ')
  const t = normalizeVN(withoutUrls.toLowerCase())
  // Only figures that read as a claim: a number carrying a unit or a currency.
  const CLAIM = /(\d[\d.,]*)\s*(trieu|nghin|k\b|vnd|₫|đ\b|%|gio\b|hours?\b|h\b|gb\b|tb\b|km\b|m\b|sao\b|star)/g
  for (const m of t.matchAll(CLAIM)) {
    const raw = m[1]
    const digitsOnly = raw.replace(/[.,]/g, '')
    const decimal = /^\d+[.,]\d{1,2}$/.test(raw) ? raw.replace(',', '.') : null
    if (allowed.has(digitsOnly) || (decimal && allowed.has(decimal))) continue
    unsupported.push(m[0].trim())
  }
  return unsupported
}

/**
 * The roster handed to the model when there is no candidate evidence.
 *
 * Naming the permitted figures is what makes "no new numbers" enforceable
 * without banning numbers outright — the model can still say "25 triệu" because
 * the user said it, but has nothing to point at for "28–30 triệu".
 */
export function buildNumericGroundingRule(state: ConversationState | null): string {
  const userFigures = [
    ...(state?.hardConstraints ?? []).map(c => `${c.value}${typeof c.value === 'number' ? '' : ''} (${c.key}, user noi: "${c.statedAs}")`),
    ...(state?.softPreferences ?? [])
      .filter(p => /^budget~\d+$/.test(p.key))
      .map(p => `${Math.round(parseInt(p.key.slice(7), 10) / 1_000_000)} trieu (ngan sach user noi: "${p.statedAs}")`),
  ]

  return `
SO LIEU — CHI DUOC DUNG NHUNG CON SO SAU:
${userFigures.length > 0 ? userFigures.map(f => `  - ${f}`).join('\n') : '  - (user chua neu con so nao)'}
  - va bat ky con so nao co trong BANG CHUNG o tren (hien khong co).
MOI CON SO KHAC DEU LA BIA. Cu the: KHONG duoc dua ra muc gia moi, khoang gia moi,
nguong ngan sach moi, so gio pin, phan tram, hay so lieu hieu nang nao khong nam trong danh sach tren.
KHI KHUYEN NOI LONG DIEU KIEN, PHAI noi DINH TINH: "nới ngân sách một chút", "hạ bớt cấu hình",
"cân nhắc máy mới" — TUYET DOI KHONG kem con so ("lên 28-30 triệu", "xuống 16GB") tru khi chinh
user da noi con so do.`
}
