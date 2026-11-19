# MeetingMind AI

**MeetingMind AI** is a full-stack AI meeting intelligence platform that transforms raw meeting recordings into timestamped transcripts, executive summaries, actionable task boards, productivity analytics, and an interactive Agentic RAG assistant with Human-in-the-Loop (HITL) follow-up emails.

---

## Key Features

* **Asynchronous Video Processing Pipeline:** Upload meeting recordings (`.mp4`, `.webm`, `.mov`) and process them in the background using **Celery + Redis**, extracting audio via **MoviePy** and generating timestamped transcripts with **Groq Whisper**.
* **AI Summaries & Action Item Management:** Automatically generates concise meeting summaries and structured action items with owner, deadline, priority, and ambiguity detection. Supports inline editing, approval workflows, completion toggling, and `.txt` note exports.
* **Agentic RAG Meeting Assistant:** Ask questions across a single meeting or compare insights across all meetings. Powered by **PostgreSQL + `pgvector`** semantic search (`BAAI/bge-small-en-v1.5` 384-dim embeddings via Hugging Face Inference API) with persistent, renameable multi-session chat history.
* **Human-in-the-Loop (HITL) Email Automation:** The AI assistant drafts follow-up emails for pending action items. Users review, edit, and explicitly approve each draft before Celery dispatches it via SMTP.
* **Meeting Analytics Dashboard:** Tracks total meetings processed, total hours transcribed, completed vs. pending tasks, task distribution by owner, key decisions extracted, and meeting-wise productivity scores.
* **JWT Authentication:** Secure signup and login flow with `bcrypt` password hashing and bearer-token sessions.
* **Modern Split-Pane Workspace:** Dark-sidebar React interface featuring a Dashboard upload view, split-pane Meeting viewer (summary + action items alongside timestamped transcripts), centralized Action Items tracker, and Analytics view.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React, Vite, Tailwind CSS, Axios, Lucide React |
| **Backend** | FastAPI, SQLAlchemy, Celery, MoviePy, PyJWT, Bcrypt, HTTPX |
| **Database & Queue** | PostgreSQL + `pgvector` (Neon), Redis (Upstash) |
| **AI & Embeddings** | Groq API (Whisper + LLM), Hugging Face Inference API (`BAAI/bge-small-en-v1.5`) |
| **Deployment** | Render (Combined Web Service serving FastAPI, Celery worker, and Vite static build) |

---

## Project Structure

```text
MeetingMind-AI/
├── backend/
│   ├── core/
│   │   ├── ai_engine.py      # LLM summarization & Agentic RAG orchestration
│   │   ├── auth.py           # JWT creation, verification & bcrypt hashing
│   │   ├── celery_app.py     # Celery + Redis broker configuration
│   │   ├── rag.py            # Chunking, HF Inference embeddings & pgvector search
│   │   ├── tasks.py          # Background video processing & SMTP email tasks
│   │   └── tools.py          # Agent tool definitions (RAG, SQL, email drafting)
│   ├── database/
│   │   ├── connection.py     # SQLAlchemy engine & session dependency
│   │   └── models.py         # Users, Meetings, MeetingChunks, ChatSessions, ChatMessages
│   ├── main.py               # FastAPI routes & React static file serving
│   ├── requirements.txt      # Python dependencies
│   └── start.sh              # Combined Celery + Uvicorn startup script
├── meeting-ui/
│   ├── src/
│   │   ├── components/
│   │   │   └── AnalyticsDashboard.jsx
│   │   ├── App.jsx           # Main workspace, sidebar navigation & split-pane viewer
│   │   ├── AuthPage.jsx      # Login / Signup UI
│   │   └── ChatAssistant.jsx # Floating Agentic RAG chat & HITL email approval cards
│   └── package.json
└── .gitignore
