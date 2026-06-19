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

// ===== BÓI THEO NĂM =====

export const YEAR_ANIMALS = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi']

const YEAR_COMPAT: Record<number, { label: string; note: string }> = {
  0:  { label: '⚠ Năm bản mệnh', note: 'Năm cầm tinh trùng với tuổi bạn — vận khí biến động, cần thận trọng trong các quyết định lớn, nhưng cũng là năm để thử thách và khẳng định lại bản thân.' },
  4:  { label: '✨ Tam hợp', note: 'Tam hợp cục — năm rất thuận lợi, quý nhân phù trợ nhiều, sự nghiệp và tình duyên đều có cơ hội bứt phá mạnh.' },
  8:  { label: '✨ Tam hợp', note: 'Tam hợp cục — vận khí hanh thông toàn diện, thích hợp để mở rộng quy mô, đầu tư và gặt hái thành quả tích lũy.' },
  6:  { label: '⚡ Lục xung', note: 'Lục xung — năm nhiều xáo trộn và biến động, giữ vững lập trường và tránh các quyết định quá liều lĩnh, đặc biệt trong nửa năm đầu.' },
  3:  { label: '🔸 Tương hình', note: 'Tương hình — cần chú ý các mối quan hệ dễ xảy ra bất đồng và xích mích; kiên nhẫn, dĩ hòa vi quý là cách ứng xử tốt nhất.' },
  9:  { label: '🔸 Tương hình', note: 'Tương hình — cẩn thận trong giao tiếp và ký kết hợp đồng, tránh tranh chấp không cần thiết.' },
  2:  { label: '🟡 Lục hợp', note: 'Lục hợp — năm có lợi thế trong hợp tác; các kế hoạch chung hoặc hợp tác kinh doanh đôi bên dễ thành công hơn làm đơn lẻ.' },
  1:  { label: '—', note: 'Năm vận khí đi ngang, phù hợp để tích lũy kinh nghiệm và chuẩn bị kế hoạch vững chắc hơn cho chu kỳ tiếp theo.' },
  5:  { label: '—', note: 'Năm trung bình, nên củng cố những gì đang có thay vì mở rộng thêm — tập trung vào chất lượng hơn số lượng.' },
  7:  { label: '—', note: 'Năm khá thuận về tài lộc và sức khỏe, thích hợp để chú trọng các mối quan hệ thân thiết và đầu tư cho gia đình.' },
  10: { label: '—', note: 'Năm thuận lợi cho học tập và phát triển bản thân, những nỗ lực này sẽ cho quả tốt trong tương lai.' },
  11: { label: '—', note: 'Năm tiệm cận chu kỳ mới — nên kết thúc những việc còn dang dở và chuẩn bị tâm thế đón giai đoạn biến chuyển sắp tới.' },
}

const YEAR_BANKS: FortuneBanks = {
  love: [
    'Đây là năm phù hợp để đầu tư chiều sâu cho mối quan hệ hiện tại — tình cảm bền vững đến từ những khoảnh khắc nhỏ được chú tâm.',
    'Cơ hội tình duyên xuất hiện rõ ràng hơn trong năm nay, người độc thân nên chủ động và mở lòng đón nhận nhân duyên mới.',
    'Năm này đòi hỏi sự nhẫn nại và thỏa hiệp trong tình cảm — mối quan hệ nào vượt qua được giai đoạn thử thách sẽ càng bền chặt.',
    'Tình duyên năm nay hanh thông, các quyết định quan trọng về hôn nhân hay cam kết lâu dài đều được vận khí hỗ trợ.',
    'Cần cân bằng giữa công việc và tình cảm trong năm — đừng để áp lực bên ngoài làm nguội lạnh mối quan hệ quan trọng nhất.',
    'Năm này mang lại cơ hội hàn gắn và làm mới mối quan hệ, hãy chủ động chia sẻ cảm xúc thật và lắng nghe sâu hơn.',
  ],
  career: [
    'Đây là năm để đặt nền móng vững chắc cho mục tiêu sự nghiệp dài hạn — những việc làm kiên trì trong năm nay sẽ là bệ phóng cho những năm tiếp theo.',
    'Cơ hội thăng tiến hoặc chuyển hướng sự nghiệp rõ ràng hơn — cần hành động quyết đoán khi cơ hội đến, đừng do dự quá lâu.',
    'Năm thích hợp để nâng cấp kỹ năng và mở rộng mạng lưới quan hệ chuyên môn — những đầu tư này tạo lợi thế cạnh tranh rõ rệt trong vài năm tới.',
    'Sự bền bỉ và nhất quán trong công việc năm nay sẽ được ghi nhận — tránh thay đổi hướng đi quá nhiều, tập trung hoàn thành những gì đã bắt đầu.',
    'Năm có thể xuất hiện đối tác hoặc cộng sự quan trọng — hãy chú tâm xây dựng các mối quan hệ hợp tác trung thực và bền vững.',
    'Năm thu hoạch thành quả từ những nỗ lực tích lũy trước đó — hãy tự tin tiến lên và nắm bắt cơ hội đang ở phía trước.',
  ],
  money: [
    'Tài lộc năm nay có xu hướng tích lũy dần đều — hạn chế đầu tư rủi ro cao, ưu tiên xây dựng quỹ dự phòng an toàn trước.',
    'Có thể xuất hiện khoản thu nhập tăng đột biến nhưng chi tiêu cũng tăng theo — cần lập ngân sách rõ ràng để không bị hổng tay.',
    'Vận tài lộc khá tốt nếu chủ động tạo ra cơ hội thay vì thụ động chờ đợi — đa dạng hóa nguồn thu nhập là hướng đi phù hợp.',
    'Năm phù hợp cho kế hoạch tài chính trung và dài hạn như tiết kiệm, đầu tư thụ động hoặc bảo hiểm nhân thọ.',
    'Cần đề phòng các khoản chi phát sinh bất ngờ — duy trì quỹ dự phòng ít nhất 3 tháng chi tiêu là phòng ngừa khôn ngoan.',
    'Tài lộc đến từ nhiều hướng khác nhau trong năm, hãy giữ tâm thế linh hoạt và không bỏ qua những cơ hội nhỏ nhưng chắc chắn.',
  ],
  health: [
    'Sức khỏe tổng quan ổn định trong năm nhưng cần xây dựng thói quen tốt từ sớm và duy trì đều đặn để phát huy hiệu quả.',
    'Sức khỏe tinh thần là ưu tiên hàng đầu năm nay — căng thẳng tích tụ lâu sẽ kéo theo sức khỏe thể chất đi xuống.',
    'Đây là năm tốt để bắt đầu hoặc củng cố chế độ luyện tập và ăn uống lành mạnh — nền tảng sức khỏe xây dựng trong năm nay sẽ theo bạn nhiều năm tới.',
    'Chú ý các vấn đề sức khỏe tái phát hoặc mãn tính — thăm khám định kỳ và không tự điều trị, phát hiện sớm luôn tốt hơn.',
    'Năng lượng năm nay dồi dào, phù hợp để thử thách bản thân với các mục tiêu thể chất mới.',
    'Giấc ngủ đủ và chất lượng cùng với sự cân bằng giữa làm việc và nghỉ ngơi là nền tảng sức khỏe quan trọng nhất cần gìn giữ.',
  ],
  luckyNumbers: [1, 3, 6, 8, 9, 18, 36],
  luckyColors: ['Vàng', 'Đỏ', 'Xanh lá', 'Trắng', 'Tím', 'Xanh dương', 'Cam'],
}

export interface YearFortuneReading extends FortuneReading {
  yearAnimal: string
  compatLabel: string
  compatNote: string
}

export function generateYearFortune(
  subjectId: string,
  birthYear: number,
  targetYear: number,
): YearFortuneReading {
  const seed = `${subjectId}|year-${targetYear}`
  const subjectIdx = ((birthYear - 4) % 12 + 12) % 12
  const yearIdx = ((targetYear - 4) % 12 + 12) % 12
  const diff = (yearIdx - subjectIdx + 12) % 12
  const compat = YEAR_COMPAT[diff]

  return {
    periodLabel: `Năm ${targetYear} (${YEAR_ANIMALS[yearIdx]})`,
    yearAnimal: YEAR_ANIMALS[yearIdx],
    compatLabel: compat.label,
    compatNote: compat.note,
    love: pick(seed, 'love', YEAR_BANKS.love),
    career: pick(seed, 'career', YEAR_BANKS.career),
    money: pick(seed, 'money', YEAR_BANKS.money),
    health: pick(seed, 'health', YEAR_BANKS.health),
    score: pickIndexInRange(seed, 'score', 3, 5),
    luckyNumber: pick(seed, 'number', YEAR_BANKS.luckyNumbers),
    luckyColor: pick(seed, 'color', YEAR_BANKS.luckyColors),
  }
}
