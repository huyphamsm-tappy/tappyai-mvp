import { AI } from '@/lib/ai/llm'
import { NextRequest, NextResponse } from 'next/server'
import { dailyRateLimit, clientIp } from '@/lib/security/rateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// Daily cap via the shared limiter (lib/security/rateLimit) — one implementation
// for every daily-capped route instead of per-route Maps.
const DAILY_LIMIT = 30

const LANG_NAMES: Record<string, string> = {
  vi: 'Vietnamese', en: 'English', ja: 'Japanese', ko: 'Korean',
  'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese',
  fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
  pt: 'Portuguese', ar: 'Arabic', th: 'Thai', id: 'Indonesian',
  ms: 'Malay', hi: 'Hindi', ru: 'Russian', nl: 'Dutch',
  pl: 'Polish', tr: 'Turkish', sv: 'Swedish', da: 'Danish',
  fi: 'Finnish', cs: 'Czech', hu: 'Hungarian', ro: 'Romanian',
  el: 'Greek', he: 'Hebrew', uk: 'Ukrainian', no: 'Norwegian',
}

export async function POST(req: NextRequest) {
  // B04 — resolved once per request; the `error` codes below are unchanged machine contract and
  // only the human sentence follows the caller's language.
  const locale = requestLocale(req)
  if (!dailyRateLimit(`translate:${clientIp(req)}`, DAILY_LIMIT).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('translate.dailyLimit', locale, { n: DAILY_LIMIT }) }, { status: 429 })
  }

  let text: string, targetLang: string
  try {
    const body = await req.json()
    text = (body.text || '').trim()
    targetLang = body.targetLang || 'vi'
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  if (!text) return NextResponse.json({ error: 'empty_text' }, { status: 400 })
  if (text.length > 2000) return NextResponse.json({ error: 'too_long', message: serverMessage('translate.tooLong', locale) }, { status: 400 })
  const langName = LANG_NAMES[targetLang] || 'Vietnamese'

  try {
    const { text: translation } = await AI.generate({
      role: 'smart',
      prompt: `Translate the following text to ${langName}. Return ONLY the translation — no explanations, no quotes, no extra text.\n\n${text}`,
      maxTokens: 1024,
    })
    return NextResponse.json({ translation: translation.trim() })
  } catch {
    return NextResponse.json({ error: 'api_error', message: serverMessage('translate.failed', locale) }, { status: 500 })
  }
}
