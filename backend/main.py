import shutil
from pathlib import Path
from fastapi import FastAPI, Depends, File, UploadFile, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database.connection import get_db
from database.models import Meeting
from core.tasks import process_video_task, send_task_notification_email

app = FastAPI(title="MeetingMind AI")

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

# --- NEW: Action Item Agent Endpoints ---

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