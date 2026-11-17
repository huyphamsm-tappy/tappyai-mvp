// 16/11 (owner's fixed pictures): the banner of a live-information answer (gold, oil, a rate, a stock, a coin, growth, interest rates, the market), under its opening, like the mockup's picture strip.
// The picture is one of the owner's files in public/topics/, chosen by the understanding of the question from a closed list; nothing is fetched and nothing is searched. Decoration only: the figures stay in the text.
import { topicImageSrc } from '@/lib/media/topicImages'

export default function TopicBanner({ topic, variant = 0, label }: { topic: string; variant?: number; label: string }) {
  const src = topicImageSrc(topic, variant)
  if (!src) return null
  return (
    <figure data-block="topic" data-topic={topic} className="my-3 overflow-hidden rounded-2xl border border-gray-200 dark:border-sky-900/40">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} width={1536} height={512} loading="lazy" decoding="async" className="block aspect-[3/1] max-h-[190px] w-full object-cover" />
    </figure>
  )
}
