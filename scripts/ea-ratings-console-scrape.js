// EA CFB ratings puller — paste this whole file into the browser console
// on https://www.ea.com/games/ea-sports-college-football/ratings
//
// Why the browser and not a script: drop-api.ea.com only accepts requests
// whose Origin is https://www.ea.com, and it requires the `x-feature`
// header (which triggers a CORS preflight the API only answers for that
// origin). Running it from the page itself is the path of least friction —
// no keys, no proxy, no headless browser.
//
// It pages through every player, then downloads `ea-cfb-ratings.json`.
// Feed that file to scripts/convertEaRatings.mjs to regenerate
// src/data/defaultRosters/{tid}.json.

;(async () => {
  const BASE = 'https://drop-api.ea.com/rating/ea-sports-college-football'
  const HDRS = {
    accept: 'application/json',
    'x-feature': '8586515909697864000',
    'drop-referrer': 'https://www.ea.com/games/ea-sports-college-football/ratings',
  }
  const LIMIT = 100

  const all = []
  let offset = 0
  let total = null
  let loggedShape = false

  // The endpoint 500s intermittently (seen in the wild), so every page
  // gets retried with backoff before we give up on the whole run.
  const get = async (url, tries = 5) => {
    for (let i = 0; i < tries; i++) {
      const r = await fetch(url, { headers: HDRS, credentials: 'omit' })
      if (r.ok) return r.json()
      console.warn('HTTP', r.status, '- retry', i + 1, 'of', tries)
      await new Promise((s) => setTimeout(s, 1500 * (i + 1)))
    }
    throw new Error('gave up on ' + url)
  }

  for (;;) {
    const url = `${BASE}?locale=en&limit=${LIMIT}&offset=${offset}&iteration=1-base`
    const j = await get(url)

    if (!loggedShape) {
      console.log('TOP-LEVEL KEYS:', Object.keys(j))
      loggedShape = true
    }

    const rows = j.docs || j.items || j.results || j.data || []
    if (total == null) total = j.totalCount ?? j.count ?? j.total ?? null
    if (!rows.length) break

    all.push(...rows)
    console.log(`${all.length}${total ? ' / ' + total : ''}`)

    offset += LIMIT
    if (total && all.length >= total) break
    if (offset > 40000) break // runaway guard
    await new Promise((s) => setTimeout(s, 250))
  }

  console.log('DONE —', all.length, 'players')
  console.log('SAMPLE RECORD:', JSON.stringify(all[0], null, 2))

  const blob = new Blob([JSON.stringify(all)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'ea-cfb-ratings.json'
  a.click()
})()
