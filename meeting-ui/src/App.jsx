import { useState, useEffect } from 'react'
import axios from 'axios'
import { Calendar, CheckCircle2, Video, UploadCloud, Loader2 } from 'lucide-react'

function App() {
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // New state for the file upload
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState("")

  const fetchMeetings = () => {
    axios.get('http://127.0.0.1:8000/api/meetings')
      .then(response => {
        setMeetings(response.data.meetings)
        setLoading(false)
      })
      .catch(err => {
        console.error("Error fetching meetings:", err)
        setError("Could not connect to the backend server.")
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchMeetings()
  }, [])

  // Handle the file selection and upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    setIsUploading(true)
    setUploadStatus("Uploading to server...")

    const formData = new FormData()
    formData.append("file", file)

    try {
      await axios.post('http://127.0.0.1:8000/api/upload-video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploadStatus("Upload complete! AI is processing in the background.")
      
      // Clear the status message after 5 seconds
      setTimeout(() => setUploadStatus(""), 5000)
    } catch (err) {
      console.error("Upload error:", err)
      setUploadStatus("Upload failed. Please try again.")
    } finally {
      setIsUploading(false)
      event.target.value = null // Reset the input field
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <header className="flex items-center gap-3 mb-10 pb-6 border-b border-slate-200">
          <div className="p-3 bg-blue-600 rounded-lg shadow-sm">
            <Video className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">MeetingMind AI</h1>
            <p className="text-slate-500">Automated summaries & action items</p>
          </div>
        </header>

        {/* --- NEW: Upload Section --- */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8 text-center">
          <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${isUploading ? 'border-slate-200 bg-slate-50' : 'border-blue-300 bg-blue-50 hover:bg-blue-100'}`}>
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {isUploading ? (
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
              ) : (
                <UploadCloud className="w-8 h-8 text-blue-600 mb-2" />
              )}
              <p className="text-sm text-slate-600 font-medium">
                {isUploading ? "Uploading video..." : "Click to upload a meeting video"}
              </p>
              <p className="text-xs text-slate-400 mt-1">MP4, WebM, or MOV</p>
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept="video/*" 
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
          
          {uploadStatus && (
            <div className={`mt-4 text-sm font-medium ${uploadStatus.includes("failed") ? "text-red-600" : "text-green-600"}`}>
              {uploadStatus}
            </div>
          )}
        </div>
        {/* --------------------------- */}

        {/* State Management */}
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800">Recent Meetings</h2>
            <button onClick={fetchMeetings} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                Refresh Feed
            </button>
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-lg">Fetching processed meetings...</p>
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {/* Meeting Feed */}
        {!loading && !error && (
          <div className="space-y-6">
            {meetings.length === 0 ? (
              <p className="text-slate-500 italic">No meetings processed yet. Upload a video above!</p>
            ) : (
              meetings.map((meeting) => (
                <div key={meeting.id} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 transition-all hover:shadow-md">
                  
                  <div className="flex justify-between items-start mb-6">
                    <h2 className="text-2xl font-semibold text-slate-800">{meeting.title}</h2>
                    <span className="flex items-center gap-2 text-sm text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                      <Calendar className="w-4 h-4" />
                      {new Date(meeting.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="mb-8">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">AI Summary</h3>
                    <p className="text-slate-600 leading-relaxed text-lg">{meeting.summary}</p>
                  </div>

                  {meeting.action_items && meeting.action_items.length > 0 && (
                    <div className="bg-indigo-50/50 p-6 rounded-xl border border-indigo-100/50">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-4">Action Items</h3>
                      <ul className="space-y-3">
                        {meeting.action_items.map((item, index) => (
                          <li key={index} className="flex items-start gap-3 text-indigo-900">
                            <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                            <span className="leading-snug">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App