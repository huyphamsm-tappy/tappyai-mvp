'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

// Finishes Zalo login on the client. The server-side callback exchanged the
// code for an access token and handed it to us in the URL fragment. Zalo only
// returns personal info (graph.zalo.me/v2.0/me) to VIETNAM IPs, so we fetch the
// profile HERE — in the user's Vietnamese browser — then post it to /complete
// which creates the session.
export default function ZaloFinishPage() {
  const [error, setError] = useState('')

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const at = params.get('at')
      const next = params.get('next') || '/'
      // iOS runs this page inside ASWebAuthenticationSession; the flow must end
      // at the app's custom scheme instead of a web redirect (see /auth/confirm).
      const platform = params.get('platform') === 'ios' ? 'ios' : 'web'
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
            zaloId: String(profile.id),
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
          <Loader2 className="animate-spin text-primary-500" size={28} />
          <p className="text-sm text-gray-500 dark:text-gray-400">Đang hoàn tất đăng nhập Zalo...</p>
        </>
      ) : (
        <p className="text-sm text-red-500 dark:text-red-400 max-w-xs">{error}</p>
      )}
    </div>
  )
}
