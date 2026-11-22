'use client'

// The consent screen of the Tappy connector (MCP). Supabase's OAuth server sends a signed-in person here with ?authorization_id=…; they see WHICH AI wants access and WHAT it may do,
// and choose Allow or Deny. Nothing is granted by loading the page. UNVERIFIED against a live Supabase OAuth server (see consentView.ts).
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isAnonymousUser } from '@/lib/auth/socialWriteAccess'
import { loginPathFor } from '@/lib/auth/returnTo'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { isAuthorizationId, safeOAuthRedirect, scopeLines } from '@/lib/mcp/consentView'
import { CONSENT_COPY } from '@/lib/i18n/mcpConsent'
import { TappyMascot } from '@/components/TappyMascot'

type Details = { authorization_id: string; client: { name: string }; scope: string; user: { email: string } }
type State = { kind: 'loading' } | { kind: 'invalid' } | { kind: 'error' } | { kind: 'ask'; d: Details } | { kind: 'sending' }

export default function ConsentView() {
  const { locale } = useTranslation()
  const c = CONSENT_COPY[locale === 'en' ? 'en' : 'vi']
  const params = useSearchParams()
  const id = params.get('authorization_id')
  const [state, setState] = useState<State>({ kind: 'loading' })

  // ONE look at the request per authorization id. Found on the real Supabase server (22/11/2026): when the person has already allowed this app, the FIRST details call returns the redirect (with the code) and
  // any SECOND call answers 400 "cannot be processed". React runs an effect twice in development (and a re-render can repeat it), so the result of the first call must never be thrown away: no `alive`
  // flag, and a ref guard so the same id is never asked twice.
  const askedFor = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (askedFor.current === id) return
    askedFor.current = id
    ;(async () => {
      if (!isAuthorizationId(id)) { setState({ kind: 'invalid' }); return }
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      // not signed in (or only a guest): sign in first, then come back to this exact request
      if (!user || isAnonymousUser(user)) { window.location.assign(loginPathFor(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`)); return }
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id)
      if (error || !data) { setState({ kind: 'invalid' }); return }
      if ('redirect_url' in data) { // already consented: go straight back
        const to = safeOAuthRedirect(data.redirect_url)
        if (to) { setState({ kind: 'sending' }); window.location.assign(to) } else setState({ kind: 'error' })
        return
      }
      setState({ kind: 'ask', d: data as unknown as Details })
    })().catch(() => setState({ kind: 'error' }))
  }, [id])

  async function decide(approve: boolean) {
    if (state.kind !== 'ask') return
    const d = state.d
    setState({ kind: 'sending' })
    const supabase = createClient()
    const res = approve ? await supabase.auth.oauth.approveAuthorization(d.authorization_id, { skipBrowserRedirect: true }) : await supabase.auth.oauth.denyAuthorization(d.authorization_id, { skipBrowserRedirect: true })
    const to = res.error || !res.data ? null : safeOAuthRedirect(res.data.redirect_url)
    if (to) window.location.assign(to)
    else setState({ kind: 'error' })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 py-10 text-center" data-testid="oauth-consent">
      <TappyMascot pose="recommendation" size={96} />
      {state.kind === 'loading' && <p>{c.loading}</p>}
      {state.kind === 'sending' && <p>{c.sending}</p>}
      {state.kind === 'invalid' && <p role="alert">{c.invalid}</p>}
      {state.kind === 'error' && <p role="alert">{c.error}</p>}
      {state.kind === 'ask' && (
        <>
          <h1 className="text-xl font-bold">{c.title}</h1>
          <p>{state.d.client?.name?.slice(0, 80) || c.unknownApp} {c.wantSuffix} <strong>{state.d.user?.email}</strong></p>
          <p className="font-semibold">{c.may}</p>
          <ul className="space-y-1 text-left text-sm" data-testid="oauth-scopes">
            {scopeLines(state.d.scope, locale === 'en' ? 'en' : 'vi').map(l => <li key={l}>• {l}</li>)}
          </ul>
          <p className="text-xs text-content-secondary">{c.safe}</p>
          <div className="flex w-full gap-3">
            <button type="button" onClick={() => decide(false)} className="flex-1 rounded-xl border px-4 py-3 font-semibold" data-testid="oauth-deny">{c.deny}</button>
            <button type="button" onClick={() => decide(true)} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white" data-testid="oauth-allow">{c.allow}</button>
          </div>
        </>
      )}
    </main>
  )
}
