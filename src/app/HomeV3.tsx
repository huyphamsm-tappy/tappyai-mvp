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
  MessageCircle, Mic, ArrowUp, ArrowRight, ChevronRight, Sparkles, Search, Plus,
  Coffee, Languages, ShieldCheck,
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
  '/home/inspire/food.webp',
  '/home/inspire/travel.webp',
  '/home/inspire/shopping.webp',
  '/home/inspire/spa.webp',
  '/home/inspire/entertainment.webp',
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
 *
 *  🚨 THE POOL IS PHOTOGRAPHY NOW, AND `shopping` IS ITS OWN PICTURE. The five entries were dark
 *  authored SVG scenes, and `shopping` borrowed the CAFE scene because no shopping scene existed —
 *  a retail prompt sat under a coffee table. The owner supplied five approved photographs, one per
 *  real category, so the borrow is gone and every category now has its own.
 *  The card's CATEGORY LABEL stays the real semantic metadata and is never derived from the art. */
const CATEGORY_PREFERRED_ART: Record<string, string> = {
  food: '/home/inspire/food.webp',
  travel: '/home/inspire/travel.webp',
  shopping: '/home/inspire/shopping.webp',
  spa: '/home/inspire/spa.webp',
  entertainment: '/home/inspire/entertainment.webp',
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
const CAPABILITIES: { id: string; icon: typeof Search; descKey: string; tone: string }[] = [
  { id: 'food', descKey: 'v3.home.capFood', icon: UtensilsCrossed, tone: 'var(--v3-amber)' },
  { id: 'shopping', descKey: 'v3.home.capShopping', icon: ShoppingBag, tone: 'var(--v3-rose)' },
  { id: 'travel', descKey: 'v3.home.capTravel', icon: Plane, tone: 'var(--v3-accent)' },
  { id: 'entertainment', descKey: 'v3.home.capEntertainment', icon: Clapperboard, tone: 'var(--v3-violet)' },
  { id: 'spa', descKey: 'v3.home.capSpa', icon: Flower2, tone: 'var(--v3-emerald)' },
]

/** 🚨 THE PROMPTS ARE ICON + TEXT, AS THE APPROVED MOCKUP SHOWS. They were bare strings.
 *  Each glyph is an existing lucide icon and is chosen for what the prompt ASKS — a cup for the
 *  cafe prompt, a plane for the trip, a shield for the scam check — so the row reads as things a
 *  person could say rather than as a set of filter tags. The keys and the strings are unchanged. */
const QUICK_CHIPS: { key: string; icon: typeof Search; tone: string }[] = [
  { key: 'v3.chip.cafe', icon: Coffee, tone: 'var(--v3-amber)' },
  { key: 'v3.chip.plan', icon: Plane, tone: 'var(--v3-accent)' },
  { key: 'v3.chip.translate', icon: Languages, tone: 'var(--v3-violet)' },
  { key: 'v3.chip.split', icon: Users, tone: 'var(--v3-emerald)' },
  { key: 'v3.chip.scam', icon: ShieldCheck, tone: 'var(--v3-rose)' },
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
      <div className="v3-home relative z-[1] space-y-7 xl:space-y-8" style={{ overflowX: 'clip' }}>

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
          className="v3-ai-hero relative pb-0 pt-7 sm:pt-11 xl:pt-12"
        >
          {/* ── Tappy — ONE PRESENCE BLOCK INSIDE THE HERO ──────────────────
              🚨 THE CHARACTER IS SIZED BY THE COMPOSITION, NOT BY A NUMBER.
              Every earlier attempt gave Tappy a pixel size and then nudged `top` and `scale`
              until it looked acceptable — which is exactly why it kept reading as an image
              parked in a corner: the character had no relationship to anything around it.

              This block is stretched to the HEADLINE BAND (`top-0 -bottom-6`), and Tappy fills
              it (`fill`). So his head sits at the top of the band, level with the eyebrow, and
              his feet land on the composer's top edge — the reference's relationship, holding at
              every width with no scale transform and no magic offsets. The band grows with the
              type, and Tappy grows with the band.

              🚨 INSET FROM THE RIGHT, NOT PINNED TO IT. `right-[4%]` and up: in the reference the
              pair stops well short of the canvas edge, and pinning it to `right-0` is what made
              the right side read as "mascot parked against the wall" rather than as part of the
              scene.

              🚨 THE BUBBLE IS TOP-ALIGNED BESIDE HIS HEAD. `items-start` puts the card level with
              the top of the character, which is where the reference has it — beside the head,
              speaking. Centring it against his body (the previous `mt-6`) detached it into a
              floating chip. It is inside the same absolutely-positioned block, so the two move
              together as one presence and can never drift apart. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-6 right-[10%] top-0 hidden items-end lg:flex xl:right-[8.5%] 2xl:right-[7%]"
          >
            {/* 🚨 THE BUBBLE IS ANCHORED TO THE ARTWORK, NOT TO THE BAND. Two earlier passes
                aligned it to this CONTAINER, and both stranded it: the container is as tall as the
                headline band, so `top` on it lands near the header while the character — capped and
                bottom-aligned — has its head far below. `wave.png` is square and the mascot box
                letterboxes it, so the square overlay below reproduces exactly where the artwork
                sits (full width, centred, `aspect-ratio: 1/1`) and the bubble is placed in ITS
                coordinates. The card now tracks his head at every size, with no pixel offsets. */}
            <div className="relative flex h-full items-end">
              {/* 🚨 CAPPED, AND GROUNDED AT THE BOTTOM. `h-full aspect-square` alone created a
                  feedback loop at 1280: a taller band made the square WIDER, which squeezed the
                  headline into a third line, which made the band taller again — and the box ended
                  up overlapping the copy. The cap stops the growth; `items-end` keeps his feet on
                  the composer's edge even when the cap makes him shorter than the band. */}
              <TappyPresence pose="wave" size={252} fill className="max-w-[236px] xl:max-w-[288px] 2xl:max-w-[330px]" />

              {/* The artwork's own square: same width as the mascot box, centred in it. Nothing is
                  drawn here — it exists so the bubble can be positioned in percentages of the
                  character rather than in pixels off a container edge.

                  🚨 THE PERCENTAGES BELOW ARE MEASURED FROM wave.png, NOT CHOSEN BY EYE. Reading the
                  alpha channel of the 288px square source: the drawing occupies x 19.1–80.6% and y
                  13.9–77.1%, and the HEAD is the blob at x 29–75%, y 17–43%. So `left-[78%]` puts the
                  card just past the ear with a few pixels of daylight, and `top-[23%]` centres its
                  ~39px height on the face at ~30% rather than floating above the head. Anything
                  derived from the outer container instead of these numbers drifts, because the box
                  letterboxes the square and its height is the headline band's, not the art's. */}
              <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ aspectRatio: '1 / 1' }}>
                <div
                  className="absolute left-[78%] top-[23%] w-[136px] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[12.5px] font-medium leading-snug 2xl:w-[168px]"
                  style={{
                    background: 'color-mix(in srgb, var(--v3-panel) 94%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--v3-accent) 30%, var(--v3-border))',
                    color: 'var(--v3-fg-secondary)',
                    boxShadow: '0 12px 32px -18px rgba(0,122,255,0.6)',
                  }}
                >
                  {t('v3.home.mascotSays')}
                </div>
              </div>
            </div>
          </div>

          {/* The copy reserves the pair's width so nothing can collide with it. */}
          <div className="min-w-0 lg:pr-[360px] xl:pr-[460px] 2xl:pr-[520px]">
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

            <h2 className="mt-4 text-[30px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[42px] lg:text-[50px] 2xl:text-[56px]" style={{ color: 'var(--v3-fg)' }}>
              {user ? t('v3.home.greetUser', { name: firstName || t('v3.profile.you') }) : t('v3.home.greetGuest')}{' '}
              <span aria-hidden="true">👋</span>
              <span className="mt-1 block" style={{ color: 'var(--v3-accent)' }}>{t('v3.home.askHeadline')}</span>
            </h2>

            <p className="mt-3.5 max-w-[62ch] text-[15px] font-light leading-relaxed" style={{ color: 'var(--v3-fg-secondary)' }}>
              {t('v3.home.askSub')}
            </p>
          </div>

          {/* 🚨 THE COMPOSER STOPS SHORT OF THE CANVAS EDGE, AS IT DOES IN THE MOCKUP.
              It ran the full width here; in the approved composition it ends roughly where
              Tappy's column begins, which is what keeps the hero reading as one scene with the
              character in it rather than as a full-bleed bar with art parked above it. */}
          <form
            onSubmit={(e) => { e.preventDefault(); ask(draft) }}
            className="v3-ai-composer mt-6 flex items-center gap-3 rounded-2xl px-5 py-3 sm:py-3.5 lg:mr-[132px] xl:mr-[176px] 2xl:mr-[216px]"
          >
            <Search size={19} aria-hidden="true" className="flex-shrink-0" style={{ color: 'var(--v3-fg-muted)' }} />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              /* 🚨 ONE LINE, AS IN THE MOCKUP. The example lived in a grey line UNDER the
                  composer; the approved design puts it inside the field itself, which removes a
                  row from the hero and is why the mockup's composer sits closer to the prompts. */
              placeholder={`${t('v3.home.askPlaceholder')} ${t('v3.home.askHint')}`}
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

          {/* 🚨 THE PROMPTS CARRY ICONS. In the mockup each pill opens with a semantic glyph —
              a cup, a plane, cutlery, a shield, people — and that iconography is a large part of
              why the row reads as things you could SAY rather than as filter tags. They were
              plain text here. Every glyph is an existing lucide icon already used elsewhere in
              this product, chosen to match what the prompt actually asks for. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 lg:pr-[132px]">
            <p className="text-[11.5px] font-medium" style={{ color: 'var(--v3-fg-muted)' }}>
              {t('v3.home.tryAsking')}
            </p>
            <div className="v3-scroll-x flex gap-2 pb-0.5">
              {QUICK_CHIPS.map(({ key, icon: ChipIcon, tone }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => ask(t(key))}
                  className="v3-chip flex flex-shrink-0 items-center gap-1.5"
                >
                  <ChipIcon size={13} aria-hidden="true" style={{ color: tone }} />
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── 2. CAPABILITIES — what the agent can actually do ──────────────
            🚨 THESE ARE THE FIVE REAL CATEGORIES, NOT AN INVENTED TAXONOMY. `CATEGORIES` in
            `src/lib/utils` is the shared vocabulary the composer, the chat route and the
            suggestion cards already use, and `CATEGORY_PREFERRED_ART` already maps one authored
            scene to each. Every card opens /chat with that category preselected.

            🚨 IMAGE ON TOP, TEXT ON THE CARD BELOW IT — the mockup's structure, and the fourth
            shape this row has taken. Dashboard cards, then bare pills, then soft bars, then a
            full-bleed image with the words scrimmed over it. The mockup does none of those: the
            scene occupies the upper band, the card's own surface carries the title and one line
            under it, and a small round chevron sits at the right. */}
        <section data-home-section="capabilities" aria-label={t('v3.home.canHelpTitle')}>
          {/* 🚨 NO HEADING. The approved mockup runs the prompt row straight into these cards —
              they are part of the hero's own offer, not a titled section of the page. The label
              this carried is an element the mockup does not have, and
              it was what made the row read as the start of a dashboard. The section keeps its
              accessible name via `aria-label`, so nothing is lost to assistive tech. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {CAPABILITIES.map(({ id, icon: Icon, descKey, tone }) => (
              <Link
                key={id}
                href={`/chat?category=${id}`}
                data-capability={id}
                className="v3-cap-card group flex flex-col overflow-hidden rounded-2xl focus-visible:outline-none focus-visible:ring-2"
              >
                <span className="relative block h-[62px] w-full flex-shrink-0 overflow-hidden">
                  {/* The authored scene this page already owns — no new asset, no photograph. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={CATEGORY_PREFERRED_ART[id]}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                  />
                  {/* A short fade into the card's surface so the image and the text below read as
                      one object rather than as a picture with a bar under it. */}
                  <span aria-hidden="true" className="v3-cap-fade absolute inset-x-0 bottom-0 h-8" />
                </span>

                <span className="flex flex-1 items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true" className="flex-shrink-0" style={{ color: tone }}>
                        <Icon size={13} />
                      </span>
                      <span className="truncate text-[12.5px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                        {t(CATEGORY_LABEL[id])}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
                      {t(descKey)}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="v3-cap-arrow flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-colors"
                    style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
                  >
                    <ArrowRight size={12} />
                  </span>
                </span>
              </Link>
            ))}
            {/* 🚨 NO ART FOR "MORE". The pool holds exactly five scenes, one per real category.
                Borrowing one would put a spa or a plane over a link to the Tools page — a picture
                that says something untrue about where it goes. Same silhouette, no scene. */}
            <Link
              href="/tools"
              data-capability="more"
              className="v3-cap-card v3-cap-card-plain group flex flex-col overflow-hidden rounded-2xl focus-visible:outline-none focus-visible:ring-2"
            >
              <span className="flex h-[62px] w-full flex-shrink-0 items-center justify-center">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
                >
                  <Plus size={17} />
                </span>
              </span>
              <span className="flex flex-1 items-center gap-2 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                    {t('v3.home.capMore')}
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
                    {t('v3.home.capMoreDesc')}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="v3-cap-arrow flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-colors"
                  style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
                >
                  <ArrowRight size={12} />
                </span>
              </span>
            </Link>
          </div>
        </section>

        {/* ── 3. Dành cho bạn — rendered ONLY when the server sent items ─── */}
        {/* ND-001: a discovery/content preview drawn from an EXISTING source, never a
            personalisation system and never fabricated. No items, no section. */}
        {suggestions.length > 0 && (
          <section data-home-section="for-you" aria-label={t('v3.home.forYouTitle')}>
            <SectionHeading title={t('v3.home.forYouTitle')} subtitle={t('v3.home.forYouSub')} action={{ label: t('v3.action.seeAll'), href: '/recommendations' }} />
            {/* Card FORMAT from the reference — dark surface, rounded, an accent icon badge at
                the top, title beneath.

                🚨 Card CONTENT stays what the server sends. The reference's cards carry place
                photographs and a "📍 Đà Lạt" line; this page has neither. `getDynamicPrompts`
                returns prompt suggestions — text, an emoji, a gradient — with no photo, no
                place and no location. Rendering a picture and a city under each one would be
                inventing content to match a mockup, so the format is reproduced and the
                fabricated parts are not. The emoji takes the icon slot. */}
            <div className="v3-scroll-x mt-3 flex gap-3.5 pb-1">
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
                    data-suggested-card={s.category}
                    href={`/chat?q=${encodeURIComponent(text)}&category=${s.category}`}
                    className="v3-tile group flex min-h-[152px] w-[210px] flex-shrink-0 flex-col overflow-hidden transition-colors lg:flex-1"
                  >
                    {/* The art. `aria-hidden` and empty alt: it is decoration behind a link whose
                        text already says where it goes, so a screen reader gains nothing from it. */}
                    <span className="relative block h-[94px] w-full flex-shrink-0 overflow-hidden">
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
                      {/* 🚨 THE CATEGORY IS A BADGE ON THE ART, WHICH IS WHERE THE MOCKUP PUTS
                          IT — it was a dotted line of text under the title. Same value, same
                          source: the category the server really sent. Still never a place, a
                          price or a rating, none of which this data has. */}
                      {CATEGORY_LABEL[s.category] && (
                        <span
                          className="absolute bottom-2 left-2.5 rounded-md px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-[0.06em] text-white backdrop-blur-sm"
                          style={{ background: 'rgba(8,11,18,0.66)' }}
                        >
                          {t(CATEGORY_LABEL[s.category])}
                        </span>
                      )}
                      <span className={cn('absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-[15px] shadow-lg', s.gradient)}>
                        {s.emoji}
                      </span>
                    </span>

                    <span className="flex flex-1 flex-col px-3 py-2.5">
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
            subtitle={t('v3.home.toolsSub')}
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
