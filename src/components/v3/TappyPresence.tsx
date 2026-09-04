'use client'

import { TappyMascot, type TappyPose } from '@/components/TappyMascot'

// ── Tappy, composed rather than placed ──────────────────────────────────────
//
// The Home hero used to render `<TappyMascot />` directly, which read as exactly
// what it was: a PNG dropped into a card. This wraps the SAME asset — no new
// art, no different pose, no redraw — in the small amount of light and depth it
// needs to belong to the scene behind it.
//
// What is here, and why each thing earns its place:
//
//   · a soft radial glow, so the mascot sits IN light rather than on a surface;
//   · one thin ring, off-centre, reading as ambient depth rather than a badge;
//   · three sparkles, drawn from the brand's own accent and violet;
//   (a contact shadow used to sit here; see the note at the end for why `wave` drops it.)
//
// 🚨 RESTRAINT IS THE DESIGN. Every element is under 20% opacity and none of it
// is interactive. The brief was "premium and restrained, not a game UI" — the
// temptation is to keep adding orbits and icons until the card is a toy, and
// the mascot must never outrank the composer it sits beside.
//
// 🚨 The whole decorative layer is `aria-hidden` and sits BEHIND the mascot in
// the stacking order. It is atmosphere; it must never be announced, focusable,
// or in front of the character.
//
// 🚨 Motion is opt-out. The float and twinkle are disabled outright under
// `prefers-reduced-motion` — see the `motion-reduce:` variants. A decorative
// animation is exactly the kind that triggers vestibular symptoms, and nothing
// here carries meaning that is lost when it stops.

export interface TappyPresenceProps {
  /** Which pose from the owner's library. Home uses `wave`. */
  pose?: TappyPose
  /** Rendered size of the character itself, px. The composition scales with it. */
  size: number
  className?: string
}

export default function TappyPresence({ pose = 'wave', size, className = '' }: TappyPresenceProps) {
  // The aura is wider than the character so the light reads as coming from
  // behind it, not as a disc drawn around it.
  // Wider than before (1.5 -> 1.9): a tight halo reads as a disc BEHIND the character,
  // which is what made the old treatment look like an avatar chip. Spread out, the same
  // light reads as atmosphere the character is standing in.
  const field = Math.round(size * 1.9)

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* ── Atmosphere. Decorative, behind, never announced. ───────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2"
        style={{ width: field, height: field }}
      >
        {/* Soft light behind the character. Violet into nothing — the same
            violet the card's badge and send button already use, so the glow
            belongs to the product rather than being a new colour. */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--v3-violet) 17%, transparent) 0%, color-mix(in srgb, var(--v3-accent) 7%, transparent) 42%, transparent 74%)',
          }}
        />
        {/* 🚨 NO RING. There was a thin circle here at inset 11%, and whatever it was
            meant to be it read as an AVATAR BORDER — a small character inside a
            circular frame, which is a profile picture, not a hero visual. The glow
            alone carries the depth; a closed circle around a character always
            reads as a container. */}
        {/* Sparkles. Three, small, low, and slow — placed off the character's
            silhouette so they never sit on its face. */}
        <Sparkle className="left-[3%] top-[24%] motion-safe:animate-[tappyFloat_7s_ease-in-out_infinite]" tone="var(--v3-accent)" px={5} />
        <Sparkle className="right-[5%] top-[11%] motion-safe:animate-[tappyFloat_9s_ease-in-out_infinite_0.8s]" tone="var(--v3-violet)" px={4} />
        <Sparkle className="right-[9%] bottom-[20%] motion-safe:animate-[tappyFloat_8s_ease-in-out_infinite_1.6s]" tone="var(--v3-accent)" px={3} />
      </div>

      {/* ── The approved asset, untouched. ─────────────────────────────── */}
      <TappyMascot
        pose={pose}
        size={size}
        className="relative h-full w-full"
      />

      {/* 🚨 NO CONTACT SHADOW. There was one, and it was right for `welcome`: that pose shows the
          otter's feet, so a soft ellipse underneath read as the character standing on the card.
          `wave` is cropped at the legs — it is not standing on anything, and a ground shadow under
          a crop reads as a smudge rather than as depth. The aura and ring already carry the depth,
          which is the trade the brief asked for: the correct mascot with simpler effects beats
          effects propping up the wrong one. */
      }
    </div>
  )
}

/** One sparkle. A dot with a halo — cheaper and calmer than an icon. */
function Sparkle({ className, tone, px }: { className: string; tone: string; px: number }) {
  return (
    <span
      className={`absolute rounded-full ${className}`}
      style={{
        width: px,
        height: px,
        background: tone,
        opacity: 0.55,
        boxShadow: `0 0 ${px * 2.5}px ${px * 0.8}px color-mix(in srgb, ${tone} 45%, transparent)`,
      }}
    />
  )
}
