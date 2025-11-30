# Project Interview Coach - Design Document

> **Quick Links:**
> - [Setup Instructions](README.md#quick-start)
> - [Configuration Options](README.md#configuration-options)
> - [Troubleshooting](README.md#troubleshooting)
> - [How It Works (High-Level)](README.md#how-it-works)
> - [Tools & Frameworks](README.md#tools--frameworks)

## Architecture Overview

The Project Interview Coach is a real-time voice-based AI interviewer built on LiveKit's infrastructure. The system consists of three main components:

```
┌─────────────────┐      ┌──────────────────┐      ┌────────────────────┐
│  React Frontend │◄────►│  Token Server    │      │  LiveKit Cloud     │
│   (TypeScript)  │      │    (FastAPI)     │      │                    │
└─────────────────┘      └──────────────────┘      └────────────────────┘
         │                                                     ▲
         │                                                     │
         │                                                     │
         └─────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │   AI Agent (Python)      │
                    │   - VAD + STT + LLM      │
                    │   - RAG Integration      │
                    │   - Vector Store (Chroma)│
                    └──────────────────────────┘
```

### Components

1. **Frontend (React + TypeScript + Vite)**
   - LiveKit React Components for WebRTC
   - Real-time audio/video handling
   - Live transcription display
   - Modern, responsive UI

2. **Token Server (FastAPI)**
   - Issues LiveKit access tokens
   - Manages session capacity (max 5 concurrent)
   - CORS-enabled for local development

3. **AI Agent (Python + LiveKit Agents SDK)**
   - Voice Activity Detection (Silero VAD)
   - Speech-to-Text (AssemblyAI)
   - LLM (OpenAI GPT-4o-mini)
   - Text-to-Speech (Cartesia Sonic)
   - RAG system for project documentation
   - Function calling for doc search and feedback

4. **RAG System (LangChain + ChromaDB)**
   - PDF document ingestion
   - Semantic chunking (1000 chars, 200 overlap)
   - OpenAI embeddings
   - Deduplication for better retrieval

---

## End-to-End System Flow

### User Journey
1. User opens frontend → Requests token from token server
2. Token server checks capacity → Issues LiveKit token
3. Frontend connects to LiveKit room → Agent joins automatically
4. Agent greets user → Conversation begins

### Conversation Turn Flow
```
User Speech
    ↓
VAD detects end-of-speech (~500ms silence)
    ↓
STT transcribes (AssemblyAI) → Text sent to LLM
    ↓
LLM decides: Need project context?
    ├─ Yes → Calls search_project_docs() tool
    │         → RAG retrieves relevant chunks
    │         → Chunks added to LLM context
    └─ No → Proceeds with conversation
    ↓
LLM generates response (GPT-4o-mini)
    ↓
TTS synthesizes (Cartesia) → Audio streamed via LiveKit
    ↓
User hears response → Cycle repeats
```

### RAG Integration Details

The RAG system is **not** always active. It's triggered on-demand via function calling:

1. **Agent receives user answer** → LLM analyzes if project-specific knowledge needed
2. **Function call triggered** → `search_project_docs(query)` invoked
3. **Semantic search** → ChromaDB retrieves top-k chunks (k=4)
4. **Deduplication** → Content fingerprinting removes overlaps
5. **Context injection** → Chunks added to LLM system message
6. **Follow-up generated** → LLM uses retrieved context for informed question

This on-demand approach:
- ✅ Reduces latency (no RAG on every turn)
- ✅ Saves API costs (fewer embedding searches)
- ✅ Keeps context focused (only when needed)

See [RAG Chunk Size Decision](#2-rag-chunk-size-1000-characters-with-200-overlap) for why 1000/200 was chosen.

---

## LiveKit Agent Design

### Agent Architecture

The agent is built on LiveKit Agents SDK using the `AgentSession` pattern. Core components:

```python
session = AgentSession(
    stt="assemblyai/universal-streaming:en",  # Real-time transcription
    llm="openai/gpt-4o-mini",                  # Conversation engine
    tts="cartesia/sonic-3:...",                # Voice synthesis
    vad=silero.VAD.load(),                     # Speech detection
    turn_detection=MultilingualModel()         # End-of-turn detection
)
```

**Lifecycle:**
1. **Connection:** Agent joins room when LiveKit triggers `@server.rtc_session()` decorator
2. **Initialization:** Session starts with room connection + audio pipeline setup
3. **Greeting:** Initial reply generated to establish conversation
4. **Active:** Agent listens for speech → transcribes → LLM → TTS → responds
5. **Cleanup:** Monitor task detects end conditions → graceful shutdown → decrement counter

**Key Design:**
- **Single-threaded per session:** Each agent session is isolated (no shared state)
- **Event-driven:** Reacts to LiveKit room events (`track_subscribed`, speech detection)
- **Async-first:** All I/O operations are non-blocking (STT, LLM, TTS)

### Session Management

**Concurrency Control:**
```python
MAX_CONCURRENT_SESSIONS = 5
active_sessions = 0  # Global counter, protected by asyncio.Lock
```

- Hard limit enforced at session start
- Thread-safe using `asyncio.Lock` (no race conditions)
- New connections rejected if `active_sessions >= MAX_CONCURRENT_SESSIONS`
- Count decremented in `finally` block (guaranteed cleanup)

**Idle Timeout Strategy:**
```
IDLE_TIMEOUT = 900s (15 min)           # Max session duration
ACTIVITY_CHECK_INTERVAL = 60s          # Monitor frequency
EMPTY_ROOM_GRACE_PERIOD = 3s           # Connection race buffer
```

**Activity Tracking:**
- `last_activity_time` updated on every audio track subscription
- Background monitor task checks every 60s for:
  - Empty room (no non-agent participants)
  - Idle timeout (no activity for 15 min)
- Grace period prevents premature cleanup during user reconnections

**Cleanup Triggers:**
1. User leaves room → Empty room detected after 3s grace
2. 15 min idle → Timeout triggered
3. Connection error → Exception caught in `finally` block
4. Server shutdown → `asyncio.CancelledError` propagates

### Function Calling Integration

**Tool Registration:**
```python
class Assistant(Agent):
    def __init__(self):
        super().__init__(
            instructions=INTERVIEWER_SYSTEM_PROMPT,
            tools=[search_project_docs, generate_feedback]  # Auto-registered
        )
```

**How It Works:**
1. Tools defined as Python functions with type hints + docstrings
2. LiveKit SDK auto-converts to OpenAI function schema
3. LLM receives tool schemas in system message
4. When LLM returns function call → SDK intercepts → executes Python function
5. Function result injected back into LLM context
6. LLM generates natural language response using tool output

**Tool Execution Flow Example 1: Documentation Search**
```
User: "What does this project do?"
    ↓
LLM decides: Need project context → Calls search_project_docs("project purpose")
    ↓
RAG retrieves relevant chunks from ChromaDB
    ↓
Chunks returned to LLM as tool result
    ↓
LLM generates answer: "This project is a voice-based interviewer..."
    ↓
TTS speaks response
```

**Tool Execution Flow Example 2: Feedback Generation**
```
Interview concludes → User asks for feedback
    ↓
LLM analyzes conversation history → Identifies strengths and areas for improvement
    ↓
LLM calls generate_feedback(
    strengths="Clear explanation of system architecture...",
    areas_for_improvement="Could elaborate more on error handling...",
    rating=8
)
    ↓
Tool formats feedback as structured summary
    ↓
Formatted feedback returned to LLM
    ↓
LLM delivers feedback naturally: "Great job! You scored 8/10. Your strengths were..."
    ↓
TTS speaks feedback
```

**Available Tools:**

1. **`search_project_docs(query: str) -> str`**
   - **Purpose:** Retrieve relevant information from project documentation via RAG
   - **When triggered:** LLM needs project-specific context to ask informed questions
   - **Parameters:**
     - `query`: Search query string (e.g., "authentication implementation", "API endpoints")
   - **Returns:** Retrieved document chunks or error message
   - **Behavior:** Searches ChromaDB with k=4, deduplicates results, formats as context
   - **Latency impact:** +1-2 seconds per call

2. **`generate_feedback(strengths: str, areas_for_improvement: str, rating: int) -> str`**
   - **Purpose:** Generate structured end-of-interview feedback summary
   - **When triggered:** Interview concludes or user explicitly requests feedback
   - **Parameters:**
     - `strengths`: Positive aspects of interview (what candidate did well)
     - `areas_for_improvement`: Constructive criticism (where to improve)
     - `rating`: Numeric score 1-10 (automatically clamped if out of range)
   - **Returns:** Formatted feedback summary with rating, strengths, areas for improvement
   - **Behavior:** Validates rating bounds, formats as readable summary, logs rating
   - **Example output:**
     ```
     Interview Feedback Summary
     ==========================
     RATING: 8/10
     
     STRENGTHS:
     Clear explanation of system architecture...
     
     AREAS FOR IMPROVEMENT:
     Could elaborate more on error handling...
     ```

**Key Behaviors:**
- Tools are **async** (non-blocking) but RAG search uses blocking I/O
- No retry logic (fails open - LLM responds without tool data if error)
- Tool calls logged at INFO level for debugging
- Multiple tools can be called in sequence (e.g., search docs → ask question → generate feedback)
- Tool schemas auto-generated from Python type hints + docstrings

### Agent State Management

**Stateless Design:**
- No persistent state between sessions
- Each session is self-contained
- Conversation history managed by `AgentSession` (in-memory only)

**Session-Level State:**
```python
last_activity_time = [time.time()]  # Mutable container for closure
```
- Used for idle timeout tracking
- Updated via event handler closure
- Scoped to single session (no shared state)

**Global State:**
```python
active_sessions = 0  # Only global state - protected by lock
```

**Trade-offs:**
- ✅ Simple, no state synchronization issues
- ✅ Each session independent (crash doesn't affect others)
- ❌ No conversation persistence (sessions can't resume)
- ❌ No cross-session analytics (would need database)

### Error Handling and Recovery

**Three-Layer Strategy:**

**1. Initialization Errors (Fail Fast):**
```python
try:
    session = AgentSession(...)
except Exception as e:
    logger.error(f"Failed to initialize: {e}")
    raise  # Exit immediately, don't occupy session slot
```

**2. Runtime Errors (Log and Continue):**
```python
try:
    await session.generate_reply(...)
except Exception as e:
    logger.error(f"Failed to generate greeting: {e}")
    # Continue - agent still functional for conversation
```

**3. Cleanup Errors (Always Decrement):**
```python
finally:
    await decrement_session_count()  # Guaranteed to run
```

**Error Recovery Behaviors:**
- **STT failure:** Session continues, next utterance retried
- **LLM timeout:** User sees silence, can repeat question
- **TTS failure:** Text shown but not spoken
- **Room disconnect:** Monitor task exits → cleanup triggered
- **Tool failure:** LLM proceeds without tool data

**Observability:**
- All errors logged with `exc_info=True` (full stack traces)
- Session lifecycle logged at INFO level
- Tool calls visible in logs
- Active session count tracked

**Production Improvements Needed:**
- Dead letter queue for failed tool calls
- Metrics (Prometheus): session duration, error rates
- Health check endpoint for load balancer
- Circuit breaker for external APIs (STT/TTS)
- Graceful shutdown (drain in-progress sessions)

---

## Key Design Decisions & Trade-offs

### 1. Voice Pipeline Architecture

**Decision:** Use LiveKit Agents SDK with pre-configured STT/TTS/LLM providers

**Why:**
- **Abstraction:** Handles WebRTC complexities (NAT traversal, echo cancellation, jitter buffering)
- **Real-time:** Optimized for low-latency voice interactions
- **Scalability:** Built-in support for concurrent sessions

**Trade-offs:**
- ✅ **Pros:** Quick setup, production-ready voice quality, automatic transcription
- ❌ **Cons:** Vendor lock-in to LiveKit ecosystem, limited customization of audio processing
- **Alternative considered:** Build custom WebRTC + separate STT/TTS APIs (too complex, more latency)

### 2. RAG Chunk Size: 1000 characters with 200 overlap

**Why:**
- **1000 chars ≈ 250 tokens:** Fits well in LLM context without overwhelming it
- **200 overlap:** Preserves context across chunk boundaries (critical for technical docs)
- **Balance:** Large enough to capture complete concepts, small enough for precise retrieval

**Trade-offs:**
- ✅ **Pros:** Good balance between context and precision, reduces semantic drift
- ❌ **Cons:** More chunks = slower ingestion, overlap creates duplicates (solved with deduplication)
- **Alternatives:**
  - 500 chars: Too fragmented for technical explanations
  - 2000 chars: Too broad, loses precision in retrieval

### 3. Deduplication Strategy: Content Fingerprinting

**Decision:** Use first 150 chars as fingerprint to filter duplicate chunks

**Why:**
- **Speed:** O(n) time complexity with set lookups
- **Effectiveness:** Chunk overlap often creates near-duplicates with identical beginnings
- **Simplicity:** No need for fuzzy matching or embeddings comparison

**Trade-offs:**
- ✅ **Pros:** Fast, deterministic, catches most overlap duplicates
- ❌ **Cons:** Misses duplicates with different opening sentences
- **Alternative considered:** Cosine similarity on embeddings (too slow, unnecessary for this use case)

### 4. Concurrency Limit: 5 Sessions

**Decision:** Hard limit of 5 concurrent interview sessions

**Why:**
- **Cost control:** STT/TTS APIs charge per minute (AssemblyAI, Cartesia)
- **Quality:** Prevents resource exhaustion that could degrade all sessions
- **Quota limits:** OpenAI rate limits could impact performance at scale

**Trade-offs:**
- ✅ **Pros:** Predictable costs, reliable performance, prevents quota exhaustion
- ❌ **Cons:** Users may get "capacity reached" errors during peak times
- **Production improvement:** Add queue system or dynamic scaling

### 5. Session Management: Empty Room Detection + Idle Timeout

**Decision:** 
- Empty room grace period: 3 seconds
- Idle timeout: 15 minutes
- Activity check interval: 60 seconds

**Why:**
- **Resource cleanup:** Prevents abandoned sessions from consuming API quotas
- **Grace period:** Avoids race conditions when user is connecting
- **Idle timeout:** Safety net for hung connections or forgotten sessions

**Trade-offs:**
- ✅ **Pros:** Automatic cleanup, prevents cost leaks, resilient to network issues
- ❌ **Cons:** Long-winded conversations get cut off (15 min is generous)
- **Alternative:** User-initiated end only (risky - abandoned sessions waste money)

### 6. LLM Choice: GPT-4o-mini vs GPT-4

**Decision:** Use GPT-4o-mini for agent conversations

**Why:**
- **Speed:** Lower latency for better conversational flow
- **Cost:** ~10x cheaper than GPT-4
- **Capability:** Sufficient for structured interviews with RAG context

**Trade-offs:**
- ✅ **Pros:** Fast responses (better UX), cost-effective for many sessions
- ❌ **Cons:** Less nuanced follow-ups compared to GPT-4, may miss subtle technical cues
- **When to use GPT-4:** Complex code review interviews, senior-level technical depth

### 7. Transcription Display: Interim + Final Strategy

**Decision:** Show interim transcriptions immediately, replace with final when available

**Why:**
- **UX:** User sees text appear instantly as they speak (feels responsive)
- **Accuracy:** Final transcriptions correct ASR errors
- **Timeout fallback:** Auto-finalize interim after 3 seconds (handles missing finals)

**Trade-offs:**
- ✅ **Pros:** Immediate feedback, accurate final text, handles edge cases
- ❌ **Cons:** Text may flicker during interim→final transition, complex state management
- **Alternative:** Final only (simpler but feels laggy)

### 8. Frontend Framework: React + Vite (not Next.js)

**Decision:** Use Vite for frontend bundling

**Why:**
- **Speed:** Instant HMR during development
- **Simplicity:** No server-side rendering needed for this use case
- **LiveKit compatibility:** Official React components work out of the box

**Trade-offs:**
- ✅ **Pros:** Fast dev experience, simple deployment (static files), no SSR overhead
- ❌ **Cons:** No built-in API routes (separate token server needed)
- **Alternative:** Next.js would add unnecessary complexity here

### 9. Vector Store: ChromaDB (not Pinecone/Weaviate)

**Decision:** Use ChromaDB with local persistence

**Why:**
- **Simplicity:** Embedded database, no external service
- **Cost:** Free for local development
- **Sufficient:** Handles small-to-medium doc collections well

**Trade-offs:**
- ✅ **Pros:** Zero setup, no API keys, works offline, fast for small datasets
- ❌ **Cons:** Not suitable for production scale, limited query features
- **Production migration:** Switch to Pinecone/Weaviate for thousands of documents

### 10. Error Handling Philosophy: Fail Open (Capacity Check)

**Decision:** If capacity check fails, allow connection anyway

**Why:**
- **Availability:** Technical issues shouldn't block users unnecessarily
- **Graceful degradation:** Better UX than hard failures

**Trade-offs:**
- ✅ **Pros:** More resilient, better user experience during API issues
- ❌ **Cons:** Could exceed intended limits if LiveKit API is down
- **Alternative:** Fail closed (safer but frustrating for users)

---

## Performance Characteristics

### Latency Breakdown (Typical)
```
User speaks → VAD detects end: ~500ms
STT transcription: ~1-2s
LLM generates response: ~1-3s (with RAG ~2-4s)
TTS synthesis: ~500ms
Total turn latency: ~3-7s
```

### Bottlenecks
1. **RAG retrieval:** Adds 1-2s when agent calls search_project_docs
2. **Cold start:** First LLM response is slower (~5s) due to model loading
3. **Network:** WebRTC latency depends on user location vs LiveKit edge

### Optimizations Applied
- Deduplication reduces LLM context size by ~30%
- Concurrent audio processing (VAD runs while STT transcribes)
- Cached embeddings model in RAG retrieval

---

## Security Considerations

### Current Implementation (Development)
- Token server allows all origins (CORS `*`)
- No authentication on token endpoint
- LiveKit tokens expire after default period
- No rate limiting on token issuance

### Production Hardening Required
1. **Authentication:** Add OAuth/JWT to token server
2. **Rate limiting:** Prevent token farming
3. **CORS:** Restrict to known frontend domains
4. **Token TTL:** Short-lived tokens (1 hour)
5. **Input validation:** Sanitize room names, usernames
6. **Secrets management:** Use vault/KMS for API keys


---

## Testing Strategy

### Manual Testing
- Voice quality verification
- Transcription accuracy
- UI responsiveness
- Cross-browser compatibility (Chrome, Safari, Firefox)

---

## Lessons Learned

1. **LiveKit transcriptions are complex:** Needed interim/final handling + deduplication + timeouts
2. **RAG needs tuning:** Generic chunk sizes don't work well for technical docs
3. **Concurrency is critical:** Without limits, costs can spiral quickly
4. **Error handling matters:** Silent failures in voice apps are terrible UX
5. **Logging strategy:** Too much logging slows down, too little makes debugging impossible

---

## Deployment Recommendations

### Development
- Run token server + agent + frontend locally
- Use `.env.local` for secrets
- Single developer workflow

### Staging
- Deploy token server to Railway/Fly.io
- Agent runs on dedicated VM (better for long-running processes)
- Frontend on Vercel/Netlify
- Use managed ChromaDB or Pinecone

### Production
- Kubernetes for agent horizontal scaling
- Redis for session state management
- PostgreSQL for interview storage
- CloudFlare for frontend CDN
- Grafana for monitoring

---

## Conclusion

This design prioritizes **developer experience** and **cost efficiency** for a prototype/MVP. The architecture is suitable for:
- Up to 100 interviews/day
- Single-tenant deployment
- Development/testing environments

For production at scale, consider:
- Managed vector database (Pinecone)
- Separate STT/TTS services (lower cost providers)
- Load balancing and auto-scaling
- Monitoring and alerting
- Database for persistence

The core RAG + voice agent pattern is solid and can scale with infrastructure improvements.


