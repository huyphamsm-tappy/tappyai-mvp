// Emergency classifier (R13 §10.5), deterministic and CONSERVATIVE: it flags only a clear first-person or imminent-danger statement (Vietnamese or English) of an ongoing fire, a person not
// breathing / unconscious / bleeding badly / choking, a child being abused or trafficked now, or a crime in progress with a weapon or an intruder. A question ABOUT the subject (how does 115
// work, history, a movie, first aid in general), a past or hypothetical sentence, a joke or a drill never fires. When in doubt it does NOT fire. Pure; no model call.
// Vietnamese is matched twice: with its accents (so "chạy" is never "cháy"), and, only when the text has no Vietnamese accent at all, as bare letters (a message typed without accents).

import type { EmergencyCategory } from './emergencyPayload'

export type DetectedCategory = Extract<EmergencyCategory, 'MEDICAL' | 'FIRE_RESCUE' | 'CHILD_PROTECTION' | 'HUMAN_TRAFFICKING' | 'POLICE'>
/** `lang` is the language of the rule that matched (the language the person wrote the emergency in). */
export interface EmergencyAssessment { emergency: boolean; category: DetectedCategory | null; reasonCode: string | null; lang: 'vi' | 'en' | 'zh' | null }

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

// ── Chinese (Simplified; Traditional spellings are folded to Simplified first) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Same philosophy as above, with no word edges (Chinese has none): a rule needs a person AND a state or an act, joined in one clause, and a first-person or near anchor for a fire. A how-to or
// definition question, fiction, a hypothetical, a past or long-lasting state, news, a joke or a figure of speech never fires ("着火了怎么报警" has no anchor; "火了" = popular is not a fire word).
const TRAD = '著這裡裏來廚麼嗎槍綁搶鄰毆電請問報帶沒暈醫護傷殺見對們個時點邊樓燒滅煙層區車門闖誰媽爺嬰兒寶撲騙賣關進還會後從發擊緊幫話號與過當長嚇衝趕倉庫廠館飯變動應無氣兇學親臟熱該陣誰歲隨顯覺寫園點輛劇電視場夢驚腦脈臉嘴紫際圖機歷課測試擬設選滾愛癲癇聲'
const SIMP = '着这里里来厨么吗枪绑抢邻殴电请问报带没晕医护伤杀见对们个时点边楼烧灭烟层区车门闯谁妈爷婴儿宝扑骗卖关进还会后从发击紧帮话号与过当长吓冲赶仓库厂馆饭变动应无气凶学亲脏热该阵谁岁随显觉写园点辆剧电视场梦惊脑脉脸嘴紫际图机历课测试拟设选滚爱癫痫声'
const T2S = new Map<string, string>(); { const a = Array.from(TRAD), b = Array.from(SIMP); for (let i = 0; i < a.length && i < b.length; i++) if (!T2S.has(a[i])) T2S.set(a[i], b[i]) }
const toSimplified = (s: string): string => Array.from(s).map(ch => T2S.get(ch) ?? ch).join('')
const HAN = /[㐀-䶿一-鿿]/u
const hanCount = (s: string): number => (s.match(/[㐀-䶿一-鿿]/gu) ?? []).length
const ZS = '[^。！？!?\\n]'
const ZDUR = '了?[一二三四五六七八九十百两几\\d]+(?:天|周|个月|年|星期|岁)'
const ZDUR_LONG = '了?[一二三四五六七八九十百两几\\d]+(?:个月|年|周|岁)'
const ZFIRE = '(?:着火|失火|起火|着了火|烧起来)(?!点|的|原因|时|后|前|过|之后|会|可能|概率|做|烧|煮|炒)'
const ZPLACE = '(?:酒店|旅馆|宾馆|民宿|公寓|大楼|大厦|商场|商店|市场|工厂|仓库|学校|医院|车站|机场|地铁|隧道|加油站|宿舍|小区)'
const ZVICTIM = '(?:孩子|小孩|小朋友|宝宝|婴儿|儿童|女儿|儿子|男孩|女孩|学生|幼儿|孩童)'
const ZHARM = '(?:虐待|殴打|毒打|暴打|打骂|性侵|猥亵|家暴|折磨|掐|强奸|侵犯|侵害|性骚扰|暴力对待|打伤|打死)'
const ZWHO = '(?:他|她|孩子|小孩|宝宝|婴儿|儿子|女儿|爸|妈|爷|奶|外婆|外公|老公|老婆|丈夫|妻子|先生|太太|朋友|同事|同学|老人|病人|路人|有人|有个人|一个人|男人|女人|女孩|男孩|老师|司机|游客|导游|姐|哥|弟|妹|叔|姨|舅|亲戚|家人)'
const ZMED = '(?:(?:没有?|不)呼吸(?!道|困难|系统|声|机|器|不畅|急促|频率|法|练习|治疗|面罩|不好|有点)|停止了?呼吸|呼吸停止|呼吸骤停|没了?气|断气|没有?心跳|心跳停止|心脏停跳|没有?脉搏|昏迷(?!过|多|很久|好久|已久|' + ZDUR + ')|昏倒|晕倒|晕厥|晕过去|昏过去|不省人事|失去了?意识|没有?意识(?!到|形态|流)|叫不醒|喊不醒|拍不醒|(?:叫|喊|拍|摇|推)' + ZS + '{0,4}?(?:没有?反应|不应|没动静)|大出血|血流不止|止不住血|出血不止|流了?(?:好|很)?多血|噎住|被噎住|(?:呛到|呛住)' + ZS + '{0,10}?(?:发不出声|说不出话|喘不上气|脸色?(?:发紫|通红|涨红)|憋得)|卡住了?喉咙|窒息了|抽搐|口吐白沫|脸色发紫|嘴唇发紫|脸都?紫了|心脏病发作|心梗|心肌梗|中风(?!险)|癫痫发作|触电)'
const ZSTATES_SELF = '(?:噎住|大出血|血流不止|止不住血|出血不止)'
const ZNOW_MED = new RegExp('(?:了|正在|现在|刚|突然|不醒|倒在|快|救|马上|赶紧|急|已经|还在|一直|止不住|发作|口吐|旁边|在地上)', 'u')

const ZRULES: Array<{ category: DetectedCategory; src: string }> = [
  // fire: my home / my place, or right here, or someone shouting for help
  { category: 'FIRE_RESCUE', src: `(?:我家|我们家|咱家|我们的|我们(?:这|楼|小区|单元|宿舍|酒店|旅馆|宾馆|民宿|公寓|房间|房子|大厦|厂|仓库)|我住的|我们住的|我所在的?|我的(?:家|房子|房间|车|店|厂|公寓|宿舍|店铺|办公室|摩托车|汽车)|我租的)${ZS}{0,16}?${ZFIRE}` },
  { category: 'FIRE_RESCUE', src: `(?:这里|这儿|这边|这栋|这幢|这座|楼下|楼上|隔壁|对面|旁边|附近)${ZS}{0,10}?${ZFIRE}` },
  { category: 'FIRE_RESCUE', src: `(?:nhà (?:tôi|mình|em|anh|chị)|khách sạn|chung cư|tòa nhà)${ZS}{0,10}?${ZFIRE}` },
  { category: 'FIRE_RESCUE', src: `${ZFIRE}${ZS}{0,16}?(?:我(?:一个人)?(?:住在|在家|在里面|在屋里|在楼上|还在|在[一二三四五六七八九十\\d]+楼|被困|出不去|逃不出)|被困|出不去|逃不出)` },
  { category: 'FIRE_RESCUE', src: `(?:救命|救火|快来人|来人啊|帮帮我)${ZS}{0,8}?(?:着火|失火|起火)了|(?:着火|失火|起火)了${ZS}{0,6}?(?:救命|救火|快来人|来人啊|帮帮我)` },
  { category: 'FIRE_RESCUE', src: `(?:我家|我们家|我们这|我们楼|这里|这儿|楼下|隔壁)${ZS}{0,8}?(?:发生了?火灾|火势(?:很大|蔓延|扩大|越来越大|失控)|冒(?:出|着)?浓烟)` },
  // abduction / trafficking (checked before the child-abuse and medical rules by ORDER)
  { category: 'HUMAN_TRAFFICKING', src: `(?:孩子|小孩|女儿|儿子|宝宝|男孩|女孩|小朋友|儿童)(?:已?被)(?:人|陌生人|坏人|不认识的人|别人|一个男人|一个女人|一群人|几个人|几个男人)(?:带走|抱走|拐走|抓走|劫走|掳走|拖走|骗走)` },
  { category: 'HUMAN_TRAFFICKING', src: `(?:孩子|小孩|女儿|儿子|宝宝|男孩|女孩|小朋友|儿童|朋友|姐|妹|哥|弟|她|他|我|同事|同学|老婆|妻子)${ZS}{0,6}?(?:已被|正被|刚被|被)(?:人贩子|坏人|陌生人|歹徒|人)?(?:拐骗|拐卖|拐走|拐(?![弯角杖点卖骗走])|绑架|诱拐|掳走|劫持|囚禁|非法拘禁|卖到|卖去)(?!过|的|案|${ZDUR_LONG})` },
  { category: 'HUMAN_TRAFFICKING', src: `(?:有人|有个人|坏人|陌生人|歹徒|一伙人|一个男人|一个女人|人贩子)${ZS}{0,6}?(?:正在|在|想要|想|要|试图|企图|打算)(?:把)?${ZS}{0,4}?(?:拐走|拐骗|拐卖|绑架|诱拐|劫持|抢走|抱走|带走)${ZS}{0,6}?(?:孩子|小孩|女儿|儿子|宝宝|女孩|男孩|小朋友|我)` },
  { category: 'HUMAN_TRAFFICKING', src: `(?:有人|有个人|有(?:个|一个|几个)?(?:陌生|可疑)?(?:男人|女人)|坏人|陌生人|歹徒|一伙人|一个男人|一个女人|人贩子)${ZS}{0,20}?(?:想要|想|要|试图|企图|正在|在)把(?:她|他|孩子|我的?(?:孩子|女儿|儿子)|小孩|宝宝|我)(?:强行|硬)?(?:拉上车|拖上车|拽上车|塞进车|带走|抱走|抢走|拐走|绑走|拖走|拉走)` },
  { category: 'HUMAN_TRAFFICKING', src: `(?:把我|将我)(?:锁|关|囚禁|软禁)(?:在|进)${ZS}{0,12}?(?:不让(?:我)?(?:走|出去|离开)|出不去|逃不出)` },
  // child abuse now
  { category: 'CHILD_PROTECTION', src: `${ZVICTIM}${ZS}{0,15}?(?:正在|正|一直在?)被?${ZS}{0,4}?${ZHARM}` },
  { category: 'CHILD_PROTECTION', src: `${ZVICTIM}被(?:一直)?${ZHARM}(?!过|的)` },
  { category: 'CHILD_PROTECTION', src: `(?:有人|邻居|邻家|隔壁|男人|女人|男的|女的|他|她|继父|继母|后爸|后妈|爸爸|妈妈|父亲|母亲|老师|保姆|保育员|教练|叔叔|舅舅)${ZS}{0,6}?(?:正在|在|又在)(?:用力|狠狠|拼命)?(?:打|殴打|毒打|暴打|虐待|猥亵|性侵|掐|折磨|侵犯|强奸|性骚扰|家暴)着?${ZS}{0,4}?(?:我的|我家的|一个|这个|那个|那些|个)?${ZVICTIM}` },
  // medical: another person in a bad state NOW, or me choking / bleeding badly
  { category: 'MEDICAL', src: `${ZWHO}${ZS}{0,14}?${ZMED}` },
  { category: 'MEDICAL', src: `我(?:被|正在被)?(?:食物|东西|骨头|鱼刺)?${ZSTATES_SELF}` },
  // police: a crime in progress with danger
  { category: 'POLICE', src: `(?:我|我们|我朋友|我老公|我老婆|我妈|我爸|他|她)(?:刚刚?|正在|正|又|在)?被(?:人|歹徒|坏人|陌生人|小偷)?(?:抢劫|打劫|持刀抢|袭击|追杀|跟踪|砍|刺伤|围殴|殴打)(?!过|的|案|${ZDUR_LONG})` },
  { category: 'POLICE', src: `我(?:刚刚?|正在)?被(?:人|歹徒|坏人|小偷)?抢(?:了|走)(?:我的?)?(?:钱包|手机|包|钱|背包|相机)` },
  { category: 'POLICE', src: `(?:有人|有个人|有个男人|一个男人|一个女人|一群人|几个人|他们|他|她|歹徒|坏人|陌生人|疯子|醉汉)${ZS}{0,8}?(?:持刀|持枪|持械|拿着?(?:砍刀|菜刀|匕首|刀|枪|斧头|铁棍|棍|棒|武器)|握着刀|举着刀|挥舞着?(?:刀|斧头|棍)|带着刀|带着枪)${ZS}{0,16}?(?:追|威胁|指着|对着|冲着|抢|杀|砍|袭击|在门口|在我|我|要|冲进|闯进|冲入|冲了进来)` },
  { category: 'POLICE', src: `(?:用|拿|持)着?(?:刀|枪|斧头|棍子|匕首)(?:指着|对着|顶着|抵着|架在|威胁|逼着)(?:我|我们|我的脖子)` },
  { category: 'POLICE', src: `(?:有人|有小偷|有贼|有歹徒|有陌生人|歹徒|小偷|贼|陌生人|几个人|一群人|有个人|一个人)(?:正在|在|正|已经|刚刚?)?(?:闯入|撬${ZS}{0,6}?(?:门|锁)|砸(?:我家的?|我的?)?门|破门|爬进|翻进|入室|闯进|强行进入|砸开)` },
  { category: 'POLICE', src: `(?:老公|丈夫|老婆|妻子|男朋友|女朋友|前夫|前妻|前男友|前女友|他|她|我爸|我妈|继父|对象)(?:正在|在|又在|刚刚在|正)(?:打|殴打|掐|勒|暴打|家暴|毒打|拿刀砍|用刀|扼|拿刀威胁|威胁)(?:我|我们)(?!的|电话|游戏|字|家)` },
  { category: 'POLICE', src: `(?:有人|有个人|有歹徒|歹徒|坏人|陌生人|一伙人|几个人)(?:正在|在|想要|想|要|试图|企图|扬言要|威胁要)(?:追杀|杀|砍死?|刺|打死|袭击|伤害)我(?!们的|的)` },
]
const zCompiled = ZRULES.map(r => ({ r, re: new RegExp(r.src, 'u') }))
/** Chinese fiction / hypothetical / past / future / news / study / joke / figure-of-speech / hospital-stay markers (checked on the Simplified text). */
const ZHARD = new RegExp('电影|电视|电视剧|小说|剧本|剧情|情节|漫画|动画|游戏|角色|台词|歌词|场景|故事|编一|编个|写一|写个|帮我写|历史|课文|文章|新闻|报道|研究|论文|演练|演习|模拟|假设|假如|如果|要是|万一|比如|例如|举例|昨天|昨晚|前天|上周|上个月|上星期|去年|前年|小时候|曾经|曾|当年|多年前|下周|明天|明晚|下个月|症状|原因|迹象|特征|案件|案例|统计|开玩笑|玩笑|笑死|哈哈|逗你|段子|考试|试题|题目|培训|课程|住院|病房|重症监护|icu|出院|医生说|吓得|气得|笑得|累得|饿得|冻得|热得|差点|一样|似的|简直|吓死|气死|累死|烦死|困死|饿死|羡慕|太帅|太美|搞笑', 'u')
/** A Chinese how-to, definition, price or yes/no question; it silences a match unless a person in danger NOW speaks (a personal anchor and a present marker). */
const ZSOFT = new RegExp('怎么|怎样|如何|什么|是啥|哪些|哪种|哪个|哪里|吗|是否|能不能|可以|应该|该怎么|步骤|方法|教程|攻略|指南|区别|为什么|为何|多少|要钱|费用|有没有|是不是|算不算|吧', 'u')
const ZPERSONAL = new RegExp('我|咱|这里|这儿|楼下|隔壁|旁边|眼前|面前|身边|孩子|小孩|宝宝|婴儿|儿子|女儿|爸|妈|老公|老婆|丈夫|妻子|朋友|同事|老人|他|她', 'u')
const ZNOW = new RegExp('正在|现在|马上|立刻|赶紧|快|刚才|刚刚|刚|了|救命|求救|还在|一直', 'u')

/** Classify one user message. Never throws. */
export function classifyEmergency(input: string): EmergencyAssessment {
  if (typeof input !== 'string') return none
  const text = input.replace(/[‘’ʼ]/g, "'").normalize('NFC').toLowerCase().trim()
  if (!text || text.length > MAX_CHARS) return none
  const folded = fold(text)
  if (HARD.test(folded)) return none
  const hasHan = HAN.test(text)
  const zhText = hasHan ? toSimplified(text) : ''
  if (hasHan && ZHARD.test(zhText)) return none
  const bareOk = !hasViAccent(text)
  const hits = new Map<DetectedCategory, 'vi' | 'en' | 'zh'>()
  if (hasHan) {
    for (const { r, re } of zCompiled) {
      if (!re.test(zhText)) continue
      if (r.category === 'MEDICAL' && !ZNOW_MED.test(zhText)) continue
      if (!hits.has(r.category)) hits.set(r.category, 'zh')
    }
  }
  for (const { r, accented, bare } of compiled) {
    const hit = r.lang === 'en' ? (bare ?? accented).test(folded) : accented.test(text) || (bareOk && !!bare && bare.test(folded))
    if (!hit) continue
    // a Vietnamese medical state alone is not a statement about someone now: it also needs a present or urgent marker
    if (r.category === 'MEDICAL' && r.lang === 'vi' && !NOW_VI_MED.test(folded)) continue
    if (!hits.has(r.category)) hits.set(r.category, r.lang)
  }
  const category = ORDER.find(c => hits.has(c))
  if (!category) return none
  const hitLang = hits.get(category) ?? 'vi'
  if (hitLang === 'zh') { if (ZSOFT.test(zhText) && !(ZPERSONAL.test(zhText) && ZNOW.test(zhText))) return none }
  else if (SOFT.test(folded) && !(PERSONAL.test(folded) && NOWMARK.test(folded))) return none
  // a message written mostly in Chinese gets its answer in Chinese even when a Vietnamese or English rule fired
  const han = hasHan ? hanCount(text) : 0
  const lang = hitLang !== 'zh' && han >= 6 && han * 2 >= (text.match(/\p{Script=Latin}/gu) ?? []).length ? 'zh' : hitLang
  return { emergency: true, category, reasonCode: `EMERGENCY_${category}`, lang }
}
