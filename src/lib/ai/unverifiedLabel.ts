// The word of the "unverified" label, in the language of the TEXT it is written into (UAT 18/11, case 48: a French answer carried "(chưa xác minh)").
//
// The code knows the app's language (`lang`), not the language of every answer (a Vietnamese app, a French question). The label follows the text it
// labels: a stretch of text with plenty of letters and not one letter that only Vietnamese uses (ă đ ơ ư and the letters with a dot, hook or tilde
// under or over them) is not Vietnamese, so it gets the English word; anything shorter, or Vietnamese, keeps the app's language. Pure.

const VIETNAMESE_ONLY = /[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i
const MIN_LETTERS = 40

export function unverifiedWord(context: string, lang: string): 'chưa xác minh' | 'unverified' {
  if (lang === 'en') return 'unverified'
  const plain = context.replace(/\*\*[^*\n]*\*\*/g, ' ') // a bold name (a dish, a place) says nothing about the language around it
  const letters = (plain.match(/\p{L}/gu) ?? []).length
  if (letters >= MIN_LETTERS && !VIETNAMESE_ONLY.test(plain)) return 'unverified'
  return 'chưa xác minh'
}
