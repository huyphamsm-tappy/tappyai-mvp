import React from 'react'

interface EmoteProps {
  size?: number
}

// Shared constants
const FACE = '#FFC83D'
const STROKE = '#1a1a1a'
const SW = 2.5

/* ── Helpers ── */
const Face = ({ cx = 32, cy = 32, r = 26, fill = FACE }: { cx?: number; cy?: number; r?: number; fill?: string }) => (
  <circle cx={cx} cy={cy} r={r} fill={fill} stroke={STROKE} strokeWidth={SW} />
)
const Eye = ({ cx, cy }: { cx: number; cy: number }) => (
  <circle cx={cx} cy={cy} r={3.5} fill={STROKE} />
)
const Smile = () => (
  <path d="M22 37 Q32 46 42 37" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
)
const Grin = () => (
  <path d="M20 36 Q32 50 44 36" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
)
const Sad = () => (
  <path d="M22 42 Q32 33 42 42" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
)
const Neutral = () => (
  <line x1="22" y1="40" x2="42" y2="40" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
)

/* ── 1. Happy ── */
const Happy: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    <Eye cx={23} cy={26} />
    <Eye cx={41} cy={26} />
    <Smile />
  </svg>
)

/* ── 2. Very Happy (big grin) ── */
const VeryHappy: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    <Eye cx={23} cy={25} />
    <Eye cx={41} cy={25} />
    <path d="M20 36 Q32 52 44 36" fill={STROKE} stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <path d="M20 36 Q32 52 44 36" fill="white" stroke="none" clipPath="inset(50% 0 0 0)" />
  </svg>
)

/* ── 3. LOL (laugh eyes) ── */
const LOL: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face fill="#FFD966" />
    <path d="M19 24 Q23 20 27 24" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <path d="M37 24 Q41 20 45 24" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <path d="M18 35 Q32 52 46 35" fill={STROKE} stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    {/* tears */}
    <path d="M20 30 Q17 36 20 38" fill="none" stroke="#6CC8F5" strokeWidth={2} strokeLinecap="round" />
    <path d="M44 30 Q47 36 44 38" fill="none" stroke="#6CC8F5" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

/* ── 4. Wink ── */
const Wink: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    <Eye cx={23} cy={26} />
    {/* wink eye */}
    <path d="M38 26 Q41 23 44 26" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <Smile />
  </svg>
)

/* ── 5. Love (heart eyes) ── */
const Love: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face fill="#FFD0D0" />
    {/* heart left */}
    <path d="M23 22 C23 19 19 19 19 22 C19 25 23 28 23 28 C23 28 27 25 27 22 C27 19 23 19 23 22Z" fill="#FF6B6B" stroke="none" />
    {/* heart right */}
    <path d="M41 22 C41 19 37 19 37 22 C37 25 41 28 41 28 C41 28 45 25 45 22 C45 19 41 19 41 22Z" fill="#FF6B6B" stroke="none" />
    <Smile />
  </svg>
)

/* ── 6. Blush ── */
const Blush: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    <Eye cx={23} cy={26} />
    <Eye cx={41} cy={26} />
    {/* blush cheeks */}
    <ellipse cx={17} cy={35} rx={7} ry={4} fill="#FF9999" opacity={0.5} />
    <ellipse cx={47} cy={35} rx={7} ry={4} fill="#FF9999" opacity={0.5} />
    <Smile />
  </svg>
)

/* ── 7. Cool (sunglasses) ── */
const Cool: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    {/* sunglasses */}
    <rect x={14} y={21} width={15} height={10} rx={4} fill={STROKE} />
    <rect x={35} y={21} width={15} height={10} rx={4} fill={STROKE} />
    <line x1="29" y1="26" x2="35" y2="26" stroke={STROKE} strokeWidth={SW} />
    <line x1="8" y1="26" x2="14" y2="26" stroke={STROKE} strokeWidth={1.5} />
    <line x1="50" y1="26" x2="56" y2="26" stroke={STROKE} strokeWidth={1.5} />
    <Smile />
  </svg>
)

/* ── 8. Surprised ── */
const Surprised: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    {/* wide eyes */}
    <circle cx={23} cy={26} r={5} fill="white" stroke={STROKE} strokeWidth={SW} />
    <circle cx={41} cy={26} r={5} fill="white" stroke={STROKE} strokeWidth={SW} />
    <circle cx={23} cy={27} r={2.5} fill={STROKE} />
    <circle cx={41} cy={27} r={2.5} fill={STROKE} />
    {/* open mouth */}
    <ellipse cx={32} cy={42} rx={6} ry={5} fill={STROKE} />
  </svg>
)

/* ── 9. Sad ── */
const SadFace: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    {/* sad eyes */}
    <path d="M20 28 Q23 24 26 28" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <path d="M38 28 Q41 24 44 28" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <Sad />
  </svg>
)

/* ── 10. Cry ── */
const Cry: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    <path d="M20 28 Q23 24 26 28" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <path d="M38 28 Q41 24 44 28" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    {/* tears */}
    <path d="M22 30 Q20 38 22 42" fill="none" stroke="#6CC8F5" strokeWidth={2.5} strokeLinecap="round" />
    <path d="M42 30 Q44 38 42 42" fill="none" stroke="#6CC8F5" strokeWidth={2.5} strokeLinecap="round" />
    <Sad />
  </svg>
)

/* ── 11. Sob (ugly cry) ── */
const Sob: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face fill="#B8D4F0" />
    <path d="M19 28 Q23 23 27 28" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <path d="M37 28 Q41 23 45 28" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    {/* big tears */}
    <path d="M22 30 C18 40 18 48 22 50" fill="none" stroke="#6CC8F5" strokeWidth={3} strokeLinecap="round" />
    <path d="M42 30 C46 40 46 48 42 50" fill="none" stroke="#6CC8F5" strokeWidth={3} strokeLinecap="round" />
    <path d="M22 42 Q32 36 42 42" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
  </svg>
)

/* ── 12. Angry ── */
const Angry: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face fill="#FF6B4A" />
    {/* angry eyebrows */}
    <path d="M18 22 L27 26" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <path d="M37 26 L46 22" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <Eye cx={23} cy={29} />
    <Eye cx={41} cy={29} />
    <Sad />
    {/* steam */}
    <path d="M10 14 Q13 10 10 6" fill="none" stroke="#FF4444" strokeWidth={2} strokeLinecap="round" />
    <path d="M15 14 Q18 10 15 6" fill="none" stroke="#FF4444" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

/* ── 13. Very Angry (rage) ── */
const Rage: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face fill="#EE3333" />
    <path d="M16 21 L27 27" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
    <path d="M37 27 L48 21" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
    <Eye cx={23} cy={30} />
    <Eye cx={41} cy={30} />
    {/* gritted teeth / grimace */}
    <path d="M20 40 Q32 50 44 40" fill="white" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <line x1="26" y1="40" x2="26" y2="46" stroke={STROKE} strokeWidth={1.5} />
    <line x1="32" y1="41" x2="32" y2="48" stroke={STROKE} strokeWidth={1.5} />
    <line x1="38" y1="40" x2="38" y2="46" stroke={STROKE} strokeWidth={1.5} />
  </svg>
)

/* ── 14. Embarrassed / Sheepish ── */
const Embarrassed: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    <Eye cx={23} cy={26} />
    <Eye cx={41} cy={26} />
    <ellipse cx={16} cy={35} rx={8} ry={5} fill="#FF9999" opacity={0.6} />
    <ellipse cx={48} cy={35} rx={8} ry={5} fill="#FF9999" opacity={0.6} />
    {/* nervous smile */}
    <path d="M24 40 Q32 44 40 40" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    {/* sweat drop */}
    <path d="M48 16 Q50 12 48 9" fill="none" stroke="#6CC8F5" strokeWidth={2} strokeLinecap="round" />
    <circle cx={48} cy={9} r={2} fill="#6CC8F5" />
  </svg>
)

/* ── 15. Sick / Green ── */
const Sick: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face fill="#A8D8A0" />
    <Eye cx={23} cy={26} />
    <Eye cx={41} cy={26} />
    <Sad />
    {/* thermometer */}
    <rect x={50} y={10} width={4} height={18} rx={2} fill="white" stroke={STROKE} strokeWidth={1.5} />
    <rect x={51} y={20} width={2} height={8} fill="#FF4444" />
    <circle cx={52} cy={28} r={3} fill="#FF4444" stroke={STROKE} strokeWidth={1.5} />
  </svg>
)

/* ── 16. Sleepy / Zzz ── */
const Sleepy: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face fill="#D4BFFF" />
    {/* closed eyes */}
    <path d="M19 28 Q23 25 27 28" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <path d="M37 28 Q41 25 45 28" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <Neutral />
    {/* Zzz */}
    <text x="44" y="18" fontSize="10" fontWeight="bold" fill="#8855CC" fontFamily="sans-serif">z</text>
    <text x="50" y="13" fontSize="8" fontWeight="bold" fill="#8855CC" fontFamily="sans-serif">z</text>
  </svg>
)

/* ── 17. Thinking ── */
const Thinking: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    <Eye cx={23} cy={26} />
    <Eye cx={41} cy={26} />
    <Neutral />
    {/* thought bubble dots */}
    <circle cx={50} cy={14} r={4} fill="white" stroke={STROKE} strokeWidth={1.5} />
    <circle cx={56} cy={8} r={3} fill="white" stroke={STROKE} strokeWidth={1.5} />
    <circle cx={47} cy={20} r={2} fill="white" stroke={STROKE} strokeWidth={1.5} />
    {/* finger to chin */}
    <path d="M40 42 Q44 46 42 50" fill="none" stroke="#C8A060" strokeWidth={2.5} strokeLinecap="round" />
  </svg>
)

/* ── 18. Shocked / Mind-blown ── */
const Shocked: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face fill="#FFE566" />
    {/* raised brows */}
    <path d="M18 20 Q23 16 28 20" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <path d="M36 20 Q41 16 46 20" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <circle cx={23} cy={27} r={4.5} fill="white" stroke={STROKE} strokeWidth={SW} />
    <circle cx={41} cy={27} r={4.5} fill="white" stroke={STROKE} strokeWidth={SW} />
    <circle cx={23} cy={28} r={2} fill={STROKE} />
    <circle cx={41} cy={28} r={2} fill={STROKE} />
    <ellipse cx={32} cy={43} rx={7} ry={6} fill={STROKE} />
    {/* stars */}
    <text x="2" y="16" fontSize="12" fill="#FFD700" fontFamily="sans-serif">✦</text>
    <text x="50" y="16" fontSize="10" fill="#FFD700" fontFamily="sans-serif">✦</text>
  </svg>
)

/* ── 19. Smirk / Sly ── */
const Smirk: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    <Eye cx={23} cy={26} />
    <Eye cx={41} cy={26} />
    {/* one-sided smirk */}
    <path d="M26 40 Q34 44 40 39" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
  </svg>
)

/* ── 20. Tongue Out ── */
const TongueOut: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    <Eye cx={23} cy={25} />
    {/* wink */}
    <path d="M38 25 Q41 22 44 25" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    {/* open mouth with tongue */}
    <path d="M22 37 Q32 45 42 37" fill="white" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
    <path d="M29 43 Q32 50 35 43" fill="#FF8099" stroke={STROKE} strokeWidth={1.5} strokeLinecap="round" />
  </svg>
)

/* ── 21. Nerd / Glasses ── */
const Nerd: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face fill="#FFE566" />
    {/* big glasses frames */}
    <circle cx={22} cy={27} r={8} fill="white" stroke={STROKE} strokeWidth={2} />
    <circle cx={42} cy={27} r={8} fill="white" stroke={STROKE} strokeWidth={2} />
    <Eye cx={22} cy={27} />
    <Eye cx={42} cy={27} />
    <line x1="30" y1="27" x2="34" y2="27" stroke={STROKE} strokeWidth={2} />
    <line x1="6" y1="24" x2="14" y2="24" stroke={STROKE} strokeWidth={1.5} />
    <line x1="50" y1="24" x2="58" y2="24" stroke={STROKE} strokeWidth={1.5} />
    <Smile />
    {/* buck tooth */}
    <rect x={29} y={38} width={6} height={5} rx={1} fill="white" stroke={STROKE} strokeWidth={1.5} />
  </svg>
)

/* ── 22. Money Eyes ── */
const MoneyEyes: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face fill="#FFD966" />
    {/* $ eyes */}
    <circle cx={23} cy={26} r={6} fill="#85C85A" stroke={STROKE} strokeWidth={1.5} />
    <circle cx={41} cy={26} r={6} fill="#85C85A" stroke={STROKE} strokeWidth={1.5} />
    <text x="20" y="30" fontSize="9" fontWeight="bold" fill={STROKE} fontFamily="sans-serif">$</text>
    <text x="38" y="30" fontSize="9" fontWeight="bold" fill={STROKE} fontFamily="sans-serif">$</text>
    <Grin />
  </svg>
)

/* ── 23. Shrug ── */
const Shrug: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face />
    <Eye cx={23} cy={26} />
    <Eye cx={41} cy={26} />
    <Neutral />
    {/* raised shoulders */}
    <path d="M6 46 Q12 38 18 44" fill="none" stroke="#C8A060" strokeWidth={SW} strokeLinecap="round" />
    <path d="M46 44 Q52 38 58 46" fill="none" stroke="#C8A060" strokeWidth={SW} strokeLinecap="round" />
    {/* palms up hands */}
    <path d="M6 46 Q4 52 8 54" fill="none" stroke="#C8A060" strokeWidth={2} strokeLinecap="round" />
    <path d="M58 46 Q60 52 56 54" fill="none" stroke="#C8A060" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

/* ── 24. Party / Celebrate ── */
const Party: React.FC<EmoteProps> = ({ size = 36 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <Face fill="#FFD966" />
    <Eye cx={23} cy={26} />
    <Eye cx={41} cy={26} />
    <Grin />
    {/* party hat */}
    <path d="M32 6 L18 26 L46 26Z" fill="#FF6B9D" stroke={STROKE} strokeWidth={SW} strokeLinejoin="round" />
    <circle cx={32} cy={6} r={2.5} fill="#FFD700" />
    {/* confetti */}
    <rect x="8" y="10" width="4" height="4" rx="1" fill="#FF6B6B" transform="rotate(30 10 12)" />
    <rect x="50" y="8" width="4" height="4" rx="1" fill="#6BC8FF" transform="rotate(-20 52 10)" />
    <rect x="54" y="20" width="3" height="3" rx="1" fill="#FFD700" transform="rotate(45 55 21)" />
    <rect x="4" y="22" width="3" height="3" rx="1" fill="#85C85A" transform="rotate(15 5 23)" />
  </svg>
)

export interface Emote {
  id: string
  label: string
  emoji: string
  Component: React.FC<EmoteProps>
}

export const EMOTES: Emote[] = [
  { id: 'happy',       label: 'Vui vẻ',         emoji: '😊', Component: Happy },
  { id: 'veryhappy',   label: 'Cực vui',         emoji: '😄', Component: VeryHappy },
  { id: 'lol',         label: 'Haha',            emoji: '😂', Component: LOL },
  { id: 'wink',        label: 'Nháy mắt',        emoji: '😉', Component: Wink },
  { id: 'love',        label: 'Thương',          emoji: '😍', Component: Love },
  { id: 'blush',       label: 'Ngại ngùng',      emoji: '☺️',  Component: Blush },
  { id: 'cool',        label: 'Ngầu',            emoji: '😎', Component: Cool },
  { id: 'surprised',   label: 'Bất ngờ',         emoji: '😮', Component: Surprised },
  { id: 'sad',         label: 'Buồn',            emoji: '😢', Component: SadFace },
  { id: 'cry',         label: 'Khóc',            emoji: '😭', Component: Cry },
  { id: 'sob',         label: 'Khóc nức nở',     emoji: '😿', Component: Sob },
  { id: 'angry',       label: 'Tức',             emoji: '😤', Component: Angry },
  { id: 'rage',        label: 'Điên tiết',       emoji: '😡', Component: Rage },
  { id: 'embarrassed', label: 'Xấu hổ',          emoji: '😳', Component: Embarrassed },
  { id: 'sick',        label: 'Ốm',              emoji: '🤢', Component: Sick },
  { id: 'sleepy',      label: 'Buồn ngủ',        emoji: '😴', Component: Sleepy },
  { id: 'thinking',    label: 'Suy nghĩ',        emoji: '🤔', Component: Thinking },
  { id: 'shocked',     label: 'Sốc',             emoji: '🤯', Component: Shocked },
  { id: 'smirk',       label: 'Ranh mãnh',       emoji: '😏', Component: Smirk },
  { id: 'tongueout',   label: 'Thè lưỡi',        emoji: '😛', Component: TongueOut },
  { id: 'nerd',        label: 'Mọt sách',        emoji: '🤓', Component: Nerd },
  { id: 'moneyeyes',   label: 'Ham tiền',        emoji: '🤑', Component: MoneyEyes },
  { id: 'shrug',       label: 'Không biết',      emoji: '🤷', Component: Shrug },
  { id: 'party',       label: 'Ăn mừng',         emoji: '🥳', Component: Party },
]
