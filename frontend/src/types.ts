// Shared types for the application

export type AgentState = 'initializing' | 'listening' | 'thinking' | 'speaking'

export interface TranscriptSegment {
  id: string
  text: string
  participantIdentity: string
  isFinal: boolean
  timestamp: number
}

export interface ConnectionDetails {
  url: string
  token: string
  roomName: string
}


