/**
 * Knob-fragment library — the literal prompt-text snippets each knob
 * option contributes to the final composed prompt.
 *
 * Shape: { [knobId]: { [optionId]: 'fragment text' } }
 *
 * Fragments are written as short, imperative instructions to the AI.
 * They get stitched together by compose.js into the prompt's header
 * block. Fragments may reference `${teamA}` and `${teamB}` placeholders
 * — compose.js substitutes them with the actual team names from the
 * resolved slots before emitting.
 *
 * Keep fragments brief — a sentence or two each. The point is to
 * shift the AI's framing, not to over-specify; data + task carry
 * the substance.
 */

export const KNOB_FRAGMENTS = {
  voice: {
    'espn-beat':
      "You write in the style of an ESPN.com beat writer. Use an inverted-pyramid news lede (5 W's first, details after). Third-person, sober, balanced. No first-person. Don't editorialize — let facts speak. Quote only sources that were supplied to you; never invent quotes.",
    'athletic-feature':
      "You're writing a long-form feature for The Athletic. Lead with scene-setting or character, not with the score. Build a narrative arc with stakes and reversals. Named characters. Sensory detail where the data supports it. Avoid game-recap clichés ('all over them', 'punched in', etc.).",
    'hometown-reporter':
      "You write for the hometown newspaper covering ${teamA}. Name every key contributor by full name and class. Add regional color where natural (school, hometown, recruiting class). News-forward but loyal — when in doubt, lead with ${teamA}'s angle.",
    'fan-blog':
      "You write for ${teamA}'s fan blog. First-person plural ('we beat them', 'our defense', 'they couldn't stop us'). Emotional, opinionated, pro-${teamA}. Skip the journalistic balance — fans came here to celebrate or vent. Editorialize freely about implications, but don't fabricate stats or events.",
    'color-commentator':
      "You're a color commentator describing what just happened with in-the-moment energy. Conversational, sentence fragments are fine, exclamations when earned. Call back to specific plays. Use 'you' to address the listener occasionally.",
    'position-coach':
      "You're a position coach writing an internal film-room / scouting memo. Technical, jargon OK (cover-2, off-tackle power, 11 personnel). Skip storytelling — get to observations and actions. Numbered points. Internal voice, not public-facing.",
    'scout':
      "You're a college-football scout writing a bullet-heavy scouting report. Lead each section with a 1-sentence grade or projection. Strengths, weaknesses, projection, flags. No prose paragraphs — bullets only.",
    'recruiting-analyst':
      "You're a 247Sports-style recruiting analyst. Position-need framing, dev-trait awareness, class-impact context. Sales-credible: you can sell the program's pitch without lying about facts.",
    'plain-narrator':
      "Neutral narrator voice. No persona affect, no 'as a fan' or 'as a coach' framing. Just clear, direct exposition of the data.",
  },

  perspective: {
    'team-a':
      "Frame the analysis from ${teamA}'s perspective — their goals, their decisions, what they need to do. ${teamB} appears as the opponent in the analysis but the narrative center is ${teamA}.",
    'team-b':
      "Frame the analysis from ${teamB}'s perspective — their goals, their decisions, what they need to do. ${teamA} appears as the opponent in the analysis but the narrative center is ${teamB}.",
    'neutral':
      "Treat both teams as equally weighted subjects of the analysis. No rooting interest. Cover both sides' situations symmetrically.",
  },

  audience: {
    'general-fan':
      "Your reader is a general college-football fan. Accessible language, no insider jargon without a quick gloss. Context-heavy — assume they may not know this specific program well.",
    'hardcore-fan':
      "Your reader follows this program closely. Assume they know the roster, the schedule, the recent history. Skip the basics. Don't define common football terms or program traditions.",
    'coach':
      "Your reader is a coach. They want to know what to DO about this. Lead with implications, not exposition. Action-oriented recommendations. Assume they know the football side cold.",
    'scout':
      "Your reader is a scout. Talent-focused. Projection-aware. Frame everything in terms of what players can do, where they fit at the next level, and what's a flag.",
    'recruit':
      "Your reader is a high-school prospect being recruited. Translate everything into what playing here would mean for THEM — playing time, development, exposure, the program's pitch. Sell without lying.",
    'recruiting-analyst':
      "Your reader is a recruiting analyst. Frame everything in class-impact terms. Position need, dev trait fit, where this player slots in a depth chart, what the class trajectory looks like.",
    'casual-visitor':
      "Your reader has never followed this program before. Assume nothing — define everything in passing. Make the piece read for someone who stumbled in from a Google search.",
  },

  tone: {
    'analytical':
      "Tone: dry, data-first, sober. Numbers carry the argument. No exclamation points. Avoid emotional language.",
    'conversational':
      "Tone: relaxed and conversational. Talk to the reader like a friend over a drink. Contractions are fine. Use 'you' occasionally.",
    'hype':
      "Tone: energized. Punchy sentences. Strong verbs. Exclamation points are fine when earned. Lean into the moments.",
    'restrained':
      "Tone: measured. Understate the dramatic. Let the reader supply the emotion — never overplay your hand.",
    'polemical':
      "Tone: pointed. Take a side and defend it forcefully. Direct language, no hedging. Disagree with the consensus when you have grounds.",
    'humorous':
      "Tone: light and witty. Land a joke when the moment earns it. Wordplay welcome. Don't force humor when the data is grim — read the room.",
    'dramatic':
      "Tone: cinematic. Treat the moments like scenes. Stakes, reversals, weight. Use vivid verbs and well-placed pauses. Don't overdo it — earn the drama.",
    'urgent':
      "Tone: high-stakes, now-now-now. Short sentences. Active voice. The reader should feel the clock running.",
    'reflective':
      "Tone: thoughtful and retrospective. Pull back from the moment. Ask what it meant, what it cost, what it set up next.",
    'snarky':
      "Tone: sarcastic and biting. Dry asides, eyerolls allowed. Keep it sharp but not cruel — punch up at decisions and trends, not at individual kids.",
    'reverent':
      "Tone: respectful, awed where earned. Treat moments of greatness with the weight they deserve. No irony, no winking.",
    'blunt':
      "Tone: blunt and direct. No fluff, no softening. Say it plain. If something was bad, call it bad.",
    'wistful':
      "Tone: wistful. There's a what-could-have-been undercurrent. Let the bittersweetness sit without explaining it.",
    'celebratory':
      "Tone: triumphant and celebratory. Lean into the win. Name the heroes. Let the joy carry the piece.",
    'somber':
      "Tone: somber. Treat losses, ends, and injuries with seriousness. No deflective humor. Reflect the weight of the moment.",
    'playful':
      "Tone: playful and cheeky. Have fun with the writing. Asides, light teasing, well-placed jabs. Stay warm, never mean.",
  },

  length: {
    'headline':
      "Target length: 1–2 sentences MAX. This is a headline, not an article. Cut everything but the core point.",
    'brief':
      "Target length: 1–2 short paragraphs (~150 words). Cut every word that isn't earning its place. Pick the single most important angle and stick to it.",
    'standard':
      "Target length: 3–5 paragraphs (~400–600 words). Build out the 2–3 most important points. Don't pad.",
    'deep':
      "Target length: 8+ paragraphs (~1000+ words). Take the time the subject needs. Cover the main angles fully. Don't rush — but also don't pad.",
    'bullets-only':
      "Format the entire response as a structured bulleted list. No flowing prose. Headers + bullets only. Each bullet stands alone.",
  },

  outputStyle: {
    'plain':
      "Output as PLAIN TEXT. Do NOT use any markup — no Markdown, no HTML, no asterisks for bold, no pound signs for headers, no bullet characters. Just words and line breaks. Use ALL-CAPS for emphasis if absolutely needed.",
    'markdown':
      "Output as Markdown. Use `#` / `##` headers, `**bold**`, `_italic_`, `-` bullets, `>` blockquotes, and fenced code blocks where appropriate. Render numbered lists with `1.` etc.",
    'html':
      "Output as valid HTML — `<h2>`, `<h3>`, `<p>`, `<ul>`/`<li>`, `<strong>`, `<em>`, `<blockquote>`. Do not include `<html>` / `<head>` / `<body>` wrappers — just the inner content. No inline styles, no class attributes.",
    'richtext':
      "Use light visual formatting: line breaks, bold for emphasis, simple bullet characters (• or -). Keep markup minimal — this output will be pasted into a rich-text editor like Google Docs or Word.",
    'bbcode':
      "Output as BBCode for a forum. Use `[b]bold[/b]`, `[i]italic[/i]`, `[url]…[/url]`, `[quote]…[/quote]`, `[list][*]item[/list]`. No Markdown, no HTML.",
  },

  format: {
    'prose':
      "Output as flowing prose paragraphs. No headers, no bullets, no numbered lists unless they're inside a paragraph.",
    'headers':
      "Use H2 headers (##) to break the piece into 3–5 sections. Each section is 1–3 paragraphs of prose under its header.",
    'bulleted':
      "Output as a bulleted list. Group related bullets under brief H3 sub-headers (###) when it helps. No prose paragraphs.",
    'qa':
      "Output as a series of Question / Answer pairs. Each question is bold (**Q:**), each answer is 1–3 sentences below it. Pick the 4–6 questions a smart reader would actually ask.",
    'memo':
      `Output as an internal memo with these sections, in this order:
**SUMMARY** — 2–3 sentence executive summary
**CONTEXT** — what's the situation
**FINDINGS** — numbered observations from the data
**RECOMMENDATIONS** — numbered actions
Use bold for section labels. Keep each section tight.`,
    'thread':
      "Output as a numbered Twitter / X thread. Each tweet ~280 characters. Number them 1/, 2/, 3/, etc. Each tweet stands alone but the thread builds. Lead tweet hooks; final tweet lands.",
  },

  focus: {
    'offense':
      "Scope this analysis to OFFENSE only. Skip defense and special teams unless they directly affect an offensive observation.",
    'defense':
      "Scope this analysis to DEFENSE only. Skip offense and special teams unless they directly affect a defensive observation.",
    'special-teams':
      "Scope this analysis to SPECIAL TEAMS only — kicking, punting, returns, coverage. Skip offense and defense.",
    'both-sides':
      "Cover both offense and defense in balance. Skip special teams unless something exceptional happened there.",
    'all-three-phases':
      "Cover offense, defense, AND special teams. Give roughly proportional space to each based on what the data shows mattered.",
    'personnel':
      "Center the analysis on the PLAYERS — who's emerging, who's struggling, who's healthy, depth-chart implications. Less about scheme and more about people.",
    'scheme':
      "Center the analysis on X's and O's — formations, play-calling tendencies, scheme adjustments. Less about individual personnel and more about what the coaches drew up.",
    'game-plan':
      "Center the analysis on the GAME PLAN — coaching decisions, situational calls, fourth-down management, clock management, halftime adjustments.",
  },

  timeHorizon: {
    'this-game':
      "Limit the analysis to a single game's data. Don't extrapolate to season trends.",
    'this-season':
      "Frame this around the CURRENT SEASON's body of work. Cite season totals and trends.",
    'career':
      "Frame this around the player's full CAREER arc — development across years, peak season, trajectory.",
    'last-3-games':
      "Focus on the LAST 3 GAMES as the recency-weighted sample. What's hot, what's cold, what's emerging.",
    'vs-ranked':
      "Frame the analysis filtered to games played VS RANKED OPPONENTS only. Quality-of-competition matters.",
    'vs-conference':
      "Frame the analysis filtered to CONFERENCE GAMES only. The non-conference body of work isn't the subject.",
    'vs-noncon':
      "Frame the analysis filtered to NON-CONFERENCE GAMES only.",
  },

  stance: {
    'take-a-position':
      "Commit to a thesis. Don't hedge with 'on the other hand' clauses. Pick the most-supported reading of the data and argue it. Acknowledge counter-evidence in passing, then explain why you weight your reading higher.",
    'lay-out-facts':
      "Present without editorializing. No conclusions, no recommendations — just the facts arranged to be readable. The reader decides what they mean.",
    'devils-advocate':
      "Argue the unpopular / minority reading of the data. Acknowledge the obvious take exists, then dismantle it. Be intellectually honest, not contrarian for sport.",
    'optimistic':
      "Lean optimistic. Where the data supports it, emphasize positives, opportunities, upside, momentum. Don't ignore concerns but treat them as solvable.",
    'pessimistic':
      "Lean critical. Where the data supports it, emphasize concerns, risks, downside, regression candidates. Don't ignore positives but treat them as fragile.",
  },
}

// Resolve a fragment by knob + option id. Substitutes ${teamA} / ${teamB}
// placeholders with the actual team names if provided.
export function resolveFragment(knobId, optionId, { teamA, teamB } = {}) {
  const knobBucket = KNOB_FRAGMENTS[knobId]
  if (!knobBucket) return ''
  const raw = knobBucket[optionId]
  if (!raw) return ''
  return raw
    .replaceAll('${teamA}', teamA || 'this team')
    .replaceAll('${teamB}', teamB || 'the opponent')
}
