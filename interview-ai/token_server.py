import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from livekit import api

load_dotenv(".env.local")

app = FastAPI()

# Enable CORS (open for dev; restrict in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/livekit-url")
async def get_livekit_url():
    """Return the LiveKit WebSocket URL."""
    livekit_url = os.getenv("LIVEKIT_URL")
    if not livekit_url:
        return {"error": "LIVEKIT_URL not configured"}
    return {"url": livekit_url}


@app.get("/token")
async def get_token(room: str, username: str):
    """Generate a LiveKit access token for the given room and username."""
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    if not api_key or not api_secret:
        return {"error": "LiveKit credentials not configured"}

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(username)
        .with_name(username)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room,
            )
        )
    )
    
    return {"token": token.to_jwt()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)


