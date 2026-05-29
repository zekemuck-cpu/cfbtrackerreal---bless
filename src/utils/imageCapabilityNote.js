/**
 * Shared capability-check note prepended to every visual-creation prompt
 * (trading cards, score graphics, etc.).
 *
 * Some models — Claude in a plain chat, for example — can't generate real
 * raster images and will instead draw a crude SVG/vector approximation,
 * which looks terrible for a photo-realistic card or graphic. This note is
 * the first thing the model reads: if it can only produce vector/SVG/code
 * art, it should stop and point the user to a real image generator rather
 * than ship an ugly approximation.
 *
 * Kept in one place so the wording stays consistent and is easy to update.
 */
export const IMAGE_CAPABILITY_NOTE =
`IMAGE CAPABILITY CHECK — READ THIS FIRST:
This prompt asks you to generate a real, photographic-quality image. If you can ONLY produce SVG, vector, or code-drawn graphics — not genuine image generation — STOP NOW. Do not attempt an SVG or vector version; it will look crude and wrong. Instead, tell the user you can't generate real images here and point them to a dedicated image model, for example: ChatGPT (GPT-4o / DALL·E 3), Google Gemini (Imagen / "Nano Banana"), or Midjourney. Only continue past this line if you can output a true generated image.`
