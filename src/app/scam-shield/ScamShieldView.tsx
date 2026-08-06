'use client'

import { useState, useRef } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Shield, Search, QrCode, Upload, Loader2 } from 'lucide-react'
import type { CheckResult } from '@/lib/scam-shield/types'
import ScamShieldResult from './ScamShieldResult'

type Tab = 'url' | 'qr'

const ERROR_I18N: Record<string, string> = {
  rate_limit: 'scamShield.error.rateLimit',
  daily_limit: 'scamShield.error.dailyLimit',
  invalid_input: 'scamShield.error.invalidUrl',
  private_url: 'scamShield.error.privateUrl',
  check_failed: 'scamShield.error.checkFailed',
  qr_decode_failed: 'scamShield.error.qrDecode',
  qr_no_url: 'scamShield.error.qrNoUrl',
  no_image: 'scamShield.error.qrFailed',
  too_large: 'scamShield.error.qrFailed',
  invalid_content_type: 'scamShield.error.qrFailed',
}

export default function ScamShieldView() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('url')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUrlCheck() {
    if (!url.trim() || loading) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/scam-shield/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as Record<string, string>))
        const key = ERROR_I18N[data.error as string]
        setError(key ? t(key) : t('scamShield.error.checkFailed'))
        return
      }
      setResult(await res.json())
    } catch {
      setError(t('scamShield.error.invalidUrl'))
    } finally {
      setLoading(false)
    }
  }

  async function handleQrUpload(file: File) {
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch('/api/scam-shield/qr', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as Record<string, string>))
        const key = ERROR_I18N[data.error as string]
        setError(key ? t(key) : t('scamShield.error.qrFailed'))
        return
      }
      setResult(await res.json())
    } catch {
      setError(t('scamShield.error.qrDecode'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-3">
            <Shield className="w-7 h-7 text-primary-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {t('scamShield.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('scamShield.subtitle')}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-5">
          <button
            onClick={() => { setTab('url'); setResult(null); setError(null) }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === 'url'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <Search className="w-4 h-4" />
            URL
          </button>
          <button
            onClick={() => { setTab('qr'); setResult(null); setError(null) }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === 'qr'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <QrCode className="w-4 h-4" />
            QR
          </button>
        </div>

        {/* URL Input */}
        {tab === 'url' && (
          <div className="space-y-3">
            <div className="relative">
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrlCheck()}
                placeholder={t('scamShield.urlPlaceholder')}
                disabled={loading}
                className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm disabled:opacity-50"
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                </div>
              )}
            </div>
            <button
              onClick={handleUrlCheck}
              disabled={!url.trim() || loading}
              className="w-full py-3 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('scamShield.checking') : t('scamShield.check')}
            </button>
          </div>
        )}

        {/* QR Upload */}
        {tab === 'qr' && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleQrUpload(file)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              className="w-full flex flex-col items-center justify-center gap-3 py-10 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-primary-400 dark:hover:border-primary-500 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-gray-400 dark:text-gray-500" />
              )}
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {loading ? t('scamShield.checking') : t('scamShield.qrUpload')}
              </span>
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && <ScamShieldResult result={result} />}
      </div>
    </main>
  )
}
