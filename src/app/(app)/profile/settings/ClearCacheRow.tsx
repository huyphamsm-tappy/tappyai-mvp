'use client'

import { useState } from 'react'
import { HardDrive } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { clearPhotoCopies } from '@/lib/messaging/photoCache'

// Owner 21/11/2026 (after Zalo's "your storage is full" complaint): one button that frees this device's copy of Messenger pictures. Nothing is lost: the server keeps every picture and the page
// loads it again when a conversation is opened. Only this browser's cache is touched (clearPhotoCopies never throws).
export default function ClearCacheRow() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const clear = async () => {
    setBusy(true)
    setDone(false)
    await clearPhotoCopies()
    setBusy(false)
    setDone(true)
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"><HardDrive size={18} /></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{t('settings.clearCache')}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{done ? t('settings.clearCache.done') : t('settings.clearCache.desc')}</p>
      </div>
      <button type="button" onClick={clear} disabled={busy} data-clear-cache
        className="flex-shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50">
        {t('settings.clearCache.button')}
      </button>
    </div>
  )
}
