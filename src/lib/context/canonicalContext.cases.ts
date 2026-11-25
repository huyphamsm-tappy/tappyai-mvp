// The labelled table of the Canonical Context resolver (R13 §3.3 intents x vi / en / zh). Each row states the expected reading in design terms (written from R13, not from the code's output).
// `target` is the service target's key: placeEntityId ?? cityId ?? countryCode, or null = NOT resolved (unresolved / ambiguous / needs a question).
import type { IntentCategory, LocationRole } from './canonicalContext'

export type LocPreset = string // 'gps:hanoi' | 'ip:tokyo' | 'profile:hanoi' | 'gpsNoConsent:hanoi'

export interface Expect {
  intent: IntentCategory
  target?: string | null
  role?: LocationRole
  cross?: boolean
  resp?: string
  query?: string | null
  ambig?: string[]            // exact set of ambiguity codes
  dests?: string[]            // travel destinations (keys), in order
  origin?: string | null
  inherited?: boolean
  eligibility?: boolean
  multi?: boolean
  locSource?: 'GPS' | 'USER_SELECTED' | 'IP_ESTIMATE' | 'PROFILE' | 'UNKNOWN'
}

export interface Case {
  id: string
  text: string
  prior?: string[]
  loc?: LocPreset[]
  market?: string | null
  chosen?: string
  ui?: string
  e: Expect
}

export const PRESETS: Record<string, { lat: number; lng: number }> = {
  hanoi: { lat: 21.03, lng: 105.85 }, hcmc: { lat: 10.78, lng: 106.7 }, danang: { lat: 16.06, lng: 108.22 }, tokyo: { lat: 35.66, lng: 139.7 }, bangkok: { lat: 13.75, lng: 100.52 },
  seoul: { lat: 37.56, lng: 126.98 }, kl: { lat: 3.14, lng: 101.69 }, london: { lat: 51.51, lng: -0.12 }, singapore: { lat: 1.35, lng: 103.82 }, paris: { lat: 48.86, lng: 2.35 },
}

export const CASES: Case[] = [
  // ---- Nearby Discovery
  { id: 'N01', text: 'Quán phở nào ngon gần Hồ Gươm?', loc: ['gps:hanoi'], e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hanoi-hoguom', role: 'SECONDARY', cross: false, resp: 'vi' } },
  { id: 'N02', text: '我在河内，附近有什么好吃的越南菜？', loc: ['gps:hanoi'], e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hanoi', role: 'PRIMARY_RADIUS', cross: false, resp: 'zh', query: 'zh', locSource: 'GPS' } },
  { id: 'N03', text: 'Tôi đang ở Tokyo, quán cà phê gần Shibuya nào ngon?', loc: ['gps:tokyo'], e: { intent: 'NEARBY_DISCOVERY', target: 'jp-tokyo-shibuya', role: 'SECONDARY', cross: true, resp: 'vi' } },
  { id: 'N04', text: 'Quán cà phê nào gần đây?', loc: ['gps:hcmc'], e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hcmc', role: 'PRIMARY_RADIUS', cross: false, resp: 'vi' } },
  { id: 'N05', text: 'Any good ramen near me?', loc: ['gps:tokyo'], e: { intent: 'NEARBY_DISCOVERY', target: 'jp-tokyo', role: 'PRIMARY_RADIUS', cross: true, resp: 'en' } },
  { id: 'N06', text: '附近有什么咖啡店？', loc: ['gps:hcmc'], e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hcmc', role: 'PRIMARY_RADIUS', resp: 'zh' } },
  { id: 'N07', text: 'Nhà hàng gần nhất ở đâu?', e: { intent: 'NEARBY_DISCOVERY', target: null, ambig: ['NEEDS_PRECISE_LOCATION'], locSource: 'UNKNOWN' } },
  { id: 'N08', text: 'Quán nhậu nào gần đây?', loc: ['ip:hanoi'], e: { intent: 'NEARBY_DISCOVERY', target: null, ambig: ['NEEDS_PRECISE_LOCATION', 'LOCATION_ESTIMATE_ONLY'], locSource: 'IP_ESTIMATE' } },
  { id: 'N09', text: 'Quán nhậu nào gần đây?', loc: ['ip:tokyo', 'gps:hanoi'], e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hanoi', role: 'PRIMARY_RADIUS', locSource: 'GPS' } },
  { id: 'N10', text: 'Restaurants near Hoan Kiem Lake', loc: ['gps:hanoi'], e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hanoi-hoguom', role: 'SECONDARY', resp: 'en' } },
  { id: 'N11', text: 'Tìm khách sạn gần Bến Thành', loc: ['gps:hanoi'], e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hcmc-benthanh', role: 'SECONDARY', cross: false } },
  { id: 'N12', text: '涩谷附近有什么咖啡店', loc: ['gps:tokyo'], e: { intent: 'NEARBY_DISCOVERY', target: 'jp-tokyo-shibuya', role: 'SECONDARY', cross: true, resp: 'zh' } },
  { id: 'N13', text: 'Bar near Khao San Road', e: { intent: 'NEARBY_DISCOVERY', target: 'th-bangkok-sukhumvit', cross: true, resp: 'en' } },
  { id: 'N14', text: 'Quán ăn nào gần đây?', loc: ['profile:hanoi'], e: { intent: 'NEARBY_DISCOVERY', target: null, ambig: ['NEEDS_PRECISE_LOCATION'], locSource: 'PROFILE' } },
  { id: 'N15', text: 'Cafe nào gần chỗ mình?', loc: ['gps:danang'], e: { intent: 'NEARBY_DISCOVERY', target: 'vn-danang', role: 'PRIMARY_RADIUS' } },
  { id: 'N16', text: 'Nearby cafes with wifi', loc: ['gps:seoul'], e: { intent: 'NEARBY_DISCOVERY', target: 'kr-seoul', role: 'PRIMARY_RADIUS', cross: true, resp: 'en' } },
  { id: 'N17', text: 'Quán cà phê nào gần đây?', loc: ['gpsNoConsent:hanoi'], e: { intent: 'NEARBY_DISCOVERY', target: null, ambig: ['NEEDS_PRECISE_LOCATION'], locSource: 'UNKNOWN' } },
  { id: 'N18', text: '我是中国人，附近有什么好吃的？', e: { intent: 'NEARBY_DISCOVERY', target: null, ambig: ['NEEDS_PRECISE_LOCATION'], locSource: 'UNKNOWN', resp: 'zh' } },
  { id: 'N19', text: 'Tôi đang ở Đà Nẵng, quán hải sản nào ngon gần đây?', e: { intent: 'NEARBY_DISCOVERY', target: 'vn-danang', role: 'PRIMARY_RADIUS', locSource: 'USER_SELECTED' } },
  { id: 'N20', text: 'Where can I find good coffee nearby?', loc: ['gps:hanoi'], e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hanoi', role: 'PRIMARY_RADIUS', resp: 'en', cross: false } },

  // ---- Explicit Destination
  { id: 'E01', text: 'Khách sạn đẹp ở Đà Nẵng', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-danang', role: 'NOT_USED', cross: false, resp: 'vi' } },
  { id: 'E02', text: 'Khách sạn đẹp ở Đà Nẵng', loc: ['gps:hanoi'], e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-danang', role: 'SECONDARY', cross: false } },
  { id: 'E03', text: 'Quán phở nào ngon ở quận 1', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hcmc-q1' } },
  { id: 'E04', text: 'Best restaurants in Bangkok', e: { intent: 'EXPLICIT_DESTINATION', target: 'th-bangkok', cross: true, resp: 'en' } },
  { id: 'E05', text: 'Mình muốn đi Đà Lạt', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-dalat', cross: false } },
  { id: 'E06', text: 'How do I get to Siem Reap?', e: { intent: 'EXPLICIT_DESTINATION', target: 'kh-siemreap', cross: true, resp: 'en' } },
  { id: 'E07', text: '东京有什么好吃的餐厅', e: { intent: 'EXPLICIT_DESTINATION', target: 'jp-tokyo', cross: true, resp: 'zh' } },
  { id: 'E08', text: 'Chỉ đường đến Chợ Bến Thành', loc: ['gps:hcmc'], e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hcmc-benthanh', role: 'SECONDARY', cross: false } },
  { id: 'E09', text: 'Where to stay in Phuket', e: { intent: 'EXPLICIT_DESTINATION', target: 'th-phuket', cross: true, resp: 'en' } },
  { id: 'E10', text: 'Cafe in Shibuya', loc: ['gps:hanoi'], e: { intent: 'EXPLICIT_DESTINATION', target: 'jp-tokyo-shibuya', role: 'SECONDARY', cross: true } },
  { id: 'E11', text: 'Ăn gì ở Seoul?', e: { intent: 'EXPLICIT_DESTINATION', target: 'kr-seoul', cross: true } },
  { id: 'E12', text: 'Tôi ở Hà Nội, đặt khách sạn ở Hội An', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hoian', role: 'SECONDARY', cross: false, locSource: 'USER_SELECTED' } },
  { id: 'E13', text: 'Quán ăn ngon ở Hà Nội', loc: ['gps:tokyo'], e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi', role: 'SECONDARY', cross: true } },
  { id: 'E14', text: 'Cafe in Bangkok', market: null, e: { intent: 'EXPLICIT_DESTINATION', target: 'th-bangkok', cross: false } },
  { id: 'E15', text: '我想去新加坡', e: { intent: 'EXPLICIT_DESTINATION', target: 'sg-singapore', cross: true, resp: 'zh' } },

  // ---- Travel Planning
  { id: 'T01', text: 'Mình ở Hà Nội, muốn đi Bangkok 5 ngày, gợi ý lịch trình', e: { intent: 'TRAVEL_PLANNING', target: 'th-bangkok', dests: ['th-bangkok'], origin: 'vn-hanoi', cross: true, resp: 'vi' } },
  { id: 'T02', text: 'Mình ở Hà Nội, muốn đi Bangkok 5 ngày, gợi ý lịch trình', loc: ['gps:hanoi'], e: { intent: 'TRAVEL_PLANNING', target: 'th-bangkok', dests: ['th-bangkok'], origin: 'vn-hanoi', cross: true, role: 'SECONDARY' } },
  { id: 'T03', text: 'Lên kế hoạch du lịch Đà Nẵng 3 ngày 2 đêm', e: { intent: 'TRAVEL_PLANNING', target: 'vn-danang', dests: ['vn-danang'], cross: false } },
  { id: 'T04', text: 'Plan a 4-day trip to Tokyo and Kyoto', e: { intent: 'TRAVEL_PLANNING', dests: ['jp-tokyo', 'jp-kyoto'], multi: true, cross: true, resp: 'en' } },
  { id: 'T05', text: 'Compare Hanoi and Bangkok for a 3-day city break', e: { intent: 'TRAVEL_PLANNING', dests: ['vn-hanoi', 'th-bangkok'], multi: true, cross: true, resp: 'en' } },
  { id: 'T06', text: '我是中国人，想从越南入境后去柬埔寨，需要什么手续？', e: { intent: 'TRAVEL_PLANNING', target: 'KH', dests: ['KH'], origin: 'VN', eligibility: true, role: 'ELIGIBILITY', cross: true, resp: 'zh', locSource: 'UNKNOWN' } },
  { id: 'T07', text: 'Lịch trình 2 ngày ở Hội An', e: { intent: 'TRAVEL_PLANNING', target: 'vn-hoian', dests: ['vn-hoian'], cross: false } },
  { id: 'T08', text: '我想去曼谷玩5天，帮我安排行程', e: { intent: 'TRAVEL_PLANNING', target: 'th-bangkok', dests: ['th-bangkok'], cross: true, resp: 'zh' } },
  { id: 'T09', text: 'Itinerary for Bali, 7 days', e: { intent: 'TRAVEL_PLANNING', target: 'id-bali', dests: ['id-bali'], cross: true, resp: 'en' } },
  { id: 'T10', text: 'Gợi ý lịch trình Hà Nội - Sa Pa - Hạ Long 5 ngày', e: { intent: 'TRAVEL_PLANNING', dests: ['vn-hanoi', 'vn-sapa', 'vn-halong'], multi: true, cross: false } },
  { id: 'T11', text: "I'm in Seoul, plan a day trip to Busan", loc: ['gps:seoul'], e: { intent: 'TRAVEL_PLANNING', target: 'kr-busan', dests: ['kr-busan'], origin: 'kr-seoul', role: 'SECONDARY', cross: true } },
  { id: 'T12', text: 'Lên lịch trình đi du lịch giúp mình', e: { intent: 'TRAVEL_PLANNING', target: null, ambig: ['DESTINATION_MISSING', 'TRAVEL_DURATION_MISSING'] } },
  { id: 'T13', text: 'Từ Hà Nội đi Đà Nẵng, lịch trình 3 ngày', e: { intent: 'TRAVEL_PLANNING', dests: ['vn-danang'], origin: 'vn-hanoi', cross: false } },
  { id: 'T14', text: 'Plan a trip from here to Hoi An', loc: ['gps:hanoi'], e: { intent: 'TRAVEL_PLANNING', dests: ['vn-hoian'], origin: 'vn-hanoi', role: 'ORIGIN', resp: 'en', cross: false } },
  { id: 'T15', text: 'Tôi đang ở Bangkok, muốn sang Siem Reap, lịch trình 3 ngày', loc: ['gps:bangkok'], e: { intent: 'TRAVEL_PLANNING', dests: ['kh-siemreap'], origin: 'th-bangkok', cross: true } },
  { id: 'T16', text: 'Visa requirements when I travel from Vietnam to Laos', e: { intent: 'TRAVEL_PLANNING', dests: ['LA'], origin: 'VN', eligibility: true, role: 'ELIGIBILITY', cross: true, resp: 'en' } },

  // ---- General Knowledge
  { id: 'G01', text: 'Phở Thìn Hà Nội có gì đặc biệt?', e: { intent: 'GENERAL_INFORMATION', target: null, resp: 'vi', cross: false } },
  { id: 'G02', text: '用中文回答：Phở Thìn Hà Nội có gì đặc biệt?', e: { intent: 'GENERAL_INFORMATION', target: null, resp: 'zh', query: 'vi', cross: false } },
  { id: 'G03', text: 'Tại sao Việt Nam xuất khẩu nhiều cà phê?', e: { intent: 'GENERAL_INFORMATION', target: null, resp: 'vi' } },
  { id: 'G04', text: 'What is the history of Angkor Wat?', e: { intent: 'GENERAL_INFORMATION', target: null, resp: 'en', cross: false } },
  { id: 'G05', text: '为什么越南咖啡这么出名？', e: { intent: 'GENERAL_INFORMATION', target: null, resp: 'zh' } },
  { id: 'G06', text: 'Giải thích ý nghĩa của Tết Nguyên Đán', e: { intent: 'GENERAL_INFORMATION', target: null, resp: 'vi' } },
  { id: 'G07', text: 'Explain how compound interest works', e: { intent: 'GENERAL_INFORMATION', target: null, resp: 'en' } },
  { id: 'G08', text: '1 + 1 bằng mấy?', e: { intent: 'UNKNOWN', target: null } },
  { id: 'G09', text: 'Xin chào', e: { intent: 'UNKNOWN', target: null } },

  // ---- Current Information
  { id: 'C01', text: 'Trả lời bằng tiếng Anh: giá thuê mặt bằng ở quận 1 TP.HCM hiện nay', e: { intent: 'CURRENT_INFORMATION', target: 'vn-hcmc-q1', resp: 'en', query: 'vi', cross: false } },
  { id: 'C02', text: 'Giá vàng hôm nay', e: { intent: 'CURRENT_INFORMATION', target: null, role: 'NOT_USED', resp: 'vi' } },
  { id: 'C03', text: 'Thời tiết hôm nay thế nào?', loc: ['gps:hanoi'], e: { intent: 'CURRENT_INFORMATION', target: 'vn-hanoi', role: 'PRIMARY_RADIUS' } },
  { id: 'C04', text: 'Weather in Tokyo this weekend', e: { intent: 'CURRENT_INFORMATION', target: 'jp-tokyo', cross: true, resp: 'en' } },
  { id: 'C05', text: '今天曼谷天气怎么样', e: { intent: 'CURRENT_INFORMATION', target: 'th-bangkok', cross: true, resp: 'zh' } },
  { id: 'C06', text: 'Tỷ giá USD hôm nay', e: { intent: 'CURRENT_INFORMATION', target: null, role: 'NOT_USED' } },
  { id: 'C07', text: "Latest news about Vietnam's economy", loc: ['gps:tokyo'], e: { intent: 'CURRENT_INFORMATION', target: 'VN', cross: true, resp: 'en' } },
  { id: 'C08', text: 'Visa requirements for Thailand', e: { intent: 'CURRENT_INFORMATION', target: 'TH', cross: true, eligibility: true, resp: 'en' } },
  { id: 'C09', text: 'Giá vé máy bay đi Bangkok', e: { intent: 'CURRENT_INFORMATION', target: 'th-bangkok', cross: true } },
  { id: 'C10', text: 'Bitcoin price right now', loc: ['gps:hanoi'], e: { intent: 'CURRENT_INFORMATION', target: null, role: 'NOT_USED', resp: 'en' } },

  // ---- Follow-up turns keep the earlier target
  { id: 'F01', text: 'Gợi ý quán ăn ngon', prior: ['Mình muốn đi Bangkok 5 ngày'], e: { intent: 'EXPLICIT_DESTINATION', target: 'th-bangkok', inherited: true, cross: true } },
  { id: 'F02', text: 'Còn Hội An thì sao?', prior: ['Lịch trình Đà Nẵng 3 ngày'], e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hoian', inherited: false } },
  { id: 'F03', text: 'Gợi ý lịch trình chi tiết hơn', prior: ['Mình ở Hà Nội, muốn đi Bangkok 5 ngày'], e: { intent: 'TRAVEL_PLANNING', dests: ['th-bangkok'], origin: 'vn-hanoi', inherited: true, cross: true } },
  { id: 'F04', text: 'What about the weather there?', prior: ['Best pho in Hanoi'], e: { intent: 'CURRENT_INFORMATION', target: 'vn-hanoi', inherited: true, resp: 'en' } },
  { id: 'F05', text: 'Quán cà phê nào gần đây?', prior: ['Mình muốn đi Bangkok 5 ngày'], loc: ['gps:hanoi'], e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hanoi', role: 'PRIMARY_RADIUS', inherited: false } },
  { id: 'F06', text: 'Quán phở nào ngon ở Hà Nội', prior: ['Answer in English please'], e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi', resp: 'en', query: 'vi' } },
  { id: 'F07', text: 'Giá thuê nhà quận 7', prior: ['Tell me about pho'], e: { intent: 'CURRENT_INFORMATION', target: 'vn-hcmc-q7', resp: 'vi' } },
  { id: 'F08', text: 'Thanks!', prior: ['Plan 3 days in Tokyo'], e: { intent: 'UNKNOWN', target: null, inherited: false } },
  { id: 'F09', text: 'Cảm ơn bạn', prior: ['Công thức nấu phở'], e: { intent: 'UNKNOWN', target: null, inherited: false } },
  { id: 'F10', text: 'Cho mình vài quán cà phê nữa', prior: ['Quán cà phê đẹp ở Đà Lạt'], e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-dalat', inherited: true } },

  // ---- Ambiguous names: several candidates, never a guess
  { id: 'A01', text: 'Tôi muốn đi Victoria 4 ngày', e: { intent: 'TRAVEL_PLANNING', target: null, ambig: ['AMBIGUOUS_PLACE'] } },
  { id: 'A02', text: 'Best cafes in Cambridge', e: { intent: 'EXPLICIT_DESTINATION', target: null, ambig: ['AMBIGUOUS_PLACE'], resp: 'en' } },
  { id: 'A03', text: 'Birmingham restaurants', e: { intent: 'EXPLICIT_DESTINATION', target: null, ambig: ['AMBIGUOUS_PLACE'] } },
  { id: 'A04', text: 'Cafe in Cambridge', loc: ['gps:london'], e: { intent: 'EXPLICIT_DESTINATION', target: 'gb-cambridge' } },
  { id: 'A05', text: 'Where to eat in Georgia', e: { intent: 'EXPLICIT_DESTINATION', target: null, ambig: ['AMBIGUOUS_PLACE'] } },
  { id: 'A06', text: 'Hoàn Kiếm có quán nào ngon', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi' } },
  { id: 'A07', text: 'West Lake restaurants', e: { intent: 'EXPLICIT_DESTINATION', target: null, ambig: ['AMBIGUOUS_PLACE'] } },
  { id: 'A08', text: 'Hồ Tây có quán cà phê nào đẹp', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi-hotay' } },
  { id: 'A09', text: 'Santiago hotels', e: { intent: 'EXPLICIT_DESTINATION', target: null, ambig: ['AMBIGUOUS_PLACE'] } },
  { id: 'A10', text: 'Quán cà phê ở Victoria, Úc', e: { intent: 'EXPLICIT_DESTINATION', target: 'au-victoria' } },
  { id: 'A11', text: '沙巴有什么好吃的', e: { intent: 'EXPLICIT_DESTINATION', target: 'my-sabah', cross: true, resp: 'zh' } },

  // ---- Response language
  { id: 'L01', text: 'Answer in English: quán phở nào ngon ở Hà Nội', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi', resp: 'en', query: 'vi' } },
  { id: 'L02', text: 'Trả lời bằng tiếng Anh: Phở Thìn có gì đặc biệt', e: { intent: 'GENERAL_INFORMATION', resp: 'en', query: 'vi' } },
  { id: 'L03', text: '请用英文回答：河内有什么好吃的', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi', resp: 'en', query: 'zh' } },
  { id: 'L04', text: 'Quán phở ngon ở Hà Nội', chosen: 'en', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi', resp: 'en', query: 'vi' } },
  { id: 'L05', text: '用中文回答：quán phở ngon ở Hà Nội', chosen: 'en', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi', resp: 'zh', query: 'vi' } },
  { id: 'L06', text: 'Trả lời bằng tiếng Anh: quán phở ngon ở Hà Nội', chosen: 'vi', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi', resp: 'en' } },
  { id: 'L07', text: 'Best bún chả in Hanoi?', loc: ['gps:hanoi'], e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi', resp: 'en', cross: false } },
  { id: 'L08', text: '河内有什么好吃的', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi', resp: 'zh', query: 'zh', cross: false } },
  { id: 'L09', text: '附近有什么好吃的', loc: ['gps:hanoi'], e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hanoi', role: 'PRIMARY_RADIUS', resp: 'zh', cross: false } },
  { id: 'L10', text: 'ok', ui: 'en', e: { intent: 'UNKNOWN', resp: 'en' } },
  { id: 'L11', text: 'Quán phở ngon ở Hà Nội', ui: 'en', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi', resp: 'vi' } },
  { id: 'L12', text: 'Please respond in Japanese: best sushi in Tokyo', e: { intent: 'EXPLICIT_DESTINATION', target: 'jp-tokyo', resp: 'ja', query: 'en' } },
  { id: 'L13', text: 'ok', e: { intent: 'UNKNOWN', resp: 'vi' } },
  { id: 'L14', text: 'Compare Hanoi and Bangkok for a 3-day city break', prior: ['Trả lời bằng tiếng Việt nhé'], e: { intent: 'TRAVEL_PLANNING', resp: 'vi', query: 'en' } },

  // ---- 30 FRESH sentences: written AFTER the code was done and run once before any fix (first run 24/30). Misses were fixed by general rules: "near" + up to two words + name, "đang ở X" without a pronoun,
  //      a place stated earlier in the thread, enter/cross as travel verbs, "近" as a near cue (not "最近"), capitalised "Hue". X29 had a wrong expectation of mine (a comparison trip is TRAVEL_PLANNING, as T05).
  { id: 'X01', text: 'Gần ga Hà Nội có quán bún chả nào ngon không?', e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hanoi', role: 'NOT_USED' } },
  { id: 'X02', text: 'Tôi đang ở Sài Gòn, tìm quán cà phê yên tĩnh gần đây', e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hcmc', role: 'PRIMARY_RADIUS', locSource: 'USER_SELECTED' } },
  { id: 'X03', text: '我想去吴哥窟看日出，帮我规划三天行程', e: { intent: 'TRAVEL_PLANNING', target: 'kh-siemreap-angkor', cross: true, resp: 'zh' } },
  { id: 'X04', text: 'Is it safe to travel to Phnom Penh at night?', e: { intent: 'EXPLICIT_DESTINATION', target: 'kh-phnompenh', cross: true, resp: 'en' } },
  { id: 'X05', text: 'Giá phòng khách sạn ở Singapore tháng này', e: { intent: 'CURRENT_INFORMATION', target: 'sg-singapore', cross: true, resp: 'vi' } },
  { id: 'X06', text: 'Why is Tokyo so expensive?', e: { intent: 'GENERAL_INFORMATION', target: null, resp: 'en' } },
  { id: 'X07', text: 'Chi phí sống ở Seoul một tháng khoảng bao nhiêu?', e: { intent: 'CURRENT_INFORMATION', target: 'kr-seoul', cross: true } },
  { id: 'X08', text: "I'm in Kuala Lumpur, any good satay places nearby?", loc: ['gps:kl'], e: { intent: 'NEARBY_DISCOVERY', target: 'my-kl', role: 'PRIMARY_RADIUS', cross: true, resp: 'en', locSource: 'GPS' } },
  { id: 'X09', text: 'Quán phở nào ngon ở Phố cổ?', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-hanoi-phoco' } },
  { id: 'X10', text: '我在东京，涩谷有什么好吃的拉面', e: { intent: 'EXPLICIT_DESTINATION', target: 'jp-tokyo-shibuya', cross: true, resp: 'zh', locSource: 'USER_SELECTED' } },
  { id: 'X11', text: 'Từ Sài Gòn ra Phú Quốc đi bằng gì? Lên lịch trình 4 ngày giúp mình', e: { intent: 'TRAVEL_PLANNING', dests: ['vn-phuquoc'], origin: 'vn-hcmc', cross: false } },
  { id: 'X12', text: 'Cho mình hỏi quán nào ở Nha Trang có hải sản tươi', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-nhatrang' } },
  { id: 'X13', text: 'Tell me the history of Hoi An Ancient Town', e: { intent: 'GENERAL_INFORMATION', target: null, resp: 'en' } },
  { id: 'X14', text: "How's the weather in Da Lat this week?", e: { intent: 'CURRENT_INFORMATION', target: 'vn-dalat', resp: 'en', cross: false } },
  { id: 'X15', text: 'Mình muốn đi Paris 7 ngày, ngân sách 50 triệu', e: { intent: 'TRAVEL_PLANNING', dests: ['fr-paris'], cross: true, resp: 'vi' } },
  { id: 'X16', text: '最近河内的天气怎么样', e: { intent: 'CURRENT_INFORMATION', target: 'vn-hanoi', resp: 'zh', cross: false } },
  { id: 'X17', text: 'Where should I eat in Chiang Mai?', e: { intent: 'EXPLICIT_DESTINATION', target: 'th-chiangmai', resp: 'en', cross: true } },
  { id: 'X18', text: 'Điểm tham quan gần chỗ mình', loc: ['gps:danang'], e: { intent: 'NEARBY_DISCOVERY', target: 'vn-danang', role: 'PRIMARY_RADIUS' } },
  { id: 'X19', text: 'Plan 5 days across Osaka, Kyoto and Tokyo', e: { intent: 'TRAVEL_PLANNING', dests: ['jp-osaka', 'jp-kyoto', 'jp-tokyo'], multi: true, cross: true, resp: 'en' } },
  { id: 'X20', text: 'Cho mình xem tỷ giá baht Thái hôm nay', e: { intent: 'CURRENT_INFORMATION', target: null, role: 'NOT_USED' } },
  { id: 'X21', text: 'Tôi là người Mỹ, đang ở Hà Nội, cần đổi tiền ở đâu gần đây', e: { intent: 'NEARBY_DISCOVERY', target: 'vn-hanoi', role: 'PRIMARY_RADIUS', locSource: 'USER_SELECTED' } },
  { id: 'X22', text: "What's the best time to visit Sapa?", e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-sapa', resp: 'en' } },
  { id: 'X23', text: 'Need a visa to enter Vietnam from Cambodia by land?', e: { intent: 'TRAVEL_PLANNING', dests: ['VN'], origin: 'KH', eligibility: true, cross: true, resp: 'en' } },
  { id: 'X24', text: '越南的签证多少钱', e: { intent: 'CURRENT_INFORMATION', target: 'VN', eligibility: true, resp: 'zh', cross: false } },
  { id: 'X25', text: 'Đi Hạ Long thì nên ở khách sạn nào', e: { intent: 'EXPLICIT_DESTINATION', target: 'vn-halong' } },
  { id: 'X26', text: '近新宿站有什么拉面店', e: { intent: 'NEARBY_DISCOVERY', target: 'jp-tokyo-shinjuku', resp: 'zh' } },
  { id: 'X27', text: 'Compare Seoul and Busan for food', e: { intent: 'EXPLICIT_DESTINATION', multi: true, cross: true, resp: 'en' } },
  { id: 'X28', text: 'Gợi ý quán ăn khuya', prior: ['Tôi đang ở Seoul, định đi chơi 3 ngày'], e: { intent: 'NEARBY_DISCOVERY', target: 'kr-seoul', role: 'PRIMARY_RADIUS', locSource: 'USER_SELECTED' } },
  { id: 'X29', text: 'Which is cheaper for a weekend trip: Da Nang or Hue?', e: { intent: 'TRAVEL_PLANNING', multi: true, resp: 'en' } },
  { id: 'X30', text: '我现在在曼谷，明天想去芭提雅，怎么走？', e: { intent: 'EXPLICIT_DESTINATION', target: 'th-pattaya', role: 'SECONDARY', cross: true, resp: 'zh', locSource: 'USER_SELECTED' } },
]
