import os
import smtplib
from email.message import EmailMessage
from moviepy import VideoFileClip

# Import your Celery instance and AI function
from .celery_app import celery_engine
from .ai_engine import analyze_meeting_video

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
        
        # 4. Save to the database
        db = SessionLocal()
        new_meeting = Meeting(
            title="Uploaded Meeting", 
            summary=ai_result.summary,
            action_items=ai_result.action_items,
            transcript=ai_result.transcript # Save it to the database
        )
        db.add(new_meeting)
        db.commit()
        db.close()
        
        print("[AI] Success! Saved in database.")
        
        # 5. Clean up both files ONLY after a complete success
        if os.path.exists(file_path):
            os.remove(file_path)
        if os.path.exists(audio_path):
            os.remove(audio_path)
        
    except Exception as e:
        print(f"[AI] Error during processing: {e}")
        
        # If Gemini is overloaded, retry BUT DO NOT delete the files yet!
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
# NEW: Action Item Notification Email Task
# ---------------------------------------------------------
@celery_engine.task
def send_task_notification_email(recipient_email: str, task_data: dict):
    print(f"[EmailWorker] Preparing to send task assignment to {recipient_email}")
    msg = EmailMessage()
    msg['Subject'] = f"Action Item Assigned: {task_data.get('task', 'New Task')}"
    
    # Securely load credentials from your .env file
    sender_email = os.getenv("SENDER_EMAIL", "your_email@gmail.com")
    app_password = os.getenv("EMAIL_APP_PASSWORD", "YOUR_APP_PASSWORD")
    
    msg['From'] = sender_email
    msg['To'] = recipient_email
    
    body = f"""
    You have a new action item assigned from the recent meeting.
    
    Task: {task_data.get('task', 'N/A')}
    Deadline: {task_data.get('deadline', 'N/A')}
    Priority: {task_data.get('priority', 'N/A')}
    
    Please log into MeetingMind AI to review or update your task status.
    """
    msg.set_content(body)
    
    try:
        # Connect to Gmail SMTP server
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(sender_email, app_password)
            server.send_message(msg)
            
        print(f"[EmailWorker] Successfully sent email to {recipient_email}")
        return "Email sent successfully"
    except Exception as e:
        print(f"[EmailWorker] Failed to send email: {e}")
        return f"Failed to send email: {str(e)}"