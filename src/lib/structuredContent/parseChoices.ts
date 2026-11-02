// CONSULT_V3 (owner 17/10, UAT đợt A — ChatGPT's "Chốt một lựa chọn" form): the reply's CLOSING decision question(s) with numbered
// options, read from the prose itself and shown as a choice card. VIEW ONLY: nothing is added to the model's output contract, no marker is
// parsed, nothing reaches the server except the plain sentence the user sends (the chosen options, as if typed).
//
// A group = a line that asks (contains "?", bold allowed) followed by 2–5 option lines ("1. …", "2) …", "- …", "• …"), at the very END
// of the text (blank lines between are fine). Up to 3 groups, read bottom-up and kept in reading order. Anything else — a numbered list
// in the middle of the answer, options with no question above them, a question with one option — is left as prose.

export interface ChoiceGroup { q: string; options: string[] }

const OPTION = /^\s*(?:\d{1,2}[.)]|[-•])\s+(.+?)\s*$/
const strip = (s: string) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()

export function parseChoiceTail(text: string): { text: string; groups: ChoiceGroup[] } {
  const lines = text.replace(/\s+$/, '').split('\n')
  const groups: ChoiceGroup[] = []
  let end = lines.length
  while (groups.length < 3) {
    let i = end - 1
    while (i >= 0 && !lines[i].trim()) i--
    const opts: string[] = []
    while (i >= 0 && OPTION.test(lines[i])) { opts.unshift(strip(OPTION.exec(lines[i])![1])); i-- }
    if (opts.length < 2 || opts.length > 5 || opts.some(o => !o || o.length > 90)) break
    while (i >= 0 && !lines[i].trim()) i--
    if (i < 0) break
    const q = strip(lines[i]).replace(/^[-•]\s*/, '')
    if (!/[?？]/.test(q) || q.length > 200 || OPTION.test(lines[i])) break
    groups.unshift({ q, options: opts })
    end = i
  }
  if (!groups.length) return { text, groups: [] }
  return { text: lines.slice(0, end).join('\n').replace(/\s+$/, ''), groups }
}

// UAT 17/10 (Hạ Long plan): the option "Nơi khác" was a one-click answer — the user could not say WHICH place, and Tappy asked again. An
// "other" option ("Nơi khác", "Mẫu khác — gửi tên nhé", "Khác", "Other") opens a text box instead; the answer reads "Nơi khác: Cần Thơ".
const OTHER = /^(?:(?:nơi|mẫu|lựa chọn|ý|cái|địa điểm|chỗ|tỉnh|thành phố|phương án|loại|món|giải|hãng|kiểu|ngày|giờ)\s+)?khác(?=\s*(?:$|[—–\-:.,(…]))|gửi tên|tự nhập|nhập tên|^other\b|^something else\b|^(?:another|a different)\b/iu
export function isOtherOption(option: string): boolean {
  return OTHER.test(option.replace(/\*\*/g, '').trim())
}
/** The text an "other" option starts the user's own answer with ("Mẫu khác — gửi tên nhé" → "Mẫu khác: "). */
export function otherPrefill(option: string): string {
  return `${option.replace(/\*\*/g, '').replace(/\s*[—–-]\s*.*$/u, '').replace(/[.…:]+$/u, '').trim()}: `
}

/** The user's reply: the chosen option of each group, in order ("Resort sang · Đi máy bay"). */
export function composeChoiceAnswer(groups: readonly ChoiceGroup[], chosen: Record<number, string>): string {
  return groups.map((_, i) => chosen[i]).filter((v): v is string => !!v).join(' · ')
}
