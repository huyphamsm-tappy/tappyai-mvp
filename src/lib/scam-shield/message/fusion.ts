import type { RequestLocale } from '@/lib/i18n/requestLocale'
import type { RiskLevel } from '../types'
import { levelFor } from '../engine/riskEngine'
import type {
  AiAssessment, AnalysisTier, AttackGoal, MessageSignal, MessageSignalSeverity, ScamType,
  SignalType, UrlCheckSummary,
} from './types'
import type { RuleEvaluation } from './rules'
import { floorScore } from './rules'
import {
  AI_CONFIDENCE_SCALE_MIN, AI_FLOOR_MIN_CONFIDENCE, AI_LEVEL_SCORE, CONFIDENCE_SHARE, CORROBORATION_BONUS,
  LEVEL_FLOOR_SCORE, RULES_SOLO_MAX_SCORE,
} from './config'

// Scam Shield · message analysis — risk fusion.
//
// ============================================================================
// THE ONE RULE THIS FILE EXISTS FOR
// ============================================================================
// A link whose reputation is UNKNOWN sitting inside a message that is plainly a scam must come
// out HIGH or CRITICAL. That is the exact production failure this layer was built for: the URL
// engine (correctly) said "no evidence against this brand-new domain", and the product showed
// green under "verify your phone within 48 hours or lose your account".
//
// So the verdict is assembled from THREE independent sources, and each can only push in the
// direction its evidence supports:
//
//   rules   deterministic, always complete → a SCORE and, for known-dangerous combinations, a
//           FLOOR the verdict cannot drop below (the Telegram shape floors at HIGH with no model);
//   model   contextual meaning → a score scaled by its own confidence, and a floor when it is
//           confident the message is dangerous. A confident "safe" can pull rule NOISE down
//           (a bank promo that says "click here"), but never below a floor and never past
//           evidence-positive link findings;
//   links   the URL engine's verdict per link → evidence-positive levels are floors, exactly as
//           they would be on the URL tab. Nothing here can make a link look better than the URL
//           tab would.
//
// The final level goes through the engine's own `levelFor`, so the "reassurance needs coverage"
// rule applies: with no model consulted and no findings, confidence cannot reach the SAFE
// threshold and the result is INCONCLUSIVE — never a green shield earned by silence.
//
// 🚨 The model never decides the final level. It is one input with a bounded influence.

export interface FusionInput {
  tier: AnalysisTier
  rules: RuleEvaluation
  ai: AiAssessment | null
  urlChecks: UrlCheckSummary[]
  locale: RequestLocale
}

export interface FusedRisk {
  level: RiskLevel
  score: number
  confidence: number
  signals: MessageSignal[]
  scamType: ScamType | null
  attackGoal: AttackGoal | null
  requestedActions: string[]
  reasoningSummary: string
}

const EVIDENCE_POSITIVE: ReadonlySet<RiskLevel> = new Set(['MEDIUM', 'HIGH', 'CRITICAL'])
const LEVEL_RANK: Record<RiskLevel, number> = { INCONCLUSIVE: 0, SAFE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }
const SEVERITY_RANK: Record<MessageSignalSeverity, number> = { low: 0, medium: 1, high: 2 }

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function hostOf(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

function urlSignals(checks: UrlCheckSummary[], locale: RequestLocale): MessageSignal[] {
  const out: MessageSignal[] = []
  for (const c of checks) {
    if (c.status !== 'checked' || !c.level || !EVIDENCE_POSITIVE.has(c.level)) continue
    const host = hostOf(c.url)
    const severity: MessageSignalSeverity = c.level === 'MEDIUM' ? 'medium' : 'high'
    const brand = c.officialMatch?.brand
    out.push({
      type: 'suspicious_external_domain',
      severity,
      source: 'url',
      explanation: locale === 'vi'
        ? `Liên kết ${host} bị đánh giá ${c.level}${brand ? ` — giả mạo tên ${brand} nhưng không phải tên miền chính thức` : ''}.`
        : `The link ${host} was rated ${c.level}${brand ? ` — it borrows the name ${brand} but is not the official domain` : ''}.`,
    })
  }
  return out
}

/** The URL component: worst evidence-positive score/level, and how much of the link evidence base answered. */
function urlComponent(checks: UrlCheckSummary[]) {
  const checked = checks.filter(c => c.status === 'checked')
  let score = 0
  let floor: RiskLevel | null = null
  for (const c of checked) {
    if (!c.level || !EVIDENCE_POSITIVE.has(c.level)) continue
    score = Math.max(score, c.score ?? 0)
    if (!floor || LEVEL_RANK[c.level] > LEVEL_RANK[floor]) floor = c.level
  }
  // No links: the link evidence base is trivially complete. Links but none checkable: it is empty.
  const confidence = checks.length === 0
    ? 100
    : checked.length === 0
      ? 0
      : Math.round(checked.reduce((s, c) => s + (c.confidence ?? 0), 0) / checked.length)
  return { score, floor, confidence, checked }
}

function urlFloorScore(level: RiskLevel | null): number {
  if (level === 'CRITICAL') return LEVEL_FLOOR_SCORE.CRITICAL
  if (level === 'HIGH') return LEVEL_FLOOR_SCORE.HIGH
  if (level === 'MEDIUM') return LEVEL_FLOOR_SCORE.MEDIUM
  return 0
}

function aiComponent(ai: AiAssessment | null) {
  if (!ai) return { score: 0, floor: 0, positive: false }
  const score = Math.round(AI_LEVEL_SCORE[ai.riskLevel] * (AI_CONFIDENCE_SCALE_MIN + (1 - AI_CONFIDENCE_SCALE_MIN) * ai.confidence))
  let floor = 0
  if (ai.riskLevel === 'critical' && ai.confidence >= AI_FLOOR_MIN_CONFIDENCE.critical) floor = LEVEL_FLOOR_SCORE.CRITICAL
  else if (
    (ai.riskLevel === 'critical' || ai.riskLevel === 'high_risk') &&
    ai.confidence >= AI_FLOOR_MIN_CONFIDENCE.high_risk
  ) floor = LEVEL_FLOOR_SCORE.HIGH
  const positive =
    ai.riskLevel === 'critical' || ai.riskLevel === 'high_risk' ||
    (ai.riskLevel === 'suspicious' && ai.confidence >= 0.5)
  return { score, floor, positive }
}

/** Rule and model signals of the same type collapse into one row: the model's wording (it read
 *  the actual message), the higher severity, and the model as source. */
function mergeSignals(rules: MessageSignal[], ai: AiAssessment | null, urls: MessageSignal[]): MessageSignal[] {
  const byType = new Map<SignalType, MessageSignal>()
  for (const s of rules) byType.set(s.type, s)
  if (ai) {
    for (const s of ai.signals) {
      const existing = byType.get(s.type)
      const severity = existing && SEVERITY_RANK[existing.severity] > SEVERITY_RANK[s.severity] ? existing.severity : s.severity
      if (s.type === 'other' && existing) continue
      byType.set(s.type, { type: s.type, severity, explanation: s.explanation, source: 'ai' })
    }
  }
  const merged = [...byType.values(), ...urls]
  return merged.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
}

/** When no model spoke, the rules still name what the message is after. Coarse, deliberately. */
function inferFromRules(rules: RuleEvaluation): { scamType: ScamType | null; attackGoal: AttackGoal | null } {
  const has = (...types: SignalType[]) => rules.signals.some(s => types.includes(s.type))
  const brand = rules.brand ?? ''
  const isTelegram = /telegram/.test(brand)
  const isBank = /(bank|ngan hang|vcb|tcb|bidv|agribank|acb|tpbank|vpbank|sacombank|vietinbank|mbb|ocb|hdbank|shb|msb|银行)/.test(brand)
  const isGov = /(cong an|police|toa an|vien kiem sat|thue|bhxh|chinh phu|公安|警察|法院|检察院|税务|海关)/.test(brand)

  if (has('remote_access_request')) return { scamType: 'remote_access_scam', attackGoal: 'remote_access_compromise' }
  if (has('app_install_request')) return { scamType: 'malware_distribution', attackGoal: 'malware_installation' }
  if (has('fake_legal_notice') || isGov) return { scamType: 'government_impersonation', attackGoal: has('transfer_request', 'crypto_request', 'payment_request') ? 'payment_fraud' : 'identity_theft' }
  if (has('investment_promise')) return { scamType: 'investment_scam', attackGoal: 'investment_scam' }
  if (has('otp_request', 'verify_phone_request') && has('account_suspension_threat', 'fake_security_alert', 'verify_account_request')) {
    return { scamType: isTelegram ? 'telegram_account_phishing' : isBank ? 'bank_phishing' : 'otp_phishing', attackGoal: 'account_takeover' }
  }
  if (has('otp_request')) return { scamType: 'otp_phishing', attackGoal: 'otp_interception' }
  if (has('credential_entry_request', 'password_request', 'pin_request')) return { scamType: isBank ? 'bank_phishing' : 'other', attackGoal: 'credential_theft' }
  if (has('reward_bait')) return { scamType: 'prize_scam', attackGoal: 'payment_fraud' }
  if (has('transfer_request', 'crypto_request')) return { scamType: 'other', attackGoal: 'payment_fraud' }
  if (has('account_suspension_threat', 'verify_account_request', 'fake_security_alert')) {
    return { scamType: isTelegram ? 'telegram_account_phishing' : isBank ? 'bank_phishing' : 'other', attackGoal: 'account_takeover' }
  }
  if (has('prompt_injection_attempt')) return { scamType: 'other', attackGoal: 'social_engineering' }
  if (rules.floor) return { scamType: 'other', attackGoal: 'social_engineering' }
  return { scamType: null, attackGoal: null }
}

function fallbackSummary(locale: RequestLocale, level: RiskLevel, signalCount: number, aiConsulted: boolean): string {
  if (locale === 'vi') {
    const base = aiConsulted
      ? 'Mô hình AI không trả về kết quả dùng được, nên kết luận dựa trên kiểm tra liên kết và các quy tắc nhận diện.'
      : 'Lượt này chỉ dùng kiểm tra liên kết và các quy tắc nhận diện, chưa dùng phân tích AI.'
    if (level === 'INCONCLUSIVE') return `${base} Chưa đủ bằng chứng để kết luận tin nhắn này an toàn.`
    return signalCount > 0 ? `${base} Đã phát hiện ${signalCount} dấu hiệu đáng ngờ.` : base
  }
  const base = aiConsulted
    ? 'The AI model did not return a usable assessment, so this verdict rests on the link checks and the detection rules.'
    : 'This check used only the link checks and the detection rules, without AI analysis.'
  if (level === 'INCONCLUSIVE') return `${base} There is not enough evidence to call this message safe.`
  return signalCount > 0 ? `${base} ${signalCount} suspicious signal${signalCount === 1 ? '' : 's'} detected.` : base
}

export function fuseRisk(input: FusionInput, aiConsulted = input.ai !== null): FusedRisk {
  const { rules, ai, urlChecks, locale } = input
  const url = urlComponent(urlChecks)
  const signalsFromUrls = urlSignals(urlChecks, locale)

  // LEVEL 0 — a bare link. The URL engine's verdict IS the verdict; this layer only re-shapes it.
  if (input.tier === 0) {
    const worst = url.checked.reduce<UrlCheckSummary | null>((acc, c) =>
      !acc || LEVEL_RANK[c.level!] > LEVEL_RANK[acc.level!] || (c.level === acc.level && (c.score ?? 0) > (acc.score ?? 0)) ? c : acc, null)
    const level: RiskLevel = worst?.level ?? 'INCONCLUSIVE'
    return {
      level,
      score: worst?.score ?? 0,
      confidence: worst?.confidence ?? 0,
      signals: signalsFromUrls,
      scamType: null,
      attackGoal: null,
      requestedActions: [],
      reasoningSummary: locale === 'vi'
        ? (worst
          ? 'Tin nhắn chỉ chứa một liên kết, nên kết quả là kết quả kiểm tra liên kết đó.'
          : 'Không có nội dung để phân tích và liên kết không kiểm tra được.')
        : (worst
          ? 'The message is only a link, so this is the verdict of the link check.'
          : 'There was nothing to analyse and the link could not be checked.'),
    }
  }

  const aiPart = aiComponent(ai)
  const ruleFloor = floorScore(rules.floor)
  const ruleScore = Math.min(rules.score, RULES_SOLO_MAX_SCORE)
  const rulesPositive = ruleScore >= LEVEL_FLOOR_SCORE.MEDIUM || rules.floor !== null
  const urlPositive = url.floor !== null

  let score = Math.max(ruleScore, aiPart.score, url.score)

  // A confident "safe" from the model may discount rule NOISE — a legitimate promo that says
  // "click here", a real login code that mentions "code" — but only where nothing else objects.
  // Discounted rule signals are dropped from the report too: a SAFE verdict that still lists
  // "impersonation" underneath would be the engine arguing with itself.
  let rulesDiscounted = false
  if (ai && ai.riskLevel === 'safe' && ai.confidence >= 0.7 && rules.floor === null && !urlPositive) {
    score = Math.max(aiPart.score, Math.round(ruleScore * (1 - 0.8 * ai.confidence)))
    rulesDiscounted = true
  }

  // Two independent sources agreeing the message is dangerous is stronger than either alone.
  const positives = [rulesPositive, aiPart.positive, urlPositive].filter(Boolean).length
  if (positives >= 2) score += CORROBORATION_BONUS

  score = clamp(Math.round(Math.max(score, ruleFloor, aiPart.floor, urlFloorScore(url.floor))), 0, 100)

  const confidence = clamp(Math.round(
    (ai ? CONFIDENCE_SHARE.ai * ai.confidence : 0) +
    CONFIDENCE_SHARE.rules +
    CONFIDENCE_SHARE.urls * (url.confidence / 100),
  ), 0, 100)

  const level = levelFor(score, confidence)
  const reassuring = level === 'SAFE' || level === 'LOW'
  const signals = mergeSignals(rulesDiscounted && reassuring ? [] : rules.signals, ai, signalsFromUrls)
  const inferred = ai ? { scamType: ai.scamType, attackGoal: ai.attackGoal } : inferFromRules(rules)
  // A model that found nothing wrong still leaves the rules' classification standing when the
  // rules floored the verdict — the floor is the product's decision, and it needs a name.
  const classification = ai && !ai.scamType && !ai.attackGoal && rules.floor ? inferFromRules(rules) : inferred

  return {
    level,
    score,
    confidence,
    signals,
    scamType: reassuring ? null : classification.scamType,
    attackGoal: reassuring ? null : classification.attackGoal,
    requestedActions: ai?.requestedActions ?? [],
    reasoningSummary: ai?.reasoningSummary || fallbackSummary(locale, level, signals.length, aiConsulted),
  }
}
