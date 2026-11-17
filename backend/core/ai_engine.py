import os
import json
from groq import Groq
from dotenv import load_dotenv

# Load ONLY the Groq key now
load_dotenv()
groq_key = os.getenv("GROQ_API_KEY")

if not groq_key:
    raise ValueError("Missing GROQ_API_KEY in .env file!")

# Initialize the Groq client
groq_client = Groq(api_key=groq_key)

class AIResult:
    def __init__(self, summary, action_items):
        self.summary = summary
        self.action_items = action_items

def analyze_meeting_video(file_path: str):
    print(f"\n[AI] Sending {file_path} to Groq Whisper for transcription...")
    
    # 1. Transcribe the MP3 using Groq Whisper
    with open(file_path, "rb") as audio_file:
        transcription = groq_client.audio.transcriptions.create(
            file=(os.path.basename(file_path), audio_file.read()),
            model="whisper-large-v3",
        )
        
    transcript_text = transcription.text
    print("[AI] Groq transcription complete! Generating summary with Groq Llama-3...")
    
    # 2. Pass the text to Groq's Llama-3 for lightning-fast JSON generation
    prompt = f"""
    Analyze this meeting transcript and output ONLY a valid JSON object with two exact keys:
    1. "summary": A detailed text summary of what was discussed.
    2. "action_items": A list of tasks assigned, who they are assigned to, and deadlines.
    
    TRANSCRIPT:
    {transcript_text}
    """
    
    chat_completion = groq_client.chat.completions.create(
        messages=[
            {"role": "system", "content": "You are an elite executive assistant. You output ONLY valid JSON."},
            {"role": "user", "content": prompt}
        ],
       model="openai/gpt-oss-20b", # Groq's fastest model
        response_format={"type": "json_object"} # Forces perfect JSON output
    )
    
    print("[AI] Groq summary generated! Parsing data...")
    
    # 3. Parse the JSON
    clean_text = chat_completion.choices[0].message.content
    data = json.loads(clean_text)
    
    return AIResult(
        summary=data.get("summary", "No summary generated."),
        action_items=data.get("action_items", [])
    )