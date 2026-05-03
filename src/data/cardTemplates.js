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

// Holo Teal — pure-CSS card frame. No external PNG dependency: the
// composer renders the frame from the `cssFrame` config below and
// each zone draws its own styled container (banner, logo plate,
// jersey chip, etc.) so the card renders correctly regardless of
// asset hosting. Originally pointed at a placeholder ibb URL that
// never got configured, leaving cards as floating text on an empty
// background.
export const CARD_TEMPLATES = {
  holo_teal: {
    id: 'holo_teal',
    label: 'Holo Teal',
    aspectRatio: 5 / 7,
    // CSS frame: rendered by the composer instead of an <img>
    // background. Layered: deep navy base, holographic teal sheen,
    // hairline border, subtle inner shadow. Doesn't compete with the
    // photo for attention — the player is the hero.
    cssFrame: {
      background: [
        // Dim teal radial sheen behind the photo for depth
        'radial-gradient(ellipse at 50% 38%, rgba(20, 184, 166, 0.35) 0%, rgba(20, 184, 166, 0) 55%)',
        // Diagonal holographic streaks
        'linear-gradient(135deg, rgba(94, 234, 212, 0.10) 0%, rgba(15, 23, 42, 0) 35%, rgba(94, 234, 212, 0.08) 65%, rgba(15, 23, 42, 0) 100%)',
        // Base — dark navy with a subtle vertical fade
        'linear-gradient(180deg, #0b1424 0%, #0a1f2e 60%, #050d18 100%)',
      ].join(', '),
      border: '1px solid rgba(94, 234, 212, 0.28)',
      borderRadius: '14px',
      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 18px 42px rgba(0, 0, 0, 0.55)',
    },
    // Each zone: { x, y, w, h } in percentages of the card; optional
    // `rotate`, `slot`, plus a `container` style for the chip itself
    // (background/border/radius — drawn under the slot content).
    zones: [
      // Top name banner — wide teal slab with white block letters.
      {
        slot: 'last_name',
        x: 4.0, y: 4.0, w: 92.0, h: 8.5,
        textAlign: 'center',
        color: '#ffffff',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        letterSpacing: '4px',
        container: {
          background: 'linear-gradient(90deg, rgba(20, 184, 166, 0.15) 0%, rgba(20, 184, 166, 0.45) 50%, rgba(20, 184, 166, 0.15) 100%)',
          borderTop: '1px solid rgba(94, 234, 212, 0.45)',
          borderBottom: '1px solid rgba(94, 234, 212, 0.45)',
        },
      },
      // Main photo — large window with a thin teal frame and corner
      // glow. The radius matches the card's outer radius so it sits
      // cleanly inside.
      {
        slot: 'photo',
        x: 5.0, y: 15.5, w: 90.0, h: 60.0,
        objectFit: 'cover',
        radius: 8,
        container: {
          border: '1px solid rgba(94, 234, 212, 0.5)',
          boxShadow: '0 0 16px rgba(20, 184, 166, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          overflow: 'hidden',
        },
      },
      // Bottom school banner — full-width slab with the school name.
      {
        slot: 'school',
        x: 4.0, y: 78.0, w: 92.0, h: 8.5,
        textAlign: 'center',
        color: '#ffffff',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        letterSpacing: '3px',
        container: {
          background: 'linear-gradient(90deg, rgba(15, 23, 42, 0.85) 0%, rgba(20, 184, 166, 0.35) 50%, rgba(15, 23, 42, 0.85) 100%)',
          borderTop: '1px solid rgba(94, 234, 212, 0.45)',
          borderBottom: '1px solid rgba(94, 234, 212, 0.45)',
        },
      },
      // Bottom-left team logo — small white plate.
      {
        slot: 'team_logo',
        x: 5.0, y: 88.5, w: 14.0, h: 9.0,
        objectFit: 'contain',
        container: {
          background: '#ffffff',
          borderRadius: '6px',
          padding: '6%',
          border: '1px solid rgba(94, 234, 212, 0.35)',
        },
      },
      // Bottom-center jersey chip.
      {
        slot: 'jersey',
        x: 43.0, y: 88.5, w: 14.0, h: 9.0,
        textAlign: 'center',
        color: '#5eead4',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        container: {
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(94, 234, 212, 0.5)',
          borderRadius: '6px',
        },
      },
      // Bottom-right class chip.
      {
        slot: 'class',
        x: 81.0, y: 88.5, w: 14.0, h: 9.0,
        textAlign: 'center',
        color: '#5eead4',
        fontWeight: 800,
        fontFamily: "'Bebas Neue', sans-serif",
        letterSpacing: '1px',
        container: {
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(94, 234, 212, 0.5)',
          borderRadius: '6px',
        },
      },
    ],
  },

  // Holo Chrome Teal — PNG-backed template. Holographic chrome border with
  // a teal diagonal banner. The PNG carries the visual frame; data slots
  // are positioned over the gray placeholder rectangles in the template
  // and cover them entirely (so the gray never peeks through).
  //
  // Zone coordinates were measured from the 1060×1484 source PNG and
  // expressed as percentages so the same map works at any preview size.
  // Iterate the percentages here if any slot looks misaligned at render
  // time — every other instance of this template renders against the
  // same canvas dimensions.
  holo_chrome_teal: {
    id: 'holo_chrome_teal',
    label: 'Holo Chrome Teal',
    imageUrl: '/cards/templates/holo_chrome_teal.png',
    aspectRatio: 5 / 7,
    zones: [
      // Top long banner — player last name, dark text on the light-gray plate.
      {
        slot: 'last_name',
        x: 11.0, y: 3.5, w: 60.0, h: 7.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        letterSpacing: '2px',
      },
      // Top-right small box — team logo plate.
      {
        slot: 'team_logo',
        x: 79.0, y: 3.5, w: 16.0, h: 7.5,
        objectFit: 'contain',
      },
      // Top-left shield — class (Fr / So / Jr / Sr / RS Sr).
      {
        slot: 'class',
        x: 4.0, y: 13.5, w: 13.0, h: 8.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        letterSpacing: '1px',
      },
      // Center large rectangle — main photo. Slightly inset from the
      // template's photo well so the inner border stays visible.
      {
        slot: 'photo',
        x: 11.5, y: 14.5, w: 77.0, h: 56.5,
        objectFit: 'cover',
        radius: 6,
      },
      // Bottom-left hexagon — team logo.
      {
        slot: 'team_logo',
        x: 5.5, y: 78.0, w: 17.0, h: 11.5,
        objectFit: 'contain',
      },
      // Bottom-right small box on the diagonal teal banner — jersey number.
      // White text reads cleanly against the teal.
      {
        slot: 'jersey',
        x: 80.5, y: 81.0, w: 14.0, h: 7.0,
        textAlign: 'center',
        color: '#ffffff',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
      },
      // Bottom long banner — school name.
      {
        slot: 'school',
        x: 13.0, y: 91.5, w: 78.0, h: 6.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        letterSpacing: '1.5px',
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
