'use client'

import { useState, useRef, useCallback } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { Camera, ImagePlus, ScanText, Copy, Check, Download, Share2, X, FileText } from 'lucide-react'

// Resize image to max 2048px before sending to API (reduces payload, faster OCR)
async function resizeImage(file: File, maxPx = 2048, quality = 0.85): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' })
    }
    img.onerror = reject
    img.src = url
  })
}

async function downloadDocx(text: string, filename: string) {
  // Dynamic import so docx (large lib) is only loaded when needed
  const { Document, Paragraph, TextRun, Packer } = await import('docx')
  const paragraphs = text.split('\n').map(line =>
    new Paragraph({ children: [new TextRun({ text: line, size: 24 })] })
  )
  const doc = new Document({ sections: [{ children: paragraphs }] })
  const blob = await Packer.toBlob(doc)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function downloadTxt(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function ScanPage() {
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((f: File) => {
    setFile(f)
    setResult('')
    setError('')
    const url = URL.createObjectURL(f)
    setPreview(url)
  }, [])

  const clearImage = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setFile(null)
    setResult('')
    setError('')
    if (cameraRef.current) cameraRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''
  }

  const scan = useCallback(async () => {
    if (!file) return
    setLoading(true)
    setError('')
    setResult('')
    try {
      const { base64, mimeType } = await resizeImage(file)
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Có lỗi xảy ra. Vui lòng thử lại.')
      else setResult(data.text)
    } catch {
      setError('Không thể kết nối. Kiểm tra mạng và thử lại.')
    } finally {
      setLoading(false)
    }
  }, [file])

  const copy = useCallback(async () => {
    if (!result) return
    await navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [result])

  const share = useCallback(async () => {
    if (!result) return
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Nội dung tài liệu — TappyAI', text: result })
        setShared(true)
        setTimeout(() => setShared(false), 2000)
      } catch { /* user cancelled */ }
    } else {
      window.location.href = `mailto:?subject=${encodeURIComponent('Nội dung tài liệu — TappyAI')}&body=${encodeURIComponent(result)}`
    }
  }, [result])

  const filename = file ? file.name.replace(/\.[^.]+$/, '') : 'tai-lieu'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <Header title="Quét tài liệu" showBack />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-5 pb-24 space-y-4">
        {/* Hero */}
        <div className="rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 p-5 text-white shadow-lg">
          <div className="text-3xl mb-2">📷</div>
          <h2 className="text-xl font-bold leading-tight">Quét & trích xuất văn bản</h2>
          <p className="text-white/70 text-sm mt-1">Chụp ảnh tài liệu — AI đọc và trích xuất toàn bộ nội dung</p>
        </div>

        {/* Image picker */}
        {!preview ? (
          <div className="grid grid-cols-2 gap-3">
            {/* Camera */}
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center gap-3 bg-white dark:bg-gray-900 border-2 border-dashed border-teal-300 dark:border-teal-700 rounded-2xl p-6 hover:border-teal-400 hover:bg-teal-50/50 dark:hover:bg-teal-900/20 transition-all"
            >
              <Camera size={32} className="text-teal-500" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Chụp ảnh</span>
              <span className="text-xs text-gray-400">Dùng camera</span>
            </button>
            {/* Gallery */}
            <button
              onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center gap-3 bg-white dark:bg-gray-900 border-2 border-dashed border-cyan-300 dark:border-cyan-700 rounded-2xl p-6 hover:border-cyan-400 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/20 transition-all"
            >
              <ImagePlus size={32} className="text-cyan-500" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Chọn ảnh</span>
              <span className="text-xs text-gray-400">Từ thư viện</span>
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden bg-black shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Preview" className="w-full max-h-72 object-contain" />
            <button
              onClick={clearImage}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Scan button */}
        {preview && (
          <button
            onClick={scan}
            disabled={loading}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-bold text-base shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Đang đọc tài liệu...
              </>
            ) : (
              <>
                <ScanText size={20} />
                Quét tài liệu
              </>
            )}
          </button>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
            <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <p className="text-xs font-semibold text-teal-500 uppercase tracking-wider mb-3">Nội dung trích xuất</p>
              <p className="text-gray-900 dark:text-white text-sm leading-relaxed whitespace-pre-wrap">{result}</p>
            </div>

            {/* Export actions */}
            <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
              <p className="text-xs text-gray-400 mb-2 font-medium">Xuất nội dung</p>
              <div className="flex flex-wrap gap-2">
                {/* Copy */}
                <button
                  onClick={copy}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    copied
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700'
                  }`}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Đã chép!' : 'Sao chép'}
                </button>

                {/* .txt */}
                <button
                  onClick={() => downloadTxt(result, `${filename}.txt`)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 text-sm font-medium transition-colors"
                >
                  <FileText size={14} />
                  .TXT
                </button>

                {/* .docx */}
                <button
                  onClick={() => downloadDocx(result, `${filename}.docx`)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 text-sm font-medium transition-colors"
                >
                  <Download size={14} />
                  .DOCX
                </button>

                {/* Share */}
                <button
                  onClick={share}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    shared
                      ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700'
                  }`}
                >
                  <Share2 size={14} />
                  {shared ? 'Đã chia sẻ!' : 'Chia sẻ'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tips */}
        {!result && !loading && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">Mẹo để đọc tốt hơn</p>
            <ul className="text-xs text-amber-600 dark:text-amber-500 space-y-1">
              <li>• Đặt tài liệu trên nền tối, chụp thẳng góc</li>
              <li>• Đảm bảo đủ ánh sáng, tránh bóng đổ</li>
              <li>• Chữ in rõ nét — hỗ trợ cả tiếng Việt và tiếng Anh</li>
              <li>• Giới hạn 20 lần quét mỗi ngày</li>
            </ul>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
