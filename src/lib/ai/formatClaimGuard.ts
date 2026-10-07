import { normalizeVN } from './intent'

// ── CINEMA FORMATS ARE A CLAIM, NOT A GIVEN ──────────────────────────────────
//
// Phase 7 group 1 (golden T2, 2026-09-22): "Rạp chiếu phim IMAX ở TP HCM" was answered from
// Google Maps rows — which carry a name, a rating and an address, and say NOTHING about the
// screens inside — and the reply still presented eight cinemas with "sảnh IMAX", with wording
// that is not even the Vietnamese term (it is "phòng chiếu IMAX"). The prompt asks for honesty
// about attributes the data cannot show; measured, a prompt rule does not stop the model (the
// same claim came back reworded), so the honesty line is enforced here.
//
// Narrow by design: only a projection FORMAT the user asked for (IMAX, 4DX, ScreenX, Dolby
// Atmos/Cinema, Onyx, ULTRA 4DX, Starium, Gold Class) and only when NO retrieved row — its name
// or its snippet/hours text — carries the token. When any row does, the rows are the evidence
// and the prose is left alone. Nothing is removed: the wording is corrected and ONE honest line
// is appended, in the reply's language, unless the reply already hedges the format itself.

const FORMATS: ReadonlyArray<[label: string, re: RegExp]> = [
  ['IMAX', /\bimax\b/i],
  ['4DX', /\b4dx\b/i],
  ['ScreenX', /\bscreenx\b/i],
  ['Dolby', /\bdolby\b/i],
  ['Onyx', /\bonyx\b/i],
  ['Starium', /\bstarium\b/i],
  ['Gold Class', /\bgold class\b/i],
]

/** The formats the user asked for by name. */
export function requestedFormats(userText: string): string[] {
  const t = String(userText ?? '')
  return FORMATS.filter(([, re]) => re.test(t)).map(([label]) => label)
}

const HEDGE_NEAR = /chua (xac nhan|chac|kiem tra|ro)|khong (chac|ro|co rap \w+ chuyen biet)|khong co .{0,20}trong ket qua|can (kiem tra|xac nhan)|\bxac nhan\b.{0,40}\bwebsite\b|\bnot (confirmed|verified|sure)\b|\bunverified\b|\bcan'?t confirm\b|\bcheck (the|their|its) (website|site)\b/

export interface FormatGuardResult { text: string; hedged: string[]; reworded: number }

/**
 * @param text       the settled reply
 * @param userText   this turn's user message
 * @param evidence   row names + row texts retrieved this turn (empty when nothing was fetched)
 */
export function guardFormatClaimsInText(text: string, userText: string, evidence: readonly string[], lang: string): FormatGuardResult {
  const wanted = requestedFormats(userText)
  if (wanted.length === 0 || !text) return { text, hedged: [], reworded: 0 }
  let out = text
  let reworded = 0
  // "sàn IMAX" / "sảnh IMAX" → "phòng chiếu IMAX": the term for a screen, in any case.
  out = out.replace(/\b(s[àa]n|s[ảa]nh|h[ộo]i tr[ưu][ờo]ng)(\s+chi[ếe]u)?\s+(IMAX|4DX|ScreenX)\b/gi, (_, __, ___, fmt) => { reworded++; return `phòng chiếu ${fmt}` })
  const ev = evidence.map(e => normalizeVN(String(e ?? '').toLowerCase())).join('\n')
  const body = normalizeVN(out.toLowerCase())
  const hedged: string[] = []
  for (const label of wanted) {
    const re = FORMATS.find(([l]) => l === label)![1]
    if (!re.test(out)) continue                       // the reply never claims it
    if (re.test(ev)) continue                         // a row carries it — grounded
    // The reply already says, near ANY mention of the format, that it is unconfirmed ("không có
    // rạp IMAX chuyên biệt trong kết quả", "xác nhận trên website" — the honest replies T2 gave).
    const mentions = [...body.matchAll(new RegExp(re.source, 'gi'))].map(m => m.index ?? 0)
    const alreadyHedged = mentions.some(idx => HEDGE_NEAR.test(body.slice(Math.max(0, idx - 200), idx + 200)))
    if (alreadyHedged) continue
    hedged.push(label)
  }
  if (hedged.length === 0) return { text: out, hedged, reworded }
  const list = hedged.join('/')
  const line = lang === 'en'
    ? `Note: the listings I retrieved do not say which cinema actually has a ${list} screen — please confirm the format on the cinema's own website before booking.`
    : `Lưu ý: dữ liệu mình lấy được chưa xác nhận rạp nào thật sự có phòng chiếu ${list} — bạn kiểm tra suất chiếu ${list} trên website của rạp trước khi đặt vé nhé.`
  // Before the structured blocks, like every other hedge.
  const m = out.match(/\n*\[(?:CTA_BUTTONS|FOLLOWUPS|TAPPY_PLACES|TAPPY_PLAN|TAPPY_SHOPPING)\]/)
  const at = m && m.index !== undefined ? m.index : out.length
  const head = out.slice(0, at).replace(/\s+$/, '')
  const tail = out.slice(at)
  return { text: `${head}\n\n${line}${tail}`, hedged, reworded }
}
