import type { CheckResult, RiskLevel } from '../../types'
import type { AiAssessment, UrlCheckSummary } from '../types'
import type { AntiFraudAnalyzer, AnalyzeMessageOutcome, ExtractTextOutcome } from '../ai/analyzer'

// Shared test doubles for the message-analysis suites. Both are DETERMINISTIC by construction: the
// URL checker answers from a table keyed by hostname, the analyzer from a table keyed by a
// substring of the message — so a scenario states exactly what the engine and the model said, and
// the assertion is about what fusion did with it.

/** The engine's real envelope with the fields fusion reads. */
export function urlResult(url: string, level: RiskLevel, score: number, confidence: number, official?: CheckResult['officialMatch']): CheckResult {
  return {
    inputType: 'url',
    url,
    risk: { level, score, confidence },
    evidence: { items: [], summary: { criticalCount: 0, warningCount: 0, safeCount: 0, totalSources: 6, respondedSources: 6 } },
    officialMatch: official ?? null,
    actions: [],
    checkedAt: 0,
    cached: false,
  }
}

/** A checker that answers per hostname, and UNKNOWN/LOW for anything not listed. */
export function tableUrlChecker(table: Record<string, Partial<CheckResult['risk']> & { official?: CheckResult['officialMatch']; throws?: string }>) {
  const calls: string[] = []
  const checker = async (url: string): Promise<CheckResult> => {
    calls.push(url)
    const host = new URL(url).hostname
    const row = table[host]
    if (row?.throws) throw new Error(row.throws)
    // The failure mode this whole layer exists for: a brand-new domain nobody has flagged yet.
    const level = row?.level ?? 'LOW'
    const score = row?.score ?? 12
    const confidence = row?.confidence ?? 90
    return urlResult(url, level, score, confidence, row?.official)
  }
  return Object.assign(checker, { calls })
}

export function assessment(over: Partial<AiAssessment> = {}): AiAssessment {
  return {
    riskLevel: 'safe',
    confidence: 0.8,
    scamType: null,
    attackGoal: null,
    signals: [],
    requestedActions: [],
    detectedEntities: { organizations: [], platforms: [] },
    reasoningSummary: 'Looks like an ordinary message.',
    ...over,
  }
}

export interface FakeAnalyzerOptions {
  available?: boolean
  /** Message substring → assessment. First match wins; no match → `fallback`. */
  answers?: Array<[string, AiAssessment | 'fail']>
  fallback?: AiAssessment | 'fail'
  ocr?: string | 'fail'
}

export function fakeAnalyzer(opts: FakeAnalyzerOptions = {}): AntiFraudAnalyzer & { calls: Array<{ tier: number; message: string; urlChecks: UrlCheckSummary[] }>; ocrCalls: number } {
  const calls: Array<{ tier: number; message: string; urlChecks: UrlCheckSummary[] }> = []
  const self = {
    id: 'fake',
    calls,
    ocrCalls: 0,
    capabilities: { text: true, image: true },
    isAvailable: () => opts.available ?? true,
    describe: (tier: 1 | 2) => ({ provider: 'fake', role: tier === 1 ? 'fast' as const : 'smart' as const }),
    async analyzeMessage(input: { tier: 1 | 2; message: string; urlChecks: UrlCheckSummary[] }): Promise<AnalyzeMessageOutcome> {
      calls.push({ tier: input.tier, message: input.message, urlChecks: input.urlChecks })
      const meta = { provider: 'fake', role: input.tier === 1 ? 'fast' as const : 'smart' as const, usage: { promptTokens: 100, completionTokens: 50 } }
      const hit = (opts.answers ?? []).find(([needle]) => input.message.includes(needle))
      const answer = hit ? hit[1] : (opts.fallback ?? assessment())
      if (answer === 'fail') return { status: 'failed', meta, error: 'unparseable_output' }
      return { status: 'ok', assessment: answer, meta }
    },
    async extractText(): Promise<ExtractTextOutcome> {
      self.ocrCalls++
      const meta = { provider: 'fake', role: 'vision' as const, usage: { promptTokens: 800, completionTokens: 120 } }
      if (opts.ocr === 'fail' || opts.ocr === undefined) return { status: 'failed', meta, error: 'error' }
      return { status: 'ok', text: opts.ocr, meta }
    },
  }
  return self
}

/** The real-world message this feature was built for. */
export const TELEGRAM_SCAM = `Người dùng thân mến：
❗️Hệ thống hiển thị tài khoản của bạn hiện đang ở trạng thái “rủi ro cao”, tài khoản sắp bị khóa. Vui lòng xác thực lại số điện thoại của bạn để gỡ bỏ trạng thái “rủi ro cao”.
Lưu ý: Nếu không hoàn tất xác thực, tài khoản của bạn sẽ bị khóa sau 48 giờ.
https://42777qz.hanveko.cfd
⬇️Nhấn vào đây: Bắt đầu xác thực`
