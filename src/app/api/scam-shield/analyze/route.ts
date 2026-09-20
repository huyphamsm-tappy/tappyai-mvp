import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { getAccountRestriction, accountRestrictionCode, accountRestrictionMessage } from '@/lib/account/accountStatus'
import { clientIp } from '@/lib/security/rateLimit'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { analyzeMessage } from '@/lib/scam-shield/message'
import { aiQuotaIdentity, consumeAiQuestion, isProAccount, quotaFor, refundAiQuestion, type AiQuotaSpend } from '@/lib/ai/quota/aiQuestionQuota'
import { MESSAGE_MAX_CHARS, SCREENSHOT_ALLOWED_MIME, SCREENSHOT_MAX_BYTES } from '@/lib/scam-shield/message/config'
import { CHECK_RATE_LIMIT_WINDOW_MS } from '@/lib/scam-shield/config'

// POST /api/scam-shield/analyze — Scam Shield · Analyze Message.
//
// The URL and QR routes answer "is this link dangerous?". This one answers "what is this MESSAGE
// trying to make me do?" — pasted text, an optional link, or a screenshot — by running the same
// deterministic URL engine over every link it finds, the social-engineering rules over the prose,
// and (when the message needs it and the caller's allowance permits) a model, then fusing the
// three. See `lib/scam-shield/message/fusion.ts` for why the model never decides alone.
//
// 🚨 The message is never logged. The line written at the end carries shape only.

/** The URL engine may take up to 8s per fan-out, OCR and analysis a few seconds each. */
export const maxDuration = 45

/** Bursts, per IP, on top of the AI allowance: this route can trigger a full provider fan-out. */
const ANALYZE_BURST_MAX = 6

/** Twice the normalised ceiling: the normaliser truncates, so a long paste is trimmed rather
 *  than refused, but a payload beyond this is not a message anyone pasted. */
const RAW_TEXT_MAX = MESSAGE_MAX_CHARS * 2
/** 5 MB of binary is ~6.7M base64 characters; a little headroom for a data-URL prefix. */
const IMAGE_BASE64_MAX = 7_200_000

const bodySchema = z.object({
  text: z.string().max(RAW_TEXT_MAX).optional(),
  url: z.string().max(2048).optional(),
  imageBase64: z.string().max(IMAGE_BASE64_MAX).optional(),
  mimeType: z.string().max(64).optional(),
}).refine(b => (b.text?.trim() || b.url?.trim() || b.imageBase64), { message: 'empty' })

function decodeImage(base64: string, mimeType: string | undefined): { bytes: Uint8Array; mimeType: string } | null {
  const mime = (mimeType ?? '').toLowerCase()
  if (!(SCREENSHOT_ALLOWED_MIME as readonly string[]).includes(mime)) return null
  const payload = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  // 🚨 Size BEFORE any regex, and a negated single-character search rather than `^[…]+$`.
  // UAT (2026-09-15): an image just over 5 MB — ~7M base64 characters, inside the schema's string
  // cap — made `/^[A-Za-z0-9+/=\s]+$/.test()` overflow V8's regex stack (RangeError: Maximum call
  // stack size exceeded) and the route answered 500 instead of 400. Base64 carries 4 characters
  // per 3 bytes, so anything longer than that ceiling (plus padding/whitespace headroom) cannot be
  // a 5 MB image and is refused without ever being scanned or decoded.
  if (payload.length > Math.ceil(SCREENSHOT_MAX_BYTES / 3) * 4 + 1024) return null
  if (/[^A-Za-z0-9+/=\s]/.test(payload)) return null
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(Buffer.from(payload, 'base64'))
  } catch {
    return null
  }
  if (bytes.byteLength === 0 || bytes.byteLength > SCREENSHOT_MAX_BYTES) return null
  return { bytes, mimeType: mime }
}

export async function POST(req: Request) {
  const locale = requestLocale(req)
  const ip = clientIp(req)

  const burst = await publicRateLimit(`ss:analyze:${ip}`, ANALYZE_BURST_MAX, CHECK_RATE_LIMIT_WINDOW_MS)
  if (!burst.ok) {
    return NextResponse.json(
      { error: 'rate_limit', message: serverMessage('scam.tooManyChecks', locale) },
      { status: 429, headers: { 'Retry-After': String(burst.retryAfter) } },
    )
  }

  const { user, supabase } = await getRequestUser(req)

  // A suspended account cannot use AI anywhere in the app (Module 08). Anonymous sessions have no
  // account_status row to read.
  if (user && user.is_anonymous !== true) {
    const restriction = await getAccountRestriction(supabase, user.id)
    if (restriction.blocked) {
      return NextResponse.json(
        { error: accountRestrictionCode(restriction.reason!), message: accountRestrictionMessage(restriction) },
        { status: 403 },
      )
    }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body', message: serverMessage('scam.invalidBody', locale) }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', message: serverMessage('scam.analyzeEmpty', locale) }, { status: 400 })
  }

  let image: { bytes: Uint8Array; mimeType: string } | undefined
  if (parsed.data.imageBase64) {
    const decoded = decodeImage(parsed.data.imageBase64, parsed.data.mimeType)
    if (!decoded) {
      return NextResponse.json({ error: 'invalid_image', message: serverMessage('scam.analyzeInvalidImage', locale) }, { status: 400 })
    }
    image = decoded
  }

  // ── The ONE AI question quota ─────────────────────────────────────────────
  // A message analysis is one AI question from the SAME pool a chat turn draws on — there is no
  // Scam Alerts allowance of its own. It is spent INSIDE the pipeline, at the moment a model is
  // about to be called, and at most once per request (OCR + analysis of a screenshot share the
  // one gate call): a bare link never reaches this closure, so a URL-only check costs nothing.
  // Pro accounts are exempt, exactly as in /api/chat.
  const identity = aiQuotaIdentity(user, ip)
  let quota: (AiQuotaSpend & { pro: boolean }) | null = null
  const aiGate = async () => {
    if (await isProAccount(supabase, user)) {
      const q = quotaFor(identity)
      quota = { ok: true, limit: q.limit, period: q.period, used: 0, remaining: q.limit, scope: 'instance', pro: true, refund: null }
      return { allowed: true as const }
    }
    quota = { ...(await consumeAiQuestion(identity)), pro: false }
    return quota.ok ? { allowed: true as const } : { allowed: false as const, reason: 'quota_exhausted' as const }
  }

  const started = Date.now()
  try {
    const result = await analyzeMessage(
      { text: parsed.data.text, url: parsed.data.url, image, locale, aiGate },
      { abortSignal: req.signal },
    )

    // Shape only — never the message, never the extracted text, never the entities.
    console.info('[scam-shield] analyze', JSON.stringify({
      input: result.inputType,
      tier: result.analysis.tier,
      ai: result.analysis.aiStatus,
      provider: result.analysis.provider,
      role: result.analysis.modelRole,
      level: result.risk.level,
      score: result.risk.score,
      confidence: result.risk.confidence,
      urls: result.urlChecks.length,
      signals: result.signals.length,
      quota: quota ? { kind: identity.kind, period: (quota as AiQuotaSpend).period, ok: (quota as AiQuotaSpend).ok } : null,
      ms: Date.now() - started,
    }))

    // `quota` is null when no model was consulted (LEVEL 0) — nothing was spent, nothing to show.
    const q = quota as (AiQuotaSpend & { pro: boolean }) | null
    return NextResponse.json({
      ...result,
      quota: q
        ? { kind: identity.kind, limit: q.limit, period: q.period, used: q.used, remaining: q.remaining, exhausted: !q.ok, pro: q.pro }
        : null,
    })
  } catch (err) {
    console.error('[scam-shield] analyze error:', err instanceof Error ? err.name : 'error')
    // F-015: a hard analysis failure produced no answer, so give back the question it spent (the
    // same defect and the same refund path as /api/chat). `refund` is null for a Pro/exempt turn or
    // when the model was never reached (LEVEL 0), so this is a no-op in those cases.
    await refundAiQuestion((quota as AiQuotaSpend | null)?.refund ?? null)
    return NextResponse.json({ error: 'analyze_failed', message: serverMessage('scam.analyzeFailed', locale) }, { status: 500 })
  }
}
