'use client'

import { useId } from 'react'
import { TappyMascot, type TappyPose } from '@/components/TappyMascot'

// ── Tappy, composed rather than placed ──────────────────────────────────────
//
// The Home hero used to render `<TappyMascot />` directly, which read as exactly
// what it was: a PNG dropped into a card. This wraps the SAME asset — no new
// art, no different pose, no redraw — in the light and depth the approved
// reference puts around the character.
//
// 🔑 BUILT AGAINST THE REFERENCE IMAGE, not from taste. The owner supplied it in
// review as `docs/design/reference/tappy-home-mascot.png` — NOTE that no such file
// is committed to this repository, so the description below is the record. It shows,
// behind the character:
//
//   · a WIDE TILTED ORBITAL ELLIPSE — violet on one side running to blue on the
//     other, sweeping behind the head and off both edges of the frame;
//   · scattered glowing particles at mixed sizes, plus a few four-point stars;
//   · a violet bloom concentrated behind the character, falling to near-black;
//   · the character on the RIGHT, with the left side left dark for the text.
//
// 🚨 THE ORBIT IS AN ELLIPSE, NOT A CIRCLE. An earlier version drew a thin circle
// at inset 11% and it read as an AVATAR BORDER — a small character inside a
// frame, which is a profile picture. What the reference shows is the opposite: a
// wide arc that is much bigger than the character and leaves the frame, so it
// reads as something the character is standing IN rather than a chip it sits in.
// If this ever narrows back toward the silhouette, it becomes an avatar again.
//
// 🚨 The whole decorative layer is `aria-hidden` and sits BEHIND the mascot in
// the stacking order. It is atmosphere; it must never be announced, focusable,
// or in front of the character.
//
// 🚨 Motion is opt-out — the float is `motion-safe:` only. A decorative animation
// is exactly the kind that triggers vestibular symptoms, and nothing here carries
// meaning that is lost when it stops.

export interface TappyPresenceProps {
  /** Which pose from the owner's library. Home uses `wave`. */
  pose?: TappyPose
  /** Rendered size of the character itself, px. The composition scales with it. */
  size: number
  className?: string
}

export default function TappyPresence({ pose = 'wave', size, className = '' }: TappyPresenceProps) {
  // 🚨 `useId`, not a constant: Home mounts THREE of these (one per breakpoint), so a
  // hardcoded gradient id would be duplicated three times in one document. Browsers
  // resolve a duplicate id to the first match, which happens to look right — until the
  // first instance is the hidden one and the visible orbit silently loses its gradient.
  const gid = useId().replace(/:/g, '')

  // The field the atmosphere occupies. Much wider than the character, per the reference.
  const field = Math.round(size * 1.9)
  // The orbit is wider still and deliberately runs past the field: the reference's arc
  // leaves the frame on both sides. The hero card clips it.
  const orbitW = Math.round(size * 2.55)
  const orbitH = Math.round(size * 1.32)

  // 🚨 NO ORBIT ON THE SMALL INSTANCE. The reference is a DESKTOP hero: the arc has room to
  // sweep out of frame past a character that owns its own column. On a 375px card the same
  // arc is 224px wide against an 88px character, so it swept back across the greeting and the
  // subtitle — decoration crossing the copy. Below this size the bloom and particles carry the
  // atmosphere alone, which is an adaptation rather than a shrunken desktop layout.
  const showOrbit = size >= 110

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
        {/* The bloom: violet close in, a hint of the brand blue further out, then
            nothing. Offset slightly up and left of centre, as the reference has it —
            the light comes from behind the character's shoulder, not from dead centre. */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle at 46% 40%, color-mix(in srgb, var(--v3-violet) 26%, transparent) 0%, '
              + 'color-mix(in srgb, var(--v3-accent) 10%, transparent) 40%, transparent 72%)',
          }}
        />

        {/* The orbit. Drawn as SVG so the stroke can carry a gradient and stay 1px
            crisp at any size — a CSS border can do neither. */}
        {showOrbit && (
        <svg
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
          width={orbitW}
          height={orbitH}
          viewBox={`0 0 ${orbitW} ${orbitH}`}
          fill="none"
        >
          <defs>
            <linearGradient id={`orbit-${gid}`} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--v3-violet)" stopOpacity="0" />
              <stop offset="28%" stopColor="var(--v3-violet)" stopOpacity="0.75" />
              <stop offset="62%" stopColor="var(--v3-accent)" stopOpacity="0.85" />
              <stop offset="100%" stopColor="var(--v3-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Tilted, and wider than it is tall — an orbit seen near-edge-on. */}
          <ellipse
            cx={orbitW / 2}
            cy={orbitH / 2}
            rx={orbitW / 2 - 2}
            ry={orbitH / 2 - 2}
            stroke={`url(#orbit-${gid})`}
            strokeWidth="1.5"
            transform={`rotate(-16 ${orbitW / 2} ${orbitH / 2})`}
          />
        </svg>
        )}

        {/* Particles. Mixed sizes and two colours, scattered off the silhouette so
            none of them lands on the character's face. */}
        {showOrbit && (
          <Dot className="left-[2%] top-[30%] motion-safe:animate-[tappyFloat_7s_ease-in-out_infinite]" tone="var(--v3-accent)" px={5} />
        )}
        {showOrbit && (
          <Dot className="left-[16%] bottom-[16%] motion-safe:animate-[tappyFloat_11s_ease-in-out_infinite_1.2s]" tone="var(--v3-violet)" px={3} />
        )}
        <Dot className="right-[4%] top-[22%] motion-safe:animate-[tappyFloat_9s_ease-in-out_infinite_0.8s]" tone="var(--v3-violet)" px={4} />
        <Dot className="right-[14%] bottom-[24%] motion-safe:animate-[tappyFloat_8s_ease-in-out_infinite_1.6s]" tone="var(--v3-accent)" px={3} />

        {/* Four-point stars — the reference has a couple of these among the dots. */}
        {showOrbit && (
          <Star className="left-[9%] top-[16%] motion-safe:animate-[tappyFloat_10s_ease-in-out_infinite_0.4s]" px={13} />
        )}
        <Star className="right-[9%] top-[46%] motion-safe:animate-[tappyFloat_12s_ease-in-out_infinite_2s]" px={9} />
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
          a crop reads as a smudge rather than as depth. The reference has none either: the
          character floats in the orbit. */}
    </div>
  )
}

/** A glowing particle. A dot with a halo — cheaper and calmer than an icon. */
function Dot({ className, tone, px }: { className: string; tone: string; px: number }) {
  return (
    <span
      className={`absolute rounded-full ${className}`}
      style={{
        width: px,
        height: px,
        background: tone,
        opacity: 0.6,
        boxShadow: `0 0 ${px * 2.5}px ${px * 0.8}px color-mix(in srgb, ${tone} 45%, transparent)`,
      }}
    />
  )
}

/** A four-point star, as the reference scatters among the dots. */
function Star({ className, px }: { className: string; px: number }) {
  return (
    <svg
      className={`absolute ${className}`}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      style={{ opacity: 0.75, filter: 'drop-shadow(0 0 4px color-mix(in srgb, var(--v3-accent) 70%, transparent))' }}
    >
      {/* Concave diamond: the classic sparkle silhouette, drawn rather than imported. */}
      <path
        d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z"
        fill="#E8F1FF"
      />
    </svg>
  )
}
