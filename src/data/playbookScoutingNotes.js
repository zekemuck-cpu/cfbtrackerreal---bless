// Reference scouting blurbs for the offensive/defensive playbook names used
// across CFB 27 (and real-world college football). Used by WeeklyScouting.jsx
// to auto-fill a "how this scheme is typically run" note once the user
// selects the opponent's playbook — the game doesn't sync scheme identity,
// so this is authored reference content, not derived from save data.

export const OFFENSE_PLAYBOOKS = [
  'Air Raid',
  'Go Go',
  'Multiple',
  'Option',
  'Pistol',
  'Power Spread',
  'Pro Style',
  'Run & Shoot',
  'Spread',
  'Spread Option',
  'Veer & Shoot',
]

const OFFENSE_NOTES = {
  'Air Raid': "Four- and five-wide spread passing attack built on quick, high-percentage throws (bubble screens, slants, mesh) to spread the field horizontally and let receivers rack up yards after the catch. The run game is a change-up, not the plan.",
  'Go Go': "Up-tempo spread passing scheme out of 10/11 personnel that leans on quick game and RPOs, snapping fast to prevent defensive substitutions and create numbers advantages before the defense can adjust.",
  'Multiple': "No fixed identity — mixes personnel groupings, formations, and run/pass splits from drive to drive, making it hard to key on a tendency before the game is well underway.",
  'Option': "Run-first attack built around the QB reading unblocked defenders (dive/QB keep/pitch) rather than blocking them, living behind a physical offensive line and demanding disciplined, assignment-sound run fits from the defense.",
  'Pistol': "Shotgun-depth QB with the RB directly behind him, blending traditional under-center run schemes (power, zone) with spread passing concepts — flexible enough to run or throw from the same look.",
  'Power Spread': "Spread formations paired with gap/power run schemes rather than pure zone, pulling linemen to create running lanes for a bigger back while still using 2-3 receiver sets to stretch the field.",
  'Pro Style': "Traditional, balanced attack with multiple-TE/FB personnel, under-center run schemes, and a full progression-read passing game — the most complete but least explosive of the offensive identities.",
  'Run & Shoot': "Pass-heavy, receiver-reaction passing scheme (four-wide, up-tempo) where routes convert in real time based on the coverage shown — timing and improvisation matter more than the play call itself.",
  'Spread': "Base 3-4 wide spread offense that uses formation width to force the defense into space, mixing zone-read run concepts with quick and intermediate passing.",
  'Spread Option': "Marries spread formations with option run concepts — reads the edge defender on zone-read/RPO looks while keeping four or five receivers on the field to hold the defense honest.",
  'Veer & Shoot': "Hybrid of option run principles (veer) and Run & Shoot passing concepts — run-first tendencies out of the gate that can shift into an aggressive vertical passing attack on obvious pass downs.",
}

export function getOffensePlaybookNote(name) {
  return OFFENSE_NOTES[name] || ''
}

const DEFENSE_FRONT_NOTES = {
  '3-2-6': "A dime-heavy nickel package — three down linemen, two linebackers, six defensive backs — built almost exclusively to match 4+ WR spread sets and take away the pass, at the cost of size against the run.",
  '3-3-5': "Three down linemen, three linebackers, five defensive backs — an odd front built to match spread personnel with numbers in coverage while still able to bring extra rushers off the edge.",
  '3-4': "Three down linemen, four linebackers — a two-gap, hybrid front that leans on athletic OLBs who can both rush the passer and drop into coverage, with more pre-snap disguise potential than a 4-3.",
  '4-2-5': "Four down linemen, two linebackers, five defensive backs — a nickel base built for spread-heavy opponents, trading a linebacker for an extra DB without giving up much of the pass rush.",
  '4-3': "Four down linemen, three linebackers — the traditional, balanced front with the most straightforward gap assignments and the deepest bench of sub-package variants.",
}

const DEFENSE_SUFFIX_NOTES = {
  'Man': "Leans heavily on man coverage with press corners on the outside — tight in the short-to-intermediate game but vulnerable to double moves and busted assignments.",
  'Man Pressure': "Combines man coverage on the back end with an aggressive extra-rusher package — expect frequent blitzes with man matched up behind them.",
  'Multiple': "No fixed identity within the front — mixes fronts, coverages, and pressure looks snap to snap, making pre-snap diagnosis the hardest part of attacking it.",
  'Press Quarters': "Press-man at the line of scrimmage with quarters (Cover 4) shells behind it — corners jam receivers at the snap while safeties read run/pass from depth.",
  'Shell': "Built around disguise — shows one coverage shell pre-snap and rotates to another after the snap to confuse the QB's presnap read.",
  'Three High': "Plays out of a 3-safety, split-field shell that takes away the deep pass first and funnels everything underneath.",
  'Tite': "Odd-front variant with the down linemen shaded into the B-gaps, taking away inside runs and forcing plays to bounce outside.",
  'Zone': "Sits in zone coverage shells (Cover 2/3/4 variants), prioritizing keeping plays in front and limiting big passing plays over jumping routes.",
  'Zone Pressure': "Brings extra rushers while staying in zone coverage behind it — designed to speed up the QB's clock without fully committing to man matchups.",
}

const DEFENSE_FRONT_KEYS = Object.keys(DEFENSE_FRONT_NOTES).sort((a, b) => b.length - a.length)

export const DEFENSE_PLAYBOOKS = [
  '3-2-6',
  '3-3-5', '3-3-5 Man', '3-3-5 Man Pressure', '3-3-5 Shell', '3-3-5 Three High', '3-3-5 Tite', '3-3-5 Zone', '3-3-5 Zone Pressure',
  '3-4', '3-4 Man', '3-4 Man Pressure', '3-4 Multiple', '3-4 Shell', '3-4 Zone', '3-4 Zone Pressure',
  '4-2-5', '4-2-5 Man', '4-2-5 Man Pressure', '4-2-5 Shell', '4-2-5 Zone', '4-2-5 Zone Pressure',
  '4-3', '4-3 Man', '4-3 Man Pressure', '4-3 Multiple', '4-3 Press Quarters', '4-3 Shell', '4-3 Zone', '4-3 Zone Pressure',
  'Multiple',
  'Multiple D',
]

export function getDefensePlaybookNote(name) {
  if (name === 'Multiple' || name === 'Multiple D') {
    return "No fixed front or coverage identity — mixes 3- and 4-man fronts with zone, man, and pressure calls from snap to snap. Pre-snap diagnosis is the whole game plan against this defense."
  }
  const front = DEFENSE_FRONT_KEYS.find((f) => name === f || name.startsWith(`${f} `))
  if (!front) return ''
  const suffix = name.slice(front.length).trim()
  const frontNote = DEFENSE_FRONT_NOTES[front]
  const suffixNote = suffix ? DEFENSE_SUFFIX_NOTES[suffix] : ''
  return [frontNote, suffixNote].filter(Boolean).join(' ')
}
