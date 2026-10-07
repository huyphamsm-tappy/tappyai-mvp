// Does the EXISTING server path (avatars, covers, review photos → stripImageMetadata) remove GPS?
import { stripImageMetadata } from '../../../../src/lib/media/stripImageMetadata'
import { sniffImageType } from '../../../../src/lib/security/imageType'
import { syntheticGpsJpeg, jpegMetadata } from './gps.mjs'
const jpg = await syntheticGpsJpeg()
const kind = sniffImageType(new Uint8Array(jpg))
const out = (await stripImageMetadata(new Uint8Array(jpg), kind!)).bytes
console.log(JSON.stringify({ before: await jpegMetadata(jpg), after: await jpegMetadata(Buffer.from(out)) }))
