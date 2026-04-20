// Recruiting Class Score (NCAA Football 25 formula)
//
// Score = Σ (5 × stars_i) × g(rank_i)   for the top 25 recruits
// where players are ordered by national rank ascending (best first),
// and g(r) is the rank-weight table below. g(r > 25) = 0.
//
// Derived from an empirical lookup table (verified against the in-game calculator
// across all star tiers and a published worked example).

const RANK_WEIGHTS = [
  1.00, 0.99, 0.98, 0.95, 0.91,
  0.86, 0.80, 0.74, 0.67, 0.61,
  0.54, 0.47, 0.41, 0.35, 0.30,
  0.25, 0.21, 0.17, 0.14, 0.11,
  0.08, 0.07, 0.05, 0.04, 0.03,
]

export const RECRUITING_SCORE_MAX_COUNTED = RANK_WEIGHTS.length

export function recruitingRankWeight(rank) {
  const r = Number(rank)
  if (!Number.isFinite(r) || r < 1) return 0
  const idx = Math.floor(r) - 1
  return RANK_WEIGHTS[idx] || 0
}

function orderRecruitsForScoring(recruits) {
  return [...(recruits || [])]
    .filter(r => Number(r?.stars) > 0)
    .sort((a, b) => {
      const starsA = Number(a?.stars) || 0
      const starsB = Number(b?.stars) || 0
      if (starsA !== starsB) return starsB - starsA
      const rankA = Number(a?.nationalRank)
      const rankB = Number(b?.nationalRank)
      const hasA = Number.isFinite(rankA) && rankA > 0
      const hasB = Number.isFinite(rankB) && rankB > 0
      if (hasA && hasB && rankA !== rankB) return rankA - rankB
      if (hasA !== hasB) return hasA ? -1 : 1
      return 0
    })
}

export function calculateRecruitingClassScore(recruits) {
  const ordered = orderRecruitsForScoring(recruits)
  let total = 0
  for (let i = 0; i < Math.min(ordered.length, RECRUITING_SCORE_MAX_COUNTED); i++) {
    const stars = Number(ordered[i]?.stars) || 0
    total += 5 * stars * RANK_WEIGHTS[i]
  }
  return total
}

export function flattenClassCommitments(commitmentsForTeamYear) {
  if (!commitmentsForTeamYear || typeof commitmentsForTeamYear !== 'object') return []
  const all = []
  for (const value of Object.values(commitmentsForTeamYear)) {
    if (Array.isArray(value)) all.push(...value)
  }
  const seen = new Map()
  for (const commit of all) {
    if (!commit) continue
    const key = commit.pid ?? commit.name?.toLowerCase?.().trim?.()
    if (!key) continue
    if (!seen.has(key)) seen.set(key, commit)
  }
  return Array.from(seen.values())
}

export function formatRecruitingClassScore(score) {
  const n = Number(score) || 0
  return n.toFixed(2)
}
