import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
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
  const [guidance, setGuidance] = useState('')
  const [sendingGuidance, setSendingGuidance] = useState(false)

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

  // Real-time: connect to observer WebSocket
  useEffect(() => {
    if (!session) return

    if (session.status === 'open') {
      const ws = chatApi.observeSession(session.id, session.session_token)
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'message' || data.type === 'guidance' || data.type === 'guidance_reply') {
            const msg: ChatMessageResponse = {
              id: data.message_id,
              session_id: session.id,
              sender_role: data.type === 'guidance' ? 'guidance' : data.type === 'guidance_reply' ? 'guidance_reply' : data.sender_role,
              content: data.content,
              created_at: data.created_at,
            }
            setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
            lastMsgIdRef.current = data.message_id
          } else if (data.type === 'evopack_shared') {
            setSession((prev) => prev ? { ...prev, shared_asset_id: data.asset_id } : prev)
          } else if (data.type === 'session_closed') {
            setSession((prev) => prev ? { ...prev, status: 'closed' } : prev)
          }
        } catch { /* ignore */ }
      }
      ws.onclose = () => startPolling()
      wsRef.current = ws
      return () => { ws.close() }
    } else {
      // Closed session — no real-time needed
      return
    }
  }, [session?.id, session?.status])

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

  const handleSendGuidance = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = guidance.trim()
    if (!content || !session || session.status !== 'open') return

    setSendingGuidance(true)
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'guidance', content }))
      } else {
        await chatApi.sendMessage(sessionId!, { content, sender_role: 'guidance' })
      }
      setGuidance('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send guidance')
    } finally {
      setSendingGuidance(false)
    }
  }

  const handleClose = async () => {
    if (!confirm('Close this learning session?')) return
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
  if (error && !session) return <div className="max-w-4xl mx-auto px-4 py-10"><ErrorMessage message={error} /></div>
  if (!session) return null

  const agentMessages = messages.filter((m) => m.sender_role !== 'guidance' && m.sender_role !== 'guidance_reply')
  const guidanceMessages = messages.filter((m) => m.sender_role === 'guidance' || m.sender_role === 'guidance_reply')

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display text-xl text-charcoal-800">
            {session.topic || 'Learning Session'}
          </h1>
          {session.learning_objective && (
            <p className="text-sm text-charcoal-400 mt-1 max-w-xl">
              Objective: {session.learning_objective}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className={`badge ${session.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-charcoal-100 text-charcoal-500'}`}>
              {session.status}
            </span>
            {session.status === 'open' && (
              <span className="badge bg-blue-100 text-blue-700">
                Turn: {session.turn === 'student' ? 'Student Agent' : 'Expert Agent'}
              </span>
            )}
            <span className="text-xs text-charcoal-300">{messages.length} messages</span>
            {session.shared_asset_id && (
              <Link
                to={`/marketplace/${session.shared_asset_id}`}
                className="badge bg-sage-100 text-sage-700 hover:bg-sage-200 cursor-pointer"
              >
                EvoPack Received
              </Link>
            )}
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

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Main conversation (read-only) */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="text-xs font-medium text-charcoal-400 mb-2 uppercase tracking-wide">
            Agent Conversation (read-only)
          </div>
          <div className="flex-1 overflow-y-auto card p-4 space-y-3 bg-cream-50">
            {agentMessages.length === 0 ? (
              <div className="text-center text-charcoal-300 py-16">
                Waiting for agents to start the conversation...
              </div>
            ) : (
              agentMessages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender_role === 'student' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                    msg.sender_role === 'student'
                      ? 'bg-sage-100 text-charcoal-700'
                      : 'bg-white border border-cream-200 text-charcoal-700'
                  }`}>
                    <div className="text-2xs font-medium mb-1 opacity-60">
                      {msg.sender_role === 'student' ? 'Student Agent' : 'Expert Agent'}
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
        </div>

        {/* Guidance sidebar */}
        <div className="w-72 flex flex-col shrink-0">
          <div className="text-xs font-medium text-charcoal-400 mb-2 uppercase tracking-wide">
            Private Channel
          </div>
          <div className="flex-1 overflow-y-auto card p-3 space-y-2 bg-amber-50/50 mb-2">
            {guidanceMessages.length === 0 ? (
              <div className="text-center text-charcoal-300 text-xs py-8">
                Send guidance to steer your agent's learning direction.
              </div>
            ) : (
              guidanceMessages.map((msg) => {
                const isReply = msg.sender_role === 'guidance_reply'
                return (
                  <div key={msg.id} className={`rounded-lg px-3 py-2 ${isReply ? 'bg-sage-100/60 text-charcoal-700 ml-3' : 'bg-amber-100/60 text-charcoal-600'}`}>
                    <div className="text-2xs font-medium mb-0.5 opacity-60">
                      {isReply ? 'Agent Reply' : 'You'}
                    </div>
                    <div className="text-xs whitespace-pre-wrap">{msg.content}</div>
                    <div className="text-2xs text-charcoal-300 mt-1">
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {session.status === 'open' && (
            <form onSubmit={handleSendGuidance} className="flex flex-col gap-2">
              <textarea
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                placeholder="Guide your agent... e.g., 'Ask more about error handling'"
                className="input text-sm min-h-[60px] resize-none"
                disabled={sendingGuidance}
              />
              <button
                type="submit"
                disabled={sendingGuidance || !guidance.trim()}
                className="btn-primary text-xs w-full"
              >
                {sendingGuidance ? '...' : 'Send Guidance'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
