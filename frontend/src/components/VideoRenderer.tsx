import { useEffect, useRef } from 'react'
import type { VideoTrack } from 'livekit-client'

interface VideoRendererProps {
  track: VideoTrack | undefined
  label: string
  isLocal?: boolean
}

export function VideoRenderer({ track, label, isLocal = false }: VideoRendererProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && track) {
      track.attach(videoRef.current)
      return () => {
        track.detach()
      }
    }
  }, [track])

  return (
    <div className="video-container">
      {track ? (
        <video 
          ref={videoRef} 
          autoPlay 
          muted={isLocal} 
          playsInline 
          className="video-element"
        />
      ) : (
        <div className="video-placeholder">
          <div className="placeholder-icon">📹</div>
          <div className="placeholder-text">No video</div>
        </div>
      )}
      <div className="video-label">{label}</div>
    </div>
  )
}


