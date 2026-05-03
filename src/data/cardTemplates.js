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

  // Chrome Gold — ornate art-deco silver/gold frame. The most decorative
  // template; rich metallic detail with a curved tray at the bottom and a
  // pointed shield at the very top. No team-color zones (pure decorative
  // frame). Photo well is generous, leaving room for the player to be the
  // hero.
  chrome_gold: {
    id: 'chrome_gold',
    label: 'Chrome Gold',
    imageUrl: '/cards/templates/chrome_gold.png',
    aspectRatio: 5 / 7,
    zones: [
      // Top-center pointed shield — position chip.
      {
        slot: 'position',
        x: 46.0, y: 2.5, w: 11.0, h: 5.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
      },
      // Top-right small angled box — team logo.
      {
        slot: 'team_logo',
        x: 83.0, y: 4.0, w: 14.0, h: 7.5,
        objectFit: 'contain',
      },
      // Wide hexagonal banner across the top — last name.
      {
        slot: 'last_name',
        x: 24.0, y: 9.5, w: 52.0, h: 6.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        letterSpacing: '2px',
      },
      // Center photo — generous, slightly inset from the metallic frame.
      {
        slot: 'photo',
        x: 18.5, y: 19.0, w: 63.0, h: 55.0,
        objectFit: 'cover',
        radius: 4,
      },
      // Bottom-left small shield — class.
      {
        slot: 'class',
        x: 1.0, y: 51.5, w: 11.0, h: 7.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
      },
      // Mid-right hexagon — second team logo emblem.
      {
        slot: 'team_logo',
        x: 86.5, y: 64.0, w: 11.5, h: 8.0,
        objectFit: 'contain',
      },
      // Bottom banner inside the curved tray — school name.
      {
        slot: 'school',
        x: 16.0, y: 90.5, w: 57.0, h: 5.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        letterSpacing: '2px',
      },
      // Small box right of the curved tray — jersey number.
      {
        slot: 'jersey',
        x: 76.0, y: 89.0, w: 10.0, h: 6.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
      },
    ],
  },

  // Crystal Holo — full holographic crystal/diamond frame. No teal accents,
  // pure rainbow refractor borders. Both top and bottom have arrow-tip
  // banners; the symmetry is the defining trait. No team-color zones.
  crystal_holo: {
    id: 'crystal_holo',
    label: 'Crystal Holo',
    imageUrl: '/cards/templates/crystal_holo.png',
    aspectRatio: 5 / 7,
    zones: [
      // Top arrow-tipped banner — last name.
      {
        slot: 'last_name',
        x: 17.0, y: 3.5, w: 58.0, h: 7.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        letterSpacing: '2px',
      },
      // Top-right small box — team logo.
      {
        slot: 'team_logo',
        x: 80.5, y: 3.5, w: 14.0, h: 7.5,
        objectFit: 'contain',
      },
      // Center photo — slightly cropped at the corners (template has
      // angled cuts at the top corners of the photo well).
      {
        slot: 'photo',
        x: 13.0, y: 14.0, w: 73.0, h: 56.0,
        objectFit: 'cover',
        radius: 4,
      },
      // Mid-left small shield — class.
      {
        slot: 'class',
        x: 4.5, y: 50.5, w: 10.5, h: 7.0,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
      },
      // Mid-right hexagon — jersey number.
      {
        slot: 'jersey',
        x: 75.0, y: 63.5, w: 12.0, h: 8.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
      },
      // Bottom arrow-tipped banner (mirrors the top one) — school name.
      {
        slot: 'school',
        x: 17.0, y: 89.0, w: 58.0, h: 7.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        letterSpacing: '2px',
      },
    ],
  },

  // Vector Teal — bold black/white/teal modern. The diagonal teal banners
  // (bottom and partway up the right side) are the team-color identity
  // areas — same template, different team color reads as a distinct card.
  // For v1 the teal stays as teal; tint-zone overlay support is a v2.
  vector_teal: {
    id: 'vector_teal',
    label: 'Vector Teal',
    imageUrl: '/cards/templates/vector_teal.png',
    aspectRatio: 5 / 7,
    zones: [
      // Top-left shield — class.
      {
        slot: 'class',
        x: 4.0, y: 4.0, w: 11.0, h: 8.0,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
      },
      // Top long angled banner — last name.
      {
        slot: 'last_name',
        x: 18.0, y: 4.0, w: 60.0, h: 7.0,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        letterSpacing: '2px',
      },
      // Top-right small angled box — team logo.
      {
        slot: 'team_logo',
        x: 82.0, y: 3.5, w: 13.0, h: 8.5,
        objectFit: 'contain',
      },
      // Center photo — large, with the template's slight diagonal cut at
      // the bottom-right edge.
      {
        slot: 'photo',
        x: 9.0, y: 15.5, w: 84.0, h: 58.5,
        objectFit: 'cover',
        radius: 2,
      },
      // Bottom-left hex — team logo (larger emblem).
      {
        slot: 'team_logo',
        x: 6.0, y: 80.0, w: 14.0, h: 11.0,
        objectFit: 'contain',
      },
      // Bottom angled banner across the teal stripe — school name.
      // White text reads cleanly against black/teal.
      {
        slot: 'school',
        x: 20.0, y: 89.5, w: 56.0, h: 7.0,
        textAlign: 'center',
        color: '#ffffff',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
        letterSpacing: '2px',
      },
      // Bottom-right small box on the teal banner — jersey number.
      {
        slot: 'jersey',
        x: 80.0, y: 84.0, w: 13.0, h: 7.5,
        textAlign: 'center',
        color: '#0f172a',
        fontWeight: 900,
        fontFamily: "'Bebas Neue', sans-serif",
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
