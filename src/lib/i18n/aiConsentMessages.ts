// The message returned with `ai_consent_required` (HTTP 403). Kept in src/lib/i18n: the web UI string gate scans src/app.

export function aiConsentRequiredMessage(locale: string): string {
  return /^en/i.test(locale)
    ? 'Agree to share data with AI in the TappyAI iPhone app to use this feature.'
    : 'Cần đồng ý chia sẻ dữ liệu với AI trong ứng dụng TappyAI trên iPhone để dùng tính năng này.'
}
