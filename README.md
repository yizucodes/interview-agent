# Project Interview Coach

An AI-powered technical interviewer that conducts voice-based interviews about your project. Built with LiveKit for real-time voice communication and RAG (Retrieval Augmented Generation) for context-aware questioning.

## Features

- 🎤 **Real-time Voice Interview:** Natural conversation with AI interviewer using LiveKit's voice pipeline
- 📄 **RAG-Powered Questions:** AI reads your project documentation to ask informed, specific questions
- 📝 **Live Transcription:** See conversation transcript in real-time as you speak
- 🎯 **Intelligent Follow-ups:** Agent challenges vague answers and probes for technical depth
- 📊 **Structured Feedback:** Receive detailed feedback on strengths and areas for improvement
- 🔒 **Capacity Management:** Controlled concurrency to manage costs (max 5 concurrent sessions)

---

## Quick Start

### Prerequisites

- **Python 3.11+** with `uv` package manager ([install uv](https://github.com/astral-sh/uv))
- **Node.js 18+** and npm
- **LiveKit Cloud Account** ([sign up free](https://cloud.livekit.io))
- **API Keys:**
  - OpenAI API key (for LLM and embeddings)
  - AssemblyAI API key (for STT)
  - Cartesia API key (for TTS)
  - LiveKit credentials (URL, API key, API secret)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd backend

# Install backend dependencies
uv sync

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Configuration

Create `.env.local` in the `backend/` directory:

```bash
# LiveKit Configuration
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-key
```

> **Note:** See `.env.example` for a template.

### Ingest Your Project Documentation

Place your project documentation PDF in `backend/data/project_doc_long.pdf`, then run:

```bash
cd backend
uv run ingest.py
```

**Expected output:**
```
Split 1 documents into 15 chunks
Stored 15 chunks in Chroma at data/chroma_db
```

---

## Running the Application

You need **three terminals** running simultaneously:

### Terminal 1: Token Server

```bash
cd backend
uv run token_server.py
```

**Expected output:**
```
Token Server Started!
============================================================
Get tokens at: http://localhost:8000/token?room=<room>&username=<user>
============================================================
```

### Terminal 2: AI Agent

```bash
cd backend
uv run agent.py dev
```

**Expected output:**
```
Agent Server Starting...
============================================================
LiveKit URL: wss://your-project.livekit.cloud
Connect at: https://meet.livekit.io
============================================================
```

### Terminal 3: Frontend

```bash
cd frontend
npm run dev
```

**Expected output:**
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

## Usage

1. **Open the app:** Navigate to `http://localhost:5173` in your browser
2. **Start interview:** Click the "Start Interview" button
3. **Grant permissions:** Allow microphone access when prompted
4. **Wait for greeting:** The AI interviewer will introduce itself (2-5 seconds)
5. **Speak naturally:** Answer questions as you would in a real interview
6. **View transcript:** Click "Transcript" button to see live conversation text
7. **End interview:** Click "End Interview" when finished

### Tips for Best Experience

- **Speak clearly:** Use a good microphone in a quiet environment
- **Be specific:** Vague answers will trigger follow-up questions
- **Pause naturally:** VAD detects when you stop speaking (~500ms silence)
- **Check browser:** Chrome and Edge have best WebRTC support

---

## Project Structure

```
interview-agent/
├── backend/                # Backend Python code
│   ├── agent.py           # Main AI agent with voice pipeline
│   ├── token_server.py    # FastAPI server for LiveKit tokens
│   ├── tools.py           # Function tools (RAG search, feedback)
│   ├── rag.py             # Vector store and retrieval logic
│   ├── prompts.py         # System prompts for interviewer
│   ├── ingest.py          # Script to load docs into vector DB
│   ├── data/
│   │   ├── project_doc_long.pdf      # Your project documentation
│   │   └── chroma_db/           # Vector database (created by ingest.py)
│   └── .env.local         # API keys and configuration
├── frontend/              # React frontend
│   ├── src/
│   │   ├── App.tsx              # Main app with connection logic
│   │   ├── components/
│   │   │   ├── CallInterface.tsx    # Call UI and controls
│   │   │   ├── Transcript.tsx       # Live transcription display
│   │   │   ├── AudioVisualizer.tsx  # Audio waveform visualization
│   │   │   └── VideoRenderer.tsx    # Video track rendering
│   │   ├── types.ts             # TypeScript type definitions
│   │   └── index.css            # Global styles
│   └── package.json
├── DESIGN.md              # Architecture and design decisions
└── README.md              # This file
```

---

## How It Works

### Voice Pipeline

```
User speaks → VAD detects speech → STT transcribes → LLM processes → TTS speaks → User hears
     ↓                                                      ↓
   LiveKit                                          RAG System
```

1. **Voice Activity Detection (VAD):** Silero model detects when you start/stop speaking
2. **Speech-to-Text (STT):** AssemblyAI transcribes your speech to text
3. **RAG Search:** Agent searches your project docs using semantic search (ChromaDB + OpenAI embeddings)
4. **LLM Processing:** GPT-4o-mini generates contextual follow-up questions
5. **Text-to-Speech (TTS):** Cartesia Sonic synthesizes agent's response
6. **Audio Delivery:** LiveKit streams audio back to your browser

### RAG System

```
project_doc_long.pdf → Chunking (1000 chars, 200 overlap) → Embeddings → ChromaDB
                                                                          ↓
Agent asks question → Semantic search → Relevant chunks → LLM context
```

**Deduplication:** Uses content fingerprinting (first 150 chars) to remove duplicate chunks from retrieval results.

### How RAG Was Integrated

The RAG system is integrated into the agent's decision-making through function calling:

1. **Document Ingestion:** PDFs are chunked and embedded into ChromaDB (see [RAG Settings](#rag-settings-ragpy))
2. **On-Demand Retrieval:** When the agent needs project-specific context, it calls the `search_project_docs` function tool
3. **Context Injection:** Retrieved chunks are added to the LLM context, enabling informed follow-up questions
4. **Deduplication:** Overlapping chunks are filtered using content fingerprinting to reduce redundancy

For detailed RAG architecture and assumptions, see [DESIGN.md - RAG Integration Details](DESIGN.md#rag-integration-details) and [DESIGN.md - Design Decisions](DESIGN.md#key-design-decisions--trade-offs).

---

## Tools & Frameworks

### Backend
- **LiveKit Agents SDK:** Voice pipeline, WebRTC handling, STT/TTS integration
- **OpenAI GPT-4o-mini:** LLM for conversation and embeddings
- **AssemblyAI:** Speech-to-text transcription
- **Cartesia Sonic:** Text-to-speech synthesis
- **LangChain:** Document processing and RAG utilities
- **ChromaDB:** Local vector database for semantic search
- **FastAPI:** Token server for LiveKit authentication
- **Silero VAD:** Voice activity detection

### Frontend
- **React + TypeScript:** UI framework
- **Vite:** Build tool and dev server
- **LiveKit React SDK:** WebRTC components and hooks

For detailed design decisions and trade-offs, see [DESIGN.md](DESIGN.md).

---

## Design Decisions & Assumptions

> **Note:** This is a summary. For detailed analysis of trade-offs, limitations, and alternatives considered, see [DESIGN.md](DESIGN.md).

### Key Assumptions
- **Hosting:** Local development setup; production deployment requires infrastructure changes (see [DESIGN.md - Deployment Recommendations](DESIGN.md#deployment-recommendations))
- **RAG:** ChromaDB suitable for small-to-medium document collections; production may need Pinecone/Weaviate
- **Concurrency:** 5 concurrent sessions limit for cost control
- **Voice Pipeline:** LiveKit handles all WebRTC complexity

### Quick Reference
- **RAG Chunking:** 1000 chars, 200 overlap (see [DESIGN.md - RAG Chunk Size](DESIGN.md#2-rag-chunk-size-1000-characters-with-200-overlap))
- **Vector DB:** ChromaDB (local) - see [DESIGN.md - Vector Store](DESIGN.md#9-vector-store-chromadb-not-pineconeweaviate) for production alternatives
- **LLM:** GPT-4o-mini for speed/cost balance (see [DESIGN.md - LLM Choice](DESIGN.md#6-llm-choice-gpt-4o-mini-vs-gpt-4))
- **Session Management:** 15-minute idle timeout, 3-second empty room grace period

### Limitations
- Maximum 5 concurrent sessions (configurable)
- ChromaDB not suitable for production scale (thousands of docs)
- No authentication in current setup (development only)
- See [DESIGN.md](DESIGN.md) for complete trade-offs and limitations

---

## API Endpoints

### Token Server (FastAPI)

**Base URL:** `http://localhost:8000`

#### `GET /livekit-url`
Returns the LiveKit WebSocket URL.

**Response:**
```json
{
  "url": "wss://your-project.livekit.cloud"
}
```

#### `GET /token?room=<room>&username=<user>`
Generates a LiveKit access token for the specified room and username.

**Parameters:**
- `room` (string): Room name
- `username` (string): Participant identity

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error (429):**
```json
{
  "detail": "Maximum number of interviews reached. Please try again later."
}
```

#### `GET /capacity-check`
Checks if there's capacity for a new session.

**Response:**
```json
{
  "has_capacity": true,
  "active_sessions": 2,
  "max_sessions": 5,
  "message": "Capacity available"
}
```

---

## Configuration Options

### Concurrency Settings (agent.py)

```python
MAX_CONCURRENT_SESSIONS = 5  # Maximum simultaneous interviews
IDLE_TIMEOUT = 900           # 15 minutes - auto-cleanup idle sessions
ACTIVITY_CHECK_INTERVAL = 60 # Check every 60 seconds
EMPTY_ROOM_GRACE_PERIOD = 3  # Wait 3 seconds before cleanup
```

### RAG Settings (rag.py)

```python
chunk_size = 1000      # Characters per chunk
chunk_overlap = 200    # Overlap between chunks
k = 4                  # Number of chunks to retrieve
deduplicate = True     # Remove duplicate chunks
```

### Voice Models (agent.py)

```python
AgentSession(
    stt="assemblyai/universal-streaming:en",  # Speech-to-Text
    llm="openai/gpt-4o-mini",                  # Language Model
    tts="cartesia/sonic-3:9626c31c-...",       # Text-to-Speech (British male)
    vad=silero.VAD.load(),                     # Voice Activity Detection
)
```

---

## Troubleshooting

### "Failed to connect to token server"
- **Check:** Is the token server running on port 8000?
- **Fix:** Run `cd backend && uv run token_server.py` in a separate terminal

### "No audio from agent"
- **Check:** Is the agent server running?
- **Check:** Browser microphone permissions granted?
- **Fix:** Open browser console (F12) and check for WebRTC errors

### "Agent asks generic questions (not using my docs)"
- **Check:** Did you run `uv run ingest.py`?
- **Check:** Does `backend/data/chroma_db/` exist?
- **Fix:** Re-run ingestion and restart agent

### "Maximum concurrent sessions reached"
- **Cause:** 5 other interviews are active
- **Fix:** Wait for sessions to end, or increase `MAX_CONCURRENT_SESSIONS` in `agent.py`

### "Transcript not showing"
- **Wait:** First transcription may take 5-10 seconds
- **Check:** Open browser console (F12) for errors
- **Note:** Transcriptions appear after you **stop** speaking (VAD detects end-of-speech)

### "Rate limit errors"
- **Cause:** OpenAI/AssemblyAI API quota exceeded
- **Fix:** Check your API key usage dashboards
- **Prevention:** Reduce `MAX_CONCURRENT_SESSIONS` to control costs

---

## Development

### Code Quality

```bash
# Frontend linting
cd frontend
npm run lint

# Python formatting (if using black/ruff)
cd backend
uv run ruff format .
```

### Hot Reload

- **Frontend:** Vite provides instant HMR (Hot Module Replacement)
- **Backend:** Restart agent/token server manually after code changes

---

## Security Notes

⚠️ **This is a development setup. Do NOT use in production without:**

1. **Authentication:** Add OAuth/JWT to token server
2. **Rate limiting:** Prevent token farming
3. **CORS restriction:** Change from `*` to specific domains
4. **Input validation:** Sanitize room names, usernames
5. **Secrets management:** Use AWS Secrets Manager, GCP Secret Manager, or HashiCorp Vault
6. **HTTPS only:** Force SSL for all connections

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is for educational purposes. Check with LiveKit, OpenAI, AssemblyAI, and Cartesia for their respective license terms.

---

## Acknowledgments

- **LiveKit:** Real-time voice infrastructure and Agents SDK
- **OpenAI:** GPT-4o-mini for natural conversations and embeddings
- **AssemblyAI:** High-quality speech-to-text
- **Cartesia:** Ultra-low latency text-to-speech
- **LangChain:** RAG and document processing utilities
- **ChromaDB:** Vector database for semantic search

---

## Support

- **Architecture & Design:** See [DESIGN.md](DESIGN.md) for detailed design decisions, trade-offs, and system architecture
- **Quick Reference:** See [Configuration Options](#configuration-options) for runtime settings
- **Troubleshooting:** See [Troubleshooting](#troubleshooting) for common issues

---

## Roadmap

- [ ] Post-interview analytics dashboard
- [ ] Persistent interview history (database integration)
- [ ] Resume parsing for better context
- [ ] Multi-language support
- [ ] Video analysis (body language, eye contact)
- [ ] Custom interviewer voices
- [ ] Screen sharing for code walkthroughs


---

**Built with ❤️ using LiveKit, OpenAI, and modern web technologies**

