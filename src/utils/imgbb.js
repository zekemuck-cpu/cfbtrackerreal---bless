// Backward-compat re-exports for callers that still import the
// imgbb-named helpers. The single source of truth lives in
// ./imageUpload.js — imgbb is the host again as of 2026-05-07
// (Firebase Storage egress costs on bulk photo uploads were the
// trigger). Prefer importing from `./imageUpload` in new code.

import { uploadImage, uploadImages } from './imageUpload'

export const uploadImageToImgBB = uploadImage
export const uploadImagesToImgBB = uploadImages
