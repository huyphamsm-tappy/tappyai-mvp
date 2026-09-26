// Scam Shield · message analysis — shared types.
//
// The URL/QR checker (`../types.ts`) answers "is this LINK dangerous?" from object-level evidence.
// This layer answers "what is this MESSAGE trying to make me do?" — and then fuses both answers,
// because a link can be reputationally unknown while the words around it are plainly a scam.
//
// 🔑 The final verdict reuses the engine's own `RiskLevel` scale, INCONCLUSIVE included, so every
// client renders one vocabulary for both features and `levelFor`'s rule — "a reassuring verdict
// needs evidence to reassure with" — applies here unchanged.

import type { RiskLevel } from '../types'
import type { RequestLocale } from '@/lib/i18n/requestLocale'

export type MessageInputType = 'message' | 'screenshot'

/** The model's OWN four-point scale. It is an INPUT to fusion, never the answer. */
export type AiRiskLevel = 'safe' | 'suspicious' | 'high_risk' | 'critical'

export type MessageSignalSeverity = 'low' | 'medium' | 'high'

/** Where a signal came from. Rendered, so the user can tell a rule from a model opinion. */
export type MessageSignalSource = 'rule' | 'ai' | 'url'

/**
 * The closed vocabulary of social-engineering signals. Closed on purpose: the model is asked to
 * pick from this list, anything else is coerced to `other`, and the deterministic rules emit the
 * same names — so fusion and advice can reason about a signal without parsing prose.
 */
export const SIGNAL_TYPES = [
  'impersonation',
  'account_suspension_threat',
  'verify_account_request',
  'verify_phone_request',
  'otp_request',
  'password_request',
  'pin_request',
  'payment_request',
  'transfer_request',
  'crypto_request',
  'remote_access_request',
  'app_install_request',
  'urgency_pressure',
  'fear_threat_language',
  'reward_bait',
  'investment_promise',
  'fake_customer_support',
  'fake_security_alert',
  'fake_legal_notice',
  'platform_switch_request',
  'suspicious_external_domain',
  'link_click_request',
  'credential_entry_request',
  'auth_code_request',
  'prompt_injection_attempt',
  'other',
] as const
export type SignalType = (typeof SIGNAL_TYPES)[number]

export const ATTACK_GOALS = [
  'account_takeover',
  'credential_theft',
  'otp_interception',
  'payment_fraud',
  'identity_theft',
  'malware_installation',
  'remote_access_compromise',
  'phishing',
  'social_engineering',
  'investment_scam',
  'romance_scam',
  'impersonation',
  'other',
] as const
export type AttackGoal = (typeof ATTACK_GOALS)[number]

export const SCAM_TYPES = [
  'telegram_account_phishing',
  'bank_phishing',
  'government_impersonation',
  'delivery_scam',
  'ecommerce_refund_scam',
  'prize_scam',
  'investment_scam',
  'otp_phishing',
  'remote_access_scam',
  'malware_distribution',
  'romance_scam',
  'job_scam',
  'tech_support_scam',
  'customer_support_impersonation',
  'loan_scam',
  'charity_scam',
  'other',
] as const
export type ScamType = (typeof SCAM_TYPES)[number]

export interface MessageSignal {
  type: SignalType
  severity: MessageSignalSeverity
  /** Plain-language, user-facing, in the request locale. Never chain-of-thought. */
  explanation: string
  source: MessageSignalSource
}

export interface DetectedEntities {
  urls: string[]
  phoneNumbers: string[]
  emails: string[]
  organizations: string[]
  platforms: string[]
}

/** One extracted URL, as the deterministic engine saw it. */
export interface UrlCheckSummary {
  url: string
  status: 'checked' | 'failed' | 'skipped'
  level?: RiskLevel
  score?: number
  confidence?: number
  /** The official brand the engine matched the host to (a look-alike, NOT the real domain), if any. */
  officialMatch?: { brand: string; website: string; hotline?: string } | null
  reason?: string
}

/** Same bilingual shape as `RecommendedAction`, so clients render advice the way they render actions. */
export interface AdviceItem {
  code: string
  label_vi: string
  label_en: string
}

/**
 * What the model returned, AFTER schema validation and sanitisation. Nothing in here has been
 * trusted: enums are coerced to the closed sets above, strings are capped and stripped of fence
 * markers, arrays are bounded.
 */
export interface AiAssessment {
  riskLevel: AiRiskLevel
  /** 0–1. */
  confidence: number
  scamType: ScamType | null
  attackGoal: AttackGoal | null
  signals: Array<{ type: SignalType; severity: MessageSignalSeverity; explanation: string }>
  requestedActions: string[]
  detectedEntities: { organizations: string[]; platforms: string[] }
  reasoningSummary: string
}

export type AiStatus =
  | 'used'
  /** Deterministic evidence answered the question; no model was consulted (LEVEL 0). */
  | 'not_needed'
  | 'quota_exhausted'
  /** No provider configured for this deployment. */
  | 'unavailable'
  /** The provider was called and did not return a usable assessment. */
  | 'failed'

/** LEVEL 0 = deterministic only; 1 = economical model; 2 = stronger model; 3 = reserved. */
export type AnalysisTier = 0 | 1 | 2 | 3

export interface AnalysisMeta {
  tier: AnalysisTier
  aiStatus: AiStatus
  /** Telemetry only — which adapter answered. Never branch on it. */
  provider: string | null
  /** The semantic role the tier resolved to (`fast` / `smart`), for cost accounting. */
  modelRole: string | null
  /** Token usage when the provider reports it. Feeds future budget controls. */
  usage?: { promptTokens: number; completionTokens: number }
}

export interface MessageAnalysisResult {
  inputType: MessageInputType
  risk: {
    level: RiskLevel
    score: number
    confidence: number
  }
  scamType: ScamType | null
  attackGoal: AttackGoal | null
  signals: MessageSignal[]
  requestedActions: string[]
  detectedEntities: DetectedEntities
  urlChecks: UrlCheckSummary[]
  advice: {
    doNot: AdviceItem[]
    doNow: AdviceItem[]
  }
  reasoningSummary: string
  analysis: AnalysisMeta
  /** Screenshot input only: what was read off the image, so the user can see what was analysed. */
  extractedText?: string
  analyzedAt: number
}

export interface MessageAnalysisInput {
  text?: string
  /** An explicit link the user attached alongside (or instead of) the message. */
  url?: string
  image?: { bytes: Uint8Array; mimeType: string }
  locale: RequestLocale
  /**
   * Whether a model may be consulted for THIS request.
   *
   * A boolean for callers that already know; a FUNCTION for the route, which wants the quota
   * spent only if a model is actually about to be called. The pipeline invokes it lazily — after
   * routing has decided the message needs a model, never for a LEVEL 0 bare link — and at most
   * once per request. The caller resolves entitlement; this module never reads a quota itself,
   * so the two cannot disagree.
   */
  aiGate: boolean | (() => Promise<AiGateDecision>)
}

export type AiGateDecision =
  | { allowed: true }
  | { allowed: false; reason: Extract<AiStatus, 'quota_exhausted' | 'unavailable'> }
