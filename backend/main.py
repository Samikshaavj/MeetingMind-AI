import shutil
from fastapi import FastAPI, Depends, File, UploadFile
from sqlalchemy.orm import Session
from database.connection import get_db
from database.models import Meeting
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from core.tasks import process_video_task



app = FastAPI(title="MeetingMind AI")

# --- NEW: CORS Configuration ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows your React app to fetch data
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "MeetingMind AI Engine is active!"}


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
# --- NEW CELERY TEST ROUTE GOES HERE ---
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
# --- EXPLICIT DIRECTORY STEPPING ---
# 1. Get the exact folder this main.py file is in (.../backend)
backend_dir = Path(__file__).resolve().parent
# --- EXPLICIT DIRECTORY STEPPING ---
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