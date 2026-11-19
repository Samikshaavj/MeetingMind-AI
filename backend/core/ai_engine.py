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
    def __init__(self, summary, action_items, transcript):
        self.summary = summary
        self.action_items = action_items
        self.transcript = transcript

def analyze_meeting_video(file_path: str):
    print(f"\n[AI] Sending {file_path} to Groq Whisper for transcription...")
    
    # 1. Transcribe the MP3 using Groq Whisper with verbose_json for timestamps
    with open(file_path, "rb") as audio_file:
        transcription = groq_client.audio.transcriptions.create(
            file=(os.path.basename(file_path), audio_file.read()),
            model="whisper-large-v3",
            response_format="verbose_json"
        )
        
    transcript_text = transcription.text
    
    # 2. Build the timestamped transcript string from the audio segments
    timestamped_transcript = ""
    for segment in transcription.segments:
        start_sec = int(segment.start if hasattr(segment, 'start') else segment['start'])
        end_sec = int(segment.end if hasattr(segment, 'end') else segment['end'])
        
        start_m, start_s = divmod(start_sec, 60)
        end_m, end_s = divmod(end_sec, 60)
        
        time_block = f"[{start_m:02d}:{start_s:02d} - {end_m:02d}:{end_s:02d}]"
        text_block = segment.text.strip() if hasattr(segment, 'text') else segment['text'].strip()
        
        timestamped_transcript += f"{time_block} {text_block}\n"
        
    print("[AI] Groq transcription complete! Generating summary...")
    
    # 3. Pass the text for Action Item Agent JSON generation
    prompt = f"""
    Analyze this meeting transcript and output ONLY a valid JSON object with two exact keys:
    1. "summary": A detailed text summary of what was discussed.
    2. "action_items": An array of task objects based on commitments in the transcript.
    
    For each task in "action_items", you must use these exact keys:
    - "task": The core action to be taken.
    - "owner": The name of the person assigned (or "Unassigned").
    - "deadline": The specific date/time mentioned (or "None").
    - "priority": "High", "Medium", or "Low" based on the urgency context.
    - "is_ambiguous": true or false (true if the deadline or owner is unclear).
    - "approved": false (default value for all tasks).

    TRANSCRIPT:
    {transcript_text}
    """
    
    chat_completion = groq_client.chat.completions.create(
        messages=[
            {"role": "system", "content": "You are an elite executive assistant. You output ONLY valid JSON."},
            {"role": "user", "content": prompt}
        ],
        model="openai/gpt-oss-20b", 
        response_format={"type": "json_object"} 
    )
    
    print("[AI] Groq summary generated! Parsing data...")
    
    # 4. Parse and normalize the JSON so keys always match the React UI
    clean_text = chat_completion.choices[0].message.content
    data = json.loads(clean_text)

    normalized_items = []
    for item in data.get("action_items", []):
        if isinstance(item, dict):
            owner = item.get("owner") or item.get("assigned_to") or item.get("assignee") or "Unassigned"
            deadline = item.get("deadline") or item.get("due_date") or "None"
            normalized_items.append({
                "task": item.get("task") or item.get("description") or "",
                "owner": owner,
                "deadline": deadline,
                "priority": item.get("priority", "Medium"),
                "is_ambiguous": item.get("is_ambiguous", owner == "Unassigned" or deadline == "None"),
                "approved": False,
                "completed": False
            })
    
    return AIResult(
        summary=data.get("summary", "No summary generated."),
        action_items=normalized_items,
        transcript=timestamped_transcript
    )
def chat_with_meetings(question: str, meetings_data: list, history: list):
    # Build structured context from the selected meeting(s)
    context_blocks = []
    for m in meetings_data:
        block = (
            f"=== MEETING #{m['id']}: {m['title']} (Date: {m['created_at']}) ===\n"
            f"SUMMARY:\n{m['summary']}\n\n"
            f"ACTION ITEMS:\n{json.dumps(m['action_items'])}\n\n"
            f"TIMESTAMPED TRANSCRIPT:\n{m['transcript'] or 'No transcript available.'}\n"
        )
        context_blocks.append(block)

    full_context = "\n\n".join(context_blocks)

    system_prompt = f"""
    You are MeetingMind AI, a Conversational Meeting Assistant.
    Answer the user's question using ONLY the meeting data provided below.

    RULES:
    1. Always cite exact transcript timestamps (e.g., [00:12 - 00:18]) and the Meeting #/Title when referencing what was said.
    2. If the user asks to compare decisions or tasks across meetings, clearly compare them side-by-side by Meeting # and date.
    3. Use the conversation history to understand follow-up questions (like "what about her deadline?" or "compare that with the first one").
    4. If the answer is not in the provided meetings, say so clearly—do not hallucinate.

    MEETING DATA:
    {full_context}
    """

    messages = [{"role": "system", "content": system_prompt}]

    # Append recent chat history for follow-up context (last 10 messages)
    for msg in history[-10:]:
        if msg.get("role") in ("user", "assistant") and msg.get("content"):
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": question})

    chat_completion = groq_client.chat.completions.create(
        messages=messages,
        model="openai/gpt-oss-20b"
    )

    return chat_completion.choices[0].message.content