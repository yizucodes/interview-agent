import { useEffect, useRef, useState } from 'react'
import { Track } from 'livekit-client'

interface AudioVisualizerProps {
  track?: Track
  state: 'initializing' | 'listening' | 'thinking' | 'speaking'
  barCount?: number
}

export function AudioVisualizer({ track, state, barCount = 5 }: AudioVisualizerProps) {
  const animationRef = useRef<number | undefined>(undefined)
  const [volumes, setVolumes] = useState<number[]>(Array(barCount).fill(0))

  useEffect(() => {
    if (!track || state !== 'speaking') {
      // Animate bars down when not speaking
      const interval = setInterval(() => {
        setVolumes(prev => prev.map(v => Math.max(0, v * 0.8)))
      }, 50)
      return () => clearInterval(interval)
    }

    // For speaking state, create animated bars
    const animate = () => {
      setVolumes(prev => 
        prev.map((_, i) => {
          const base = 0.3 + Math.sin(Date.now() / 200 + i) * 0.3
          const random = Math.random() * 0.4
          return base + random
        })
      )
      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [track, state, barCount])

  // Render bars
  return (
    <div className="audio-visualizer">
      <div className="visualizer-bars">
        {volumes.map((volume, i) => (
          <div
            key={i}
            className={`visualizer-bar ${state}`}
            style={{
              height: `${Math.max(20, volume * 100)}%`,
              animationDelay: `${i * 0.1}s`
            }}
          />
        ))}
      </div>
      <div className="state-indicator">
        <span className={`state-dot ${state}`} />
        <span className="state-text">{state}</span>
      </div>
    </div>
  )
}

