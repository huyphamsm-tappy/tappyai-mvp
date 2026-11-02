// SUBSCRIPTIONS — plan colours from Huy's mockups (Pip pink, Momo green, Coco blue, Milo violet,
// Sunny orange). Literal Tailwind class names so the build keeps them; light + dark both.
// Written by the security session (p8/subscriptions).

export interface PlanStyle {
  /** App-style list card (mockup 3): pastel in both themes, like the mockup. */
  listCard: string
  /** Plan name / price colour on light surfaces (list card, summary). */
  accentOnLight: string
  /** Plan name / price colour on the page background (web column). */
  accent: string
  /** Round arrow / CTA button. */
  button: string
  /** Web column: tinted top + border. */
  column: string
  /** Check icon colour. */
  check: string
  /** Plan detail hero (mockup 4): gradient with white text. */
  hero: string
  /** Avatar halo. */
  halo: string
}

export const PLAN_STYLE: Readonly<Record<string, PlanStyle>> = Object.freeze({
  pink: {
    listCard: 'bg-pink-100 dark:bg-pink-200',
    accentOnLight: 'text-pink-600',
    accent: 'text-pink-600 dark:text-pink-400',
    button: 'bg-pink-500 hover:bg-pink-600 text-white',
    column: 'bg-gradient-to-b from-pink-50 to-white dark:from-pink-950/70 dark:to-gray-900 border-gray-200 dark:border-gray-800',
    check: 'text-pink-500',
    hero: 'bg-gradient-to-b from-pink-400 to-pink-700',
    halo: 'bg-pink-200 dark:bg-pink-300',
  },
  green: {
    listCard: 'bg-emerald-100 dark:bg-emerald-200',
    accentOnLight: 'text-emerald-700',
    accent: 'text-emerald-600 dark:text-emerald-400',
    button: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    column: 'bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/70 dark:to-gray-900 border-gray-200 dark:border-gray-800',
    check: 'text-emerald-500',
    hero: 'bg-gradient-to-b from-emerald-400 to-emerald-700',
    halo: 'bg-emerald-200 dark:bg-emerald-300',
  },
  blue: {
    listCard: 'bg-sky-100 dark:bg-sky-200',
    accentOnLight: 'text-blue-700',
    accent: 'text-blue-600 dark:text-blue-400',
    button: 'bg-[#007AFF] hover:bg-blue-600 text-white',
    column: 'bg-gradient-to-b from-sky-50 to-white dark:from-blue-950/70 dark:to-gray-900 border-gray-200 dark:border-gray-800',
    check: 'text-blue-500',
    hero: 'bg-gradient-to-b from-sky-400 to-blue-700',
    halo: 'bg-sky-200 dark:bg-sky-300',
  },
  violet: {
    listCard: 'bg-violet-100 dark:bg-violet-200',
    accentOnLight: 'text-violet-700',
    accent: 'text-violet-600 dark:text-violet-400',
    button: 'bg-violet-500 hover:bg-violet-600 text-white',
    column: 'bg-gradient-to-b from-violet-50 to-white dark:from-violet-950/70 dark:to-gray-900 border-gray-200 dark:border-gray-800',
    check: 'text-violet-500',
    hero: 'bg-gradient-to-b from-violet-400 to-violet-700',
    halo: 'bg-violet-200 dark:bg-violet-300',
  },
  orange: {
    listCard: 'bg-orange-100 dark:bg-orange-200',
    accentOnLight: 'text-orange-600',
    accent: 'text-[#FF9500]',
    button: 'bg-[#FF9500] hover:bg-orange-600 text-white',
    column: 'bg-gradient-to-b from-orange-50 to-white dark:from-orange-950/70 dark:to-gray-900 border-[#FF9500] border-2',
    check: 'text-[#FF9500]',
    hero: 'bg-gradient-to-b from-orange-400 to-orange-800',
    halo: 'bg-orange-200 dark:bg-orange-300',
  },
})

export const planStyle = (color: string): PlanStyle => PLAN_STYLE[color] ?? PLAN_STYLE.blue
