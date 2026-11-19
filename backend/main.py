import shutil
from pathlib import Path
from typing import Optional, List
from pydantic import BaseModel
from fastapi import FastAPI, Depends, File, UploadFile, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database.connection import get_db, engine
from database.models import Base, Meeting, ChatSession, ChatMessage
from core.tasks import process_video_task, send_task_notification_email
from core.ai_engine import chat_with_meetings

app = FastAPI(title="MeetingMind AI")

# Auto-create any new tables (like chat_sessions and chat_messages) in PostgreSQL
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

    # 4. Fetch meeting context (scoped to session.meeting_id or all meetings)
    target_meeting_id = session.meeting_id if session.meeting_id is not None else req.meeting_id
    if target_meeting_id:
        meetings = db.query(Meeting).filter(Meeting.id == target_meeting_id).all()
    else:
        meetings = db.query(Meeting).order_by(Meeting.created_at.desc()).limit(10).all()

    if not meetings:
        answer = "No meetings found in the database yet. Upload a meeting video first!"
    else:
        meetings_data = [
            {
                "id": m.id,
                "title": m.title or f"Meeting #{m.id}",
                "created_at": str(m.created_at),
                "summary": m.summary or "",
                "action_items": m.action_items or [],
                "transcript": m.transcript or ""
            }
            for m in meetings
        ]
        answer = chat_with_meetings(req.question, meetings_data, history)

    # 5. Save the assistant's reply
    ai_msg = ChatMessage(session_id=session.id, role="assistant", content=answer)
    db.add(ai_msg)
    db.commit()

    return {
        "answer": answer,
        "chat_id": session.id,
        "session": {
            "id": session.id,
            "title": session.title,
            "meeting_id": session.meeting_id,
            "created_at": session.created_at
        }
    }

# --- EXPLICIT DIRECTORY STEPPING (Static File Serving) ---
# 1. Get the exact folder this main.py file is in (.../backend)
backend_dir = Path(__file__).resolve().parent

# 2. Step up one level to the main project folder (.../meetingmind-ai)
root_dir = backend_dir.parent

# 3. Step down into the frontend/dist folder
frontend_dist = root_dir / "frontend" / "dist"

# Mount assets if they exist
assets_dir = frontend_dist / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

@app.get("/{catchall:path}")
async def serve_react_app(catchall: str):
    index_file = frontend_dist / "index.html"
    
    print(f"DEBUG: Looking for React index at -> {index_file}")
    
    if index_file.exists():
        return FileResponse(str(index_file))
        
    return {"error": f"Build not found. Python is looking exactly here: {index_file}"}