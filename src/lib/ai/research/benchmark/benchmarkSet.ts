// The fixed question set of Report Engine V2.1, milestone M1 (owner 11/11: a benchmark BEFORE changing the engine). Ten questions; for each, the facts a good report MUST contain.
// The facts are written as patterns on the FOLDED text (no diacritics, lower case, see researchSignals.fold) so that spelling and case do not matter. Every fact is `draft` until the owner reviews it:
// the first two questions' facts come from the reference report Claude wrote for the same question (the nghịch lý of money moving up to 36.000-70.000, the tax law, the 7.000 wave), the others from what
// the reports already read agree on, or are structural where the assistant cannot know the truth of the day. Nothing here decides a score alone: the human sheet does.

export type BenchmarkKind = 'trend' | 'forecast' | 'compare' | 'explain' | 'cost' | 'risk'

export interface MandatoryFact {
  id: string
  label: string
  /** every one of these patterns must match the folded report */
  all: RegExp[]
  /** at least `n` of these patterns must match (for "names at least three chains") */
  atLeast?: { of: RegExp[]; n: number }
  /** `draft`: written by the assistant, waiting for the owner; `reviewed`: the owner has read and accepted or corrected it */
  status: 'draft' | 'reviewed'
  basis: string
}

export interface BenchmarkQuestion {
  id: string
  text: string
  kind: BenchmarkKind
  /** about food and drink (the owner's domain); the others test that the engine is general */
  fnb: boolean
  facts: MandatoryFact[]
}

const SHIFT = /(36[.,]?000\s*[-–]\s*70[.,]?000|61[,.]78)/
const TAX = /(tieu thu dac biet|ttdb)/
const TAX_RATES = [/\b8\s?%/, /\b10\s?%/]
const YEARS = [/2027/, /2028/, /2029/]
const fact = (id: string, label: string, all: RegExp[], basis: string, atLeast?: MandatoryFact['atLeast']): MandatoryFact => ({ id, label, all, ...(atLeast ? { atLeast } : {}), status: 'draft', basis })

export const BENCHMARK: readonly BenchmarkQuestion[] = [
  { id: 'q01', kind: 'trend', fnb: true, text: 'Xu hướng thị trường trà sữa tại Hà Nội', facts: [
    fact('shift', 'Dòng tiền dịch lên vùng giá 36.000–70.000 đồng (nửa đầu 2026), nghịch lý trung tâm của bản Claude', [SHIFT], 'bản Claude mẫu'),
    fact('tax', 'Thuế tiêu thụ đặc biệt nước giải khát có đường, 8% từ 2027', [TAX, TAX_RATES[0]], 'bản Claude mẫu; Luật 66/2025/QH15 nêu ở cả hai bản'),
    fact('wave7k', 'Làn sóng trà sữa 7.000 đồng ở Hà Nội, có tên thương hiệu', [/7[.,]?000/, /(vien vien|tam hao|man man|hong tra ngo gia)/], 'bản Claude mẫu'),
    fact('h1', 'Có số liệu nửa đầu 2026', [/(nua dau 2026|6 thang dau (nam )?2026|h1[\/ ]?2026|2026-h1)/], 'bản Claude mẫu'),
  ] },
  { id: 'q02', kind: 'forecast', fnb: true, text: 'Dự báo doanh thu trà sữa Việt Nam giai đoạn 2027–2029 và phân tích độ nhạy', facts: [
    fact('tax', 'Thuế tiêu thụ đặc biệt 8% (2027) và 10% (2028) đưa vào phân tích', [TAX, ...TAX_RATES], 'bản Claude mẫu'),
    fact('base', 'Nêu mức nền và cho biết các nguồn lệch nhau vì định nghĩa hoặc phạm vi', [/(500 trieu usd|12,5 nghin ty|12\.500 ty|362 trieu|420 trieu|617 trieu)/, /(dinh nghia|pham vi)/], 'cả hai bản đều nêu'),
    fact('scenarios', 'Kịch bản thấp, cơ sở, cao cho 2027, 2028, 2029', [...YEARS, /kich ban/], 'yêu cầu của câu hỏi'),
    fact('sensitivity', 'Độ nhạy theo từng biến (sản lượng, giá)', [/(do nhay|tornado)/, /san luong/, /gia/], 'yêu cầu của câu hỏi'),
    fact('price', 'Dòng tiền dịch lên vùng giá cao làm cơ sở cho giả định giá', [SHIFT], 'bản Claude mẫu'),
  ] },
  { id: 'q03', kind: 'trend', fnb: true, text: 'Xu hướng thị trường cà phê tại TP.HCM', facts: [
    fact('chains', 'Nêu ít nhất ba chuỗi lớn', [], 'cấu trúc', { n: 3, of: [/highlands/, /phuc long/, /starbucks/, /the coffee house/, /katinat/, /trung nguyen/, /cong ca phe/] }),
    fact('latest', 'Có số liệu năm 2026', [/2026/, /\d[\d.,]*\s*(ty|trieu|%|cua hang)/], 'cấu trúc'),
    fact('price', 'Có mức giá hoặc mức chi cho một ly', [/(dong\s*\/?\s*ly|gia (ban )?(trung binh)?)/, /\d[\d.,]*\s*(nghin|dong|k)/], 'cấu trúc'),
  ] },
  { id: 'q04', kind: 'compare', fnb: true, text: 'So sánh Phúc Long, Highlands Coffee và Katinat về quy mô, doanh thu và chiến lược', facts: [
    fact('names', 'Nêu cả ba thương hiệu', [/phuc long/, /highlands/, /katinat/], 'yêu cầu của câu hỏi'),
    fact('revenue', 'Có doanh thu bằng số, kèm năm', [/doanh thu/, /\d[\d.,]*\s*ty/, /(2025|2026)/], 'cấu trúc'),
    fact('stores', 'Có số cửa hàng', [/\d{2,4}\s*cua hang/], 'cấu trúc'),
    fact('strategy', 'Nêu chiến lược hoặc định vị', [/(chien luoc|dinh vi)/], 'yêu cầu của câu hỏi'),
  ] },
  { id: 'q05', kind: 'explain', fnb: true, text: 'Thuế tiêu thụ đặc biệt đối với nước giải khát có đường từ 2027 ảnh hưởng thế nào đến quán trà sữa và cà phê?', facts: [
    fact('rates', 'Mức 8% (2027) và 10% (2028)', [TAX, ...TAX_RATES], 'Luật 66/2025/QH15 nêu ở cả hai bản'),
    fact('threshold', 'Ngưỡng đường trên 5 g/100 ml', [/5\s?g\s?\/?\s?100\s?ml/], 'cả hai bản đều nêu'),
    fact('scope', 'Nói rõ phạm vi áp dụng cho đồ uống pha tại quán còn chưa rõ hoặc chưa được hướng dẫn', [/(chua ro|chua co (xac nhan|huong dan)|chua nguon nao|chua xac dinh)/], 'cả hai bản đều nêu'),
    fact('effect', 'Nêu tác động tới giá bán hoặc sản lượng', [/(gia ban|tang gia|chuyen vao gia|san luong)/], 'yêu cầu của câu hỏi'),
  ] },
  { id: 'q06', kind: 'trend', fnb: true, text: 'Xu hướng giao đồ ăn trực tuyến tại Hà Nội và TP.HCM', facts: [
    fact('platforms', 'Nêu ShopeeFood và GrabFood', [/shopeefood/, /grabfood/], 'cả hai bản đều nêu'),
    fact('share', 'Có thị phần bằng số', [/thi phan/, /\d{2}\s?%/], 'cấu trúc'),
    fact('commission', 'Có mức hoa hồng hoặc chiết khấu', [/(hoa hong|chiet khau)/, /\d{2}\s?%/], 'cả hai bản đều nêu'),
    fact('latest', 'Có số liệu năm 2026', [/2026/], 'cấu trúc'),
  ] },
  { id: 'q07', kind: 'forecast', fnb: true, text: 'Dự báo doanh thu chuỗi cà phê và trà tại Việt Nam giai đoạn 2027–2029 và phân tích độ nhạy', facts: [
    fact('scenarios', 'Kịch bản thấp, cơ sở, cao cho 2027, 2028, 2029', [...YEARS, /kich ban/], 'yêu cầu của câu hỏi'),
    fact('sensitivity', 'Độ nhạy theo từng biến', [/(do nhay|tornado)/, /(san luong|gia)/], 'yêu cầu của câu hỏi'),
    fact('base', 'Nêu mức nền và phạm vi của nó', [/(muc nen|\bnen\b|nam 2025)/, /(pham vi|dinh nghia)/], 'cấu trúc'),
    fact('assumptions', 'Gắn nhãn giả định: cái nào có nguồn, cái nào là giả định của báo cáo', [/gia dinh/], 'yêu cầu của câu hỏi'),
  ] },
  { id: 'q08', kind: 'trend', fnb: false, text: 'Xu hướng thị trường xe điện tại Việt Nam năm 2026', facts: [
    fact('vinfast', 'Nêu VinFast', [/vinfast/], 'cấu trúc'),
    fact('share', 'Có thị phần hoặc doanh số bằng số', [/(thi phan|doanh so|ban ra)/, /\d[\d.,]*\s*(%|xe|chiec)/], 'cấu trúc'),
    fact('infra', 'Nêu hạ tầng sạc hoặc chính sách', [/(tram sac|tru sac|chinh sach|uu dai)/], 'cấu trúc'),
    fact('latest', 'Có số liệu năm 2026', [/2026/], 'cấu trúc'),
  ] },
  { id: 'q09', kind: 'forecast', fnb: false, text: 'Dự báo thị trường thương mại điện tử Việt Nam giai đoạn 2027–2029 và phân tích độ nhạy', facts: [
    fact('platforms', 'Nêu ít nhất hai sàn lớn', [], 'cấu trúc', { n: 2, of: [/shopee/, /tiktok shop/, /lazada/, /tiki/] }),
    fact('scenarios', 'Kịch bản thấp, cơ sở, cao cho 2027, 2028, 2029', [...YEARS, /kich ban/], 'yêu cầu của câu hỏi'),
    fact('sensitivity', 'Độ nhạy theo từng biến', [/(do nhay|tornado)/], 'yêu cầu của câu hỏi'),
    fact('latest', 'Có số liệu năm 2026', [/2026/], 'cấu trúc'),
  ] },
  { id: 'q10', kind: 'risk', fnb: false, text: 'Du lịch Việt Nam năm 2026: lượng khách quốc tế, xu hướng và rủi ro', facts: [
    fact('visitors', 'Có số lượt khách quốc tế bằng số', [/khach quoc te/, /\d[\d.,]*\s*(trieu|nghin)/], 'cấu trúc'),
    fact('latest', 'Có số liệu năm 2026', [/2026/], 'cấu trúc'),
    fact('risks', 'Nêu rủi ro', [/rui ro/], 'yêu cầu của câu hỏi'),
  ] },
]

export const benchmarkById = (id: string): BenchmarkQuestion | undefined => BENCHMARK.find(q => q.id === id)
