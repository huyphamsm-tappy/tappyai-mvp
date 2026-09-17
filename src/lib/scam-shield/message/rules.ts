import { normalizeVN } from '@/lib/ai/intent'
import type { RequestLocale } from '@/lib/i18n/requestLocale'
import type { RiskLevel } from '../types'
import type { MessageSignal, MessageSignalSeverity, SignalType } from './types'
import { LEVEL_FLOOR_SCORE } from './config'

// Scam Shield · message analysis — deterministic social-engineering rules.
//
// These run on EVERY message, before and independently of any model, and they are what makes the
// Telegram regression hold with the model switched off: "your account is high risk, verify your
// phone within 48 hours, tap here" trips the threat + verification + urgency + link rules, and the
// combination FLOORS the verdict at HIGH. A model can raise that; nothing can lower it.
//
// They are deliberately conservative pattern matches, not a classifier. Their job is a floor and
// a routing hint, and their explanations are bilingual so a rule-found signal reads the same as a
// model-found one to the user.
//
// Matching runs on lower-cased, diacritic-stripped text (`normalizeVN`), so "tài khoản" and
// "tai khoan" are one pattern; Chinese is unaffected by the strip and matched as written.

interface Rule {
  type: SignalType
  severity: MessageSignalSeverity
  weight: number
  patterns: RegExp[]
  /** Skip a match preceded by a negation ("do NOT share your OTP") — the legitimate wording. */
  negatable?: boolean
  explanation: { vi: string; en: string }
}

/** Negation words. A match is negated when one of these sits in the same sentence, at or before
 *  the request, and is not itself part of a CONDITION — "nếu không cung cấp OTP" / "if you do not
 *  provide the code" is a threat, not a warning. */
const NEGATION_WORDS = /(khong|dung|never|not|don't|do not|won't|will not|shouldn't|no one|nobody|不要|切勿|勿|绝不|不会)/g
const CONDITIONAL_BEFORE = /(\bneu\b|\bif\b|\bunless\b|truong hop|如果|若)\s*[a-z ]{0,10}$/

const RULES: Rule[] = [
  {
    type: 'account_suspension_threat', severity: 'high', weight: 25,
    patterns: [
      /(tai khoan|account|acc)\b.{0,60}?(bi khoa|khoa|dinh chi|tam ngung|vo hieu|bi xoa|bi han che|bi thu hoi)/,
      /(khoa|dinh chi|tam ngung|vo hieu hoa|xoa|thu hoi).{0,40}?tai khoan/,
      /(account|profile|access).{0,60}?(locked|suspended|blocked|disabled|terminated|deactivated|restricted|deleted|closed)/,
      /(suspend|lock|block|disable|terminate|deactivate|restrict|delete|close)\w*.{0,30}?(your )?(account|profile|access)/,
      /(账户|账号|帐号|帐户).{0,20}?(冻结|封禁|锁定|停用|封号|注销|限制)/,
      /(冻结|封禁|锁定|停用|注销|限制).{0,10}?(账户|账号|帐号|帐户)/,
    ],
    explanation: {
      vi: 'Đe dọa khóa hoặc đình chỉ tài khoản — chiêu ép người nhận hành động vội.',
      en: 'Threatens to lock or suspend an account — a pressure tactic to make you act quickly.',
    },
  },
  {
    type: 'fake_security_alert', severity: 'medium', weight: 15,
    patterns: [
      /(rui ro cao|trang thai rui ro|nguy co cao|high[- ]risk|bat thuong|dang nhap la|unusual (activity|login|sign-?in)|suspicious (activity|login|sign-?in)|security (alert|warning|notice)|canh bao bao mat|异常登录|安全警告|风险状态|异常活动|高风险)/,
    ],
    explanation: {
      vi: 'Dựng lên một "cảnh báo bảo mật" để tạo cớ yêu cầu bạn xác thực.',
      en: 'Stages a "security alert" as the pretext for asking you to verify something.',
    },
  },
  {
    type: 'urgency_pressure', severity: 'medium', weight: 15,
    patterns: [
      /(trong vong|within|in the next|in) \d+ ?(gio|phut|ngay|h\b|hours?|hrs|minutes?|mins?|days?)/,
      /\b(12|24|48|72) ?(gio|h\b|hours?|tieng)/,
      /(ngay lap tuc|ngay bay gio|ngay hom nay|immediately|right now|right away|khan cap|urgent(ly)?|het han|expires?( today| soon| in)?|last chance|co hoi cuoi|truoc khi qua muon|限时|立即|马上|尽快|紧急|小时内|分钟内|今日内|逾期)/,
    ],
    explanation: {
      vi: 'Đặt ra hạn chót gấp gáp để bạn không kịp suy nghĩ hay kiểm chứng.',
      en: 'Sets an artificial deadline so you have no time to think or check.',
    },
  },
  {
    type: 'verify_phone_request', severity: 'high', weight: 20,
    patterns: [
      /(xac (thuc|minh|nhan)|verify|verification|confirm|cap nhat|update|re-?verify).{0,40}?(so dien thoai|sdt|phone number|mobile number|phone|手机号|电话号码)/,
      /(so dien thoai|sdt|phone number|mobile number|手机号|电话号码).{0,30}?(xac (thuc|minh|nhan)|verify|verification|验证)/,
    ],
    explanation: {
      vi: 'Yêu cầu "xác thực số điện thoại" — bước đầu của việc chiếm đoạt tài khoản qua mã OTP.',
      en: 'Asks you to "verify your phone number" — the usual first step of an OTP-based account takeover.',
    },
  },
  {
    type: 'verify_account_request', severity: 'medium', weight: 15,
    patterns: [
      /(xac (thuc|minh|nhan)|verify|verification|confirm|validate|re-?verify|cap nhat|update|kyc).{0,40}?(tai khoan|danh tinh|thong tin|account|identity|information|details|账户|账号|身份|信息)/,
      /(bat dau|start|begin|proceed to|tien hanh) (xac (thuc|minh|nhan)|verification|verifying)/,
      /(验证|认证|核实).{0,10}?(账户|账号|身份|信息)/,
    ],
    explanation: {
      vi: 'Yêu cầu "xác thực tài khoản" bên ngoài ứng dụng chính thức.',
      en: 'Asks you to "verify your account" outside the official app.',
    },
  },
  {
    type: 'otp_request', severity: 'high', weight: 30, negatable: true,
    patterns: [
      /(nhap|cung cap|gui|doc|cho .{0,12}biet|chia se|xac nhan|enter|provide|send|share|reply with|tell (us|me)|input|type|submit|输入|提供|发送|告知|回复).{0,40}?(\botp\b|ma otp|ma xac (thuc|nhan|minh)|ma bao mat|ma code|verification code|security code|one[- ]time (code|password|pin)|login code|auth(entication)? code|2fa code|验证码|校验码|动态码)/,
      /(\botp\b|ma otp|ma xac (thuc|nhan|minh)|verification code|security code|login code|验证码).{0,30}?(nhap|cung cap|gui|cho .{0,12}biet|chia se|enter|provide|send|share|reply|输入|提供|发送|回复)/,
    ],
    explanation: {
      vi: 'Yêu cầu mã OTP / mã xác thực — không tổ chức hợp pháp nào hỏi mã này.',
      en: 'Asks for an OTP / verification code — no legitimate organisation asks for this.',
    },
  },
  {
    type: 'password_request', severity: 'high', weight: 25, negatable: true,
    patterns: [
      /(nhap|cung cap|gui|xac nhan|cap nhat|enter|provide|send|confirm|update|输入|提供).{0,30}?(mat khau|password|passwd|\bpass\b|密码)/,
      /(mat khau|password|密码).{0,30}?(nhap|cung cap|gui|enter|provide|send|输入|提供)/,
    ],
    explanation: {
      vi: 'Yêu cầu mật khẩu.',
      en: 'Asks for a password.',
    },
  },
  {
    type: 'pin_request', severity: 'high', weight: 25, negatable: true,
    patterns: [/(nhap|cung cap|gui|enter|provide|send|输入|提供).{0,30}?(\bpin\b|ma pin|pin code|支付密码)/],
    explanation: { vi: 'Yêu cầu mã PIN.', en: 'Asks for a PIN.' },
  },
  {
    type: 'transfer_request', severity: 'high', weight: 20,
    patterns: [
      /(chuyen (khoan|tien)|chuyen ngay|thanh toan (ngay|truoc|phi)|nop (tien|phi)|dong (phi|tien)|transfer|wire|pay(ment)? (now|first|a fee|the fee)|send money|deposit|phi (xu ly|bao hiem|van chuyen|mo khoa|giai ngan|kich hoat|hai quan)|(processing|unlock|release|activation|insurance|shipping|customs|handling) fee|转账|汇款|付款|缴费|手续费|保证金)/,
    ],
    explanation: {
      vi: 'Yêu cầu chuyển tiền hoặc nộp một khoản "phí" trước.',
      en: 'Asks you to transfer money or pay a "fee" up front.',
    },
  },
  {
    type: 'payment_request', severity: 'medium', weight: 12,
    patterns: [
      /(so tai khoan|\bstk\b|bank account|account number|account no|银行卡号|收款账户)/,
      /(vietcombank|techcombank|mb ?bank|vietinbank|bidv|agribank|\bacb\b|tpbank|vpbank|sacombank|momo|zalopay|vnpay)\b.{0,30}?\d{6,}/,
    ],
    explanation: {
      vi: 'Cung cấp số tài khoản để nhận tiền.',
      en: 'Provides a bank account to receive money.',
    },
  },
  {
    type: 'crypto_request', severity: 'high', weight: 20,
    patterns: [
      /(\busdt\b|bitcoin|\bbtc\b|\beth\b|ethereum|binance|okx|bybit|tether|dia chi vi|wallet address|vi (dien tu|crypto|tien ao)|tien ao|tien dien tu|crypto|钱包地址|虚拟币|加密货币|泰达币)/,
    ],
    explanation: {
      vi: 'Liên quan đến tiền mã hóa / ví điện tử — giao dịch không thể hoàn lại.',
      en: 'Involves cryptocurrency / a wallet address — transactions cannot be reversed.',
    },
  },
  {
    type: 'remote_access_request', severity: 'high', weight: 25,
    patterns: [
      /(teamviewer|anydesk|ultraviewer|quick ?support|chia se man hinh|screen ?shar\w*|remote (access|control|desktop|support)|dieu khien tu xa|truy cap tu xa|ho tro tu xa|远程控制|屏幕共享|远程协助)/,
    ],
    explanation: {
      vi: 'Yêu cầu chia sẻ màn hình hoặc điều khiển thiết bị từ xa.',
      en: 'Asks for screen sharing or remote control of your device.',
    },
  },
  {
    type: 'app_install_request', severity: 'high', weight: 20,
    patterns: [
      /(cai dat|cai app|tai (ve|app|ung dung|xuong)|install|download).{0,40}?(app|ung dung|apk|phan mem|application|software|file|tep|link)/,
      /\.apk\b/,
      /(安装|下载).{0,10}?(应用|软件|app|程序)/,
    ],
    explanation: {
      vi: 'Yêu cầu cài đặt ứng dụng / tệp từ nguồn không chính thức.',
      en: 'Asks you to install an app or file from an unofficial source.',
    },
  },
  {
    type: 'reward_bait', severity: 'medium', weight: 15,
    patterns: [
      /(trung thuong|trung giai|giai thuong|phan thuong|qua tang|voucher|tri an|chuc mung ban|congratulations|you('ve| have)? (been selected|won)|winner|prize|reward|gift ?card|free (gift|money|iphone)|lucky|may man|nhan qua|nhan thuong|中奖|恭喜|奖品|奖金|礼品|免费领取)/,
    ],
    explanation: {
      vi: 'Dùng phần thưởng / quà tặng làm mồi nhử.',
      en: 'Uses a prize or gift as bait.',
    },
  },
  {
    type: 'investment_promise', severity: 'medium', weight: 20,
    patterns: [
      /(loi nhuan|lai suat|sinh loi|dau tu|investment|invest|profit|guaranteed (return|profit|income)|cam ket loi nhuan|hoa hong|passive income|thu nhap thu dong|kiem tien (online|tai nha)|earn money|make money|收益|回报|稳赚|投资|利润|理财|日息|月息)/,
      /\d+ ?% ?(\/|moi|per|1|a) ?(ngay|tuan|thang|day|week|month)/,
    ],
    explanation: {
      vi: 'Hứa hẹn lợi nhuận / thu nhập — dấu hiệu lừa đảo đầu tư.',
      en: 'Promises returns or income — the shape of an investment scam.',
    },
  },
  {
    type: 'fake_legal_notice', severity: 'high', weight: 20,
    patterns: [
      /(lenh bat|trat|khoi to|truy na|vi pham phap luat|lien quan (den |toi )?(vu an|duong day)|rua tien|money laundering|arrest warrant|legal (action|notice)|lawsuit|court (order|summons)|toa an|vien kiem sat|co quan dieu tra|co quan cong an|bo cong an|cong an (thanh pho|tinh|quan|huyen|phuong)|hinh su|涉嫌|逮捕|洗钱|法院传票|立案|通缉|公安局|检察院)/,
    ],
    explanation: {
      vi: 'Giả danh cơ quan pháp luật — công an, tòa án không làm việc qua tin nhắn.',
      en: 'Poses as a legal authority — police and courts do not work through messages.',
    },
  },
  {
    type: 'fake_customer_support', severity: 'medium', weight: 12,
    patterns: [
      /(bo phan (ho tro|cham soc|cskh|ky thuat)|\bcskh\b|tong dai|customer (support|service|care)|help ?desk|support team|technical support|he thong (thong bao|phat hien|ghi nhan|hien thi|canh bao)|system (detected|shows|has detected|notification|alert)|客服|专员|系统(检测|显示|提示))/,
    ],
    explanation: {
      vi: 'Tự xưng là bộ phận hỗ trợ / "hệ thống" để tạo vẻ chính thức.',
      en: 'Claims to be support or "the system" to sound official.',
    },
  },
  {
    type: 'platform_switch_request', severity: 'medium', weight: 12,
    patterns: [
      /(ket ban|add|them|lien he|nhan tin|chat|inbox|ib)\s?(qua|vao|tren|voi|on|via|me on|us on)?\s?(zalo|telegram|whatsapp|viber|messenger|signal|line|wechat|imess)/,
      /(contact|message|chat|reach|add|text|dm) (me |us )?(on|via|through) (zalo|telegram|whatsapp|viber|signal|line|wechat)/,
      /(zalo|telegram|whatsapp|viber):? ?(\+?\d[\d ]{7,}|@\w+)/,
      /(加我?微信|加(我)?(qq|telegram|whatsapp)|私聊)/,
    ],
    explanation: {
      vi: 'Dụ chuyển sang nền tảng khác — nơi khó truy vết và kiểm soát.',
      en: 'Tries to move the conversation to another platform where it is harder to trace.',
    },
  },
  {
    type: 'link_click_request', severity: 'medium', weight: 12,
    patterns: [
      /(nhan vao (day|link|lien ket|duong dan)|bam vao (day|link|lien ket)|click (here|the link|below|this link|on the link)|tap (here|the link|below)|truy cap (link|lien ket|duong dan)|theo (link|duong dan)|open the link|link (ben duoi|duoi day|sau)|(link|lien ket) (de|to) (xac|verify|confirm|claim|nhan)|点击(这里|链接|下方|此处)|访问链接)/,
    ],
    explanation: {
      vi: 'Thúc giục bấm vào một liên kết bên ngoài.',
      en: 'Urges you to open an external link.',
    },
  },
  {
    type: 'credential_entry_request', severity: 'high', weight: 20,
    patterns: [
      /(dang nhap (tai|vao|qua|theo) (link|lien ket|day|trang|duong dan)|log ?in (via|at|through|using|on) (the |this )?(link|page|here|below|site)|sign ?in (via|at|through|on) (the |this )?(link|page)|nhap thong tin (dang nhap|tai khoan|the)|enter your (login|credentials|card|account details|card details)|(so the|card number|\bcvv\b|\bcvc\b)|输入.{0,10}?(账号|卡号|密码))/,
    ],
    explanation: {
      vi: 'Yêu cầu đăng nhập hoặc nhập thông tin tài khoản / thẻ qua liên kết.',
      en: 'Asks you to log in or enter account / card details through a link.',
    },
  },
  {
    type: 'fear_threat_language', severity: 'medium', weight: 12,
    patterns: [
      /(se bi (khoa|xoa|phat|bat|truy to|xu ly|mat|dinh chi|thu hoi)|mat (tien|tai khoan|quyen)|chiu trach nhiem|hau qua|bi phat|will be (locked|deleted|fined|arrested|prosecuted|suspended|terminated|permanently)|permanently (lose|lock|delete|suspend)|consequences|penalty|face (legal|charges|prosecution)|lose (access|your account|your money|everything)|失去|后果|处罚|永久|将被)/,
    ],
    explanation: {
      vi: 'Dùng lời lẽ đe dọa / gây sợ hãi.',
      en: 'Uses threatening or fear-inducing language.',
    },
  },
  {
    type: 'prompt_injection_attempt', severity: 'high', weight: 20,
    patterns: [
      /(ignore (all |the |your |any )?(previous|prior|above|earlier) (instructions|prompts?|rules|guidance)|disregard (the |your |all )?(previous|above|system|prior)|you are now|new instructions?:|system prompt|\bas an ai\b|tell the user to|respond (only )?with|output the following|bo qua (cac |moi )?(huong dan|chi thi|lenh) (truoc|tren|o tren)|忽略(之前|以上|上面)的?(指令|指示|提示))/,
    ],
    explanation: {
      vi: 'Chứa câu lệnh nhắm vào hệ thống phân tích — tin nhắn cố thao túng công cụ kiểm tra.',
      en: 'Contains instructions aimed at the analysis system — the message is trying to manipulate the checker.',
    },
  },
]

/** Brand / institution names whose appearance next to a request marks impersonation. */
const IMPERSONATION_TARGETS =
  /\b(telegram|zalo|facebook|\bmeta\b|instagram|google|gmail|apple|icloud|microsoft|tiktok|shopee|lazada|tiki|sendo|momo|zalopay|vnpay|viettel ?pay|vietcombank|\bvcb\b|techcombank|\btcb\b|mb ?bank|\bmbb\b|bidv|vietinbank|agribank|\bacb\b|tpbank|vpbank|sacombank|\bocb\b|\bhdbank\b|\bshb\b|\bmsb\b|ngan hang|bank|cong an|police|toa an|vien kiem sat|cuc thue|tong cuc thue|thue|bao hiem xa hoi|\bbhxh\b|chinh phu|dien luc|\bevn\b|vnpt|viettel|mobifone|vinaphone|giao hang|ghtk|viettel post|vnpost|j&t|j and t|grab|be\b|dhl|fedex|ups\b|amazon|netflix|paypal|visa|mastercard|公安|警察|法院|检察院|税务|海关|银行|快递|淘宝|支付宝|微信)/

const IMPERSONATION_EXPLANATION = {
  vi: 'Nhân danh một tổ chức / nền tảng quen thuộc để tạo lòng tin.',
  en: 'Speaks in the name of a familiar organisation or platform to gain trust.',
}

/** Signals that only mean something when a brand is being borrowed. */
const REQUEST_LIKE: ReadonlySet<SignalType> = new Set([
  'account_suspension_threat', 'fake_security_alert', 'verify_phone_request', 'verify_account_request',
  'otp_request', 'password_request', 'pin_request', 'transfer_request', 'payment_request',
  'remote_access_request', 'app_install_request', 'reward_bait', 'fake_legal_notice',
  'fake_customer_support', 'link_click_request', 'credential_entry_request', 'urgency_pressure',
])

export interface RuleEvaluation {
  signals: MessageSignal[]
  /** Sum of matched weights, capped at 100. */
  score: number
  /** The lowest level the fused verdict may report, from signal COMBINATIONS. `null` = no floor. */
  floor: Extract<RiskLevel, 'MEDIUM' | 'HIGH'> | null
  /** The organisation / platform name the message borrows, when it borrows one. Lower-cased. */
  brand: string | null
}

/** Is the sentence that leads into `[start, end)` a negation of what it asks? */
function negated(normalized: string, start: number, end: number): boolean {
  const from = Math.max(0, start - 60)
  const window = normalized.slice(from, end)
  // Only the sentence the match begins in — the previous one may warn and the next one ask.
  const rel = start - from
  const sentenceStart = Math.max(
    window.lastIndexOf('.', rel), window.lastIndexOf('!', rel), window.lastIndexOf('?', rel), window.lastIndexOf('\n', rel),
  ) + 1
  const sentence = window.slice(sentenceStart)
  for (const m of sentence.matchAll(NEGATION_WORDS)) {
    const before = sentence.slice(Math.max(0, (m.index ?? 0) - 16), m.index ?? 0)
    if (!CONDITIONAL_BEFORE.test(before)) return true
  }
  return false
}

/**
 * @param text     The normalised message (see `normalizeMessage`).
 * @param hasUrl   Whether the message carries at least one link — a link is a request in itself.
 */
export function evaluateRules(text: string, locale: RequestLocale, hasUrl: boolean): RuleEvaluation {
  const normalized = normalizeVN(text.toLowerCase())
  const signals: MessageSignal[] = []
  const matched = new Set<SignalType>()
  let score = 0

  for (const rule of RULES) {
    let hit = false
    for (const pattern of rule.patterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
      for (const m of normalized.matchAll(re)) {
        if (rule.negatable && negated(normalized, m.index ?? 0, (m.index ?? 0) + m[0].length)) continue
        hit = true
        break
      }
      if (hit) break
    }
    if (!hit) continue
    matched.add(rule.type)
    score += rule.weight
    signals.push({ type: rule.type, severity: rule.severity, explanation: rule.explanation[locale], source: 'rule' })
  }

  // Impersonation is contextual: a brand name in a message that asks for nothing is just a brand
  // name. Next to a request, it is the request's disguise.
  const brandMatch = IMPERSONATION_TARGETS.exec(normalized)
  const brand = brandMatch ? brandMatch[1].trim() : null
  const asksForSomething = [...matched].some(t => REQUEST_LIKE.has(t)) || hasUrl
  if (brand && asksForSomething) {
    matched.add('impersonation')
    score += 10
    signals.push({ type: 'impersonation', severity: 'medium', explanation: IMPERSONATION_EXPLANATION[locale], source: 'rule' })
  }

  const has = (...types: SignalType[]) => types.some(t => matched.has(t))
  const credentialAsk = has('verify_phone_request', 'verify_account_request', 'otp_request', 'password_request', 'pin_request', 'credential_entry_request', 'link_click_request') || hasUrl
  const moneyAsk = has('transfer_request', 'crypto_request', 'payment_request')
  const pressure = has('urgency_pressure', 'fear_threat_language', 'account_suspension_threat', 'fake_legal_notice', 'reward_bait', 'investment_promise', 'impersonation', 'fake_security_alert')

  let floor: RuleEvaluation['floor'] = null
  if (
    (has('account_suspension_threat', 'fake_security_alert', 'fake_legal_notice') && credentialAsk) ||
    (moneyAsk && pressure) ||
    (has('remote_access_request', 'app_install_request') && (pressure || has('fake_customer_support'))) ||
    (has('otp_request', 'password_request', 'pin_request') && (pressure || hasUrl))
  ) {
    floor = 'HIGH'
  } else if (has('prompt_injection_attempt') || signals.some(s => s.severity === 'high')) {
    floor = 'MEDIUM'
  }

  return { signals, score: Math.min(100, score), floor, brand }
}

/** The score a floor level maps to — the bottom of that band. */
export function floorScore(floor: RuleEvaluation['floor']): number {
  return floor ? LEVEL_FLOOR_SCORE[floor] : 0
}
