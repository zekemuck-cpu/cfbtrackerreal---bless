// Bowl game logos
export const bowlLogos = {
  "68 Ventures Bowl": "https://i.imgur.com/OOIGJCr.png",
  "Alamo Bowl": "https://i.imgur.com/wDSelNH.png",
  "Arizona Bowl": "https://i.imgur.com/Ck2jcTH.png",
  "Armed Forces Bowl": "https://i.imgur.com/WFRC2rG.png",
  "Birmingham Bowl": "https://i.imgur.com/2btYX7l.png",
  "Boca Raton Bowl": "https://i.imgur.com/SWMoXUA.png",
  "Citrus Bowl": "https://i.imgur.com/3KrAX4V.png",
  "Cotton Bowl": "https://i.imgur.com/cvNsbR1.png",
  "Cure Bowl": "https://i.imgur.com/QqdbIth.png",
  "Duke's Mayo Bowl": "https://i.imgur.com/f9kg4Lk.png",
  "Famous Idaho Potato Bowl": "https://i.imgur.com/hOzY3XW.png",
  "Fenway Bowl": "https://i.imgur.com/1wWyoBs.png",
  "First Responder Bowl": "https://i.imgur.com/LLlM8Su.png",
  "Frisco Bowl": "https://i.imgur.com/AZ3Lwyb.png",
  "GameAbove Sports Bowl": "https://i.imgur.com/vVO4Bfq.png",
  "Gasparilla Bowl": "https://i.imgur.com/4ViIqIi.png",
  "Gator Bowl": "https://i.imgur.com/RBsrSa2.png",
  "Hawaii Bowl": "https://i.imgur.com/8biinJU.png",
  "Holiday Bowl": "https://i.imgur.com/56ObibZ.png",
  "Independence Bowl": "https://i.imgur.com/ZmNc2YY.png",
  "LA Bowl": "https://i.imgur.com/TQFoP9o.png",
  "Las Vegas Bowl": "https://i.imgur.com/gXNMvnh.png",
  "Liberty Bowl": "https://i.imgur.com/FRDwnFd.png",
  "Military Bowl": "https://i.imgur.com/LmmGrsL.png",
  "Music City Bowl": "https://i.imgur.com/xeqdhEx.png",
  "Myrtle Beach Bowl": "https://i.imgur.com/lf1c2UK.png",
  "New Mexico Bowl": "https://i.imgur.com/7BnQl00.png",
  "New Orleans Bowl": "https://i.imgur.com/0G1gIfn.png",
  "Orange Bowl": "https://i.imgur.com/7aJ11Nf.png",
  "Pop-Tarts Bowl": "https://i.imgur.com/lR4DaQ3.png",
  "Rate Bowl": "https://i.imgur.com/qhirS22.png",
  "Reliaquest Bowl": "https://i.imgur.com/3PYz5CQ.png",
  "Rose Bowl": "https://i.imgur.com/BgYEwpN.png",
  "Salute to Veterans Bowl": "https://i.imgur.com/z9673BT.png",
  "Sugar Bowl": "https://i.imgur.com/olBf0p9.png",
  "Sun Bowl": "https://i.imgur.com/VPQ1G7g.png",
  "Texas Bowl": "https://i.imgur.com/g30Jyaw.png",
  "Xbox Bowl": "https://i.imgur.com/by2uPWl.png",
  // CFP Bowl Games
  "Peach Bowl": "https://i.imgur.com/LqUMqQ4.png",
  "Fiesta Bowl": "https://i.imgur.com/Fwx8H4K.png",
  "National Championship": "https://i.imgur.com/DjoLqsP.png"
}

// Get bowl logo by name
export function getBowlLogo(bowlName) {
  return bowlLogos[bowlName] || null
}

// Get all bowl names
export function getAllBowlNames() {
  return Object.keys(bowlLogos).sort()
}
