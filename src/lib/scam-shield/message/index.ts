import type { AiAssessment, AiGateDecision, AnalysisMeta, AnalysisTier, MessageAnalysisInput, MessageAnalysisResult, MessageInputType } from './types'
import { normalizeMessage } from './normalize'
import { extractEntities, letterCount } from './extract'
import { checkExtractedUrls, type UrlChecker } from './urlChecks'
import { evaluateRules } from './rules'
import { planAnalysis } from './router'
import { fuseRisk } from './fusion'
import { buildAdvice } from './advice'
import { getAntiFraudAnalyzer, type AntiFraudAnalyzer } from './ai/analyzer'
import { MAX_ENTITIES_PER_KIND, OCR_MAX_CHARS } from './config'

// Scam Shield · message analysis — the pipeline.
//
//   input ─▶ normalise ─▶ extract entities ─▶ URL checks (existing engine)
//         ─▶ rules ─▶ route (tier) ─▶ [model] ─▶ fuse ─▶ advise ─▶ result
//
// Each stage is its own module with its own tests; this file only orders them and decides, from
// the routing decision and the caller's `aiGate`, whether a model is consulted at all.
//
// 🚨 QUOTA IS NOT DECIDED HERE. The route resolves entitlement and passes `aiGate`; if a second
// entry point ever appears it must do the same. Keeping the decision out of this module is what
// stops the library from ever spending a paid call on behalf of a caller that never metered. The
// gate is asked ONCE, and only at the moment a model is about to be called.
//
// 🚨 NOTHING HERE LOGS THE MESSAGE. The route logs shape (tier, level, timings); the message
// itself — which may contain the user's own OTP or the scammer's account number — is never
// written anywhere.

export interface AnalyzeOptions {
  /** Test seams. Production uses the real engine and the configured analyzer. */
  urlChecker?: UrlChecker
  analyzer?: AntiFraudAnalyzer
  abortSignal?: AbortSignal
}

export async function analyzeMessage(
  input: MessageAnalysisInput,
  options: AnalyzeOptions = {},
): Promise<MessageAnalysisResult> {
  const analyzer = options.analyzer ?? getAntiFraudAnalyzer()
  const inputType: MessageInputType = input.image ? 'screenshot' : 'message'

  // The gate is resolved lazily and memoised: OCR and analysis share one decision, and a bare
  // link never asks. A gate that throws counts as closed — a metering outage must not become free
  // model calls.
  let gateDecision: AiGateDecision | null = null
  const gate = async (): Promise<AiGateDecision> => {
    if (gateDecision) return gateDecision
    if (typeof input.aiGate === 'boolean') {
      gateDecision = input.aiGate ? { allowed: true } : { allowed: false, reason: 'quota_exhausted' }
    } else {
      try {
        gateDecision = await input.aiGate()
      } catch {
        gateDecision = { allowed: false, reason: 'unavailable' }
      }
    }
    return gateDecision
  }

  // ── Screenshot → text. OCR is itself a model call, so it passes the same gate as the analysis;
  // with the quota spent, a screenshot cannot be read and the caller is told so.
  let extractedText: string | undefined
  let ocrFailed = false
  let ocrUsage: AnalysisMeta['usage'] | undefined
  if (input.image) {
    if (analyzer.isAvailable() && analyzer.capabilities.image && (await gate()).allowed) {
      const ocr = await analyzer.extractText({ image: input.image.bytes, mimeType: input.image.mimeType })
      if (ocr.status === 'ok') {
        extractedText = ocr.text.slice(0, OCR_MAX_CHARS)
        ocrUsage = ocr.meta.usage
      } else {
        ocrFailed = true
      }
    } else {
      ocrFailed = true
    }
  }

  // ── Normalise. The explicit URL rides along as text so extraction treats it like any other link.
  const combined = [input.text ?? '', extractedText ?? '', input.url ?? ''].filter(Boolean).join('\n')
  const normalized = normalizeMessage(combined)
  const entities = extractEntities(normalized.text)
  const hasUrl = entities.urls.length > 0

  // ── Deterministic first: links through the existing engine, rules over the prose.
  const [urlChecks, rules] = await Promise.all([
    checkExtractedUrls(entities.urls, options.urlChecker),
    Promise.resolve(evaluateRules(normalized.text, input.locale, hasUrl)),
  ])

  // ── Route. A screenshot that could not be read has no prose to send anywhere.
  const plan = ocrFailed && !input.text
    ? { tier: 0 as AnalysisTier, reason: 'no_content' as const }
    : planAnalysis({
      inputType,
      proseLetters: letterCount(entities.prose),
      hasUrl,
      textLength: normalized.text.length,
      rules,
    })

  // ── Model, if the plan wants one and the caller allows one.
  let ai: AiAssessment | null = null
  let aiStatus: AnalysisMeta['aiStatus']
  let provider: string | null = null
  let modelRole: string | null = null
  let usage = ocrUsage
  let tier = plan.tier

  const decision = tier === 0 ? null : analyzer.isAvailable() ? await gate() : null
  if (tier === 0) {
    aiStatus = 'not_needed'
  } else if (!analyzer.isAvailable()) {
    aiStatus = 'unavailable'
  } else if (!decision!.allowed) {
    aiStatus = decision!.reason
  } else {
    const callTier = tier === 3 ? 2 : tier   // tier 3 is reserved; nothing resolves to it yet
    const described = analyzer.describe(callTier)
    provider = described.provider
    modelRole = described.role
    const outcome = await analyzer.analyzeMessage({
      message: normalized.text,
      locale: input.locale,
      tier: callTier,
      urlChecks,
      fromScreenshot: inputType === 'screenshot',
      abortSignal: options.abortSignal,
    })
    if (outcome.meta.usage) {
      usage = usage
        ? { promptTokens: usage.promptTokens + outcome.meta.usage.promptTokens, completionTokens: usage.completionTokens + outcome.meta.usage.completionTokens }
        : outcome.meta.usage
    }
    if (outcome.status === 'ok') {
      ai = outcome.assessment
      aiStatus = 'used'
    } else {
      aiStatus = 'failed'
    }
    tier = callTier
  }

  // ── Fuse and advise.
  const fused = fuseRisk({ tier, rules, ai, urlChecks, locale: input.locale }, aiStatus === 'used' || aiStatus === 'failed')
  const advice = buildAdvice({ level: fused.level, signals: fused.signals, attackGoal: fused.attackGoal, urlChecks })

  const result: MessageAnalysisResult = {
    inputType,
    risk: { level: fused.level, score: fused.score, confidence: fused.confidence },
    scamType: fused.scamType,
    attackGoal: fused.attackGoal,
    signals: fused.signals,
    requestedActions: fused.requestedActions,
    detectedEntities: {
      urls: entities.urls.slice(0, MAX_ENTITIES_PER_KIND),
      phoneNumbers: entities.phoneNumbers.slice(0, MAX_ENTITIES_PER_KIND),
      emails: entities.emails.slice(0, MAX_ENTITIES_PER_KIND),
      organizations: ai?.detectedEntities.organizations ?? [],
      platforms: ai?.detectedEntities.platforms ?? [],
    },
    urlChecks,
    advice,
    reasoningSummary: fused.reasoningSummary,
    analysis: { tier, aiStatus, provider, modelRole, ...(usage ? { usage } : {}) },
    analyzedAt: Date.now(),
  }
  if (extractedText !== undefined) result.extractedText = extractedText
  return result
}

export type { MessageAnalysisInput, MessageAnalysisResult } from './types'
export { planAnalysis } from './router'
