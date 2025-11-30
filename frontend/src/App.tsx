import { useState, useEffect, useRef } from 'react'
import { LiveKitRoom, RoomAudioRenderer, useConnectionState, useRoomContext, useRemoteParticipants, useTracks } from '@livekit/components-react'
import { ConnectionState, Track, Participant } from 'livekit-client'
import type { VideoTrack } from 'livekit-client'
import { AudioVisualizer } from './AudioVisualizer'
import './App.css'

// URL of the token server
const TOKEN_SERVER_URL = 'http://localhost:8000'

type AgentState = 'initializing' | 'listening' | 'thinking' | 'speaking'

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

  // Find the agent participant
  const agentParticipant = remoteParticipants.find(
    (p: Participant) => p.isAgent || p.metadata?.includes('agent')
  )

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
    <div className="call-interface">
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
        <button className="end-button" onClick={onEndInterview}>
          End Interview
        </button>
      </div>

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

        <div className="instructions">
          <p>Speak naturally about your project. The AI interviewer is listening and will ask follow-up questions.</p>
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

  const startInterview = async () => {
    setIsConnecting(true)
    setError(null)

    try {
      // Generate a unique room name for this interview
      const roomName = `interview-${Date.now()}`
      const username = 'candidate'

      // Fetch LiveKit URL
      const urlResponse = await fetch(`${TOKEN_SERVER_URL}/livekit-url`)
      const urlData = await urlResponse.json()

      if (urlData.error) {
        throw new Error(urlData.error)
      }

      // Fetch access token
      const tokenResponse = await fetch(
        `${TOKEN_SERVER_URL}/token?room=${roomName}&username=${username}`
      )
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
    } catch (err) {
      console.error('Failed to start interview:', err)
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setIsConnecting(false)
    }
  }

  const endInterview = () => {
    setConnectionDetails(null)
    setIsConnecting(false)
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
