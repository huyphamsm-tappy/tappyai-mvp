// What a Messenger picture may be — the part the BROWSER also needs (no server imports here, so a client component can use it). The server re-checks everything:
// the real type by its magic bytes, the size, and the metadata (src/lib/messaging/media.ts, the upload route). This only saves a round trip with a clear message.

/** The same ceiling as the bucket's file_size_limit. */
export const CHAT_MEDIA_MAX_BYTES = 5 * 1024 * 1024

/** The types the picker offers and the browser pre-checks (GIF is not one: it cannot be re-encoded without risk, so it carries its metadata). */
export const CHAT_MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
