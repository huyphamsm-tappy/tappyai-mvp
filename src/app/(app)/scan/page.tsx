'use client'

import { useState, useRef, useCallback } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import {
  Camera, ImagePlus, ScanText, Copy, Check, Download, Share2, X, FileText, Images, Languages,
  Sun, Scan, Focus, Lightbulb, AlertCircle, Sparkles, type LucideIcon,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import TappyPresence from '@/components/v3/TappyPresence'

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

/** The route's `DAILY_SCAN_LIMIT`; the tips card quotes the same number. */
const DAILY_LIMIT = 20

/**
 * Three chips, each one true of the code on this page: two file inputs (camera + gallery), the
 * Vietnamese/English claim the tips already made, and the .TXT/.DOCX export on the result card.
 * The reference's "fast" and "only you can see it" chips are speed and privacy promises the
 * request cannot make, so they are not chips.
 */
const CAPABILITIES: { key: string; icon: LucideIcon; tone: 'blue' | 'cyan' | 'orange' }[] = [
  { key: 'scan.capCapture', icon: Camera, tone: 'blue' },
  { key: 'scan.capLangs', icon: Languages, tone: 'cyan' },
  { key: 'scan.capExport', icon: FileText, tone: 'orange' },
]

/**
 * What `resizeImage` can decode through an `<img>` in every browser. HEIC and PDF are absent
 * because the page cannot read them — listing them would promise an upload that fails.
 */
const FORMATS: { label: string; tone: 'blue' | 'green' | 'violet' }[] = [
  { label: 'JPG', tone: 'blue' },
  { label: 'PNG', tone: 'green' },
  { label: 'WEBP', tone: 'violet' },
]

const TIPS: { titleKey: string; descKey: string; icon: LucideIcon }[] = [
  { titleKey: 'scan.tipLightTitle', descKey: 'scan.tipLightDesc', icon: Sun },
  { titleKey: 'scan.tipAngleTitle', descKey: 'scan.tipAngleDesc', icon: Scan },
  { titleKey: 'scan.tipSharpTitle', descKey: 'scan.tipSharpDesc', icon: Focus },
  { titleKey: 'scan.tipLangTitle', descKey: 'scan.tipLangDesc', icon: Languages },
]

export default function ScanPage() {
  const { t } = useTranslation()
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
      if (!res.ok) setError(data.message || data.error || t('scan.errorGeneric'))
      else setResult(data.text)
    } catch {
      setError(t('scan.errorNetwork'))
    } finally {
      setLoading(false)
    }
  }, [file, t])

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
        await navigator.share({ title: t('scan.shareTitle'), text: result })
        setShared(true)
        setTimeout(() => setShared(false), 2000)
      } catch { /* user cancelled */ }
    } else {
      window.location.href = `mailto:?subject=${encodeURIComponent(t('scan.shareTitle'))}&body=${encodeURIComponent(result)}`
    }
  }, [result, t])

  const filename = file ? file.name.replace(/\.[^.]+$/, '') : t('scan.defaultFilename')

  return (
    // `v3-theme` brings the shared tokens to a page that keeps its legacy header and bottom nav.
    <div className="v3-theme v3-scan-page flex min-h-dvh flex-col">
      <Header title={t('scan.headerTitle')} showBack />

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-4 pb-24 pt-5 sm:px-6 sm:pt-7" data-scan-main>
        {/* ── Hero ── */}
        <section className="v3-scan-hero" aria-labelledby="scan-hero-title" data-scan-hero>
          <div className="v3-scan-stars" aria-hidden="true" />
          <div className="flex flex-col gap-5 px-5 py-6 sm:px-8 sm:py-8 md:flex-row md:items-center md:gap-6 lg:gap-8">
            <div className="min-w-0 flex-1">
              <span className="v3-scan-eyebrow inline-flex min-h-[36px] items-center gap-2 rounded-full px-4 text-[13px] font-semibold">
                <FileText size={15} aria-hidden="true" />
                {t('scan.heroEyebrow')}
              </span>
              <h1 id="scan-hero-title" className="mt-4 text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[40px] lg:text-[46px]">
                {t('scan.heroTitle1')}{' '}
                <span className="v3-scan-hero-accent">{t('scan.heroTitle2')}</span>
              </h1>
              {/* The body describes the real flow: pick, then tap scan — the request is not automatic. */}
              <p className="v3-scan-hero-muted mt-4 max-w-[48ch] text-[14.5px] leading-relaxed sm:text-[16px]">
                {t('scan.heroBody')}
              </p>
              <ul className="mt-5 flex flex-wrap gap-2" data-scan-caps>
                {CAPABILITIES.map(c => (
                  <li key={c.key} className="v3-scan-cap" data-tone={c.tone}>
                    <span className="v3-scan-cap-icon" aria-hidden="true"><c.icon size={14} /></span>
                    {t(c.key)}
                  </li>
                ))}
              </ul>
            </div>

            {/* The scene: Tappy reading (the owner's `reading` pose — the otter with the open
                book), two document cards, sparks, and a speech bubble. Illustration only. */}
            <div className="relative mx-auto h-[250px] w-full max-w-[360px] flex-shrink-0 sm:h-[290px] md:h-[330px] md:w-[44%] md:max-w-[430px]" data-scan-scene>
              <span className="v3-scan-doc" aria-hidden="true" style={{ width: '22%', right: '8%', top: '30%', transform: 'rotate(10deg)' }}>
                <i /><i /><i />
              </span>
              <span className="v3-scan-doc" aria-hidden="true" style={{ width: '16%', right: '0%', top: '62%', transform: 'rotate(-8deg)' }}>
                <i /><i /><i />
              </span>
              <span className="v3-scan-spark" aria-hidden="true" style={{ left: '4%', top: '54%' }}><Sparkles size={22} /></span>
              <span className="v3-scan-spark" aria-hidden="true" data-tone="blue" style={{ right: '10%', top: '18%' }}><Sparkles size={16} /></span>
              <p className="v3-scan-bubble" style={{ right: '0%', top: '0%' }} data-scan-bubble>
                {t('scan.bubble1')}
                <br />
                <em>{t('scan.bubble2')}</em>
              </p>
              <div className="v3-scan-mascot absolute inset-x-0 bottom-0 flex justify-center md:justify-start md:pl-2">
                <TappyPresence pose="reading" size={300} aura="calm" className="max-h-[210px] max-w-[210px] sm:max-h-[250px] sm:max-w-[250px] md:max-h-[264px] md:max-w-[264px] lg:max-h-none lg:max-w-none" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Pick an image / preview ── */}
        {!preview ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-scan-actions>
            <button type="button" className="v3-scan-action" data-tone="blue" onClick={() => cameraRef.current?.click()} data-scan-camera>
              <span className="v3-scan-frame" aria-hidden="true">
                <i />
                <span className="v3-scan-orb"><Camera size={36} /></span>
              </span>
              <span className="v3-scan-action-title mt-4 block text-[20px] font-extrabold leading-tight sm:text-[22px]">{t('scan.cameraTitle')}</span>
              <span className="v3-scan-action-desc mt-1.5 block text-[14px]">{t('scan.cameraDesc')}</span>
              <span className="v3-scan-action-cta mt-6"><Camera size={20} aria-hidden="true" />{t('scan.cameraCta')}</span>
            </button>
            <button type="button" className="v3-scan-action" data-tone="orange" onClick={() => galleryRef.current?.click()} data-scan-gallery>
              <span className="v3-scan-frame" aria-hidden="true">
                <i />
                <span className="v3-scan-orb"><ImagePlus size={36} /></span>
              </span>
              <span className="v3-scan-action-title mt-4 block text-[20px] font-extrabold leading-tight sm:text-[22px]">{t('scan.galleryTitle')}</span>
              <span className="v3-scan-action-desc mt-1.5 block text-[14px]">{t('scan.galleryDesc')}</span>
              <span className="v3-scan-action-cta mt-6"><Images size={20} aria-hidden="true" />{t('scan.galleryCta')}</span>
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        ) : (
          <section className="v3-scan-card p-4 sm:p-5" aria-labelledby="scan-preview-title" data-scan-preview>
            <div className="flex items-center gap-3">
              <span className="v3-scan-icon-soft h-9 w-9 rounded-xl" aria-hidden="true"><ImagePlus size={18} /></span>
              <h2 id="scan-preview-title" className="v3-scan-card-title flex-1 text-[12.5px] font-bold uppercase">{t('scan.previewLabel')}</h2>
            </div>
            <div className="v3-scan-preview mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt={t('scan.previewAlt')} className="mx-auto max-h-80 w-full object-contain" />
              <button type="button" onClick={clearImage} className="v3-scan-clear" aria-label={t('scan.clearImage')} data-scan-clear>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={scan}
              disabled={loading}
              className="v3-scan-cta mt-4 flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl px-6 text-[17px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
              data-scan-submit
            >
              {loading ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                  {t('scan.scanning')}
                </>
              ) : (
                <>
                  <ScanText size={22} aria-hidden="true" />
                  {t('scan.scanButton')}
                </>
              )}
            </button>
          </section>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="v3-scan-error text-[14px]" role="alert" data-scan-error>
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p>{error}</p>
          </div>
        )}

        {/* ── Result ── */}
        {result && (
          <section className="v3-scan-card v3-scan-result p-4 sm:p-5" aria-labelledby="scan-result-title" aria-live="polite" data-scan-result>
            <div className="flex items-center gap-3">
              <span className="v3-scan-icon-soft h-9 w-9 rounded-xl" aria-hidden="true"><ScanText size={18} /></span>
              <h2 id="scan-result-title" className="v3-scan-card-title text-[12.5px] font-bold uppercase" style={{ color: 'var(--v3-accent)' }}>
                {t('scan.resultLabel')}
              </h2>
            </div>
            <p className="v3-scan-result-text mt-3 whitespace-pre-wrap text-[15px] leading-relaxed sm:text-[16px]">{result}</p>

            <p className="v3-scan-card-title mt-5 text-[12px] font-bold uppercase">{t('scan.exportLabel')}</p>
            <div className="mt-2 flex flex-wrap gap-2" data-scan-export>
              <button type="button" onClick={copy} data-done={copied} className="v3-scan-btn inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold">
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? t('scan.copied') : t('scan.copy')}
              </button>
              <button type="button" onClick={() => downloadTxt(result, `${filename}.txt`)} className="v3-scan-btn inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold">
                <FileText size={16} aria-hidden="true" />
                .TXT
              </button>
              <button type="button" onClick={() => downloadDocx(result, `${filename}.docx`)} className="v3-scan-btn inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold">
                <Download size={16} aria-hidden="true" />
                .DOCX
              </button>
              <button type="button" onClick={share} data-done={shared} className="v3-scan-btn inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold">
                <Share2 size={16} aria-hidden="true" />
                {shared ? t('scan.sharedDone') : t('scan.share')}
              </button>
            </div>
          </section>
        )}

        {/* ── Supported formats ── */}
        <section className="v3-scan-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5" aria-labelledby="scan-formats-title" data-scan-formats>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="v3-scan-icon-soft" aria-hidden="true"><FileText size={22} /></span>
            <div className="min-w-0">
              <h2 id="scan-formats-title" className="text-[16px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('scan.formatsTitle')}</h2>
              <p className="v3-scan-note mt-0.5 text-[13px]">{t('scan.formatsDesc')}</p>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2">
            {FORMATS.map(f => (
              <li key={f.label} className="v3-scan-fmt" data-tone={f.tone}>
                <span className="v3-scan-fmt-badge" aria-hidden="true">{f.label}</span>
                {f.label}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Tips ── */}
        {!result && !loading && (
          <section className="v3-scan-card p-4 sm:p-5" aria-labelledby="scan-tips-title" data-scan-tips>
            <div className="flex items-center gap-3">
              <span className="v3-scan-icon-soft h-9 w-9 rounded-xl" aria-hidden="true" style={{ color: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.14)' }}><Lightbulb size={18} /></span>
              <h2 id="scan-tips-title" className="text-[16px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('scan.tipsTitle')}</h2>
            </div>
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {TIPS.map(tip => (
                <li key={tip.titleKey} className="v3-scan-tip">
                  <span className="v3-scan-tip-icon" aria-hidden="true"><tip.icon size={20} /></span>
                  <span className="min-w-0">
                    <span className="v3-scan-tip-title block text-[14.5px] font-bold leading-tight">{t(tip.titleKey)}</span>
                    <span className="v3-scan-tip-desc mt-1 block text-[13px] leading-snug">{t(tip.descKey)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {/* The route's daily cap, quoted from DAILY_LIMIT — the only limit the page enforces. */}
            <p className="v3-scan-note mt-4 text-[13px]" data-scan-limit>{t('scan.tipLimit', { n: String(DAILY_LIMIT) })}</p>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
