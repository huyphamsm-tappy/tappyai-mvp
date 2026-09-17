/**
 * PHASE 1 AUDIT — deterministic pre-model routing probe for the 15 primary queries.
 *
 * Read-only. Reproduces the PURE, model-free classification that
 * `src/app/api/chat/route.ts` performs before `AI.stream()`:
 *   classifyIntent · detectLang · detectForcedTool · detectLocationIntent ·
 *   detectPlanningIntent · detectTravelIntent · isSimpleQuery → model role ·
 *   extractBudget · resolveDecisionStage · classifyTurnIntent · deriveNeedProfile ·
 *   pick signals · maxSteps / maxTokens as the route computes them.
 *
 * No LLM, no search, no network. Not counted against the 36-run cap.
 * For context-dependent queries (#1, #5, #7) the setup USER turn is included as
 * prior history together with a PLACEHOLDER assistant turn whose only role is to
 * make `hasPriorAssistantTurn` true — no assistant content, tool result or
 * candidate is fabricated; the stage/need classifiers read user turns only.
 *
 * Records only; never fails. Output: docs/audit/route-signals.json
 */
import { describe, it } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  classifyIntent, detectLang, detectExplicitLangRequest, detectForcedTool, detectTravelIntent,
  detectLocationIntent, detectPlanningIntent, detectMovieRecommendationIntent, isSimpleQuery,
} from '@/lib/ai/intent'
import { extractBudget } from '@/lib/ai/budget'
import { deriveNeedProfile } from '@/lib/ai/consultative/needProfile'
import { resolveDecisionStage, taskSwitched } from '@/lib/ai/consultative/refinement'
import { classifyTurnIntent } from '@/lib/ai/consultative/intentGate'
import { isExplicitChoiceRequest, hasImplicitPurchaseIntent } from '@/lib/ai/consultative/pick'
import { shouldExtractMemory } from '@/lib/ai/memoryGate'

const D1 = { lat: 10.7769, lng: 106.7009 } // District 1, HCMC — spec §16 fixed mock location

type Q = { id: number; kind: string; text: string; setupUser?: string; mockLocation?: boolean }
const QUERIES: Q[] = [
  { id: 1, kind: 'Contextual factual', text: 'Quán này mở cửa mấy giờ?', setupUser: 'Tìm cho tôi một quán Nhật yên tĩnh ở Quận 1.' },
  { id: 2, kind: 'Recommendation', text: 'Tìm cho tôi một quán Nhật ngon và yên tĩnh.' },
  { id: 3, kind: 'Constraint-based recommendation', text: 'Tìm quán ăn tối dưới 500k cho 2 người, yên tĩnh.' },
  { id: 4, kind: 'Open recommendation', text: 'Cuối tuần đi đâu được?' },
  { id: 5, kind: 'Contextual comparison', text: 'So sánh 3 quán này.', setupUser: 'Cho tôi 3 quán cafe đẹp ở Thảo Điền.' },
  { id: 6, kind: 'Multi-result recommendation', text: 'Cho tôi 5 quán cafe đẹp ở Thảo Điền.' },
  { id: 7, kind: 'Contextual refinement', text: 'Có chỗ nào rẻ hơn không?', setupUser: 'Tìm nhà hàng tầm 300-500k/người ở Quận 1.' },
  { id: 8, kind: 'Nearby recommendation', text: 'Tôi đang ở đây, tìm chỗ ăn gần tôi.', mockLocation: true },
  { id: 9, kind: 'Named-location recommendation', text: 'Tìm giúp tôi một quán cafe gần Landmark 81.' },
  { id: 10, kind: 'English nearby recommendation', text: 'Find me a quiet Japanese restaurant nearby.', mockLocation: true },
  { id: 11, kind: 'Mixed-language nearby recommendation', text: 'Find giúp tôi một quán cafe chill gần đây.', mockLocation: true },
  { id: 12, kind: 'Shopping recommendation', text: 'Tìm cho tôi một chiếc tai nghe tốt dưới 2 triệu.' },
  { id: 13, kind: 'Travel recommendation', text: 'Cuối tuần này tôi muốn đi Đà Lạt, gợi ý giúp tôi.' },
  { id: 14, kind: 'Time-sensitive entertainment', text: 'Tối nay ở TP.HCM có gì vui?' },
  { id: 15, kind: 'Spa recommendation', text: 'Tìm cho tôi một spa thư giãn, sạch sẽ, giá hợp lý.' },
]

function signalsFor(q: Q) {
  // Mirrors route.ts ordering. A placeholder assistant turn stands in for the
  // real setup reply ONLY so `hasPriorAssistantTurn` is true; its text is not read
  // by any classifier used here except `assistantAskedClarification`, which we
  // therefore report as NO DATA for setup queries.
  const messages: Array<{ role: string; content: string }> = q.setupUser
    ? [{ role: 'user', content: q.setupUser }, { role: 'assistant', content: '[NO DATA — placeholder, not a real reply]' }, { role: 'user', content: q.text }]
    : [{ role: 'user', content: q.text }]
  const lastText = q.text
  const intent = classifyIntent(lastText)
  const budget = extractBudget(lastText)
  const locationIntent = detectLocationIntent(lastText)
  const planningIntent = detectPlanningIntent(lastText)
  const movieRecommend = detectMovieRecommendationIntent(lastText)
  const explicitLang = detectExplicitLangRequest(lastText)
  const lang = explicitLang ?? detectLang(lastText)
  const forcedTool = detectForcedTool(lastText)
  const travelIntent = detectTravelIntent(lastText)
  const worthExtract = shouldExtractMemory({ text: lastText, intent, forcedTool })
  const userMessages = messages.filter(m => m.role === 'user')
  const isFirstReply = userMessages.length <= 1
  const hasPriorAssistantTurn = messages.some(m => m.role === 'assistant')
  const decisionStage = resolveDecisionStage(messages)
  const turnIntent = classifyTurnIntent({
    stage: decisionStage, hasPriorAssistantTurn, taskSwitched: taskSwitched(messages),
    assistantAskedClarification: false,
  })
  const needProfile = deriveNeedProfile(messages, { storedPreferences: null, gps: q.mockLocation ? D1 : null })
  const pickSignals = { explicitChoiceRequest: isExplicitChoiceRequest(lastText), implicitPurchaseIntent: hasImplicitPurchaseIntent(lastText) }
  const hasImage = false
  const role = (planningIntent || hasImage) ? 'planning' : isSimpleQuery(lastText, isFirstReply) ? 'fast' : 'smart'
  const noToolTurn = intent === 'chitchat' || decisionStage === 'confirmation'
  const maxTokens = noToolTurn ? 300 : planningIntent ? 4096 : hasImage ? 1024 : 3072
  const maxSteps = noToolTurn ? 1 : planningIntent ? 8 : hasImage ? 3 : 5
  const isDecisionDomain = needProfile.domain === 'places' || needProfile.domain === 'hotel' || needProfile.domain === 'shopping'
  const toolsOffered = noToolTurn ? [] : [
    ...(movieRecommend ? [] : ['search_places']),
    'get_news',
    ...(locationIntent !== 'offline' ? ['search_products'] : []),
    'web_search', 'get_weather', 'get_gold_price', 'get_flight_prices', 'get_hotel_prices', 'get_transport_options',
    // save_price_watch only when authenticated — NO DATA here (depends on caller)
  ]
  return {
    id: q.id, kind: q.kind, text: lastText, setupUser: q.setupUser ?? null, mockLocation: q.mockLocation ? D1 : null,
    intent, lang, explicitLang, forcedTool, locationIntent, planningIntent, movieRecommend, travelIntent,
    budget, isFirstReply, hasPriorAssistantTurn, decisionStage, turnIntent, worthExtract,
    needProfile: {
      domain: needProfile.domain, subject: needProfile.subject, budgetStated: needProfile.budgetStated,
      location: needProfile.location, priorities: needProfile.priorities, mustHave: needProfile.mustHave,
      useCases: needProfile.useCases,
    },
    pickSignals, role, modelId_default: 'claude-haiku-4-5-20251001 (all roles; env override NO DATA)',
    noToolTurn, maxTokens, maxSteps, toolChoice: 'auto (SDK default; route passes none)',
    temperature: 'unset (route passes none)', isDecisionDomain,
    dynamicBlocks: {
      rankingInstruction: isDecisionDomain, renderedDecision: isDecisionDomain ? 'only if x-tappy-surface: web' : false,
      shoppingGrounding: needProfile.domain === 'shopping', synthesisInstruction: needProfile.domain === 'shopping',
      stageBlock: decisionStage, wordLimit: isFirstReply ? '150 words (first reply)' : '250 words',
      budgetBlock: !!budget, locationBlock: locationIntent === 'offline', gpsBlock: !!q.mockLocation,
    },
    toolsOffered,
    assistantAskedClarification: q.setupUser ? 'NO DATA (needs real setup reply)' : false,
  }
}

describe('PHASE 1 AUDIT — deterministic route signals for the 15 primary queries (records only)', () => {
  it('records pre-model classification for each query', () => {
    const rows = QUERIES.map(signalsFor)
    const out = {
      generatedAt: new Date().toISOString(),
      note: 'Pure-function reproduction of route.ts pre-model classification. No LLM/search. Setup queries use a placeholder assistant turn ONLY to set hasPriorAssistantTurn; nothing else is fabricated.',
      rows,
    }
    const dir = join(process.cwd(), 'docs', 'audit')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'route-signals.json'), JSON.stringify(out, null, 2) + '\n')
    for (const r of rows) {
      console.log(`#${r.id} lang=${r.lang} intent=${r.intent} forced=${r.forcedTool} loc=${r.locationIntent} plan=${r.planningIntent} stage=${r.decisionStage} turn=${r.turnIntent} domain=${r.needProfile.domain} role=${r.role} steps=${r.maxSteps} budget=${r.budget ? r.budget.min + '-' + r.budget.max : 'null'} prio=${JSON.stringify(r.needProfile.priorities)} loc=${JSON.stringify(r.needProfile.location.text)}`)
    }
  })
})
