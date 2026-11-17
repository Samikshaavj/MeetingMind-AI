import os
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
            action_items=ai_result.action_items
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