'use client'

import { useState } from 'react'
import { Share2, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import ShareMenu from '@/components/share/ShareMenu'
import { emitResultAction, emitShareCreated } from '@/lib/analytics/g1Events'
import type { CheckResult } from '@/lib/scam-shield/types'

// "Cảnh báo cho mọi người" — the wedge's share-out.
//
// One tap turns the verdict into a public page (/r/<slug>) and opens the
// canonical ShareMenu with it. The server re-runs the (cached, deterministic)
// check and builds the payload itself, so nothing typed on this device is
// published; anonymous callers are allowed for exactly that reason.
export default function ScamShareButton({ result }: { result: CheckResult }) {
  const { t, locale } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [share, setShare] = useState<{ url: string; title: string } | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function publish() {
    if (share) { setOpen(true); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/scam-shield/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: result.url, locale }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.url) {
        setError(typeof body?.message === 'string' ? body.message : t('share.publishFailed'))
        return
      }
      emitShareCreated({ share_id: body.id, slug: body.slug, domain: 'scam' })
      emitResultAction({ action_type: 'share', result_id: body.id })
      setShare({ url: body.url, title: t('share.scam.title').replace('{host}', body.host) })
      setOpen(true)
    } catch {
      setError(t('share.publishFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={publish}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: 'var(--v3-accent, #F5821F)' }}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
        {t('share.scam.button')}
      </button>
      <p className="mt-1.5 text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('share.scam.hint')}</p>
      {error && <p role="status" className="mt-1 text-xs text-red-500">{error}</p>}
      {share && <ShareMenu url={share.url} title={share.title} open={open} onClose={() => setOpen(false)} />}
    </div>
  )
}
