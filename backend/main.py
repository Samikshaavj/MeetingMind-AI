import re
import shutil
from pathlib import Path
from typing import Optional, List
from pydantic import BaseModel
from fastapi import FastAPI, Depends, File, UploadFile, Body, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database.connection import get_db, engine
from database.models import Base, Meeting, ChatSession, ChatMessage, User, MeetingChunk
from core.tasks import process_video_task, send_task_notification_email
from core.ai_engine import chat_with_meetings
from core.auth import hash_password, verify_password, create_access_token, get_current_user
from core.rag import index_meeting_chunks

app = FastAPI(title="MeetingMind AI")

# Auto-create any new tables (users, chat_sessions, chat_messages, meeting_chunks) in PostgreSQL
Base.metadata.create_all(bind=engine)

# --- CORS Configuration ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows your React app to fetch data
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "MeetingMind AI Engine is active!"}

# --- Auth Endpoints (Signup / Login / Me) ---

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/auth/signup")
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email.lower().strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email is already registered")

    user = User(
        name=req.name.strip(),
        email=req.email.lower().strip(),
        hashed_password=hash_password(req.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.email)
    return {
        "token": token,
        "user": {"id": user.id, "name": user.name, "email": user.email}
    }

@app.post("/api/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower().strip()).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user.id, user.email)
    return {
        "token": token,
        "user": {"id": user.id, "name": user.name, "email": user.email}
    }

@app.get("/api/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "name": current_user.name, "email": current_user.email}

# --- Video & Meetings Endpoints ---

@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...)):
    # 1. Save the uploaded file locally in the backend folder
    file_path = f"{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # 2. Send the saved file to the Celery background queue
    task = process_video_task.delay(file_path)
    
    return {
        "status": "success", 
        "message": "Video uploaded and queued for processing!", 
        "task_id": task.id
    }

@app.post("/api/test-queue")
def test_celery_queue():
    # The .delay() function sends the task to Redis
    task = process_video_task.delay("test_meeting.mp4")
    
    return {
        "message": "Video sent to background queue!", 
        "task_id": task.id
    }

@app.get("/api/meetings")
def get_all_meetings(db: Session = Depends(get_db)):
    # Fetch all meetings from the database, newest first
    meetings = db.query(Meeting).order_by(Meeting.created_at.desc()).all()
    return {"meetings": meetings}

# --- Meeting Analytics Dashboard Endpoint ---

def _extract_duration_seconds(transcript: str) -> int:
    """Parses the final [MM:SS - MM:SS] timestamp in a transcript to get meeting duration."""
    if not transcript:
        return 0
    matches = re.findall(r"\[(\d+):(\d+)\s*-\s*(\d+):(\d+)\]", transcript)
    if not matches:
        return 0
    _, _, end_m, end_s = matches[-1]
    return int(end_m) * 60 + int(end_s)

def _extract_decisions(summary: str) -> list:
    """Extracts decision statements from the meeting summary."""
    if not summary:
        return []
    decision_keywords = ("decided", "agreed", "approved", "finalized", "confirmed", "concluded", "will ", "resolved")
    sentences = re.split(r"(?<=[.!?])\s+", summary.strip())
    return [
        s.strip() for s in sentences
        if len(s.strip()) > 15 and any(kw in s.lower() for kw in decision_keywords)
    ]

@app.get("/api/analytics")
def get_meeting_analytics(db: Session = Depends(get_db)):
    meetings = db.query(Meeting).order_by(Meeting.created_at.desc()).all()

    total_meetings = len(meetings)
    total_seconds = 0
    completed_tasks = 0
    pending_tasks = 0
    approved_tasks = 0
    high_priority_pending = 0
    all_decisions = []
    owner_stats = {}
    meeting_insights = []

    for m in meetings:
        duration_sec = _extract_duration_seconds(m.transcript or "")
        total_seconds += duration_sec

        items = m.action_items if isinstance(m.action_items, list) else []
        m_total = 0
        m_completed = 0
        m_pending = 0
        m_ambiguous = 0

        for item in items:
            if not isinstance(item, dict):
                continue
            m_total += 1
            is_completed = bool(item.get("completed", False))
            is_approved = bool(item.get("approved", False))
            is_ambiguous = bool(item.get("is_ambiguous", False))
            priority = (item.get("priority") or "Medium").lower()
            owner = item.get("owner") or item.get("assigned_to") or "Unassigned"

            if is_completed:
                completed_tasks += 1
                m_completed += 1
            else:
                pending_tasks += 1
                m_pending += 1
                if priority == "high":
                    high_priority_pending += 1

            if is_approved:
                approved_tasks += 1
            if is_ambiguous:
                m_ambiguous += 1

            if owner not in owner_stats:
                owner_stats[owner] = {"owner": owner, "completed": 0, "pending": 0, "total": 0}
            owner_stats[owner]["total"] += 1
            if is_completed:
                owner_stats[owner]["completed"] += 1
            else:
                owner_stats[owner]["pending"] += 1

        m_decisions = _extract_decisions(m.summary or "")
        for d in m_decisions:
            all_decisions.append({
                "meeting_id": m.id,
                "meeting_title": m.title or f"Meeting #{m.id}",
                "date": m.created_at,
                "decision": d
            })

        # Productivity Score (0-100): rewards clear tasks, decisions, and completion rate
        completion_rate = round((m_completed / m_total) * 100) if m_total > 0 else 0
        clarity_ratio = ((m_total - m_ambiguous) / m_total) if m_total > 0 else 1.0
        score = min(100, int(
            (completion_rate * 0.5) +
            (clarity_ratio * 30) +
            (min(len(m_decisions), 4) * 5)
        ))

        if m_total == 0:
            insight = "Informational / Discussion Only"
        elif completion_rate >= 75:
            insight = "High Execution"
        elif m_ambiguous > 0:
            insight = f"{m_ambiguous} Ambiguous Task(s) Need Clarity"
        else:
            insight = f"{m_pending} Task(s) Pending Follow-up"

        meeting_insights.append({
            "id": m.id,
            "title": m.title or f"Meeting #{m.id}",
            "date": m.created_at,
            "duration_minutes": round(duration_sec / 60, 1),
            "total_tasks": m_total,
            "completed_tasks": m_completed,
            "pending_tasks": m_pending,
            "completion_rate": completion_rate,
            "decisions_count": len(m_decisions),
            "productivity_score": score,
            "insight": insight
        })

    total_tasks = completed_tasks + pending_tasks
    overall_completion_rate = round((completed_tasks / total_tasks) * 100) if total_tasks > 0 else 0

    return {
        "summary": {
            "total_meetings": total_meetings,
            "total_hours": round(total_seconds / 3600, 2),
            "total_minutes": round(total_seconds / 60, 1),
            "completed_tasks": completed_tasks,
            "pending_tasks": pending_tasks,
            "total_tasks": total_tasks,
            "approved_tasks": approved_tasks,
            "high_priority_pending": high_priority_pending,
            "completion_rate": overall_completion_rate,
            "total_decisions": len(all_decisions)
        },
        "owner_workload": sorted(owner_stats.values(), key=lambda x: x["total"], reverse=True),
        "recent_decisions": all_decisions[:10],
        "meeting_insights": meeting_insights
    }

# --- Action Item Agent Endpoints ---

@app.put("/api/meetings/{meeting_id}/action_items")
def update_action_items(meeting_id: int, updated_items: list = Body(...), db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        return {"error": "Meeting not found"}
    
    # Overwrite the JSON column with the frontend's edits
    meeting.action_items = updated_items
    db.commit()
    return {"message": "Tasks updated successfully"}

@app.post("/api/tasks/notify")
def trigger_task_notification(owner_email: str = Body(...), task_data: dict = Body(...)):
    # Send the email job to the background worker
    send_task_notification_email.delay(owner_email, task_data)
    return {"message": "Notification queued"}

# --- Human-in-the-Loop (HITL) Follow-up Email Endpoint ---

class ApproveEmailRequest(BaseModel):
    recipient_email: str
    subject: str
    body: str

@app.post("/api/emails/approve-and-send")
def approve_and_send_email(req: ApproveEmailRequest):
    if not req.recipient_email.strip():
        raise HTTPException(status_code=400, detail="Recipient email is required")

    send_task_notification_email.delay(
        req.recipient_email.strip(),
        {"task": req.subject, "description": req.body, "is_followup": True}
    )
    return {"status": "queued", "message": f"Follow-up email queued for {req.recipient_email}"}

# --- Vector RAG Re-Indexing Endpoint ---

@app.post("/api/rag/reindex")
def reindex_all_meetings(db: Session = Depends(get_db)):
    meetings = db.query(Meeting).all()
    for m in meetings:
        index_meeting_chunks(db, m)
    return {"message": f"Indexed {len(meetings)} meetings into pgvector."}

# --- Persistent Conversational Meeting Assistant Endpoints ---

class CreateChatRequest(BaseModel):
    title: Optional[str] = "New Conversation"
    meeting_id: Optional[int] = None

class RenameChatRequest(BaseModel):
    title: str

class ChatRequest(BaseModel):
    question: str
    chat_id: Optional[int] = None
    meeting_id: Optional[int] = None

@app.get("/api/chats")
def list_chats(db: Session = Depends(get_db)):
    sessions = db.query(ChatSession).order_by(ChatSession.created_at.desc()).all()
    return {
        "chats": [
            {
                "id": s.id,
                "title": s.title,
                "meeting_id": s.meeting_id,
                "created_at": s.created_at
            }
            for s in sessions
        ]
    }

@app.post("/api/chats")
def create_chat(req: CreateChatRequest, db: Session = Depends(get_db)):
    session = ChatSession(title=req.title, meeting_id=req.meeting_id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id,
        "title": session.title,
        "meeting_id": session.meeting_id,
        "created_at": session.created_at
    }

@app.get("/api/chats/{chat_id}/messages")
def get_chat_messages(chat_id: int, db: Session = Depends(get_db)):
    msgs = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == chat_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    return {"messages": [{"id": m.id, "role": m.role, "content": m.content} for m in msgs]}

@app.put("/api/chats/{chat_id}")
def rename_chat(chat_id: int, req: RenameChatRequest, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == chat_id).first()
    if not session:
        return {"error": "Chat not found"}
    session.title = req.title.strip() or session.title
    db.commit()
    return {"id": session.id, "title": session.title}

@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: int, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == chat_id).first()
    if not session:
        return {"error": "Chat not found"}
    db.delete(session)
    db.commit()
    return {"message": "Chat deleted"}

@app.post("/api/chat")
def chat_endpoint(req: ChatRequest, db: Session = Depends(get_db)):
    # 1. Fetch or auto-create a chat session
    if req.chat_id:
        session = db.query(ChatSession).filter(ChatSession.id == req.chat_id).first()
    else:
        session = None

    if not session:
        auto_title = req.question[:40] + ("..." if len(req.question) > 40 else "")
        session = ChatSession(title=auto_title, meeting_id=req.meeting_id)
        db.add(session)
        db.commit()
        db.refresh(session)

    # 2. Load previous messages from PostgreSQL for conversational context
    past_msgs = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in past_msgs]

    # 3. Save the user's message
    user_msg = ChatMessage(session_id=session.id, role="user", content=req.question)
    db.add(user_msg)
    db.commit()

    # 4. Run the Agentic RAG Assistant (dynamically routes between pgvector, SQL, and HITL email tools)
    target_meeting_id = session.meeting_id if session.meeting_id is not None else req.meeting_id
    agent_result = chat_with_meetings(req.question, db, history, meeting_id=target_meeting_id)
    answer = agent_result["answer"]
    email_draft = agent_result.get("email_draft")

    # 5. Save the assistant's reply
    ai_msg = ChatMessage(session_id=session.id, role="assistant", content=answer)
    db.add(ai_msg)
    db.commit()

    return {
        "answer": answer,
        "email_draft": email_draft,
        "chat_id": session.id,
        "session": {
            "id": session.id,
            "title": session.title,
            "meeting_id": session.meeting_id,
            "created_at": session.created_at
        }
    }

# --- Static File Serving for React Build (meeting-ui/dist) ---
backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent
frontend_dist = root_dir / "meeting-ui" / "dist"

assets_dir = frontend_dist / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

@app.get("/{catchall:path}")
async def serve_react_app(catchall: str):
    # Serve root static files (e.g., favicon.ico, vite.svg) if they exist
    requested_file = frontend_dist / catchall
    if catchall and requested_file.is_file():
        return FileResponse(str(requested_file))

    index_file = frontend_dist / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))

    return {"error": f"Build not found. Python is looking at: {index_file}"}