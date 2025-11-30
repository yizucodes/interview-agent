import { useState, useEffect } from 'react'
import { useConnectionState, useRoomContext, useRemoteParticipants, useTracks } from '@livekit/components-react'
import { ConnectionState, Track, Participant } from 'livekit-client'
import type { VideoTrack } from 'livekit-client'
import { AudioVisualizer } from './AudioVisualizer'
import { Transcript } from './Transcript'
import { VideoRenderer } from './VideoRenderer'
import type { AgentState } from '../types'

interface CallInterfaceProps {
  onEndInterview: () => void
}

export function CallInterface({ onEndInterview }: CallInterfaceProps) {
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

