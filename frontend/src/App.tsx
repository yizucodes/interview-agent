import { useState, useRef } from 'react'
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react'
import { CallInterface } from './components/CallInterface'
import type { ConnectionDetails } from './types'
import './App.css'

// URL of the token server
const TOKEN_SERVER_URL = 'http://localhost:8000'

function App() {
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isStartingRef = useRef(false) // Prevent multiple simultaneous starts

  const startInterview = async () => {
    // Prevent multiple simultaneous connection attempts
    if (isStartingRef.current || isConnecting || connectionDetails) {
      return
    }

    isStartingRef.current = true
    setIsConnecting(true)
    setError(null)

    try {
      // Check capacity before starting
      let capacityResponse
      try {
        capacityResponse = await fetch(`${TOKEN_SERVER_URL}/capacity-check`)
      } catch (fetchError) {
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

      // Generate a unique room name for this interview
      const roomName = `interview-${Date.now()}`
      const username = 'candidate'

      // Fetch LiveKit URL
      let urlResponse
      try {
        urlResponse = await fetch(`${TOKEN_SERVER_URL}/livekit-url`)
      } catch (fetchError) {
        throw new Error('Cannot connect to token server to get LiveKit URL')
      }
      
      if (!urlResponse.ok) {
        throw new Error(`Failed to get LiveKit URL: ${urlResponse.status}`)
      }
      
      const urlData = await urlResponse.json()

      if (urlData.error) {
        throw new Error(urlData.error)
      }

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
