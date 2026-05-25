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
// BATCH 2 — Fresno State through Notre Dame: TODO
// BATCH 3 — Ohio through Wyoming: TODO
// ---------------------------------------------------------------------------

// Merge all batches into the single export.
// As new batches arrive, add them above and spread them in here.
export const TEAM_BRAND_PROFILES = {
  ...BATCH_1,
  // ...BATCH_2,
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
