import logging
import asyncio
import time
from typing import Optional
from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from tools import search_project_docs, generate_feedback
from prompts import INTERVIEWER_SYSTEM_PROMPT, INTERVIEWER_GREETING

load_dotenv(".env.local")

# Configure logging to show INFO level and above
# This ensures tool call logs are visible
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Concurrency tracking (thread-safe using asyncio)
active_sessions = 0
MAX_CONCURRENT_SESSIONS = 5
sessions_lock = asyncio.Lock()

# Idle timeout settings (in seconds)
IDLE_TIMEOUT = 900  # 15 minutes
ACTIVITY_CHECK_INTERVAL = 60  # Check every 60 seconds
EMPTY_ROOM_GRACE_PERIOD = 3  # Wait 3 seconds before cleanup to avoid race conditions


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=INTERVIEWER_SYSTEM_PROMPT,
            tools=[search_project_docs, generate_feedback],
        )

server = AgentServer()


async def increment_session_count() -> bool:
    """
    Try to increment active session count.
    Returns True if successful (under limit), False if at capacity.
    """
    global active_sessions
    async with sessions_lock:
        if active_sessions >= MAX_CONCURRENT_SESSIONS:
            logger.warning(
                f"Session limit reached: {active_sessions}/{MAX_CONCURRENT_SESSIONS}"
            )
            return False
        active_sessions += 1
        logger.info(
            f"Session started. Active sessions: {active_sessions}/{MAX_CONCURRENT_SESSIONS}"
        )
        return True


async def decrement_session_count():
    """Decrement active session count."""
    global active_sessions
    async with sessions_lock:
        active_sessions = max(0, active_sessions - 1)
        logger.info(
            f"Session ended. Active sessions: {active_sessions}/{MAX_CONCURRENT_SESSIONS}"
        )


async def monitor_room_activity(
    room: rtc.Room,
    session: AgentSession,
    last_activity_time: list[float]
):
    """
    Monitor room for:
    1. Empty room (no non-agent participants)
    2. Idle timeout (no user activity for IDLE_TIMEOUT seconds)
    """
    logger.info(
        f"Starting activity monitor for room {room.name} "
        f"(idle timeout: {IDLE_TIMEOUT}s, check interval: {ACTIVITY_CHECK_INTERVAL}s)"
    )
    
    try:
        while True:
            await asyncio.sleep(ACTIVITY_CHECK_INTERVAL)
            
            # Check for non-agent participants
            has_real_participants = False
            for participant in room.remote_participants.values():
                # Check if participant is not an agent
                if not (participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT):
                    has_real_participants = True
                    break
            
            # If no real participants, wait grace period and check again
            if not has_real_participants:
                logger.info(
                    f"No non-agent participants in room {room.name}. "
                    f"Waiting {EMPTY_ROOM_GRACE_PERIOD}s grace period..."
                )
                await asyncio.sleep(EMPTY_ROOM_GRACE_PERIOD)
                
                # Re-check after grace period
                has_real_participants = False
                for participant in room.remote_participants.values():
                    if not (participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT):
                        has_real_participants = True
                        break
                
                if not has_real_participants:
                    logger.info(
                        f"Room {room.name} still empty after grace period. Cleaning up session."
                    )
                    break  # Exit monitor, triggering cleanup
            
            # Check for idle timeout
            time_since_activity = time.time() - last_activity_time[0]
            if time_since_activity > IDLE_TIMEOUT:
                logger.info(
                    f"Session idle timeout in room {room.name}. "
                    f"Last activity: {int(time_since_activity)}s ago. Cleaning up."
                )
                break  # Exit monitor, triggering cleanup
            
            logger.debug(
                f"Room {room.name} activity check: "
                f"participants={len(room.remote_participants)}, "
                f"idle_time={int(time_since_activity)}s"
            )
    
    except asyncio.CancelledError:
        logger.info(f"Activity monitor cancelled for room {room.name}")
        raise
    except Exception as e:
        logger.error(f"Error in activity monitor for room {room.name}: {e}", exc_info=True)


@server.rtc_session()
async def my_agent(ctx: agents.JobContext):
    """
    Main agent session handler with cleanup and concurrency management.
    """
    session_id = f"{ctx.room.name}-{time.time()}"
    logger.info(f"Session {session_id} requested")
    
    # Check concurrency limit
    if not await increment_session_count():
        logger.error(
            f"Rejecting session {session_id}: maximum concurrent sessions reached"
        )
        # Note: In LiveKit agents, we can't easily reject the session here,
        # but we can exit early. The room will still be created but the agent won't join.
        return
    
    session: Optional[AgentSession] = None
    monitor_task: Optional[asyncio.Task] = None
    
    try:
        logger.info(f"Starting session {session_id} in room {ctx.room.name}")
        
        # Track last activity time (using list to allow modification in nested function)
        last_activity_time = [time.time()]
        
        # Define event handler to update last activity time
        def on_track_subscribed(track: rtc.Track, publication: rtc.TrackPublication, participant: rtc.RemoteParticipant):
            """Update activity time when receiving audio from user."""
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
                    last_activity_time[0] = time.time()
                    logger.debug(f"Activity detected from {participant.identity}")
        
        # Register event handler
        ctx.room.on("track_subscribed", on_track_subscribed)
        
        # Initialize session with error handling
        try:
            logger.info(f"Initializing STT, LLM, TTS, and VAD for session {session_id}")
            session = AgentSession(
                stt="assemblyai/universal-streaming:en",
                llm="openai/gpt-4o-mini",
                tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
                vad=silero.VAD.load(),
                turn_detection=MultilingualModel(),
            )
            logger.info(f"Session {session_id} models initialized successfully")
        except Exception as e:
            logger.error(
                f"Failed to initialize session {session_id} models: {e}",
                exc_info=True
            )
            raise

        try:
            logger.info(f"Starting session {session_id} with room {ctx.room.name}")
            await session.start(
                room=ctx.room,
                agent=Assistant(),
                room_options=room_io.RoomOptions(
                    audio_input=room_io.AudioInputOptions(
                        noise_cancellation=lambda params: noise_cancellation.BVCTelephony() 
                        if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP 
                        else noise_cancellation.BVC(),
                    ),
                ),
            )
            logger.info(f"Session {session_id} started, sending greeting")
        except Exception as e:
            logger.error(
                f"Failed to start session {session_id}: {e}. "
                f"This may be due to STT quota limits or network issues.",
                exc_info=True
            )
            raise

        try:
            await session.generate_reply(
                instructions=INTERVIEWER_GREETING
            )
            logger.info(f"Session {session_id} greeting sent successfully")
        except Exception as e:
            logger.error(
                f"Failed to generate greeting for session {session_id}: {e}",
                exc_info=True
            )
            # Don't raise here - the session is already started, just log the error
        
        # Start monitoring room activity (empty room detection and idle timeout)
        monitor_task = asyncio.create_task(
            monitor_room_activity(ctx.room, session, last_activity_time)
        )
        
        logger.info(f"Session {session_id} fully initialized and monitoring started")
        
        # Wait for monitor to signal cleanup (empty room or idle timeout)
        await monitor_task
        
    except asyncio.CancelledError:
        logger.info(f"Session {session_id} cancelled (room={ctx.room.name})")
        raise
    except Exception as e:
        logger.error(
            f"Error in session {session_id} (room={ctx.room.name}): {e}",
            exc_info=True
        )
        # If initialization failed, we want to clean up immediately
        # to avoid consuming resources
    finally:
        # Cleanup
        logger.info(
            f"Cleaning up session {session_id} (room={ctx.room.name}, "
            f"reason={'empty_room_or_idle' if monitor_task and monitor_task.done() else 'error_or_cancel'})"
        )
        
        # Cancel monitor task if still running
        if monitor_task and not monitor_task.done():
            logger.debug(f"Cancelling monitor task for session {session_id}")
            monitor_task.cancel()
            try:
                await monitor_task
            except asyncio.CancelledError:
                pass
        
        # Close session if it was created
        if session:
            try:
                # The session cleanup is handled by the LiveKit SDK
                # when the function exits, but we can add explicit cleanup if needed
                logger.info(
                    f"Session {session_id} resources released. "
                    f"STT/TTS connections will be closed by SDK."
                )
            except Exception as e:
                logger.error(
                    f"Error during session cleanup for {session_id}: {e}",
                    exc_info=True
                )
        
        # Decrement active session count
        await decrement_session_count()
        
        logger.info(
            f"Session {session_id} cleanup complete. Room: {ctx.room.name}"
        )


if __name__ == "__main__":
    import os
    livekit_url = os.getenv("LIVEKIT_URL", "Not configured")
    print("\n" + "="*60)
    print("Agent Server Starting...")
    print("="*60)
    print(f"LiveKit URL: {livekit_url}")
    print("Token Server: http://localhost:8000/token?room=<room>&username=<user>")
    print("Connect at: https://meet.livekit.io")
    print("="*60 + "\n")
    agents.cli.run_app(server)

    