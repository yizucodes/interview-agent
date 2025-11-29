import logging
from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentServer,AgentSession, Agent, room_io
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


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=INTERVIEWER_SYSTEM_PROMPT,
            tools=[search_project_docs, generate_feedback],
        )

server = AgentServer()

@server.rtc_session()
async def my_agent(ctx: agents.JobContext):
    session = AgentSession(
        stt="assemblyai/universal-streaming:en",
        llm="openai/gpt-4.1-mini",
        tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: noise_cancellation.BVCTelephony() if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP else noise_cancellation.BVC(),
            ),
        ),
    )

    await session.generate_reply(
        instructions=INTERVIEWER_GREETING
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

    