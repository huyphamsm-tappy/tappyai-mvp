// R13 §3.4 Geo Entity Resolution: a deterministic, diacritic-insensitive Entity/Alias Registry (Vietnamese, English, Simplified Chinese names).
//   1. exact alias match; 2. locale-aware alias (native name, Latin name, transliteration); 3. contextual disambiguation (done by the caller from the country/city it already has);
//   5. several reasonable results => the mention carries SEVERAL candidates and the caller asks; nothing is guessed. Step 4 (a geocoder) is out of scope: no network here.
// The original name of a place is preserved: `name` is the original-script display name, an alias is only a way to find it. Pure and browser-safe (no Node import).

export type GeoKind = 'country' | 'city' | 'district' | 'place'

export interface GeoEntity {
  /** stable id, 'vn-hanoi' (country prefix + slug) */
  id: string
  /** original / local display name; never replaced by a translation */
  name: string
  country: string
  kind: GeoKind
  /** a city is its own city; a district / place points at its city */
  cityId?: string
  lat?: number
  lng?: number
  /** a GPS fix this close to (lat,lng) is "in" this city (cities only) */
  radiusKm?: number
  /** aliases in any language; matched without diacritics, case-insensitive, on word boundaries (CJK as substrings) */
  names: string[]
  /** aliases that collide with ordinary words once the diacritics are gone ("huế" / "hue"): matched only WITH their diacritics */
  strict?: string[]
  /** ASCII forms that are ordinary words in lower case ("hue") and a place only when written capitalised ("Hue"): matched case-sensitively */
  capitalised?: string[]
}

export interface CountryInfo { code: string; name: string; languages: string[] }

export const COUNTRIES: Record<string, CountryInfo> = {
  VN: { code: 'VN', name: 'Việt Nam', languages: ['vi'] },
  TH: { code: 'TH', name: 'Thailand', languages: ['th', 'en'] },
  KH: { code: 'KH', name: 'Cambodia', languages: ['km', 'en'] },
  LA: { code: 'LA', name: 'Laos', languages: ['lo', 'en'] },
  JP: { code: 'JP', name: 'Japan', languages: ['ja'] },
  KR: { code: 'KR', name: 'South Korea', languages: ['ko'] },
  CN: { code: 'CN', name: 'China', languages: ['zh'] },
  HK: { code: 'HK', name: 'Hong Kong', languages: ['zh', 'en'] },
  TW: { code: 'TW', name: 'Taiwan', languages: ['zh'] },
  SG: { code: 'SG', name: 'Singapore', languages: ['en', 'zh'] },
  MY: { code: 'MY', name: 'Malaysia', languages: ['ms', 'en'] },
  ID: { code: 'ID', name: 'Indonesia', languages: ['id'] },
  PH: { code: 'PH', name: 'Philippines', languages: ['en', 'tl'] },
  FR: { code: 'FR', name: 'France', languages: ['fr'] },
  GB: { code: 'GB', name: 'United Kingdom', languages: ['en'] },
  US: { code: 'US', name: 'United States', languages: ['en'] },
  AU: { code: 'AU', name: 'Australia', languages: ['en'] },
  IT: { code: 'IT', name: 'Italy', languages: ['it'] },
  DE: { code: 'DE', name: 'Germany', languages: ['de'] },
  AE: { code: 'AE', name: 'United Arab Emirates', languages: ['ar', 'en'] },
  ES: { code: 'ES', name: 'Spain', languages: ['es'] },
  CL: { code: 'CL', name: 'Chile', languages: ['es'] },
  VE: { code: 'VE', name: 'Venezuela', languages: ['es'] },
  CR: { code: 'CR', name: 'Costa Rica', languages: ['es'] },
  EG: { code: 'EG', name: 'Egypt', languages: ['ar'] },
  CA: { code: 'CA', name: 'Canada', languages: ['en', 'fr'] },
  GE: { code: 'GE', name: 'Georgia', languages: ['ka'] },
  SC: { code: 'SC', name: 'Seychelles', languages: ['en', 'fr'] },
}

const c = (id: string, name: string, country: string, names: string[], strict?: string[]): GeoEntity => ({ id, name, country, kind: 'country', names, ...(strict ? { strict } : {}) })
const city = (id: string, name: string, country: string, lat: number, lng: number, names: string[], radiusKm = 40, strict?: string[]): GeoEntity =>
  ({ id, name, country, kind: 'city', cityId: id, lat, lng, radiusKm, names, ...(strict ? { strict } : {}) })
const sub = (kind: 'district' | 'place', id: string, name: string, parent: GeoEntity, names: string[], strict?: string[]): GeoEntity =>
  ({ id, name, country: parent.country, kind, cityId: parent.id, names, ...(strict ? { strict } : {}) })

const HANOI = city('vn-hanoi', 'Hà Nội', 'VN', 21.0285, 105.8542, ['ha noi', 'hanoi', 'hn', 'thu do', '河内'], 45)
const HCMC = city('vn-hcmc', 'TP. Hồ Chí Minh', 'VN', 10.7769, 106.7009, ['ho chi minh', 'ho chi minh city', 'tp ho chi minh', 'thanh pho ho chi minh', 'tphcm', 'tp hcm', 'hcmc', 'hcm', 'sai gon', 'saigon', 'sg city', '胡志明市', '胡志明', '西贡'], 45)
const DANANG = city('vn-danang', 'Đà Nẵng', 'VN', 16.0544, 108.2022, ['da nang', 'danang', '岘港'])
const HOIAN = city('vn-hoian', 'Hội An', 'VN', 15.8801, 108.338, ['hoi an', 'hoian', '会安'], 15)
const TOKYO = city('jp-tokyo', '東京', 'JP', 35.6762, 139.6503, ['tokyo', 'tokio', 'dong kinh', '东京'], 45)
const SEOUL = city('kr-seoul', '서울', 'KR', 37.5665, 126.978, ['seoul', 'xeoul', '首尔'], 40)
const BANGKOK = city('th-bangkok', 'กรุงเทพมหานคร', 'TH', 13.7563, 100.5018, ['bangkok', 'bang kok', 'krung thep', '曼谷'], 45)
const SIEMREAP = city('kh-siemreap', 'សៀមរាប', 'KH', 13.3671, 103.8448, ['siem reap', 'siemreap', 'xiem riep', '暹粒'], 25)
const PARIS = city('fr-paris', 'Paris', 'FR', 48.8566, 2.3522, ['paris', 'pa ri', '巴黎'], 35)
const NYC = city('us-nyc', 'New York', 'US', 40.7128, -74.006, ['new york', 'new york city', 'nyc', 'nu uoc', 'nuu uoc', '纽约'], 40)

export const GAZETTEER: readonly GeoEntity[] = [
  // ---- countries ----
  c('VN', 'Việt Nam', 'VN', ['viet nam', 'vietnam', 'nuoc viet', '越南']),
  c('TH', 'ประเทศไทย', 'TH', ['thai lan', 'thailand', 'nuoc thai', '泰国']),
  c('KH', 'កម្ពុជា', 'KH', ['campuchia', 'cambodia', 'cam pu chia', 'kampuchea', '柬埔寨']),
  c('LA', 'ລາວ', 'LA', ['laos', 'lao pdr', 'nuoc lao', '老挝'], ['lào']),
  c('JP', '日本', 'JP', ['nhat ban', 'japan', 'nuoc nhat', '日本']),
  c('KR', '대한민국', 'KR', ['han quoc', 'south korea', 'korea', 'nuoc han', '韩国']),
  c('CN', '中国', 'CN', ['trung quoc', 'china', 'nuoc trung', '中国']),
  c('TW', '臺灣', 'TW', ['dai loan', 'taiwan', '台湾', '臺灣']),
  c('MY', 'Malaysia', 'MY', ['malaysia', 'ma lai', 'ma lai xi a', '马来西亚']),
  c('ID', 'Indonesia', 'ID', ['indonesia', 'in do ne xi a', '印度尼西亚', '印尼']),
  c('PH', 'Philippines', 'PH', ['philippines', 'phi luat tan', '菲律宾']),
  c('FR', 'France', 'FR', ['france', 'nuoc phap', '法国']),
  c('GB', 'United Kingdom', 'GB', ['united kingdom', 'uk', 'nuoc anh', 'great britain', 'england', '英国']),
  c('US', 'United States', 'US', ['united states', 'usa', 'u s a', 'america', 'nuoc my', 'hoa ky', '美国'], ['mỹ']),
  c('AU', 'Australia', 'AU', ['australia', 'nuoc uc', 'uc chau', '澳大利亚', '澳洲'], ['úc']),
  c('IT', 'Italia', 'IT', ['italy', 'italia', 'nuoc y', '意大利']),
  c('DE', 'Deutschland', 'DE', ['germany', 'deutschland', 'nuoc duc', '德国']),
  c('CA', 'Canada', 'CA', ['canada', 'ca na da', '加拿大']),
  c('SC', 'Seychelles', 'SC', ['seychelles']),
  // ---- Viet Nam ----
  HANOI, HCMC, DANANG, HOIAN,
  city('vn-haiphong', 'Hải Phòng', 'VN', 20.8449, 106.6881, ['hai phong', 'haiphong', '海防']),
  city('vn-cantho', 'Cần Thơ', 'VN', 10.0452, 105.7469, ['can tho', 'cantho', '芹苴']),
  { ...city('vn-hue', 'Huế', 'VN', 16.4637, 107.5909, ['thanh pho hue', 'tp hue', 'co do hue', 'hue city', '顺化'], 30, ['huế']), capitalised: ['Hue'] },
  city('vn-nhatrang', 'Nha Trang', 'VN', 12.2388, 109.1967, ['nha trang', 'nhatrang', '芽庄'], 30),
  city('vn-dalat', 'Đà Lạt', 'VN', 11.9404, 108.4583, ['da lat', 'dalat', '大叻'], 30),
  city('vn-phuquoc', 'Phú Quốc', 'VN', 10.2899, 103.984, ['phu quoc', 'phuquoc', '富国岛', '富国'], 35),
  city('vn-sapa', 'Sa Pa', 'VN', 22.3364, 103.8438, ['sa pa', 'sapa', '萨帕'], 25),
  city('vn-halong', 'Hạ Long', 'VN', 20.9101, 107.1839, ['ha long', 'halong', 'ha long bay', 'vinh ha long', '下龙湾', '下龙'], 30),
  city('vn-ninhbinh', 'Ninh Bình', 'VN', 20.2506, 105.9745, ['ninh binh', 'ninhbinh', 'trang an', '宁平'], 30),
  city('vn-vungtau', 'Vũng Tàu', 'VN', 10.346, 107.0843, ['vung tau', 'vungtau', '头顿'], 25),
  city('vn-muine', 'Mũi Né', 'VN', 10.9333, 108.2833, ['mui ne', 'muine', 'phan thiet', '美奈', '潘切'], 25),
  city('vn-quynhon', 'Quy Nhơn', 'VN', 13.7765, 109.2237, ['quy nhon', 'quynhon', '归仁'], 25),
  city('vn-bmt', 'Buôn Ma Thuột', 'VN', 12.6667, 108.05, ['buon ma thuot', 'ban me thuot', 'bmt'], 30),
  city('vn-hagiang', 'Hà Giang', 'VN', 22.8233, 104.9784, ['ha giang', 'hagiang', '河江'], 40),
  city('vn-condao', 'Côn Đảo', 'VN', 8.6838, 106.6094, ['con dao', 'condao', '昆岛'], 20),
  city('vn-phongnha', 'Phong Nha', 'VN', 17.5898, 106.2826, ['phong nha', 'phong nha ke bang', '峰牙'], 30),
  city('vn-dongha', 'Đồng Hới', 'VN', 17.4689, 106.6223, ['dong hoi'], 20),
  sub('district', 'vn-hcmc-q1', 'Quận 1', HCMC, ['quan 1', 'q1', 'q 1', 'district 1', 'dist 1', '第一郡', '一郡']),
  sub('district', 'vn-hcmc-q3', 'Quận 3', HCMC, ['quan 3', 'q3', 'q 3', 'district 3']),
  sub('district', 'vn-hcmc-q5', 'Quận 5', HCMC, ['quan 5', 'q5', 'district 5', 'cho lon', 'cholon']),
  sub('district', 'vn-hcmc-q7', 'Quận 7', HCMC, ['quan 7', 'q7', 'district 7', 'phu my hung']),
  sub('district', 'vn-hcmc-q10', 'Quận 10', HCMC, ['quan 10', 'q10', 'district 10']),
  sub('district', 'vn-hcmc-binhthanh', 'Bình Thạnh', HCMC, ['binh thanh', 'binh thanh district']),
  sub('district', 'vn-hcmc-thuduc', 'Thủ Đức', HCMC, ['thu duc', 'thu duc city']),
  sub('place', 'vn-hcmc-benthanh', 'Chợ Bến Thành', HCMC, ['ben thanh', 'cho ben thanh', 'ben thanh market', '边城市场']),
  sub('place', 'vn-hcmc-buivien', 'Phố Bùi Viện', HCMC, ['bui vien', 'pho tay bui vien']),
  sub('district', 'vn-hanoi-hoankiem', 'Hoàn Kiếm', HANOI, ['hoan kiem', 'quan hoan kiem', '还剑区']),
  sub('place', 'vn-hanoi-hoguom', 'Hồ Hoàn Kiếm (Hồ Gươm)', HANOI, ['ho guom', 'ho hoan kiem', 'hoan kiem lake', 'sword lake', '还剑湖', '剑湖', 'hoan kiem']),
  sub('place', 'vn-hanoi-phoco', 'Phố cổ Hà Nội', HANOI, ['pho co', 'pho co ha noi', 'old quarter', 'hanoi old quarter', '河内老城区', '老城区']),
  sub('place', 'vn-hanoi-hotay', 'Hồ Tây', HANOI, ['ho tay', 'west lake', 'tay ho', 'quan tay ho', '河内西湖']),
  sub('district', 'vn-hanoi-caugiay', 'Cầu Giấy', HANOI, ['cau giay']),
  sub('district', 'vn-hanoi-badinh', 'Ba Đình', HANOI, ['ba dinh', 'lang bac', 'ho chi minh mausoleum', '巴亭']),
  sub('place', 'vn-danang-mykhe', 'Biển Mỹ Khê', DANANG, ['my khe', 'bien my khe', 'my khe beach', '美溪海滩']),
  sub('place', 'vn-danang-bana', 'Bà Nà Hills', DANANG, ['ba na', 'ba na hills', 'cau vang', 'golden bridge', '巴拿山']),
  // ---- Thailand ----
  BANGKOK,
  city('th-chiangmai', 'เชียงใหม่', 'TH', 18.7883, 98.9853, ['chiang mai', 'chiangmai', 'chieng mai', '清迈'], 35),
  city('th-phuket', 'ภูเก็ต', 'TH', 7.8804, 98.3923, ['phuket', 'phu ket', '普吉岛', '普吉'], 35),
  city('th-pattaya', 'พัทยา', 'TH', 12.9236, 100.8825, ['pattaya', 'pat ta ya', '芭提雅'], 30),
  sub('place', 'th-bangkok-sukhumvit', 'ถนนสุขุมวิท', BANGKOK, ['sukhumvit', 'khao san', 'khao san road', 'chatuchak', '考山路']),
  // ---- Japan / Korea ----
  TOKYO,
  city('jp-osaka', '大阪', 'JP', 34.6937, 135.5023, ['osaka', 'o sa ka', '大阪'], 35),
  city('jp-kyoto', '京都', 'JP', 35.0116, 135.7681, ['kyoto', 'kyo to', '京都'], 30),
  sub('place', 'jp-tokyo-shibuya', '渋谷', TOKYO, ['shibuya', 'shibuya crossing', '涩谷']),
  sub('place', 'jp-tokyo-shinjuku', '新宿', TOKYO, ['shinjuku', '新宿']),
  sub('place', 'jp-tokyo-asakusa', '浅草', TOKYO, ['asakusa', 'senso ji', 'sensoji', '浅草寺']),
  SEOUL,
  city('kr-busan', '부산', 'KR', 35.1796, 129.0756, ['busan', 'pusan', '釜山'], 35),
  sub('place', 'kr-seoul-gangnam', '강남', SEOUL, ['gangnam', 'myeongdong', 'myeong dong', 'hongdae', '江南区', '明洞']),
  // ---- the rest of Asia ----
  { ...city('sg-singapore', 'Singapore', 'SG', 1.3521, 103.8198, ['singapore', 'singapo', 'sin ga po', '新加坡'], 30), kind: 'city' },
  city('hk-hongkong', '香港', 'HK', 22.3193, 114.1694, ['hong kong', 'hongkong', 'hk', 'hong kong sar', '香港'], 30),
  city('tw-taipei', '臺北', 'TW', 25.033, 121.5654, ['taipei', 'dai bac', '台北', '臺北'], 30),
  city('my-kl', 'Kuala Lumpur', 'MY', 3.139, 101.6869, ['kuala lumpur', 'kl', 'kualalumpur', 'kuala lampur', '吉隆坡'], 35),
  city('my-penang', 'George Town', 'MY', 5.4141, 100.3288, ['penang', 'george town', 'georgetown penang', '槟城'], 25),
  city('my-sabah', 'Sabah', 'MY', 5.9788, 116.0753, ['sabah', 'kota kinabalu', '沙巴', '亚庇'], 40),
  city('kh-phnompenh', 'ភ្នំពេញ', 'KH', 11.5564, 104.9282, ['phnom penh', 'phnompenh', 'pnom penh', 'phnom pen', '金边'], 35),
  city('la-vientiane', 'ວຽງຈັນ', 'LA', 17.9757, 102.6331, ['vientiane', 'vien chan', 'vieng chan', '万象'], 30),
  city('la-luangprabang', 'ຫຼວງພະບາງ', 'LA', 19.8845, 102.1347, ['luang prabang', 'luang phabang', 'luong pha bang', '琅勃拉邦'], 25),
  sub('place', 'kh-siemreap-angkor', 'Angkor Wat', SIEMREAP, ['angkor wat', 'angkor', 'ang kor', '吴哥窟', '吴哥']),
  SIEMREAP,
  city('id-bali', 'Bali', 'ID', -8.4095, 115.1889, ['bali', 'ba li', 'denpasar', 'ubud', 'kuta', '巴厘岛', '巴厘'], 70),
  city('id-jakarta', 'Jakarta', 'ID', -6.2088, 106.8456, ['jakarta', 'gia cat ta', '雅加达'], 40),
  city('ph-manila', 'Manila', 'PH', 14.5995, 120.9842, ['manila', 'ma ni la', '马尼拉'], 35),
  city('cn-beijing', '北京', 'CN', 39.9042, 116.4074, ['beijing', 'bac kinh', '北京'], 50),
  city('cn-shanghai', '上海', 'CN', 31.2304, 121.4737, ['shanghai', 'thuong hai', '上海'], 50),
  city('cn-shenzhen', '深圳', 'CN', 22.5431, 114.0579, ['shenzhen', 'tham quyen', '深圳'], 40),
  city('cn-guangzhou', '广州', 'CN', 23.1291, 113.2644, ['guangzhou', 'quang chau', '广州'], 45),
  city('cn-chengdu', '成都', 'CN', 30.5728, 104.0668, ['chengdu', 'thanh do', '成都'], 45),
  city('cn-hangzhou', '杭州', 'CN', 30.2741, 120.1551, ['hangzhou', 'hang chau', '杭州', 'west lake', '西湖'], 40),
  city('ae-dubai', 'Dubai', 'AE', 25.2048, 55.2708, ['dubai', 'du bai', '迪拜'], 50),
  // ---- Europe / Americas / Oceania ----
  PARIS,
  city('gb-london', 'London', 'GB', 51.5072, -0.1276, ['london', 'luan don', 'luan dan', '伦敦'], 45),
  city('it-rome', 'Roma', 'IT', 41.9028, 12.4964, ['rome', 'roma', 'la ma', '罗马'], 35),
  city('de-berlin', 'Berlin', 'DE', 52.52, 13.405, ['berlin', 'be lin', '柏林'], 40),
  NYC,
  city('us-la', 'Los Angeles', 'US', 34.0522, -118.2437, ['los angeles', 'la city', 'lax city', '洛杉矶'], 50),
  city('us-sf', 'San Francisco', 'US', 37.7749, -122.4194, ['san francisco', 'sf bay', '旧金山'], 30),
  city('au-sydney', 'Sydney', 'AU', -33.8688, 151.2093, ['sydney', 'sy dni', 'sydney city', '悉尼'], 45),
  city('au-melbourne', 'Melbourne', 'AU', -37.8136, 144.9631, ['melbourne', 'mel bourne', '墨尔本'], 45),
  // ---- names that are genuinely ambiguous: several entities share one alias (R13 §3.4 step 5: ask, never guess) ----
  city('gb-cambridge', 'Cambridge', 'GB', 52.2053, 0.1218, ['cambridge'], 20),
  city('us-cambridge', 'Cambridge', 'US', 42.3736, -71.1097, ['cambridge'], 15),
  city('gb-birmingham', 'Birmingham', 'GB', 52.4862, -1.8904, ['birmingham'], 30),
  city('us-birmingham', 'Birmingham', 'US', 33.5186, -86.8104, ['birmingham'], 30),
  city('es-valencia', 'València', 'ES', 39.4699, -0.3763, ['valencia'], 25),
  city('ve-valencia', 'Valencia', 'VE', 10.1579, -67.9972, ['valencia'], 25),
  city('cl-santiago', 'Santiago', 'CL', -33.4489, -70.6693, ['santiago'], 40),
  city('es-santiago', 'Santiago de Compostela', 'ES', 42.8782, -8.5448, ['santiago'], 15),
  city('us-sanjose', 'San Jose', 'US', 37.3382, -121.8863, ['san jose'], 30),
  city('cr-sanjose', 'San José', 'CR', 9.9281, -84.0907, ['san jose'], 30),
  city('ca-victoria', 'Victoria', 'CA', 48.4284, -123.3656, ['victoria'], 20),
  city('au-victoria', 'Victoria', 'AU', -37.4713, 144.7852, ['victoria'], 80),
  city('sc-victoria', 'Victoria', 'SC', -4.6191, 55.4513, ['victoria'], 20),
  city('us-alexandria', 'Alexandria', 'US', 38.8048, -77.0469, ['alexandria'], 15),
  city('eg-alexandria', 'Alexandria', 'EG', 31.2001, 29.9187, ['alexandria'], 30),
  city('ge-georgia', 'Georgia (country)', 'GE', 41.7151, 44.8271, ['georgia', 'tbilisi'], 30),
  city('us-georgia', 'Georgia (state)', 'US', 33.749, -84.388, ['georgia', 'atlanta'], 40),
]

// ---- normalisation: lower case, no diacritics, no punctuation; CJK kept; the string keeps the SAME length as the NFC lower-case text so indexes line up ----
export function foldChar(ch: string): string {
  if (ch === 'đ') return 'd'
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const out = base.length === 0 ? ' ' : base[0]
  if (/[a-z0-9]/.test(out)) return out
  if (/[぀-ヿ㐀-鿿豈-﫿＀-￯가-힯฀-๿؀-ۿ]/.test(out)) return out
  return ' '
}

/** The folded text (same length as `text.normalize('NFC').toLowerCase()`), used for alias matching and for the cue windows. */
export function foldText(text: string): string {
  const base = text.normalize('NFC').toLowerCase()
  let out = ''
  for (const ch of base) out += ch.length === 1 ? foldChar(ch) : ' '.repeat(ch.length)
  return out
}

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/
const foldAlias = (a: string): string => foldText(a).replace(/\s+/g, ' ').trim()

interface AliasIndexEntry { alias: string; cjk: boolean; strict: boolean; /** matched case-sensitively on the raw text ("Hue" capitalised, never the English word "hue") */ exact: boolean; entities: GeoEntity[] }

const ENTITY_BY_ID = new Map<string, GeoEntity>(GAZETTEER.map(e => [e.id, e]))
export const geoEntityById = (id: string): GeoEntity | undefined => ENTITY_BY_ID.get(id)

const ALIAS_INDEX: AliasIndexEntry[] = (() => {
  const m = new Map<string, AliasIndexEntry>()
  const add = (raw: string, e: GeoEntity, strict: boolean, exact = false) => {
    const alias = exact ? raw.normalize('NFC') : strict ? raw.normalize('NFC').toLowerCase() : foldAlias(raw)
    if (!alias) return
    const key = (exact ? 'E:' : strict ? 'S:' : 'F:') + alias
    const hit = m.get(key)
    if (hit) { if (!hit.entities.includes(e)) hit.entities.push(e) }
    else m.set(key, { alias, cjk: CJK.test(alias), strict: strict || exact, exact, entities: [e] })
  }
  for (const e of GAZETTEER) {
    for (const n of e.names) add(n, e, false)
    for (const n of e.strict ?? []) add(n, e, true)
    for (const n of e.capitalised ?? []) add(n, e, true, true)
  }
  return [...m.values()].sort((a, b) => b.alias.length - a.alias.length)
})()

export type MentionRole = 'STATED_LOCATION' | 'ORIGIN' | 'NEAR' | 'TARGET' | 'NONLOCATIVE'

export interface GeoMention {
  start: number
  end: number
  /** the text as written (lower-cased NFC) */
  text: string
  /** one entity = exact; several = ambiguous (the caller disambiguates from context or asks) */
  candidates: GeoEntity[]
  role: MentionRole
}

// "mình ở X", "tôi đang ở X", and "đang ở X" / "hiện ở X" without the pronoun (a clause such as "Tôi là người Mỹ, đang ở Hà Nội")
const STATED_LOC_VI = /(?:(?:minh|toi|tui|em|anh|chi|chung toi|chung minh|gia dinh minh|nha minh)\s+(?:dang\s+)?(?:o|tai|dang o)|\bdang\s+(?:o|tai|song o)|\bhien\s+(?:dang\s+)?(?:o|tai))\s*$/
// a country / city named as a person's nationality, citizenship, cuisine or language is NOT a location ("我是中国人", "người Hà Nội", "越南菜", "citizen of Japan")
const NONLOC_BEFORE = /(?:\bnguoi|\bdan|\bquoc tich|\bcong dan|\bho chieu|\bcitizen of|\bnational of|\bpassport (?:from|of)|\bholder of)\s*$/
const NONLOC_BEFORE_ZH = /(?:国籍|國籍|公民|护照|護照)$/
const NONLOC_AFTER_ZH = /^(?:人|菜|料理|美食|风味|菜系|语|文字|话|籍|人民|游客)/
const STATED_LOC_EN_STRICT = /(?:\bi am|\bi m|\bim|\bwe are|\bwe re|\bi live|\bwe live|\bi stay|\bwe stay|\bstaying|\bcurrently)\s+(?:currently\s+)?(?:in|at)\s*$/
const STATED_LOC_ZH = /(?:我|我们|我現在|我现在|我目前|我人|我们现在|我们目前|现在|目前)(?:正)?(?:在|住在|位于|到了|来到)$/
const ORIGIN_FROM = /(?:\btu|\bfrom|\bleaving|\bdeparting from|\bxuat phat tu|\bkhoi hanh tu|\bbay tu|\bdi tu|\bstarting from|\bstarting in|\bstart from)\s*$/
const ORIGIN_FROM_ZH = /(?:从|從|自|由)$/
// "gần Hồ Gươm", and up to two words between the cue and the name ("gần ga Hà Nội", "near the old quarter", "close to the station")
const NEAR_BEFORE = /(?:\bgan|\bnear|\baround|\bquanh|\bclose to|\bnext to|\bnearby|\bxung quanh|\bbeside|\bthe area of)\s+(?:\S+\s+){0,2}$/
const NEAR_AFTER_ZH = /^\s*(?:附近|周边|周围|旁边|一带|这边|那边)/
// 近新宿站 / 靠近 / 邻近 / 紧邻 (but not 最近 = "recently")
const NEAR_BEFORE_ZH = /(?:靠近|邻近|临近|紧邻|(?<!最)近)(?:\S{0,2})$/
const ORIGIN_AFTER_ZH = /^\s*(?:出发|出境|入境|起飞|启程)/

function roleOf(folded: string, start: number, end: number): MentionRole {
  const before = folded.slice(Math.max(0, start - 28), start)
  const after = folded.slice(end, end + 8)
  const beforeZh = before.replace(/\s+/g, '')
  const afterZh = after.replace(/^\s+/, '')
  if (NONLOC_BEFORE.test(before) || NONLOC_BEFORE_ZH.test(beforeZh) || NONLOC_AFTER_ZH.test(afterZh)) return 'NONLOCATIVE'
  if (STATED_LOC_VI.test(before) || STATED_LOC_EN_STRICT.test(before) || STATED_LOC_ZH.test(beforeZh)) return 'STATED_LOCATION'
  if (NEAR_BEFORE.test(before) || NEAR_BEFORE_ZH.test(beforeZh) || NEAR_AFTER_ZH.test(after)) return 'NEAR'
  if (ORIGIN_FROM.test(before) || ORIGIN_FROM_ZH.test(before.replace(/\s+/g, '')) || ORIGIN_AFTER_ZH.test(after)) return 'ORIGIN'
  return 'TARGET'
}

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[a-z0-9]/.test(ch)

/** Every place name in the text, longest names first, no overlaps. Pure. */
export function findGeoMentions(text: string): GeoMention[] {
  if (!text) return []
  const rawNfc = text.normalize('NFC')
  const base = rawNfc.toLowerCase()
  const folded = foldText(text)
  const spans: Array<{ start: number; end: number; entities: GeoEntity[] }> = []
  for (const ent of ALIAS_INDEX) {
    const hay = ent.exact ? rawNfc : ent.strict ? base : folded
    let from = 0
    for (;;) {
      const i = hay.indexOf(ent.alias, from)
      if (i < 0) break
      const j = i + ent.alias.length
      from = i + 1
      if (!ent.cjk) {
        const prev = hay[i - 1]; const next = hay[j]
        if (ent.strict ? (/\p{L}|\p{N}/u.test(prev ?? ' ') || /\p{L}|\p{N}/u.test(next ?? ' ')) : (isWordChar(prev) || isWordChar(next))) continue
      }
      spans.push({ start: i, end: j, entities: ent.entities })
    }
  }
  spans.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)
  const taken: Array<[number, number]> = []
  const out: GeoMention[] = []
  for (const s of spans) {
    if (taken.some(([a, b]) => s.start < b && s.end > a)) continue
    taken.push([s.start, s.end])
    out.push({ start: s.start, end: s.end, text: base.slice(s.start, s.end), candidates: s.entities, role: roleOf(folded, s.start, s.end) })
  }
  return out.sort((a, b) => a.start - b.start)
}

const toRad = (d: number) => (d * Math.PI) / 180
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat); const dLng = toRad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/** Which gazetteer city a GPS fix is in (nearest within its radius), else Viet Nam by a coarse box (the one served market), else nothing. Never a guess from language. Pure. */
export function locateByCoords(lat: number, lng: number): { countryCode?: string; cityId?: string } {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return {}
  let best: { e: GeoEntity; d: number } | null = null
  for (const e of GAZETTEER) {
    if (e.kind !== 'city' || e.lat === undefined || e.lng === undefined) continue
    const d = distanceKm(lat, lng, e.lat, e.lng)
    if (d <= (e.radiusKm ?? 40) && (!best || d < best.d)) best = { e, d }
  }
  if (best) return { countryCode: best.e.country, cityId: best.e.cityId }
  if (lat >= 8 && lat <= 23.5 && lng >= 102 && lng <= 110) return { countryCode: 'VN' }
  return {}
}
