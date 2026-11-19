import { useEffect, useState } from 'react'
import axios from 'axios'
import {
  Video, Clock, CheckCircle2, ListTodo, Lightbulb,
  TrendingUp, RefreshCw, AlertCircle, Users
} from 'lucide-react'

const API = import.meta.env.DEV ? 'http://127.0.0.1:8000' : ''

export default function AnalyticsDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchAnalytics = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await axios.get(`${API}/api/analytics`)
      setData(res.data)
    } catch (err) {
      console.error("Analytics fetch error:", err)
      setError("Failed to load analytics data.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 text-sm">
        Loading Meeting Analytics...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm flex items-center justify-between">
        <span>{error || "No analytics available."}</span>
        <button onClick={fetchAnalytics} className="underline font-semibold">Retry</button>
      </div>
    )
  }

  const { summary, owner_workload, recent_decisions, meeting_insights } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Meeting Analytics Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time overview of meetings, task execution, and productivity insights
          </p>
        </div>
        <button
          onClick={fetchAnalytics}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Meetings</span>
            <Video className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.total_meetings}</p>
          <p className="text-[11px] text-slate-400 mt-1">Processed & indexed</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Hours</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.total_hours}h</p>
          <p className="text-[11px] text-slate-400 mt-1">{summary.total_minutes} minutes transcribed</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Tasks (Done / Pending)</span>
            <ListTodo className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">
            <span className="text-emerald-600">{summary.completed_tasks}</span>
            <span className="text-slate-300 mx-1">/</span>
            <span className="text-amber-600">{summary.pending_tasks}</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {summary.completion_rate}% completed · {summary.high_priority_pending} high-priority pending
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Decisions Made</span>
            <Lightbulb className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.total_decisions}</p>
          <p className="text-[11px] text-slate-400 mt-1">Extracted across summaries</p>
        </div>
      </div>

      {/* Middle Row: Owner Workload + Key Decisions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Owner Workload */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-sm text-slate-900">Task Distribution by Owner</h3>
          </div>
          {owner_workload.length === 0 ? (
            <p className="text-xs text-slate-400">No action items recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {owner_workload.map((o) => {
                const pct = o.total > 0 ? Math.round((o.completed / o.total) * 100) : 0
                return (
                  <div key={o.owner} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">{o.owner}</span>
                      <span className="text-slate-500">
                        {o.completed} done · {o.pending} pending ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Decisions Made */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-sm text-slate-900">Key Decisions Made</h3>
          </div>
          {recent_decisions.length === 0 ? (
            <p className="text-xs text-slate-400">No explicit decisions detected yet.</p>
          ) : (
            <ul className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {recent_decisions.map((d, idx) => (
                <li key={idx} className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <p className="text-slate-700 leading-relaxed">{d.decision}</p>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">
                    Meeting #{d.meeting_id} · {new Date(d.date).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Meeting-wise Productivity Insights Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-900">Meeting-wise Productivity Insights</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="px-5 py-3">Meeting</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Tasks</th>
                <th className="px-4 py-3">Decisions</th>
                <th className="px-4 py-3">Productivity</th>
                <th className="px-5 py-3">Insight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {meeting_insights.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-semibold text-slate-800">
                    #{m.id} — {m.title}
                    <div className="text-[10px] font-normal text-slate-400">
                      {new Date(m.date).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{m.duration_minutes} min</td>
                  <td className="px-4 py-3.5">
                    <span className="text-emerald-600 font-semibold">{m.completed_tasks}</span>
                    <span className="text-slate-400"> / {m.total_tasks}</span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{m.decisions_count}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            m.productivity_score >= 70
                              ? 'bg-emerald-500'
                              : m.productivity_score >= 40
                              ? 'bg-amber-500'
                              : 'bg-red-400'
                          }`}
                          style={{ width: `${m.productivity_score}%` }}
                        />
                      </div>
                      <span className="font-semibold text-slate-700">{m.productivity_score}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700">
                      {m.completion_rate >= 75 ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                      )}
                      {m.insight}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}