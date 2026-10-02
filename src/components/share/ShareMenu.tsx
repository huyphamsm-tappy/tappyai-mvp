'use client'

// The TappyAI share menu.
//
// Replaces per-component `navigator.share()` calls. On Windows desktop those
// opened the OS Share Sheet, which lists only registered Windows Share Targets
// — Nearby Sharing, Teams, Outlook — so Facebook, TikTok and Zalo never
// appeared. TappyAI now presents its own targets first, and the system sheet
// becomes one option ("More apps") rather than the whole experience.
//
// 🔑 ONE ARTIFACT IN, EIGHT DELIVERIES OUT. Every button below receives the
// same `ShareArtifact` (see lib/share/shareArtifact.ts). The preview at the top
// is rendered from that artifact, so the user is shown exactly what will leave.
//
// Honesty rules baked in — each button's label and its result say what actually
// happened, and nothing more:
//  - a URL handoff (Facebook, Messenger) cannot carry a recommendation, because a
//    recommendation has no public page (Places data is live-only). The brochure
//    is COPIED first, the platform's dialog opens with the brand url, and the
//    result says "copied — opened X, paste to send". Never "sent".
//  - 🚨 A PUBLISHED PLAN IS A LINK. Once `/plan/<shareId>` exists, every target
//    carries THAT url and nothing else of substance: the page is the brochure,
//    the social card comes from its OG tags, and Copy copies the exact url. The
//    long text itinerary is used only while there is no link (signed out, or the
//    publish failed) — and then the menu says so and offers Retry; the url
//    handoffs are disabled rather than quietly sent with the brand root.
//  - Zalo publishes no standalone web share URL, and its official web Share
//    Button cannot run here (it needs an Official Account id and its widget host
//    does not resolve — see canHandoffToZalo). A phone's browser hands the link
//    to the app with Zalo's own intent/scheme; a desktop tile is LABELLED as
//    "copy link" and copies the plan url — it never pretends to be a Zalo share.
//  - a text handoff (Email, Viber, LINE) carries the brochure in the URI. Viber
//    is a custom scheme that fails silently when the app is absent, so the text
//    is copied first as insurance and the result says so.
//  - TikTok publishes no web handoff for a LINK; it takes a FILE. Its tile shares the card in
//    the sheet's layout (or an uploaded clip's video) through the OS sheet where files can be
//    shared, else downloads it and opens tiktok.com/upload — see lib/share/tiktokShare.ts.
//  - Tappy Inbox is the ONE target that can report delivery, because the
//    existing messaging endpoint returns 2xx. It reuses NewMessageSheet and
//    POST /api/messaging/threads/{id}/messages — nothing new.
//  - WhatsApp and Telegram carry the text through their documented web
//    endpoints (wa.me, t.me/share). Messenger has only an app deep link, so
//    its tile exists only where the app can — never a dead tile on a desktop.
//  - "Other apps" (the system sheet) only renders when navigator.share exists.
//  - image rendering is never a prerequisite: Save falls back to a text file.
//
// 🔑 EVERY PLATFORM TILE SHOWS THE PLATFORM'S OWN MARK (lib/share/shareBrands.ts)
// — never a coloured initial, never a generic glyph standing in for a brand.
// The neutral glyphs are reserved for the ACTIONS (Email, Inbox, Save, Copy,
// Other apps), so a real mark can never be mistaken for a generic one.

import { playBadgeEnabled } from '@/lib/share/storeListing'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, Check, Share2, X, Mail, Inbox, Download, Link2, ChevronRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  WEB_SHARE_TARGETS, buildShareUrl, buildTextShareUrl, canHandoffToZalo, canOpenMessenger, isShareableUrl, zaloMobileHandoff, type ShareTargetId,
} from '@/lib/share/shareTargets'
import { buildShareMessage } from '@/lib/share/shareMessage'
import { shareBrandMark } from '@/lib/share/shareBrands'
import { inboxBody, planLinkArtifact, resultLinkArtifact, type ShareArtifact } from '@/lib/share/shareArtifact'
import { renderShareCard, shareCardLayouts, type ShareCardLayout, type ShareSheetVariant } from '@/lib/share/shareCardFile'
import type { SharePostCard } from '@/lib/share/contentCards'
import { fetchVideoFile, runTikTokShare, tiktokCaption } from '@/lib/share/tiktokShare'
import { absoluteUrl } from '@/lib/share/openGraph'
import { planBrochureStrings } from '@/lib/i18n/planBrochure'
import { PLAN_SHARE_ID_RE, planShareUrl } from '@/lib/plans/share/planShare'
import NewMessageSheet from '@/components/messaging/NewMessageSheet'
import SharePreview from './SharePreview'
import { TAPPY_MARK_SRC } from '@/components/brand/TappyLockup'
import { usePublicShareEnabled } from '@/lib/config/usePublicShareFlag'

type Feedback = { kind: 'ok' | 'error'; text: string } | null

/** The line under the name on the sheet's link card, per variant. */
const CARD_LINE: Record<ShareSheetVariant, string> = {
  default: 'share.profile.cardLine',
  profile: 'share.profile.cardLine',
  post: 'share.post.cardLine',
  suggestion: 'share.suggestion.cardLine',
  plan: 'share.plan.cardLine',
}

/**
 * A plan's link, minted when the menu opens on a plan artifact.
 *
 *  - `pending`  the request is in flight; handoffs wait for it so nothing
 *               leaves with the brand url that could have carried the plan's own.
 *  - `url`      published: every target now carries `/plan/<shareId>`.
 *  - `signIn`   the sender is signed out or a guest (401/403): the text
 *               brochure still shares, and the menu says why there is no link.
 *  - `failed`   anything else: same fallback, no message beyond the brochure.
 */
type ResultLink = { state: 'idle' | 'pending' | 'failed' } | { state: 'url'; url: string; title?: string; description?: string }

/** One publish per turn per page view: reopening the menu must not mint a second page. */
const mintedResults = new Map<string, Promise<ResultLink>>()

async function publishResult(src: { conversationId: string; messageIndex: number }, locale: string): Promise<ResultLink> {
  try {
    const r = await fetch('/api/shared-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: src.conversationId, messageIndex: src.messageIndex, locale }),
    })
    if (!r.ok) return { state: 'failed' }
    const body = (await r.json()) as { url?: unknown; title?: unknown; description?: unknown }
    if (typeof body.url !== 'string' || !isShareableUrl(body.url)) return { state: 'failed' }
    return { state: 'url', url: body.url, title: typeof body.title === 'string' ? body.title : undefined, description: typeof body.description === 'string' ? body.description : undefined }
  } catch {
    return { state: 'failed' }
  }
}

type PlanLink = { state: 'idle' | 'pending' | 'failed' } | { state: 'url'; url: string } | { state: 'signIn' }

async function publishPlan(plan: unknown): Promise<PlanLink> {
  try {
    const r = await fetch('/api/plans/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
    if (r.status === 401 || r.status === 403) return { state: 'signIn' }
    // 🚨 fetch resolves on 4xx/5xx: the body must look right, not just arrive.
    if (!r.ok) return { state: 'failed' }
    const body = (await r.json()) as { id?: unknown }
    // The id is the contract; the url is built here from the same canonical
    // origin every other share link uses, so it can never disagree with them.
    return typeof body.id === 'string' && PLAN_SHARE_ID_RE.test(body.id) ? { state: 'url', url: planShareUrl(body.id) } : { state: 'failed' }
  } catch {
    return { state: 'failed' }
  }
}

/** A url-only call (Reviews) becomes the smallest honest artifact: the link is the content. */
function urlArtifact(url: string, title?: string): ShareArtifact {
  return { kind: 'places', title: title ?? url, subject: title ?? url, text: url, url, places: [] }
}

/**
 * Open a share dialog in a new tab and report whether it opened. `window.open(url, '_blank',
 * 'noopener')` ALWAYS returns null (per spec), so the old check said "Không thể chia sẻ lúc này"
 * right after Facebook had opened (measured on uat @ 0ab1495). Open, then cut the opener link.
 */
/** Zalo's own web client - the nearest official destination on a desktop (there is no web share url). */
export const ZALO_WEB_URL = 'https://chat.zalo.me/'

export function openShareWindow(url: string): boolean {
  const w = window.open(url, '_blank')
  if (!w) return false
  try { w.opener = null } catch { /* cross-origin already */ }
  return true
}

export default function ShareMenu({
  artifact,
  url,
  title,
  open,
  onClose,
  onShared,
  onPublicLink,
  publicSource,
  variant = 'default',
  profileName,
  post,
  videoUrl,
}: {
  /** The canonical artifact. When absent, `url` + `title` are shared as a link (Reviews). */
  artifact?: ShareArtifact
  /** Canonical public URL. Anything else is refused by isShareableUrl. */
  url?: string
  title?: string
  open: boolean
  onClose: () => void
  /**
   * A share COMPLETED through this channel (copy landed, native sheet resolved, an app or a
   * mail client was handed the content, a file was saved, the inbox send succeeded). Cancelled
   * or failed attempts never report. Reviews record it as their "Đã share" history.
   */
  onShared?: (channel: ShareTargetId | 'inbox' | 'download') => void
  /**
   * G1 "Public link": offered by the chat action bar for a persisted turn. Opens the
   * sanitized-preview flow that publishes a frozen /r/<slug> page. A row IN this menu —
   * never a replacement for the artifact share above it.
   */
  onPublicLink?: () => void
  /**
   * The persisted chat turn this share comes from. When given, the menu publishes it as a public
   * result page (POST /api/shared-results, the same sanitized snapshot as the "public link" row)
   * and every channel then carries ONE title line + ONE summary line + the short /r/<slug> link,
   * whose Open Graph card is the preview. Without it (or when publishing is refused) the text is
   * the same lines with the brand link - never the answer, never a tracking link.
   */
  publicSource?: { conversationId: string; messageIndex: number }
  /**
   * `profile`: the approved "Chia sẻ với mọi người" sheet for sharing a PROFILE link (UAT3,
   * 2026-09-27) — title + subtitle, the TappyAI card, a profile card with the link and a
   * prominent Copy, the app grid under its heading, "Tùy chọn khác" rows with a description
   * line, and the promo banner. Same targets, same handlers, same honesty rules as `default`;
   * only the layout differs. Needs no session: a stranger can open it from a shared profile.
   */
  /**
   * `post`: the SAME approved sheet for an Explore post (owner UAT 2026-09-28: Explore still showed
   * the old `default` sheet). Only the card line differs ("Xem bài đăng này trên TappyAI").
   *
   * 🔑 The variant is also the LAYOUT of every file this menu produces — Save and TikTok both go
   * through `renderShareCard(layout = variant)`, so the file matches the sheet on screen.
   */
  /**
   * `suggestion` (a chat recommendation) and `plan` (a published plan's page): the same approved
   * sheet (owner pick #6, 29/09) with their own card layout — see shareCardLayouts.
   */
  variant?: ShareSheetVariant
  /** The profile's display name (profile) or the post's title (post) for the card (empty → "TappyAI" alone). */
  profileName?: string
  /**
   * An Explore post's public fields. Given → the sheet offers the post's own card (review / clip,
   * owner pick #1 style) first and the QR card second; the chosen one is the saved/TikTok file.
   */
  post?: SharePostCard
  /**
   * An UPLOADED clip's own video (never a YouTube embed — that has no file). TikTok then shares
   * the video itself; when it cannot be fetched, the card image in the chosen layout instead.
   */
  videoUrl?: string
}) {
  const { t, locale } = useTranslation()
  // A5 kill switch (SHOW_PUBLIC_SHARE): the "public link" row shows only when the server allows
  // publishing. Asked only by a menu that actually offers the row, and only once it is open.
  const publicShareEnabled = usePublicShareEnabled(!!onPublicLink && open)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [canNativeShare, setCanNativeShare] = useState(false)
  const [messengerApp, setMessengerApp] = useState(false)
  const [zaloApp, setZaloApp] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [busy, setBusy] = useState<ShareTargetId | null>(null)

  const [planLink, setPlanLink] = useState<PlanLink>({ state: 'idle' })
  // Bumped by Retry: the publish effect keys on it, so a failed mint can be asked for again.
  const [attempt, setAttempt] = useState(0)

  const base: ShareArtifact = artifact ?? urlArtifact(url ?? '', title)
  // A plan whose link has been minted shares ITS OWN page — as a link; until
  // then, and for everything else, the artifact is used as built.
  const [resultLink, setResultLink] = useState<ResultLink>({ state: 'idle' })
  const a: ShareArtifact = planLink.state === 'url'
    ? planLinkArtifact(base, planLink.url)
    : resultLink.state === 'url' && base.kind === 'places' ? resultLinkArtifact(base, resultLink) : base
  /** What "copy" puts on the clipboard: a published PLAN copies its bare url; everything else the message. */
  const copyPayload = a.kind === 'plan' && a.planLink ? a.url : a.text
  // A recommendation shares the BRAND url and needs the brochure copied
  // alongside a url handoff; a review, or a published plan, IS its url — the
  // dialog carries everything, nothing rides on the clipboard.
  const linkOnly = a.text.trim() === a.url.trim() || a.planLink === true
  const textIsMoreThanUrl = !linkOnly
  /** The copy button copies a message (title + summary + link), not a bare link - and is labelled so. */
  const copyIsMessage = a.text.trim() !== a.url.trim() && !(a.kind === 'plan' && a.planLink)
  // A plan that arrives ALREADY published (its own /plan page) is not minted again.
  const planSnapshot = base.kind === 'plan' && !base.planLink ? base.plan : undefined
  // A plan without a link has nothing honest to hand to a url-only platform:
  // the brand root is not the plan. Those tiles wait for the link, or for Retry.
  const planUnlinked = !!planSnapshot && planLink.state !== 'url'
  const needsLink = (id: ShareTargetId) => planUnlinked && (id === 'facebook' || id === 'zalo' || id === 'messenger' || id === 'tiktok')

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
    setMessengerApp(typeof navigator !== 'undefined' && canOpenMessenger(navigator.userAgent))
    setZaloApp(typeof navigator !== 'undefined' && canHandoffToZalo(navigator.userAgent))
  }, [])

  // ── THE CARD: one layout picked, rendered ONCE per (layout, link), shown, saved, sent ──
  const sheetLayout = variant !== 'default'
  const layouts = shareCardLayouts({ variant, artifact: base, post })
  const [layoutPick, setLayoutPick] = useState<ShareCardLayout | null>(null)
  const layout: ShareCardLayout = layoutPick && layouts.includes(layoutPick) ? layoutPick : layouts[0]
  const cardCache = useRef(new Map<string, Promise<File | null>>())
  const cardFileRef = useRef<(l: ShareCardLayout) => Promise<File | null>>(async () => null)
  const objectUrls = useRef<string[]>([])
  const [preview, setPreview] = useState<{ key: string; state: 'pending' | 'ready' | 'failed'; src?: string } | null>(null)
  const cardKey = `${layout}|${a.url}`
  // A plan being published waits for its link before the card is drawn: the card prints the link
  // that leaves, and drawing it first with the brand url would render (and show) a card twice.
  const cardHold = base.kind === 'plan' && !base.planLink && !!base.plan && (planLink.state === 'idle' || planLink.state === 'pending')

  useEffect(() => {
    if (!open) {
      setFeedback(null); setInboxOpen(false); setBusy(null); setPlanLink({ state: 'idle' }); setResultLink({ state: 'idle' }); setAttempt(0)
      setLayoutPick(null); setPreview(null); cardCache.current.clear()
      for (const u of objectUrls.current) { try { URL.revokeObjectURL(u) } catch { /* already gone */ } }
      objectUrls.current = []
    }
  }, [open])

  // The sheet shows the very file Save and TikTok will use (same cache entry, same File object).
  useEffect(() => {
    if (!open || !sheetLayout) return
    setPreview({ key: cardKey, state: 'pending' })
    if (cardHold) return
    let cancelled = false
    void cardFileRef.current(layout).then(file => {
      if (cancelled) return
      if (!file) { setPreview({ key: cardKey, state: 'failed' }); return }
      let src: string | undefined
      try { src = URL.createObjectURL(file); objectUrls.current.push(src) } catch { src = undefined }
      setPreview({ key: cardKey, state: 'ready', src })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the card's identity, not the render
  }, [open, sheetLayout, cardKey, cardHold])

  // Publish the plan the moment the menu opens on one. The snapshot goes up in
  // the plan's own field names; the server whitelists it again and answers with
  // the stable link for exactly this plan.
  //
  // 🚨 Keyed on the snapshot's CONTENT, not its identity: callers build the
  // artifact during render, so the object is new every time and an identity
  // dependency would publish on every render.
  const planKey = planSnapshot ? JSON.stringify(planSnapshot) : ''
  // 🔑 NOTHING IS PUBLISHED WHEN THE MENU OPENS. The public /r/<slug> page is created only when the user
  // picks a channel or the copy button (that click is the consent). The pick is parked in `resumeRef`,
  // the page is created, and the same pick is replayed with the short link in place.
  const resultKey = publicSource && base.kind === 'places' ? publicSource.conversationId + '#' + publicSource.messageIndex : ''
  const resumeRef = useRef<ShareTargetId | null>(null)
  const handleRef = useRef<(id: ShareTargetId) => Promise<void>>(async () => {})
  useEffect(() => {
    if (resultLink.state !== 'url' || !resumeRef.current) return
    const id = resumeRef.current
    resumeRef.current = null
    void handleRef.current(id)
  }, [resultLink])

  useEffect(() => {
    if (!open || !planKey) return
    let cancelled = false
    setPlanLink({ state: 'pending' })
    const snapshot = JSON.parse(planKey) as { summary?: string }
    void publishPlan({ ...snapshot, share_text: snapshot.summary }).then(link => { if (!cancelled) setPlanLink(link) })
    return () => { cancelled = true }
  }, [open, planKey, attempt])

  if (!open) return null

  const planStrings = planBrochureStrings(locale === 'en' ? 'en' : 'vi')
  const linkPending = planLink.state === 'pending'

  const shareable = isShareableUrl(a.url)
  const hasContent = a.text.trim().length > 0

  async function copyText(text: string): Promise<boolean> {
    try { await navigator.clipboard.writeText(text); return true } catch { return false }
  }

  function download(blob: Blob, filename: string) {
    const href = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = href; el.download = filename; el.rel = 'noopener'
    document.body.appendChild(el); el.click(); el.remove()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  const appName = (id: ShareTargetId) => t(`share.${id}`)

  // ── THE ONE CARD FILE ─────────────────────────────────────────────────────────
  // Save and TikTok both call this: the layout is the sheet's own variant, so the file is the
  // layout the user is looking at. The card is drawn from the ARTIFACT AS BUILT (a plan's full
  // brochure, not its link-only shell) but carries the link that actually leaves.
  function cardWebsite(): string {
    try { return new URL(absoluteUrl('/')).host } catch { return '' }
  }
  function renderCard(l: ShareCardLayout): Promise<File | null> {
    return renderShareCard({
      artifact: { ...base, url: a.url, title: a.title, subject: a.subject },
      layout: l,
      displayName: variant === 'post' ? (profileName ?? a.subject) : profileName,
      post,
      planStrings: planStrings,
      copy: {
        caption: variant === 'post' ? t('share.post.scanHint') : t('v3.qr.scanHint'),
        badges: { review: t('share.card.badge.review'), clip: t('share.card.badge.clip'), suggestion: t('share.card.badge.suggestion') },
        scanTitle: t('share.card.scan'),
        byline: t('share.card.byline'),
        morePlaces: t('share.card.morePlaces'),
        tagline: t('v3.page.subtitle'),
        invite: variant === 'profile' ? t('v3.qr.card.invite') : undefined,
        slogan: t('v3.qr.card.slogan'),
        sloganSub: t('v3.qr.card.sloganSub'),
        websiteLabel: t('v3.qr.card.websiteLabel'),
        features: [t('v3.qr.card.feat1'), t('v3.qr.card.feat2'), t('v3.qr.card.feat3'), t('v3.qr.card.feat4')],
        website: cardWebsite(),
        // The TappyAI QR card (profile / post) carries the Google Play badge (owner SL2, 29/09).
        ...(playBadgeEnabled() ? { googlePlay: {
          badgeTop: t('v3.qr.card.playBadgeTop'),
          titlePre: t('v3.qr.card.getAppPre'),
          titlePost: t('v3.qr.card.getAppPost'),
          sub: t('v3.qr.card.getAppSub'),
          orWebsite: t('v3.qr.card.orWebsite'),
        } } : {}),
      },
    })
  }
  /** The ONE file for a layout and link: rendered once, then the same File for preview, Save and TikTok. */
  function cardFile(l: ShareCardLayout): Promise<File | null> {
    const key = `${l}|${a.url}`
    let p = cardCache.current.get(key)
    if (!p) {
      p = renderCard(l)
      cardCache.current.set(key, p)
      // A failed render may be retried on the next ask.
      void p.then(f => { if (!f && cardCache.current.get(key) === p) cardCache.current.delete(key) })
    }
    return p
  }
  cardFileRef.current = cardFile
  const makeCardFile = () => cardFile(layout)
  /** TikTok's file: an uploaded clip's own video when it can be fetched, else the card. */
  async function makeTikTokFile(): Promise<File | null> {
    if (videoUrl) {
      const video = await fetchVideoFile(videoUrl, 'tappyai-clip')
      if (video) return video
    }
    return makeCardFile()
  }

  /** Channels that carry the message (and so the public link). Inbox/Save/TikTok do not publish anything. */
  const PUBLIC_LINK_TARGETS = new Set<ShareTargetId>(['copy', 'native', 'email', 'line', 'whatsapp', 'telegram', 'viber', 'facebook', 'zalo', 'messenger'])

  async function handle(id: ShareTargetId) {
    if (busy || linkPending) return
    if (!hasContent) { setFeedback({ kind: 'error', text: t('share.nothingToShare') }); return }
    setBusy(id)
    try {
      // First explicit share of this turn: create the public page now, then replay this pick with the link.
      if (resultKey && publicSource && PUBLIC_LINK_TARGETS.has(id) && resultLink.state === 'idle') {
        let p = mintedResults.get(resultKey)
        if (!p) {
          p = publishResult(publicSource, locale === 'en' ? 'en' : 'vi')
          mintedResults.set(resultKey, p)
          void p.then(r => { if (r.state !== 'url') mintedResults.delete(resultKey) })
        }
        const r = await p
        if (r.state === 'url') { resumeRef.current = id; setResultLink(r); return }
        // Guest, flag off or failure: carry on with the brand link (three lines, no tracking links).
        setResultLink({ state: 'failed' })
      }
      switch (id) {
        case 'copy': {
          // A published plan copies its canonical url and nothing around it — what
          // Android and iOS "Copy link" do — so a paste anywhere is the plan page.
          const ok = await copyText(copyPayload)
          setFeedback({ kind: ok ? 'ok' : 'error', text: ok ? (a.kind === 'plan' && a.planLink ? t('share.copiedLink') : textIsMoreThanUrl || a.planLink ? t('share.copiedContent') : t('share.copied')) : t('share.copyFailed') })
          if (ok) onShared?.('copy')
          return
        }
        case 'native': {
          try {
            const data: ShareData = a.kind === 'plan' && a.planLink
              ? { title: a.subject, text: a.subject, url: a.url }
              : { title: a.subject, text: a.text }
            if (!a.planLink && !textIsMoreThanUrl) data.url = a.url
            if (a.image && typeof navigator.canShare === 'function') {
              const file = new File([a.image], 'tappyai.png', { type: 'image/png' })
              if (navigator.canShare({ files: [file] })) data.files = [file]
            }
            await navigator.share(data)
            onShared?.('native')
            onClose()
          } catch {
            // A cancelled share is not an error; report only if genuinely unavailable.
            if (!canNativeShare) setFeedback({ kind: 'error', text: t('share.unavailable') })
          }
          return
        }
        case 'email':
        case 'line':
        case 'whatsapp':
        case 'telegram':
        case 'viber': {
          // A bare link (a review) still goes with its title: title line + link.
          const body = a.text.trim() === a.url.trim() && a.title && a.title !== a.url ? buildShareMessage({ title: a.title, url: a.url }) : inboxBody(a)
          const handoff = buildTextShareUrl(id, a.subject, body, a.url)
          if (!handoff) { setFeedback({ kind: 'error', text: t('share.unavailable') }); return }
          // Viber is a custom scheme: nothing tells the page whether the app
          // exists. Copy first so the user is never left with nothing.
          const copied = id === 'viber' ? await copyText(a.text) : true
          if (id === 'email') {
            window.location.assign(handoff)
            setFeedback({ kind: 'ok', text: t('share.emailOpened') })
            onShared?.(id)
            return
          }
          const opened = openShareWindow(handoff)
          if (id === 'viber') {
            setFeedback({ kind: copied ? 'ok' : 'error', text: copied ? t('share.copiedAndOpened', { app: appName(id) }) : t('share.appNotOpened', { app: appName(id) }) })
            if (copied) onShared?.(id)
          } else {
            setFeedback(opened
              ? { kind: 'ok', text: t('share.openedWithText', { app: appName(id) }) }
              : { kind: 'error', text: t('share.unavailable') })
            if (opened) onShared?.(id)
          }
          return
        }
        case 'inbox': {
          setInboxOpen(true)
          return
        }
        case 'save': {
          // A caller-supplied image wins only on the default sheet; the approved sheet's layout
          // always renders its own card, so the file is what the sheet shows.
          let image: Blob | null = sheetLayout ? null : (a.image ?? null)
          let name = ''
          if (!image) {
            // Best effort, never a prerequisite: any failure falls to text.
            const file = await makeCardFile()
            image = file
            name = file?.name ?? ''
          }
          const stamp = new Date().toISOString().slice(0, 10)
          if (image) {
            download(image, name || `tappyai-${stamp}.png`)
            setFeedback({ kind: 'ok', text: t('share.savedImage') })
            onShared?.('download')
          } else {
            download(new Blob([a.text], { type: 'text/plain;charset=utf-8' }), `tappyai-${stamp}.txt`)
            setFeedback({ kind: 'ok', text: t('share.savedText') })
            onShared?.('download')
          }
          return
        }
        case 'tiktok': {
          // TikTok takes a FILE, never a link (owner requirement, UAT 2026-09-28): the card in
          // this sheet's layout, or an uploaded clip's own video. A phone that can share files
          // opens the OS sheet with it (the user picks TikTok); anything else downloads it and
          // opens tiktok.com/upload. Only when no file can be made at all is the text copied.
          if (needsLink(id)) { setFeedback({ kind: 'error', text: planStrings.linkRequired }); return }
          setFeedback({ kind: 'ok', text: t('share.tiktokPreparing') })
          const file = await makeTikTokFile()
          if (!file) {
            const ok = await copyText(copyPayload)
            setFeedback({ kind: ok ? 'ok' : 'error', text: ok ? t('share.tiktokHint') : t('share.copyFailed') })
            if (ok) onShared?.(id)
            return
          }
          const outcome = await runTikTokShare(file, tiktokCaption(a.subject, a.url), {
            nav: typeof navigator !== 'undefined' ? navigator : undefined,
            download: (f) => download(f, f.name),
            open: (u) => window.open(u, '_blank', 'noopener,noreferrer'),
            copy: copyText,
          })
          if (outcome === 'cancelled') { setFeedback(null); return }
          if (outcome === 'failed') { setFeedback({ kind: 'error', text: t('share.copyFailed') }); return }
          setFeedback({ kind: 'ok', text: outcome === 'shared' ? t('share.tiktokShared') : outcome === 'downloaded' ? t('share.tiktokDownloaded') : t('share.tiktokHint') })
          onShared?.(id)
          return
        }
        case 'facebook':
        case 'zalo':
        case 'messenger': {
          // A plan with no link yet: refuse out loud rather than hand off the brand root.
          if (needsLink(id)) { setFeedback({ kind: 'error', text: planStrings.linkRequired }); return }
          if (!shareable) { setFeedback({ kind: 'error', text: t('share.unavailable') }); return }
          if (id === 'zalo') {
            // Zalo's official web SDK (sp.zalo.me/plugins/sdk.js) has exactly two entry points: an Android
            // SEND intent and the iOS share-extension scheme - and NO desktop url (its web widget needs an
            // OA id and button-share.zalo.me does not resolve). So:
            //  - phone: the system share sheet (Web Share API) lists Zalo with the message; no sheet -> Zalo's own handoff;
            //  - desktop: copy the message, open Zalo Web (chat.zalo.me), and the button says so.
            if (canHandoffToZalo(navigator.userAgent)) {
              if (canNativeShare) {
                try {
                  await navigator.share({ text: a.text })
                  onShared?.(id)
                  onClose()
                } catch { /* cancelled: nothing to report */ }
                return
              }
              const mobile = zaloMobileHandoff(a.url, navigator.userAgent)
              if (mobile) {
                await copyText(copyPayload)
                window.location.assign(mobile)
                setFeedback({ kind: 'ok', text: t('share.opened', { app: appName(id) }) })
                onShared?.(id)
                return
              }
            }
            // window.open first: the click's user activation is still fresh, a clipboard await would spend it.
            const opened = openShareWindow(ZALO_WEB_URL)
            const ok = await copyText(copyPayload)
            setFeedback({ kind: ok ? 'ok' : 'error', text: ok ? (opened ? t('share.zaloCopiedOpened') : t('share.zaloHint')) : t('share.copyFailed') })
            if (ok) onShared?.(id)
            return
          }
          const handoff = buildShareUrl(id, a.url)
          if (!handoff) { setFeedback({ kind: 'error', text: t('share.unavailable') }); return }
          if (id === 'messenger') {
            // A custom scheme, like Viber: the page never learns whether the app
            // opened, so the content is copied first and the result says so.
            const copied = await copyText(a.text)
            window.open(handoff, '_blank', 'noopener,noreferrer')
            setFeedback({ kind: copied ? 'ok' : 'error', text: copied ? t('share.copiedAndOpened', { app: appName(id) }) : t('share.appNotOpened', { app: appName(id) }) })
            if (copied) onShared?.(id)
            return
          }
          // The dialog can only carry the brand url; the brochure travels on the clipboard.
          const copied = textIsMoreThanUrl ? await copyText(a.text) : true
          const opened = openShareWindow(handoff)
          if (!opened) { setFeedback({ kind: 'error', text: t('share.unavailable') }); return }
          setFeedback({
            kind: copied ? 'ok' : 'error',
            text: textIsMoreThanUrl
              ? (copied ? t('share.copiedAndOpened', { app: appName(id) }) : t('share.copyFailed'))
              : t('share.opened', { app: appName(id) }),
          })
          onShared?.(id)
          return
        }
      }
    } finally {
      setBusy(null)
    }
  }

  handleRef.current = handle

  /** After NewMessageSheet made/reopened a thread, post the brochure into it. */
  async function sendToInbox(threadId: string) {
    setInboxOpen(false)
    try {
      const r = await fetch(`/api/messaging/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: inboxBody(a) }),
      })
      if (r.status === 401 || r.status === 403) { setFeedback({ kind: 'error', text: t('share.inboxSignIn') }); return }
      if (!r.ok) throw new Error(String(r.status))
      // The one target that may say "sent": the server just confirmed it.
      setFeedback({ kind: 'ok', text: t('share.inboxSent') })
      onShared?.('inbox')
    } catch {
      setFeedback({ kind: 'error', text: t('share.inboxFailed') })
    }
  }

  // The messaging apps, each behind its own real mark. Messenger only where its
  // scheme can resolve — see canOpenMessenger.
  const apps = WEB_SHARE_TARGETS.filter(x =>
    (x.kind === 'url-handoff' || x.kind === 'text-handoff' || x.id === 'tiktok') && (x.id !== 'messenger' || messengerApp))
  const buttonLabel = (id: ShareTargetId, kind: string) => {
    // Desktop Zalo: no app to hand to and no working web widget, so the tile says
    // what it does — copy the link (or the content) — under Zalo's mark.
    // UAT 2026-09-28: the tile read "Sao chép liên kết" with no "Zalo", so the owner saw "no Zalo".
    if (id === 'zalo' && !zaloApp) return t('share.zaloCopyOpen')
    // TikTok takes a file: the tile says which one leaves.
    if (id === 'tiktok') return videoUrl ? t('share.tiktokVideo') : t('share.tiktokImage')
    return kind === 'url-handoff' && textIsMoreThanUrl ? t('share.copyAndOpen', { app: appName(id) }) : appName(id)
  }

  // ── The profile layout (approved design, UAT3). Every control calls the same `handle`. ──
  const cardName = variant === 'suggestion' || variant === 'plan' ? (profileName ?? a.subject) : profileName
  const copiedNow = feedback?.text === t('share.copiedContent') || feedback?.text === t('share.copied') || feedback?.text === t('share.copiedLink')
  const optionRow = (testId: string, icon: ReactNode, label: string, desc: string, onClick: () => void) => (
    <button data-testid={testId} onClick={onClick} disabled={!!busy || linkPending}
      className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left transition hover:bg-gray-100 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-gray-900 dark:text-gray-50">{label}</span>
        <span className="block text-[13px] text-gray-500 dark:text-gray-400">{desc}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-gray-400" aria-hidden="true" />
    </button>
  )
  // The plan link's state, said plainly: minting, or why there is none. A published link is
  // visible on the link card and needs no line of its own. Both sheets show the same lines.
  const planLinkStatus = planSnapshot ? (
    <>
      {linkPending && (
        <p role="status" className="mt-2 text-xs text-gray-500 dark:text-gray-400" data-plan-link="pending">{planStrings.linkPending}</p>
      )}
      {planLink.state === 'signIn' && (
        <p role="status" className="mt-2 text-xs text-amber-600 dark:text-amber-400" data-plan-link="sign-in">{planStrings.linkSignIn}</p>
      )}
      {/* A failed mint is said plainly and can be retried; it is never dressed up as published. */}
      {planLink.state === 'failed' && (
        <p role="status" className="mt-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400" data-plan-link="failed">
          <span>{planStrings.linkFailed}</span>
          <button type="button" onClick={() => setAttempt(n => n + 1)} data-testid="share-plan-retry" className="rounded-md border border-current px-2 py-0.5 font-medium">
            {planStrings.linkRetry}
          </button>
        </p>
      )}
    </>
  ) : null

  const profilePanel = (
    <div data-share-variant={variant}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-extrabold leading-tight text-gray-900 dark:text-gray-50">{t('share.profile.title')}</h2>
          <p className="mt-1 text-[14px] text-primary-600 dark:text-sky-300">{t('share.profile.subtitle')}</p>
        </div>
        <button onClick={onClose} aria-label={t('share.close')} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10">
          <X size={20} />
        </button>
      </div>

      {/* The TappyAI card over the profile card — one bordered block, as in the design. */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10" data-share-profile-card>
        <a href="/" className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 transition hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.04]">
          {/* eslint-disable-next-line @next/next/no-img-element -- same-origin brand mark, fixed box */}
          <img src={TAPPY_MARK_SRC} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-bold text-gray-900 dark:text-gray-50">TappyAI</span>
            <span className="block truncate text-[13px] text-gray-500 dark:text-gray-400">{t('v3.page.subtitle')}</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-gray-400" aria-hidden="true" />
        </a>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-bold text-gray-900 dark:text-gray-50">{cardName ? `${cardName} · TappyAI` : 'TappyAI'}</p>
            <p className="text-[13px] text-gray-500 dark:text-gray-400">{t(CARD_LINE[variant])}</p>
            <p className="break-all text-[13px] text-primary-600 dark:text-sky-300" data-share-profile-url>{a.url}</p>
          </div>
          <button data-testid="share-target-copy" onClick={() => handle('copy')} disabled={!!busy || linkPending}
            className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-4 py-2.5 text-[14px] font-semibold text-primary-700 transition hover:bg-primary-100 dark:bg-white/10 dark:text-gray-50 dark:hover:bg-white/15">
            {copiedNow ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
            {copyIsMessage ? t('share.copyContent') : t('share.profile.copyLink')}
          </button>
        </div>
        {/* Owner SL1 (29/09): the chat plan uses THIS sheet, so its link states live here too. */}
        {planLinkStatus && <div className="px-4 pb-3">{planLinkStatus}</div>}
      </div>

      {/* ── The share IMAGE: layout selector + the rendered file itself. What is shown here is the
          exact File that "Lưu về máy" saves and TikTok receives (same cache entry). ── */}
      <div className="mb-5" data-share-card-picker data-layout={layout}>
        <h3 className="mb-2.5 text-[16px] font-bold text-gray-900 dark:text-gray-50">{t('share.card.title')}</h3>
        {layouts.length > 1 && (
          <div role="radiogroup" aria-label={t('share.card.title')} className="mb-2.5 flex flex-wrap gap-2">
            {layouts.map(l => (
              <button key={l} type="button" role="radio" aria-checked={l === layout} data-testid={`share-layout-${l}`}
                onClick={() => setLayoutPick(l)} disabled={!!busy}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${l === layout
                  ? 'border-primary-600 bg-primary-600 text-white dark:border-sky-400 dark:bg-sky-500'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-primary-400 dark:border-white/15 dark:bg-white/[0.04] dark:text-gray-100'}`}>
                {t(`share.card.layout.${l}`)}
              </button>
            ))}
          </div>
        )}
        <div className="flex h-[280px] items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/[0.04]">
          {preview?.key === cardKey && preview.state === 'ready' && preview.src
            // eslint-disable-next-line @next/next/no-img-element -- a blob: URL of the rendered card file
            ? <img src={preview.src} alt={t(`share.card.layout.${layout}`)} data-share-card-preview={layout} className="h-full w-auto max-w-full object-contain" />
            : <p className="px-4 text-center text-[13px] text-gray-500 dark:text-gray-400" data-share-card-state={preview?.key === cardKey ? preview.state : 'pending'}>
                {preview?.key === cardKey && preview.state === 'failed' ? t('share.card.failed') : t('share.card.loading')}
              </p>}
        </div>
        <p className="mt-1.5 text-[12px] text-gray-500 dark:text-gray-400">{t('share.card.hint')}</p>
      </div>

      <h3 className="mb-2.5 text-[16px] font-bold text-gray-900 dark:text-gray-50">{t('share.profile.quick')}</h3>
      <div className="mb-5 grid grid-cols-4 gap-2">
        {apps.map((target) => {
          const mark = shareBrandMark(target.id)
          return (
            <button key={target.id} data-testid={`share-target-${target.id}`} onClick={() => handle(target.id)}
              disabled={!!busy || linkPending || needsLink(target.id)}
              aria-busy={busy === target.id || undefined}
              data-busy={busy === target.id ? 'true' : undefined}
              aria-disabled={needsLink(target.id) || undefined}
              data-needs-link={needsLink(target.id) ? 'true' : undefined}
              title={needsLink(target.id) ? planStrings.linkRequired : buttonLabel(target.id, target.kind)}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-gray-200 px-1 py-3 transition hover:border-primary active:scale-95 disabled:opacity-60 data-[busy=true]:animate-pulse dark:border-white/10 dark:bg-white/[0.03]">
              {mark
                // eslint-disable-next-line @next/next/no-img-element -- local SVG, fixed box
                ? <img src={mark.logo} alt="" width={40} height={40} draggable={false} decoding="async" className="h-10 w-10 select-none object-contain" data-share-brand={mark.id} />
                : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-100" aria-hidden="true" data-share-glyph={target.id}><Mail size={18} /></span>}
              <span className="text-center text-[12px] leading-tight text-gray-800 dark:text-gray-100">{buttonLabel(target.id, target.kind)}</span>
            </button>
          )
        })}
      </div>

      <h3 className="mb-2.5 text-[16px] font-bold text-gray-900 dark:text-gray-50">{t('share.profile.other')}</h3>
      <div className="mb-5 flex flex-col gap-2">
        {optionRow('share-target-inbox', <Inbox size={24} className="text-orange-500" />, t('share.inbox'), t('share.profile.inboxDesc'), () => handle('inbox'))}
        {onPublicLink && publicShareEnabled && optionRow('share-target-public-link', <Link2 size={24} className="text-primary-600" />, t('share.publicResult'), t('share.card.publicDesc'), () => onPublicLink())}
        {optionRow('share-target-save', <Download size={24} className="text-gray-600 dark:text-gray-200" />, t('share.save'), t('share.profile.saveDesc'), () => handle('save'))}
        {/* The OS sheet only where it exists — never a dead row. */}
        {canNativeShare && optionRow('share-target-native', <Share2 size={24} className="text-gray-600 dark:text-gray-200" />, t('share.more'), t('share.profile.moreDesc'), () => handle('native'))}
      </div>

      {feedback && (
        <p role="status" className={`mb-3 text-xs ${feedback.kind === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{feedback.text}</p>
      )}

      <a href="/" data-share-banner className="flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 py-2 pl-2 pr-3 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- same-origin mascot */}
        <img src="/tappy/wave.png" alt="" width={84} height={84} className="h-[84px] w-[84px] shrink-0 object-contain" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold leading-snug">{t('share.profile.bannerTitle')}</span>
          <span className="mt-0.5 block text-[12px] text-sky-100">{t('share.profile.bannerSub')}</span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20" aria-hidden="true"><ChevronRight size={18} /></span>
      </a>
    </div>
  )

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label={sheetLayout ? t('share.profile.title') : t('share.previewTitle')}
        onClick={onClose}
      >
        <div
          className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-900 p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {sheetLayout ? profilePanel : (<>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">{t('share.previewTitle')}</h2>
            <button onClick={onClose} aria-label={t('share.close')} className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} />
            </button>
          </div>

          <div className="mb-4">
            <SharePreview artifact={a} />
            {planLinkStatus}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {apps.map((target) => (
              <button
                key={target.id}
                data-testid={`share-target-${target.id}`}
                onClick={() => handle(target.id)}
                disabled={!!busy || linkPending || needsLink(target.id)}
              aria-busy={busy === target.id || undefined}
              data-busy={busy === target.id ? 'true' : undefined}
                aria-disabled={needsLink(target.id) || undefined}
                data-needs-link={needsLink(target.id) ? 'true' : undefined}
                title={needsLink(target.id) ? planStrings.linkRequired : buttonLabel(target.id, target.kind)}
                className="flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary active:scale-95 transition disabled:opacity-60 data-[busy=true]:animate-pulse data-[busy=true]:animate-pulse"
              >
                {(() => {
                  const mark = shareBrandMark(target.id)
                  return mark
                    // The platform's own mark, as published: fixed square box, aspect
                    // ratio preserved, never recolored, no container that would make
                    // every platform look alike. Decorative — the label names it.
                    // eslint-disable-next-line @next/next/no-img-element -- local SVG, fixed box, no pipeline needed
                    ? <img src={mark.logo} alt="" width={40} height={40} draggable={false} decoding="async" className="h-10 w-10 select-none object-contain" data-share-brand={mark.id} />
                    // An ACTION, not a brand: a neutral glyph in a neutral chip.
                    : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-200" aria-hidden="true" data-share-glyph={target.id}>
                        <Mail size={18} />
                      </span>
                })()}
                <span className="text-[11px] leading-tight text-center text-gray-700 dark:text-gray-200">
                  {buttonLabel(target.id, target.kind)}
                </span>
              </button>
            ))}
          </div>

          {resultKey && (
            <p data-testid="share-public-notice" className="px-1 text-xs leading-snug text-gray-500 dark:text-gray-400">{t('share.publicNotice')}</p>
          )}
          <div className="flex flex-col gap-2">
            <button data-testid="share-target-inbox" onClick={() => handle('inbox')} disabled={!!busy || linkPending} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
              <Inbox size={18} className="text-orange-500" />
              <span className="text-sm text-gray-800 dark:text-gray-100">{t('share.inbox')}</span>
            </button>
            {onPublicLink && publicShareEnabled && (
              <button data-testid="share-target-public-link" onClick={() => onPublicLink()} disabled={!!busy || linkPending} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
                <Link2 size={18} className="text-primary-600" />
                <span className="text-sm text-gray-800 dark:text-gray-100">{t('share.publicResult')}</span>
              </button>
            )}
            {/* A plan saves its itinerary image (owner pick #7, 29/09); other link-only shares have no card worth saving. */}
            {(!a.planLink || layout === 'plan') && (
              <button data-testid="share-target-save" onClick={() => handle('save')} disabled={!!busy || linkPending} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
                <Download size={18} className="text-gray-500" />
                <span className="text-sm text-gray-800 dark:text-gray-100">{t('share.save')}</span>
              </button>
            )}
            <button data-testid="share-target-copy" onClick={() => handle('copy')} disabled={!!busy || linkPending} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
              {feedback?.text === t('share.copiedContent') || feedback?.text === t('share.copied') || feedback?.text === t('share.copiedLink')
                ? <Check size={18} className="text-green-500" />
                : <Copy size={18} className="text-gray-500" />}
              <span className="text-sm text-gray-800 dark:text-gray-100">{copyIsMessage ? t('share.copyContent') : t('share.copyLink')}</span>
            </button>
            {canNativeShare && (
              <button data-testid="share-target-native" onClick={() => handle('native')} disabled={!!busy || linkPending} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
                <Share2 size={18} className="text-gray-500" />
                <span className="text-sm text-gray-800 dark:text-gray-100">{t('share.more')}</span>
              </button>
            )}
          </div>

          {feedback && (
            <p role="status" className={`mt-3 text-xs ${feedback.kind === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {feedback.text}
            </p>
          )}
          </>)}
        </div>
      </div>

      {/* The existing Messenger flow, unchanged: pick a person, get a thread id. */}
      {inboxOpen && (
        // The Messenger sheet is z-50 on its own; this dialog is z-100. A stacking
        // context above the dialog puts the picker where the user can see it.
        <div className="relative z-[110]">
          <NewMessageSheet onClose={() => setInboxOpen(false)} onStarted={(threadId) => { void sendToInbox(threadId) }} />
        </div>
      )}
    </>
  )
}
