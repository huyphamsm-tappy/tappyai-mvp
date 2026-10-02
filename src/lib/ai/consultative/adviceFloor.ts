// ── ADVICE FLOOR (owner 02/10, A5) ───────────────────────────────────────────────────────────────────────────────
//
// The advice block (adviceBlock.ts) asks the model for tips, what is missing and a next step. A model that ignores it
// (measured: the same prompt gave tips on one run and a bare list on the next) must not decide whether the user gets
// advice. After the guards, this module checks the reply and — only for the parts that are MISSING — appends curated
// GENERAL advice (timing, how to choose, what to bring, what to compare). It contains no fact about a place, a fare or a
// product: no price, hour, address, distance, promotion, flight time or availability, and no name. Vietnamese only
// (an English turn keeps the model's own text). Pure text in → text out; it never touches cards, buttons or links.

export type AdviceDomain = 'travel' | 'flight' | 'shopping' | 'food' | 'spa' | 'entertainment'

export interface AdviceFloorCtx {
  domain: string | undefined
  turn: string | undefined
  known?: Record<string, string>
  lang?: string
}

const TIPS: Record<AdviceDomain, string[]> = {
  travel: [
    'Đặt phòng sớm nếu đi cuối tuần hoặc dịp lễ, và xem kỹ chính sách hủy phòng.',
    'Xếp lịch nhẹ: mỗi buổi 1–2 điểm, chừa thời gian di chuyển và nghỉ.',
    'Kiểm tra thời tiết sát ngày đi và mang đồ phù hợp (áo mưa gọn, giày dễ đi).',
  ],
  flight: [
    'Cuối tuần và dịp lễ giá thường tăng, nên đặt sớm và so sánh ít nhất hai trang (Traveloka, Trip.com) cho cùng hãng.',
    'Kiểm tra hành lý ký gửi đã gồm trong vé chưa; mua thêm trước thường lợi hơn mua tại sân bay.',
    'Giờ bay sớm hoặc khuya thường vắng hơn; nhớ có mặt sớm để làm thủ tục.',
  ],
  shopping: [
    'So giá ít nhất 2–3 nơi (sàn và cửa hàng) trước khi mua.',
    'Kiểm tra đúng đời máy, kích thước hoặc loại cần dùng, và chính sách bảo hành, đổi trả.',
    'Ưu tiên shop có nhiều đánh giá; cẩn thận hàng nhái hoặc giá rẻ bất thường.',
  ],
  food: [
    'Giờ cao điểm bữa trưa và bữa tối thường đông; đến sớm hoặc đặt bàn trước nếu đi nhóm.',
    'Hỏi quán món đặc trưng và khẩu phần trước khi gọi để vừa số người.',
    'Hỏi chỗ gửi xe và đường đi trước khi đến.',
  ],
  spa: [
    'Đặt lịch trước, nhất là cuối tuần và buổi tối.',
    'Hỏi rõ gói dịch vụ, thời lượng và phụ phí trước khi bắt đầu.',
    'Đừng ăn quá no trước khi làm; báo kỹ thuật viên nếu có vấn đề sức khỏe (đau lưng, dị ứng tinh dầu…).',
  ],
  entertainment: [
    'Cuối tuần và buổi tối thường đông; nên đặt phòng, bàn hoặc vé trước.',
    'Đi nhóm thì thống nhất ngân sách và cách chia tiền trước để đỡ phát sinh.',
    'Hỏi giờ mở cửa và phụ thu (giờ cao điểm, đồ uống) trước khi đến.',
  ],
}

const TRAVEL_STYLE_TIPS: Record<string, string[]> = {
  núi: [
    'Mang giày bám tốt, áo mưa gọn và nước uống; đường núi dễ trơn sau mưa.',
    'Đi bộ hoặc leo núi vào sáng sớm cho mát và vắng; đừng xếp quá nhiều điểm xa nhau.',
    'Cuối tuần và dịp lễ nên đặt phòng sớm; kiểm tra dự báo thời tiết sát ngày đi.',
  ],
  biển: [
    'Mang kem chống nắng, mũ và đồ bơi; ra biển sáng sớm hoặc chiều muộn cho đỡ nắng gắt.',
    'Cuối tuần và dịp lễ nên đặt phòng, xe sớm vì giá thường tăng sát ngày.',
    'Hỏi rõ giá hải sản và dịch vụ trước khi gọi ở khu du lịch để tránh bị hét giá.',
  ],
}

const MISSING: Record<AdviceDomain, string> = {
  travel: 'Mình chưa có giá phòng theo đúng ngày bạn đi — xem giá thật ở nút đặt phòng bên dưới.',
  flight: 'Mình chưa có giá và giờ bay theo ngày bạn đi — bấm nút xem giá bên dưới để biết giá thật.',
  shopping: 'Giá có thể thay đổi — xem giá hiện tại ở nút mua bên dưới.',
  food: 'Giá và giờ mở cửa chi tiết xem ở thẻ bên dưới, hoặc gọi quán xác nhận trước khi đi.',
  spa: 'Giá dịch vụ chưa có — gọi hỏi giá trước khi đến.',
  entertainment: 'Giá và giờ chi tiết xem ở thẻ bên dưới, hoặc gọi nơi đó xác nhận.',
}

const NEXT: Record<AdviceDomain, string> = {
  travel: 'Bước tiếp: bấm “Lên kế hoạch chi tiết” để mình xếp lịch từng ngày, chỗ ăn và ngân sách.',
  flight: 'Bước tiếp: mở nút Traveloka hoặc Trip.com, so giá vài khung giờ rồi chốt chuyến.',
  shopping: 'Bước tiếp: so giá ở các nút mua bên dưới rồi chốt; muốn so kỹ hơn thì bấm “Xem thêm”.',
  food: 'Bước tiếp: gọi hoặc đặt chỗ trước, hoặc bấm “Lên kế hoạch chi tiết” để mình xếp cả buổi.',
  spa: 'Bước tiếp: gọi đặt lịch trước, hoặc bấm “Lên kế hoạch chi tiết” để mình xếp cả buổi.',
  entertainment: 'Bước tiếp: đặt chỗ trước, hoặc bấm “Lên kế hoạch chi tiết” để mình xếp cả buổi.',
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const MACHINE = /^\s*\[(?:FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+|\/)/
const REMAINING = /^\s*(?:Mình )?[Cc]òn \d+ lựa chọn/
const ALT_BULLET = /^\s*[-*•]\s*\*\*/
const BULLET = /^\s*[-*•]\s+\S/

function isDomain(d: string | undefined): d is AdviceDomain { return !!d && d in TIPS }

/** How many practical-tip units the reply holds (non-card bullets + "theo kinh nghiệm chung" / imperative-advice sentences). */
export function tipUnits(text: string): number {
  const body = text.split('\n').filter(l => !MACHINE.test(l) && !REMAINING.test(l))
  const bullets = body.filter(l => BULLET.test(l) && !ALT_BULLET.test(l) && l.trim().length >= 25).length
  const prose = body.filter(l => !BULLET.test(l)).join(' ')
  const f = fold(prose)
  const sentences = f.split(/[.!?;\n]+/).filter(s => /\b(?:theo kinh nghiem chung|nen (?!chon)|dung |tranh |nho |mang |dat (?:truoc|som)|so sanh|hoi (?:ro|quan|truoc)|kiem tra|luu y)\b/.test(s)).length
  return bullets + Math.min(sentences, 3)
}

// Prose only: the system's own "Còn N lựa chọn nữa — xem thêm" line and the button / marker lines are not the model's advice.
const proseOf = (text: string) => text.split('\n').filter(l => !REMAINING.test(l) && !MACHINE.test(l)).join('\n')
const hasNextStep = (text: string) => /(?<![\p{L}])(?:bước tiếp|tiếp theo|bấm|nhấn|lên kế hoạch chi tiết|đặt trước|đặt chỗ|chốt)(?![\p{L}])/iu.test(proseOf(text))
const hasMissingNote = (text: string) => /(?<![\p{L}])(?:chưa có (?:thông tin|giá|dữ liệu)|chưa ghi|chưa cho biết|chưa rõ|xem (?:giá|ở|tại|trên)|gọi (?:hỏi|quán|nơi)|nút)(?![\p{L}])/iu.test(proseOf(text))
const hasDayLines = (text: string) => /(?:^|\n)\s*(?:[-*•]\s*)?(?:\*\*)?Ngày 1\b/i.test(text)

function dayLines(days: number, style: string | undefined, origin: string | undefined): string[] {
  const from = origin ? ` từ ${origin}` : ''
  const mid = style === 'núi' ? 'sáng sớm khám phá núi · chiều nghỉ ngơi hoặc dạo điểm gần · tối ăn đặc sản địa phương, nghỉ sớm'
    : style === 'biển' ? 'sáng tắm biển · chiều nghỉ, cà phê ven biển · tối ăn hải sản, dạo phố đêm'
      : 'sáng khám phá điểm chính · chiều nghỉ hoặc dạo khu gần · tối ăn đặc sản, dạo phố'
  const out: string[] = []
  for (let d = 1; d <= days; d++) {
    if (d === 1) out.push(`Ngày 1: sáng di chuyển${from} · chiều nhận phòng, dạo nhẹ quanh khu ở · tối dùng bữa tối, nghỉ sớm`)
    else if (d === days) out.push(`Ngày ${d}: sáng ăn sáng, dạo nhẹ · chiều trả phòng, về lại${origin ? ` ${origin}` : ''}`)
    else out.push(`Ngày ${d}: ${mid}`)
  }
  return out
}

/**
 * Appends what the reply lacks: practical tips (to at least 2), a "what is missing / where to look" note, a next step and,
 * for a trip pick that names its length, a short generic day-by-day line set. Returns the text unchanged when it already has
 * everything, when the turn is not a pick/more/reject, or when the language is not Vietnamese.
 */
export function ensureAdviceFloor(text: string, ctx: AdviceFloorCtx): { text: string; added: string[] } {
  const none = { text, added: [] as string[] }
  if ((ctx.lang ?? 'vi') !== 'vi') return none
  if (!isDomain(ctx.domain) || !['pick', 'more', 'reject'].includes(ctx.turn ?? '')) return none
  const domain = ctx.domain
  const known = ctx.known ?? {}
  const added: string[] = []
  const block: string[] = []

  if (domain === 'travel') {
    const days = Number((known.so_ngay ?? '').match(/\d+/)?.[0])
    if (Number.isFinite(days) && days >= 2 && days <= 7 && !hasDayLines(text)) {
      block.push('Lịch gợi ý chung (theo kinh nghiệm chung):', ...dayLines(days, known.phong_cach, known.xuat_phat), '')
      added.push('days')
    }
  }
  const have = tipUnits(text)
  if (have < 2) {
    const pool = domain === 'travel' ? TRAVEL_STYLE_TIPS[known.phong_cach ?? ''] ?? TIPS.travel : TIPS[domain]
    const need = Math.min(3, 3 - have)
    block.push('Mẹo (theo kinh nghiệm chung):', ...pool.slice(0, Math.max(need, 2)).map(t => `- ${t}`))
    added.push('tips')
  }
  if (!hasMissingNote(text)) { block.push(MISSING[domain]); added.push('missing') }
  if (!hasNextStep(text)) { block.push(NEXT[domain]); added.push('next') }
  if (added.length === 0) return none

  const lines = text.split('\n')
  // Before the first "Mình còn N lựa chọn" / button / machine line that FOLLOWS the prose (a marker block that opens the
  // reply is not an insertion point); at the very end when there is none.
  const firstProse = lines.findIndex(l => l.trim() && !MACHINE.test(l))
  let at = firstProse < 0 ? -1 : lines.findIndex((l, i) => i > firstProse && (REMAINING.test(l) || MACHINE.test(l)))
  if (at < 0) at = lines.length
  const head = lines.slice(0, at)
  while (head.length && !head[head.length - 1].trim()) head.pop()
  const out = [...head, '', ...block.filter((l, i, a) => !(l === '' && (i === 0 || a[i - 1] === ''))), '', ...lines.slice(at)]
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n'), added }
}
