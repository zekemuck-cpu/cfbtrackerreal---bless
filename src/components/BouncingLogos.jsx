import { useState, useEffect, useRef, useCallback } from 'react'
import { teams, getTeamLogo } from '../data/teams'

// FCS teams to include with FBS teams
const fcsTeams = ['FCSE', 'FCSM', 'FCSN', 'FCSW']
const allTeams = [...teams, ...fcsTeams]

// Fisher-Yates shuffle
const shuffleArray = (array) => {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Canvas-based bouncing logos - much more performant than DOM elements
export default function BouncingLogos({ subtle = false }) {
  const canvasRef = useRef(null)
  const logosRef = useRef([])
  const imagesRef = useRef({})
  const animationRef = useRef(null)
  const dimensionsRef = useRef({ width: 0, height: 0 })
  const lastTimeRef = useRef(null)
  const [imagesLoaded, setImagesLoaded] = useState(false)

  // Subtle mode: smaller, more transparent, slower
  const sizeRange = subtle ? { min: 20, max: 30 } : { min: 30, max: 50 }
  const opacityRange = subtle ? { min: 0.15, max: 0.3 } : { min: 0.5, max: 1.0 }
  // Even slower speeds - these are pixels per second at 60fps baseline
  const baseSpeedMultiplier = subtle ? 0.12 : 0.2

  // Scale speed based on screen width - use 1440px as reference
  const getScreenSpeedScale = useCallback(() => {
    const referenceWidth = 1440
    const currentWidth = window.innerWidth
    return Math.min(1, currentWidth / referenceWidth)
  }, [])

  // Load all team logo images
  useEffect(() => {
    const loadImages = async () => {
      const imagePromises = allTeams.map((team) => {
        return new Promise((resolve) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            imagesRef.current[team] = img
            resolve()
          }
          img.onerror = () => {
            // Still resolve even on error, just won't have the image
            resolve()
          }
          img.src = getTeamLogo(team)
        })
      })

      await Promise.all(imagePromises)
      setImagesLoaded(true)
    }

    loadImages()
  }, [])

  // Initialize logos once images are loaded
  useEffect(() => {
    if (!imagesLoaded) return

    const screenScale = getScreenSpeedScale()
    const speedMultiplier = baseSpeedMultiplier * screenScale

    logosRef.current = shuffleArray(allTeams).map((team) => ({
      team,
      x: Math.random() * (window.innerWidth - 50),
      y: Math.random() * (window.innerHeight - 50),
      vx: ((Math.random() - 0.5) * 4 + (Math.random() > 0.5 ? 1.5 : -1.5)) * speedMultiplier,
      vy: ((Math.random() - 0.5) * 4 + (Math.random() > 0.5 ? 1.5 : -1.5)) * speedMultiplier,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 4 * speedMultiplier,
      size: sizeRange.min + Math.random() * (sizeRange.max - sizeRange.min),
      opacity: opacityRange.min + Math.random() * (opacityRange.max - opacityRange.min),
    }))
  }, [imagesLoaded, baseSpeedMultiplier, getScreenSpeedScale, sizeRange.min, sizeRange.max, opacityRange.min, opacityRange.max])

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas) return

      const dpr = window.devicePixelRatio || 1
      const width = window.innerWidth
      const height = window.innerHeight

      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      dimensionsRef.current = { width, height }

      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Animation loop with delta time normalization for consistent speed across refresh rates
  useEffect(() => {
    if (!imagesLoaded) return

    const screenScale = getScreenSpeedScale()
    const speedMultiplier = baseSpeedMultiplier * screenScale
    const maxSpeed = (subtle ? 1.5 : 2.5) * screenScale
    const minSpeed = (subtle ? 0.3 : 0.5) * screenScale
    // Target 60fps - normalize all movement to this baseline
    const targetFrameTime = 1000 / 60

    const animate = (currentTime) => {
      const canvas = canvasRef.current
      if (!canvas) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      // Calculate delta time for frame-rate independent movement
      if (lastTimeRef.current === null) {
        lastTimeRef.current = currentTime
      }
      const deltaTime = currentTime - lastTimeRef.current
      lastTimeRef.current = currentTime

      // Skip if tab was hidden (deltaTime would be huge)
      if (deltaTime > 100) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      // Delta multiplier normalizes movement to 60fps baseline
      const deltaMultiplier = deltaTime / targetFrameTime

      const ctx = canvas.getContext('2d')
      const { width, height } = dimensionsRef.current

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      // Update and draw each logo
      logosRef.current.forEach((logo) => {
        // Update position - scale by delta time
        logo.x += logo.vx * deltaMultiplier
        logo.y += logo.vy * deltaMultiplier
        logo.rotation += logo.rotationSpeed * deltaMultiplier

        // Bounce off edges
        if (logo.x <= 0 || logo.x >= width - logo.size) {
          logo.vx = -logo.vx * (0.9 + Math.random() * 0.2)
          logo.x = logo.x <= 0 ? 0 : width - logo.size
          logo.vy += (Math.random() - 0.5) * 2 * speedMultiplier
        }
        if (logo.y <= 0 || logo.y >= height - logo.size) {
          logo.vy = -logo.vy * (0.9 + Math.random() * 0.2)
          logo.y = logo.y <= 0 ? 0 : height - logo.size
          logo.vx += (Math.random() - 0.5) * 2 * speedMultiplier
        }

        // Keep velocities in reasonable range
        logo.vx = Math.max(-maxSpeed, Math.min(maxSpeed, logo.vx))
        logo.vy = Math.max(-maxSpeed, Math.min(maxSpeed, logo.vy))

        // Ensure minimum speed
        if (Math.abs(logo.vx) < minSpeed) logo.vx = logo.vx > 0 ? minSpeed : -minSpeed
        if (Math.abs(logo.vy) < minSpeed) logo.vy = logo.vy > 0 ? minSpeed : -minSpeed

        // Draw the logo
        const img = imagesRef.current[logo.team]
        if (img) {
          ctx.save()
          ctx.globalAlpha = logo.opacity
          ctx.translate(logo.x + logo.size / 2, logo.y + logo.size / 2)
          ctx.rotate((logo.rotation * Math.PI) / 180)
          ctx.drawImage(img, -logo.size / 2, -logo.size / 2, logo.size, logo.size)
          ctx.restore()
        }
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    lastTimeRef.current = null
    animationRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [imagesLoaded, baseSpeedMultiplier, subtle, getScreenSpeedScale])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  )
}
