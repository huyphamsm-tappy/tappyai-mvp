// The language a deep-research REPORT is written in (12/11/2026, defect found by the self-UAT).
//
// `detectLangConfident` is deliberately conservative: it answers only what the text settles beyond doubt, and it returns null for many ordinary English questions
// ("Is it safe to eat street food in Ho Chi Minh City?"). For the chat answer that is right (the model follows the user's own words). For the report it meant a null
// `questionLang`, so the report fell back to the UI language and an English question got a Vietnamese report.
//
// `reportQuestionLang` keeps `detectLangConfident` first (its answer is never overridden) and only fills ITS null with 'en' when the text is plainly English:
// pure ASCII letters (no tone marks, no non-Latin script), at least four words, English function words in at least a quarter of them and more of them than
// Vietnamese words typed without tone marks. A Vietnamese sentence, with or without tone marks, never becomes English. Pure and browser-safe (no Node import).

import { detectLangConfident } from '@/lib/ai/intent'

/** English function words and question/request words that carry the sentence ("compare", "best" open most research questions). */
const EN_STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'but', 'what', 'which', 'who', 'whom', 'how', 'why', 'when', 'where',
  'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must', 'with', 'from', 'at', 'by', 'about', 'between', 'versus', 'vs', 'compare',
  'my', 'your', 'our', 'their', 'i', 'you', 'we', 'it', 'its', 'they', 'this', 'that', 'these', 'those', 'there', 'any', 'some', 'need', 'want', 'give', 'tell', 'please',
  'have', 'has', 'had', 'than', 'more', 'most', 'best', 'top', 'not', 'if', 'as', 'into', 'over', 'under', 'after', 'before', 'during', 'rules', 'safe', 'good', 'much', 'many',
])

/** Vietnamese words typed WITHOUT tone marks that no English sentence uses. A word that is also English ("me", "do", "an", "to", "la") is left out on purpose. */
export const VI_BARE = new Set([
  'toi', 'minh', 'cho', 'quan', 'ngon', 'ngay', 'dem', 'nguoi', 'bao', 'nhieu', 'gia', 'khong', 'nao', 'gi', 'duoc', 'nhung', 'voi', 'cua', 'nhu', 'hay', 'muon', 'tim',
  'goi', 'mua', 'ban', 'di', 'den', 've', 'bun', 'bo', 'pho', 'com', 'va', 'cac', 'mot', 'hai', 'bon', 'nay', 'kia', 'dang', 'roi', 'rat', 'qua', 'lam', 'sao', 'dau', 'khi',
  'thi', 'ma', 'nen', 'hoac', 'neu', 'vi', 'sau', 'truoc', 'trong', 'ngoai', 'gan', 'xa', 're', 'dat', 'mai', 'nay', 'tuan', 'thang', 'nam', 'gio', 'phut', 'o', 'tai', 'tu',
  'chi', 'phi', 'dich', 'vu', 'cong', 'ty', 'thanh', 'pho', 'duong', 'huong', 'dan', 'sanh', 'giua', 'nhat', 'tot', 'nen',
])

const NON_ASCII_LETTER = /[^\x00-\x7F]/u
const LETTER = /\p{L}/u

/** 'en' only when the text is plainly English (see the file header); otherwise null. Pure. */
export function englishForReport(text: string): 'en' | null {
  if (!text) return null
  for (const ch of text) if (NON_ASCII_LETTER.test(ch) && LETTER.test(ch)) return null
  // Any non-ASCII LETTER (tone marks, đ, kana, hanzi, Thai ...) means this is not the plain-ASCII English this rule is for; punctuation such as ’ or — is allowed.
  const words = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []
  if (words.length < 4) return null
  let en = 0
  let vi = 0
  for (const w of words) {
    if (EN_STOP.has(w)) en++
    if (VI_BARE.has(w)) vi++
  }
  if (en < 2) return null
  if (en / words.length < 0.25) return null
  if (en <= vi) return null
  return 'en'
}

/** The question's language for the report: what `detectLangConfident` settles, else 'en' for plain English, else null (the caller then uses the UI language). Pure. */
export function reportQuestionLang(text: string): string | null {
  return detectLangConfident(text) ?? englishForReport(text)
}
