import ScamShieldView from './ScamShieldView'

// Scam Shield is a V3 destination now, so the shell comes from `V3Shell` inside the view — the
// same arrangement as Deals, Marketplace and Profile. This page previously composed `Header` +
// `BottomNav` by hand, which is what left it looking like a page from the previous design while
// its own sidebar entry sat inside the V3 rail. `V3Shell` renders both (BottomNav below `lg`).
//
// The check itself is unchanged: the view is a client of POST /api/scam-shield/check and /qr,
// the same endpoints Android and iOS consume.
export default function ScamShieldPage() {
  return <ScamShieldView />
}
