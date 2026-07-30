// Cinematic hero backdrop — a self-contained SVG composition (no external
// assets). Layers, from back to front: a deep-blue cinematic gradient, a blue
// key light, blue/orange flowing light ribbons, a two-depth city skyline with
// window lights, a Vietnam map drawn from glowing particles on the left,
// atmospheric lighting behind the phone (right), and soft technology particles.
// Decorative only (aria-hidden, pointer-events-none). All coordinates are
// deterministic so server and client render identically (no hydration drift).

// Scattered technology particles: [cx, cy, r, opacity]
const PARTICLES: Array<[number, number, number, number]> = [
  [180, 140, 1.4, 0.5], [520, 90, 1, 0.4], [760, 140, 1.6, 0.6], [980, 92, 1.1, 0.45],
  [1180, 120, 1.3, 0.5], [1320, 180, 1, 0.4], [640, 250, 1, 0.35], [860, 300, 1.4, 0.5],
  [1080, 240, 1, 0.4], [1280, 300, 1.2, 0.45], [520, 360, 1, 0.35], [720, 420, 1.3, 0.45],
  [920, 470, 1, 0.4], [1120, 430, 1.2, 0.45], [1320, 470, 1, 0.4], [600, 560, 1, 0.35],
  [820, 620, 1.2, 0.4], [1020, 580, 1, 0.35], [1220, 620, 1.3, 0.45], [300, 300, 1, 0.3],
  [1380, 360, 1.1, 0.4], [700, 180, 1, 0.4], [1000, 660, 1.1, 0.4], [1240, 160, 0.9, 0.35],
]

// Window lights on the skyline: [cx, cy]
const WINDOWS: Array<[number, number]> = [
  [160, 674], [172, 700], [220, 654], [232, 690], [276, 700], [344, 672], [396, 700],
  [482, 662], [482, 700], [972, 690], [1032, 660], [1088, 700], [1160, 672], [1224, 700],
  [1312, 664], [1312, 700], [166, 720], [286, 716], [1096, 716], [1226, 716],
]

export default function LandingHeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 760"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="hb-base" x1="0" y1="0" x2="0.55" y2="1">
            <stop offset="0" stopColor="#0b2050" />
            <stop offset="0.5" stopColor="#08183a" />
            <stop offset="1" stopColor="#03091d" />
          </linearGradient>
          <radialGradient id="hb-blue" cx="0.16" cy="0.02" r="0.8">
            <stop offset="0" stopColor="#1f6bff" stopOpacity="0.55" />
            <stop offset="0.55" stopColor="#1f6bff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hb-orange" cx="0.83" cy="0.42" r="0.42">
            <stop offset="0" stopColor="#ff9a1f" stopOpacity="0.5" />
            <stop offset="0.62" stopColor="#ff7a00" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hb-ribbonA" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#1f6bff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#3a8bff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#8ab8ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hb-ribbonB" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ff7a00" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ff9a1f" stopOpacity="0.85" />
            <stop offset="1" stopColor="#ffd08a" stopOpacity="0" />
          </linearGradient>
          <filter id="hb-blurXL" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="34" />
          </filter>
          <filter id="hb-blurM" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <filter id="hb-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          {/* subtle darkening under the headline so text stays high-contrast */}
          <radialGradient id="hb-textguard" cx="0.26" cy="0.52" r="0.5">
            <stop offset="0" stopColor="#03091d" stopOpacity="0.42" />
            <stop offset="1" stopColor="#03091d" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* base cinematic gradient + blue key light */}
        <rect width="1440" height="760" fill="url(#hb-base)" />
        <rect width="1440" height="760" fill="url(#hb-blue)" />

        {/* flowing light ribbons */}
        <g filter="url(#hb-blurXL)">
          <path d="M -120 200 C 260 100 560 250 900 150 S 1420 210 1620 168" fill="none" stroke="url(#hb-ribbonA)" strokeWidth="66" strokeLinecap="round" opacity="0.85" />
          <path d="M -120 300 C 300 220 620 350 980 250 S 1460 300 1620 262" fill="none" stroke="url(#hb-ribbonA)" strokeWidth="32" strokeLinecap="round" opacity="0.5" />
          <path d="M -120 560 C 340 480 720 620 1120 505 S 1500 560 1620 520" fill="none" stroke="url(#hb-ribbonB)" strokeWidth="54" strokeLinecap="round" opacity="0.8" />
        </g>

        {/* city skyline — two depth layers + window lights */}
        <g opacity="0.6">
          <g fill="#12305f" filter="url(#hb-blurM)">
            <rect x="120" y="612" width="60" height="148" />
            <rect x="200" y="590" width="46" height="170" />
            <rect x="300" y="628" width="70" height="132" />
            <rect x="420" y="600" width="52" height="160" />
            <rect x="900" y="620" width="64" height="140" />
            <rect x="1010" y="596" width="48" height="164" />
            <rect x="1120" y="632" width="76" height="128" />
            <rect x="1260" y="606" width="54" height="154" />
          </g>
          <g fill="#0a1f42">
            <rect x="150" y="656" width="42" height="104" />
            <rect x="210" y="636" width="34" height="124" />
            <rect x="262" y="666" width="46" height="94" />
            <rect x="330" y="648" width="30" height="112" />
            <rect x="380" y="672" width="52" height="88" />
            <rect x="470" y="642" width="36" height="118" />
            <rect x="960" y="660" width="40" height="100" />
            <rect x="1020" y="640" width="32" height="120" />
            <rect x="1074" y="668" width="48" height="92" />
            <rect x="1150" y="648" width="30" height="112" />
            <rect x="1210" y="672" width="52" height="88" />
            <rect x="1300" y="646" width="36" height="114" />
          </g>
          <g fill="#69a0ff">
            {WINDOWS.map(([x, y], i) => (
              <rect key={i} x={x} y={y} width="2.4" height="2.4" opacity="0.75" />
            ))}
          </g>
        </g>

        {/* Vietnam map — glowing particle outline, left */}
        <g filter="url(#hb-glow)" opacity="0.85" transform="translate(120 80)">
          <path
            d="M 205 118 C 250 130 255 175 235 205 C 220 235 250 260 245 300 C 240 340 210 360 205 400 C 200 440 215 470 200 505 C 185 540 205 570 235 585 C 255 595 240 615 210 610 C 180 605 175 575 185 545 C 195 505 175 470 185 430 C 195 390 180 350 195 310 C 210 270 185 235 195 200 C 200 165 185 135 205 118 Z"
            fill="none"
            stroke="#5aa6ff"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeDasharray="0.1 12"
          />
          <circle cx="300" cy="360" r="2.1" fill="#5aa6ff" />
          <circle cx="316" cy="470" r="2.1" fill="#5aa6ff" />
          <circle cx="292" cy="524" r="1.7" fill="#5aa6ff" />
        </g>

        {/* atmospheric lighting behind the phone (right focal point) */}
        <circle cx="1180" cy="330" r="240" fill="none" stroke="#2b6fff" strokeWidth="96" opacity="0.18" filter="url(#hb-blurXL)" />
        <rect width="1440" height="760" fill="url(#hb-orange)" />

        {/* soft technology particles */}
        <g fill="#a9c8ff">
          {PARTICLES.map(([cx, cy, r, o], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} opacity={o} />
          ))}
        </g>

        {/* readability guard under the headline */}
        <rect width="1440" height="760" fill="url(#hb-textguard)" />
      </svg>
    </div>
  )
}
