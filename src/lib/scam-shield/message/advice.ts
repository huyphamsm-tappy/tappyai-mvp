import type { RiskLevel } from '../types'
import type { AdviceItem, AttackGoal, MessageSignal, SignalType, UrlCheckSummary } from './types'

// Scam Shield · message analysis — what the user should NOT do, and what to do NOW.
//
// 🚨 DETERMINISTIC ON PURPOSE. Advice is the one part of the result a frightened user will act on
// literally, so it is not written by a model that has just read an adversarial message. It is
// looked up from the classified signals and attack goal, in both languages, the same way
// `engine/actionEngine.ts` builds the URL tab's recommended actions. The model explains; the
// product advises.

type Level = RiskLevel

const DO_NOT: Record<string, AdviceItem> = {
  NO_OTP: {
    code: 'NO_OTP',
    label_vi: 'KHÔNG nhập hay đọc mã OTP / mã xác thực cho bất kỳ ai',
    label_en: 'Do NOT enter or read out any OTP / verification code to anyone',
  },
  NO_PASSWORD: {
    code: 'NO_PASSWORD',
    label_vi: 'KHÔNG nhập mật khẩu vào liên kết trong tin nhắn',
    label_en: 'Do NOT enter your password on a link from the message',
  },
  NO_RECOVERY_CODES: {
    code: 'NO_RECOVERY_CODES',
    label_vi: 'KHÔNG cung cấp mã khôi phục, mã 2FA hay thông tin đăng nhập',
    label_en: 'Do NOT provide recovery codes, 2FA codes or login details',
  },
  NO_CLICK_LINK: {
    code: 'NO_CLICK_LINK',
    label_vi: 'KHÔNG bấm vào liên kết trong tin nhắn',
    label_en: 'Do NOT open the link in the message',
  },
  NO_TRANSFER: {
    code: 'NO_TRANSFER',
    label_vi: 'KHÔNG chuyển tiền hay nộp bất kỳ khoản "phí" nào',
    label_en: 'Do NOT transfer money or pay any "fee"',
  },
  NO_CRYPTO: {
    code: 'NO_CRYPTO',
    label_vi: 'KHÔNG gửi tiền mã hóa — giao dịch không thể hoàn lại',
    label_en: 'Do NOT send cryptocurrency — it cannot be reversed',
  },
  NO_INSTALL: {
    code: 'NO_INSTALL',
    label_vi: 'KHÔNG cài đặt ứng dụng hay tệp được gửi kèm',
    label_en: 'Do NOT install any app or file you were sent',
  },
  NO_REMOTE_ACCESS: {
    code: 'NO_REMOTE_ACCESS',
    label_vi: 'KHÔNG chia sẻ màn hình hay cấp quyền điều khiển từ xa',
    label_en: 'Do NOT share your screen or grant remote access',
  },
  NO_PERSONAL_INFO: {
    code: 'NO_PERSONAL_INFO',
    label_vi: 'KHÔNG cung cấp CCCD, số thẻ, thông tin cá nhân',
    label_en: 'Do NOT provide ID, card numbers or personal details',
  },
  NO_MOVE_PLATFORM: {
    code: 'NO_MOVE_PLATFORM',
    label_vi: 'KHÔNG chuyển sang trò chuyện ở ứng dụng khác theo yêu cầu',
    label_en: 'Do NOT move the conversation to another app as asked',
  },
  NO_REPLY: {
    code: 'NO_REPLY',
    label_vi: 'KHÔNG trả lời hay làm theo yêu cầu trong tin nhắn',
    label_en: 'Do NOT reply to or follow the requests in the message',
  },
  NO_RUSH: {
    code: 'NO_RUSH',
    label_vi: 'KHÔNG hành động vội vì hạn chót — đó là chiêu gây áp lực',
    label_en: 'Do NOT act on the deadline — it exists to pressure you',
  },
}

const DO_NOW: Record<string, AdviceItem> = {
  VERIFY_IN_OFFICIAL_APP: {
    code: 'VERIFY_IN_OFFICIAL_APP',
    label_vi: 'Mở ứng dụng chính thức (không qua liên kết) để kiểm tra trạng thái tài khoản',
    label_en: 'Open the official app yourself (not via the link) to check your account status',
  },
  REPORT_SCAM: {
    code: 'REPORT_SCAM',
    label_vi: 'Báo cáo và chặn người gửi',
    label_en: 'Report and block the sender',
  },
  ENABLE_2FA: {
    code: 'ENABLE_2FA',
    label_vi: 'Bật xác thực hai bước trong ứng dụng chính thức',
    label_en: 'Turn on two-step verification in the official app',
  },
  CHANGE_PASSWORD_IF_ENTERED: {
    code: 'CHANGE_PASSWORD_IF_ENTERED',
    label_vi: 'Nếu đã nhập thông tin: đổi mật khẩu ngay và đăng xuất mọi thiết bị lạ',
    label_en: 'If you already entered details: change your password now and sign out unknown devices',
  },
  CONTACT_BANK_IF_PAID: {
    code: 'CONTACT_BANK_IF_PAID',
    label_vi: 'Nếu đã chuyển tiền: gọi ngân hàng ngay để yêu cầu chặn giao dịch',
    label_en: 'If you already paid: call your bank immediately to try to stop the transfer',
  },
  UNINSTALL_IF_INSTALLED: {
    code: 'UNINSTALL_IF_INSTALLED',
    label_vi: 'Nếu đã cài ứng dụng lạ: gỡ ngay, đổi mật khẩu ngân hàng từ thiết bị khác',
    label_en: 'If you installed an unknown app: remove it now and change bank passwords from another device',
  },
  REVOKE_REMOTE_IF_GRANTED: {
    code: 'REVOKE_REMOTE_IF_GRANTED',
    label_vi: 'Nếu đã cấp quyền điều khiển từ xa: ngắt mạng, gỡ phần mềm, đổi mật khẩu từ thiết bị khác',
    label_en: 'If you granted remote access: disconnect, remove the software, change passwords from another device',
  },
  VERIFY_SENDER_INDEPENDENTLY: {
    code: 'VERIFY_SENDER_INDEPENDENTLY',
    label_vi: 'Tự liên hệ tổ chức qua số điện thoại / website chính thức bạn tra cứu được',
    label_en: 'Contact the organisation yourself through a phone number / website you looked up',
  },
  STAY_ALERT: {
    code: 'STAY_ALERT',
    label_vi: 'Không thấy dấu hiệu lừa đảo rõ ràng — vẫn cẩn thận nếu được yêu cầu cung cấp thông tin',
    label_en: 'No clear scam signals — stay careful if you are asked for information',
  },
  COULD_NOT_CONCLUDE: {
    code: 'COULD_NOT_CONCLUDE',
    label_vi: 'Chưa thể kết luận tin nhắn này an toàn — hãy tự xác minh trước khi làm theo',
    label_en: 'This message cannot be confirmed safe — verify it yourself before acting on it',
  },
}

function officialSite(match: NonNullable<UrlCheckSummary['officialMatch']>): AdviceItem {
  return {
    code: 'USE_OFFICIAL',
    label_vi: `Chỉ truy cập trang chính thức: ${match.website}`,
    label_en: `Only use the official site: ${match.website}`,
  }
}

function officialHotline(match: NonNullable<UrlCheckSummary['officialMatch']>): AdviceItem | null {
  if (!match.hotline) return null
  return {
    code: 'CALL_HOTLINE',
    label_vi: `Gọi hotline chính thức: ${match.hotline}`,
    label_en: `Call the official hotline: ${match.hotline}`,
  }
}

export function buildAdvice(input: {
  level: Level
  signals: MessageSignal[]
  attackGoal: AttackGoal | null
  urlChecks: UrlCheckSummary[]
}): { doNot: AdviceItem[]; doNow: AdviceItem[] } {
  const { level, signals, attackGoal, urlChecks } = input
  const types = new Set<SignalType>(signals.map(s => s.type))
  const has = (...t: SignalType[]) => t.some(x => types.has(x))
  const hasUrl = urlChecks.length > 0
  const officialMatch = urlChecks.find(c => c.officialMatch)?.officialMatch ?? null

  const doNot: AdviceItem[] = []
  const doNow: AdviceItem[] = []
  const pushNot = (item: AdviceItem) => { if (!doNot.some(i => i.code === item.code)) doNot.push(item) }
  const pushNow = (item: AdviceItem) => { if (!doNow.some(i => i.code === item.code)) doNow.push(item) }

  if (level === 'SAFE' || level === 'LOW') {
    pushNow(DO_NOW.STAY_ALERT)
    return { doNot, doNow }
  }
  if (level === 'INCONCLUSIVE') {
    pushNow(DO_NOW.COULD_NOT_CONCLUDE)
    if (hasUrl) pushNot(DO_NOT.NO_CLICK_LINK)
    pushNow(DO_NOW.VERIFY_SENDER_INDEPENDENTLY)
    return { doNot, doNow }
  }

  // MEDIUM / HIGH / CRITICAL — the "do not" list follows what the message asks for, so a phone
  // verification scam leads with OTP and a fee scam leads with money.
  const accountTakeover =
    attackGoal === 'account_takeover' || attackGoal === 'otp_interception' || attackGoal === 'credential_theft' ||
    has('otp_request', 'auth_code_request', 'verify_phone_request', 'verify_account_request', 'account_suspension_threat', 'password_request', 'pin_request', 'credential_entry_request')
  const money =
    attackGoal === 'payment_fraud' || attackGoal === 'investment_scam' ||
    has('transfer_request', 'payment_request', 'reward_bait', 'investment_promise')
  const crypto = has('crypto_request')
  const install = attackGoal === 'malware_installation' || has('app_install_request')
  const remote = attackGoal === 'remote_access_compromise' || has('remote_access_request')
  const identity = attackGoal === 'identity_theft' || has('fake_legal_notice')

  if (accountTakeover) {
    pushNot(DO_NOT.NO_OTP)
    pushNot(DO_NOT.NO_PASSWORD)
    pushNot(DO_NOT.NO_RECOVERY_CODES)
  }
  if (hasUrl || has('link_click_request', 'suspicious_external_domain')) pushNot(DO_NOT.NO_CLICK_LINK)
  if (money) pushNot(DO_NOT.NO_TRANSFER)
  if (crypto) pushNot(DO_NOT.NO_CRYPTO)
  if (install) pushNot(DO_NOT.NO_INSTALL)
  if (remote) pushNot(DO_NOT.NO_REMOTE_ACCESS)
  if (identity || has('verify_account_request')) pushNot(DO_NOT.NO_PERSONAL_INFO)
  if (has('platform_switch_request')) pushNot(DO_NOT.NO_MOVE_PLATFORM)
  if (has('urgency_pressure', 'fear_threat_language')) pushNot(DO_NOT.NO_RUSH)
  if (doNot.length === 0) pushNot(DO_NOT.NO_REPLY)

  if (accountTakeover) pushNow(DO_NOW.VERIFY_IN_OFFICIAL_APP)
  if (officialMatch) {
    pushNow(officialSite(officialMatch))
    const hotline = officialHotline(officialMatch)
    if (hotline) pushNow(hotline)
  }
  if (identity || has('impersonation', 'fake_customer_support', 'fake_security_alert')) pushNow(DO_NOW.VERIFY_SENDER_INDEPENDENTLY)
  if (accountTakeover) {
    pushNow(DO_NOW.CHANGE_PASSWORD_IF_ENTERED)
    pushNow(DO_NOW.ENABLE_2FA)
  }
  if (money || crypto) pushNow(DO_NOW.CONTACT_BANK_IF_PAID)
  if (install) pushNow(DO_NOW.UNINSTALL_IF_INSTALLED)
  if (remote) pushNow(DO_NOW.REVOKE_REMOTE_IF_GRANTED)
  pushNow(DO_NOW.REPORT_SCAM)

  return { doNot, doNow }
}
