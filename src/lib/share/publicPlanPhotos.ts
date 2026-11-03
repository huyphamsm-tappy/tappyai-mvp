// ── Gate 2 F-A-pub (P2, policy R1): plan stop photos on the PUBLIC surfaces ──────────────────────────────────────────────────────────
//
// A public snapshot (`shared_results.payload`) is frozen when it is shared. Its plan was copied from a STORED assistant reply, and a
// stored reply may carry a `photo_url` the model wrote before the egress pass removed such URLs (F-A). `sanitizePlan` keeps any https
// photo that is not a Google Places photo, so that URL is in old snapshots, and in new snapshots made from old replies — and the snapshot
// builder also copies it into `payload.images` (the hero gallery, the OG card, JSON-LD, the hub listing).
//
// Policy R1: a stop photo stays only when it is BOTH a canonical place-photo host (`isPlanPhotoUrl`, the plan-share rule) AND storable
// (`isStorableImageUrl`, which keeps the Google Places terms rule). Otherwise only the `photo_url` key goes — the stop, the day and the
// plan stay exactly as they were.
//
// Gate 2 G3 moved the implementation into publicSanitizer.ts (with the rest of the public image policy, `publicImagePolicy`), so the
// snapshot builder can apply it at write time without an import cycle. This module keeps the names Gate 2 F-A introduced.
//
// 🚨 R1 NARROWS WHERE A BROWSER CONNECTS; IT DOES NOT PROVE WHERE A PHOTO CAME FROM. `googleusercontent.com` hosts user content of many
// Google products.

export { isPublicPlanPhoto, publicPlanPhotoView, publicImagePolicy, publicFirstImage, rejectedPlanPhotos, isPublicImage } from './publicSanitizer'
