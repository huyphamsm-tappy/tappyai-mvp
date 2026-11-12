// Emergency classifier (R13 §10.5), deterministic and CONSERVATIVE: it flags only a clear first-person or imminent-danger statement (Vietnamese or English) of an ongoing fire, a person not
// breathing / unconscious / bleeding badly / choking, a child being abused or trafficked now, or a crime in progress with a weapon or an intruder. A question ABOUT the subject (how does 115
// work, history, a movie, first aid in general), a past or hypothetical sentence, a joke or a drill never fires. When in doubt it does NOT fire. Pure; no model call.
// Vietnamese is matched twice: with its accents (so "chạy" is never "cháy"), and, only when the text has no Vietnamese accent at all, as bare letters (a message typed without accents).

import type { EmergencyCategory } from './emergencyPayload'

export type DetectedCategory = Extract<EmergencyCategory, 'MEDICAL' | 'FIRE_RESCUE' | 'CHILD_PROTECTION' | 'HUMAN_TRAFFICKING' | 'POLICE'>
/** `lang` is the language of the rule that matched (the language the person wrote the emergency in). */
export interface EmergencyAssessment { emergency: boolean; category: DetectedCategory | null; reasonCode: string | null; lang: 'vi' | 'en' | null }

const MAX_CHARS = 800
const none: EmergencyAssessment = { emergency: false, category: null, reasonCode: null, lang: null }

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()
const hasViAccent = (s: string): boolean => /[̀-ͯ]|đ/.test(s.normalize('NFD').toLowerCase())

/** `@b` / `@e` are word edges (a letter on either side is not an edge). Sources are written lower-case with accents; the bare form is the same source folded. */
const build = (src: string, bare: boolean): RegExp => new RegExp((bare ? fold(src) : src).replace(/@b/g, '(?<!\\p{L})').replace(/@e/g, '(?!\\p{L})').replace(/ /g, '\\s+'), 'u')

interface Rule { category: DetectedCategory; src: string; /** false: only with accents (a bare reading is ambiguous) */ bare: boolean; lang: 'vi' | 'en' }
const SEG = '[^.!?\\n]'

const FIRE_NOUN = 'nhà|căn hộ|chung cư|phòng|xưởng|kho|tầng|cây xăng|bếp|khách sạn|tòa nhà|quán|chợ|rừng|nhà bên|nhà hàng xóm'
const NOT_FIRE = '(?!\\s*(?:hàng|máy|túi|nắng|da|vé|phố|show|giáo án|deadline|sale|tài khoản|pin|bài|bỏng|bộ|ra|vào|đi|nhanh|lên|xuống|trốn|quanh|loạn))'
const HARM_CP = '(?:bạo hành|đánh đập|đánh|xâm hại|hành hạ|ngược đãi|dâm ô|cưỡng bức|bóp cổ|tra tấn|hiếp)'
const VICTIM_VI = '(?:bé|trẻ|em bé|đứa trẻ|đứa bé|cháu|con|học sinh)'
const MED_STATE = '(?:không thở(?: được| nổi)?|ngừng thở|tắt thở|ngưng thở|ngừng tim|bất tỉnh|hôn mê|không tỉnh|không phản ứng|không còn mạch|mất ý thức|ngất(?! ngây| lịm| ngưởng)|co giật|sùi bọt mép|chảy (?:rất )?nhiều máu|mất nhiều máu|không cầm được máu|máu chảy không (?:ngừng|cầm được)|bị hóc|bị nghẹn|nghẹn(?: cổ)? không thở|hóc dị vật|tím tái|đột quỵ|lên cơn đau tim|nhồi máu cơ tim)'

const RULES: Rule[] = [
  // ── fire ──
  { category: 'FIRE_RESCUE', bare: true, lang: 'vi', src: `@b(?:${FIRE_NOUN})@e${SEG}{0,30}?@b(?:đang|bắt đầu|vừa) (?:bốc )?cháy@e${NOT_FIRE}` },
  { category: 'FIRE_RESCUE', bare: false, lang: 'vi', src: `@b(?:xe máy|ô tô|xe hơi|xe)@e${SEG}{0,20}?@b(?:đang|vừa) (?:bốc )?cháy@e${NOT_FIRE}` },
  { category: 'FIRE_RESCUE', bare: true, lang: 'vi', src: `@b(?:đang có|có) (?:một )?(?:đám cháy|hỏa hoạn)@e${SEG}{0,40}?@b(?:ngay|bên cạnh|gần|trước mặt|dưới nhà|trên tầng|trong nhà|nhà tôi|khu tôi)` },
  { category: 'FIRE_RESCUE', bare: true, lang: 'vi', src: `@blửa@e${SEG}{0,15}?@bđang (?:lan|bùng|bén|cháy|tràn)@e` },
  { category: 'FIRE_RESCUE', bare: true, lang: 'en', src: `@b(?:my|our|his|her|their|this|the|a) (?:[a-z']+ ){0,2}?(?:house|home|apartment|flat|building|kitchen|car|room|shop|store|factory|warehouse|hotel|garage|school|condo|office)@e (?:is |are |just |has |was just )?(?:on fire|burning|in flames|caught fire|catching fire)` },
  { category: 'FIRE_RESCUE', bare: true, lang: 'en', src: `@b(?:there's|there is|there seems to be|i see|i can see|we have|i have) (?:a )?fire@e${SEG}{0,30}?@b(?:in|at|next|downstairs|upstairs|outside|here|behind|across|near)@e` },
  // ── protection categories first ──
  { category: 'HUMAN_TRAFFICKING', bare: true, lang: 'vi', src: `@b(?:đang|vừa) bị${SEG}{0,20}?@b(?:bắt cóc|buôn bán|buôn người|bán sang|giam giữ|nhốt|ép làm việc|ép bán dâm|ép lao động|lừa bán)@e` },
  { category: 'HUMAN_TRAFFICKING', bare: true, lang: 'vi', src: `@b(?:có|đang có) (?:người|kẻ|nhóm|bọn|tên)${SEG}{0,15}?@b(?:đang )?bắt cóc@e${SEG}{0,20}?(?:trẻ|bé|em bé|đứa|cháu|người)` },
  { category: 'HUMAN_TRAFFICKING', bare: true, lang: 'en', src: `@b(?:is being|are being|was being|being) (?:trafficked|kidnapped|abducted|held against (?:her|his|their|my) will)@e` },
  { category: 'HUMAN_TRAFFICKING', bare: true, lang: 'en', src: `(?:@bis|@bare|'s|'re) (?:trying to|about to) (?:kidnap|abduct|traffic)@e` },
  { category: 'CHILD_PROTECTION', bare: true, lang: 'vi', src: `@b${VICTIM_VI}@e${SEG}{0,25}?@b(?:đang|vừa) (?:bị )?(?:${SEG}{0,15}? )?${HARM_CP}@e` },
  { category: 'CHILD_PROTECTION', bare: true, lang: 'vi', src: `@b(?:đang|vừa) ${HARM_CP} (?:con|bé|trẻ|em bé|đứa trẻ|đứa bé|cháu)@e` },
  { category: 'CHILD_PROTECTION', bare: true, lang: 'en', src: `@b(?:a|the|my|our) (?:[a-z']+ ){0,2}?(?:child|kid|baby|boy|girl|toddler|daughter|son|infant)@e${SEG}{0,30}?(?:@bis|@bare|'s) being (?:abused|beaten|hit|molested|hurt|assaulted|tortured|raped|choked|strangled)@e` },
  { category: 'CHILD_PROTECTION', bare: true, lang: 'en', src: `(?:@bhe|@bshe|@bthey|@bsomeone|@bmy (?:dad|mom|stepdad|stepfather|uncle|neighbou?r)) (?:is|are|'s|'re) (?:hurting|hitting|beating|abusing|molesting|touching) (?:my|the|a) (?:child|kid|baby|son|daughter|little)` },
  // ── medical ──
  { category: 'MEDICAL', bare: true, lang: 'vi', src: `@b${MED_STATE}@e` },
  { category: 'MEDICAL', bare: true, lang: 'en', src: `@b(?:isn't|is not|aren't|are not|stopped|stops|has stopped) breathing@e(?! (?:hard|heavily|well|easily|properly|through|deeply|fast|loudly))` },
  { category: 'MEDICAL', bare: true, lang: 'en', src: `@b(?:he|she|they|baby|child|kid|mom|dad|mother|father|husband|wife|friend) can't breathe@e` },
  { category: 'MEDICAL', bare: true, lang: 'en', src: `(?:@bis|@bare|'s|'re|@bjust|@bhas|@bhave) (?:been )?(?:unconscious|unresponsive|passed out|collapsed|bleeding (?:badly|heavily|profusely|a lot|out)|choking|having (?:a|an) (?:seizure|heart attack|stroke|asthma attack|allergic reaction)|turning blue|convulsing|seizing)@e` },
  { category: 'MEDICAL', bare: true, lang: 'en', src: `@b(?:has|have|with) no pulse@e` },
  { category: 'MEDICAL', bare: true, lang: 'en', src: `@b(?:my|our|a) [a-z']+(?: [a-z']+)? (?:just )?collapsed@e` },
  // ── police: a crime in progress with danger ──
  { category: 'POLICE', bare: true, lang: 'vi', src: `@b(?:người|kẻ|tên|bọn|nhóm|thằng|gã|hắn)@e${SEG}{0,15}?@b(?:đang )?(?:cầm|dí|kề|vác) (?:dao|súng|kiếm|mã tấu|gậy|búa)@e${SEG}{0,25}?(?:@btôi|@bmình|@bchúng tôi|@bnhà|@bđuổi|@bdọa|@bđe dọa)` },
  { category: 'POLICE', bare: true, lang: 'vi', src: `@b(?:có|đang có) (?:người|kẻ|tên|bọn|nhóm|trộm|kẻ trộm) (?:đang )?(?:đột nhập|leo vào|cạy cửa|phá cửa|xông vào)@e` },
  { category: 'POLICE', bare: true, lang: 'vi', src: `@b(?:tôi|mình|chúng tôi) (?:đang|vừa) bị (?:cướp|đe dọa|tấn công|truy đuổi|bám đuôi|hành hung)@e(?! (?:mạng|ddos|hacker|trên mạng|online))` },
  { category: 'POLICE', bare: true, lang: 'vi', src: `@b(?:chồng|vợ|bạn trai|bạn gái|người yêu|hắn|anh ta)@e${SEG}{0,10}?@b(?:đang|vừa) (?:đánh|đập|bóp cổ|hành hung|đe dọa) (?:tôi|mình)@e` },
  { category: 'POLICE', bare: true, lang: 'en', src: `@b(?:someone|somebody|a man|a guy|a person|men|two men|people|an intruder|a burglar|robbers?) (?:is|are|'s|'re) (?:breaking into|trying to break into|in my house|in our house|inside my house|climbing into|forcing)` },
  { category: 'POLICE', bare: true, lang: 'en', src: `@b(?:a man|a guy|someone|he|she|they|a person|an? [a-z]+) (?:with|has|have|had|holding|pointing) (?:a )?(?:knife|gun|weapon|machete|axe|bat)@e${SEG}{0,30}?(?:chasing|following|attacking|threatening|coming at|at the door|is after)` },
  { category: 'POLICE', bare: true, lang: 'en', src: `@b(?:i'm|i am|we're|we are) being (?:robbed|attacked|stalked|chased|threatened|mugged|held up)@e` },
  { category: 'POLICE', bare: true, lang: 'en', src: `@bbeing followed by (?:a|an|some|two) (?:man|guy|men|stranger|person|group)@e` },
  { category: 'POLICE', bare: true, lang: 'en', src: `@b(?:husband|wife|boyfriend|girlfriend|partner|dad|stepdad|ex) (?:is|'s) (?:hitting|beating|choking|strangling|attacking|hurting|threatening) (?:me|us)@e` },
]

const compiled = RULES.map(r => ({ r, accented: build(r.src, false), bare: r.bare ? build(r.src, true) : null }))
const ORDER: DetectedCategory[] = ['HUMAN_TRAFFICKING', 'CHILD_PROTECTION', 'MEDICAL', 'FIRE_RESCUE', 'POLICE']

/** A fiction, history, hypothetical, past, drill, joke or study marker: the sentence is not a person in danger now. Checked on the folded text. */
const HARD = build('@b(?:phim|truyện|tiểu thuyết|kịch bản|cảnh phim|nhân vật|lịch sử|bài học|bài viết|nghiên cứu|thuyết trình|diễn tập|mô phỏng|nhập vai|game|trò chơi|đề thi|câu đố|quiz|giả sử|nếu|ví dụ|hôm qua|hôm kia|hôm trước|tháng trước|năm ngoái|tuần trước|hồi nhỏ|ngày xưa|từng bị|nguyên nhân|dấu hiệu|triệu chứng|tin tức|bản tin|vụ án|thống kê|đùa thôi|đùa vui|joke|movie|film|scene|novel|story|fiction|screenplay|script|character|history|historical|lesson|essay|article|research|study|presentation|drill|simulation|simulated|role-?play|exam|hypothetical|hypothetically|suppose|imagine|pretend|if|example|for instance|yesterday|last (?:week|month|year|night)|years? ago|when i was|used to|symptoms|signs of|causes? of|news|reported|case|prank|kidding|lol|haha)@e', true)
/** A how-to or definition question: quiet, unless a person in danger NOW speaks (a personal anchor and a present marker). */
const SOFT = build('@b(?:cách|hướng dẫn|làm sao để|làm thế nào để|như thế nào|là gì|nên làm gì|phải làm gì khi|sơ cứu|để phòng|phòng tránh|có nên|tại sao|vì sao|quy trình|số 11[1-5]|gọi 11[1-5]|đường dây 11[1-5]|how to|how do|how does|how can|what is|what are|what should|what do|what to do|should i|explain|tell me about|define|difference between|steps to|guide)@e', true)
const PERSONAL = build('(?:@btôi|@bmình|@bcon|@bbé|@bbố|@bmẹ|@bchồng|@bvợ|@bông|@bnhà|@btrước mặt|@bmy|@bour|i\'m|@bi am|he\'s|she\'s|they\'re|in front of me|next to me)@e', true)
const NOWMARK = build('(?:@bđang|@bvừa|@bbây giờ|@bngay lúc này|@bnow|@bright now|@bis|@bare|@bjust|@bnot|\'s|\'re|n\'t)@e', true)
const NOW_VI_MED = build('(?:@bđang|@bvừa|@bbây giờ|@bngay|@brồi|@bmãi|@bkhông dậy|@bcứu|@bgiúp|@bgấp|@bkhẩn|@bhình như)@e', true)

/** Classify one user message. Never throws. */
export function classifyEmergency(input: string): EmergencyAssessment {
  if (typeof input !== 'string') return none
  const text = input.replace(/[‘’ʼ]/g, "'").normalize('NFC').toLowerCase().trim()
  if (!text || text.length > MAX_CHARS) return none
  const folded = fold(text)
  if (HARD.test(folded)) return none
  const bareOk = !hasViAccent(text)
  const hits = new Map<DetectedCategory, 'vi' | 'en'>()
  for (const { r, accented, bare } of compiled) {
    const hit = r.lang === 'en' ? (bare ?? accented).test(folded) : accented.test(text) || (bareOk && !!bare && bare.test(folded))
    if (!hit) continue
    // a Vietnamese medical state alone is not a statement about someone now: it also needs a present or urgent marker
    if (r.category === 'MEDICAL' && r.lang === 'vi' && !NOW_VI_MED.test(folded)) continue
    if (!hits.has(r.category)) hits.set(r.category, r.lang)
  }
  const category = ORDER.find(c => hits.has(c))
  if (!category) return none
  if (SOFT.test(folded) && !(PERSONAL.test(folded) && NOWMARK.test(folded))) return none
  return { emergency: true, category, reasonCode: `EMERGENCY_${category}`, lang: hits.get(category) ?? 'vi' }
}
