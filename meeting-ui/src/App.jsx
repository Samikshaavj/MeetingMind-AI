import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Calendar, Video, UploadCloud, Loader2, AlertTriangle,
  CheckCircle2, Check, Circle, LogOut, BarChart3,
  LayoutDashboard, ListTodo, Download, RefreshCw, ChevronRight, FileText
} from 'lucide-react'
import ChatAssistant from './ChatAssistant'
import AuthPage from './AuthPage'
import AnalyticsDashboard from './components/AnalyticsDashboard'

const API = import.meta.env.DEV ? 'http://127.0.0.1:8000' : ''

function parseTranscriptLines(transcript) {
  if (!transcript) return []
  return transcript
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\[\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\])\s*(.*)$/)
      if (match) {
        return { time: match[1].replace(/[\[\]]/g, ''), text: match[2] }
      }
      return { time: '', text: line }
    })
}

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user')
    return saved ? JSON.parse(saved) : null
  })

  // Sidebar views: 'dashboard' | 'meetings' | 'tasks' | 'analytics'
  const [activeNav, setActiveNav] = useState('meetings')
  const [meetings, setMeetings] = useState([])
  const [selectedMeetingId, setSelectedMeetingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
    setMeetings([])
    setSelectedMeetingId(null)
  }

  const fetchMeetings = () => {
    setLoading(true)
    axios
      .get(`${API}/api/meetings`)
      .then((response) => {
        const list = response.data.meetings || []
        setMeetings(list)
        if (list.length > 0 && !selectedMeetingId) {
          setSelectedMeetingId(list[0].id)
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error fetching meetings:', err)
        setError('Could not connect to the backend server.')
        setLoading(false)
      })
  }

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('token')
      if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      }
      fetchMeetings()
    }
  }, [user])

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    setIsUploading(true)
    setUploadStatus('Uploading to server...')

    const formData = new FormData()
    formData.append('file', file)

    try {
      await axios.post(`${API}/api/upload-video`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setUploadStatus('Upload complete! AI is processing. Auto-refreshing in 12 seconds...')
      setTimeout(() => {
        fetchMeetings()
        setUploadStatus('')
      }, 12000)
    } catch (err) {
      console.error('Upload error:', err)
      setUploadStatus('Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
      event.target.value = null
    }
  }

  const handleTaskChange = (meetingId, taskIndex, field, value) => {
    const updatedMeetings = [...meetings]
    const meetingIndex = updatedMeetings.findIndex((m) => m.id === meetingId)
    updatedMeetings[meetingIndex].action_items[taskIndex][field] = value

    if (updatedMeetings[meetingIndex].action_items[taskIndex].is_ambiguous) {
      updatedMeetings[meetingIndex].action_items[taskIndex].is_ambiguous = false
    }

    setMeetings(updatedMeetings)
  }

  const handleApprove = async (meetingId, taskIndex) => {
    const meeting = meetings.find((m) => m.id === meetingId)
    handleTaskChange(meetingId, taskIndex, 'approved', true)

    try {
      await axios.put(`${API}/api/meetings/${meetingId}/action_items`, meeting.action_items)
    } catch (err) {
      console.error('Failed to approve task:', err)
      alert('Failed to save approval to the server.')
      handleTaskChange(meetingId, taskIndex, 'approved', false)
    }
  }

  const handleToggleCompletion = async (meetingId, taskIndex) => {
    const meeting = meetings.find((m) => m.id === meetingId)
    const currentStatus = meeting.action_items[taskIndex].completed || false
    handleTaskChange(meetingId, taskIndex, 'completed', !currentStatus)

    try {
      await axios.put(`${API}/api/meetings/${meetingId}/action_items`, meeting.action_items)
    } catch (err) {
      console.error('Failed to toggle completion:', err)
      alert('Failed to save task status to the server.')
      handleTaskChange(meetingId, taskIndex, 'completed', currentStatus)
    }
  }

  const handleDownloadMeeting = (meeting) => {
    if (!meeting) return
    const itemsText = (meeting.action_items || [])
      .map(
        (t, i) =>
          `${i + 1}. [${t.completed ? 'Done' : 'Pending'}] ${t.task || t.description} (Owner: ${t.owner || 'Unassigned'}, Due: ${t.deadline || 'None'})`
      )
      .join('\n')

    const content = [
      `MEETING: ${meeting.title || `Meeting #${meeting.id}`}`,
      `DATE: ${new Date(meeting.created_at).toLocaleString()}`,
      '',
      '--- AI SUMMARY ---',
      meeting.summary || 'No summary.',
      '',
      '--- ACTION ITEMS ---',
      itemsText || 'None.',
      '',
      '--- TRANSCRIPT ---',
      meeting.transcript || 'No transcript.',
    ].join('\n')

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meeting-${meeting.id}-notes.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!user) {
    return (
      <AuthPage
        onAuthSuccess={(loggedInUser, token) => {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
          setUser(loggedInUser)
        }}
      />
    )
  }

  const activeMeeting =
    meetings.find((m) => m.id === selectedMeetingId) || meetings[0] || null

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'meetings', label: 'Meetings', icon: Video },
    { id: 'tasks', label: 'Action Items', icon: ListTodo },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ]

  return (
    <div className="min-h-screen bg-slate-100 flex font-sans text-slate-900">
      {/* LEFT DARK SIDEBAR */}
      <aside className="w-64 bg-[#141926] text-slate-300 flex flex-col shrink-0 min-h-screen sticky top-0 h-screen">
        {/* User Profile Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shrink-0">
            {(user.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user.name}</p>
            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1.5 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeNav === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Bottom Brand + Logout */}
        <div className="p-4 border-t border-slate-800/80 space-y-3">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-slate-800/70 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
          <div className="flex items-center gap-2 px-3 pt-1">
            <Video className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-bold tracking-wider uppercase text-slate-400">
              MeetingMind AI
            </span>
          </div>
        </div>
      </aside>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 min-w-0 p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {/* ---------------- DASHBOARD VIEW (Upload + All Meetings Grid) ---------------- */}
          {activeNav === 'dashboard' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
                  <p className="text-sm text-slate-500">Upload a recording or open a processed meeting</p>
                </div>
                <button
                  onClick={fetchMeetings}
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3.5 py-2 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>

              {/* Upload Dropzone */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center">
                <label
                  className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                    isUploading
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-blue-300 bg-blue-50/60 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center">
                    {isUploading ? (
                      <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                    ) : (
                      <UploadCloud className="w-8 h-8 text-blue-600 mb-2" />
                    )}
                    <p className="text-sm text-slate-700 font-semibold">
                      {isUploading ? 'Uploading video...' : 'Click to upload a meeting video'}
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
                  <p
                    className={`mt-3 text-xs font-medium ${
                      uploadStatus.includes('failed') ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    {uploadStatus}
                  </p>
                )}
              </div>

              {/* Meetings List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {meetings.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => {
                      setSelectedMeetingId(m.id)
                      setActiveNav('meetings')
                    }}
                    className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h3 className="font-bold text-slate-900 truncate">
                          {m.title || `Meeting #${m.id}`}
                        </h3>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {new Date(m.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                        {m.summary}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        {(m.action_items || []).length} action item(s)
                      </span>
                      <span className="text-blue-600 font-semibold flex items-center gap-1">
                        Open Details <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---------------- MEETINGS SPLIT-PANE VIEW (Reference UI Layout) ---------------- */}
          {activeNav === 'meetings' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Top Breadcrumb & Action Bar */}
              <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <button
                    onClick={() => setActiveNav('dashboard')}
                    className="hover:text-blue-600 font-medium"
                  >
                    Meetings
                  </button>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="font-semibold text-slate-800">
                    {activeMeeting
                      ? `${activeMeeting.title || `Meeting #${activeMeeting.id}`}`
                      : 'No Meetings Yet'}
                  </span>
                  {activeMeeting && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <Calendar className="w-3 h-3" />
                      {new Date(activeMeeting.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {meetings.length > 0 && (
                    <select
                      value={activeMeeting?.id || ''}
                      onChange={(e) => setSelectedMeetingId(Number(e.target.value))}
                      className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:border-blue-500"
                    >
                      {meetings.map((m) => (
                        <option key={m.id} value={m.id}>
                          #{m.id} — {m.title || 'Uploaded Meeting'} ({new Date(m.created_at).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  )}

                  {activeMeeting && (
                    <button
                      onClick={() => handleDownloadMeeting(activeMeeting)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  )}

                  <button
                    onClick={() => setActiveNav('dashboard')}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 rounded-lg transition-colors"
                  >
                    <UploadCloud className="w-3.5 h-3.5" /> Upload
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="p-12 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  Loading meetings...
                </div>
              ) : error ? (
                <div className="p-8 text-center text-red-600 text-sm">{error}</div>
              ) : !activeMeeting ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  No meetings processed yet. Click <strong>Upload</strong> to add your first meeting video.
                </div>
              ) : (
                /* 2-COLUMN SPLIT PANE */
                <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                  {/* LEFT COLUMN: Summary + Action Items / Notes */}
                  <div className="lg:col-span-6 p-6 space-y-6">
                    <div>
                      <h1 className="text-xl font-bold text-slate-900">
                        {activeMeeting.title || `Meeting #${activeMeeting.id}`}
                      </h1>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Meeting #{activeMeeting.id} · Processed by MeetingMind AI
                      </p>
                    </div>

                    {/* AI Summary Box */}
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200/70">
                      <div className="flex items-center gap-2 mb-2.5">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          AI Summary
                        </h3>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {activeMeeting.summary}
                      </p>
                    </div>

                    {/* Action Items Section */}
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 mb-3">Action Items</h3>

                      {(!activeMeeting.action_items || activeMeeting.action_items.length === 0) && (
                        <p className="text-xs text-slate-400 italic">No action items extracted.</p>
                      )}

                      {/* Pending Approvals */}
                      {activeMeeting.action_items?.some((t) => !t.approved) && (
                        <div className="space-y-3 mb-5">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
                            Pending Approval
                          </p>
                          {activeMeeting.action_items.map((task, index) => {
                            if (task.approved) return null
                            return (
                              <div
                                key={index}
                                className={`p-4 rounded-xl border text-xs ${
                                  task.is_ambiguous
                                    ? 'bg-amber-50/70 border-amber-200'
                                    : 'bg-slate-50 border-slate-200'
                                }`}
                              >
                                {task.is_ambiguous && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded mb-2">
                                    <AlertTriangle className="w-3 h-3" /> Ambiguous context
                                  </span>
                                )}
                                <input
                                  type="text"
                                  value={task.task || task.description || ''}
                                  onChange={(e) =>
                                    handleTaskChange(activeMeeting.id, index, 'task', e.target.value)
                                  }
                                  className="w-full bg-transparent font-semibold text-slate-800 text-sm mb-2 focus:outline-none border-b border-transparent focus:border-blue-500"
                                />
                                <div className="flex items-center gap-3">
                                  <input
                                    type="text"
                                    value={task.owner || task.assigned_to || ''}
                                    onChange={(e) =>
                                      handleTaskChange(activeMeeting.id, index, 'owner', e.target.value)
                                    }
                                    placeholder="Owner"
                                    className="flex-1 bg-white px-2 py-1 rounded border border-slate-200 text-xs"
                                  />
                                  <input
                                    type="text"
                                    value={task.deadline || task.due_date || ''}
                                    onChange={(e) =>
                                      handleTaskChange(activeMeeting.id, index, 'deadline', e.target.value)
                                    }
                                    placeholder="Deadline"
                                    className="flex-1 bg-white px-2 py-1 rounded border border-slate-200 text-xs"
                                  />
                                  <button
                                    onClick={() => handleApprove(activeMeeting.id, index)}
                                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-semibold shrink-0"
                                  >
                                    <Check className="w-3.5 h-3.5" /> Approve
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Approved Tasks To Do */}
                      {activeMeeting.action_items?.some((t) => t.approved) && (
                        <div className="space-y-2.5">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                            Approved Tasks
                          </p>
                          {activeMeeting.action_items.map((task, index) => {
                            if (!task.approved) return null
                            const isCompleted = task.completed || false
                            return (
                              <div
                                key={index}
                                className={`flex items-center justify-between p-3.5 rounded-xl border ${
                                  isCompleted
                                    ? 'bg-slate-50 border-slate-200'
                                    : 'bg-white border-emerald-200'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => handleToggleCompletion(activeMeeting.id, index)}
                                    className="shrink-0"
                                  >
                                    {isCompleted ? (
                                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                      <Circle className="w-5 h-5 text-slate-300 hover:text-blue-500" />
                                    )}
                                  </button>
                                  <div>
                                    <p
                                      className={`text-sm font-medium ${
                                        isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'
                                      }`}
                                    >
                                      {task.task || task.description}
                                    </p>
                                    <p className="text-[11px] text-slate-400">
                                      {task.owner || 'Unassigned'} · Due: {task.deadline || 'None'}
                                    </p>
                                  </div>
                                </div>
                                <span
                                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                                    isCompleted
                                      ? 'bg-slate-200 text-slate-500'
                                      : 'bg-emerald-100 text-emerald-700'
                                  }`}
                                >
                                  {isCompleted ? 'Done' : 'To Do'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Timestamped Transcript */}
                  <div className="lg:col-span-6 p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-slate-900">Transcript</h3>
                      <span className="text-[11px] text-slate-400">
                        Timestamped via Groq Whisper
                      </span>
                    </div>

                    <div className="space-y-4 max-h-[68vh] overflow-y-auto pr-2">
                      {parseTranscriptLines(activeMeeting.transcript).length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No transcript available.</p>
                      ) : (
                        parseTranscriptLines(activeMeeting.transcript).map((seg, i) => (
                          <div key={i} className="flex gap-4 text-xs leading-relaxed group">
                            <div className="w-24 shrink-0 pt-0.5">
                              <span className="font-mono text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                {seg.time || '00:00'}
                              </span>
                            </div>
                            <p className="text-slate-700 flex-1">{seg.text}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---------------- ACTION ITEMS VIEW (All Meetings) ---------------- */}
          {activeNav === 'tasks' && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Action Items</h1>
                <p className="text-sm text-slate-500">Review, approve, and complete tasks across all meetings</p>
              </div>

              {meetings.map((meeting) => {
                if (!meeting.action_items || meeting.action_items.length === 0) return null
                return (
                  <div key={meeting.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="font-bold text-slate-800">
                        #{meeting.id} — {meeting.title || 'Uploaded Meeting'}
                      </h3>
                      <span className="text-xs text-slate-400">
                        {new Date(meeting.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {meeting.action_items.map((task, idx) => {
                      const isCompleted = task.completed || false
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100"
                        >
                          <div className="flex items-center gap-3">
                            {task.approved ? (
                              <button onClick={() => handleToggleCompletion(meeting.id, idx)}>
                                {isCompleted ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                ) : (
                                  <Circle className="w-5 h-5 text-slate-300 hover:text-blue-500" />
                                )}
                              </button>
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            )}
                            <div>
                              <p className={`text-sm font-medium ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                {task.task || task.description}
                              </p>
                              <p className="text-xs text-slate-500">
                                {task.owner || 'Unassigned'} · Due: {task.deadline || 'None'} · Priority: {task.priority || 'Medium'}
                              </p>
                            </div>
                          </div>
                          {!task.approved ? (
                            <button
                              onClick={() => handleApprove(meeting.id, idx)}
                              className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg"
                            >
                              Approve
                            </button>
                          ) : (
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${isCompleted ? 'bg-slate-200 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>
                              {isCompleted ? 'Done' : 'To Do'}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* ---------------- ANALYTICS VIEW ---------------- */}
          {activeNav === 'analytics' && <AnalyticsDashboard />}
        </div>
      </main>

      {/* Floating Agentic Assistant */}
      <ChatAssistant meetings={meetings} />
    </div>
  )
}

export default App