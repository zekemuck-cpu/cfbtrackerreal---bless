// Card-style registry for the player-card AI prompt feature.
//
// Structure: brand → style. The `visualPrompt` block is what gets
// pasted verbatim into the image-gen prompt and is the only thing
// that determines how the card looks. Describe the *visual* (colors,
// layout, photo treatment, era cues) — never use brand names inside
// the prompt itself, since some image models refuse trademark mimicry
// and we want the cards to be ours, not knockoffs. The display label
// CAN reference the brand for the user-facing dropdown.
//
// Each style is researched-from-source: take a real card from the
// set, describe it pixel-by-pixel as if you were an art director
// briefing a photographer. Include cardstock finish, border widths,
// nameplate placement, typography style, photo crop, era-specific
// color shifts, and any signature design quirks (chrome strip,
// holo refractor, screwdown, etc.).
//
// Adding a new style: append to the appropriate brand's `styles`
// map, fill out the seven keys (label, year, eraTag, finish,
// dominantColors, visualPrompt, referenceUrls). The composer in
// buildCardPrompt.js does the rest.

export const CARD_BRANDS = {
  topps: {
    label: 'Topps',
    description: 'The default American card brand — vintage and modern alike.',
    styles: {
      stadium_club_1991: {
        label: '1991 Topps Stadium Club',
        year: 1991,
        eraTag: 'vintage glossy premium',
        finish: 'glossy edge-to-edge photo, no border',
        dominantColors: 'photo-driven, white nameplate ribbon',
        visualPrompt: `
Premium glossy cardstock, sharp 88-corner cuts. Full-bleed action photograph fills 100%
of the card front edge to edge — no inner border, no team-color frame. Photograph has
deep saturation typical of early-1990s sports photography (slight magenta shift in skin
tones, hard stadium lighting, tight-cropped on the player). Bottom-left corner: a small
white rectangular nameplate ribbon (~38% of card width, ~11% of card height) tilted
1-2 degrees, containing the player's first name in a thin condensed sans-serif drop-cap
followed by their last name in slightly bolder weight, both in deep navy. Below the
nameplate: a tiny inline tag ([CLASS] · [POSITION]) in the same navy, half the size.
Bottom-right corner: an embossed circular team-logo disc, ~14% of card width, sunk into
the photo with a subtle drop shadow. No top border, no top text, no banners across the
photo. The photo IS the design. Tiny hint of paper texture visible at the very edges
under direct light. Pristine condition; no aging or wear.
        `.trim(),
        referenceUrls: [],
      },
      topps_1989: {
        label: '1989 Topps Base',
        year: 1989,
        eraTag: 'late-80s flat matte budget',
        finish: 'matte cardstock with simple bordered photo',
        dominantColors: 'team-colored angled banner top-left',
        visualPrompt: `
Matte uncoated cardstock with the slightly fuzzy off-white tone of late-1980s gum
cards. White outer border ~3mm thick. Inside the border: a color action photograph
(square 4:5 ratio) cropped roughly chest-up, 1980s photographic style with grainy
film texture, slight cyan cast in shadows, harsh on-field flash. Across the top-left
corner of the photograph: a chunky angled banner in the team's primary color
(rotated -8°, ~50% of card width) reading the team name in white block-letter italic
display type, with a thin yellow underline. Across the bottom of the card under the
photo: a strip ~16% tall in the same team-primary color, containing the player's
name in white serif-italic display type (uppercase) on the left, and the position
abbreviation in a small white circle on the right. Between the photo and the bottom
strip: a thin black hairline. No gloss. Slight off-register printing in the team
banner (1990s offset-press flavor). No foil, no holo, no chrome.
        `.trim(),
        referenceUrls: [],
      },
      topps_chrome_modern: {
        label: 'Topps Chrome (Modern Refractor)',
        year: 2024,
        eraTag: 'modern refractor chrome',
        finish: 'mirror chrome with rainbow refractor sheen',
        dominantColors: 'spectrum refractor highlights, team accent border',
        visualPrompt: `
Mirror chrome cardstock with a true rainbow refractor finish — the entire surface
shimmers across the visible spectrum at an angle, with the strongest blue/magenta
reflections in the photo's shadows and yellow/green refraction in highlights. Full
edge-to-edge action photograph with razor-sharp focus on the player and a slightly
blurred stadium background. Around the photo: a 4mm bevelled team-color border with
a brushed-metal sheen and small triangular notches at each corner. Top of card: a
thin team-color banner (~6% height) with the team's mascot name in white compressed
sans-serif, flanked by a small chrome team-logo crest. Bottom of card: a wider
team-color strip (~14% height) with the player's full name in heavy white sans-serif
all-caps on the left, and "[CLASS] · [POSITION] · #[JERSEY]" in a thin uppercase
white sans-serif on the right. Subtle chrome reflections wrap the player's helmet
and shoulder pads. No paper texture; pure metallic shine.
        `.trim(),
        referenceUrls: [],
      },
    },
  },

  panini: {
    label: 'Panini',
    description: 'Modern American licensed cards — Prizm, Score, Donruss heritage.',
    styles: {
      prizm_silver: {
        label: 'Panini Prizm Silver',
        year: 2024,
        eraTag: 'modern holographic refractor',
        finish: 'silver-prizm holographic with diagonal foil pattern',
        dominantColors: 'silver/white prismatic, team-color accents',
        visualPrompt: `
Holographic silver Prizm finish covering the full card surface — at every angle,
the cardstock fractures light into a tight diagonal lattice pattern of silver and
white refractor flares running upper-left to lower-right. Full-bleed action
photograph filling the entire card; player is the focal point with motion blur
behind them. The photograph has a punchy modern color grade (deep blacks, vibrant
saturation, slight teal-orange cast). At the top of the card: a wide team-color
band (~9% height) with the player's school in white compressed bold italic
sans-serif. At the bottom: a matching team-color band (~13% height) divided into
two zones — left zone has the player name in an even heavier white compressed bold
italic sans-serif (player's last name larger than first), right zone has a small
chrome team-logo crest. Between the two bands and the photograph: a 1mm metallic
silver hairline. The entire card edges glint with a fine silver bevel. No paper
texture; full-bleed metallic shine.
        `.trim(),
        referenceUrls: [],
      },
      donruss_optic: {
        label: 'Donruss Optic',
        year: 2023,
        eraTag: 'modern flat-chrome',
        finish: 'matte chrome with spotlight accents',
        dominantColors: 'team primary fading to black, white hairlines',
        visualPrompt: `
Smooth matte chrome cardstock — chrome backing under a non-reflective top coat,
giving a soft satin sheen rather than mirror-bright. The card design is split
diagonally: upper-right ~60% is the player action photograph (cropped chest-up),
lower-left ~40% is a solid team-primary-color triangular wedge that fades into
deep black at the bottom corner. Between the photo and the wedge: a thin angled
white hairline at -28° from vertical. Inside the wedge: the player's last name in
huge white compressed sans-serif vertical type running corner-to-corner, with the
first name above it in smaller weight and "[CLASS] · [POSITION] · #[JERSEY]" in
a tiny line at the very bottom. The school name appears in a small horizontal
chrome-foil tag at the top-right of the photograph. Subtle radial light bloom in
the upper-right corner. No texture; clean modern flat geometry.
        `.trim(),
        referenceUrls: [],
      },
      score_1991: {
        label: '1991 Score (Vintage Premium)',
        year: 1991,
        eraTag: 'early-90s premium with full-bleed photo',
        finish: 'glossy with thin colored border',
        dominantColors: 'team-color thin double border, white inner mat',
        visualPrompt: `
Premium glossy cardstock. Thin double border running the perimeter: outer ring is
the team's primary color (~3mm), inner ring is a 1mm white hairline. Inside the
border: a near-full-bleed color action photograph from 1990s sports photojournalism
(deep saturation, slightly grainy film, hard stadium lighting). Bottom of the
photograph (overlapping it by ~12%): a thin white-on-team-color banner in serif
italic type containing the player's name (full first + last, mixed case) on the
left and the position abbreviation in a small white circle on the right. Top-left
corner: a small embossed white-circle team-logo crest. No additional text or
banners — the photograph dominates the card. Slight 90s offset-print color
mis-registration in the bordering. No paper texture visible; smooth gloss.
        `.trim(),
        referenceUrls: [],
      },
    },
  },

  upper_deck: {
    label: 'Upper Deck',
    description: 'Premium photography-first cards.',
    styles: {
      ud_1990_premier: {
        label: '1990 Upper Deck Premier',
        year: 1990,
        eraTag: 'early-90s premium photography',
        finish: 'glossy with thick white border',
        dominantColors: 'white border, team accent strip',
        visualPrompt: `
Premium glossy cardstock with a clean ~6mm white outer border. Inside the border:
a high-quality color action photograph (sharp focus, late-80s/early-90s photo style
with rich shadow detail and slightly warm white balance), cropped roughly head-to-
knees on the player. Across the bottom of the photograph (overlapping the photo's
lower 10%): a thin team-color strip (~15px tall on a standard card) bearing the
team's primary color, with the player's name in white serif italic type on the left
and the school name in smaller all-caps sans-serif on the right. Top-right corner
(outside the photo, in the white border): a small holographic team-logo hologram
disc — distinctive UD-era circular hologram that catches light at angles. Below
the photo strip: a thin team-color hairline. No additional text on the card front.
The photography is the star — deep, moody, well-composed. Smooth high-gloss finish.
        `.trim(),
        referenceUrls: [],
      },
      sp_authentic: {
        label: 'SP Authentic Modern',
        year: 2022,
        eraTag: 'modern premium with foil ribbon',
        finish: 'matte cardstock with spot-foil overlay',
        dominantColors: 'cream/ivory base, team-color foil ribbon',
        visualPrompt: `
Heavy ivory matte cardstock with a luxurious premium feel. The card design is
photograph-heavy: a sharp full-color action photograph fills the upper ~75% with
a clean modern color grade (slightly desaturated, painterly). Across the bottom
~25% on a cream-colored panel: the player's school name in foil-stamped team-color
small caps at the very top of the panel, then below it the player's name in a thin
elegant serif type (player's first name in light weight, last name in bold), then
a horizontal divider rule, then "[CLASS] · [POSITION] · #[JERSEY] · [HEIGHT] ·
[WEIGHT]" in tiny tracked uppercase serif. Top-right corner of the photograph: a
diagonal foil ribbon in team-color reading "AUTHENTIC" in subtle metallic embossed
type. Card edges have a fine foil bevel. The whole feel is editorial, museum-piece,
not flashy.
        `.trim(),
        referenceUrls: [],
      },
    },
  },

  bowman: {
    label: 'Bowman',
    description: 'Prospect-focused cards — chrome, paper, refractor.',
    styles: {
      bowman_chrome_prospect: {
        label: 'Bowman Chrome Prospect',
        year: 2024,
        eraTag: 'modern chrome prospect refractor',
        finish: 'mirror chrome with subtle refractor',
        dominantColors: 'team-color border, chrome highlights',
        visualPrompt: `
Bright mirror chrome cardstock with a subtle linear refractor pattern visible at
angle (vertical streaks). Around the perimeter: a ~4mm beveled team-primary-color
metallic border with a soft inner glow. The photo zone is a vertically-oriented
action shot framed by the border, cropped tightly on the player from helmet to
waist, with strong chrome reflections off the helmet visor and shoulder pads. Top
of photo: a thin black ribbon containing the school name in white compressed
sans-serif. Bottom of photo: a wider team-color ribbon containing the player's
name in white block-letter compressed sans-serif (last name dominant), and below
in a tiny line: "[CLASS] · [POSITION]". Bottom-right corner of the card front
(below the ribbon): a small chrome-foil "PROSPECT" tag at -12° rotation. Pure
metallic shine, no paper texture, sharp digital crispness throughout.
        `.trim(),
        referenceUrls: [],
      },
    },
  },

  custom: {
    label: 'Custom',
    description: 'Write your own visual style description.',
    styles: {
      custom_user: {
        label: 'Your Description',
        year: null,
        eraTag: 'user-defined',
        finish: 'whatever you describe',
        dominantColors: 'whatever you describe',
        visualPrompt: '', // user fills this in via a textarea on the page
        referenceUrls: [],
      },
    },
  },
}

/**
 * Quick lookup: "topps:stadium_club_1991" → the style object.
 * Pages use this so the URL/select-state can be a single string.
 */
export function getCardStyle(brandKey, styleKey) {
  return CARD_BRANDS?.[brandKey]?.styles?.[styleKey] || null
}

/**
 * For dropdowns. Returns array of { brandKey, brandLabel, styles: [...] }.
 */
export function listBrandsAndStyles() {
  return Object.entries(CARD_BRANDS).map(([brandKey, brand]) => ({
    brandKey,
    brandLabel: brand.label,
    styles: Object.entries(brand.styles).map(([styleKey, style]) => ({
      styleKey,
      styleLabel: style.label,
      year: style.year,
    })),
  }))
}
