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
    score: pickIndexInRange(seed, 'score', 3, 5),
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
    'Tình cảm có xu hướng thăng hoa trong nửa cuối năm — hãy kiên nhẫn nếu đầu năm có chút trắc trở.',
    'Năm thuận lợi để vun đắp các mối quan hệ thân thiết — chất lượng thời gian bên nhau quan trọng hơn số lượng.',
    'Quý nhân về tình duyên xuất hiện qua các mối quan hệ công việc hoặc bạn bè giới thiệu — hãy chú tâm quan sát.',
    'Năm này tình cảm cần sự chân thành hơn bao giờ hết — những mối quan hệ được xây dựng trên nền tảng thực sẽ bền vững lâu dài.',
    'Tránh các quyết định tình cảm vội vàng trong giai đoạn đầu năm — cảm xúc cần thời gian lắng lại để sáng suốt hơn.',
    'Năm có thể mang đến những kết nối sâu sắc và ý nghĩa — đừng đóng lòng vì những tổn thương trong quá khứ.',
  ],
  career: [
    'Đây là năm để đặt nền móng vững chắc cho mục tiêu sự nghiệp dài hạn — những việc làm kiên trì trong năm nay sẽ là bệ phóng cho những năm tiếp theo.',
    'Cơ hội thăng tiến hoặc chuyển hướng sự nghiệp rõ ràng hơn — cần hành động quyết đoán khi cơ hội đến, đừng do dự quá lâu.',
    'Năm thích hợp để nâng cấp kỹ năng và mở rộng mạng lưới quan hệ chuyên môn — những đầu tư này tạo lợi thế cạnh tranh rõ rệt trong vài năm tới.',
    'Sự bền bỉ và nhất quán trong công việc năm nay sẽ được ghi nhận — tránh thay đổi hướng đi quá nhiều, tập trung hoàn thành những gì đã bắt đầu.',
    'Năm có thể xuất hiện đối tác hoặc cộng sự quan trọng — hãy chú tâm xây dựng các mối quan hệ hợp tác trung thực và bền vững.',
    'Năm thu hoạch thành quả từ những nỗ lực tích lũy trước đó — hãy tự tin tiến lên và nắm bắt cơ hội đang ở phía trước.',
    'Thử thách sự nghiệp năm nay sẽ rèn giũa bản lĩnh — những gì không phá vỡ bạn sẽ làm bạn mạnh mẽ hơn.',
    'Năm có thể chuyển mình lên vị trí mới hoặc lĩnh vực mới — sự chuẩn bị kỹ càng là yếu tố quyết định thành bại.',
    'Quý nhân xuất hiện trong lĩnh vực công việc — hãy chủ động học hỏi và đừng ngại nhờ hướng dẫn từ người kinh nghiệm hơn.',
    'Năm phù hợp để đặt mục tiêu táo bạo hơn — bạn có đủ năng lực, điều thiếu chỉ là dám bắt đầu.',
    'Tránh để căng thẳng công việc tích lũy thành mãn tính — nghỉ ngơi đúng mức giúp hiệu suất dài hạn tốt hơn nhiều.',
    'Các ý tưởng sáng tạo và đề xuất mới có khả năng được đón nhận tốt trong năm — hãy dũng cảm trình bày quan điểm riêng.',
  ],
  money: [
    'Tài lộc năm nay có xu hướng tích lũy dần đều — hạn chế đầu tư rủi ro cao, ưu tiên xây dựng quỹ dự phòng an toàn trước.',
    'Có thể xuất hiện khoản thu nhập tăng đột biến nhưng chi tiêu cũng tăng theo — cần lập ngân sách rõ ràng để không bị hổng tay.',
    'Vận tài lộc khá tốt nếu chủ động tạo ra cơ hội thay vì thụ động chờ đợi — đa dạng hóa nguồn thu nhập là hướng đi phù hợp.',
    'Năm phù hợp cho kế hoạch tài chính trung và dài hạn như tiết kiệm, đầu tư thụ động hoặc bảo hiểm nhân thọ.',
    'Cần đề phòng các khoản chi phát sinh bất ngờ — duy trì quỹ dự phòng ít nhất 3 tháng chi tiêu là phòng ngừa khôn ngoan.',
    'Tài lộc đến từ nhiều hướng khác nhau trong năm, hãy giữ tâm thế linh hoạt và không bỏ qua những cơ hội nhỏ nhưng chắc chắn.',
    'Nửa đầu năm cần thận trọng hơn về tài chính — nửa cuối có cơ hội cải thiện rõ rệt nếu quản lý tốt giai đoạn đầu.',
    'Đây là năm để học thêm về tài chính cá nhân — kiến thức đầu tư và quản lý tiền bạc sẽ mang lại lợi ích lớn trong nhiều năm tới.',
    'Cẩn thận với các lời mời đầu tư hấp dẫn không rõ nguồn gốc — lợi nhuận cao luôn đi kèm rủi ro cao tương ứng.',
    'Tài lộc tăng từ từ nhưng ổn định — đây là kiểu may mắn bền vững hơn những biến động lớn ngắn hạn.',
    'Năm phù hợp để trả nợ và làm sạch tài chính trước khi bước vào chu kỳ tăng trưởng mới.',
    'Hợp tác tài chính có thể mang lại lợi nhuận tốt — nhưng chỉ với người có giá trị và mục tiêu tương đồng.',
  ],
  health: [
    'Sức khỏe tổng quan ổn định trong năm nhưng cần xây dựng thói quen tốt từ sớm và duy trì đều đặn để phát huy hiệu quả.',
    'Sức khỏe tinh thần là ưu tiên hàng đầu năm nay — căng thẳng tích tụ lâu sẽ kéo theo sức khỏe thể chất đi xuống.',
    'Đây là năm tốt để bắt đầu hoặc củng cố chế độ luyện tập và ăn uống lành mạnh — nền tảng sức khỏe xây dựng trong năm nay sẽ theo bạn nhiều năm tới.',
    'Chú ý các vấn đề sức khỏe tái phát hoặc mãn tính — thăm khám định kỳ và không tự điều trị, phát hiện sớm luôn tốt hơn.',
    'Năng lượng năm nay dồi dào, phù hợp để thử thách bản thân với các mục tiêu thể chất mới.',
    'Giấc ngủ đủ và chất lượng cùng với sự cân bằng giữa làm việc và nghỉ ngơi là nền tảng sức khỏe quan trọng nhất cần gìn giữ.',
    'Năm nên chú trọng sức khỏe tiêu hóa và dinh dưỡng — những gì bạn ăn uống hàng ngày ảnh hưởng sâu sắc đến trạng thái toàn diện.',
    'Tránh để áp lực tích lũy mà không có lối thoát — tìm kiếm hoạt động thư giãn phù hợp trước khi kiệt sức xảy ra.',
    'Môi trường sống và làm việc ảnh hưởng nhiều đến sức khỏe năm nay — tạo không gian tích cực và thông thoáng.',
    'Nửa cuối năm cần chú ý hơn đến sức khỏe — đặc biệt khi thời tiết thay đổi hoặc áp lực công việc tăng cao.',
    'Đây là năm tốt để cai bỏ những thói quen xấu lâu nay — quyết tâm và kỷ luật đủ để tạo ra thay đổi thực sự.',
    'Vận động thường xuyên kết hợp với thiền hoặc yoga giúp cân bằng thể chất và tinh thần một cách hiệu quả trong năm nay.',
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

// ===== LUẬN GIẢI THEO TỪNG THÁNG TRONG NĂM =====

export interface MonthlyFortune {
  month: number
  monthName: string
  love: string
  career: string
  money: string
  health: string
  note: string
  score: number
}

const VN_MONTHS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
  'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
  'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]

const MONTH_BANKS = {
  love: [
    'Tình duyên thuận lợi, cảm xúc dâng cao — thời điểm tốt để bày tỏ và nuôi dưỡng mối quan hệ.',
    'Mối quan hệ cần sự kiên nhẫn tháng này — hiểu lầm dễ xảy ra, hãy lắng nghe trước khi phán xét.',
    'Cơ hội gặp gỡ người mới xuất hiện, người độc thân nên mở lòng hơn với những kết nối xã hội.',
    'Tháng bình lặng về tình cảm, phù hợp để tập trung vào bản thân và chuẩn bị cho giai đoạn sôi nổi hơn.',
    'Quan hệ đôi lứa ấm áp, các cặp đôi lâu năm có cơ hội làm mới cảm giác yêu thương ban đầu.',
    'Cẩn thận với sự ghen tuông và đa nghi không có cơ sở — tin tưởng là nền tảng của mọi mối quan hệ bền vững.',
    'Tháng thuận để đưa ra quyết định quan trọng về tình cảm: cam kết lâu dài hay tiến tới hôn nhân đều được hỗ trợ.',
    'Tình cảm cần không gian để thở — đừng áp đặt kỳ vọng quá nhiều, hãy để mọi thứ diễn ra tự nhiên.',
    'Người cũ có thể xuất hiện lại — suy nghĩ kỹ trước khi hành động, đừng để quá khứ kéo ngược tương lai.',
    'Tháng yêu thương ngọt ngào, các cuộc hẹn hò và khoảnh khắc riêng tư sẽ tạo ra kỷ niệm đẹp.',
    'Tình duyên đi ngang, nên tập trung vào việc cải thiện bản thân thay vì tìm kiếm sự xác nhận từ người khác.',
    'Giao tiếp cởi mở và thành thật là chìa khóa tháng này — những điều không nói dễ tạo ra hiểu lầm nghiêm trọng.',
  ],
  career: [
    'Công việc tiến triển tốt, nỗ lực của bạn được ghi nhận — thời điểm phù hợp để đề xuất ý tưởng mới.',
    'Tháng nặng về áp lực nhưng hoàn thành xong sẽ được ghi nhận — hãy kiên trì và không bỏ giữa chừng.',
    'Cơ hội hợp tác mới xuất hiện, hãy đánh giá kỹ và chọn đối tác có giá trị tương đồng.',
    'Tháng phù hợp để nâng cấp kỹ năng hoặc học hỏi điều mới — đầu tư vào bản thân lúc này sinh lợi cao.',
    'Tập trung hoàn thành những việc đang dang dở trước khi bắt đầu dự án mới — chất lượng quan trọng hơn số lượng.',
    'Tháng có thể nảy sinh xung đột với đồng nghiệp — giữ bình tĩnh và hướng đến giải pháp thực tế thay vì cảm tính.',
    'Năng suất tăng cao, thời điểm tốt để xử lý các việc đã trì hoãn và đặt mục tiêu mới cho giai đoạn tới.',
    'Tháng thuận cho việc đàm phán, ký kết hợp đồng hoặc trình bày dự án trước ban lãnh đạo.',
    'Cẩn thận với thông tin chưa được xác minh — đừng vội vàng quyết định dựa trên tin đồn hoặc nguồn chưa rõ.',
    'Tháng bình thường về sự nghiệp, phù hợp để củng cố những gì đang có và lên kế hoạch cho quý tới.',
    'Một quý nhân hoặc người cố vấn có thể xuất hiện — hãy cởi mở đón nhận sự hướng dẫn và phản hồi trung thực.',
    'Tháng thích hợp để xem xét lại định hướng sự nghiệp và đảm bảo bạn đang đi đúng con đường muốn theo đuổi.',
  ],
  money: [
    'Tài lộc khá tốt, có thể có khoản thu nhập thêm từ công việc phụ hoặc đầu tư nhỏ sinh lợi.',
    'Cần kiểm soát chi tiêu chặt hơn tháng này — những khoản phát sinh bất ngờ dễ làm hổng ngân sách đã lập.',
    'Không phải thời điểm tốt để đầu tư rủi ro cao — ưu tiên bảo vệ vốn và duy trì ổn định tài chính.',
    'Tháng thuận cho tiết kiệm và tích lũy — mỗi khoản nhỏ dành ra đều có ý nghĩa về lâu dài.',
    'Có thể xuất hiện cơ hội kiếm thêm, nhưng hãy đánh giá kỹ về rủi ro và thời gian đầu tư thực tế.',
    'Tài lộc ổn định, không có biến động lớn — phù hợp để duy trì kế hoạch tài chính đã đặt ra.',
    'Tháng có thể phải chi nhiều hơn dự kiến cho gia đình hoặc sức khỏe — cần linh hoạt điều chỉnh ngân sách.',
    'Vận tài lộc khởi sắc, những kế hoạch tài chính bắt đầu từ tháng này có xác suất thành công cao hơn.',
    'Cẩn thận với các khoản vay mượn hoặc bảo lãnh tài chính cho người khác — phải rõ ràng và có giấy tờ đầy đủ.',
    'Tháng tốt để rà soát lại các khoản chi cố định và tìm cách tối ưu hóa ngân sách cá nhân.',
    'Đừng để áp lực tài chính ảnh hưởng đến sức khỏe tinh thần — tìm giải pháp từng bước, không hấp tấp.',
    'Tài lộc đến từ hướng bất ngờ — hãy chú ý đến những cơ hội nhỏ mà bạn thường hay bỏ qua.',
  ],
  health: [
    'Sức khỏe tốt tháng này, duy trì thói quen luyện tập và ăn uống đang có để giữ vững trạng thái.',
    'Chú ý nghỉ ngơi đủ giấc, áp lực công việc có xu hướng ảnh hưởng đến chất lượng giấc ngủ.',
    'Hệ tiêu hóa cần được chú ý — ăn uống điều độ, tránh đồ cay nóng và thức khuya liên tiếp.',
    'Tháng phù hợp để bắt đầu hoặc đẩy mạnh thói quen thể dục — cơ thể đang trong trạng thái sẵn sàng.',
    'Cẩn thận với chấn thương khi vận động hoặc tai nạn nhỏ trong sinh hoạt — làm gì cũng nên thận trọng hơn.',
    'Sức khỏe tinh thần là ưu tiên tháng này — tìm cách xả stress qua hoạt động bạn yêu thích và thư giãn.',
    'Thời tiết thay đổi có thể ảnh hưởng đến hệ hô hấp — mặc ấm và duy trì vệ sinh cá nhân tốt.',
    'Tháng thuận để thăm khám sức khỏe định kỳ hoặc theo dõi lại các vấn đề mãn tính.',
    'Năng lượng dồi dào, nhưng đừng dùng quá mức — biết điểm dừng sẽ giúp bạn duy trì thể lực lâu bền.',
    'Uống đủ nước và chú ý đến sức khỏe làn da tháng này — những việc nhỏ nhưng ảnh hưởng lớn về lâu dài.',
    'Tránh để căng thẳng tích lũy thành mãn tính — thiền, hít thở sâu hoặc đi bộ sáng sớm giúp ích nhiều.',
    'Sức khỏe tổng thể ổn định — đây là nền tảng tốt để duy trì các mục tiêu thể chất và tinh thần dài hạn.',
  ],
  note: [
    'Tháng phù hợp để lên kế hoạch và chuẩn bị — những gì xây dựng tháng này sẽ là nền tảng cho tháng tới.',
    'Giữ bình tĩnh và linh hoạt khi đối mặt với thay đổi bất ngờ — sự kiên định là điểm tựa vững chắc nhất.',
    'Dành thời gian cho gia đình và người thân — những kết nối này là nguồn năng lượng không thể thay thế.',
    'Tập trung vào những gì bạn có thể kiểm soát, buông bỏ những gì ngoài tầm tay — đây là bí quyết bình an.',
    'Lắng nghe trực giác của mình — đặc biệt trong các quyết định liên quan đến con người và mối quan hệ.',
    'Tháng có nhiều cơ hội ẩn — đừng bỏ qua những cuộc trò chuyện tưởng như bình thường.',
    'Hãy cẩn thận với những cam kết vội vàng — suy nghĩ kỹ và đặt câu hỏi trước khi đồng ý với bất kỳ điều gì.',
    'Tháng tốt để bắt đầu một dự án sáng tạo hoặc thú vui mới — sự đổi mới nhỏ tạo ra niềm vui lớn.',
    'Hãy biết ơn những điều tốt đẹp đang có — lòng biết ơn thu hút thêm nhiều điều tốt lành.',
    'Tháng thích hợp để giải quyết những việc đã trì hoãn — đừng để chúng tích tụ thành gánh nặng.',
    'Duy trì kỷ luật với các mục tiêu đã đặt ra — sự nhất quán nhỏ tạo ra kết quả lớn theo thời gian.',
    'Tháng nhắc nhở về sự cân bằng — làm việc chăm chỉ nhưng cũng biết thưởng thức những niềm vui đơn giản.',
  ],
}

export function generateMonthlyBreakdown(
  subjectId: string,
  birthYear: number,
  birthMonth: number,
  birthDay: number,
  targetYear: number,
): MonthlyFortune[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const seed = `${subjectId}|by${birthYear}|bm${birthMonth}|bd${birthDay}|y${targetYear}|m${month}`
    return {
      month,
      monthName: VN_MONTHS[i],
      love: pick(seed, 'love', MONTH_BANKS.love),
      career: pick(seed, 'career', MONTH_BANKS.career),
      money: pick(seed, 'money', MONTH_BANKS.money),
      health: pick(seed, 'health', MONTH_BANKS.health),
      note: pick(seed, 'note', MONTH_BANKS.note),
      score: pickIndexInRange(seed, 'score', 2, 5),
    }
  })
}

// ===== LUẬN GIẢI THEO GIAI ĐOẠN CUỘC ĐỜI =====

export interface LifeStage {
  label: string
  ageRange: string
  emoji: string
  fate: string
  career: string
  love: string
}

const STAGE_BANKS = {
  nienhieu: {
    fate: [
      'Thời thơ ấu được bảo bọc trong tình yêu thương — nền móng cảm xúc vững chắc này là hành trang theo suốt cuộc đời.',
      'Tuổi nhỏ có nhiều biến động nhưng chính những thử thách sớm rèn luyện nên ý chí phi thường cho giai đoạn sau.',
      'Thiên tư sớm bộc lộ từ nhỏ — gia đình và thầy cô đóng vai trò quan trọng trong việc định hướng tài năng này.',
      'Tuổi thơ giàu trí tưởng tượng và tò mò — đây là nền tảng của sự sáng tạo và khả năng học hỏi suốt đời.',
      'Gia đình là trung tâm của cuộc sống niên thiếu — những giá trị được truyền đạt trong giai đoạn này trở thành la bàn đạo đức cả đời.',
      'Tuổi thơ có nhiều niềm vui bạn bè — khả năng kết nối và tạo dựng tình bạn hình thành mạnh mẽ từ rất sớm.',
      'Thời nhỏ hay mơ mộng và nhạy cảm — khả năng đồng cảm sâu sắc này là món quà quý giá trong các mối quan hệ sau này.',
      'Năng khiếu nổi bật được phát hiện sớm — nếu được nuôi dưỡng đúng cách, tiền đề cho sự xuất chúng đã sẵn có.',
      'Tuổi thơ chứng kiến nhiều thay đổi lớn — khả năng thích nghi và linh hoạt trở thành tố chất thiên bẩm.',
      'Giai đoạn niên thiếu có nhiều bài học khó nhưng quý giá — những kinh nghiệm đó trở thành sức mạnh nội tâm không ai lấy đi được.',
    ],
    career: [
      'Học tập không phải lúc nào cũng suôn sẻ nhưng sự kiên trì từ sớm đặt nền tảng tốt cho con đường tri thức sau này.',
      'Có khiếu với một hoặc vài môn học đặc biệt từ nhỏ — nuôi dưỡng đúng hướng sẽ trở thành nghề nghiệp ý nghĩa.',
      'Hoạt động ngoại khóa và nhóm bạn cùng sở thích đóng vai trò quan trọng trong việc định hình con người và giá trị.',
      'Áp lực học tập có thể lớn trong giai đoạn này — học cách cân bằng giữa nỗ lực và nghỉ ngơi là bài học quan trọng đầu đời.',
      'Tư duy độc lập hình thành sớm — thích đặt câu hỏi và tìm hiểu sâu hơn những gì được dạy là dấu hiệu tốt.',
      'Trải nghiệm đa dạng trong thời học sinh mở ra nhiều hướng đi tiềm năng cho tương lai.',
      'Kết quả học tập không phản ánh toàn bộ tiềm năng — có những tài năng cần thời gian và môi trường phù hợp để nở rộ.',
      'Sự định hướng từ thầy cô hoặc người lớn trong gia đình có ảnh hưởng sâu sắc đến lựa chọn nghề nghiệp sau này.',
      'Thích học qua thực tế và trải nghiệm hơn lý thuyết thuần túy — đây là phong cách học tập mang lại hiệu quả cao nhất.',
      'Giai đoạn niên thiếu là thời điểm gieo hạt — những kỹ năng và thói quen hình thành lúc này thu hoạch cả đời.',
    ],
    love: [
      'Tình bạn đóng vai trò rất quan trọng trong thời niên thiếu — những người bạn thật sự từ giai đoạn này thường gắn bó cả đời.',
      'Có thể trải qua những rung động tình cảm đầu đời sớm — những trải nghiệm này giúp hiểu sâu hơn về cảm xúc bản thân.',
      'Cảm xúc nhạy bén và dễ bị tổn thương trong giai đoạn này — cần môi trường an toàn để học cách xử lý tình cảm lành mạnh.',
      'Gia đình là mối quan hệ nền tảng nhất thời niên thiếu — những gì học được về tình yêu thương từ cha mẹ sẽ là mô hình cho mọi mối quan hệ sau.',
      'Tình bạn nhiều màu sắc và đôi khi có hiểu lầm — học cách hòa giải và tha thứ từ sớm là bài học vô giá.',
      'Thường được bạn bè quý mến và tin tưởng — khả năng giữ bí mật và chung thủy trong tình bạn hình thành từ giai đoạn này.',
      'Có thể trải qua cảm giác cô đơn hoặc khác biệt trong nhóm bạn — đây là bước quan trọng để hiểu và chấp nhận bản thân.',
      'Thiên về ít bạn nhưng tình cảm sâu sắc hơn là nhiều bạn nhưng hời hợt — chất lượng quan hệ quan trọng hơn số lượng.',
      'Giai đoạn hình thành ý niệm về tình yêu qua quan sát và cảm nhận — những hình mẫu này ảnh hưởng đến cách yêu sau này.',
      'Ký ức vui vẻ với gia đình trong thời thơ ấu là nguồn năng lượng tích cực theo suốt hành trình trưởng thành.',
    ],
  },
  thanhnien: {
    fate: [
      'Giai đoạn bùng nổ năng lượng và khám phá bản thân — đây là thời kỳ đặt nền móng cho toàn bộ hành trình phía trước.',
      'Thanh niên là giai đoạn nhiều lựa chọn quan trọng — mỗi quyết định về học vấn, nghề nghiệp và tình cảm đều có sức nặng lớn.',
      'Giai đoạn thử nghiệm và sai lầm — những vấp ngã lúc còn trẻ là học phí không thể mua bằng tiền, không cần sợ hãi.',
      'Thanh xuân tràn đầy cơ hội nhưng cũng đầy cám dỗ — giữ được định hướng rõ ràng là lợi thế cạnh tranh lớn nhất.',
      'Đây là giai đoạn xây dựng bản sắc cá nhân — biết mình là ai và muốn gì sẽ tiết kiệm rất nhiều năm tháng sau này.',
      'Tính cách thật sự được bộc lộ đầy đủ trong giai đoạn này — môi trường và những người xung quanh ảnh hưởng sâu sắc.',
      'Thanh niên là thời điểm vận khí mở ra nhiều hướng — điều quan trọng không phải chọn đúng mà là dám chọn và dấn thân.',
      'Giai đoạn có nhiều biến động cảm xúc — học cách quản lý cảm xúc và áp lực là kỹ năng sống quan trọng nhất lúc này.',
      'Những mối quan hệ xây dựng trong giai đoạn này — bạn bè, thầy trò, đồng nghiệp — sẽ là mạng lưới nâng đỡ cả đời.',
      'Đây là thời kỳ vàng để đầu tư vào bản thân — kiến thức, kỹ năng và trải nghiệm thu nạp lúc còn trẻ sinh lợi cao nhất.',
    ],
    career: [
      'Những năm đầu sự nghiệp đầy thử thách nhưng mỗi khó khăn đều là bài học thực chiến không thể học trong sách vở.',
      'Đây là giai đoạn xác định lĩnh vực và hướng đi — đừng sợ thử và sai, sợ không dám thử mới thật sự lãng phí.',
      'Tinh thần học hỏi và khiêm tốn trong giai đoạn này mở ra những cơ hội mà người tự mãn không bao giờ được thấy.',
      'Mạng lưới quan hệ xây dựng trong giai đoạn thanh niên sẽ trở thành đòn bẩy sự nghiệp quan trọng về sau.',
      'Hãy tìm kiếm người mentor — người đi trước có thể giúp bạn tránh được nhiều sai lầm tốn kém và mất thời gian.',
      'Đừng chỉ làm vì tiền — tìm ý nghĩa trong công việc từ sớm sẽ tạo ra động lực bền vững hơn bất kỳ mức lương nào.',
      'Chấp nhận rủi ro hợp lý lúc còn trẻ — đây là thời điểm tốt nhất để thử những con đường mới và táo bạo.',
      'Sự nghiệp trong giai đoạn này có thể thay đổi hướng nhiều lần — điều đó hoàn toàn bình thường và thậm chí cần thiết.',
      'Xây dựng thương hiệu cá nhân và danh tiếng chuyên môn từ sớm — uy tín được tích lũy theo năm tháng không thể mua được.',
      'Năng lượng và sức trẻ là tài sản lớn nhất trong giai đoạn này — hãy dùng nó một cách có mục đích và chiến lược.',
    ],
    love: [
      'Tình yêu tuổi trẻ mãnh liệt và đẹp đẽ — dù không phải mối nào cũng kết thúc bằng hôn nhân, mỗi mối đều dạy điều quý giá.',
      'Giai đoạn khám phá bản thân trong tình yêu — hiểu được mình cần gì và không cần gì ở người bạn đời là bài học quan trọng.',
      'Có thể trải qua những mối tình sâu sắc và đau lòng — những trải nghiệm này không phải lãng phí mà là định hình con người.',
      'Đây là giai đoạn nhiều người gặp được người bạn đời quan trọng — hãy cởi mở và chân thành, không cần diễn.',
      'Tình cảm tuổi này thường mạnh mẽ nhưng chưa đủ chín — sự bao dung và học hỏi từ lỗi lầm quan trọng hơn sự hoàn hảo.',
      'Học cách yêu bản thân đúng nghĩa trước khi yêu người khác — đây là nền tảng của mọi mối quan hệ lành mạnh.',
      'Áp lực xã hội về tình cảm và hôn nhân có thể lớn — hãy sống theo nhịp của mình, không phải kỳ vọng của người khác.',
      'Giai đoạn có thể đưa ra quyết định hôn nhân quan trọng — hãy chọn người cùng giá trị, không chỉ cùng cảm xúc nhất thời.',
      'Tình bạn thời thanh niên thường trở thành tình yêu — những mối quan hệ bắt đầu từ sự hiểu biết thật sự bền vững hơn.',
      'Mở lòng trải nghiệm nhưng đừng đánh mất bản thân trong bất kỳ mối quan hệ nào — bản sắc riêng là tài sản quý giá nhất.',
    ],
  },
  trungnien: {
    fate: [
      'Trung niên là giai đoạn gặt hái — những hạt giống gieo từ thời thanh xuân bắt đầu cho quả ngọt ngào.',
      'Đây là thời kỳ đỉnh cao về nhiều mặt — kinh nghiệm, nguồn lực và ảnh hưởng xã hội đều đạt đến mức cao nhất.',
      'Giai đoạn trung niên mang theo nhiều trách nhiệm nhưng cũng nhiều thỏa mãn — cảm giác làm chủ cuộc đời mình rõ ràng nhất.',
      'Đây là giai đoạn định nghĩa lại bản thân — nhiều người khám phá ra ý nghĩa sâu sắc hơn của thành công và hạnh phúc.',
      'Trung niên là lúc bản lĩnh và tính cách thật sự được thể hiện rõ nét — những giá trị cốt lõi đã được kiểm nghiệm qua thời gian.',
      'Giai đoạn có nhiều trách nhiệm kép — cả thế hệ trước và thế hệ sau đều cần sự quan tâm và sắp xếp khéo léo.',
      'Đây là thời điểm để đầu tư cho tương lai dài hạn — quyết định tài chính và sức khỏe lúc này ảnh hưởng sâu rộng đến những thập kỷ sau.',
      'Trung niên mang lại sự bình tĩnh và tự tin mà tuổi trẻ chưa có — khả năng phán đoán và quyết định đạt độ chín muồi.',
      'Giai đoạn có thể trải qua những thách thức lớn về gia đình và sự nghiệp — nhưng cũng là lúc bạn đủ mạnh để vượt qua.',
      'Đây là thời kỳ để xây dựng di sản — những gì bạn tạo ra và trao truyền trong giai đoạn này sẽ tồn tại lâu hơn bạn nghĩ.',
    ],
    career: [
      'Sự nghiệp đạt đến giai đoạn chín muồi — kinh nghiệm tích lũy trở thành lợi thế cạnh tranh không ai có thể dễ dàng sao chép.',
      'Đây là thời điểm để chuyển từ người thực hiện sang người lãnh đạo và dẫn dắt — tầm nhìn quan trọng hơn kỹ thuật.',
      'Trung niên thường là giai đoạn đỉnh cao thu nhập và ảnh hưởng — hãy dùng vị thế này để tạo ra giá trị lớn hơn.',
      'Mạng lưới quan hệ đã được xây dựng nhiều năm bắt đầu sinh lợi mạnh — uy tín và danh tiếng trở thành tài sản thực sự.',
      'Giai đoạn phù hợp để bắt đầu dự án lớn hoặc cơ sở kinh doanh riêng — bạn có đủ kinh nghiệm và nguồn lực để triển khai.',
      'Khả năng dạy và truyền đạt kinh nghiệm cho thế hệ trẻ mang lại ý nghĩa sâu sắc và vị thế xã hội.',
      'Tránh để sự thoải mái trong vùng an toàn cản trở sự phát triển — tiếp tục học và đổi mới là cách duy trì cạnh tranh.',
      'Đây là giai đoạn để tổng kết và điều chỉnh hướng đi — nhiều người tìm ra đam mê thật sự của mình sau khi đã trải qua đủ mọi thứ.',
      'Cân bằng giữa sự nghiệp và gia đình trở thành ưu tiên cần quản lý có ý thức hơn bao giờ hết.',
      'Những kỹ năng lãnh đạo và chiến lược tích lũy trong giai đoạn này sẽ tiếp tục phát huy giá trị ngay cả khi về hưu.',
    ],
    love: [
      'Tình cảm trong giai đoạn trung niên thường đi vào chiều sâu — sự ổn định và bao dung thay thế cho sự mãnh liệt nhất thời.',
      'Hôn nhân bước vào giai đoạn thử thách thực sự — những cặp đôi dành thời gian nuôi dưỡng mối quan hệ sẽ tìm lại được ngọn lửa ban đầu.',
      'Đây là giai đoạn xây tổ ấm và nuôi dưỡng gia đình — những khoảnh khắc bình dị nhất lại là ký ức quý giá nhất.',
      'Trung niên mang lại sự trân trọng sâu hơn về tình yêu — bạn hiểu rõ hơn những gì thực sự quan trọng trong một mối quan hệ.',
      'Giao tiếp chân thành và không phán xét trở nên quan trọng hơn bao giờ hết trong giai đoạn này.',
      'Cân bằng giữa tình cảm đôi lứa và trách nhiệm cha mẹ là nghệ thuật đòi hỏi sự chú tâm thường xuyên.',
      'Đây là giai đoạn nhiều người khám phá lại nhau sau những năm bận rộn — đi du lịch cùng, có sở thích chung mang lại sức sống mới.',
      'Sự độc lập và không gian cá nhân trong hôn nhân quan trọng không kém sự gắn kết — cân bằng cả hai là bí quyết bền vững.',
      'Những mối quan hệ vượt qua được giai đoạn trung niên đầy áp lực sẽ trở nên vững chắc như kim cương.',
      'Hãy đầu tư thời gian có chất lượng cho người bạn đời — giữa muôn vàn ưu tiên, mối quan hệ này cần được đặt ở vị trí xứng đáng.',
    ],
  },
  hauvan: {
    fate: [
      'Hậu vận là giai đoạn hưởng thụ thành quả của cả một đời nỗ lực — sự bình yên và tự do được tìm lại theo cách thật sự.',
      'Đây là thời kỳ trí tuệ đạt đến độ chín tuyệt vời — sự kết hợp giữa kinh nghiệm và thời gian tự do tạo ra những điều đáng giá.',
      'Hậu vận mang lại cơ hội để khám phá những phần của bản thân chưa có thời gian thể hiện trước đây.',
      'Giai đoạn cuộc đời này thường là thời kỳ bình yên và mãn nguyện nhất — khi đã buông bỏ được những gì không cần thiết.',
      'Đây là thời điểm để nhìn lại và trân trọng hành trình đã qua — mỗi bước đi, dù vui hay buồn, đều có ý nghĩa riêng.',
      'Hậu vận đẹp hay không phụ thuộc vào những gì được tích lũy trước đó — về cả vật chất, sức khỏe lẫn mối quan hệ.',
      'Đây là giai đoạn truyền đạt — những kinh nghiệm và bài học của bạn có thể trở thành kim chỉ nam quý giá cho thế hệ sau.',
      'Sức khỏe và tinh thần trở thành hai tài sản quý nhất trong giai đoạn này — đầu tư cho chúng là ưu tiên hàng đầu.',
      'Hậu vận mang đến sự tự do để theo đuổi những đam mê chưa có dịp thực hiện — đây là cơ hội để sống trọn vẹn hơn.',
      'Giai đoạn này là thước đo thực sự của những giá trị đã sống theo — người sống đúng với bản thân sẽ có hậu vận viên mãn.',
    ],
    career: [
      'Hậu vận là giai đoạn chuyển từ việc xây dựng sang việc truyền đạt — vai trò cố vấn và mentor mang lại ý nghĩa sâu sắc.',
      'Những kiến thức và kinh nghiệm tích lũy cả đời có thể được chuyển hóa thành di sản có giá trị — sách vở, dạy học hoặc tư vấn.',
      'Đây là giai đoạn để làm những việc có ý nghĩa thay vì chỉ có lợi nhuận — nhiều người tìm thấy sự thỏa mãn sâu sắc hơn.',
      'Hậu vận thuận lợi cho các dự án sáng tạo và đóng góp xã hội — đây là cách để tiếp tục tạo ra giá trị theo điều kiện của mình.',
      'Không cần chứng minh gì nữa — đây là giai đoạn tự do làm những gì thật sự yêu thích mà không bị ràng buộc.',
      'Giai đoạn phù hợp để kiếm thêm thu nhập thụ động từ những gì đã xây dựng — tài chính có thể tiếp tục tăng trưởng.',
      'Hãy chú trọng duy trì sức khỏe tinh thần và thể chất — đây là yếu tố then chốt để tiếp tục cống hiến và tận hưởng cuộc sống.',
      'Nhiều người tìm thấy đam mê mới trong giai đoạn hậu vận — không bao giờ là quá muộn để bắt đầu điều mới mẻ.',
      'Mạng lưới quan hệ xây dựng cả đời trở thành nguồn hỗ trợ vô giá trong giai đoạn này.',
      'Đây là thời điểm để tổng kết và đóng góp di sản nghề nghiệp — những gì bạn truyền lại sẽ tồn tại lâu hơn bản thân.',
    ],
    love: [
      'Tình cảm hậu vận mang sắc thái của sự biết ơn và đồng hành — hai người bạn đời cùng nhìn về phía trước thay vì nhìn vào nhau.',
      'Đây là giai đoạn tình yêu trở nên nhẹ nhàng và sâu lắng nhất — không còn sóng gió nhưng vẫn ấm áp và có chiều sâu.',
      'Gia đình — con cháu, anh em — trở thành nguồn hạnh phúc chính trong giai đoạn này.',
      'Hãy trân trọng những khoảnh khắc bình dị bên người thân — chính những điều nhỏ bé tạo nên hạnh phúc bền vững nhất.',
      'Nếu từng có những mâu thuẫn trong mối quan hệ, hậu vận là thời điểm tốt để hàn gắn và tha thứ — buông bỏ nhẹ người lẫn nhẹ mình.',
      'Người bạn đời trở thành người tri kỷ thực sự trong giai đoạn này — sự thấu hiểu sâu sắc qua năm tháng là món quà vô giá.',
      'Hậu vận đẹp khi có người đồng hành — đầu tư duy trì và làm mới mối quan hệ quan trọng chính là đầu tư cho hạnh phúc của bản thân.',
      'Giai đoạn phù hợp để kết nối lại với những người bạn cũ và mối quan hệ ý nghĩa đã bị bận rộn che lấp nhiều năm.',
      'Tình yêu thương và sự quan tâm mà bạn trao đi suốt cả đời sẽ trở về trong giai đoạn hậu vận.',
      'Đây là lúc để nhận ra rằng những mối quan hệ thật sự quan trọng hơn mọi thành tựu vật chất — và tận hưởng điều đó.',
    ],
  },
}

const STAGE_DEFS = [
  { key: 'nienhieu', label: 'Thời niên thiếu', ageRange: '0 – 18 tuổi', emoji: '🌱' },
  { key: 'thanhnien', label: 'Thanh niên', ageRange: '18 – 30 tuổi', emoji: '🔥' },
  { key: 'trungnien', label: 'Trung niên', ageRange: '30 – 50 tuổi', emoji: '🌳' },
  { key: 'hauvan', label: 'Hậu vận', ageRange: '50+ tuổi', emoji: '🌟' },
] as const

export function generateLifeStages(
  subjectId: string,
  birthMonth: number,
  birthDay: number,
): LifeStage[] {
  return STAGE_DEFS.map(({ key, label, ageRange, emoji }) => {
    const banks = STAGE_BANKS[key as keyof typeof STAGE_BANKS]
    const seed = `${subjectId}|bm${birthMonth}|bd${birthDay}|stage-${key}`
    return {
      label,
      ageRange,
      emoji,
      fate: pick(seed, 'fate', banks.fate),
      career: pick(seed, 'career', banks.career),
      love: pick(seed, 'love', banks.love),
    }
  })
}
