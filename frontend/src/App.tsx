import { useState, useEffect, useRef } from 'react'
import { LiveKitRoom, RoomAudioRenderer, useConnectionState, useRoomContext, useRemoteParticipants, useTracks, useVoiceAssistant, useTranscriptions } from '@livekit/components-react'
import { ConnectionState, Track, Participant } from 'livekit-client'
import type { VideoTrack } from 'livekit-client'
import { AudioVisualizer } from './AudioVisualizer'
import './App.css'

// URL of the token server
const TOKEN_SERVER_URL = 'http://localhost:8000'

type AgentState = 'initializing' | 'listening' | 'thinking' | 'speaking'

// Transcript component using LiveKit's transcription hooks
function Transcript() {
  // Get all transcriptions from the room (both user and agent)
  const allTranscriptions = useTranscriptions()
  const { agent } = useVoiceAssistant()
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Track unique segments to avoid duplicates (interim vs final)
  const [displayedSegments, setDisplayedSegments] = useState<Map<string, any>>(new Map())

  // Process transcriptions - show interim immediately, replace with final when available
  useEffect(() => {
    const newSegments = new Map(displayedSegments)
    
    // Debug: Log agent info
    if (agent) {
      console.log('🔵 Agent info:', {
        identity: agent.identity,
        sid: agent.sid,
        name: agent.name
      })
    } else {
      console.log('⚠️ No agent found yet')
    }
    
    console.log(`📝 Processing ${allTranscriptions.length} transcription(s)...`)
    
    allTranscriptions.forEach((transcription: any, index: number) => {
      // Get segment ID from stream info attributes
      const segmentId = transcription.streamInfo?.attributes?.['lk.segment_id']
      const isFinal = transcription.streamInfo?.attributes?.['lk.transcription_final'] === 'true'
      const transcribedTrackId = transcription.streamInfo?.attributes?.['lk.transcribed_track_id']
      const participantIdentity = transcription.participantInfo?.identity
      
      console.log(`📄 Transcription [${index}]:`, {
        text: transcription.text?.substring(0, 50) + (transcription.text?.length > 50 ? '...' : ''),
        participantIdentity: participantIdentity,
        agentIdentity: agent?.identity,
        isAgentMatch: participantIdentity === agent?.identity,
        segmentId: segmentId,
        isFinal: isFinal,
        transcribedTrackId: transcribedTrackId,
        hasTranscribedTrackId: !!transcribedTrackId,
        allAttributes: transcription.streamInfo?.attributes
      })
      
      // Only process transcriptions (not regular chat messages)
      if (!transcribedTrackId) {
        console.log(`⏭️ Skipping transcription [${index}]: No transcribed_track_id (likely chat message)`)
        return
      }
      
      // Require segmentId and text
      if (!segmentId || !transcription.text?.trim()) {
        console.log(`⏳ Skipping transcription [${index}]:`, {
          reason: !segmentId ? 'No segment ID' : 'No text',
          hasSegmentId: !!segmentId,
          hasText: !!transcription.text?.trim()
        })
        return
      }
      
      // Check if we already have a final version of this segment
      const existingSegment = newSegments.get(segmentId)
      if (existingSegment?.isFinal && !isFinal) {
        // Already have final version, don't overwrite with interim
        console.log(`⏭️ Keeping final transcription for segment ${segmentId} (ignoring interim update)`)
        return
      }
      
      // Add or update segment (interim or final)
      const isAgent = participantIdentity === agent?.identity
      console.log(`${isFinal ? '✅ Final' : '🔄 Interim'} transcription [${index}]:`, {
        segmentId: segmentId,
        text: transcription.text,
        speaker: isAgent ? 'Interviewer' : 'You',
        participantIdentity: participantIdentity,
        agentIdentity: agent?.identity,
        isFinal: isFinal
      })
      
      // Preserve original timestamp if updating existing segment to maintain sort order
      newSegments.set(segmentId, {
        id: segmentId,
        text: transcription.text,
        participantIdentity: participantIdentity,
        isFinal: isFinal,
        timestamp: existingSegment?.timestamp ?? Date.now(), // Preserve original timestamp
      })
    })
    
    // Check if segments have changed (size OR content)
    let hasChanges = false
    
    if (newSegments.size !== displayedSegments.size) {
      hasChanges = true
    } else {
      // Check if any existing segments have changed (interim → final, text updates)
      for (const [segmentId, newSegment] of newSegments.entries()) {
        const oldSegment = displayedSegments.get(segmentId)
        if (!oldSegment) {
          // New segment (shouldn't happen if sizes match, but safety check)
          hasChanges = true
          break
        }
        // Check if isFinal status changed (interim → final)
        if (oldSegment.isFinal !== newSegment.isFinal) {
          hasChanges = true
          break
        }
        // Check if text changed (interim updates or final replacement)
        if (oldSegment.text !== newSegment.text) {
          hasChanges = true
          break
        }
      }
    }
    
    if (hasChanges) {
      console.log(`📊 Segments updated: ${displayedSegments.size} → ${newSegments.size}`)
      setDisplayedSegments(newSegments)
    }
  }, [allTranscriptions, agent])

  // Timeout fallback: Auto-finalize interim transcriptions after timeout
  // This handles edge cases where final transcriptions never arrive
  // Preserves original timestamp to maintain sort order
  useEffect(() => {
    const INTERIM_TIMEOUT_MS = 3000 // 3 seconds - if interim is older than this, treat as final
    
    const checkInterimTimeouts = () => {
      const now = Date.now()
      const updated = new Map(displayedSegments)
      let hasChanges = false
      
      displayedSegments.forEach((segment, segmentId) => {
        if (!segment.isFinal) {
          const age = now - segment.timestamp
          if (age > INTERIM_TIMEOUT_MS) {
            const isUser = segment.participantIdentity !== agent?.identity
            console.log(
              `⏰ Timeout: Auto-finalizing ${isUser ? 'user' : 'agent'} interim transcription`,
              {
                segmentId,
                age: `${age}ms`,
                text: segment.text.substring(0, 50) + (segment.text.length > 50 ? '...' : '')
              }
            )
            
            // Preserve original timestamp to maintain sort order
            updated.set(segmentId, {
              ...segment,
              isFinal: true,
            })
            hasChanges = true
          }
        }
      })
      
      if (hasChanges) {
        setDisplayedSegments(updated)
      }
    }
    
    // Check every 500ms for timeouts
    const interval = setInterval(checkInterimTimeouts, 500)
    
    return () => clearInterval(interval)
  }, [displayedSegments, agent?.identity])

  // Debug logging - summary
  useEffect(() => {
    if (allTranscriptions.length > 0) {
      console.log('📊 Transcription Summary:', {
        totalTranscriptions: allTranscriptions.length,
        displayedSegments: displayedSegments.size,
        agentIdentity: agent?.identity,
        latestTranscription: allTranscriptions[allTranscriptions.length - 1]
      })
    }
  }, [allTranscriptions.length, displayedSegments.size, agent?.identity])

  // Convert map to array and sort by timestamp
  const segments = Array.from(displayedSegments.values()).sort((a, b) => a.timestamp - b.timestamp)

  // Debug: Log segments being displayed
  useEffect(() => {
    if (segments.length > 0) {
      console.log(`🎯 Displaying ${segments.length} segment(s):`)
      segments.forEach((segment, index) => {
        const isAgent = segment.participantIdentity === agent?.identity
        console.log(`  [${index}] ${isAgent ? 'Interviewer' : 'You'}:`, {
          text: segment.text.substring(0, 50) + (segment.text.length > 50 ? '...' : ''),
          participantIdentity: segment.participantIdentity,
          agentIdentity: agent?.identity,
          isAgent: isAgent
        })
      })
    }
  }, [segments.length, agent?.identity])

  // Auto-scroll to the latest segment
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [displayedSegments.size])

  return (
    <div className="transcript-content">
      <div className="transcript-header">
        <div>
          <h2 className="transcript-title">Live Transcript</h2>
          <p className="transcript-subtitle">
            Follow the conversation between you and the interviewer in real time.
          </p>
        </div>
      </div>
      <div className="transcript-scroll" ref={containerRef}>
        {segments.length === 0 ? (
          <div className="transcript-empty">
            <p>Transcript will appear here once the conversation starts.</p>
            <p className="transcript-debug">
              {allTranscriptions.length > 0 
                ? `Processing ${allTranscriptions.length} transcription stream(s)...` 
                : 'Waiting for audio...'}
            </p>
          </div>
        ) : (
          segments.map((segment) => {
            // Check if this transcription is from the agent
            const isAgent = segment.participantIdentity === agent?.identity
            const speakerLabel = isAgent ? 'Interviewer' : 'You'
            const isInterim = !segment.isFinal

            return (
              <div
                key={segment.id}
                className={`transcript-item ${isAgent ? 'agent' : 'user'} ${isInterim ? 'interim' : ''}`}
              >
                <div className="transcript-speaker">
                  {speakerLabel}
                  {isInterim && <span className="transcript-interim-indicator">...</span>}
                </div>
                <div className="transcript-text">{segment.text}</div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// Video renderer component
function VideoRenderer({ track, label, isLocal = false }: { track: VideoTrack | undefined, label: string, isLocal?: boolean }) {
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

// Component to show when connected to the room
function CallInterface({ onEndInterview }: { onEndInterview: () => void }) {
  const connectionState = useConnectionState()
  const room = useRoomContext()
  const remoteParticipants = useRemoteParticipants()
  const allTracks = useTracks(
    [Track.Source.Camera, Track.Source.Microphone], 
    { onlySubscribed: true }
  )
  
  const [agentState, setAgentState] = useState<AgentState>('initializing')
  const [isLocalMicEnabled, setIsLocalMicEnabled] = useState(false)
  const [isLocalCameraEnabled, setIsLocalCameraEnabled] = useState(false)
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false)

  // Handle explicit disconnect when user ends interview
  const handleEndInterview = async () => {
    console.log('Ending interview - disconnecting from room')
    try {
      // Explicitly disconnect from the room
      await room.disconnect()
      console.log('Successfully disconnected from room')
    } catch (error) {
      console.error('Error disconnecting from room:', error)
    } finally {
      // Call parent handler to reset UI state
      onEndInterview()
    }
  }

  // Handle browser close/navigation - cleanup before page unload
  useEffect(() => {
    const handleBeforeUnload = async () => {
      console.log('Page unloading - disconnecting from room')
      try {
        // Attempt to disconnect the room
        if (room && connectionState === ConnectionState.Connected) {
          await room.disconnect()
        }
      } catch (error) {
        console.error('Error disconnecting during page unload:', error)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [room, connectionState])

  // Monitor connection state changes and handle disconnections
  useEffect(() => {
    if (connectionState === ConnectionState.Disconnected) {
      console.log('Room disconnected - cleaning up')
      // The room is disconnected, so we can clean up
      // The onDisconnected handler in the parent will handle UI reset
    } else if (connectionState === ConnectionState.Reconnecting) {
      console.log('Connection lost - attempting to reconnect')
    }
  }, [connectionState])

  // Find the agent participant
  // Try multiple methods to detect the agent
  const agentParticipant = remoteParticipants.find(
    (p: Participant) => {
      // Method 1: Check isAgent property
      if (p.isAgent) return true
      
      // Method 2: Check metadata
      if (p.metadata?.includes('agent')) return true
      
      // Method 3: Check participant kind (if available)
      if ((p as any).kind === 'agent' || (p as any).kind === 'AGENT') return true
      
      // Method 4: Check identity/name patterns
      const identity = p.identity?.toLowerCase() || ''
      const name = p.name?.toLowerCase() || ''
      if (identity.includes('agent') || name.includes('agent')) return true
      
      return false
    }
  )

  // Debug logging for agent detection
  useEffect(() => {
    if (remoteParticipants.length > 0) {
      console.log('Remote participants:', remoteParticipants.map(p => ({
        identity: p.identity,
        name: p.name,
        isAgent: p.isAgent,
        metadata: p.metadata,
        kind: (p as any).kind
      })))
      if (agentParticipant) {
        console.log('✅ Agent participant found:', agentParticipant.identity)
      } else {
        console.warn('⚠️ No agent participant detected. Participants:', remoteParticipants.length)
      }
    }
  }, [remoteParticipants, agentParticipant])

  // Get your local video track
  const localVideoTrack = allTracks.find(
    (t) => t.participant.isLocal && t.source === Track.Source.Camera
  )?.publication?.track as VideoTrack | undefined

  // Get agent's video track (if available)
  const agentVideoTrack = allTracks.find(
    (t) => t.participant.sid === agentParticipant?.sid && t.source === Track.Source.Camera
  )?.publication?.track as VideoTrack | undefined

  // Get agent's audio track
  const agentAudioTrack = allTracks.find(
    (t) => t.participant.sid === agentParticipant?.sid && t.source === Track.Source.Microphone
  )?.publication?.track

  useEffect(() => {
    // Enable microphone and camera when connected
    if (connectionState === ConnectionState.Connected && room) {
      room.localParticipant.setMicrophoneEnabled(true).then(() => {
        console.log('Microphone enabled')
        setIsLocalMicEnabled(true)
      }).catch((error) => {
        console.error('Failed to enable microphone:', error)
      })
      
      room.localParticipant.setCameraEnabled(true).then(() => {
        console.log('Camera enabled')
        setIsLocalCameraEnabled(true)
      }).catch((error) => {
        console.error('Failed to enable camera:', error)
      })
    }
  }, [connectionState, room])

  // Monitor agent state from metadata
  useEffect(() => {
    if (agentParticipant) {
      const updateAgentState = () => {
        const state = agentParticipant.attributes?.['lk.agent.state'] as AgentState
        if (state) {
          setAgentState(state)
        }
      }

      updateAgentState()
      agentParticipant.on('attributesChanged', updateAgentState)

      return () => {
        agentParticipant.off('attributesChanged', updateAgentState)
      }
    }
  }, [agentParticipant])

  return (
    <div className={`call-interface ${isTranscriptOpen ? 'with-transcript' : ''}`}>
      <div className="header-bar">
        <div className="call-header">
          <div className="header-content">
            <h1 className="call-title">Project Interview Coach</h1>
            <div className="connection-badge">
              <span className={`connection-dot ${connectionState === ConnectionState.Connected ? 'connected' : 'connecting'}`} />
              <span className="connection-text">
                {connectionState === ConnectionState.Connected ? 'Connected' : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={`transcript-toggle ${isTranscriptOpen ? 'active' : ''}`}
            onClick={() => setIsTranscriptOpen((open) => !open)}
          >
            Transcript
          </button>
          <button className="end-button" onClick={handleEndInterview}>
            End Interview
          </button>
        </div>
      </div>

      {/* Mobile overlay backdrop when transcript is open */}
      <div
        className="transcript-backdrop"
        aria-hidden={!isTranscriptOpen}
        onClick={() => setIsTranscriptOpen(false)}
      />

      {/* Slide-in transcript panel */}
      <aside
        className={`transcript-panel ${isTranscriptOpen ? 'open' : ''}`}
        aria-label="Live transcript"
      >
        <div className="transcript-panel-inner">
          <div className="transcript-panel-header">
            <h2 className="transcript-title">Live Transcript</h2>
            <button
              type="button"
              className="transcript-close"
              onClick={() => setIsTranscriptOpen(false)}
            >
              Close
            </button>
          </div>
          <Transcript />
        </div>
      </aside>

      <div className="call-body">
        {/* Video Section - Split Screen Layout */}
        <div className="video-section">
          {/* Your video (left, larger) */}
          <VideoRenderer track={localVideoTrack} label="You" isLocal={true} />

          {/* Agent video/visualizer (right, smaller) */}
          <div className="agent-video-container">
            {agentVideoTrack ? (
              <VideoRenderer track={agentVideoTrack} label="AI Interviewer" isLocal={false} />
            ) : (
              <div className="agent-visualizer-container">
                <AudioVisualizer 
                  track={agentAudioTrack} 
                  state={agentState}
                  barCount={7}
                />
                <div className="video-label">AI Interviewer</div>
              </div>
            )}
          </div>
        </div>

        <div className="call-info">
          <div className="info-card">
            <div className="info-icon">🎤</div>
            <div className="info-content">
              <div className="info-label">Your Microphone</div>
              <div className="info-value">{isLocalMicEnabled ? 'Active' : 'Inactive'}</div>
            </div>
          </div>

          <div className="info-card">
            <div className="info-icon">📹</div>
            <div className="info-content">
              <div className="info-label">Your Camera</div>
              <div className="info-value">{isLocalCameraEnabled ? 'Active' : 'Inactive'}</div>
            </div>
          </div>

          {agentParticipant && (
            <div className="info-card">
              <div className="info-icon">🤖</div>
              <div className="info-content">
                <div className="info-label">AI Interviewer</div>
                <div className="info-value">Connected</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [connectionDetails, setConnectionDetails] = useState<{
    url: string
    token: string
    roomName: string
  } | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isStartingRef = useRef(false) // Prevent multiple simultaneous starts

  const startInterview = async () => {
    // Prevent multiple simultaneous connection attempts
    if (isStartingRef.current || isConnecting || connectionDetails) {
      console.log('Connection already in progress or active')
      return
    }

    isStartingRef.current = true
    setIsConnecting(true)
    setError(null)

    try {
      // Check capacity before starting
      console.log('Checking server capacity...')
      let capacityResponse
      try {
        capacityResponse = await fetch(`${TOKEN_SERVER_URL}/capacity-check`)
      } catch (fetchError) {
        console.error('❌ Failed to connect to token server:', fetchError)
        throw new Error(
          `Cannot connect to token server at ${TOKEN_SERVER_URL}. ` +
          `Make sure the token server is running on port 8000.`
        )
      }
      
      if (!capacityResponse.ok) {
        throw new Error(`Token server returned error: ${capacityResponse.status} ${capacityResponse.statusText}`)
      }
      
      const capacityData = await capacityResponse.json()

      if (!capacityData.has_capacity) {
        throw new Error(
          capacityData.message || 
          'Maximum number of interviews reached. Please try again later.'
        )
      }

      console.log(
        `Capacity available: ${capacityData.active_sessions}/${capacityData.max_sessions} sessions active`
      )

      // Generate a unique room name for this interview
      const roomName = `interview-${Date.now()}`
      const username = 'candidate'

      // Fetch LiveKit URL
      let urlResponse
      try {
        urlResponse = await fetch(`${TOKEN_SERVER_URL}/livekit-url`)
      } catch (fetchError) {
        console.error('❌ Failed to fetch LiveKit URL:', fetchError)
        throw new Error('Cannot connect to token server to get LiveKit URL')
      }
      
      if (!urlResponse.ok) {
        throw new Error(`Failed to get LiveKit URL: ${urlResponse.status}`)
      }
      
      const urlData = await urlResponse.json()

      if (urlData.error) {
        throw new Error(urlData.error)
      }
      
      console.log('✅ LiveKit URL obtained:', urlData.url)

      // Fetch access token (this will also check capacity server-side)
      const tokenResponse = await fetch(
        `${TOKEN_SERVER_URL}/token?room=${roomName}&username=${username}`
      )
      
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json()
        throw new Error(errorData.detail || 'Failed to get access token')
      }

      const tokenData = await tokenResponse.json()

      if (tokenData.error) {
        throw new Error(tokenData.error)
      }

      // Set connection details to trigger LiveKitRoom render
      setConnectionDetails({
        url: urlData.url,
        token: tokenData.token,
        roomName: roomName,
      })
      
      console.log(`Starting interview in room: ${roomName}`)
      
      // Note: isConnecting stays true until connection is established
      // It will be reset in endInterview or if there's an error
    } catch (err) {
      console.error('Failed to start interview:', err)
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setIsConnecting(false)
      isStartingRef.current = false
    }
  }

  const endInterview = () => {
    console.log('Ending interview - resetting connection state')
    setConnectionDetails(null)
    setIsConnecting(false)
    isStartingRef.current = false
    setError(null)
  }

  // Show start screen if not connected
  if (!connectionDetails) {
    return (
      <div className="app">
        <div className="start-screen">
          <h1>Project Interview Coach</h1>
          <p>Get ready to discuss your project with an AI interviewer</p>
          {error && (
            <div className="error-message">
              <p>❌ Error: {error}</p>
              <p className="error-help">Make sure the token server is running on port 8000</p>
            </div>
          )}
          <button
            className="start-button"
            onClick={startInterview}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Start Interview'}
          </button>
        </div>
      </div>
    )
  }

  // Show LiveKit room when connected
  return (
    <div className="app">
      <LiveKitRoom
        serverUrl={connectionDetails.url}
        token={connectionDetails.token}
        connect={true}
        connectOptions={{
          autoSubscribe: true,
        }}
        options={{
          audioCaptureDefaults: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
          publishDefaults: {
            dtx: true,
            red: true,
            stopMicTrackOnMute: true,
          },
        }}
        onDisconnected={endInterview}
      >
        <CallInterface onEndInterview={endInterview} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  )
}

export default App
