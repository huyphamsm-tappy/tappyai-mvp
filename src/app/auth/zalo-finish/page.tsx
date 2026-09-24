'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

// Finishes Zalo login on the client. The server-side callback exchanged the
// code for an access token and handed it to us in the URL fragment. Zalo only
// returns personal info (graph.zalo.me/v2.0/me) to VIETNAM IPs, so we fetch the
// profile HERE — in the user's Vietnamese browser — then post it to /complete
// which creates the session.
//
// 🚨 R-1: WHAT THIS PAGE SENDS IS DISPLAY DATA, NOT IDENTITY. `zaloId` used to travel in this
// body and decide which account /complete logged you into — so this page, which runs on the
// user's machine, chose the account. It no longer sends an id at all: /complete resolves the
// Zalo user id from the httpOnly `zalo_at` cookie against Zalo itself. Do not add one back;
// `name` and `avatar` are cosmetic metadata for a newly created user and nothing else.
export default function ZaloFinishPage() {
  const [error, setError] = useState('')

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const at = params.get('at')
      const next = params.get('next') || '/'
      // Native app (iOS ASWebAuthenticationSession / Android Custom Tab): the flow
      // must end at the app's custom scheme instead of a web redirect (see /auth/confirm).
      const platformParam = params.get('platform')
      const platform = platformParam === 'ios' ? 'ios' : platformParam === 'android' ? 'android' : 'web'
      // 🚨 The access token is now in memory; get it OUT of the address bar before anything else
      // runs: the address bar, screenshots, the back/forward entry and any extension that reads
      // `location` afterwards. replaceState, not pushState, so no session-history entry keeps it.
      // ⚠️ This does NOT reliably remove it from the browser's History database: Chrome records
      // the URL when the navigation commits, before this runs — which is exactly where a token
      // was recovered from during the 2026-09-24 region test. Mitigation only. The real fix (next
      // round, once zalo-verify runs): the callback finishes server-side and the token never
      // reaches the browser; this page and the fragment go away.
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
      if (!at) { window.location.replace('/login?error=zalo_failed'); return }

      try {
        const r = await fetch(`https://graph.zalo.me/v2.0/me?fields=id,name,picture&access_token=${encodeURIComponent(at)}`, {
          headers: { access_token: at },
        })
        const profile = await r.json()
        if (!profile?.id) throw new Error(profile?.message || 'no profile')

        const res = await fetch('/api/auth/zalo/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: profile.name,
            avatar: profile.picture?.data?.url ?? null,
            next,
            platform,
          }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.confirmUrl) throw new Error(data?.error || 'complete_failed')

        window.location.replace(data.confirmUrl)
      } catch {
        setError('Đăng nhập Zalo chưa thành công. Đang đưa bạn về trang đăng nhập...')
        setTimeout(() => window.location.replace('/login?error=zalo_failed'), 2500)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-950 px-6 text-center">
      {!error ? (
        <>
          <Loader2 className="animate-spin text-link" size={28} />
          <p className="text-sm text-content-secondary">Đang hoàn tất đăng nhập Zalo...</p>
        </>
      ) : (
        <p className="text-sm text-red-500 dark:text-red-400 max-w-xs">{error}</p>
      )}
    </div>
  )
}
