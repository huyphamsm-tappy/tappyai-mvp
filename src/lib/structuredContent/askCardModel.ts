// The quick-ask card, redesigned (owner 30/09). The SHARED web + Android spec is docs/design/ask-card/README.md
// (R23 + R23.1): the question kind, sub-line, icon and tile-image key come from the SAME tables on both clients.
// VIEW ONLY: the server's [TAPPY_ASK] contract ({id, q, options[]} × ≤3) is unchanged — everything here is read from
// what the server already sends.
import { composeAskAnswer, type AskQuestionView } from './parseAsk'

export type AskArea = 'food' | 'shopping' | 'travel' | 'entertainment' | 'spa' | 'main'
/** README §2: LOẠI (photo tiles, several) · AI ĐI · KHI NÀO · NGÂN SÁCH · KHÁC (icon tiles, one). */
export type AskStepKind = 'type' | 'party' | 'time' | 'budget' | 'other'

/** Lower case, no marks — the README compares that way. ASCII only after this, so `\b` is safe. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
/** Lower case WITH marks — for the words that collide once folded (rạp/rap, lẩu/lâu, đồ/đỏ, chợ/cho …). */
const lower = (s: string) => s.normalize('NFC').toLowerCase()

/** The area of the ask turn, from the question ids the router emits (consultRouter.ts). R23.1: drives the header. */
export function askAreaOf(questions: readonly AskQuestionView[]): AskArea {
  const ids = new Set(questions.map(q => q.id))
  if (ids.has('dish') || ids.has('mode')) return 'food'
  if (ids.has('service') || ids.has('special')) return 'spa'
  if (ids.has('activity') || ids.has('vibe') || ids.has('artist')) return 'entertainment'
  if (ids.has('date') || ids.has('origin') || ids.has('transport')) return 'travel'
  if (ids.has('line') || ids.has('must') || ids.has('condition') || ids.has('purpose')) return 'shopping'
  const style = questions.find(q => q.id === 'style')
  if (style) return style.options.some(o => /\b(?:massage|toan than|vai gay|da nong|nail|son gel|dinh da|dap bot|mong|toc|cat|uon|nhuom|phuc hoi|goi)\b/.test(fold(o))) ? 'spa' : 'travel'
  // A hotel ask that already knows the dates carries only party / budget per night.
  if (questions.some(q => /\b(?:moi dem|may dem)\b/.test(fold(q.q)) || (q.id === 'party' && q.options.some(o => /\b(?:gia dinh|nhom ban)\b/.test(fold(o)))))) return 'travel'
  return 'main'
}

// README §2 — `id` first, then the words of `q`. R23.1 adds the router's `dish` and `service` to the LOẠI ids.
const TYPE_IDS = new Set(['style', 'type', 'kind', 'activity', 'genre', 'artist', 'cuisine', 'category', 'loai', 'mon', 'product', 'dish', 'service'])
const PARTY_IDS = new Set(['party', 'people', 'group', 'pax'])
const TIME_IDS = new Set(['time', 'when', 'date', 'day'])
const BUDGET_IDS = new Set(['budget', 'price'])
export function askStepKind(q: AskQuestionView): AskStepKind {
  if (TYPE_IDS.has(q.id)) return 'type'
  if (PARTY_IDS.has(q.id)) return 'party'
  if (TIME_IDS.has(q.id)) return 'time'
  if (BUDGET_IDS.has(q.id)) return 'budget'
  const t = fold(q.q)
  if (/\b(?:lam gi|loai|the loai|kieu|mon|thich gi|hoat dong|ca si)\b/.test(t)) return 'type'
  if (/\b(?:may nguoi|voi ai|bao nhieu nguoi)\b/.test(t)) return 'party'
  if (/\b(?:luc nao|khi nao|thoi diem|hom nao|ngay|gio)\b/.test(t)) return 'time'
  if (/\b(?:bao nhieu|gia|ngan sach|tam)\b/.test(t)) return 'budget'
  return 'other'
}
export const askStepMulti = (kind: AskStepKind) => kind === 'type'

/** README §2 sub-lines; KHÁC has none. */
export const ASK_STEP_SUB: Record<AskStepKind, string> = {
  type: 'Chọn một hoặc nhiều', party: 'Chọn nhóm phù hợp', time: 'Chọn thời điểm', budget: 'Chọn mức giá', other: '',
}

/** R23.1 (owner 30/09: "tiêu đề/phụ đề theo từng mảng") — entertainment / main keep the mockup's own words. */
export const ASK_HEADER: Record<AskArea, { title: string; sub: string; example: string }> = {
  entertainment: { title: 'Tìm gì cho bạn hôm nay?', sub: 'Chọn nhanh vài thứ, Tappy sẽ tìm phần còn lại.', example: 'Ví dụ: muốn chỗ chill, ít ồn, có view đẹp...' },
  food: { title: 'Hôm nay ăn gì nhỉ?', sub: 'Chọn nhanh vài thứ, Tappy sẽ tìm quán hợp nhất.', example: 'Ví dụ: không cay, có chỗ đậu ô tô...' },
  shopping: { title: 'Bạn đang tìm món gì?', sub: 'Chọn nhanh vài thứ, Tappy sẽ lọc giúp bạn.', example: 'Ví dụ: màu xanh, bảo hành chính hãng...' },
  travel: { title: 'Chuyến đi thế nào đây?', sub: 'Chọn nhanh vài thứ, Tappy sẽ lên phương án.', example: 'Ví dụ: có hồ bơi, gần biển, cho trẻ nhỏ...' },
  spa: { title: 'Thư giãn kiểu nào hôm nay?', sub: 'Chọn nhanh vài thứ, Tappy sẽ tìm chỗ hợp nhất.', example: 'Ví dụ: kỹ thuật viên nữ, phòng riêng...' },
  main: { title: 'Tìm gì cho bạn hôm nay?', sub: 'Chọn nhanh vài thứ, Tappy sẽ tìm phần còn lại.', example: 'Ví dụ: gần nhà, giá vừa phải...' },
}

/**
 * README §3 — the first row whose words match the option gives the image key (looked up in the R22 manifest) and the
 * icon. R23.1: the keys are the owner's names (diem-bar-rooftop, diem-cafe, diem-quan-an, diem-bowling, diem-nail);
 * an option no row matches gets the same-name placeholder key `diem-<words>`; "chưa biết"-type options get no image.
 */
type TileRow = { f?: RegExp; r?: RegExp; key: string | null; icon: string }
const TILE_ROWS: TileRow[] = [
  { f: /\bkaraoke\b/, key: 'diem-karaoke', icon: 'Music' },
  { f: /\b(?:phim|cinema)\b/, r: /rạp/, key: 'diem-rap-phim', icon: 'Film' },
  { f: /\b(?:bar|pub|bia|beer|cocktail)\b/, key: 'diem-bar-rooftop', icon: 'Martini' },
  { f: /\b(?:bida|billiard)\b/, key: 'diem-bida', icon: 'CircleDot' },
  { f: /\bbowling\b/, key: 'diem-bowling', icon: 'CircleDot' },
  { f: /\b(?:ca phe|cafe|coffee)\b/, r: /trà/, key: 'diem-cafe', icon: 'Coffee' },
  { f: /\b(?:nuong|bbq)\b/, r: /lẩu/, key: 'diem-lau-nuong', icon: 'Flame' },
  { f: /\bsushi\b/, r: /nhật|hàn/, key: 'diem-mon-nhat-han', icon: 'Soup' },
  { f: /\b(?:mon viet|am thuc|nha hang|quan an)\b/, r: /phở|bún|cơm|(?<!\p{L})(?:ăn|món)(?!\p{L})/u, key: 'diem-quan-an', icon: 'Utensils' },
  { f: /\b(?:nail|mong)\b/, key: 'diem-nail', icon: 'Flower2' },
  { f: /\b(?:spa|massage|goi dau|goi)\b/, key: 'diem-spa', icon: 'Flower2' },
  { f: /\bbien\b/, key: 'diem-bien', icon: 'Waves' },
  { f: /\b(?:nui|trekking|cam trai)\b/, key: 'diem-nui', icon: 'Mountain' },
  { f: /\b(?:mua sam|shop|shopping|mall)\b/, r: /chợ|(?<!\p{L})đồ(?!\p{L})/u, key: 'diem-mua-sam', icon: 'ShoppingBag' },
  { f: /\b(?:nhac|concert|show|live|pop|rap|indie|acoustic)\b/, key: 'diem-am-nhac', icon: 'Mic' },
  { f: /\b(?:chua biet|khong quan trong|gi cung duoc|tuy)\b/, key: null, icon: 'HelpCircle' },
]
function tileRow(option: string): TileRow | null {
  const f = fold(option), r = lower(option)
  return TILE_ROWS.find(row => (row.f?.test(f) ?? false) || (row.r?.test(r) ?? false)) ?? null
}
/** The image key of a LOẠI tile; `null` = no image (the "not sure" options). */
export function askTileKey(option: string): string | null {
  const row = tileRow(option)
  if (row) return row.key
  return 'diem-' + (fold(option).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'khac')
}

/** The icon (lucide name) of an option, by its step kind — README §2 / §3. */
export function askIconOf(option: string, kind: AskStepKind, question = ''): string {
  const f = fold(option)
  if (kind === 'type') return tileRow(option)?.icon ?? 'Sparkles'
  if (kind === 'party') {
    if (/(?:^|\D)3(?:\D|$)|\bnhom\b|\bdong\b|\bgia dinh\b/.test(f)) return 'UsersRound'
    if (/(?:^|\D)2(?:\D|$)/.test(f)) return 'Users'
    return 'User'
  }
  if (kind === 'time') {
    if (/\b(?:tuan|thang|ngay|chua chot|\d+n\d*d?)\b/.test(f)) return 'CalendarDays'
    if (/\b(?:toi|dem)\b/.test(f)) return 'Moon'
    if (/\b(?:sang|trua|chieu)\b/.test(f)) return 'Sun'
    return 'CalendarDays'
  }
  if (kind === 'budget') return 'Wallet'
  // KHÁC — R23.1 optional keyword icons; the README's generic icon otherwise. A place question («Khu vực nào?»,
  // «Xuất phát từ đâu?») gives every option the map pin, so «Bình Thạnh» matches «Quận 1».
  if (/\b(?:khu vuc|o dau|tu dau|xuat phat|quan nao)\b/.test(fold(question))) return 'MapPin'
  if (/\b(?:gan|quan|tp|ha noi|da nang|noi khac|khu vuc)\b/.test(f)) return 'MapPin'
  if (/\bmay bay\b/.test(f)) return 'Plane'
  if (/\b(?:xe khach|limousine|tau)\b/.test(f)) return 'Bus'
  if (/\b(?:xe rieng|o to|tu lai)\b/.test(f)) return 'Car'
  if (/\b(?:giao|ship)\b/.test(f)) return 'Bike'
  if (/\btai quan\b/.test(f)) return 'Store'
  return 'Sparkles'
}

/** Placeholder tint per area (README §3: "ảnh giữ chỗ gradient theo mảng"). */
export const ASK_AREA_TINT: Record<AskArea, [string, string]> = {
  entertainment: ['#6d28d9', '#1e1b4b'], food: ['#c2410c', '#431407'], shopping: ['#0e7490', '#082f49'],
  travel: ['#0369a1', '#0c4a6e'], spa: ['#be185d', '#500724'], main: ['#1d4ed8', '#172554'],
}

/** Sent when nothing is chosen and nothing typed — R23.1 (owner 30/09): "Tìm cho tôi" still searches. */
export const ASK_EMPTY_ANSWER = 'Tìm cho tôi'

/** What the card sends: the chosen options + typed text (composeAskAnswer), or "Tìm cho tôi" when both are empty. */
export function askSendText(questions: AskQuestionView[], chosen: Record<string, string | string[]>, free = ''): string {
  return composeAskAnswer(questions, chosen, free) || ASK_EMPTY_ANSWER
}
