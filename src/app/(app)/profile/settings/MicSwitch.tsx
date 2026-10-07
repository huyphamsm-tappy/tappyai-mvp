'use client'

import { useEffect, useState } from 'react'
import { Mic } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { MIC_ENABLED_KEY, readMicEnabled } from '@/lib/voice/micSetting'

// Web-only switch (owner 01/10, C5): the in-app microphone permission is ON by default and can be turned off here.
// The operating system still shows its own prompt on first use — that cannot be pre-granted from a web page.
export default function MicSwitch() {
  const { t } = useTranslation()
  const [on, setOn] = useState(true)
  useEffect(() => { setOn(readMicEnabled()) }, [])
  const flip = () => {
    const next = !on
    setOn(next)
    try { localStorage.setItem(MIC_ENABLED_KEY, next ? '1' : '0') } catch { /* storage blocked: the switch just does not persist */ }
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"><Mic size={18} /></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{t('settings.mic')}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.mic.desc')}</p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={t('settings.mic')} onClick={flip} data-mic-switch
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${on ? 'bg-[#3391FF]' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}
