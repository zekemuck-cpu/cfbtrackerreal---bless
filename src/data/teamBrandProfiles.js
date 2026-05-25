/**
 * Team Brand Profiles — visual identity data for all FBS programs.
 *
 * Used to build accurate, on-brand AI image generation prompts for
 * score cards, wallpapers, social media graphics, and any other
 * generated visuals. Supplements teamColors.js (which has hex values)
 * with the richer style/motif/era context that AI generators need.
 *
 * Fields per team:
 *   primaryPMS       — Official Pantone Matching System code (null if unknown)
 *   primaryHex       — Official primary hex color
 *   secondaryPMS     — Official secondary PMS (null if unknown)
 *   secondaryHex     — Official secondary hex color
 *   tertiaryHex      — Third color if applicable (null if none)
 *   motifs           — Signature visual elements (checkerboard, houndstooth, etc.)
 *   helmet           — baseColor, logoMark, stripe, finish
 *   wordmarkStyle    — Typography character in 1 sentence
 *   visualEra        — "classic/traditional" | "modern/athletic" | "retro" |
 *                      "flashy/Nike-era" | "military/clean"
 *   homeJerseyColor  — dominant color of home jersey
 *   awayJerseyColor  — dominant color of away jersey
 *   graphicNotes     — Critical art-director notes for AI prompts
 *   shortNickname    — One-word casual nickname for graphic text
 *   confidence       — "high" | "medium" | "low"
 *
 * Research status:
 *   Batch 1 (Air Force → Florida State): complete — high confidence, sourced from
 *   official athletics brand guides and verified secondary sources.
 *   Remaining teams: TODO — add batches as research completes.
 */

// ---------------------------------------------------------------------------
// BATCH 1 — Air Force Falcons through Florida State Seminoles
// ---------------------------------------------------------------------------
const BATCH_1 = {
  "Air Force Falcons": {
    primaryPMS: "PMS 287 C",
    primaryHex: "#003087",
    secondaryPMS: "PMS 877 C",
    secondaryHex: "#8A8D8F",
    tertiaryHex: "#FFFFFF",
    motifs: ["falcon wings", "lightning bolt", "stars"],
    helmet: {
      baseColor: "blue",
      logoMark: "AF lightning bolt monogram / falcon",
      stripe: "single white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Stenciled, military block sans-serif inspired by aviation insignia",
    visualEra: "military/clean",
    homeJerseyColor: "blue",
    awayJerseyColor: "white",
    graphicNotes: "Use deep aviation navy (PMS 287, not royal) with metallic silver — not pure gray. Lightning-bolt and falcon-wing motifs are core. Always feels disciplined, military, and aerodynamic; avoid flashy texture or chrome.",
    shortNickname: "Falcons",
    confidence: "high"
  },
  "Akron Zips": {
    primaryPMS: "PMS 282 C",
    primaryHex: "#041E42",
    secondaryPMS: "PMS 871 C",
    secondaryHex: "#A89968",
    tertiaryHex: "#FFFFFF",
    motifs: ["kangaroo (Zippy)"],
    helmet: {
      baseColor: "gold",
      logoMark: "interlocking A with kangaroo",
      stripe: "single navy center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Serif/italic 'Akron' wordmark rotated at a 7-degree angle (per brand guide)",
    visualEra: "modern/athletic",
    homeJerseyColor: "navy blue",
    awayJerseyColor: "white",
    graphicNotes: "Akron uses very dark navy (PMS 282), not royal blue. Metallic Vegas gold (PMS 871), not yellow. The wordmark is locked at 7 degrees of rotation — do not place it level. Zippy the Kangaroo is a unique mascot detail.",
    shortNickname: "Zips",
    confidence: "high"
  },
  "Alabama Crimson Tide": {
    primaryPMS: "PMS 201 C",
    primaryHex: "#9E1B32",
    secondaryPMS: "PMS 430 C",
    secondaryHex: "#828A8F",
    tertiaryHex: "#FFFFFF",
    motifs: ["houndstooth", "script A", "elephant"],
    helmet: {
      baseColor: "crimson",
      logoMark: "white player number (no logo)",
      stripe: "white-crimson-white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold script 'Alabama' or condensed all-caps 'ALABAMA' in block sans-serif",
    visualEra: "classic/traditional",
    homeJerseyColor: "crimson",
    awayJerseyColor: "white",
    graphicNotes: "Crimson is PMS 201 — darker and more wine-toned than scarlet; do NOT use bright red. Houndstooth (Bear Bryant homage) is the signature texture. Helmet has NUMBERS on the side, never a logo. White facemask is the modern look. The script 'A' is iconic for graphics.",
    shortNickname: "Tide",
    confidence: "high"
  },
  "Appalachian State Mountaineers": {
    primaryPMS: "PMS Process Black",
    primaryHex: "#000000",
    secondaryPMS: "PMS 116 C",
    secondaryHex: "#FFCC00",
    tertiaryHex: "#FFFFFF",
    motifs: ["mountain silhouette", "yosef the mountaineer"],
    helmet: {
      baseColor: "black",
      logoMark: "block A with mountain accents",
      stripe: "single gold center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Modified ITC New Baskerville serif 'A' with cursive 'Mountaineers' wordmark",
    visualEra: "modern/athletic",
    homeJerseyColor: "black",
    awayJerseyColor: "white",
    graphicNotes: "Bright school-bus yellow gold (PMS 116), not metallic. Modern Sun Belt brand built around bold black. Mountain peak motifs and 'App State' lockup are typical. Avoid muted golds — App State gold is saturated and punchy.",
    shortNickname: "App",
    confidence: "high"
  },
  "Arizona Wildcats": {
    primaryPMS: "PMS 200 C",
    primaryHex: "#AB0520",
    secondaryPMS: "PMS 282 C",
    secondaryHex: "#0C234B",
    tertiaryHex: "#FFFFFF",
    motifs: ["block A", "wildcat head"],
    helmet: {
      baseColor: "red (cardinal)",
      logoMark: "block A with cactus/wildcat",
      stripe: "single navy center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold block-serif 'ARIZONA' wordmark and angular block 'A' monogram",
    visualEra: "modern/athletic",
    homeJerseyColor: "cardinal red",
    awayJerseyColor: "white",
    graphicNotes: "Cardinal PMS 200 (#AB0520) and Navy PMS 282 (#002147). Cardinal leans wine/deep red — not scarlet. Navy is nearly black, very dark. Often paired with desert/copper accents for athletics. Bear Down is the rallying cry.",
    shortNickname: "Cats",
    confidence: "high"
  },
  "Arizona State Sun Devils": {
    primaryPMS: "ASU Maroon (custom, retired PMS 202)",
    primaryHex: "#8C1D40",
    secondaryPMS: "ASU Gold (custom, retired PMS 123)",
    secondaryHex: "#FFC627",
    tertiaryHex: "#000000",
    motifs: ["pitchfork", "Sparky devil"],
    helmet: {
      baseColor: "maroon (or chrome alternates)",
      logoMark: "pitchfork",
      stripe: "single gold center stripe",
      finish: "glossy (chrome alternates)"
    },
    wordmarkStyle: "Angular slab-serif 'ASU' with sharp pitchfork-inspired terminals",
    visualEra: "flashy/Nike-era",
    homeJerseyColor: "maroon",
    awayJerseyColor: "white",
    graphicNotes: "ASU retired Pantone in favor of custom spot colors. Maroon (#8C1D40) is wine-deep with brown undertones — NOT bright red. Gold is vivid school-bus yellow. The pitchfork is the primary mark, replacing the older Sparky head. Often paired with sharp angular graphics, Sonoran desert imagery.",
    shortNickname: "Sun Devils",
    confidence: "high"
  },
  "Arkansas Razorbacks": {
    primaryPMS: "PMS 201 C",
    primaryHex: "#9D2235",
    secondaryPMS: null,
    secondaryHex: "#FFFFFF",
    tertiaryHex: "#000000",
    motifs: ["running razorback hog", "tusks"],
    helmet: {
      baseColor: "cardinal red",
      logoMark: "running razorback hog (right-facing)",
      stripe: "single white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Custom block 'ARKANSAS' wordmark with razorback hog silhouette integrated",
    visualEra: "classic/traditional",
    homeJerseyColor: "cardinal red",
    awayJerseyColor: "white",
    graphicNotes: "Cardinal PMS 201 (same shade as Alabama crimson). The running hog logo facing right is non-negotiable and unique in college sports. Common pairings: 'Woo Pig Sooie' typography. Avoid bright fire-engine red — Razorback red is deeper and more wine-toned.",
    shortNickname: "Hogs",
    confidence: "high"
  },
  "Arkansas State Red Wolves": {
    primaryPMS: "PMS 186 C",
    primaryHex: "#CC092F",
    secondaryPMS: "PMS Process Black",
    secondaryHex: "#000000",
    tertiaryHex: "#FFFFFF",
    motifs: ["red wolf head", "wolf paw"],
    helmet: {
      baseColor: "red (scarlet)",
      logoMark: "red wolf head with bared teeth",
      stripe: "single black center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold block-serif 'A-State' or 'Red Wolves' wordmark, aggressive sharp terminals",
    visualEra: "modern/athletic",
    homeJerseyColor: "scarlet red",
    awayJerseyColor: "white",
    graphicNotes: "Scarlet PMS 186 (brighter, true-red than Arkansas Razorbacks' wine cardinal). Wolf head and 'A-State' lockups dominate; black-and-red contrast is core.",
    shortNickname: "A-State",
    confidence: "medium"
  },
  "Army Black Knights": {
    primaryPMS: "PMS Black 6 C",
    primaryHex: "#000000",
    secondaryPMS: "PMS 467 C",
    secondaryHex: "#D4BF91",
    tertiaryHex: "#B2B4B3",
    motifs: ["knight helmet", "saber", "shield", "stars and stripes"],
    helmet: {
      baseColor: "gold",
      logoMark: "block A or knight helmet shield",
      stripe: "black center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Stencil/military slab-serif 'ARMY' wordmark, often paired with West Point shield",
    visualEra: "military/clean",
    homeJerseyColor: "black",
    awayJerseyColor: "white",
    graphicNotes: "Gold is a soft athletic/champagne tone (PMS 467), NOT bright yellow or metallic. Cool Gray 5 accents. The 'Black Knights' identity centers on the West Point shield/helmet, sabers, and stars. Annual Army-Navy uniform reveals often add patriotic motifs — but baseline brand is stoic and military.",
    shortNickname: "Army",
    confidence: "high"
  },
  "Auburn Tigers": {
    primaryPMS: "PMS 289 C",
    primaryHex: "#0C2340",
    secondaryPMS: "PMS 158 C",
    secondaryHex: "#E87722",
    tertiaryHex: "#FFFFFF",
    motifs: ["interlocking AU", "tiger eye", "war eagle"],
    helmet: {
      baseColor: "white",
      logoMark: "interlocking AU in navy with orange outline",
      stripe: "navy-orange-navy center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Galliard serif 'AUBURN' wordmark with interlocking AU monogram",
    visualEra: "classic/traditional",
    homeJerseyColor: "navy blue",
    awayJerseyColor: "white",
    graphicNotes: "Burnt orange (PMS 158) and navy (PMS 289) — NOT bright orange and royal blue. Auburn's helmet is famously WHITE with the interlocking AU, not orange. Uniform stripe pattern is classic navy-orange-navy. 'War Eagle' and tiger imagery both apply.",
    shortNickname: "Auburn",
    confidence: "high"
  },
  "Ball State Cardinals": {
    primaryPMS: "PMS 200 C",
    primaryHex: "#BA0C2F",
    secondaryPMS: "PMS Black 6 C",
    secondaryHex: "#000000",
    tertiaryHex: "#FFFFFF",
    motifs: ["cardinal bird in flight"],
    helmet: {
      baseColor: "white (alternates: red, black)",
      logoMark: "stylized cardinal head in red",
      stripe: "red center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold sans-serif 'Ball State' wordmark; angled forward-leaning cardinal mark",
    visualEra: "modern/athletic",
    homeJerseyColor: "red",
    awayJerseyColor: "white",
    graphicNotes: "Cardinal PMS 200 — same shade as Arizona/Wisconsin red. The angular flying cardinal head with downward-pointing beak is the modern mark (post-2015 rebrand). Pair red and black; avoid pink or burgundy variants.",
    shortNickname: "Cards",
    confidence: "high"
  },
  "Baylor Bears": {
    primaryPMS: "PMS 3435 C",
    primaryHex: "#154734",
    secondaryPMS: "PMS 1235 C",
    secondaryHex: "#FFB81C",
    tertiaryHex: "#FFFFFF",
    motifs: ["interlocking BU", "bear head"],
    helmet: {
      baseColor: "green (alternates: gold, white, chrome)",
      logoMark: "interlocking BU monogram in gold",
      stripe: "gold-white-gold center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Custom slab-serif 'BAYLOR' wordmark with intersecting BU monogram",
    visualEra: "modern/athletic",
    homeJerseyColor: "green",
    awayJerseyColor: "white",
    graphicNotes: "Baylor green is very dark forest green (PMS 3435), nearly black — NOT kelly or grass green. Gold (PMS 1235) is rich, slightly amber. The interlocking BU is the primary athletics mark.",
    shortNickname: "Bears",
    confidence: "high"
  },
  "Boise State Broncos": {
    primaryPMS: "PMS 286 C",
    primaryHex: "#0033A0",
    secondaryPMS: "PMS 172 C",
    secondaryHex: "#D64309",
    tertiaryHex: "#FFFFFF",
    motifs: ["blue turf", "bronco horse head", "state of Idaho silhouette"],
    helmet: {
      baseColor: "blue",
      logoMark: "bronco horse head facing right in orange",
      stripe: "single orange center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold geometric sans-serif (Gotham-family) 'BOISE STATE' wordmark",
    visualEra: "modern/athletic",
    homeJerseyColor: "blue",
    awayJerseyColor: "white",
    graphicNotes: "Royal blue (PMS 286) and burnt orange (PMS 172) — NOT navy or red-orange. The blue turf ('The Blue', trademarked) is THE most recognizable visual signature in college football; backgrounds for any Boise graphic should consider it. Orange bronco head facing right is the primary mark.",
    shortNickname: "Broncos",
    confidence: "high"
  },
  "Boston College Eagles": {
    primaryPMS: "PMS 202 C",
    primaryHex: "#98002E",
    secondaryPMS: "PMS 874 C",
    secondaryHex: "#BC9B6A",
    tertiaryHex: "#726158",
    motifs: ["soaring eagle", "interlocking BC"],
    helmet: {
      baseColor: "gold (alternates: maroon)",
      logoMark: "interlocking BC monogram in maroon with eagle",
      stripe: "maroon center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Custom serif 'Boston College' wordmark and eagle-perched interlocking BC mark",
    visualEra: "classic/traditional",
    homeJerseyColor: "maroon",
    awayJerseyColor: "white",
    graphicNotes: "Maroon (PMS 202) is dark wine — NOT bright red. Gold (PMS 874) is metallic/old-gold, not bright yellow — true vegas/champagne gold. Helmet is gold base with BC. Jesuit institution — traditional, refined feel.",
    shortNickname: "Eagles",
    confidence: "high"
  },
  "Bowling Green Falcons": {
    primaryPMS: "PMS 166 C",
    primaryHex: "#FE5000",
    secondaryPMS: "PMS 4625 C",
    secondaryHex: "#4F2C1D",
    tertiaryHex: "#FFFFFF",
    motifs: ["falcon", "wings"],
    helmet: {
      baseColor: "orange (alternates: brown)",
      logoMark: "stylized falcon head in white/brown",
      stripe: "brown center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold custom 'BG' or 'Falcons' athletic wordmark with sharp angular cuts",
    visualEra: "modern/athletic",
    homeJerseyColor: "orange",
    awayJerseyColor: "brown",
    graphicNotes: "The unusual orange-and-brown palette is rare in college football — do NOT substitute black for brown (PMS 4625 is a true rich chocolate brown). Bright orange (PMS 166) is bold and saturated. Freddie & Frieda Falcon are paired mascots.",
    shortNickname: "Falcons",
    confidence: "high"
  },
  "Brigham Young Cougars": {
    primaryPMS: "PMS 648 C",
    primaryHex: "#002E5D",
    secondaryPMS: "PMS 293 C",
    secondaryHex: "#0047BA",
    tertiaryHex: "#FFFFFF",
    motifs: ["stretch Y", "cougar"],
    helmet: {
      baseColor: "navy blue (royal blue alternates)",
      logoMark: "stretch Y in white outlined navy/royal",
      stripe: "single white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Custom serif 'BYU' lockup; bold athletic 'COUGARS' wordmark",
    visualEra: "classic/traditional",
    homeJerseyColor: "navy blue",
    awayJerseyColor: "white",
    graphicNotes: "Two blues are official: Navy (PMS 648) is primary; Royal (PMS 293) is approved athletics-only accent. The horizontally stretched 'Y' on a white oval is iconic. Avoid using purple-leaning blues. No orange or yellow accents — strictly blue and white.",
    shortNickname: "Cougars",
    confidence: "high"
  },
  "Buffalo Bulls": {
    primaryPMS: "PMS 2935 C",
    primaryHex: "#005BBB",
    secondaryPMS: "PMS Black 6 C",
    secondaryHex: "#000000",
    tertiaryHex: "#FFFFFF",
    motifs: ["charging bull silhouette", "interlocking UB"],
    helmet: {
      baseColor: "royal blue",
      logoMark: "interlocking UB monogram in white",
      stripe: "single white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold collegiate sans-serif 'BUFFALO' wordmark with sharp UB monogram",
    visualEra: "modern/athletic",
    homeJerseyColor: "royal blue",
    awayJerseyColor: "white",
    graphicNotes: "True royal blue (PMS 2935), not navy. The charging bull silhouette and UB monogram are equally weighted in athletics branding.",
    shortNickname: "Bulls",
    confidence: "high"
  },
  "California Golden Bears": {
    primaryPMS: "PMS 282 C",
    primaryHex: "#003262",
    secondaryPMS: "PMS 123 C",
    secondaryHex: "#FDB515",
    tertiaryHex: "#FFFFFF",
    motifs: ["script Cal", "bear paw", "golden bear"],
    helmet: {
      baseColor: "gold",
      logoMark: "script 'Cal' in Berkeley blue",
      stripe: "single navy center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Iconic flowing italic 'Cal' script in Berkeley blue",
    visualEra: "classic/traditional",
    homeJerseyColor: "Berkeley blue (navy)",
    awayJerseyColor: "white",
    graphicNotes: "Berkeley blue (PMS 282) is very dark, near-black navy — NOT royal blue. California gold (PMS 123) is rich amber yellow, not metallic. The cursive script 'Cal' is the most recognizable mark and goes on the gold helmet. Avoid bright primary colors — this brand reads vintage and classic.",
    shortNickname: "Bears",
    confidence: "high"
  },
  "Central Michigan Chippewas": {
    primaryPMS: "PMS 209 C",
    primaryHex: "#6A0032",
    secondaryPMS: "PMS 123 C",
    secondaryHex: "#FFC82E",
    tertiaryHex: "#FFFFFF",
    motifs: ["Flying C", "action stripes"],
    helmet: {
      baseColor: "maroon",
      logoMark: "italic Flying C in gold (underlined with motion stripes)",
      stripe: "gold center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Italic underlined 'Flying C'; Antarctican Headline typeface for athletic lockups",
    visualEra: "modern/athletic",
    homeJerseyColor: "maroon",
    awayJerseyColor: "white",
    graphicNotes: "Maroon (PMS 209) is very dark, near-burgundy with brown undertones — NOT scarlet or wine. Gold (PMS 123) is bright. The Flying C with underline and action stripes is the unmistakable signature mark.",
    shortNickname: "Chips",
    confidence: "high"
  },
  "Charlotte 49ers": {
    primaryPMS: "PMS 349 C",
    primaryHex: "#046A38",
    secondaryPMS: "PMS 7503 C",
    secondaryHex: "#A49665",
    tertiaryHex: "#000000",
    motifs: ["pickaxe", "Norm the Niner miner", "gold rush imagery"],
    helmet: {
      baseColor: "green",
      logoMark: "pickaxe-in-C ('Niner C') in gold",
      stripe: "gold center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold athletic custom 'CHARLOTTE' wordmark with pickaxe integration",
    visualEra: "modern/athletic",
    homeJerseyColor: "green",
    awayJerseyColor: "white",
    graphicNotes: "Charlotte green (PMS 349) is a true bright forest green, NOT teal or kelly. Niner gold (PMS 7503) is muted/vintage olive-gold, not bright yellow. The pickaxe is the must-include motif — references the '49ers' identity.",
    shortNickname: "Niners",
    confidence: "high"
  },
  "Clemson Tigers": {
    primaryPMS: "PMS 1665 C",
    primaryHex: "#F56600",
    secondaryPMS: "PMS 268 C",
    secondaryHex: "#522D80",
    tertiaryHex: "#FFFFFF",
    motifs: ["tiger paw print", "solid orange"],
    helmet: {
      baseColor: "orange",
      logoMark: "tiger paw print in white with purple outline",
      stripe: "no stripe — solid orange",
      finish: "glossy"
    },
    wordmarkStyle: "Block condensed athletic 'CLEMSON' wordmark; paw print mark",
    visualEra: "classic/traditional",
    homeJerseyColor: "orange",
    awayJerseyColor: "white",
    graphicNotes: "Clemson orange (PMS 1665) is a very specific burnt-orange — not bright traffic orange, not red-orange. The tiger paw is THE defining mark. Solid orange helmet with white paw is one of CFB's most iconic helmets. Purple (PMS 268) is the secondary — use sparingly as accent only.",
    shortNickname: "Tigers",
    confidence: "high"
  },
  "Coastal Carolina Chanticleers": {
    primaryPMS: "PMS 322 C",
    primaryHex: "#006F71",
    secondaryPMS: "PMS 875 C",
    secondaryHex: "#A27752",
    tertiaryHex: "#000000",
    motifs: ["chanticleer rooster head", "feathers", "palm trees"],
    helmet: {
      baseColor: "teal (rotating black/bronze alternates)",
      logoMark: "stylized chanticleer rooster head",
      stripe: "varies; often matte teal/black",
      finish: "glossy (matte and chrome alternates frequent)"
    },
    wordmarkStyle: "Bold custom 'COASTAL' or 'CCU' wordmark with rooster integration",
    visualEra: "flashy/Nike-era",
    homeJerseyColor: "teal",
    awayJerseyColor: "white",
    graphicNotes: "Teal (PMS 322 / #006F71) is uniquely Coastal — rare in college football, do NOT substitute generic teal or turquoise. Bronze (PMS 875) is an aged copper-brown. Black is heavily featured. Rotating helmet finishes are part of identity. Chanticleer rooster references the Canterbury Tales.",
    shortNickname: "Chants",
    confidence: "high"
  },
  "Colorado Buffaloes": {
    primaryPMS: "PMS Black 6 C",
    primaryHex: "#000000",
    secondaryPMS: "PMS 4525 C",
    secondaryHex: "#CFB87C",
    tertiaryHex: "#A2A4A3",
    motifs: ["Ralphie buffalo silhouette", "interlocking CU"],
    helmet: {
      baseColor: "chrome gold (alternates: matte black, white)",
      logoMark: "running buffalo silhouette in black",
      stripe: "black center stripe",
      finish: "chrome/metallic gold (matte black alternates)"
    },
    wordmarkStyle: "Helvetica Neue Condensed all-caps 'COLORADO' and 'BUFFS'; interlocking CU monogram",
    visualEra: "modern/athletic",
    homeJerseyColor: "black",
    awayJerseyColor: "white",
    graphicNotes: "CU gold (PMS 4525) is a muted vegas/champagne gold — NOT bright yellow. The chrome gold helmet with the running Ralphie buffalo silhouette is one of CFB's most iconic helmets. Black is the dominant base. Boulder/mountain motifs work for backgrounds.",
    shortNickname: "Buffs",
    confidence: "high"
  },
  "Colorado State Rams": {
    primaryPMS: "PMS 357 C",
    primaryHex: "#1E4D2B",
    secondaryPMS: "PMS 617 C",
    secondaryHex: "#C8C372",
    tertiaryHex: "#FFFFFF",
    motifs: ["ram head with curled horn"],
    helmet: {
      baseColor: "green",
      logoMark: "ram's head in profile (curled horn) in gold",
      stripe: "single gold center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Vitesse-family slab serif; bold 'CSU' or 'RAMS' lockup",
    visualEra: "modern/athletic",
    homeJerseyColor: "green",
    awayJerseyColor: "white",
    graphicNotes: "CSU green (PMS 357) is dark forest green, NOT kelly. Gold (PMS 617) is a notable pale/champagne 'old gold' — much paler than typical metallic gold. The ram's head with the prominent curled horn is the signature mark. Rocky Mountain motifs work well.",
    shortNickname: "Rams",
    confidence: "high"
  },
  "Connecticut Huskies": {
    primaryPMS: "PMS 289 C",
    primaryHex: "#000E2F",
    secondaryPMS: null,
    secondaryHex: "#FFFFFF",
    tertiaryHex: "#E4002B",
    motifs: ["husky dog head (Jonathan)", "block UCONN"],
    helmet: {
      baseColor: "navy blue",
      logoMark: "husky head with piercing eyes",
      stripe: "white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold modern sans-serif 'UCONN' wordmark; custom extended 'Connecticut' wordmark",
    visualEra: "modern/athletic",
    homeJerseyColor: "navy blue",
    awayJerseyColor: "white",
    graphicNotes: "UConn's navy (PMS 289) is nearly black — NOT royal. The husky head (Jonathan the Husky) with piercing blue eyes is essential. Red is a tertiary accent; primary palette is navy + white only.",
    shortNickname: "Huskies",
    confidence: "high"
  },
  "Duke Blue Devils": {
    primaryPMS: "PMS 287 C",
    primaryHex: "#003087",
    secondaryPMS: null,
    secondaryHex: "#FFFFFF",
    tertiaryHex: "#012169",
    motifs: ["iconic D with hexagonal cutout", "blue devil pitchfork"],
    helmet: {
      baseColor: "royal blue (alternates: white, black)",
      logoMark: "stylized D with hexagonal cutout in white",
      stripe: "white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Garamond LT 3 academic serif 'Duke'; athletic bold sans-serif with the gem-shaped 'D'",
    visualEra: "classic/traditional",
    homeJerseyColor: "Duke royal blue",
    awayJerseyColor: "white",
    graphicNotes: "Duke royal blue (PMS 287, athletics) is true royal — NOT navy. The iconic 'D' with hexagonal/gem cutout is the primary athletic mark. Gothic architecture (Duke Chapel) is a brand visual motif. Avoid pairing with gold — Duke is strictly blue and white.",
    shortNickname: "Duke",
    confidence: "high"
  },
  "East Carolina Pirates": {
    primaryPMS: "PMS 268 C",
    primaryHex: "#592A8A",
    secondaryPMS: "PMS 123 C",
    secondaryHex: "#FDC82F",
    tertiaryHex: "#000000",
    motifs: ["Jolly Roger pirate skull with eye patch", "crossed bones", "No Quarter flag"],
    helmet: {
      baseColor: "purple (alternates: gold, black, chrome)",
      logoMark: "Jolly Roger pirate skull (eye patch, ECU bandana)",
      stripe: "gold center stripe",
      finish: "glossy (chrome and matte alternates seen)"
    },
    wordmarkStyle: "Matrix Extra Bold custom 'ECU' / 'PIRATES' wordmark with serif accents",
    visualEra: "modern/athletic",
    homeJerseyColor: "purple",
    awayJerseyColor: "white",
    graphicNotes: "ECU purple (PMS 268) is rich royal purple — distinctive in CFB, do NOT substitute violet. Gold (PMS 123) is vivid yellow-gold. The Jolly Roger pirate skull with eye patch is the must-have motif — 'No Quarter' is the rallying cry. Pirate aesthetics (crossbones, ship's wheel) are core.",
    shortNickname: "Pirates",
    confidence: "high"
  },
  "Eastern Michigan Eagles": {
    primaryPMS: "PMS 349 C",
    primaryHex: "#046A38",
    secondaryPMS: "PMS Process Black",
    secondaryHex: "#000000",
    tertiaryHex: "#FFFFFF",
    motifs: ["block E", "Swoop the eagle"],
    helmet: {
      baseColor: "green (alternates: gray, white)",
      logoMark: "bold block E in white",
      stripe: "white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold geometric block 'E' monogram; Myriad Pro for body type",
    visualEra: "modern/athletic",
    homeJerseyColor: "green",
    awayJerseyColor: "white",
    graphicNotes: "EMU green (PMS 349) is a true forest green, not kelly or lime. Block 'E' is the primary athletic mark. Limited palette — green, white, black only.",
    shortNickname: "Eagles",
    confidence: "medium"
  },
  "Florida Atlantic Owls": {
    primaryPMS: "PMS 295 C",
    primaryHex: "#003366",
    secondaryPMS: "PMS 200 C",
    secondaryHex: "#CC0000",
    tertiaryHex: "#8A8D8F",
    motifs: ["owl head (Owlsley)", "oval badge"],
    helmet: {
      baseColor: "navy blue",
      logoMark: "stylized owl head (round, intense eyes) in white/red",
      stripe: "red center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold athletic custom 'FAU' / 'OWLS' wordmark with serif accents",
    visualEra: "modern/athletic",
    homeJerseyColor: "navy blue",
    awayJerseyColor: "white",
    graphicNotes: "FAU navy (PMS 295) is dark navy. Red (PMS 200) is a true cardinal. The owl head is the central mark — not generic, the FAU owl has distinctive intense round eyes. Silver/gray are tertiary accents.",
    shortNickname: "Owls",
    confidence: "high"
  },
  "Florida Gators": {
    primaryPMS: "PMS 287 C",
    primaryHex: "#0021A5",
    secondaryPMS: "PMS 172 C",
    secondaryHex: "#FA4616",
    tertiaryHex: "#FFFFFF",
    motifs: ["alligator head with open mouth", "script Gators"],
    helmet: {
      baseColor: "orange (alternates: blue, white, chrome)",
      logoMark: "script 'Gators' wordmark in blue",
      stripe: "single blue center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Iconic flowing italic 'Gators' script in blue with orange shadow; athletic 'F' with gator-head accent",
    visualEra: "classic/traditional",
    homeJerseyColor: "blue",
    awayJerseyColor: "white",
    graphicNotes: "Florida blue (PMS 287) is a vivid royal/cobalt — NOT navy. Florida orange (PMS 172) is bright burnt orange. The script 'Gators' wordmark is the most identifiable mark. Helmet is orange with blue script. Avoid muting either color — Florida is high-saturation.",
    shortNickname: "Gators",
    confidence: "high"
  },
  "Florida International Panthers": {
    primaryPMS: "PMS 289 C",
    primaryHex: "#081E3F",
    secondaryPMS: "PMS 1225 C",
    secondaryHex: "#B6862C",
    tertiaryHex: "#FFFFFF",
    motifs: ["leaping panther", "FIU block monogram"],
    helmet: {
      baseColor: "navy blue (alternates: gold)",
      logoMark: "FIU monogram with leaping panther in gold",
      stripe: "gold center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold block 'FIU' wordmark with gold outline; custom 'Panthers' athletic mark",
    visualEra: "modern/athletic",
    homeJerseyColor: "navy blue",
    awayJerseyColor: "white",
    graphicNotes: "FIU navy (PMS 289) is nearly black-navy. Gold (PMS 1225) is rich amber. The leaping panther (Roary) is the dominant athletic mark, often paired with block 'FIU'. Miami location — sometimes paired with skyline or beach motifs.",
    shortNickname: "Panthers",
    confidence: "medium"
  },
  "Florida State Seminoles": {
    primaryPMS: "PMS 195 C",
    primaryHex: "#782F40",
    secondaryPMS: "PMS 7502 C",
    secondaryHex: "#CEB888",
    tertiaryHex: "#000000",
    motifs: ["spear", "Osceola on Renegade", "tomahawk", "feather"],
    helmet: {
      baseColor: "gold",
      logoMark: "garnet/white spear running down each side",
      stripe: "single garnet center stripe",
      finish: "glossy (matte black, chrome alternates exist)"
    },
    wordmarkStyle: "Custom 'Seminoles' wordmark with swooping garnet/gold underline; FSU stair-step monogram",
    visualEra: "classic/traditional",
    homeJerseyColor: "garnet",
    awayJerseyColor: "white",
    graphicNotes: "FSU garnet (PMS 195) is a deep wine red with purple undertones — NOT crimson, scarlet, or maroon. Gold (PMS 7502) is muted champagne. The spear running down the helmet (not a head logo) is the most iconic helmet design in CFB. Osceola and Renegade (warrior on horseback with flaming spear) — used with respect per FSU's official relationship with the Seminole Tribe of Florida.",
    shortNickname: "Noles",
    confidence: "high"
  }
}

// ---------------------------------------------------------------------------
// BATCH 2 — Fresno State through Middle Tennessee
// ---------------------------------------------------------------------------
const BATCH_2 = {
  "Fresno State Bulldogs": {
    primaryPMS: "PMS 186 C",
    primaryHex: "#B1102B",
    secondaryPMS: "PMS 2767 C",
    secondaryHex: "#13284C",
    tertiaryHex: "#007935",
    motifs: ["green V"],
    helmet: {
      baseColor: "red",
      logoMark: "snarling bulldog head",
      stripe: "navy center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Heavy aggressive collegiate block with italic forward lean; bulldog face often integrated into the F.",
    visualEra: "modern/athletic",
    homeJerseyColor: "red",
    awayJerseyColor: "white",
    graphicNotes: "Cardinal red is dominant, deep navy blue is secondary — NOT bright/royal blue. A distinctive green 'V' (for the San Joaquin Valley) appears on uniforms as an accent on collars or back of helmet. The snarling bulldog wearing the 'F' sailor cap is the iconic mark.",
    shortNickname: "Dogs",
    confidence: "high"
  },
  "Georgia Bulldogs": {
    primaryPMS: "PMS 200 C",
    primaryHex: "#BA0C2F",
    secondaryPMS: "PMS Black 6 C",
    secondaryHex: "#000000",
    tertiaryHex: "#5D6770",
    motifs: ["oval G", "hedges", "silver britches"],
    helmet: {
      baseColor: "red",
      logoMark: "black oval G with red interior on white background",
      stripe: "black center stripe flanked by thin white stripes",
      finish: "glossy"
    },
    wordmarkStyle: "Classic athletic block serif/sans, often with the iconic oval 'G' standing alone as the primary mark.",
    visualEra: "classic/traditional",
    homeJerseyColor: "red",
    awayJerseyColor: "white",
    graphicNotes: "Bulldog Red + Black is non-negotiable. The oval 'G' was designed in 1963 by Anne Donaldson — never modify it (black G with white outline on red). Silver Britches (silver pants) are iconic — pair with red jersey at home. Between-the-hedges (Sanford Stadium privet hedges) is a strong background motif.",
    shortNickname: "Dawgs",
    confidence: "high"
  },
  "Georgia Southern Eagles": {
    primaryPMS: "PMS 282 C",
    primaryHex: "#011E41",
    secondaryPMS: "PMS 872 C",
    secondaryHex: "#87714D",
    tertiaryHex: "#A3AAAE",
    motifs: ["eagle head", "GATA"],
    helmet: {
      baseColor: "navy blue",
      logoMark: "white eagle-head profile (Strutting Gus)",
      stripe: "single white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Modern angular collegiate block sans-serif with sharp italicized cuts.",
    visualEra: "modern/athletic",
    homeJerseyColor: "navy blue",
    awayJerseyColor: "white",
    graphicNotes: "Deep navy blue dominates — almost reads black in low light. Old gold (a muted, antique gold — NOT bright yellow) is the metallic accent. The eagle-head profile is the iconic helmet mark. 'GATA' (Get After Their Asses) is the program's rallying cry.",
    shortNickname: "Eagles",
    confidence: "high"
  },
  "Georgia State Panthers": {
    primaryPMS: "PMS 286 C",
    primaryHex: "#0039A6",
    secondaryPMS: "PMS 186 C",
    secondaryHex: "#C60C30",
    tertiaryHex: "#000000",
    motifs: ["panther head", "interlocking GS"],
    helmet: {
      baseColor: "royal blue",
      logoMark: "white Pounce panther head or interlocking GS",
      stripe: "single white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold blocky uppercase slab with 3D depth and white outline; collegiate traditional.",
    visualEra: "modern/athletic",
    homeJerseyColor: "royal blue",
    awayJerseyColor: "white",
    graphicNotes: "Royal blue (PMS 286, brighter than navy) is primary; red is secondary. The Pounce panther head and interlocking 'GS' are the recognizable marks. Atlanta urban identity is part of the brand story.",
    shortNickname: "Panthers",
    confidence: "high"
  },
  "Georgia Tech Yellow Jackets": {
    primaryPMS: "PMS 4515 C",
    primaryHex: "#B3A369",
    secondaryPMS: "PMS 540 C",
    secondaryHex: "#003057",
    tertiaryHex: "#FFFFFF",
    motifs: ["interlocking GT", "hexagon", "Ramblin Wreck"],
    helmet: {
      baseColor: "gold (Tech Gold)",
      logoMark: "navy interlocking GT",
      stripe: "navy and white center stripes",
      finish: "glossy"
    },
    wordmarkStyle: "Custom angular sans-serif with the 'T' inspired by Tech Tower; Zuume Cut typeface for headers.",
    visualEra: "classic/traditional",
    homeJerseyColor: "white",
    awayJerseyColor: "white (gold at home alternates)",
    graphicNotes: "CRITICAL: Tech Gold is a muted antique/metallic gold (#B3A369) — NOT bright yellow or athletic gold. Per 2018 brand refinement, navy is the secondary color and black was explicitly retired from primary use. The interlocking GT must have an oval G (never side-by-side). Helmets are predominantly gold with navy GT. The Ramblin' Wreck (1930 Ford Model A) is a heritage motif.",
    shortNickname: "Jackets",
    confidence: "high"
  },
  "Hawaii Rainbow Warriors": {
    primaryPMS: "PMS 3435 C",
    primaryHex: "#024731",
    secondaryPMS: "PMS 420 C",
    secondaryHex: "#C8C8C8",
    tertiaryHex: "#000000",
    motifs: ["tribal H", "rainbow", "tapa pattern"],
    helmet: {
      baseColor: "black or green",
      logoMark: "stylized tribal H with wave/totem styling",
      stripe: "none or thin silver",
      finish: "glossy"
    },
    wordmarkStyle: "Custom stylized H with totem-pole/tribal angled silhouette evoking Polynesian carving.",
    visualEra: "modern/athletic",
    homeJerseyColor: "green",
    awayJerseyColor: "white",
    graphicNotes: "Deep hunter green (NOT bright kelly green), silver, and black. The iconic H logo has a wave/totem styling — angular sides replacing the standard verticals. Polynesian tapa cloth patterns are commonly used as background motifs. Rainbow stripes (the program's namesake) sometimes appear as accent.",
    shortNickname: "Bows",
    confidence: "high"
  },
  "Houston Cougars": {
    primaryPMS: "PMS 186 C",
    primaryHex: "#C8102E",
    secondaryPMS: "PMS 188 C",
    secondaryHex: "#76232F",
    tertiaryHex: "#B2B4B2",
    motifs: ["interlocking UH", "Cougar Paw"],
    helmet: {
      baseColor: "red",
      logoMark: "white interlocking UH",
      stripe: "single white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold collegiate athletic block sans-serif with strong stroke contrast.",
    visualEra: "modern/athletic",
    homeJerseyColor: "red",
    awayJerseyColor: "white",
    graphicNotes: "Scarlet red (PMS 186) and white are the brand — clean and bold. The interlocking 'UH' monogram is primary. The Cougar Paw (raised four-fingered hand-sign) is an iconic tradition motif. Avoid mixing in other reds — keep it crimson-red and white.",
    shortNickname: "Coogs",
    confidence: "high"
  },
  "Illinois Fighting Illini": {
    primaryPMS: "PMS 1655",
    primaryHex: "#FF5F05",
    secondaryPMS: "PMS 2767",
    secondaryHex: "#13294B",
    tertiaryHex: "#FFFFFF",
    motifs: ["block I"],
    helmet: {
      baseColor: "orange or navy",
      logoMark: "block I (orange on navy, or navy on white)",
      stripe: "navy/orange center stripes",
      finish: "glossy"
    },
    wordmarkStyle: "Illinois Block — a custom collegiate block letterform created in 2013 by Daniel Heikkinen.",
    visualEra: "modern/athletic",
    homeJerseyColor: "orange",
    awayJerseyColor: "white",
    graphicNotes: "Illinois Orange is bright (PMS 1655, #FF5F05) and Illinois Blue is deep navy (PMS 2767, #13294B) — NOT royal blue. The Block I is the dominant primary mark. Avoid all references to retired Chief Illiniwek imagery.",
    shortNickname: "Illini",
    confidence: "high"
  },
  "Indiana Hoosiers": {
    primaryPMS: "PMS 201 C",
    primaryHex: "#990000",
    secondaryPMS: null,
    secondaryHex: "#FFFFFF",
    tertiaryHex: "#EEEDEB",
    motifs: ["interlocking IU trident", "candy stripes"],
    helmet: {
      baseColor: "crimson",
      logoMark: "white interlocking IU (trident)",
      stripe: "none on helmet typically",
      finish: "glossy"
    },
    wordmarkStyle: "Hoosier Bold — a custom collegiate block sans-serif, paired with the iconic IU trident monogram.",
    visualEra: "classic/traditional",
    homeJerseyColor: "crimson",
    awayJerseyColor: "white",
    graphicNotes: "Crimson and Cream (in practice, crimson and white — IU's brand guide notes cream doesn't reproduce well so white is substituted). The interlocking IU 'trident' must always have the I breaking the U. Candy stripes (red-and-white warmup pants) are iconic to IU overall.",
    shortNickname: "Hoosiers",
    confidence: "high"
  },
  "Iowa Hawkeyes": {
    primaryPMS: "PMS Black 6 C",
    primaryHex: "#000000",
    secondaryPMS: "PMS 116 C",
    secondaryHex: "#FFCD00",
    tertiaryHex: "#FFFFFF",
    motifs: ["Tigerhawk"],
    helmet: {
      baseColor: "black",
      logoMark: "gold Tigerhawk",
      stripe: "none (clean Steelers-inspired)",
      finish: "glossy"
    },
    wordmarkStyle: "Block IOWA — clean, heavy slab/sans uppercase paired with the Tigerhawk profile mark.",
    visualEra: "classic/traditional",
    homeJerseyColor: "black",
    awayJerseyColor: "white",
    graphicNotes: "Black and gold (PMS 116 — a saturated golden yellow, not orange-gold). The Tigerhawk was sketched in 1979 — always facing right, never modified. Helmet design directly mirrors the Steelers: glossy black, gold logo, no stripe. Red and purple must never be used.",
    shortNickname: "Hawks",
    confidence: "high"
  },
  "Iowa State Cyclones": {
    primaryPMS: "PMS 186 C",
    primaryHex: "#C8102E",
    secondaryPMS: "PMS 142 C",
    secondaryHex: "#F1BE48",
    tertiaryHex: "#822433",
    motifs: ["I-State logo", "Cy the Cardinal", "cyclone swirl"],
    helmet: {
      baseColor: "cardinal red",
      logoMark: "gold I with 'STATE' overlay",
      stripe: "gold center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "ITC Berkeley Old Style serif paired with bold athletic block 'I-State' lockup.",
    visualEra: "classic/traditional",
    homeJerseyColor: "cardinal red",
    awayJerseyColor: "white",
    graphicNotes: "Cardinal (PMS 186, a true red — NOT maroon) and gold (PMS 142, warm yellow-gold). The 'I-State' interlocking mark (gold I with red 'STATE' wordmark crossing through) is the primary athletics logo. Black-and-gold combos are explicitly avoided per ISU brand guide.",
    shortNickname: "Clones",
    confidence: "high"
  },
  "Jacksonville State Gamecocks": {
    primaryPMS: "PMS 200 C",
    primaryHex: "#CC0000",
    secondaryPMS: "PMS Black 6 C",
    secondaryHex: "#000000",
    tertiaryHex: "#FFFFFF",
    motifs: ["gamecock", "slanted JAX STATE wordmark"],
    helmet: {
      baseColor: "red",
      logoMark: "slanted JAX STATE wordmark or gamecock head",
      stripe: "black center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold slanted/italicized condensed uppercase sans-serif 'JAX STATE' with thin inline strokes (2023 refresh for FBS jump).",
    visualEra: "flashy/Nike-era",
    homeJerseyColor: "red",
    awayJerseyColor: "white",
    graphicNotes: "Red and black — bold, modern. The 2023 brand refresh aligned with the move to Conference USA / FBS. 'Cocky' the Gamecock is the mascot. Distinct from South Carolina by branding as 'Jax State' rather than just 'Gamecocks.'",
    shortNickname: "Gamecocks",
    confidence: "high"
  },
  "James Madison Dukes": {
    primaryPMS: "PMS 2685 C",
    primaryHex: "#450084",
    secondaryPMS: "PMS 4515 C",
    secondaryHex: "#CBB677",
    tertiaryHex: "#FFFFFF",
    motifs: ["JMU monogram", "Duke Dog", "ducal crown"],
    helmet: {
      baseColor: "purple",
      logoMark: "gold JMU monogram",
      stripe: "gold center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold collegiate JMU monogram in gold over purple banner with gold trim; refined uppercase sans 'MADISON' wordmark.",
    visualEra: "modern/athletic",
    homeJerseyColor: "purple",
    awayJerseyColor: "white",
    graphicNotes: "Deep royal purple (PMS 2685, NOT lavender or violet) with muted antique gold — NOT bright yellow. The Duke Dog mascot (English bulldog in royal crown and cape) is iconic. The 'JMU' monogram is the primary athletic mark.",
    shortNickname: "Dukes",
    confidence: "high"
  },
  "Kansas Jayhawks": {
    primaryPMS: "PMS 293 C",
    primaryHex: "#0051BA",
    secondaryPMS: "PMS 186 C",
    secondaryHex: "#E8000D",
    tertiaryHex: "#FFC82D",
    motifs: ["Jayhawk bird", "KU monogram"],
    helmet: {
      baseColor: "blue",
      logoMark: "Jayhawk (cartoonish bird in blue, crimson, yellow)",
      stripe: "crimson center stripe with white pinstripes",
      finish: "glossy"
    },
    wordmarkStyle: "Custom Trajan-derived serif KU monogram with extended 'K' leg representing Mount Oread.",
    visualEra: "classic/traditional",
    homeJerseyColor: "blue",
    awayJerseyColor: "white",
    graphicNotes: "KU Blue (PMS 293, royal blue) is primary, with crimson red (PMS 186) and Jayhawk yellow (PMS 116) as secondaries. The cartoon Jayhawk (1946 version, smiling, walking right) is one of the most beloved mascots in college sports — never modify it.",
    shortNickname: "Jayhawks",
    confidence: "high"
  },
  "Kansas State Wildcats": {
    primaryPMS: "PMS 268 C",
    primaryHex: "#512888",
    secondaryPMS: null,
    secondaryHex: "#FFFFFF",
    tertiaryHex: "#A7A7A7",
    motifs: ["Powercat", "Willie the Wildcat"],
    helmet: {
      baseColor: "purple",
      logoMark: "white Powercat (abstract wildcat-head profile)",
      stripe: "single white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold collegiate athletic block sans paired with the iconic Powercat profile.",
    visualEra: "classic/traditional",
    homeJerseyColor: "purple",
    awayJerseyColor: "white",
    graphicNotes: "Royal purple (PMS 268) is essentially the ONLY color in K-State's identity — no orange, no yellow, no secondary brand color other than white/black/gray. The Powercat (abstract side-profile wildcat head) designed in 1989 is THE mark. Avoid caricature cats — K-State explicitly bans them.",
    shortNickname: "Cats",
    confidence: "high"
  },
  "Kennesaw State Owls": {
    primaryPMS: "PMS 1235 C",
    primaryHex: "#FDBB30",
    secondaryPMS: "PMS Black C",
    secondaryHex: "#0B1315",
    tertiaryHex: "#C5C6C8",
    motifs: ["interlocking KS", "owl"],
    helmet: {
      baseColor: "black",
      logoMark: "gold interlocking KS",
      stripe: "thin gold center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Sharp geometric sans-serif with triangular terminations; interlocking KS monogram is signature.",
    visualEra: "modern/athletic",
    homeJerseyColor: "black",
    awayJerseyColor: "white",
    graphicNotes: "Black and gold (PMS 1235, a vivid yellow-gold). The interlocking 'KS' monogram with triangular bar ends is the primary mark. 'Scrappy the Owl' is the mascot. New FBS program (joined 2024) — fresh modern athletic identity.",
    shortNickname: "Owls",
    confidence: "high"
  },
  "Kent State Golden Flashes": {
    primaryPMS: "PMS 281 C",
    primaryHex: "#002664",
    secondaryPMS: "PMS 124 C",
    secondaryHex: "#EAAB00",
    tertiaryHex: "#FFFFFF",
    motifs: ["lightning bolt K", "Flash the eagle"],
    helmet: {
      baseColor: "navy blue",
      logoMark: "gold italic K with lightning-bolt negative space",
      stripe: "gold center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Aggressive italic athletic block — modified National Black Italic with rectangular serifs and sharp triangular cuts.",
    visualEra: "modern/athletic",
    homeJerseyColor: "navy blue",
    awayJerseyColor: "white",
    graphicNotes: "Deep navy (PMS 281) and gold (PMS 124, a yellow-gold). The italic 'K' with lightning-bolt accents is iconic. 'Flash' the golden eagle mascot. Avoid royal blue — Kent's blue is specifically dark navy.",
    shortNickname: "Flashes",
    confidence: "high"
  },
  "Kentucky Wildcats": {
    primaryPMS: "PMS 286 C",
    primaryHex: "#0033A0",
    secondaryPMS: null,
    secondaryHex: "#FFFFFF",
    tertiaryHex: "#000000",
    motifs: ["interlocking UK"],
    helmet: {
      baseColor: "royal blue",
      logoMark: "white interlocking UK",
      stripe: "single white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Clean bold collegiate block paired with the iconic interlocking UK monogram (Mercury and Avenir typefaces).",
    visualEra: "classic/traditional",
    homeJerseyColor: "royal blue",
    awayJerseyColor: "white",
    graphicNotes: "Wildcat Blue (PMS 286 — a true royal blue, distinctly different from navy or Duke's PMS 287) and white. The interlocking 'UK' monogram is THE mark — non-negotiable, never modify. 'Big Blue Nation' is the fan identity.",
    shortNickname: "Cats",
    confidence: "high"
  },
  "Liberty Flames": {
    primaryPMS: "PMS 282",
    primaryHex: "#0A254E",
    secondaryPMS: "PMS 187",
    secondaryHex: "#990000",
    tertiaryHex: "#9BC7EE",
    motifs: ["LU monogram", "eagle", "flame"],
    helmet: {
      baseColor: "navy blue",
      logoMark: "red and white eagle head or LU monogram",
      stripe: "red and white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Champion Sans/Champion Serif family — strong condensed athletic block typefaces.",
    visualEra: "modern/athletic",
    homeJerseyColor: "navy blue",
    awayJerseyColor: "white",
    graphicNotes: "Navy blue, red, white — patriotic palette tied to the 'Liberty' name. Eagle head ('Sparky') and flame motif are signatures. The LU monogram + eagle combination mark is most common.",
    shortNickname: "Flames",
    confidence: "high"
  },
  "Louisiana Ragin Cajuns": {
    primaryPMS: "PMS 186 C",
    primaryHex: "#CE181E",
    secondaryPMS: "PMS Process Black",
    secondaryHex: "#000000",
    tertiaryHex: "#F18C21",
    motifs: ["interlocking UL", "fleur-de-lis"],
    helmet: {
      baseColor: "vermilion red",
      logoMark: "white interlocking UL or fleur-de-lis",
      stripe: "black or white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold condensed athletic block sans-serif with aggressive italic 'LOUISIANA' / 'RAGIN CAJUNS' lettering.",
    visualEra: "modern/athletic",
    homeJerseyColor: "vermilion red",
    awayJerseyColor: "white",
    graphicNotes: "Vermilion (a saturated red with slight orange undertone — the school's signature color, named after the Vermilion River) and black. The fleur-de-lis is a critical Cajun cultural motif and is non-negotiable for authentic graphics. Interlocking 'UL' monogram is primary. Mascot is 'Cayenne' the pepper.",
    shortNickname: "Cajuns",
    confidence: "medium"
  },
  "Louisiana Monroe Warhawks": {
    primaryPMS: "PMS 202 C",
    primaryHex: "#840029",
    secondaryPMS: "PMS 124 C",
    secondaryHex: "#FDB913",
    tertiaryHex: "#FFFFFF",
    motifs: ["Warhawk head", "ULM monogram"],
    helmet: {
      baseColor: "white or maroon",
      logoMark: "ULM monogram with hawk head integrated",
      stripe: "maroon and gold center stripes",
      finish: "glossy"
    },
    wordmarkStyle: "Bold collegiate block serif 'ULM' monogram with gold outline and Warhawk integrated into the center letter.",
    visualEra: "modern/athletic",
    homeJerseyColor: "maroon",
    awayJerseyColor: "white",
    graphicNotes: "Maroon (PMS 202, a deep red-brown — NOT bright red) and gold. The Warhawk is a WWII-style P-40 aviator hawk with goggles. The ULM monogram with hawk head emerging from center 'L' is the iconic mark.",
    shortNickname: "Warhawks",
    confidence: "medium"
  },
  "Louisiana Tech Bulldogs": {
    primaryPMS: "PMS 287 C",
    primaryHex: "#002F8B",
    secondaryPMS: "PMS 1797 C",
    secondaryHex: "#E31B23",
    tertiaryHex: "#A2AAAD",
    motifs: ["Louisiana state outline", "LA Tech monogram", "bulldog"],
    helmet: {
      baseColor: "blue",
      logoMark: "white LA Tech monogram with state outline",
      stripe: "red and white center stripes",
      finish: "glossy"
    },
    wordmarkStyle: "Bold collegiate slab/block serif 'LA TECH' with the Louisiana state outline as a backdrop.",
    visualEra: "classic/traditional",
    homeJerseyColor: "blue",
    awayJerseyColor: "white",
    graphicNotes: "Tech Blue (PMS 287, dark royal) and Tech Red (PMS 1797). The Louisiana state outline behind the 'LA Tech' monogram is a 50+ year tradition. 'Tech the Bulldog' mascot. Distinct from Texas Tech — the state outline is the differentiator.",
    shortNickname: "Bulldogs",
    confidence: "high"
  },
  "Louisville Cardinals": {
    primaryPMS: "PMS 1797",
    primaryHex: "#AD0000",
    secondaryPMS: "PMS Black 6 C",
    secondaryHex: "#000000",
    tertiaryHex: "#FDB913",
    motifs: ["cardinal bird head", "fleur-de-lis", "L1C4"],
    helmet: {
      baseColor: "red",
      logoMark: "cardinal bird head (red with black outline, yellow beak, white teeth)",
      stripe: "black center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Aggressive collegiate block (Gotham/Knockout family) paired with the iconic snarling Cardinal Bird head.",
    visualEra: "modern/athletic",
    homeJerseyColor: "red",
    awayJerseyColor: "white",
    graphicNotes: "Cardinal Red (PMS 1797 — slightly orange-leaning red) and black. Yellow/gold (PMS 130) accents only on the cardinal mascot (beak and feet). The Cardinal Bird head (red with black outline, yellow beak, distinctive white 'teeth') is THE mark — fierce, not friendly. Kentucky-state fleur-de-lis is sometimes used.",
    shortNickname: "Cards",
    confidence: "high"
  },
  "LSU Tigers": {
    primaryPMS: "PMS 268 C",
    primaryHex: "#461D7C",
    secondaryPMS: "PMS 123 C",
    secondaryHex: "#FDD023",
    tertiaryHex: "#FFFFFF",
    motifs: ["eye of the tiger", "LSU monogram", "tiger stripes", "fleur-de-lis"],
    helmet: {
      baseColor: "white",
      logoMark: "purple LSU monogram",
      stripe: "purple and gold center stripes",
      finish: "glossy"
    },
    wordmarkStyle: "Forza typeface — squared-off geometric athletic sans that mirrors the iconic LSU interlocking monogram.",
    visualEra: "classic/traditional",
    homeJerseyColor: "white (home tradition — LSU famously wears white at home)",
    awayJerseyColor: "purple",
    graphicNotes: "Purple (PMS 268, deep royal purple — NOT light purple) and gold (PMS 123, a warm yellow-gold). White helmets with purple LSU monogram and purple/gold stripe is non-negotiable iconic. The 'eye of the tiger' imagery, Death Valley (Tiger Stadium), and LSU's tradition of wearing WHITE jerseys at home are signature. Tiger stripes accent.",
    shortNickname: "Tigers",
    confidence: "high"
  },
  "Marshall Thundering Herd": {
    primaryPMS: "PMS 354 C",
    primaryHex: "#00B140",
    secondaryPMS: null,
    secondaryHex: "#FFFFFF",
    tertiaryHex: "#000000",
    motifs: ["italic M", "We Are Marshall"],
    helmet: {
      baseColor: "kelly green",
      logoMark: "white italic M",
      stripe: "single white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold custom italic collegiate block with strong forward slant — aggressive athletic sans.",
    visualEra: "modern/athletic",
    homeJerseyColor: "kelly green",
    awayJerseyColor: "white",
    graphicNotes: "Kelly green (PMS 354, bright/vivid green — officially adopted in 2016, replacing prior hunter green). The italic 'M' is signature. Marshall's identity is intertwined with the 1970 plane crash memorial — 'We Are Marshall' is sacred. Marco the Buffalo is the mascot.",
    shortNickname: "Herd",
    confidence: "high"
  },
  "Maryland Terrapins": {
    primaryPMS: "PMS 186 C",
    primaryHex: "#E03A3E",
    secondaryPMS: "PMS 116 C",
    secondaryHex: "#FFD520",
    tertiaryHex: "#000000",
    motifs: ["Maryland state flag pattern", "M-Bar", "Testudo turtle"],
    helmet: {
      baseColor: "varies (red, white, gold, black, Maryland flag pattern)",
      logoMark: "M-Bar logo (M with flag bar beneath) or Maryland flag pattern",
      stripe: "Maryland flag pattern stripe",
      finish: "glossy or matte"
    },
    wordmarkStyle: "Terrafont — bold serif with massive triangular serifs, all-caps only; preeminent brand font.",
    visualEra: "flashy/Nike-era",
    homeJerseyColor: "red",
    awayJerseyColor: "white",
    graphicNotes: "Maryland is UNIQUE — four primary colors (red, white, black, gold) drawn directly from the Maryland state flag. The flag pattern (alternating yellow/black quadrants + red/white quadrants) is the program's signature motif — non-negotiable on uniforms, helmets, and graphics. The M-Bar logo and Script 'Terps' are key marks. Testudo the diamondback terrapin is the mascot.",
    shortNickname: "Terps",
    confidence: "high"
  },
  "Memphis Tigers": {
    primaryPMS: "PMS 287 C",
    primaryHex: "#003087",
    secondaryPMS: "PMS 423 C",
    secondaryHex: "#898D8D",
    tertiaryHex: "#F8992E",
    motifs: ["block M with leaping tiger", "tiger stripes"],
    helmet: {
      baseColor: "blue",
      logoMark: "white block M with leaping tiger emerging from top",
      stripe: "gray/white center stripes",
      finish: "glossy"
    },
    wordmarkStyle: "Custom serif/angular athletic 'MEMPHIS' / 'TIGERS' with bold cuts; iconic Block M is the primary mark.",
    visualEra: "modern/athletic",
    homeJerseyColor: "blue",
    awayJerseyColor: "white",
    graphicNotes: "Memphis Blue (PMS 287, dark royal/navy blue — NOT light Grizzlies blue) and gray (PMS 423). The block 'M' with a leaping tiger emerging over the top is iconic and unique. Orange accents (PMS 130) appear historically but are reduced in current branding. Tiger stripe motifs as accents.",
    shortNickname: "Tigers",
    confidence: "high"
  },
  "Miami Hurricanes": {
    primaryPMS: "PMS 1665 C",
    primaryHex: "#F47321",
    secondaryPMS: "PMS 3435 C",
    secondaryHex: "#005030",
    tertiaryHex: "#FFFFFF",
    motifs: ["split U logo", "palm trees", "smoke entrance"],
    helmet: {
      baseColor: "white",
      logoMark: "split U logo (orange and green)",
      stripe: "orange and green center stripes",
      finish: "glossy"
    },
    wordmarkStyle: "Bold collegiate athletic block paired with the iconic split-U monogram (orange + green halves).",
    visualEra: "classic/traditional",
    homeJerseyColor: "orange",
    awayJerseyColor: "white",
    graphicNotes: "Orange (PMS 1665, a vivid orange) and dark green (PMS 3435, deep forest green) — the colors of the orange tree. The split 'U' was co-developed in 1973 — never modify it. Helmets are white with the split-U on the side, orange and green stripe. 'The U' is the swagger identity. Smoke-entrance and Miami Vice aesthetics are common motifs.",
    shortNickname: "Canes",
    confidence: "high"
  },
  "Miami Ohio Redhawks": {
    primaryPMS: "PMS 186 C",
    primaryHex: "#B61E2E",
    secondaryPMS: "PMS Black 6 C",
    secondaryHex: "#000000",
    tertiaryHex: "#FFFFFF",
    motifs: ["Beveled M"],
    helmet: {
      baseColor: "red",
      logoMark: "white Beveled M",
      stripe: "single white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Iconic chiseled/three-dimensional sculpted Beveled M with shadow-and-highlight depth; custom collegiate serif 'MIAMI' wordmark.",
    visualEra: "classic/traditional",
    homeJerseyColor: "red",
    awayJerseyColor: "white",
    graphicNotes: "Cardinal red (PMS 186) and white. The Beveled M (sculpted block M with three-dimensional bevel) is the program's signature, protected mark — never flatten or modify. 'Swoop' the RedHawk mascot. Distinct from Miami (FL) — Miami of Ohio is the original, founded 1809.",
    shortNickname: "RedHawks",
    confidence: "high"
  },
  "Michigan Wolverines": {
    primaryPMS: "PMS 282 C",
    primaryHex: "#00274C",
    secondaryPMS: "PMS 7406 C",
    secondaryHex: "#FFCB05",
    tertiaryHex: "#FFFFFF",
    motifs: ["winged helmet"],
    helmet: {
      baseColor: "deep navy blue with maize 'wings'",
      logoMark: "none (wings ARE the mark)",
      stripe: "maize stripes forming the iconic wing pattern across the front",
      finish: "glossy"
    },
    wordmarkStyle: "Block M paired with custom Michigan athletic block typography.",
    visualEra: "classic/traditional",
    homeJerseyColor: "navy blue",
    awayJerseyColor: "white",
    graphicNotes: "THE WINGED HELMET IS NON-NEGOTIABLE — one of the most iconic helmets in all of sports. Designed by coach Fritz Crisler in 1938. Deep navy blue (PMS 282, NOT royal blue) with maize 'wings' (PMS 7406, a saturated warm yellow-gold — NOT pale yellow). The winged pattern across the front of the helmet is the program's entire visual identity. Block 'M' is the secondary mark.",
    shortNickname: "Wolverines",
    confidence: "high"
  },
  "Michigan State Spartans": {
    primaryPMS: "PMS 567 C",
    primaryHex: "#18453B",
    secondaryPMS: null,
    secondaryHex: "#FFFFFF",
    tertiaryHex: "#000000",
    motifs: ["Spartan helmet logo", "Block S"],
    helmet: {
      baseColor: "Spartan green",
      logoMark: "white Spartan warrior helmet profile",
      stripe: "single white center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold custom Spartan block paired with the iconic Spartan-helmet-profile mark; Metropolis typeface for system use.",
    visualEra: "classic/traditional",
    homeJerseyColor: "Spartan green",
    awayJerseyColor: "white",
    graphicNotes: "Spartan Green (PMS 567 — a deep forest/dark green, NOT bright kelly green like Marshall) and white. The Spartan helmet profile (Sparty logo, side view of crested warrior helmet) is the iconic mark. 'Spartans Will.' is the tagline. Avoid black as a primary — green is the dominant color.",
    shortNickname: "Sparty",
    confidence: "high"
  },
  "Middle Tennessee Blue Raiders": {
    primaryPMS: "PMS 300",
    primaryHex: "#0066CC",
    secondaryPMS: "PMS Process Black",
    secondaryHex: "#000000",
    tertiaryHex: "#FFFFFF",
    motifs: ["Lightning the Pegasus", "lightning bolt"],
    helmet: {
      baseColor: "royal blue",
      logoMark: "white Pegasus winged horse with lightning-bolt T",
      stripe: "white/black center stripe",
      finish: "glossy"
    },
    wordmarkStyle: "Bold custom collegiate block sans-serif 'MIDDLE TENNESSEE' / 'BLUE RAIDERS' with sharp athletic block and lightning bolt accents.",
    visualEra: "modern/athletic",
    homeJerseyColor: "royal blue",
    awayJerseyColor: "white",
    graphicNotes: "Royal blue (PMS 300, bright royal — distinguishable from Kentucky's deeper PMS 286) and black. Lightning (the Pegasus mascot) and the lightning-bolt motif are signatures. The combined Pegasus-head-with-lightning-T mark is the primary athletic logo.",
    shortNickname: "Raiders",
    confidence: "high"
  }
}

// ---------------------------------------------------------------------------
// BATCH 3 — Minnesota through Wyoming: TODO
// ---------------------------------------------------------------------------

// Merge all batches into the single export.
// As new batches arrive, add them above and spread them in here.
export const TEAM_BRAND_PROFILES = {
  ...BATCH_1,
  ...BATCH_2,
  // ...BATCH_3,
  // ...BATCH_3,
}

/**
 * Get the brand profile for a team by its full name.
 * Returns null if no profile has been researched yet (expected during
 * the multi-batch research phase — callers should degrade gracefully).
 *
 * @param {string} teamName — Full team name, e.g. "Alabama Crimson Tide"
 * @returns {Object|null}
 */
export function getTeamBrandProfile(teamName) {
  return TEAM_BRAND_PROFILES[teamName] ?? null
}

/**
 * Build a concise style string for an AI image generation prompt.
 * Combines the hex colors from teamColors.js with the richer brand
 * profile when available, or falls back to the bare color values.
 *
 * @param {string} teamName — Full team name
 * @param {{ primary: string, secondary: string }} colors — from teamColors.js
 * @returns {string} — ready to inject into a prompt
 */
export function buildTeamStylePrompt(teamName, colors) {
  const profile = getTeamBrandProfile(teamName)

  if (!profile) {
    // Graceful fallback — just the colors until research covers this team
    return `Team colors: primary ${colors?.primary || 'unknown'}, secondary ${colors?.secondary || 'unknown'}.`
  }

  const parts = []

  // Colors with PMS context
  const primaryDesc = profile.primaryPMS
    ? `${profile.primaryPMS} (${profile.primaryHex})`
    : profile.primaryHex
  const secondaryDesc = profile.secondaryPMS
    ? `${profile.secondaryPMS} (${profile.secondaryHex})`
    : profile.secondaryHex
  parts.push(`Primary color: ${primaryDesc}. Secondary: ${secondaryDesc}.`)
  if (profile.tertiaryHex) parts.push(`Tertiary accent: ${profile.tertiaryHex}.`)

  // Visual era and wordmark
  parts.push(`Visual style: ${profile.visualEra}. Typography: ${profile.wordmarkStyle}.`)

  // Motifs
  if (profile.motifs?.length) {
    parts.push(`Signature motifs: ${profile.motifs.join(', ')}.`)
  }

  // Helmet
  if (profile.helmet) {
    const h = profile.helmet
    parts.push(`Helmet: ${h.baseColor} base, ${h.logoMark}, ${h.stripe || 'no stripe'}, ${h.finish} finish.`)
  }

  // Art director notes
  if (profile.graphicNotes) {
    parts.push(`Art direction: ${profile.graphicNotes}`)
  }

  return parts.join(' ')
}
