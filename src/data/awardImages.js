// Trophy artwork per award, keyed by the canonical award keys used across the
// app (the same keys AwardsModal / Awards.jsx save). Shared so the awards page
// and the player-profile award pills draw from one source.
export const AWARD_IMAGES = {
  heisman: 'https://i.imgur.com/QSEqrfZ.png',
  maxwell: 'https://i.imgur.com/PFQjCyy.png',
  walterCamp: 'https://i.imgur.com/VyEXh6I.png',
  chuckBednarik: 'https://i.imgur.com/gDyzPvN.png',
  broncoNagurski: 'https://i.imgur.com/I50KC2g.png',
  outland: 'https://i.imgur.com/QUWsA6c.png',
  lombardi: 'https://i.imgur.com/gfq762C.png',
  bearBryantCoachOfTheYear: 'https://i.imgur.com/oij7wEs.png',
  daveyObrien: 'https://i.imgur.com/Dy3u42Q.png',
  doakWalker: 'https://i.imgur.com/nBM1cVP.png',
  johnMackey: 'https://i.imgur.com/BOitGT8.png',
  fredBiletnikoff: 'https://i.imgur.com/Iasg7ZZ.png',
  jimThorpe: 'https://i.imgur.com/ngipDjp.png',
  unitasGoldenArm: 'https://i.imgur.com/jv5M8NL.png',
  dickButkus: 'https://i.imgur.com/RRWai9B.png',
  edgeRusherOfTheYear: 'https://i.imgur.com/akmqbUw.png', // Ted Hendricks Award
  rimington: 'https://i.imgur.com/IzDtHBk.png',
  louGroza: 'https://i.imgur.com/3x0LhzY.png',
  rayGuy: 'https://i.imgur.com/VfkzgIk.png',
  broyles: 'https://i.imgur.com/WZaJ975.png',
  returnerOfTheYear: 'https://i.imgur.com/CHVXg6r.png', // Jet Award
  shaunAlexander: 'https://i.imgur.com/lbhil64.png', // Shaun Alexander Award (Most Outstanding Freshman)
}

// Resolve a trophy image from any award key (post-normalizeAwardName), handling
// aliases. Returns null when the key has no trophy artwork (e.g. POW, MVPs).
export function getAwardImage(key) {
  if (!key) return null
  if (AWARD_IMAGES[key]) return AWARD_IMAGES[key]
  // Ted Hendricks Award is the app's "Edge Rusher of the Year".
  if (key === 'tedHendricksAward') return AWARD_IMAGES.edgeRusherOfTheYear
  return null
}
