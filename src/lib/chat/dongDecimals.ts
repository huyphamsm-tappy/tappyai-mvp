// 16/11 (UAT 60, question 14: "1.341.015,02đ/đêm"): an amount in Vietnamese dong is a whole number. A source's decimals ("…,02") never help the reader, so a figure written with a comma decimal part and
// followed by a dong unit (đ, ₫, VND, đồng) is rounded to a whole number. Pure; the dot thousands separators stay; a number without a dong unit (a rate, a score, a weight) is left alone.
const DONG = /(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})(?!\d)(\s?(?:đ|₫|VND|vnd|đồng)(?![\p{L}]))/gu

export function roundDongDecimals(text: string): string {
  if (!text || !text.includes(',')) return text
  return text.replace(DONG, (_m, whole: string, dec: string, unit: string) => {
    const digits = whole.replace(/\./g, '')
    const n = Number(digits) + (Number(`0.${dec}`) >= 0.5 ? 1 : 0)
    const grouped = whole.includes('.') || digits.length > 3 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(n)
    return `${grouped}${unit}`
  })
}
