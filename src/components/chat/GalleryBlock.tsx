'use client'
// 16/11 (owner's mockup, tab 2): the pictures of what the answer is about as one mosaic under its opening - a large picture and two stacked beside it (two pictures: side by side), each with its
// name as a small mono chip at the bottom-left over a soft gradient. The MODEL named what to show; the SERVER found the pictures (answerV4/subjectImages.ts); this only draws them. VIEW ONLY.
// One picture: a wide banner. None: nothing is drawn (the answer reads as text, as before).
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

export interface GalleryShotView { caption: string; src: string | undefined }

function Shot({ s }: { s: { caption: string; src: string } }) {
  return (
    <div className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- a web picture, safe https only, no referrer */}
      <img src={s.src} alt={s.caption} loading="lazy" referrerPolicy="no-referrer" data-zoomable="true"
        onError={e => { e.currentTarget.style.setProperty('visibility', 'hidden') }} className="h-full w-full bg-gray-100 object-cover dark:bg-gray-800" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
      <span data-gallery-caption className="pointer-events-none absolute bottom-2 left-2.5 max-w-[85%] truncate rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur-sm">{s.caption}</span>
    </div>
  )
}

export default function GalleryBlock({ shots }: { shots: readonly GalleryShotView[] }) {
  const ok = shots.filter((s): s is { caption: string; src: string } => !!s.src && isSafeHttpsUrl(s.src)).slice(0, 3)
  if (ok.length < 1) return null
  // one picture the check confirmed is still worth showing: a wide banner (a wrong picture is never shown, a lone right one is)
  if (ok.length === 1) {
    return (
      <div data-block="gallery" className="my-3 h-44 overflow-hidden rounded-2xl sm:h-56">
        <Shot s={ok[0]} />
      </div>
    )
  }
  if (ok.length === 2) {
    return (
      <div data-block="gallery" className="my-3 grid h-44 grid-cols-2 gap-1 overflow-hidden rounded-2xl sm:h-56">
        <Shot s={ok[0]} />
        <Shot s={ok[1]} />
      </div>
    )
  }
  return (
    <div data-block="gallery" className="my-3 grid h-48 grid-cols-3 grid-rows-2 gap-1 overflow-hidden rounded-2xl sm:h-60">
      <div className="col-span-2 row-span-2"><Shot s={ok[0]} /></div>
      <div><Shot s={ok[1]} /></div>
      <div><Shot s={ok[2]} /></div>
    </div>
  )
}
