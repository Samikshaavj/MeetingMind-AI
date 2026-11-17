from core.ai_engine import analyze_meeting_video

if __name__ == "__main__":
    print("Starting AI Test...")
    try:
        # This will look for the test_meeting.mp4 in your backend folder
        result = analyze_meeting_video("test_meeting.mp4")
        print("\n--- GEMINI RESPONSE ---")
        print(result)
    except Exception as e:
        print(f"Error: {e}")