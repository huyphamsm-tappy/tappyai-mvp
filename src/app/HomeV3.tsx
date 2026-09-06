'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'
import Header from '@/components/Header'
import V3Shell from '@/components/v3/V3Shell'
import TappyPresence from '@/components/v3/TappyPresence'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { formatRelativeTime, cn } from '@/lib/utils'
import { homeSmartTools, SMART_TOOLS_HREF } from '@/lib/tools/registry'
import {
  MessageCircle, Mic, ArrowUp, ChevronRight, Sparkles, Search, Plus,
  UtensilsCrossed, ShoppingBag, Plane, Clapperboard, Flower2,
  Music2, Sparkle, PenLine, Users, Star,
} from 'lucide-react'

// ── V3 Web · Home ───────────────────────────────────────────────────────────
//
// 🚨 HOME IS ONE PAGE, NOT AN ECOSYSTEM DASHBOARD.
//
// The first V3 build read the implementation roadmap (shell → Home → Explore →
// Deals → Marketplace → Inbox → Tools → Profile → Chat) as a LIST OF PANELS TO
// PUT ON HOME, and produced a fifteen-panel grid that rendered a slice of every
// destination in the product. That was wrong. The roadmap is an ORDER OF PAGES:
// each item is its own route with its own composition.
//
// Home now contains exactly what `V3_WEB_DESIGN_PROPOSAL §2.1` approves:
//
//   1. greeting + Tappy + the Ask-Tappy composer + contextual chips
//   2. Tiếp tục — resume a recent conversation
//   3. Dành cho bạn — discovery/content preview from EXISTING sources (ND-001)
//   4. Công cụ — the tools, grouped into three named groups
//
// and nothing else. Explore, Inbox, Deals, Marketplace, Scam Shield, AI Planner,
// Post/Upload, Saved, History and Profile are DESTINATIONS, reached through the
// shell's navigation. None of them renders here.
//
// 🚨 NO CAPABILITY WAS REMOVED, only put where it belongs. Every tool route still
// has a home on this page; every other destination still has a home in the
// shell. "Off Home" is not "gone".
//
// 🚨 HOME IS STILL NOT CHAT (DD-002 / OD-1). The composer submits by NAVIGATING
// to /chat — nothing here renders a thread, streams a reply, or shows assistant
// output in place. Home is a door, not a room.

/** 🔑 `imageUrl` is the ONE optional field, and it is the seam for real recommendation data: when a
 *  suggestion eventually arrives carrying a real photograph, it renders instead of the placeholder
 *  pool and stops being marked as a stand-in. The generator does not set it today, and adding it
 *  here changes nothing the generator does — that code is untouched. Everything a real
 *  recommendation would additionally carry (merchant, price, discount, rating, sales) is
 *  deliberately still ABSENT: there is no data behind those, and a field invites a render. */
interface Suggestion {
  text: string
  textEn: string
  category: string
  emoji: string
  gradient: string
  imageUrl?: string
}
interface Conv { id: string; title: string; messageCount: number; updated_at: string }

/** Server-provided. Nothing on this page is invented — see ND-001. */
export interface HomeV3Props {
  user: boolean
  userInfo: ComponentProps<typeof Header>['user']
  firstName: string
  suggestions: Suggestion[]
  conversations: Conv[]
}

/** The prompt generator emits exactly these five categories. Three already had labels on the
 *  Explore surface; two needed one. This is METADATA THE SERVER ALREADY SENDS getting a display
 *  name — not a field invented to make the card look fuller. */
/** The pool of card art, and the rule that hands one picture to each card.
 *
 *  🚧🚧 PLACEHOLDER ART — NOT THE INTENDED VISUAL TREATMENT. THIS MUST BE REPLACED. 🚧🚧
 *
 *  What the brief asks for here is real-looking curated lifestyle imagery: food, travel, cafe,
 *  wellness, entertainment. These five files are NOT that. They are authored gradient scenes —
 *  designed vector placeholders standing in until curated imagery exists. They are marked in the
 *  DOM too (`data-art-placeholder`), so this cannot ship unnoticed.
 *
 *  🔍 WHY NOT REAL IMAGERY: the whole repository was audited, including every image path that has
 *  ever existed in git history. There is no lifestyle photography anywhere in it. The complete
 *  set of non-icon, non-screenshot imagery is:
 *
 *    · public/backgrounds/home-desktop-v2 / -v5 .webp — Vietnam skyline panoramas. Both are the
 *      SAME subject (city, lake, boat), and one of them is already the background BEHIND this very
 *      page. They cannot stand for five different categories.
 *    · public/branding/hero-bg.webp — a cinematic skyline. Same problem, one subject.
 *    · public/branding/founder.jpg — a photograph of a real person. Never card decoration.
 *    · public/landing/screen-*.webp — screenshots of this app.
 *    · public/tappy/*.png — the previously created TappyAI character set (see below).
 *
 *  🚨 WHY THE TAPPY CHARACTER SET IS NOT THE ANSWER EITHER. `public/tappy/` looks at first like an
 *  exact match: it has food, travel, shopping, spa and entertainment. Three problems, checked by
 *  opening the files rather than by reading their names:
 *
 *    1. `shopping.png` is visually the SAME artwork as `travel.png` — otter with a camera. Two of
 *       the five cards would carry one picture.
 *    2. `entertainment.png` is an otter holding a green PERCENT-DISCOUNT TAG. On a Suggested card
 *       that reads as a promotional badge — exactly the fabricated commerce claim this section is
 *       forbidden to make. It is the "deals" concept under the wrong filename.
 *    3. They are the MASCOT, who already owns the hero at 320px on this same page. Five more
 *       Tappys below him is not "five beautiful things I might want to ask Tappy about"; it is
 *       five more otters.
 *
 *  ✅ HOW TO FIX THIS WHEN IMAGERY ARRIVES: drop the files into `public/home/inspire/`, change the
 *  pool below, and delete the `data-art-placeholder` attribute at the render site. Nothing else
 *  moves — not the card markup, not the data shape. `homeSuggestedArt.test.tsx` fails until the
 *  attribute is gone, which is the reminder. */
const ART_POOL: readonly string[] = [
  '/home/inspire/food.svg',
  '/home/inspire/travel.svg',
  '/home/inspire/cafe.svg',
  '/home/inspire/spa.svg',
  '/home/inspire/entertainment.svg',
]

/** 🚨 A HINT, NOT A MAPPING — and the distinction is the whole point of this file's last defect.
 *
 *  The art used to be looked up as `CATEGORY_ART[category]`, one immutable picture per category.
 *  The live generator is free to emit the same category twice — it really did return two `travel`
 *  suggestions — and a per-category lookup then hands both of those cards the SAME picture. Two
 *  identical scenes side by side in a five-card row is the most visible defect on the page, and no
 *  amount of art fixes it, because the wrong thing was the abstraction.
 *
 *  So art is assigned PER CARD (see `assignCardArt`), and this table only expresses a preference:
 *  where a themed scene happens to be free, the card that thematically suits it gets it. When it is
 *  taken, the card takes a different scene and nothing is lost — these are presentation artwork,
 *  not factual category illustrations. A spa scene above a travel prompt is a picture, not a claim.
 *  The card's CATEGORY LABEL stays the real semantic metadata and is never derived from the art. */
const CATEGORY_PREFERRED_ART: Record<string, string> = {
  food: '/home/inspire/food.svg',
  travel: '/home/inspire/travel.svg',
  shopping: '/home/inspire/cafe.svg',
  spa: '/home/inspire/spa.svg',
  entertainment: '/home/inspire/entertainment.svg',
}

/** What the presentation layer needs to choose a picture. Deliberately narrower than `Suggestion`:
 *  the choice must not be able to depend on the prompt text or the emoji. */
export interface ArtAssignable {
  category: string
  /** 🔑 FUTURE-PROOFING, AS CODE RATHER THAN AS A COMMENT. When a real recommendation object
   *  arrives carrying its own photograph, it wins outright — a real picture of a real thing beats
   *  any placeholder, and it does not compete for a slot in the pool. Nothing sets this today. */
  imageUrl?: string
}

/**
 * One picture per card, all of them different, and the same every time for the same input.
 *
 * 🚨 THE GUARANTEE THAT MATTERS: **no two cards in a row share a picture**, however the categories
 * repeat. Categories may repeat freely — that is the generator's business and is left alone.
 *
 * 🚨 DETERMINISTIC ON PURPOSE. No `Math.random`, no clock. A row that reshuffles its own artwork on
 * every render is a page that looks broken while it hydrates and unrecognisable on a revisit, so
 * the only inputs are the cards' order and their categories.
 *
 * Three passes, in this order because each one earns its place ahead of the next:
 *   1. real imagery, which is never overridden by a stand-in;
 *   2. the thematic preference, taken only while that scene is still free;
 *   3. the next free scene in the pool, walked from the card's own position so the fallback is a
 *      function of order alone.
 */
export function assignCardArt(cards: readonly ArtAssignable[]): string[] {
  const out: string[] = new Array(cards.length)
  const used = new Set<string>()

  cards.forEach((card, i) => {
    if (card.imageUrl) out[i] = card.imageUrl
  })

  cards.forEach((card, i) => {
    if (out[i]) return
    const preferred = CATEGORY_PREFERRED_ART[card.category]
    if (preferred && !used.has(preferred)) {
      out[i] = preferred
      used.add(preferred)
    }
  })

  cards.forEach((_card, i) => {
    if (out[i]) return
    for (let step = 0; step < ART_POOL.length; step++) {
      const candidate = ART_POOL[(i + step) % ART_POOL.length]
      if (!used.has(candidate)) {
        out[i] = candidate
        used.add(candidate)
        return
      }
    }
    // More cards than the pool holds. Uniqueness is then arithmetically impossible, so fall back to
    // position rather than to nothing — a repeated scene beats a missing one. Home renders five and
    // the pool holds five, so this is unreachable today and exists so a sixth card cannot crash it.
    out[i] = ART_POOL[i % ART_POOL.length]
  })

  return out
}

const CATEGORY_LABEL: Record<string, string> = {
  food: 'v3.explore.food',
  travel: 'v3.explore.travel',
  shopping: 'v3.explore.shopping',
  entertainment: 'v3.cat.entertainment',
  spa: 'v3.cat.spa',
}

/**
 * The capability strip.
 *
 * 🚨 IDS, ICONS AND LABELS ALL COME FROM WHAT ALREADY EXISTS. The five ids are exactly the five
 * in `CATEGORIES` (src/lib/utils) — the vocabulary `/api/chat`, the composer and the suggestion
 * cards already speak — and each label is resolved through `CATEGORY_LABEL` above, which was
 * already wired to `v3.explore.*` / `v3.cat.*`. Only the one-line descriptions are new copy.
 *
 * 🚨 NOT A SIXTH CATEGORY IN THE DATA. The "more" tile is rendered separately at the call site
 * and points at /tools, because there is no sixth category and inventing one to square the grid
 * is exactly the failure this file's header warns about.
 */
const CAPABILITIES: { id: string; icon: typeof Search; tone: string }[] = [
  { id: 'food', icon: UtensilsCrossed, tone: 'var(--v3-amber)' },
  { id: 'shopping', icon: ShoppingBag, tone: 'var(--v3-rose)' },
  { id: 'travel', icon: Plane, tone: 'var(--v3-accent)' },
  { id: 'entertainment', icon: Clapperboard, tone: 'var(--v3-violet)' },
  { id: 'spa', icon: Flower2, tone: 'var(--v3-emerald)' },
]

const QUICK_CHIPS = [
  'v3.chip.cafe',
  'v3.chip.plan',
  'v3.chip.translate',
  'v3.chip.split',
  'v3.chip.scam',
]

// 🔑 THE FIVE TOOLS HOME CURATES NOW COME FROM THE REGISTRY, NOT FROM A LIST HERE.
// The same five, in the same order, with the same icons and tones — `homeSmartTools()` is
// `smartTools()` filtered to `home: true`, which is the Everyday group. Two consequences worth
// naming: `SHOW_SCAM_SHIELD` finally reaches this page, and Home can no longer drift from the
// sidebar or from /tools, because none of the three keeps its own copy any more.

export default function HomeV3({ user, userInfo, firstName, suggestions, conversations }: HomeV3Props) {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const [draft, setDraft] = useState('')

  /** Submitting NAVIGATES. Home never answers in place. */
  function ask(text: string) {
    const q = text.trim()
    if (!q) return
    router.push(`/chat?q=${encodeURIComponent(q)}`)
  }

  const hasContinue = user && conversations.length > 0

  // The five cards, and one distinct picture for each. Sliced once here rather than twice in the
  // JSX so the art is assigned across exactly the cards that render — assigning over the full list
  // and then slicing would leave the visible row free to repeat a picture again.
  const forYou = suggestions.slice(0, 5)
  const forYouArt = assignCardArt(forYou)

  return (
    <V3Shell
      title={t('v3.home.title')}
      subtitle={t('v3.home.subtitle')}
      /* Home-only wording, passed explicitly. Editing the shared dictionary string instead
         changed Deals, Marketplace, Profile and Explore along with it. */
      brandTagline={t('v3.brand.taglineHome')}
      wordmarkOnly
      wide
      activeTab="/"
      user={{ name: userInfo?.full_name || firstName, avatarUrl: userInfo?.avatar_url, plan: user ? t('v3.top.plan') : null }}
    >
      {/* 🚨 THE CITYSCAPE IS GONE, AND THAT IS THE HEADLINE CHANGE.
          A full-bleed photograph of Hanoi behind everything made the strongest visual claim on
          the page, and the claim it made was "travel site". `HomeBackground`, `backgroundManager`
          and `backgrounds.config.ts` are NOT deleted — they still work and still resolve their
          asset; Home simply stops mounting them, and `V3Shell`'s `scenic` prop stops being
          passed. Turning the scene back on is one import and one line.

          What replaces it is light rather than imagery: wide, very low-opacity blue/violet
          fields that pool behind the hero and fall off to near-black. See `.v3-ai-ambience`. */}
      <div className="v3-ai-ambience" aria-hidden="true" />

      {/* No width of its own. The shell's `.v3-container` caps and centres every V3 page on the
          same grid; Home adding a second, narrower cap inside it was what left the content
          stranded in empty space on a wide screen. Sections below choose their COLUMN COUNT,
          never their width. */}
      {/* `v3-home` is the surface scope — see globals.css. It redefines the panel/tile/border
          tokens to charcoal for everything below, which is what stops Home reading as a blue
          dashboard. Scoped here so no other destination inherits it. */}
      {/* 🚨 `overflow-x: clip` BOUNDS TAPPY'S AURA. `TappyPresence` draws a decorative orbit
          that is deliberately wider than the character, and it used to be clipped for free by the
          hero's `v3-panel overflow-hidden`. The hero is not a panel any more, so the ring escaped
          the content column and pushed the document 108px wide — a horizontal scrollbar on the
          home page of the product. `clip` rather than `hidden`: it bounds the overflow without
          creating a scroll container, so nothing inside becomes focus-scrollable, and it is
          horizontal-only so sticky/vertical behaviour is untouched. */}
      <div className="v3-home relative z-[1] space-y-10" style={{ overflowX: 'clip' }}>

        {/* ── 1. THE AI AGENT — the page is this, and everything else supports it ──
            🚨 NOT A PANEL ANY MORE. The hero used to be one `v3-panel` among four, which is
            precisely why Home read as a dashboard that happened to contain a search box: a card
            competing on equal terms with the cards below it. It is now the page's own opening —
            no card border, no card background, lit from behind by `.v3-ai-hero`, with real
            vertical air around it. Rank is expressed by SPACE and LIGHT, not by another box.

            The order is deliberate and is the product's own sentence: who is speaking (eyebrow),
            what it asks (headline), what it promises (subtext), how you answer (composer), and
            what you might say (chips). */}
        <section
          data-home-section="hero"
          aria-label={t('v3.home.askAria')}
          className="v3-ai-hero relative pb-4 pt-7 sm:pt-11"
        >
          {/* 🚨 ONE COMPOSITION, NOT TWO COLUMNS.
              This was `flex` with a text column and a 240px mascot column, and the consequence
              was structural rather than cosmetic: the mascot set the width of everything beside
              it, so the composer — the product's primary control — was capped at whatever the
              character left over, and the hero read as "content on the left, art on the right".

              Only the HEADLINE now shares a row with Tappy. The subtext, the composer and the
              prompts span the full width of the hero, so the AI experience is as wide as the
              page and the character sits INSIDE that environment rather than next to it. */}
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              {/* The eyebrow names the product category before anything else on the page does. */}
              <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--v3-accent)' }}>
                <span
                  className="flex h-[19px] w-[19px] items-center justify-center rounded-md"
                  style={{ background: 'var(--v3-violet-fill)', color: 'var(--v3-on-violet)' }}
                  aria-hidden="true"
                >
                  <Sparkles size={11} />
                </span>
                {t('v3.home.eyebrow')}
              </p>

              {/* 🚨 TWO LINES, AND THE SECOND ONE IS THE PRODUCT'S QUESTION. The greeting alone
                  is hospitality; the question underneath it is the whole proposition, so it
                  carries the weight and the accent. */}
              <h2 className="mt-4 text-[30px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[42px] lg:text-[52px]" style={{ color: 'var(--v3-fg)' }}>
                {user ? t('v3.home.greetUser', { name: firstName || t('v3.profile.you') }) : t('v3.home.greetGuest')}{' '}
                <span aria-hidden="true">👋</span>
                <span className="mt-1 block" style={{ color: 'var(--v3-accent)' }}>{t('v3.home.askHeadline')}</span>
              </h2>

              <p className="mt-4 max-w-[62ch] text-[15px] font-light leading-relaxed" style={{ color: 'var(--v3-fg-secondary)' }}>
                {t('v3.home.askSub')}
              </p>
            </div>

            {/* ── Tappy ──────────────────────────────────────────────────────
                Layered into the composition, not given a column of its own: `flex-shrink-0` with
                no width, so it takes only the space the character occupies and never dictates how
                wide the headline beside it may be. Its glow is restored — restrained, close in,
                and behind — because a companion with no light on it read as a sticker.

                The asset is untouched: same `TappyPresence`, same pose, same calm aura. */}
            <div className="relative hidden flex-shrink-0 flex-col items-center pt-1 lg:flex">
              <div
                className="mb-1 rounded-2xl rounded-br-sm px-3 py-1.5 text-[12px] font-medium"
                style={{
                  background: 'color-mix(in srgb, var(--v3-panel) 88%, transparent)',
                  border: '1px solid var(--v3-border)',
                  color: 'var(--v3-fg-secondary)',
                }}
              >
                {t('v3.home.mascotSays')}
              </div>
              <TappyPresence pose="wave" size={224} />
            </div>
          </div>

          {/* 🚨 THE COMMAND CENTRE, AT FULL HERO WIDTH. This is the primary action of the entire
              product; on a 1480px canvas it is now roughly 1400px of lit surface rather than the
              ~640px the mascot column used to leave it. It still NAVIGATES to /chat — Home is a
              door, not a room (DD-002), and nothing here streams a reply. */}
          <form
            onSubmit={(e) => { e.preventDefault(); ask(draft) }}
            className="v3-ai-composer mt-7 flex items-center gap-3 rounded-2xl px-5 py-3 sm:py-3.5"
          >
            <Search size={19} aria-hidden="true" className="flex-shrink-0" style={{ color: 'var(--v3-fg-muted)' }} />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('v3.home.askPlaceholder')}
              aria-label={t('v3.home.askAria')}
              className="min-w-0 flex-1 bg-transparent text-[15px] font-light outline-none placeholder:font-light sm:text-[16.5px]"
              style={{ color: 'var(--v3-fg)' }}
            />
            <button
              type="button"
              aria-label={t('v3.home.voiceAria')}
              className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-white/5"
              style={{ color: 'var(--v3-fg-secondary)' }}
            >
              <Mic size={18} aria-hidden="true" />
            </button>
            <button
              type="submit"
              aria-label={t('v3.home.sendAria')}
              className="flex h-10 w-10 items-center justify-center rounded-xl transition-opacity hover:opacity-90"
              style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
            >
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          </form>

          <p className="mt-2.5 pl-1 text-[11.5px] font-light" style={{ color: 'var(--v3-fg-muted)' }}>
            {t('v3.home.askHint')}
          </p>

          {/* 🚨 "TRY ASKING TAPPY", NOT "QUICK SUGGESTIONS". These are not category navigation
              and not filters — each one is a whole sentence a person could say out loud, and
              pressing it asks Tappy exactly that. The label says so. */}
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-[11.5px] font-medium" style={{ color: 'var(--v3-fg-muted)' }}>
              {t('v3.home.tryAsking')}
            </p>
            <div className="v3-scroll-x flex gap-2 pb-0.5">
              {QUICK_CHIPS.map(c => (
                <button key={c} type="button" onClick={() => ask(t(c))} className="v3-chip flex-shrink-0">
                  {t(c)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── 2. CAPABILITIES — what the agent can actually do ──────────────
            🚨 THESE ARE THE FIVE REAL CATEGORIES, NOT AN INVENTED TAXONOMY. `CATEGORIES` in
            `src/lib/utils` is the shared vocabulary the composer, the chat route and the
            suggestion cards already use — food, shopping, entertainment, travel, spa — and
            `v3.cat.*` already carried a localized label for each. Every card opens /chat with
            that category preselected, which is the same mechanism the "for you" cards use.

            🚨 THEY ARE CAPABILITIES, NOT DESTINATIONS. Nothing here links to Explore, Deals or
            Marketplace, and no card reproduces another page's content — the rule `homeAiFirst`
            has enforced since the fifteen-panel dashboard was taken apart. Each one is a way to
            start a conversation, which is why they sit directly under the composer.

            🚨 SOFT TILES — the middle ground. See `.v3-cap-tile`: this was six dashboard cards,
            then six bare pills, and both were wrong. A faint surface and a hairline border make
            them read as capabilities rather than as modules or as tags. They share the row
            evenly so the section spans the same width as the composer above it. */}
        <section data-home-section="capabilities" aria-label={t('v3.home.canHelpTitle')}>
          <p className="text-[12.5px] font-medium" style={{ color: 'var(--v3-fg-secondary)' }}>
            {t('v3.home.canHelpTitle')}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {CAPABILITIES.map(({ id, icon: Icon, tone }) => (
              <Link
                key={id}
                href={`/chat?category=${id}`}
                data-capability={id}
                className="v3-cap-tile group flex items-center gap-2.5 rounded-xl px-3.5 py-3 focus-visible:outline-none focus-visible:ring-2"
              >
                <span aria-hidden="true" className="flex-shrink-0" style={{ color: tone }}>
                  <Icon size={17} />
                </span>
                <span className="truncate text-[13px] font-medium" style={{ color: 'var(--v3-fg)' }}>
                  {t(CATEGORY_LABEL[id])}
                </span>
              </Link>
            ))}
            {/* Not a sixth category — the way out to everything else, at the same weight. */}
            <Link
              href="/tools"
              data-capability="more"
              className="v3-cap-tile group flex items-center gap-2.5 rounded-xl px-3.5 py-3 focus-visible:outline-none focus-visible:ring-2"
            >
              <span aria-hidden="true" className="flex-shrink-0" style={{ color: 'var(--v3-fg-muted)' }}>
                <Plus size={17} />
              </span>
              <span className="truncate text-[13px] font-medium" style={{ color: 'var(--v3-fg-secondary)' }}>
                {t('v3.home.capMore')}
              </span>
            </Link>
          </div>
        </section>

        {/* ── 3. Dành cho bạn — rendered ONLY when the server sent items ─── */}
        {/* ND-001: a discovery/content preview drawn from an EXISTING source, never a
            personalisation system and never fabricated. No items, no section. */}
        {suggestions.length > 0 && (
          <section data-home-section="for-you" aria-label={t('v3.home.forYouTitle')}>
            <SectionHeading title={t('v3.home.forYouTitle')} />
            {/* Card FORMAT from the reference — dark surface, rounded, an accent icon badge at
                the top, title beneath.

                🚨 Card CONTENT stays what the server sends. The reference's cards carry place
                photographs and a "📍 Đà Lạt" line; this page has neither. `getDynamicPrompts`
                returns prompt suggestions — text, an emoji, a gradient — with no photo, no
                place and no location. Rendering a picture and a city under each one would be
                inventing content to match a mockup, so the format is reproduced and the
                fabricated parts are not. The emoji takes the icon slot. */}
            <div className="v3-scroll-x mt-3 flex gap-4 pb-1">
              {forYou.map((s, i) => {
                const text = locale === 'en' ? s.textEn || s.text : s.text
                const art = forYouArt[i]
                // 168px fixed is right where the strip must scroll (375: 319 of 708 visible) and
                // exact where it just fits (768: 708 of 708). At desktop the same fixed width left
                // 396px of the 1104px row empty — a third of the row, and the most visible
                // imbalance on the page. `lg:flex-1` gives the tiles basis 0 so the four of them
                // share the row instead of hugging its left edge.
                return (
                  <Link
                    key={s.text}
                    href={`/chat?q=${encodeURIComponent(text)}&category=${s.category}`}
                    className="v3-tile group flex min-h-[210px] w-[210px] flex-shrink-0 flex-col overflow-hidden transition-colors lg:flex-1"
                  >
                    {/* The art. `aria-hidden` and empty alt: it is decoration behind a link whose
                        text already says where it goes, so a screen reader gains nothing from it. */}
                    <span className="relative block h-[108px] w-full flex-shrink-0 overflow-hidden">
                      {art && (
                        <img
                          src={art}
                          alt=""
                          aria-hidden="true"
                          /* 🚧 The greppable marker that this picture is a stand-in, and a test
                             asserts it is present for exactly as long as that is true. It is
                             CONDITIONAL rather than constant: a card carrying a real photograph
                             from a recommendation is not a placeholder, so marking it as one would
                             make the marker a lie the moment real data arrives. */
                          data-art-placeholder={s.imageUrl ? undefined : 'authored-vector-scene'}
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      )}
                      <span className={cn('absolute bottom-2 left-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-[17px] shadow-lg', s.gradient)}>
                        {s.emoji}
                      </span>
                    </span>

                    <span className="flex flex-1 flex-col p-3.5">
                      {/* Not clamped: `line-clamp-*` resolves its display to `flow-root` on this
                          surface, so the clamp degrades to a hard clip with no ellipsis. Letting
                          the tile grow is the honest failure mode for a one-sentence string. */}
                      <span className="text-[13px] font-normal leading-snug" style={{ color: 'var(--v3-fg)' }}>
                        {text}
                      </span>
                      {/* 🚨 The metadata slot carries the CATEGORY, which the server really sends —
                          never an invented place, price, discount or rating. The reference shows a
                          location here; this data has none, and a made-up city would be a factual
                          claim rather than a conversation starter. */}
                      {CATEGORY_LABEL[s.category] && (
                        <span className="mt-auto flex items-center gap-1.5 pt-2 text-[11px] font-light" style={{ color: 'var(--v3-fg-muted)' }}>
                          <span className="h-1 w-1 rounded-full" style={{ background: 'var(--v3-accent)' }} aria-hidden="true" />
                          {t(CATEGORY_LABEL[s.category])}
                        </span>
                      )}
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── 4. Công cụ — grouped, so equal tiles become a hierarchy ────── */}
        {/* 🚨 `id="smart-tools"` — THE ANCHOR THAT WAS NEVER HERE. The sidebar row and the top
            tab both linked to `/#smart-tools` and no element in the codebase carried that id, so
            both scrolled to the top of Home. They point at `/tools` now, but any bookmark or
            deep link to the old anchor lands correctly from here on. */}
        <section id="smart-tools" data-home-section="tools" aria-label={t('v3.panel.smartTools')}>
          <SectionHeading
            title={t('v3.panel.smartTools')}
            action={{ label: t('v3.action.seeAll'), href: SMART_TOOLS_HREF }}
          />
          {/* 🚨 FIVE, IN ONE ROW — Home is a CURATED ENTRY POINT, not the tools catalogue.
              This went through three shapes before landing here: three labelled groups (the old
              written spec), then all ten flattened into two rows (my reading of "five across"),
              and now the five the approved reference actually shows. Two rows of ten was the
              wrong instinct — it treated "no capability may be lost" as "every route must appear
              on Home", which is an information-architecture decision, not a safety rule.

              🚨 The other five stay reachable, and that had to be MADE true rather than assumed.
              `/recommendations` was already in the sidebar as Search, but `/group/new`, `/music`,
              `/boi` and `/viet-content` had ZERO navigation anywhere else — measured, not
              guessed — so cutting them from Home would have orphaned four working routes. They
              are in the sidebar's tools group now. The Tools page that will eventually hold them
              is a later item; until it exists, the sidebar is their home. */}
          {/* 🚨 STILL FIVE, STILL ONE ROW ON DESKTOP — Home did not become the catalogue.
              What each card gained is the DESCRIPTION that was already written for it: every
              `v3.tool.*Desc` key has existed in both languages since the first V3 pass and was
              rendered nowhere, so a tile showed a one-word label and left the user to guess what
              the tool actually did. Two up at 360px rather than three, because a description
              needs the width; nothing here scrolls the page sideways at any step. */}
          <div className="mt-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {homeSmartTools().map(({ id, href, icon: Icon, labelKey, descKey, tone }) => (
                    <Link
                      key={id}
                      href={href}
                      data-tool={id}
                      className="v3-tile flex min-h-[104px] flex-col gap-2 p-3.5 focus-visible:outline-none focus-visible:ring-2 active:scale-[0.99]"
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.055)', color: tone }}
                        aria-hidden="true"
                      >
                        <Icon size={18} />
                      </span>
                      <span className="block text-[12.5px] font-medium leading-tight" style={{ color: 'var(--v3-fg)' }}>
                        {t(labelKey)}
                      </span>
                      <span className="block text-[11px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>
                        {t(descKey)}
                      </span>
                    </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── 4. Tiếp tục — LAST, deliberately ─────────────────────────────
            Owner decision, and an ORDER change rather than a behaviour change: the page now
            reads ask → discover → do → resume. Continue used to sit directly under the
            assistant, which put "what you did before" ahead of "what you could do now" on a
            surface whose entire point is the first question.

            🚨 This makes WEB DIVERGE from Android and iOS, which still place recent
            conversations above their quick actions. `crossPlatformParity.test.ts` enforced that
            shared order; it is UPDATED to record the divergence rather than deleted, because the
            rule underneath it — the assistant comes first on every platform — still holds.

            Nothing about Continue's data, wording or behaviour changed. */}
        <section data-home-section="continue" aria-label={t('v3.panel.continue')}>
          <SectionHeading
            title={t('v3.panel.continue')}
            action={hasContinue ? { label: t('v3.action.seeAll'), href: '/profile/history' } : undefined}
          />
          {hasContinue ? (
            <ul className="mt-2.5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* ≤2 recent threads, as the approved layout specifies. */}
              {conversations.slice(0, 2).map(c => (
                <li key={c.id}>
                  <Link href={`/chat/${c.id}`} className="v3-tile flex items-center gap-3.5 p-4">
                    <span
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                      style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
                      aria-hidden="true"
                    >
                      <MessageCircle size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium" style={{ color: 'var(--v3-fg)' }}>{c.title}</span>
                      <span className="block text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>
                        {t('home.messages', { n: String(c.messageCount) })} · {formatRelativeTime(c.updated_at, t, locale)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="v3-panel mt-2 px-4 py-6 text-center">
              <p className="text-[13px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                {user ? t('home.emptyChat') : t('home.loginPrompt')}
              </p>
              <Link
                href={user ? '/chat' : '/login'}
                className="mt-3 inline-flex min-h-[40px] items-center rounded-xl px-5 text-[13px] font-semibold"
                style={{ background: 'var(--v3-accent-fill)' }}
              >
                {user ? t('home.chatNow') : t('home.login')}
              </Link>
            </div>
          )}
        </section>
      </div>
    </V3Shell>
  )
}

/** One heading rhythm for the three sections below the hero. */
function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: { label: string; href: string } }) {
  return (
        // No optical inset: `px-0.5` put every heading 2px right of the grid line its own
    // cards sit on, which is exactly the kind of near-miss that reads as sloppy.
    <div className="flex items-baseline justify-between gap-3">
      {/* `data-scenic-heading` is kept: the halo it carries is harmless now that Home is opaque,
          and removing it would touch the scenic rule other surfaces may still use. */}
      <div className="min-w-0">
        <h2 data-scenic-heading className="text-[17px] font-normal tracking-[-0.01em]" style={{ color: 'var(--v3-fg)' }}>{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-[12px] font-light" style={{ color: 'var(--v3-fg-muted)' }}>{subtitle}</p>
        )}
      </div>
      {action && (
        <Link href={action.href} className="flex items-center gap-0.5 text-[12px]" style={{ color: 'var(--v3-accent)' }}>
          {action.label}
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
