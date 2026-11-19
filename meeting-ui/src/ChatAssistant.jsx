import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { MessageSquare, X, Send, Loader2, Sparkles, Plus, Trash2, Pencil, Check } from 'lucide-react'

const API = 'http://127.0.0.1:8000'

export default function ChatAssistant({ meetings }) {
  const [isOpen, setIsOpen] = useState(false)
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [selectedMeetingId, setSelectedMeetingId] = useState("all")
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)

  // Inline rename state
  const [editingChatId, setEditingChatId] = useState(null)
  const [editingTitle, setEditingTitle] = useState("")

  const bottomRef = useRef(null)

  const fetchChats = async () => {
    try {
      const res = await axios.get(`${API}/api/chats`)
      setChats(res.data.chats)
    } catch (err) {
      console.error("Failed to load chats:", err)
    }
  }

  useEffect(() => {
    if (isOpen) fetchChats()
  }, [isOpen])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isOpen])

  const openChat = async (chat) => {
    setActiveChatId(chat.id)
    setSelectedMeetingId(chat.meeting_id ? String(chat.meeting_id) : "all")
    try {
      const res = await axios.get(`${API}/api/chats/${chat.id}/messages`)
      setMessages(res.data.messages)
    } catch (err) {
      console.error("Failed to load messages:", err)
    }
  }

  const startNewChat = () => {
    setActiveChatId(null)
    setMessages([])
  }

  const handleRename = async (chatId) => {
    if (!editingTitle.trim()) {
      setEditingChatId(null)
      return
    }
    try {
      await axios.put(`${API}/api/chats/${chatId}`, { title: editingTitle })
      setChats(chats.map(c => c.id === chatId ? { ...c, title: editingTitle } : c))
    } catch (err) {
      console.error("Rename failed:", err)
    } finally {
      setEditingChatId(null)
    }
  }

  const handleDelete = async (e, chatId) => {
    e.stopPropagation()
    try {
      await axios.delete(`${API}/api/chats/${chatId}`)
      setChats(chats.filter(c => c.id !== chatId))
      if (activeChatId === chatId) {
        setActiveChatId(null)
        setMessages([])
      }
    } catch (err) {
      console.error("Delete failed:", err)
    }
  }

  const sendMessage = async (customText) => {
    const question = (customText || input).trim()
    if (!question || isSending) return

    const updatedMsgs = [...messages, { role: "user", content: question }]
    setMessages(updatedMsgs)
    setInput("")
    setIsSending(true)

    try {
      const res = await axios.post(`${API}/api/chat`, {
        question,
        chat_id: activeChatId,
        meeting_id: selectedMeetingId === "all" ? null : Number(selectedMeetingId)
      })

      setMessages([...updatedMsgs, { role: "assistant", content: res.data.answer }])

      // If a new session was auto-created, set it active and add to sidebar
      if (!activeChatId && res.data.session) {
        setActiveChatId(res.data.chat_id)
        setChats([res.data.session, ...chats])
      }
    } catch (err) {
      console.error("Chat error:", err)
      setMessages([
        ...updatedMsgs,
        { role: "assistant", content: "Sorry, I couldn't reach the backend server." }
      ])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3.5 rounded-full shadow-lg transition-all hover:scale-105 font-semibold"
        >
          <MessageSquare className="w-5 h-5" />
          Ask MeetingMind
        </button>
      )}

      {isOpen && (
        <div className="w-[740px] max-w-[95vw] h-[580px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex overflow-hidden">
          
          {/* LEFT SIDEBAR: Conversation History */}
          <div className="w-60 bg-slate-900 text-slate-100 flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-800">
              <button
                onClick={startNewChat}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2.5 px-3 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" /> New Chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {chats.length === 0 ? (
                <p className="text-xs text-slate-500 text-center mt-6 px-2">No saved chats yet.</p>
              ) : (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => openChat(chat)}
                    className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-xs transition-colors ${
                      activeChatId === chat.id ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    {editingChatId === chat.id ? (
                      <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRename(chat.id)}
                          autoFocus
                          className="w-full bg-slate-700 text-white px-1.5 py-0.5 rounded text-xs focus:outline-none"
                        />
                        <button onClick={() => handleRename(chat.id)} className="text-green-400 hover:text-green-300">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="truncate flex-1">
                          <p className="truncate font-medium">{chat.title}</p>
                          <p className="text-[10px] text-slate-400">
                            {chat.meeting_id ? `Meeting #${chat.meeting_id}` : "All Meetings"}
                          </p>
                        </div>
                        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingChatId(chat.id)
                              setEditingTitle(chat.title)
                            }}
                            className="p-1 text-slate-400 hover:text-white"
                            title="Rename"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, chat.id)}
                            className="p-1 text-slate-400 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT PANEL: Active Chat */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="bg-blue-600 text-white p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <h3 className="font-bold text-sm">MeetingMind Assistant</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="hover:bg-blue-700 p-1 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Meeting Scope Selector */}
            <div className="p-2.5 bg-slate-50 border-b border-slate-200">
              <select
                value={selectedMeetingId}
                onChange={(e) => setSelectedMeetingId(e.target.value)}
                disabled={activeChatId !== null}
                className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="all">All Meetings (Search & Compare)</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    Meeting #{m.id} — {m.title || "Uploaded Meeting"} ({new Date(m.created_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {messages.length === 0 && (
                <div className="text-center text-slate-400 text-sm mt-16 px-6">
                  Select a meeting scope above and ask a question. Your conversation will be saved automatically.
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-none"
                        : "bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex items-center gap-2 text-xs text-slate-400 pl-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  Searching transcripts...
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick Prompts */}
            <div className="px-3 py-2 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto">
              {[
                "Compare decisions across meetings",
                "What tasks are assigned & when?",
                "Give exact timestamps for deadlines"
              ].map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  disabled={isSending}
                  className="shrink-0 text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 px-2.5 py-1 rounded-full transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                sendMessage()
              }}
              className="p-3 bg-white border-t border-slate-200 flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question or follow-up..."
                className="flex-1 text-sm bg-slate-100 rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-2.5 rounded-xl transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

        </div>
      )}
    </div>
  )
}