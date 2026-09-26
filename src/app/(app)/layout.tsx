import LocationProvider from '@/components/LocationProvider'
import LanguagePicker from '@/components/LanguagePicker'
import { APP_SURFACE_ATTR } from '@/lib/i18n/appSurface'

// ── The signed-in product's side of the public / app boundary ────────────────
//
// Everything under `src/app/(app)/` is the app: Home, Chat, the tools, profile, admin,
// onboarding. Only these routes get the first-visit gates:
//
//   · LocationProvider — asks for GPS on arrival so "near me" answers work;
//   · LanguagePicker   — the first-visit "Chọn ngôn ngữ / Choose your language" modal.
//
// Routes OUTSIDE `(app)` (a shared plan, a public result, a review/clip, a public profile, the
// hubs, Scam Shield, legal pages, login) never render this layout, so a stranger who opens a
// shared link sees the page and nothing else. That is the default: a new page is public-safe
// unless it is deliberately placed in this folder. The route group changes no URL.
//
// Age gates and login walls stay where they already are — in the (app) pages that need them —
// and `src/app/publicBoundary.test.ts` fails if any public route ever imports or mounts one.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Tells the client i18n store it is inside the app, where the product default ('vi')
          applies until the person picks a language in the modal below. Public pages have no
          marker and follow the browser's language instead. Server-rendered, so it is in the
          DOM before hydration reads the locale. */}
      <span hidden {...{ [APP_SURFACE_ATTR]: '' }} />
      {children}
      <LocationProvider />
      <LanguagePicker />
    </>
  )
}
