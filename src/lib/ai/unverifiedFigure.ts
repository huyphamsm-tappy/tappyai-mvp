// ── CONSULTATIVE_IN_AGENT — when the guards cut every figure of a realtime answer, say so once ────────────────────────────────────
//
// A realtime question ("giá xăng hôm nay") whose draft stated a price can have that price removed by the factual guards (the source did not
// state it). What is left is then either nothing or a stray remark that reads as if the number were never promised. One natural sentence is
// added instead — "mình chưa xác minh được số này từ nguồn đã đọc" — and the existing citation step puts the source button under it.
// The sentence states no figure and loosens no guard: it only replaces silence. Added at most once, and not when the reply already says it.

import { extractMoneyClaims } from './moneyGuard'

const ADMITS = /(?<!\p{L})(?:chưa|không)\s+(?:\S+\s+){0,3}?(?:xác minh|xác nhận|kiểm chứng|kiểm tra được)|(?:could not|couldn't|cannot|can't|unable to)\s+(?:\S+\s+){0,2}?(?:verify|confirm)|(?:not|n't)\s+(?:been\s+)?verif/iu

const BLOCKS = /\[(FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+)\][\s\S]*?\[\/\1\]/g

const LINE: Record<string, string> = {
  vi: 'Mình chưa xác minh được số này từ nguồn đã đọc.',
  en: 'I couldn\'t verify this figure from the sources I read.',
}

const stripBlocks = (s: string) => s.replace(BLOCKS, '')

/** The sentence to add, or null: the draft stated a money figure, the final text states none, and it does not already admit non-verification. */
export function unverifiedFigureLine(draft: string, final: string, lang: string): string | null {
  if (!extractMoneyClaims(stripBlocks(draft)).length) return null
  const body = stripBlocks(final)
  if (extractMoneyClaims(body).length) return null
  if (ADMITS.test(body)) return null
  return LINE[lang] ?? LINE.vi
}

/** Adds the line after the prose and before the machine blocks (followups / buttons). */
export function withUnverifiedFigureLine(draft: string, final: string, lang: string): { text: string; added: boolean } {
  const line = unverifiedFigureLine(draft, final, lang)
  if (!line) return { text: final, added: false }
  const at = final.search(/\[(?:FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+)\]/)
  const head = (at < 0 ? final : final.slice(0, at)).replace(/\s+$/, '')
  const tail = at < 0 ? '' : final.slice(at)
  return { text: `${head}${head ? '\n\n' : ''}${line}${tail ? `\n\n${tail}` : ''}`, added: true }
}
