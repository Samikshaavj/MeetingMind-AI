import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv
from moviepy import VideoFileClip

# Import your Celery instance, AI function, and RAG indexer
from .celery_app import celery_engine
from .ai_engine import analyze_meeting_video
from .rag import index_meeting_chunks

# Import database dependencies
from database.connection import SessionLocal
from database.models import Meeting

@celery_engine.task(bind=True, max_retries=5)
def process_video_task(self, file_path: str):
    print(f"[AI] Starting processing for: {file_path}")
    
    # 1. Create a temporary filename for the extracted audio
    audio_path = file_path.rsplit(".", 1)[0] + ".mp3"
    
    try:
        # 2. Extract the audio track
        print("[AI] Extracting audio from video...")
        video = VideoFileClip(file_path)
        video.audio.write_audiofile(audio_path, logger=None)
        video.close()
        print("[AI] Audio extracted! Uploading to AI Engine...")

        # 3. Pass the MP3 to our Groq/Gemini pipeline
        ai_result = analyze_meeting_video(audio_path) 
        
        # 4. Save to the database and index chunks into pgvector
        db = SessionLocal()
        try:
            new_meeting = Meeting(
                title="Uploaded Meeting", 
                summary=ai_result.summary,
                action_items=ai_result.action_items,
                transcript=ai_result.transcript
            )
            db.add(new_meeting)
            db.commit()
            db.refresh(new_meeting)

            # Generate embeddings and store chunks for Vector RAG
            print(f"[RAG] Indexing chunks for Meeting #{new_meeting.id}...")
            index_meeting_chunks(db, new_meeting)
            print("[AI] Success! Saved and indexed in database.")
        finally:
            db.close()
        
        # 5. Clean up both files ONLY after a complete success
        if os.path.exists(file_path):
            os.remove(file_path)
        if os.path.exists(audio_path):
            os.remove(audio_path)
        
    except Exception as e:
        print(f"[AI] Error during processing: {e}")
        
        # If API is overloaded, retry BUT DO NOT delete the files yet!
        if "503" in str(e) or "429" in str(e):
            print("[AI] API is overloaded! Retrying in 50 seconds...")
            raise self.retry(exc=e, countdown=50)
            
        # If it's a permanent error, clean up the files so they don't pile up
        else:
            if os.path.exists(file_path):
                os.remove(file_path)
            if os.path.exists(audio_path):
                os.remove(audio_path)

# ---------------------------------------------------------
# Action Item & HITL Follow-up Email Task
# ---------------------------------------------------------
@celery_engine.task
def send_task_notification_email(recipient_email: str, task_data: dict):
    load_dotenv()
    print(f"[EmailWorker] Preparing to send email to {recipient_email}")

    sender_email = os.getenv("SENDER_EMAIL")
    app_password = os.getenv("EMAIL_APP_PASSWORD")

    if not sender_email or not app_password:
        print("[EmailWorker] Missing SENDER_EMAIL or EMAIL_APP_PASSWORD in .env")
        return "Missing email credentials"

    msg = EmailMessage()
    msg['From'] = sender_email
    msg['To'] = recipient_email

    if task_data.get("is_followup"):
        # Human-in-the-Loop approved follow-up email
        msg['Subject'] = task_data.get('task', 'Meeting Follow-up')
        body = task_data.get('description', '')
    else:
        # Standard action item assignment notification
        msg['Subject'] = f"Action Item Assigned: {task_data.get('task', 'New Task')}"
        body = f"""
You have a new action item assigned from the recent meeting.

Task: {task_data.get('task', 'N/A')}
Deadline: {task_data.get('deadline', 'N/A')}
Priority: {task_data.get('priority', 'N/A')}

Please log into MeetingMind AI to review or update your task status.
"""
    msg.set_content(body)
    
    try:
        with smtplib.SMTP('smtp.gmail.com', 587, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(sender_email, app_password)
            server.send_message(msg)
            
        print(f"[EmailWorker] Successfully sent email to {recipient_email}")
        return "Email sent successfully"
    except Exception as e:
        print(f"[EmailWorker] Failed to send email: {e}")
        return f"Failed to send email: {str(e)}"