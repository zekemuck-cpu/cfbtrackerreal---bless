// Legacy filename — kept so existing imports don't break. The actual
// implementation now writes to Firebase Storage (see ./imageUpload.js).
// imgbb is no longer used: it was a free image host with no SLA, and
// its CDN occasionally serves a "service unavailable" placeholder for
// otherwise-valid URLs, which baked broken art into player cards.
//
// Prefer importing from `./imageUpload` directly in new code.

import { uploadImage, uploadImages } from './imageUpload'

export const uploadImageToImgBB = uploadImage
export const uploadImagesToImgBB = uploadImages
