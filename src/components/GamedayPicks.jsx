import { useState } from 'react'
import { getTeamRanking, calculateTeamRecordFromGames } from '../context/DynastyContext'
import { getContrastTextColor } from '../utils/colorUtils'

// ── Helpers ──────────────────────────────────────────────────────────────────

function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i)
  return Math.abs(h >>> 0)
}

function getOvr(dynasty, tid, year) {
  if (!tid || !year) return 75
  const t = dynasty?.teams?.[tid] ?? dynasty?.teams?.[String(tid)]
  const ovr =
    t?.byYear?.[year]?.teamRatings?.overall ??
    t?.byYear?.[String(year)]?.teamRatings?.overall ??
    t?.overall ??
    75
  return parseInt(ovr) || 75
}

function getRank(dynasty, tid, year) {
  return getTeamRanking(dynasty, tid, year)?.rank ?? null
}

function getRecord(dynasty, tid, year) {
  if (!tid) return { wins: 0, losses: 0 }
  return calculateTeamRecordFromGames(dynasty, tid, year)
}

function getTeamColor(dynasty, tid) {
  const t = dynasty?.teams?.[tid] ?? dynasty?.teams?.[String(tid)]
  return t?.primaryColor || t?.color || '#374151'
}

// Returns just the mascot word ("Wildcats") from a full name ("Kentucky Wildcats").
// Used in quips where mid-sentence grammar needs "the Wildcats" not "Kentucky Wildcats".
function mascot(name) {
  if (!name) return 'them'
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : name
}

// ── Probability model ─────────────────────────────────────────────────────────

// Deterministic PRNG in [0,1) seeded by a string (mulberry32). The same game
// always rolls the same value, so picks are stable across re-renders but differ
// per matchup and per analyst.
function seededRandom(str) {
  let a = djb2(str)
  a |= 0
  a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const clamp01 = (x) => Math.max(0.02, Math.min(0.98, x))

// Warp a probability around the 0.5 pivot: k>1 sharpens toward the favorite,
// 0<k<1 pulls toward a coin-flip, k<0 flips contrarian toward the underdog.
function sharpen(p, k) {
  return clamp01(0.5 + (p - 0.5) * k)
}

// Collapse everything we track about a team — rating, ranking, record — into a
// single "power" number. Higher = stronger.
function teamPower({ ovr, rank, wins, losses }) {
  const rankBonus = rank ? Math.max(0, 26 - Math.min(rank, 25)) * 1.2 : 0
  const games = wins + losses
  const winPct = games > 0 ? wins / games : 0.5
  const recordBonus = (winPct - 0.5) * 12
  return ovr + rankBonus + recordBonus
}

// Base probability the USER team wins, before any analyst personality is applied.
// Power gap runs through a logistic curve; home field nudges the margin.
function baseUserWinProb(ctx) {
  const userPow = teamPower({ ovr: ctx.userOvr, rank: ctx.userRank, wins: ctx.userWins, losses: ctx.userLosses })
  const oppPow  = teamPower({ ovr: ctx.oppOvr,  rank: ctx.oppRank,  wins: ctx.oppWins,  losses: ctx.oppLosses })
  let margin = userPow - oppPow
  if (!ctx.isNeutral) margin += ctx.isHome ? 3 : -3
  return clamp01(1 / (1 + Math.exp(-margin / 7)))
}

// ── Analyst definitions ───────────────────────────────────────────────────────
// Each analyst has a `skew(baseProb, ctx)` fn that bends the base user-win
// probability toward their personality, and a `quip` fn for their reasoning.
// The component rolls a seeded RNG against the skewed probability to land the
// final 'user' | 'opp' pick.

const ANALYSTS = [
  {
    id: 'desmond',
    name: 'Desmond',
    title: 'The Enthusiastic Wildcard',
    // Loves the disrespected team — flips contrarian toward the underdog.
    skew(p) {
      return sharpen(p, -0.45)
    },
    quip({ side, userName, oppName, gameKey }) {
      const m  = mascot(side === 'user' ? userName : oppName)
      const mo = mascot(side === 'user' ? oppName  : userName)
      const opts = [
        `The ${m} are DISRESPECTED and they know it. That's bulletin board material!`,
        `The whole country is sleeping on the ${m}?! Not me. Not today!`,
        `The ${m} have got that DOG in 'em. I'm riding with them all day!`,
        `The ${mo} fans acting like this is already over?! The ${m} are coming in angry today, I guarantee it.`,
        `Nobody is giving the ${m} any credit going into this game. That's exactly why I'm riding with them!`,
        `You hear that? That's the sound of EVERYBODY counting out the ${m}. I LOVE it!`,
        `The ${m} have been waiting all week for this. You can feel the energy. I'm ALL in!`,
        `Give me the ${m} and give me the points and give me ALL of it!`,
        `When the ${m} get their backs against the wall, that's when they're DANGEROUS. Today's the day!`,
        `The experts put the ${mo} on a pedestal. The ${m} are gonna knock 'em RIGHT off!`,
        `I've got a feeling in my BONES about the ${m}. This is an upset special, baby!`,
        `The ${m} are playing with a chip on their shoulder the size of a TRUCK. Lock it in!`,
        `Everybody wants the safe pick. NOT ME. The ${m} are my guys today!`,
        `The ${m} have nothing to lose and EVERYTHING to prove. That's a scary team!`,
        `The ${mo} better not blink, because the ${m} are coming and they are HUNGRY!`,
        `I watched these ${m} all week and let me tell you, they've got that LOOK in their eyes!`,
        `You wanna doubt the ${m}? Go ahead. They'll PROVE you wrong and I'll be right there with 'em!`,
        `The pressure's all on the ${mo} today. The ${m} are loose, they're fired up, they're MINE!`,
        `This is a TRAP game for the ${mo} and the ${m} are gonna spring it! Believe that!`,
        `The ${m} are the most underrated team in the country and I will SCREAM it from the rooftops!`,
        `My heart says ${m}. My gut says ${m}. We're rolling with the ${m}!`,
        `The ${mo} are looking past this one and the ${m} are gonna make 'em PAY for it!`,
        `Underdog of the week? The ${m}. Pick of the week? The ${m}. Easy!`,
        `Don't overthink it! The ${m} want it more and it's gonna SHOW today!`,
        `The ${m} have been doubted all season and they keep coming back. Why stop believing now?!`,
        `Send it! The ${m} are crashing this party and nobody saw it coming but ME!`,
        `The ${m} are gonna shock the world today and I'm calling it RIGHT NOW!`,
        `I don't care about the spread. I don't care about the rankings. The ${m} have HEART!`,
        `The ${m} smell blood and I'm telling you, they are NOT letting this one go!`,
        `Write it in PEN: the ${m} are pulling off the stunner today!`,
        `The locker room for the ${m} is BUZZING and I can feel it from here!`,
        `Everybody's laughing at the ${m}? They won't be laughing in the fourth quarter!`,
        `The ${m} live for moments EXACTLY like this. Big stage, no respect. Let's GO!`,
        `I believe in the ${m}. I believe in the underdog. I believe in CHAOS today!`,
        `The ${mo} are walking into a BUZZSAW and they have NO idea. The ${m}!`,
        `Call me crazy, call me whatever you want, the ${m} are winning this thing!`,
        `The ${m} got slept on all offseason and now it's WAKE UP time. I'm with 'em!`,
        `There's an upset brewing and the ${m} are at the center of it. Mark my words!`,
        `The ${m} have that never-say-die attitude and today they're gonna NEED it. Love it!`,
        `The whole world picked the ${mo}. The whole world is about to be WRONG!`,
        `The ${m} are fighting for respect today and there is NOTHING more dangerous than that!`,
        `You can't measure heart on a stat sheet. The ${m} have BUCKETS of it!`,
        `I'm planting my flag with the ${m} and I am NOT pulling it out of the ground!`,
        `The ${m} are the team nobody wants to play right now and I know exactly why!`,
        `Buckle up, because the ${m} are about to give us an INSTANT CLASSIC!`,
        `The ${m} have been overlooked one too many times. Today they make a STATEMENT!`,
        `Give me the dog. Give me the fight. Give me the ${m} every single time!`,
        `The ${mo} think they can just show up and win? The ${m} are gonna humble 'em!`,
        `I've seen that fire in the ${m} all year. Today it turns into an INFERNO!`,
        `The ${m} are the pick, the lock, and the love of my LIFE this week!`,
        `Nobody circles this game for the ${m}. I do. And I'm taking 'em!`,
        `The ${m} feed off doubt and right now they are FULL. Watch out!`,
        `The ${m} are gonna play four quarters of angry football. I CANNOT wait!`,
        `They told the ${m} they don't belong. Today they CRASH the party!`,
        `The ${m} have a point to prove and a chip on their shoulder. That's MY kind of team!`,
        `The ${mo} are getting all the love. The ${m} are getting all the WINS today!`,
        `I'm not here to play it safe. The ${m} are the upset of the YEAR!`,
        `The ${m} are the hungrier team, the angrier team, the BETTER team today!`,
        `The ${m} have been counted out so many times they've LOST count. Not me. They win!`,
        `Every dog has its day and TODAY belongs to the ${m}!`,
        `The ${m} are coming in with a CHIP and a prayer, and that's all they need from me!`,
        `The ${mo} better bring their best, because the ${m} are bringing their SOUL!`,
        `The ${m} are the most disrespected team in America and I'm fixing that TODAY!`,
        `I dare you to bet against the ${m}. I DOUBLE dare you. They win!`,
        `The ${m} got that underdog swagger and today it carries 'em all the way!`,
        `The ${m} are gonna run through a WALL today. I'm riding shotgun!`,
        `The ${mo} woke up the wrong team. The ${m} are FURIOUS and they're mine!`,
        `I trust the ${m}. I trust the fight. I trust the UPSET!`,
        `The ${m} have been the bridesmaid all year. Today they're the BRIDE!`,
        `The ${m} thrive when the lights are brightest and the doubters are loudest. They win!`,
        `The ${m} are gonna make every single hater eat their words today. LET'S GO!`,
        `There's magic in the air for the ${m} and I am all the way IN!`,
        `The ${m} got nothing to lose and a whole world to prove. That's terrifying. I love it!`,
        `The ${m} are the underdog and the underdog is my FAVORITE animal!`,
        `The ${mo} got the headlines. The ${m} are getting the HARDWARE today!`,
        `The ${m} are playing inspired football and I am inspired RIGHT BACK. They win!`,
        `I can FEEL it. The ${m} are gonna pull this off and the building's gonna shake!`,
        `The ${m} have a fire lit under 'em and today it BURNS down the favorite!`,
        `The ${m} are the dark horse and I'm betting the FARM on 'em!`,
        `Doubt the ${m} at your own risk. They're built for moments like THIS!`,
        `The ${m} are gonna fight tooth and nail and come out on TOP. Believe it!`,
        `The ${m} are the comeback kids and today's the BIGGEST comeback yet!`,
        `The ${m} got that dawg in 'em and that dawg is HUNGRY today!`,
        `The ${mo} are in for the shock of their LIVES. The ${m} are coming!`,
        `The ${m} have been the underdog all season and underdogs are UNDEFEATED in my heart!`,
        `I'm calling the upset, I'm calling it LOUD, and I'm calling the ${m}!`,
        `The ${m} are gonna leave it ALL on the field today and that's gonna be enough!`,
        `Nobody believes in the ${m} but me, and frankly, that's all they need!`,
        `The ${m} are the gritty, gutsy, GIVE-EM-HELL pick of the day!`,
        `The ${m} have a swagger right now that you just CAN'T teach. They win!`,
        `The ${mo} forgot to respect the ${m} and that mistake is gonna COST 'em!`,
        `The ${m} are riding a wave of disrespect straight to the UPSET. I'm surfing it too!`,
        `The ${m} are playing with house money and SWINGING for the fences. I love it!`,
        `The ${m} are the team of destiny today and destiny is on MY side!`,
        `The ${m} have been overlooked, underrated, and disrespected. Today they get EVEN!`,
        `I'm all in on the ${m}. Chips on the table. Heart on my sleeve. LET'S GO!`,
        `The ${m} are gonna stun the ${mo} and I'm gonna say I TOLD you so!`,
        `The ${m} have the heart of a champion and today the SCOREBOARD agrees!`,
        `The ${m} are the upset, the special, the WHOLE reason I do this job!`,
        `Believe in the ${m}. I do. With my whole CHEST. They win today!`,
      ]
      return opts[djb2((gameKey ?? '') + 'desmond') % opts.length]
    },
  },
  {
    id: 'rece',
    name: 'Rece',
    title: 'The Ringmaster',
    // Deadpan — leans the favorite with dry, inevitable certainty.
    skew(p) {
      return sharpen(p, 1.4)
    },
    quip({ side, userName, oppName, gameKey }) {
      const m  = mascot(side === 'user' ? userName : oppName)
      const mo = mascot(side === 'user' ? oppName  : userName)
      const opts = [
        `I'm not making a prediction. I'm just quietly noting that the ${m} are in this spot for a reason.`,
        `No bold take from me. I'll just leave the ${m} right there and let everyone think about it.`,
        `Has anyone checked in with the ${mo} recently? Because the ${m} have been on another level.`,
        `I'm just asking questions here. Why does everyone keep overlooking the ${m}?`,
        `Subtle observation: the ${m} tend to do exactly what people say they can't. Food for thought.`,
        `I won't say a word. I'll just gently slide the ${m} into the conversation and step back.`,
        `Curious thing about the ${m}. People stopped paying attention right when they got good.`,
        `No prediction. Just an observation that the ${mo} haven't seen anything like the ${m} yet.`,
        `I'm not here to be loud. I'm here to note the ${m} quietly, and let the scoreboard be loud later.`,
        `Funny. Everyone's so sure about the ${mo}. The ${m} love when everyone's so sure.`,
        `I'll simply place the ${m} on the table. You can do with that what you will.`,
        `Interesting how nobody mentions the ${m}. I find that telling.`,
        `Not a hot take. Just a warm, room-temperature note that the ${m} are being underestimated.`,
        `I have a question. When was the last time anyone watched the ${m} closely? Exactly.`,
        `The ${m}. I'll let that sit for a moment. Take your time.`,
        `I'm not predicting an upset. I'm just observing that the ${mo} should be a little more nervous.`,
        `Quietly, calmly, and without raising my voice: the ${m}.`,
        `No drama from me. Just a small footnote that the ${m} have been quietly excellent.`,
        `I'll only say this once, softly: keep an eye on the ${m}.`,
        `People want fireworks. I just want to point at the ${m} and walk away.`,
        `I'm not stirring the pot. I'm just noting the pot already has the ${m} in it.`,
        `A gentle reminder that the ${m} exist, and that they're quite good. That's all.`,
        `I'll leave the ${m} right here. Someone will figure it out eventually.`,
        `Hypothetically. If a team like the ${m} were primed for this moment, well. I'm not saying that.`,
        `The ${mo} have a fine plan. I just wonder if anyone told them about the ${m}.`,
        `No headline from me today. Just a quiet little note that says: the ${m}.`,
        `I'm not going to make a scene. I'm just going to mention the ${m} and let it breathe.`,
        `Riddle me this. Why is everyone so comfortable picking against the ${m}?`,
        `I'll be brief. The ${m}. That's the whole thought.`,
        `No fireworks, no confetti. Just the ${m}, sitting there, being correct.`,
        `I find it fascinating that the ${mo} are the popular pick. Fascinating.`,
        `I'm not saying the ${m} win. I'm saying I wouldn't be surprised. There's a difference.`,
        `Allow me to whisper something: the ${m}. That's it. That's the whisper.`,
        `The smart room is quietly moving toward the ${m}. I'm just letting you know.`,
        `I'll pose it as a question. What if the ${m} are simply better? Just a thought.`,
        `No grand statement. The ${m} have been doing this all year. People just stopped looking.`,
        `I'm going to do the unthinkable and trust the ${m}. Quietly. Without fanfare.`,
        `Here's a small thing I noticed. The ${m} don't lose the games they're supposed to win.`,
        `I'm not raising my voice. The ${m} raise theirs on the field. That's enough for me.`,
        `Some takes are loud. Mine is just the word ${m}, said once, with confidence.`,
        `I'll keep it understated. The ${mo} are walking into more than they bargained for.`,
        `A quiet little secret: the ${m} are the better team. Pass it on.`,
        `I'm not here to debate. I'm here to note the ${m} and let it stand.`,
        `The ${m}. No exclamation point. No drama. Just the facts.`,
        `I wonder, idly, if anyone's prepared for what the ${m} are about to do.`,
        `I'll let the others shout. I'll just nod toward the ${m} and smile.`,
        `People keep telling me the ${mo}. I keep watching the ${m}. Strange disconnect.`,
        `The understated pick of the day is the ${m}. I'll say no more.`,
        `I'm not making waves. The ${m} make the waves. I just point at them.`,
        `Consider this a quiet endorsement of the ${m}. Very quiet. But firm.`,
        `I'll be the calm voice in the room. The ${m}. Moving on.`,
        `Nobody asked, but the ${m} have been the more complete team for weeks now.`,
        `I'm not predicting fireworks. I'm predicting the ${m}. Often the same thing.`,
        `Let me just float this gently into the air: the ${m}.`,
        `I find the silence around the ${m} louder than any hype around the ${mo}.`,
        `No spectacle. The ${m} have quietly been one of the best teams nobody talks about.`,
        `I'll simply observe that the ${m} keep finding ways. That tends to continue.`,
        `The ${m}. I'm not going to oversell it. They don't need me to.`,
        `A modest little prediction, said softly: the ${m} take care of business.`,
        `I'm not here to make noise. I'm here to make the correct, quiet pick: the ${m}.`,
        `Worth noting, in a low voice: the ${mo} haven't faced anyone like the ${m}.`,
        `I'll leave a single breadcrumb for you. It leads to the ${m}.`,
        `No big swing here. Just the ${m}, calmly, as usual.`,
        `The ${m} are the answer. I'm not even raising my voice to tell you.`,
        `Some people scream their picks. I'll just lean in and murmur: the ${m}.`,
        `There's a quiet confidence in the ${m} locker room. I have the same confidence. Quietly.`,
        `I'm not going to argue. I'm just going to be right about the ${m}.`,
        `A small observation. The ${m} have been a step ahead all season. People missed it.`,
        `I'll let that thought marinate. The ${m}. Take all the time you need.`,
        `No grandstanding from me. The ${m} are the pick. Plain and simple.`,
        `I'll say it under my breath so only the smart ones catch it: the ${m}.`,
        `The ${mo} are the loud pick. The ${m} are the right one. I prefer the right one.`,
        `I'm just leaving this here, quietly. The ${m}. Don't tell anyone.`,
        `The understated truth of the day is the ${m}. No need to shout it.`,
        `I'll be the one calm head in a noisy room. The ${m}. Always the ${m}.`,
        `I noticed something small. The ${m} get better in the moments that matter. Keep that.`,
        `I'm not going to make this dramatic. The ${m} win. That's the quiet truth.`,
        `A gentle nudge in the right direction: the ${m}. You can thank me later.`,
        `The ${m} don't need hype. They need a scoreboard. They'll get one today.`,
        `I'll just say this calmly. The ${mo} are being overrated and the ${m} are not.`,
        `No fanfare. The ${m} are quietly the more dangerous team here.`,
        `I'm content to whisper it. The ${m}. The rest of you can shout the ${mo}.`,
        `Allow me one quiet sentence. The ${m} are better than the conversation suggests.`,
        `I'll note, without raising an eyebrow, that the ${m} keep getting underestimated.`,
        `The ${m}. Said once, said softly, said with absolute certainty.`,
        `I'm not in the prediction business today. I'm in the noticing business. I notice the ${m}.`,
        `A subtle little thought to leave you with: the ${m} are about to be right again.`,
        `I'll keep my voice down. The ${m} will make plenty of noise on their own.`,
        `People love the ${mo}. I quietly love the ${m}. We'll see who's smiling.`,
        `I'll be measured about it. The ${m} are the better team and they'll show it.`,
        `The quiet money, the smart money, the right money. It's all on the ${m}.`,
        `I'm just here to gently point out that the ${m} have been doing this all along.`,
        `No theatrics. The ${m}. That's the entire performance.`,
        `I'll murmur it one last time so it sinks in. The ${m}.`,
        `The ${m}. I'm not going to dress it up. It doesn't need dressing.`,
        `A calm, considered, completely quiet pick: the ${m}.`,
        `I'll let the room settle, then simply say it. The ${m}.`,
        `No drama, no debate, no doubt. The ${m}. Quietly. Confidently.`,
        `I'll leave you with one soft word. ${m}. Sit with it.`,
        `I'm not going to belabor it. The ${m} are right, and quietly, so am I.`,
      ]
      return opts[djb2((gameKey ?? '') + 'rece') % opts.length]
    },
  },
  {
    id: 'pat',
    name: 'Pat',
    title: 'The Professional Chaos Agent',
    // Pure theater — softens the favorite toward a toss-up, then leans hard
    // toward the road team (the user when away, the opponent when user is home).
    skew(p, ctx) {
      let pp = sharpen(p, 0.7)
      if (!ctx.isNeutral) pp += ctx.isHome ? -0.22 : 0.22
      return clamp01(pp)
    },
    quip({ side, userName, oppName, isNeutral, gameKey }) {
      const m  = mascot(side === 'user' ? userName : oppName)
      const mo = mascot(side === 'user' ? oppName  : userName)
      const opts = isNeutral ? [
        `*stands up* *removes jacket* The ${m}. LET'S. GO.`,
        `I have been building to this moment. The ${m}. Final answer.`,
        `The ${m} win. I said what I said. No further questions.`,
        `*loosens tie* *cracks knuckles* You want chaos? The ${m}. There's your chaos.`,
        `Neutral site, neutral field, completely UN-neutral take: the ${m}!`,
        `I've been on the wrong side of every game this week. Not this one. The ${m}!`,
        `*points at camera* The ${m}. Write it down. Frame it. Hang it on your wall.`,
        `No crowd to save the ${mo} today. The ${m} take it and I take a victory lap.`,
        `*stands on the desk* THE ${m.toUpperCase()}. *steps down calmly* Thank you.`,
        `Everyone's playing it safe. I don't own a safe. The ${m}!`,
        `I have studied this matchup for eleven seconds and I am CERTAIN. The ${m}.`,
        `The ${m} win and somewhere the ${mo} fans are already typing angry messages. Good.`,
        `*takes a deep breath* *exhales slowly* The ${m}. I've never felt more alive.`,
        `Big stage, bright lights, neutral turf. Made for the ${m}. Made for ME. Lock it.`,
        `I could play it down the middle. I refuse. The ${m}, all the way.`,
        `*slams hand on desk* The ${m}! *straightens papers* Anyway, moving on.`,
        `The committee, the analysts, the math nerds, they all say ${mo}. I say ${m}. I win.`,
        `Neutral field means no excuses. The ${m} have none. They just win.`,
        `*spins in chair once* The ${m}. The chair agrees with me.`,
        `I have a vision. In the vision, the ${m} win. The vision is never wrong. Usually.`,
        `The ${m} on a neutral field is my Roman Empire. I think about it constantly.`,
        `*rolls up sleeves* If we're doing this, we're DOING this. The ${m}.`,
        `No home crowd, no road crowd, just the ${m} crowd in my HEART. They win.`,
        `The ${mo} are the chalk. I am allergic to chalk. The ${m}.`,
        `*adjusts microphone* Testing, testing. The ${m} win. Mic works great.`,
        `I will plant my flag on this neutral field and the flag says ${m}.`,
        `This is a coin flip to everyone else. To me it's a layup. The ${m}.`,
        `*stares into the distance* I can see it. The ${m}. Lifting the trophy. It's beautiful.`,
        `The neutral site is where legends are made and the ${m} are about to be legends.`,
        `I'm not hedging. I'm not waffling. The ${m}. Carved in stone.`,
        `*cracks neck* Let's cause some problems. The ${m}.`,
        `Everyone wants a safe neutral-site pick. I want the ${m}. There's a difference.`,
        `The ${m} don't need a home crowd. They bring their own thunder. Lock it in.`,
        `*points to the sky* This one's for the ${m}. And the ${m} are for ME.`,
        `I have run the numbers in my head. The numbers said ${m}. My head is rarely wrong.`,
        `Neutral ground, level playing field, and STILL the ${m} are better. Easy call.`,
        `*buttons jacket* *unbuttons jacket* The ${m}. I'm too excited to dress myself.`,
        `The ${mo} brought their A-game. The ${m} brought their A-PLUS game. Done.`,
        `*whispers* the ${m} *normal voice* THE ${m.toUpperCase()}! Sorry. Got excited.`,
        `I am putting my entire reputation on the ${m}. What reputation? Exactly. The ${m}.`,
        `The trophy doesn't care who's the favorite. It's going to the ${m}. Period.`,
        `*flips pen in the air, catches it* The ${m}. Smooth. Just like that pick.`,
        `I refuse to overthink a neutral-site game. The ${m}. Brain off. Heart on.`,
        `The ${m} were BORN for the big neutral stage. I'm telling you, they LOVE this.`,
        `*taps temple* It's all up here. And up here, it's the ${m}. Trust the process.`,
        `No tiebreaker needed. The ${m} win going away. Print it.`,
        `*stands up, sits back down* The ${m}. I had to do that. You understand.`,
        `The ${m} are my final answer, my only answer, and my correct answer.`,
        `*snaps fingers* The ${m}. Just like that. Game over before it starts.`,
        `I came, I saw, I picked the ${m}. That's the whole story. The ${m} win.`,
      ] : [
        `I know, I KNOW what you're thinking, but the ${m}. *drops mic*`,
        `The crowd thought they had me. They THOUGHT. The ${m} win on the road!`,
        `The ${mo} fans, I love you, I really do, but it's the ${m}. Sorry. Not sorry.`,
        `*stands up* I'm going with the ${m} on the road and I will NOT be sitting back down.`,
        `Everyone in this building thinks I'm going with the ${mo}. Everyone in this building is wrong.`,
        `Road team. Hostile crowd. No problem. The ${m}. *adjusts collar*`,
        `You hear that crowd? The ${m} are about to make all of them VERY quiet.`,
        `I came here to make friends and pick the ${m}. And I'm all out of friends.`,
        `The ${mo} have home field. The ${m} have ME. Advantage: ${m}.`,
        `*walks to the edge of the stage* The ${m}. ON THE ROAD. And I sleep great tonight.`,
        `They're gonna boo me. Let 'em boo. The ${m} win and the boos turn into silence.`,
        `Everybody wants the home team. I want the ${m}. That's the difference between us.`,
        `Steal a win on the road? That's the ${m} story today and I'm telling it FIRST.`,
        `The ${mo} crowd is loud NOW. Ask me how loud they are in the fourth quarter. The ${m}!`,
        `*stares directly into the camera* The road ${m}. I have never been more sure of anything.`,
        `I'm taking the ${m} into this building and walking out with the W. Watch.`,
        `The smart money's on the ${mo}. The smart money has never met me. The ${m}!`,
        `*cups hand to ear* What's that? Silence? That's the ${m} quieting the crowd.`,
        `A hostile environment is a playground for the ${m}. They eat this up. Lock it.`,
        `I will pick the road ${m} in this gym, in this town, in front of God and everybody.`,
        `The ${mo} have all the noise. The ${m} have all the answers. The ${m}.`,
        `*points at the home crowd* You. Will. Be. Quiet. By halftime. The ${m}!`,
        `The road is where the ${m} do their best work. Always have. Always will.`,
        `Crowd noise is just free motivation for the ${m}. Thank you for the bulletin board.`,
        `*unfolds a piece of paper, reads it* It says the ${m}. I wrote it this morning. Genius.`,
        `They built this place to intimidate. The ${m} aren't intimidated. They're inspired.`,
        `I'm walking into the lion's den and betting on the LION. The road ${m}.`,
        `The ${mo} think home field is enough. It is not. The ${m} prove it today.`,
        `*covers ears* It's loud in here. It won't be for long. The ${m} win.`,
        `Give me the road dog with bite. Give me the ${m}. Every single time.`,
        `The crowd's gonna turn on the ${mo} in the third quarter. I've seen it before. The ${m}!`,
        `I'm the only person in this arena picking the ${m}. I'm also the only person who's right.`,
        `*takes off jacket, drapes it on chair* Getting comfortable, because the ${m} are winning this.`,
        `The ${m} love being the villain on the road. And I love being right about it.`,
        `They can boo me all night. They'll be silent when the ${m} finish the job.`,
        `The ${mo} crowd is a factor for about a quarter. The ${m} are a factor for four.`,
        `*grips the desk* I am locking in the road ${m} and you cannot pry me off it.`,
        `Home cooking? The ${m} brought their own meal. They're feasting today.`,
        `The road warrior pick of the day, the week, the YEAR: the ${m}.`,
        `The ${mo} fans came to celebrate. They're about to get a very rude surprise. The ${m}.`,
        `*stands defiantly* The road ${m}. Boo if you must. I'll be here being correct.`,
        `I don't fear a hostile crowd. I feed off it. So do the ${m}. Lock it in.`,
        `The ${m} silence buildings for a living. Today's building is next. Easy.`,
        `Everyone wears the home colors. I'm wearing ${m} colors. On the inside. The ${m}.`,
        `The ${mo} have the crowd, the comfort, and the calls. The ${m} still win. Wow.`,
        `*points to the exits* That's where the ${mo} fans go in the fourth. The ${m}!`,
        `I will go down with this ship and the ship is named the road ${m}. All aboard.`,
        `The ${m} hush a crowd better than anybody in the country. Watch them work.`,
        `They told me you can't win here. Tell that to the ${m}. They're about to.`,
        `The hostile crowd, the long trip, the hot building. None of it matters. The ${m}.`,
      ]
      return opts[djb2((gameKey ?? '') + 'pat') % opts.length]
    },
  },
  {
    id: 'nick',
    name: 'Saban',
    title: 'The No-Nonsense Professor',
    // Pure process, no emotion — sharpest lean to the favorite of the group.
    skew(p) {
      return sharpen(p, 1.9)
    },
    quip({ side, userName, oppName, gameKey }) {
      const m  = mascot(side === 'user' ? userName : oppName)
      const mo = mascot(side === 'user' ? oppName  : userName)
      const opts = [
        `The ${m} win the line of scrimmage. It's not complicated.`,
        `Talk about momentum all you want. The ${m} control the trenches. Same result.`,
        `The ${m} have the process. The other team does not. That's the pick.`,
        `The ${m} dominate up front. That's not a prediction. That's an analysis.`,
        `I'm not here to entertain. The ${m} win. Next question.`,
        `Discipline wins football games. The ${m} are the more disciplined team. Done.`,
        `The ${m} don't beat themselves. That's the whole game right there.`,
        `Everybody wants to talk about skill players. The ${m} win in the trenches. That's football.`,
        `The ${m} execute their assignments. You do that, you win. It's a simple game.`,
        `I don't deal in hype. I deal in tape. The tape says the ${m}.`,
        `The ${m} are more physical at the point of attack. Everything else is noise.`,
        `Toughness, technique, leverage. The ${m} have all three. That's the result.`,
        `The ${m} will run the ball and stop the run. That wins in November and it wins today.`,
        `Effort isn't a strategy. The ${m} have a strategy AND the effort. There's your answer.`,
        `The ${m} are well-coached and fundamentally sound. That's not flashy. It's just correct.`,
        `Field position, turnover margin, the trenches. The ${m} win all three. Math.`,
        `The ${m} don't panic. They trust the process and execute. That's why they win.`,
        `The ${m} have the better offensive line. In my experience, that team usually wins.`,
        `I'm not interested in the narrative. I'm interested in who blocks and tackles. The ${m}.`,
        `The ${m} will impose their will physically. The rest takes care of itself.`,
        `You win up front, you control the game. The ${m} control the game. That's the pick.`,
        `The ${m} prepare the right way all week. It shows up on Saturday. Every time.`,
        `Fundamentals don't take days off. Neither do the ${m}. That's why I have them.`,
        `The ${m} take care of the football and win the explosive plays. That's the formula.`,
        `The ${mo} have talent. Talent without discipline loses to the ${m}. Simple.`,
        `The ${m} tackle in space. Most teams don't. That's the margin right there.`,
        `I've seen this matchup a hundred times. The more physical team wins. The ${m}.`,
        `The ${m} don't flinch when it gets hard. That's a trait, and it shows up late.`,
        `Penalties, missed assignments, mental errors. The ${m} don't make them. They win.`,
        `The ${m} run the ball when everyone knows they're going to run it. That's dominance.`,
        `There's no substitute for being physical. The ${m} are physical. That's the pick.`,
        `The ${m} defense gets off the field on third down. That alone wins this game.`,
        `The ${m} are built for a four-quarter game. They wear teams down. They win.`,
        `I don't care who's favored. I care who's tougher. The ${m} are tougher.`,
        `The ${m} protect the quarterback and pressure the other one. Game over.`,
        `The ${m} play complementary football. Offense, defense, special teams in sync. That wins.`,
        `The ${mo} are a finesse team. Finesse doesn't hold up against the ${m}. It never does.`,
        `The ${m} finish their blocks and finish their tackles. That's the difference today.`,
        `The ${m} have an identity. The other team is still looking for one. That decides it.`,
        `I trust the ${m} in a close game because they don't make the critical mistake.`,
        `The ${m} control the clock and control the game. Ball control is mental toughness.`,
        `The ${m} win the hidden yardage. Field position is a discipline. They have it.`,
        `The ${m} are the more committed team to the run. That commitment pays off late.`,
        `The ${m} don't get rattled on the road or at home. They just play. They win.`,
        `The ${m} have the better front seven. Stop the run, win the game. The ${m}.`,
        `I've coached against teams like the ${m}. You can't out-tough them. You just lose.`,
        `The ${m} convert in short yardage. That's want-to. They have more want-to.`,
        `The ${m} are sound on the back end. No big plays given up. That's how you win.`,
        `The ${m} play their best football in the fourth quarter. That's conditioning and will.`,
        `The ${m} don't need trick plays. They line up and beat you. That's confidence.`,
        `The ${m} win the turnover battle because they prioritize it. It's not luck. It's habit.`,
        `The ${m} are physical at the skill positions too. Receivers who block. That wins.`,
        `The ${m} have answers when the game plan gets taken away. That's good coaching.`,
        `The ${m} are disciplined in the red zone. Touchdowns instead of field goals. That's the game.`,
        `The ${m} tackle better than anyone they'll face this year, including today. They win.`,
        `The ${m} understand situational football. Down and distance, clock, score. That's the edge.`,
        `The ${m} don't give up explosive plays. Make them earn it. They can't. The ${m}.`,
        `The ${m} are the more mature team. Maturity wins games people think are close.`,
        `The ${m} win the standard downs and the passing downs. That's complete football.`,
        `The ${m} have the better quarterback decision-maker. Don't turn it over, you win.`,
        `The ${m} play fast because they play assignment-sound. No hesitation. That's the pick.`,
        `The ${m} dominate time of possession when it matters. Late, that's a back-breaker.`,
        `The ${m} are built from the inside out. Lines first. That's how you build a winner.`,
        `The ${mo} rely on one or two players. The ${m} rely on a system. Systems win.`,
        `The ${m} get pressure with four. That lets them cover with seven. Game over.`,
        `The ${m} run downhill and tackle downhill. Physical at the point of attack. They win.`,
        `The ${m} don't lose composure when they're behind. They execute the next play. They win.`,
        `The ${m} have done it on the road, at home, and in big games. That résumé wins today.`,
        `The ${m} win the line of scrimmage on both sides. There's nothing left to discuss.`,
        `The ${m} have a quarterback who protects the ball. That's worth ten points. The ${m}.`,
        `The ${m} finish drives. Settling for three loses games. They don't settle. They win.`,
        `The ${m} are gap-sound against the run. You can't gash them. So you can't beat them.`,
        `The ${m} play with great pad level. Low man wins. They're the low man. They win.`,
        `The ${m} make the routine play routinely. That's what separates them. That's the pick.`,
        `The ${m} have a plan, a counter to the plan, and the discipline to run both. They win.`,
        `The ${m} win the special teams field-position battle. Hidden points. They add up.`,
        `The ${m} are the more conditioned team. The fourth quarter belongs to them.`,
        `The ${m} don't take plays off. Eleven hats to the ball. That's how they win.`,
        `The ${m} can win ugly. The other team needs it to be pretty. It won't be. The ${m}.`,
        `The ${m} stay ahead of the chains. That's offensive discipline. It wins the game.`,
        `The ${m} have a defensive front that travels. It doesn't matter where they play. They win.`,
        `The ${m} are coached to finish. Finish blocks, finish tackles, finish the game. The ${m}.`,
        `The ${m} take what the defense gives and don't force it. Patient football wins.`,
        `The ${m} win the early downs on defense. Get them in third and long. They win.`,
        `The ${m} are physical, disciplined, and conditioned. Pick the team with all three. The ${m}.`,
        `The ${m} don't get caught up in the moment. They execute the fundamentals. They win.`,
        `The ${m} have a run game that closes out games. That's how you protect a lead.`,
        `The ${m} defend the perimeter. Force it inside, where they're strongest. The ${m}.`,
        `The ${m} are the better-tackling team and the better-blocking team. That's the whole sport.`,
        `The ${m} win the moments inside the moments. The little battles. They add up to a win.`,
        `The ${m} don't flinch in a hostile environment. Composure is a skill. They have it.`,
        `The ${m} are sound, physical, and detailed. There's no shortcut around that. They win.`,
        `The ${m} protect, run, and stop the run. Do those three, you win. They do. The ${m}.`,
        `The ${m} have veteran leadership up front. That steadies everything else. The ${m}.`,
        `The ${m} win the game before kickoff with their preparation. The score just confirms it.`,
        `The ${m} make the other team one-dimensional. One-dimensional teams lose. The ${m}.`,
        `The ${m} are the more fundamentally sound football team. That always wins out. Always.`,
        `The ${m} do the simple things at a high level. Football is a simple game. The ${m}.`,
        `The ${m} win first and second down. Put a team in third and long, you own them. The ${m}.`,
        `The ${m} block well, tackle well, and don't turn it over. That's the entire game plan. They win.`,
      ]
      return opts[djb2((gameKey ?? '') + 'nick') % opts.length]
    },
  },
  {
    id: 'kirk',
    name: 'Kirk',
    title: 'The Golden-Boy Realist',
    // Film study, stays measured — modest lean to the favorite, lots of room
    // for an upset call.
    skew(p) {
      return sharpen(p, 1.15)
    },
    quip({ side, userName, oppName, gameKey }) {
      const m  = mascot(side === 'user' ? userName : oppName)
      const mo = mascot(side === 'user' ? oppName  : userName)
      const opts = [
        `The ${m} are the better football team. The quarterback play, the depth, it's not close.`,
        `I've watched the film. The ${m} control the line of scrimmage and win this game.`,
        `The ${m}. I say that having studied both rosters extensively this week.`,
        `Look, I respect the opponent, but the ${m} have three distinct schematic advantages here.`,
        `The ${m} win. Their secondary has been elite all season, and it shows up in a game like this.`,
        `When I break down the tape, the ${m} are simply more balanced on both sides of the ball.`,
        `The ${m} have the quarterback you trust in a tight fourth quarter. That's why I have them.`,
        `I keep coming back to the matchups, and the ${m} win the ones that matter most.`,
        `The ${m} are sound in all three phases. Offense, defense, special teams, no weakness to exploit.`,
        `Watch how the ${m} handle pressure. They've answered every test on film this year.`,
        `The ${m} have the better offensive line, and in a game like this, that's usually the difference.`,
        `I love their preparation. The ${m} don't make the kind of mistakes that lose big games.`,
        `The ${m}. Their run game sets up everything else, and it's been the most consistent unit I've watched.`,
        `Schematically, the ${m} create mismatches the other team just can't account for.`,
        `The ${m} have the edge in the trenches and the edge at quarterback. That's a winning combination.`,
        `I've charted every drive, and the ${m} are the cleaner, more efficient football team.`,
        `The ${m} win the explosive-play battle. On film, that's the single best predictor of who wins.`,
        `Their coaching staff makes the right in-game adjustments. The ${m} are tough to beat for that reason.`,
        `The ${m} take care of the football. Turnover margin tells the story, and it favors them.`,
        `I respect both teams, but the ${m} have a clear plan and the personnel to run it. That's the pick.`,
        `The ${m} defense travels. They show up every week on tape, and they'll show up here.`,
        `Depth wins November football. The ${m} have it, and I think it shows up late in this one.`,
        `The ${m} are more physical and more disciplined. When I watch it back, it's a comfortable call.`,
        `Give me the ${m}. The film says they're the better-coached, better-conditioned team.`,
        `The ${m} have the better third-down offense, and that's where games are decided.`,
        `I've watched the ${mo} too, and they don't have an answer for what the ${m} do up front.`,
        `The ${m} win the matchup at receiver. That's the edge that tilts this whole game.`,
        `The ${m} are elite on early downs. Stay ahead of the chains, and you control everything. They do.`,
        `The tape doesn't lie. The ${m} are faster at all three levels of the defense.`,
        `The ${m} have a quarterback who reads coverage at an elite level. That decides close games.`,
        `I keep watching the ${m} offensive line, and they win their one-on-ones consistently. That's the pick.`,
        `The ${m} are the more explosive team and the more disciplined team. That combination is rare. They win.`,
        `Their red-zone offense is the best I've charted this week. The ${m} finish drives. That wins it.`,
        `The ${m} have the better edge rushers, and the ${mo} have a question mark at tackle. Big edge.`,
        `I trust the ${m} in the fourth quarter. Their conditioning and their quarterback show up late.`,
        `The ${m} run the ball efficiently and defend the run efficiently. That's a recipe for a win.`,
        `On film, the ${m} are the more physical team at the point of attack. I'm taking them.`,
        `The ${m} have the cleaner special teams. Field position is the quiet edge that decides this.`,
        `The ${m} defensive line wins on early downs, and that dictates the whole game. The ${m}.`,
        `I've studied the ${mo} secondary, and the ${m} have the receivers to expose it. That's the pick.`,
        `The ${m} are the better team after halftime. Their staff adjusts, and it shows on the tape.`,
        `The ${m} have the quarterback, the line, and the run game. That trio wins these games.`,
        `The ${m} create negative plays on defense. Get teams behind schedule, and you win. They do.`,
        `The ${m} protect the football and protect the quarterback. Those two things win games. They win.`,
        `I keep coming back to the ${m} front seven. They're the best unit on the field today.`,
        `The ${m} have the more reliable kicking game, and in a one-score game, that matters. The ${m}.`,
        `The ${m} are balanced. They can win it on the ground or through the air. That's hard to defend.`,
        `The ${mo} have a good story, but the ${m} have the better roster and the better quarterback.`,
        `The ${m} win the line of scrimmage on both sides. That's the foundation of my pick.`,
        `The ${m} have the depth to weather injuries and a long game. That depth wins it late.`,
        `I charted the third-down tape, and the ${m} are the more efficient team in those moments. The pick.`,
        `The ${m} have the better safety play, and that erases the explosive plays. That's the difference.`,
        `The ${m} run a system that's hard to prepare for in one week. The ${mo} won't have answers.`,
        `The ${m} are the more experienced team at the key positions. Experience shows in big games.`,
        `The ${m} have the quarterback who doesn't lose the game for you. That's worth a lot. The ${m}.`,
        `On tape, the ${m} are the more sound tackling team. That keeps everything in front. They win.`,
        `The ${m} have a clear identity. The ${mo} are still searching for one. The ${m} take it.`,
        `The ${m} win the trenches and control the clock. That's the blueprint, and they execute it.`,
        `I like the ${m} matchup at tight end. It's a mismatch the ${mo} can't cover. That's the edge.`,
        `The ${m} have the better run-after-catch players. Those hidden yards add up. The ${m}.`,
        `The ${m} are the more complete team. I've watched both, and it's not particularly close.`,
        `The ${m} defend the deep ball as well as anyone. That takes away the upset path. The ${m}.`,
        `The ${m} have the better offensive coordinator in terms of in-game adjustments. That wins it.`,
        `The ${m} are elite in short-yardage on both sides. Those situations decide tight games. They win.`,
        `I've watched the ${m} win in different ways. That versatility is why I trust them today.`,
        `The ${m} have the quarterback mobility to extend plays. That's a real edge in a close one.`,
        `The ${m} are the better-conditioned team. The fourth quarter has belonged to them all year.`,
        `The ${m} win the first-quarter matchups, and that early control sets the tone. The ${m}.`,
        `The ${m} have the better pass rush, and pressure changes everything. That's my pick.`,
        `I trust the ${m} offensive line in pass protection. Clean pockets win games. The ${m}.`,
        `The ${m} are detailed in the kicking game and the return game. Those margins matter. The ${m}.`,
        `The ${m} have the better blend of speed and physicality. That's tough to match. They win.`,
        `The ${m} take care of the ball in bad weather and on the road. That travels. The ${m}.`,
        `The ${m} have a defense that creates turnovers. That's a skill, and it decides this game.`,
        `The ${m} are the more disciplined team with penalties. Clean football wins. The ${m}.`,
        `I've studied the ${m} closing minutes all year. They execute when it matters. The pick.`,
        `The ${m} have the better depth on the defensive line. Fresh legs win the fourth quarter. The ${m}.`,
        `The ${m} win the matchup up the middle, and that's where this game is decided. The ${m}.`,
        `The ${m} have the quarterback who elevates everyone around him. That's the edge today.`,
        `The ${m} are sound situationally. Two-minute, red zone, third down. They win those reps.`,
        `The ${m} have the better run defense, and that forces the ${mo} into long down and distance.`,
        `I keep watching the ${m} secondary make plays on the ball. That's the difference-maker today.`,
        `The ${m} are the more balanced offense, and balance is what holds up in a big game. The ${m}.`,
        `The ${m} have the coaching edge in this matchup. Preparation and adjustments favor them.`,
        `The ${m} win the explosive plays and limit them on defense. That's the whole game. The ${m}.`,
        `The ${m} have a quarterback who's seen every look. He won't be surprised today. The ${m}.`,
        `The ${m} are stout against the run and disruptive on passing downs. That's a complete defense.`,
        `I've watched the ${m} respond to adversity all year. They won't blink today. The pick.`,
        `The ${m} have the better skill-position depth. They can keep coming in waves. The ${m}.`,
        `The ${m} control the line, control the clock, and control the game. That's my read on it.`,
        `The ${m} have the special-teams edge that flips field position late. That decides it. The ${m}.`,
        `The ${m} are the cleaner team in all three phases. The film makes this a confident call.`,
        `The ${m} have the better quarterback and the better protection. That usually settles it. The ${m}.`,
        `The ${m} create more pressure with fewer rushers. That lets them cover. That's the edge.`,
        `The ${m} are the more physical team, and physical teams win in the second half. The ${m}.`,
        `I trust the ${m} to win the situational moments. They've earned that trust on tape. The ${m}.`,
        `The ${m} have the better run game and the better play-action off it. That combination wins.`,
        `The ${m} defend the field sideline to sideline. Speed on defense wins games. The ${m}.`,
        `The ${m} are the more sound, more talented, better-coached team. The film says so. The ${m}.`,
        `The ${m}. I've studied the matchups all week, and they win where it matters most.`,
      ]
      return opts[djb2((gameKey ?? '') + 'kirk') % opts.length]
    },
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function GamedayPicks({
  dynasty,
  userTid,
  opponentTid,
  isHome,
  isNeutral,
  gameKey,
  userTeamName,
  opponentName,
  userLogoUrl,
  oppLogoUrl,
  year: yearProp,
  week: weekProp,
  mini = false,
}) {
  const [activeId, setActiveId] = useState(null)

  if (!dynasty || !userTid || !opponentTid) return null

  // year defaults to the dynasty's current pointer, but callers on a team page
  // (viewing a past season) or a specific game pass their own.
  const year = yearProp ?? dynasty.currentYear

  const userOvr  = getOvr(dynasty, userTid, year)
  const oppOvr   = getOvr(dynasty, opponentTid, year)
  const userRank = getRank(dynasty, userTid, year)
  const oppRank  = getRank(dynasty, opponentTid, year)
  const userRec  = getRecord(dynasty, userTid, year)
  const oppRec   = getRecord(dynasty, opponentTid, year)

  const ctx = {
    userOvr, oppOvr, userRank, oppRank,
    userWins: userRec.wins, userLosses: userRec.losses,
    oppWins:  oppRec.wins,  oppLosses:  oppRec.losses,
    isHome, isNeutral, gameKey,
    userName: userTeamName || 'Your Team',
    oppName:  opponentName || 'Opponent',
  }

  // Base win probability from the matchup, then each analyst skews it to their
  // personality and a seeded roll lands their final pick. Seeding on gameKey +
  // analyst id keeps picks stable per matchup (no reshuffle on re-render).
  const baseProb = baseUserWinProb(ctx)

  const picks = ANALYSTS.map(a => {
    const pUser = a.skew(baseProb, ctx)
    const roll  = seededRandom((gameKey ?? '') + a.id)
    const side  = roll < pUser ? 'user' : 'opp'
    const quip  = a.quip({ ...ctx, side })
    const conf  = side === 'user' ? pUser : 1 - pUser   // their confidence in their own pick
    return { ...a, side, quip, conf }
  })

  const activePick = picks.find(p => p.id === activeId) ?? null

  const userColor = getTeamColor(dynasty, userTid)
  const oppColor  = getTeamColor(dynasty, opponentTid)

  // Mini mode — just the 5 tinted pick boxes (analyst name + picked-team logo),
  // no quote strip / card chrome. Used inline under the dashboard game-entry row.
  if (mini) {
    return (
      <div className="grid grid-cols-5 rounded-lg overflow-hidden" style={{ border: '1px solid var(--surface-3)' }}>
        {picks.map((analyst, idx) => {
          const pickUser = analyst.side === 'user'
          const logoUrl  = pickUser ? userLogoUrl : oppLogoUrl
          const teamColor = pickUser ? userColor : oppColor
          const txt = getContrastTextColor(teamColor)
          return (
            <div
              key={analyst.id}
              className="flex flex-col items-center gap-1 py-2 px-0.5"
              style={{
                backgroundColor: teamColor,
                borderRight: idx < 4 ? '1px solid rgba(0,0,0,0.18)' : 'none',
              }}
            >
              <div
                className="text-center"
                style={{ fontSize: 8, fontWeight: 700, letterSpacing: '1px', color: txt, opacity: 0.85, textTransform: 'uppercase' }}
              >
                {analyst.name}
              </div>
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0 bg-white"
                style={{ width: 28, height: 28, boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
              >
                {logoUrl
                  ? <img src={logoUrl} alt="" style={{ width: 19, height: 19, objectFit: 'contain' }} />
                  : <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 10, color: teamColor }}>?</span>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="media-card reveal">

      {/* Quote strip — sits ABOVE the picks row */}
      <div
        style={{
          minHeight: 44,
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'var(--surface-1)',
          borderBottom: '1px solid var(--surface-3)',
          transition: 'background-color 0.15s ease',
        }}
      >
        {activePick ? (
          <div className="flex items-start gap-2.5">
            <div className="flex-shrink-0 pt-0.5">
              <div
                className="label-xs font-bold"
                style={{
                  letterSpacing: '1.5px',
                  fontSize: '9px',
                  color: 'var(--text-tertiary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {activePick.name.toUpperCase()}
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
                fontStyle: 'italic',
              }}
            >
              "{activePick.quip}"
            </div>
          </div>
        ) : (
          <h2 className="font-bold text-txt-primary m-0 text-sm" style={{ width: '100%' }}>
            Gameday Picks
            <span className="font-normal text-txt-tertiary">{' · Hover an analyst to hear their take'}</span>
          </h2>
        )}
      </div>

      {/* Picks row — each analyst's column is tinted with the color of the
          team they picked; logo sits in a white circle. */}
      <div className="grid grid-cols-5">
        {picks.map((analyst, idx) => {
          const pickUser = analyst.side === 'user'
          const logoUrl  = pickUser ? userLogoUrl : oppLogoUrl
          const teamName = pickUser ? userTeamName : opponentName
          const teamAbbr = pickUser
            ? (userTeamName?.split(' ').pop() || 'US')
            : (opponentName?.split(' ').pop() || 'OPP')
          const teamColor = pickUser ? userColor : oppColor
          const txt = getContrastTextColor(teamColor)
          const isActive = activeId === analyst.id

          return (
            <div
              key={analyst.id}
              className="flex flex-col items-center px-1 py-3 gap-2 cursor-pointer transition-[filter]"
              style={{
                borderRight: idx < 4 ? '1px solid rgba(0,0,0,0.18)' : 'none',
                backgroundColor: teamColor,
                filter: isActive ? 'brightness(1.12)' : 'none',
              }}
              // Hover (mouse/pen only) drives the active analyst on desktop.
              // Touch is deliberately excluded — a synthesized hover on first
              // tap is what forced the old "tap twice" behavior on mobile; there
              // a single onClick selects.
              onPointerEnter={(e) => { if (e.pointerType !== 'touch') setActiveId(analyst.id) }}
              onPointerLeave={(e) => { if (e.pointerType !== 'touch') setActiveId(null) }}
              onClick={() => setActiveId(isActive ? null : analyst.id)}
            >
              {/* Analyst name */}
              <div
                className="label-xs text-center"
                style={{
                  letterSpacing: '2px',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: txt,
                  opacity: isActive ? 1 : 0.75,
                }}
              >
                {analyst.name.toUpperCase()}
              </div>

              {/* Team logo in a white circle */}
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0 bg-white"
                style={{
                  width: 44,
                  height: 44,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={teamName}
                    style={{ width: 30, height: 30, objectFit: 'contain' }}
                  />
                ) : (
                  <span
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 13,
                      color: teamColor,
                      letterSpacing: '0.5px',
                    }}
                  >
                    {teamAbbr.slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
