import { useEffect } from 'react'
import { useDynasty } from '../context/DynastyContext'
import { getTeamLogoByTid } from '../data/teams'
import { getCurrentTeamTid } from '../data/teamRegistry'

// Swaps the browser-tab favicon to the user's current team logo while they're in
// a dynasty, and reverts to the bundled default everywhere else (login, dynasty
// list, etc.). Favicons are just a mutable <link rel="icon"> so this is a pure
// runtime DOM tweak — no build step. Renders nothing.
const DEFAULT_FAVICON = '/favicon.png'

function setFavicon(href) {
  const head = document.head
  if (!head) return
  // Replace any existing icon links with a single fresh one — recreating the
  // element is the most reliable cross-browser way to force the tab to repaint
  // (just mutating .href can be ignored by some browsers). Leaves
  // apple-touch-icon (home-screen) alone; that token isn't `icon`.
  head.querySelectorAll("link[rel~='icon']").forEach((l) => l.remove())
  const link = document.createElement('link')
  link.rel = 'icon'
  link.href = href
  head.appendChild(link)
}

export default function FaviconManager() {
  const { currentDynasty } = useDynasty()

  useEffect(() => {
    let href = DEFAULT_FAVICON
    if (currentDynasty) {
      const tid = getCurrentTeamTid(currentDynasty)
      const logo = tid != null ? getTeamLogoByTid(tid, currentDynasty.teams) : null
      if (logo) href = logo
    }
    setFavicon(href)
  }, [currentDynasty])

  return null
}
