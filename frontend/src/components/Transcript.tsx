import { useState, useEffect, useRef } from 'react'
import { useTranscriptions, useVoiceAssistant } from '@livekit/components-react'
import type { TranscriptSegment } from '../types'

export function Transcript() {
  // Get all transcriptions from the room (both user and agent)
  const allTranscriptions = useTranscriptions()
  const { agent } = useVoiceAssistant()
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Track unique segments to avoid duplicates (interim vs final)
  const [displayedSegments, setDisplayedSegments] = useState<Map<string, TranscriptSegment>>(new Map())

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

