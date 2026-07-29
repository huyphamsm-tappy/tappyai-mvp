'use client'

import Image from 'next/image'
import LandingSection from './LandingSection'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { GALLERY_SCREENSHOTS } from './config'

export default function LandingScreenshots() {
  const { t } = useTranslation()

  return (
    <LandingSection
      id="screenshots"
      titleKey="landing.shots.title"
      introKey="landing.shots.caption"
    >
      <ul className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4">
        {GALLERY_SCREENSHOTS.map((shot) => (
          <li key={shot.key}>
            <figure>
              <div className="overflow-hidden rounded-3xl border border-white/15 bg-gray-900">
                <Image
                  src={shot.src}
                  alt={t(`landing.shots.${shot.key}.alt`)}
                  width={shot.width}
                  height={shot.height}
                  loading="lazy"
                  sizes="(min-width: 1024px) 15rem, 45vw"
                  className="h-auto w-full"
                />
              </div>
              <figcaption className="mt-3 text-center text-sm font-medium text-gray-400">
                {t(`landing.shots.${shot.key}.label`)}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </LandingSection>
  )
}
