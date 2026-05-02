// Card template registry — preset card frames with their grey
// placeholder zones mapped to specific data slots. The composer
// (src/components/CardComposer.jsx) reads this map and overlays
// the right player/team data into each zone over the template
// background.
//
// Adding a new template:
//   1. Drop the PNG into  public/cards/templates/<name>.png
//      (or upload it elsewhere and use the full URL).
//   2. Add an entry below with `imageUrl` pointing at the asset.
//   3. Map each grey zone to a slot. Coordinates are PERCENTAGES
//      of the card's width/height (0–100). Origin is top-left.
//      Optional `rotate` is applied around the zone's center.
//   4. Pick a `slot` from the supported list. The composer renders
//      a different visual per slot type (image vs styled text).
//
// Supported slot types:
//   - 'photo'        — user's uploaded CFB 26 screenshot, object-cover
//   - 'team_logo'    — team logo from dynasty.teams[tid].logo
//   - 'player_name'  — full name, big block letters
//   - 'last_name'    — last name only, biggest size
//   - 'first_name'   — first name only
//   - 'jersey'       — "#87"
//   - 'position'     — "TE"
//   - 'class'        — "RS Sr"
//   - 'school'       — short school name (no mascot)
//   - 'team_full'    — full team name with mascot
//   - 'year'         — the season year ("2034")
//   - 'label'        — the user's optional card label

// Holo Teal — chrome refractor with teal accent ribbons. Zones
// estimated from the user-supplied template; can be fine-tuned by
// nudging the percentages once the template image is in place.
const HOLO_TEAL_IMAGE = 'https://i.ibb.co/CONFIGURE_ME/holo_teal.png'

export const CARD_TEMPLATES = {
  holo_teal: {
    id: 'holo_teal',
    label: 'Holo Teal',
    imageUrl: HOLO_TEAL_IMAGE,
    aspectRatio: 5 / 7,
    // Each zone: { x, y, w, h } in percentages of the card; optional
    // `rotate` (degrees), `slot`, `style` (text only).
    zones: [
      // Top banner — player name (long horizontal slab top center)
      {
        slot: 'last_name',
        x: 13.5, y: 4.0, w: 60.0, h: 9.0,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        autoFit: true,
        letterSpacing: '2px',
      },
      // Top-right small rounded box — team logo
      {
        slot: 'team_logo',
        x: 79.0, y: 4.0, w: 16.0, h: 9.5,
        objectFit: 'contain',
      },
      // Top-left angled shield — class
      {
        slot: 'class',
        x: 6.5, y: 14.0, w: 14.0, h: 11.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 800,
        fontFamily: "'Bebas Neue', sans-serif",
        autoFit: true,
      },
      // Main center photo zone
      {
        slot: 'photo',
        x: 8.5, y: 14.0, w: 82.0, h: 64.0,
        objectFit: 'cover',
        radius: 12,
      },
      // Bottom-left hexagon — team logo (larger emblem)
      {
        slot: 'team_logo',
        x: 6.0, y: 80.0, w: 18.5, h: 13.0,
        objectFit: 'contain',
      },
      // Bottom angled ribbon — school + position
      {
        slot: 'school',
        x: 26.0, y: 88.5, w: 49.0, h: 8.0,
        rotate: -7,
        textAlign: 'center',
        color: '#ffffff',
        fontWeight: 800,
        fontFamily: "'Bebas Neue', sans-serif",
        autoFit: true,
        letterSpacing: '1.5px',
      },
      // Bottom-right small rounded box — jersey number
      {
        slot: 'jersey',
        x: 79.0, y: 80.5, w: 16.0, h: 9.0,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        autoFit: true,
      },
    ],
  },
}

/**
 * Resolve a template by id with a graceful fallback for legacy
 * cards or missing entries.
 */
export function getCardTemplate(templateId) {
  if (!templateId) return null
  return CARD_TEMPLATES[templateId] || null
}

/** For dropdowns. */
export function listCardTemplates() {
  return Object.values(CARD_TEMPLATES).map(t => ({
    id: t.id,
    label: t.label,
    imageUrl: t.imageUrl,
  }))
}

/**
 * The default template id used when a card hasn't picked one yet
 * (for the legacy single-card migration path, or for "Add Card"
 * where the user hasn't selected one).
 */
export const DEFAULT_TEMPLATE_ID = 'holo_teal'
