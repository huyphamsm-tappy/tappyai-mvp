// 16/11 (owner): the fixed pictures for LIVE-information topics whose nature never changes with a brand or a style (gold, oil, a rate of exchange, a stock, a coin, growth figures, interest rates, the
// market): a banner under the opening of the answer. A CLOSED list: the understanding of the question picks one of these or none, never anything else. Each topic has one or more pictures that take
// turns, so the page does not look the same every time; the turn picks one when the answer ends and the pick is stored with the message. The files are the owner's, 1536x512 webp, in public/topics/:
// topic-<key>.webp is the first picture of a topic, topic-<key>-<n>.webp the next ones.
export const TOPIC_KEYS = ['gold', 'oil', 'currency', 'stocks', 'crypto', 'growth', 'rates', 'markets'] as const
export type TopicKey = (typeof TOPIC_KEYS)[number]

/** How many pictures each topic has in public/topics/. Add a file, raise its count here; nothing else changes. */
export const TOPIC_VARIANTS: Readonly<Record<TopicKey, number>> = { gold: 2, oil: 2, currency: 3, stocks: 2, crypto: 2, growth: 1, rates: 1, markets: 2 }

/** The topics that have at least one picture. */
export const TOPIC_IMAGES_AVAILABLE: ReadonlySet<TopicKey> = new Set<TopicKey>(TOPIC_KEYS.filter(k => TOPIC_VARIANTS[k] > 0))

export const isTopicKey = (x: unknown): x is TopicKey => typeof x === 'string' && (TOPIC_KEYS as readonly string[]).includes(x)

/** A picture number that exists for the topic (0 = the first); anything else falls back to the first. */
export const topicVariantOf = (topic: TopicKey, variant: unknown): number =>
  typeof variant === 'number' && Number.isInteger(variant) && variant >= 0 && variant < TOPIC_VARIANTS[topic] ? variant : 0

/** One picture for a topic turn, by a random number in [0, 1). */
export const pickTopicVariant = (topic: TopicKey, random: () => number = Math.random): number => {
  const n = TOPIC_VARIANTS[topic]
  const r = random()
  return n > 1 && r >= 0 && r < 1 ? Math.floor(r * n) : 0
}

/** The picture to draw for `topic` and `variant`, or null (not a topic, or no picture for it). */
export const topicImageSrc = (topic: unknown, variant: unknown = 0): string | null => {
  if (!isTopicKey(topic) || TOPIC_VARIANTS[topic] < 1) return null
  const v = topicVariantOf(topic, variant)
  return v === 0 ? `/topics/topic-${topic}.webp` : `/topics/topic-${topic}-${v}.webp`
}
