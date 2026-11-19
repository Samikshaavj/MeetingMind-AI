import { useState, useEffect } from 'react'
import axios from 'axios'
import { Calendar, Video, UploadCloud, Loader2, AlertTriangle, CheckCircle2, Check, Circle } from 'lucide-react'

function App() {
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState("")

  const fetchMeetings = () => {
    setLoading(true)
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
      
      setUploadStatus("Upload complete! AI is processing. Auto-refreshing in 12 seconds...")
      
      // Automatically refresh the meeting feed after Celery finishes processing
      setTimeout(() => {
        fetchMeetings()
        setUploadStatus("")
      }, 12000)
      
    } catch (err) {
      console.error("Upload error:", err)
      setUploadStatus("Upload failed. Please try again.")
    } finally {
      setIsUploading(false)
      event.target.value = null
    }
  }

  const handleTaskChange = (meetingId, taskIndex, field, value) => {
    const updatedMeetings = [...meetings];
    const meetingIndex = updatedMeetings.findIndex(m => m.id === meetingId);
    updatedMeetings[meetingIndex].action_items[taskIndex][field] = value;
    
    // Remove ambiguity flag if manually edited
    if (updatedMeetings[meetingIndex].action_items[taskIndex].is_ambiguous) {
      updatedMeetings[meetingIndex].action_items[taskIndex].is_ambiguous = false;
    }
    
    setMeetings(updatedMeetings);
  }

  const handleApprove = async (meetingId, taskIndex) => {
    const meeting = meetings.find(m => m.id === meetingId);
    
    // 1. Visually update state to move it to "Tasks To Do" immediately
    handleTaskChange(meetingId, taskIndex, 'approved', true);
    
    try {
      // 2. Save the updated array to PostgreSQL
      await axios.put(`http://127.0.0.1:8000/api/meetings/${meetingId}/action_items`, meeting.action_items);
    } catch (err) {
      console.error("Failed to approve task:", err);
      alert("Failed to save approval to the server.");
      // Revert if failed
      handleTaskChange(meetingId, taskIndex, 'approved', false);
    }
  }

  // --- Toggle Task Completion Status ---
  const handleToggleCompletion = async (meetingId, taskIndex) => {
    const meeting = meetings.find(m => m.id === meetingId);
    const currentStatus = meeting.action_items[taskIndex].completed || false;
    
    // 1. Optimistic UI update
    handleTaskChange(meetingId, taskIndex, 'completed', !currentStatus);
    
    try {
      // 2. Save toggle state to PostgreSQL
      await axios.put(`http://127.0.0.1:8000/api/meetings/${meetingId}/action_items`, meeting.action_items);
    } catch (err) {
      console.error("Failed to toggle completion:", err);
      alert("Failed to save task status to the server.");
      // Revert if failed
      handleTaskChange(meetingId, taskIndex, 'completed', currentStatus);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        
        <header className="flex items-center gap-3 mb-10 pb-6 border-b border-slate-200">
          <div className="p-3 bg-blue-600 rounded-lg shadow-sm">
            <Video className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">MeetingMind AI</h1>
            <p className="text-slate-500">Automated summaries & action items</p>
          </div>
        </header>

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

        {!loading && !error && (
          <div className="space-y-6">
            {meetings.length === 0 ? (
              <p className="text-slate-500 italic">No meetings processed yet. Upload a video above!</p>
            ) : (
              meetings.map((meeting) => (
                <div key={meeting.id} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 transition-all hover:shadow-md">
                  
                  <div className="flex justify-between items-start mb-6">
                    <h2 className="text-2xl font-semibold text-slate-800">{meeting.title || `Meeting #${meeting.id}`}</h2>
                    <span className="flex items-center gap-2 text-sm text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                      <Calendar className="w-4 h-4" />
                      {new Date(meeting.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="mb-8">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">AI Summary</h3>
                    <p className="text-slate-600 leading-relaxed text-lg">{meeting.summary}</p>
                  </div>

                  {meeting.action_items && Array.isArray(meeting.action_items) && meeting.action_items.length > 0 && (
                    <div className="mb-8">
                      
                      {/* SECTION 1: Pending Approvals */}
                      {meeting.action_items.some(t => !t.approved) && (
                        <div className="mb-6">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-4">Pending Action Items</h3>
                          <div className="space-y-4">
                            {meeting.action_items.map((task, index) => {
                              if (task.approved) return null; // Hide approved tasks from this section
                              return (
                                <div key={index} className={`p-5 rounded-xl border ${task.is_ambiguous ? 'bg-yellow-50 border-yellow-300' : 'bg-slate-50 border-slate-200'}`}>
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 space-y-3">
                                      {task.is_ambiguous && (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-yellow-700 bg-yellow-200/50 px-2 py-1 rounded-md mb-1">
                                          <AlertTriangle className="w-3 h-3" />
                                          Ambiguous context detected
                                        </span>
                                      )}
                                      
                                      <div>
                                        <label className="text-xs text-slate-500 font-semibold uppercase mb-1 block">Task</label>
                                        <input 
                                          type="text" 
                                          value={task.task || task.description || ""} 
                                          onChange={(e) => handleTaskChange(meeting.id, index, 'task', e.target.value)}
                                          className="w-full bg-transparent font-medium text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none transition-colors"
                                        />
                                      </div>
                                      
                                      <div className="flex gap-4">
                                        <div className="flex-1">
                                          <label className="text-xs text-slate-500 font-semibold uppercase mb-1 block">Assigned To</label>
                                          <input 
                                            type="text" 
                                            value={task.owner || task.assigned_to || task.assignee || ""} 
                                            onChange={(e) => handleTaskChange(meeting.id, index, 'owner', e.target.value)}
                                            className="w-full bg-transparent text-sm text-slate-700 border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none transition-colors"
                                          />
                                        </div>
                                        <div className="flex-1">
                                          <label className="text-xs text-slate-500 font-semibold uppercase mb-1 block">Deadline</label>
                                          <input 
                                            type="text" 
                                            value={task.deadline || task.due_date || ""} 
                                            onChange={(e) => handleTaskChange(meeting.id, index, 'deadline', e.target.value)}
                                            className="w-full bg-transparent text-sm text-slate-700 border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none transition-colors"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    <div className="shrink-0 pt-2">
                                      <button 
                                        onClick={() => handleApprove(meeting.id, index)}
                                        className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 hover:text-green-600 hover:border-green-600 hover:bg-green-50 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm"
                                      >
                                        <Check className="w-4 h-4" /> Approve
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* SECTION 2: Tasks To Do (Approved & Toggleable) */}
                      {meeting.action_items.some(t => t.approved) && (
                        <div className="mt-8 pt-6 border-t border-slate-200">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-green-600 mb-4">Tasks To Do</h3>
                          <div className="space-y-3">
                            {meeting.action_items.map((task, index) => {
                              if (!task.approved) return null; // Hide pending tasks from this section
                              
                              const isCompleted = task.completed || false;
                              
                              return (
                                <div key={index} className={`flex items-center justify-between p-4 border rounded-xl shadow-sm transition-all ${isCompleted ? 'bg-slate-50 border-slate-200' : 'bg-white border-green-200'}`}>
                                  <div className="flex items-center gap-4">
                                    {/* Clickable Status Icon */}
                                    <button 
                                      onClick={() => handleToggleCompletion(meeting.id, index)}
                                      className="focus:outline-none shrink-0 transition-transform hover:scale-110"
                                      title={isCompleted ? "Mark as To Do" : "Mark as Done"}
                                    >
                                      {isCompleted ? (
                                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                                      ) : (
                                        <Circle className="w-6 h-6 text-slate-300 hover:text-blue-500" />
                                      )}
                                    </button>
                                    
                                    <div>
                                      <p className={`font-semibold transition-all ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                        {task.task || task.description}
                                      </p>
                                      <p className={`text-xs mt-1 transition-all ${isCompleted ? 'text-slate-400' : 'text-slate-500'}`}>
                                        Assigned to: <span className="font-bold">{task.owner || task.assigned_to || task.assignee || "Unassigned"}</span> • Due: {task.deadline || task.due_date || "None"}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide transition-all ${isCompleted ? 'text-slate-500 bg-slate-200' : 'text-green-700 bg-green-100'}`}>
                                    {isCompleted ? 'Done' : 'To Do'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                  {meeting.transcript && (
                    <div className="mt-6 border-t pt-4">
                      <h3 className="font-semibold text-lg text-gray-800 mb-2">Timestamped Transcript</h3>
                      <div className="bg-gray-50 rounded-md p-4 max-h-64 overflow-y-auto">
                        <p className="whitespace-pre-wrap text-sm text-gray-600 font-mono">
                          {meeting.transcript}
                        </p>
                      </div>
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