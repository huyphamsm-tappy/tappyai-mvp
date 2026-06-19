// Engine luận giải tử vi / cung hoàng đạo — HOÀN TOÀN local, rule-based.
// Không gọi LLM/API ngoài: dùng hash xác định (deterministic) từ (chủ thể + mốc thời gian)
// để chọn câu luận trong "ngân hàng câu" có sẵn => cùng 1 ngày luôn ra cùng 1 kết quả,
// nhưng đổi ngày/tuần/tháng sẽ ra kết quả khác, không tốn phí và không cần mạng.

export type FortunePeriod = 'day' | 'week' | 'month'

export interface FortuneBanks {
  love: string[]
  career: string[]
  money: string[]
  health: string[]
  luckyNumbers: number[]
  luckyColors: string[]
}

export interface FortuneReading {
  periodLabel: string
  love: string
  career: string
  money: string
  health: string
  score: number // 1-5 sao, tổng quan may mắn
  luckyNumber: number
  luckyColor: string
}

/** Giờ Việt Nam (UTC+7) — đồng bộ cách tính với trang chủ (vnTime). */
export function getVNNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000)
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function getISOWeekNumber(vnTime: Date): number {
  const date = new Date(Date.UTC(vnTime.getUTCFullYear(), vnTime.getUTCMonth(), vnTime.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/** Khoá thời gian theo kỳ (ngày/tuần/tháng), dùng giờ VN. */
export function getPeriodKey(period: FortunePeriod): { key: string; label: string } {
  const vn = getVNNow()
  const y = vn.getUTCFullYear()
  const m = vn.getUTCMonth() + 1
  const d = vn.getUTCDate()

  if (period === 'day') {
    return { key: `${y}-${pad2(m)}-${pad2(d)}`, label: 'Hôm nay' }
  }
  if (period === 'week') {
    const w = getISOWeekNumber(vn)
    return { key: `${y}-W${pad2(w)}`, label: 'Tuần này' }
  }
  return { key: `${y}-${pad2(m)}`, label: 'Tháng này' }
}

/** Hash chuỗi -> số nguyên dương (djb2), thuần toán học, không random. */
function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = (h * 33 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function pick<T>(seed: string, salt: string, arr: T[]): T {
  if (arr.length === 0) throw new Error('pick() cần array không rỗng')
  const h = hashString(`${seed}|${salt}`)
  return arr[h % arr.length]
}

function pickIndexInRange(seed: string, salt: string, min: number, max: number): number {
  const h = hashString(`${seed}|${salt}`)
  return min + (h % (max - min + 1))
}

/**
 * Sinh luận giải xác định (deterministic) cho 1 chủ thể (cung/con giáp) trong 1 kỳ hạn.
 * Cùng subjectId + cùng kỳ (ngày/tuần/tháng) => luôn ra cùng kết quả.
 */
export function generateFortune(subjectId: string, period: FortunePeriod, banks: FortuneBanks): FortuneReading {
  const { key, label } = getPeriodKey(period)
  const seed = `${subjectId}|${key}`

  return {
    periodLabel: label,
    love: pick(seed, 'love', banks.love),
    career: pick(seed, 'career', banks.career),
    money: pick(seed, 'money', banks.money),
    health: pick(seed, 'health', banks.health),
    score: pickIndexInRange(seed, 'score', 3, 5), // giữ tinh thần tích cực, dao động 3-5 sao
    luckyNumber: pick(seed, 'number', banks.luckyNumbers),
    luckyColor: pick(seed, 'color', banks.luckyColors),
  }
}
