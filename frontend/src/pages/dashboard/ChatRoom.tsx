import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { chat as chatApi } from '../../api/client'
import type { ChatSessionResponse, ChatMessageResponse } from '../../types'
import { PageLoader, ErrorMessage } from '../../components/Ui'

export default function ChatRoom() {
  const { id: sessionId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<ChatSessionResponse | null>(null)
  const [messages, setMessages] = useState<ChatMessageResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const lastMsgIdRef = useRef<string | null>(null)

  // Load session and initial messages
  useEffect(() => {
    const load = async () => {
      try {
        const s = await chatApi.getSession(sessionId!)
        setSession(s)
        const msgs = await chatApi.listMessages(sessionId!)
        setMessages(msgs)
        if (msgs.length > 0) {
          lastMsgIdRef.current = msgs[msgs.length - 1].id
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load session')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [sessionId])

  // Platform expert: WebSocket  |  Community expert: REST polling
  useEffect(() => {
    if (!session || session.status !== 'open') return

    if (session.is_platform_expert) {
      const ws = chatApi.connectWs(session.id, session.session_token)
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'message') {
            const msg: ChatMessageResponse = {
              id: data.message_id,
              session_id: session.id,
              sender_role: data.sender_role,
              content: data.content,
              created_at: data.created_at,
            }
            setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
            lastMsgIdRef.current = data.message_id
          }
        } catch { /* ignore */ }
      }
      ws.onclose = () => startPolling()
      wsRef.current = ws
      return () => { ws.close() }
    } else {
      startPolling()
      return () => stopPolling()
    }
  }, [session])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const startPolling = useCallback(() => {
    stopPolling()
    const poll = async () => {
      try {
        const newMsgs = await chatApi.listMessages(sessionId!, lastMsgIdRef.current || undefined)
        if (newMsgs.length > 0) {
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id))
            const unique = newMsgs.filter((m) => !ids.has(m.id))
            return unique.length > 0 ? [...prev, ...unique] : prev
          })
          lastMsgIdRef.current = newMsgs[newMsgs.length - 1].id
        }
      } catch { /* ignore */ }
    }
    pollTimerRef.current = window.setInterval(poll, 3000)
  }, [sessionId])

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = input.trim()
    if (!content || !session || session.status !== 'open') return

    setSending(true)
    try {
      if (session.is_platform_expert && wsRef.current?.readyState === WebSocket.OPEN) {
        // Platform expert: send via WS, server echoes + replies
        wsRef.current.send(JSON.stringify({ content }))
      } else {
        // Community expert: send via REST
        const msg = await chatApi.sendMessage(sessionId!, { content, sender_role: 'student' })
        setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
        lastMsgIdRef.current = msg.id
      }
      setInput('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const handleClose = async () => {
    if (!confirm('Close this session?')) return
    try {
      await chatApi.closeSession(sessionId!)
      setSession((prev) => prev ? { ...prev, status: 'closed' } : prev)
      wsRef.current?.close()
      stopPolling()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to close')
    }
  }

  if (loading) return <PageLoader />
  if (error && !session) return <div className="max-w-3xl mx-auto px-4 py-10"><ErrorMessage message={error} /></div>
  if (!session) return null

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display text-xl text-charcoal-800">
            {session.topic || 'Chat Session'}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`badge ${session.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-charcoal-100 text-charcoal-500'}`}>
              {session.status}
            </span>
            {session.is_platform_expert ? (
              <span className="badge bg-blue-100 text-blue-700">Platform Expert</span>
            ) : (
              <span className="badge badge-charcoal">Community Expert</span>
            )}
            <span className="text-xs text-charcoal-300">{messages.length} messages</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session.status === 'open' && (
            <button onClick={handleClose} className="btn-danger text-xs">Close</button>
          )}
          <button onClick={() => navigate('/dashboard/chats')} className="btn-secondary text-xs">Back</button>
        </div>
      </div>

      {error && <div className="mb-2"><ErrorMessage message={error} /></div>}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto card p-4 mb-4 space-y-3 bg-cream-50">
        {messages.length === 0 ? (
          <div className="text-center text-charcoal-300 py-16">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender_role === 'student' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-xl px-4 py-2.5 ${
                msg.sender_role === 'student'
                  ? 'bg-sage-100 text-charcoal-700'
                  : 'bg-white border border-cream-200 text-charcoal-700'
              }`}>
                <div className="text-2xs font-medium mb-1 opacity-60">
                  {msg.sender_role === 'student' ? 'You (Student)' : 'Expert'}
                </div>
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                <div className="text-2xs text-charcoal-300 mt-1">
                  {new Date(msg.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {session.status === 'open' && (
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="input flex-1"
            disabled={sending}
          />
          <button type="submit" disabled={sending || !input.trim()} className="btn-primary px-6">
            {sending ? '...' : 'Send'}
          </button>
        </form>
      )}
    </div>
  )
}
