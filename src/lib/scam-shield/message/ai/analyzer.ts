import { AI, type ModelRole } from '@/lib/ai/llm'
import type { RequestLocale } from '@/lib/i18n/requestLocale'
import type { AiAssessment, AnalysisTier, UrlCheckSummary } from '../types'
import { OCR_MAX_CHARS } from '../config'
import { SYSTEM_SHARED, OCR_PROMPT, buildUserPrompt } from './prompt'
import { parseAiAssessment, sanitizeText } from './schema'

// Scam Shield · message analysis — the anti-fraud model interface.
//
// Business logic (`../index.ts`, fusion, advice) talks to THIS interface and nothing else. The
// only implementation today rides the app's existing provider-neutral AI layer (`@/lib/ai/llm`):
// the vendor is whatever `LLM_PROVIDER` says, the model is whatever the role resolves to, and
// neither name appears here. Swapping the model behind a tier is an env var; swapping the vendor
// is an adapter in `lib/ai/llm/providers` — Scam Shield does not change for either.
//
// COST ROUTING. A tier is a semantic ROLE, not a model:
//   tier 1 → `fast`   the economical model, for ordinary messages
//   tier 2 → `smart`  the stronger model, for ambiguous or high-stakes messages
//   tier 3 → reserved for multi-model verification. NOT implemented in V1 — `verify()` is
//            absent from the interface on purpose, so nobody can call it before it has a budget.
// Today both roles may resolve to the same model (see providers/claude.ts); the routing is still
// real, because the day the fleet has two tiers the split takes effect with no code change here.

export interface AiCallMeta {
  provider: string
  role: ModelRole
  usage?: { promptTokens: number; completionTokens: number }
}

export type AnalyzeMessageOutcome =
  | { status: 'ok'; assessment: AiAssessment; meta: AiCallMeta }
  | { status: 'failed'; meta: AiCallMeta; error: string }

export type ExtractTextOutcome =
  | { status: 'ok'; text: string; meta: AiCallMeta }
  | { status: 'failed'; meta: AiCallMeta; error: string }

export interface AntiFraudAnalyzer {
  readonly id: string
  /** Credentials present for the active provider. */
  isAvailable(): boolean
  /** What this analyzer can do. Screenshot input needs `image`. */
  readonly capabilities: { readonly text: boolean; readonly image: boolean }
  /** Which role a tier resolves to — for cost accounting and telemetry, never for branching. */
  describe(tier: Exclude<AnalysisTier, 0 | 3>): { provider: string; role: ModelRole }
  analyzeMessage(input: {
    message: string
    locale: RequestLocale
    tier: Exclude<AnalysisTier, 0 | 3>
    urlChecks: UrlCheckSummary[]
    fromScreenshot: boolean
    abortSignal?: AbortSignal
  }): Promise<AnalyzeMessageOutcome>
  /** OCR. Transcription only; the text comes back to be analysed like a paste. */
  extractText(input: { image: Uint8Array; mimeType: string }): Promise<ExtractTextOutcome>
}

const TIER_ROLE: Record<1 | 2, ModelRole> = { 1: 'fast', 2: 'smart' }

/** Generous but bounded: a 12-signal JSON answer with summaries is ~600 tokens. */
const ANALYSIS_MAX_TOKENS = 1_200
const OCR_MAX_TOKENS = 2_048

function usageOf(result: { usage?: { promptTokens?: number; completionTokens?: number } }) {
  const u = result.usage
  if (!u) return undefined
  return { promptTokens: u.promptTokens ?? 0, completionTokens: u.completionTokens ?? 0 }
}

export function createLlmAnalyzer(): AntiFraudAnalyzer {
  const providerId = () => {
    try { return AI.providerId() } catch { return 'unconfigured' }
  }
  return {
    id: 'llm',
    capabilities: { text: true, image: true },
    isAvailable: () => {
      try { return AI.isConfigured() } catch { return false }
    },
    describe: tier => ({ provider: providerId(), role: TIER_ROLE[tier] }),

    async analyzeMessage(input) {
      const role = TIER_ROLE[input.tier]
      const meta: AiCallMeta = { provider: providerId(), role }
      try {
        const result = await AI.generate({
          role,
          systemShared: SYSTEM_SHARED,
          prompt: buildUserPrompt({
            message: input.message,
            locale: input.locale,
            urlChecks: input.urlChecks,
            fromScreenshot: input.fromScreenshot,
          }),
          maxTokens: ANALYSIS_MAX_TOKENS,
          // Classification, not creativity. Low temperature keeps the same message landing on
          // the same level across runs, which the fused verdict depends on.
          temperature: 0.1,
        })
        meta.usage = usageOf(result)
        const assessment = parseAiAssessment(result.text)
        if (!assessment) return { status: 'failed', meta, error: 'unparseable_output' }
        return { status: 'ok', assessment, meta }
      } catch (err) {
        return { status: 'failed', meta, error: err instanceof Error ? err.name : 'error' }
      }
    },

    async extractText(input) {
      const meta: AiCallMeta = { provider: providerId(), role: 'vision' }
      try {
        const result = await AI.vision({
          image: input.image,
          mimeType: input.mimeType,
          prompt: OCR_PROMPT,
          maxTokens: OCR_MAX_TOKENS,
        })
        meta.usage = usageOf(result)
        const raw = typeof result.text === 'string' ? result.text.trim() : ''
        // Cap BEFORE sanitising so a screenshot of a novel cannot become a novel-sized prompt;
        // the sanitiser keeps line breaks out, so they are restored from the raw slice.
        const text = /^none$/i.test(raw) ? '' : sanitizeMultiline(raw.slice(0, OCR_MAX_CHARS))
        return { status: 'ok', text, meta }
      } catch (err) {
        return { status: 'failed', meta, error: err instanceof Error ? err.name : 'error' }
      }
    },
  }
}

/** `sanitizeText` per line, so OCR keeps its line structure but nothing else. */
function sanitizeMultiline(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map(line => sanitizeText(line, OCR_MAX_CHARS))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

let analyzer: AntiFraudAnalyzer | null = null

/** The analyzer the module uses. Tests substitute one through `setAntiFraudAnalyzer`. */
export function getAntiFraudAnalyzer(): AntiFraudAnalyzer {
  if (!analyzer) analyzer = createLlmAnalyzer()
  return analyzer
}

/** Test seam. Pass `null` to restore the default. */
export function setAntiFraudAnalyzer(next: AntiFraudAnalyzer | null): void {
  analyzer = next
}
