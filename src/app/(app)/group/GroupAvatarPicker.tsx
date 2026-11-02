'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Users, X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { GROUP_AVATAR_ACCEPT, groupAvatarPrecheck } from '@/lib/groups/avatarClient'

/**
 * Choose / change / remove a group picture. Controlled by the parent: it owns what is saved
 * (`currentUrl`) and what is merely picked (`file`). Used by the create screen (the file is sent
 * after the group exists) and by the creator's edit control on the group page.
 */
export default function GroupAvatarPicker({
  currentUrl,
  file,
  onPick,
  busy = false,
  error,
}: {
  currentUrl?: string | null
  file: File | null
  onPick: (f: File | null) => void
  busy?: boolean
  error?: string
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const shown = preview ?? currentUrl ?? null
  const msg = localError || error || ''

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const bad = groupAvatarPrecheck(f)
    if (bad) { setLocalError(t(bad)); return }
    setLocalError('')
    onPick(f)
  }

  return (
    <div className="flex items-center gap-4" data-group-avatar-picker>
      <div className="relative h-20 w-20 shrink-0">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary-400 to-accent-400">
          {shown
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={shown} alt={t('groupNew.avatarLabel')} className="h-full w-full object-cover" data-group-avatar-img />
            : <Users className="text-white" size={30} aria-hidden="true" />}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-700 shadow ring-1 ring-gray-200 disabled:opacity-50"
          aria-label={shown ? t('groupNew.avatarChange') : t('groupNew.avatarAdd')}
          data-group-avatar-pick
        >
          <Camera size={16} aria-hidden="true" />
        </button>
        <input ref={inputRef} type="file" accept={GROUP_AVATAR_ACCEPT} className="sr-only" tabIndex={-1} onChange={onChange} data-group-avatar-input />
      </div>
      <div className="min-w-0 text-[13px]">
        <p className="font-semibold">{t('groupNew.avatarLabel')}</p>
        <p className="opacity-70">{busy ? t('groupNew.avatarUploading') : t('groupNew.avatarHint')}</p>
        {file && !busy && (
          <button type="button" onClick={() => { setLocalError(''); onPick(null) }} className="mt-1 inline-flex items-center gap-1 font-semibold underline">
            <X size={13} aria-hidden="true" />{t('groupNew.avatarRemove')}
          </button>
        )}
        {msg && <p role="alert" className="mt-1 text-red-600" data-group-avatar-error>{msg}</p>}
      </div>
    </div>
  )
}
