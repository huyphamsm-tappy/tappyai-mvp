'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { Check, Save, Loader2, Camera } from 'lucide-react'

interface ProfileData {
  full_name: string
  avatar_url: string
  email: string
  bio: string
}

export default function EditProfilePage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<ProfileData>({ full_name: '', avatar_url: '', email: '', bio: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then((data: ProfileData) => {
        setProfile(data)
      })
      .catch(() => setError('Không thể tải thông tin'))
      .finally(() => setLoading(false))
  }, [])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 3 * 1024 * 1024) {
      setError('Ảnh tối đa 3MB')
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Chỉ chấp nhận file ảnh')
      return
    }

    setPreviewUrl(URL.createObjectURL(file))
    setUploadingAvatar(true)
    setError(null)

    const formData = new FormData()
    formData.append('avatar', file)

    try {
      const res = await fetch('/api/profile', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload thất bại')
      setProfile(prev => ({ ...prev, avatar_url: data.avatar_url }))
      setPreviewUrl(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload thất bại')
      setPreviewUrl(null)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: profile.full_name, bio: profile.bio }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lưu thất bại')
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        router.push('/profile/account')
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  const displayAvatar = previewUrl || profile.avatar_url
  const firstName = profile.full_name?.split(' ').pop() || profile.email?.split('@')[0] || 'T'

  if (loading) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary-400" size={32} />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header title="Chỉnh sửa hồ sơ" showBack backHref="/profile/account" />

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            {displayAvatar ? (
              <Image
                src={displayAvatar}
                alt="Avatar"
                width={96}
                height={96}
                className={`w-24 h-24 rounded-2xl object-cover ring-2 ring-primary-100 dark:ring-primary-900 transition-opacity ${uploadingAvatar ? 'opacity-60' : ''}`}
              />
            ) : (
              <div className={`w-24 h-24 rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center transition-opacity ${uploadingAvatar ? 'opacity-60' : ''}`}>
                <span className="text-white text-4xl font-bold">{firstName[0]?.toUpperCase()}</span>
              </div>
            )}
            {uploadingAvatar && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-white drop-shadow" />
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary-500 hover:bg-primary-600 flex items-center justify-center shadow-md transition-all disabled:opacity-50"
              aria-label="Đổi ảnh đại diện"
            >
              <Camera size={15} className="text-white" />
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">Nhấn vào 📷 để đổi ảnh · Tối đa 3MB</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-2xl px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">⚠️ {error}</p>
          </div>
        )}

        {/* Form fields */}
        <div className="card p-4 space-y-4">
          {/* Email — read only */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
              Email
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex-1">{profile.email}</span>
              <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">Không thể thay đổi</span>
            </div>
          </div>

          {/* Full name */}
          <div>
            <label htmlFor="full_name" className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
              Họ và tên
            </label>
            <input
              id="full_name"
              type="text"
              value={profile.full_name}
              onChange={e => setProfile(prev => ({ ...prev, full_name: e.target.value }))}
              maxLength={100}
              placeholder="Nhập tên của bạn..."
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>

          {/* Bio */}
          <div>
            <label htmlFor="bio" className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
              Giới thiệu bản thân <span className="normal-case font-normal text-gray-400">(tuỳ chọn)</span>
            </label>
            <textarea
              id="bio"
              value={profile.bio}
              onChange={e => setProfile(prev => ({ ...prev, bio: e.target.value }))}
              maxLength={200}
              rows={3}
              placeholder="Vài dòng về bạn..."
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <p className="text-right text-xs text-gray-400 mt-1">{(profile.bio || '').length}/200</p>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || saved || uploadingAvatar}
          className={`w-full py-4 rounded-2xl font-bold text-base shadow-md transition-all flex items-center justify-center gap-2 ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-primary-500 hover:bg-primary-600 active:scale-[0.98] text-white disabled:opacity-60'
          }`}
        >
          {saving ? (
            <><Loader2 size={18} className="animate-spin" /> Đang lưu...</>
          ) : saved ? (
            <><Check size={18} /> Đã lưu!</>
          ) : (
            <><Save size={18} /> Lưu hồ sơ</>
          )}
        </button>

      </main>

      <BottomNav />
    </div>
  )
}
