// Bowl game data with logos
export const bowlGames = {
  '68 Ventures Bowl': {
    name: '68 Ventures Bowl',
    logo: 'https://i.imgur.com/OOIGJCr.png'
  },
  'Alamo Bowl': {
    name: 'Alamo Bowl',
    logo: 'https://i.imgur.com/wDSelNH.png'
  },
  'Arizona Bowl': {
    name: 'Arizona Bowl',
    logo: 'https://i.imgur.com/Ck2jcTH.png'
  },
  'Armed Forces Bowl': {
    name: 'Armed Forces Bowl',
    logo: 'https://i.imgur.com/WFRC2rG.png'
  },
  'Birmingham Bowl': {
    name: 'Birmingham Bowl',
    logo: 'https://i.imgur.com/2btYX7l.png'
  },
  'Boca Raton Bowl': {
    name: 'Boca Raton Bowl',
    logo: 'https://i.imgur.com/SWMoXUA.png'
  },
  'Citrus Bowl': {
    name: 'Citrus Bowl',
    logo: 'https://i.imgur.com/3KrAX4V.png'
  },
  'Cotton Bowl': {
    name: 'Cotton Bowl',
    logo: 'https://i.imgur.com/cvNsbR1.png'
  },
  'Cure Bowl': {
    name: 'Cure Bowl',
    logo: 'https://i.imgur.com/QqdbIth.png'
  },
  "Duke's Mayo Bowl": {
    name: "Duke's Mayo Bowl",
    logo: 'https://i.imgur.com/f9kg4Lk.png'
  },
  'Famous Idaho Potato Bowl': {
    name: 'Famous Idaho Potato Bowl',
    logo: 'https://i.imgur.com/hOzY3XW.png'
  },
  'Fenway Bowl': {
    name: 'Fenway Bowl',
    logo: 'https://i.imgur.com/1wWyoBs.png'
  },
  'Fiesta Bowl': {
    name: 'Fiesta Bowl',
    logo: 'https://i.imgur.com/Fwx8H4K.png'
  },
  'First Responder Bowl': {
    name: 'First Responder Bowl',
    logo: 'https://i.imgur.com/LLlM8Su.png'
  },
  'Frisco Bowl': {
    name: 'Frisco Bowl',
    logo: 'https://i.imgur.com/AZ3Lwyb.png'
  },
  'GameAbove Sports Bowl': {
    name: 'GameAbove Sports Bowl',
    logo: 'https://i.imgur.com/vVO4Bfq.png'
  },
  'Gasparilla Bowl': {
    name: 'Gasparilla Bowl',
    logo: 'https://i.imgur.com/4ViIqIi.png'
  },
  'Gator Bowl': {
    name: 'Gator Bowl',
    logo: 'https://i.imgur.com/RBsrSa2.png'
  },
  'Hawaii Bowl': {
    name: 'Hawaii Bowl',
    logo: 'https://i.imgur.com/8biinJU.png'
  },
  'Holiday Bowl': {
    name: 'Holiday Bowl',
    logo: 'https://i.imgur.com/56ObibZ.png'
  },
  'Independence Bowl': {
    name: 'Independence Bowl',
    logo: 'https://i.imgur.com/ZmNc2YY.png'
  },
  'LA Bowl': {
    name: 'LA Bowl',
    logo: 'https://i.imgur.com/TQFoP9o.png'
  },
  'Las Vegas Bowl': {
    name: 'Las Vegas Bowl',
    logo: 'https://i.imgur.com/gXNMvnh.png'
  },
  'Liberty Bowl': {
    name: 'Liberty Bowl',
    logo: 'https://i.imgur.com/FRDwnFd.png'
  },
  'Military Bowl': {
    name: 'Military Bowl',
    logo: 'https://i.imgur.com/LmmGrsL.png'
  },
  'Music City Bowl': {
    name: 'Music City Bowl',
    logo: 'https://i.imgur.com/xeqdhEx.png'
  },
  'Myrtle Beach Bowl': {
    name: 'Myrtle Beach Bowl',
    logo: 'https://i.imgur.com/lf1c2UK.png'
  },
  'New Mexico Bowl': {
    name: 'New Mexico Bowl',
    logo: 'https://i.imgur.com/7BnQl00.png'
  },
  'New Orleans Bowl': {
    name: 'New Orleans Bowl',
    logo: 'https://i.imgur.com/0G1gIfn.png'
  },
  'Orange Bowl': {
    name: 'Orange Bowl',
    logo: 'https://i.imgur.com/7aJ11Nf.png'
  },
  'Peach Bowl': {
    name: 'Peach Bowl',
    logo: 'https://i.imgur.com/LqUMqQ4.png'
  },
  'Pop-Tarts Bowl': {
    name: 'Pop-Tarts Bowl',
    logo: 'https://i.imgur.com/lR4DaQ3.png'
  },
  'Rate Bowl': {
    name: 'Rate Bowl',
    logo: 'https://i.imgur.com/qhirS22.png'
  },
  'Reliaquest Bowl': {
    name: 'Reliaquest Bowl',
    logo: 'https://i.imgur.com/3PYz5CQ.png'
  },
  'Rose Bowl': {
    name: 'Rose Bowl',
    logo: 'https://i.imgur.com/BgYEwpN.png'
  },
  'Salute to Veterans Bowl': {
    name: 'Salute to Veterans Bowl',
    logo: 'https://i.imgur.com/z9673BT.png'
  },
  'Sugar Bowl': {
    name: 'Sugar Bowl',
    logo: 'https://i.imgur.com/olBf0p9.png'
  },
  'Sun Bowl': {
    name: 'Sun Bowl',
    logo: 'https://i.imgur.com/VPQ1G7g.png'
  },
  'Texas Bowl': {
    name: 'Texas Bowl',
    logo: 'https://i.imgur.com/g30Jyaw.png'
  },
  'Xbox Bowl': {
    name: 'Xbox Bowl',
    logo: 'https://i.imgur.com/by2uPWl.png'
  }
}

// Helper function to get bowl logo by name
export const getBowlLogo = (bowlName) => {
  const bowl = bowlGames[bowlName]
  return bowl?.logo || null
}

// Get all bowl names as an array (for dropdowns, etc.)
export const bowlNames = Object.keys(bowlGames).sort()

// CFP Quarterfinal bowl games (NY6 bowls used in rotation)
export const cfpQuarterfinalBowls = ['Cotton Bowl', 'Orange Bowl', 'Rose Bowl', 'Sugar Bowl']

// Other NY6 bowls (Fiesta and Peach rotate as semifinal hosts)
export const cfpSemifinalBowls = ['Fiesta Bowl', 'Peach Bowl']
