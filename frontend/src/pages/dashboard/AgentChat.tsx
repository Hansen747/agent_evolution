import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { agents as agentsApi } from '../../api/client'
import type { AgentResponse } from '../../types'
import { Spinner } from '../../components/Ui'

interface DirectMessage {
  id: string
  content: string
  from: 'owner' | 'agent'
  created_at: string
}

export default function AgentChat() {
  const { agentId } = useParams<{ agentId: string }>()
  const [agent, setAgent] = useState<AgentResponse | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [agentOnline, setAgentOnline] = useState(false)
  const [error, setError] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  useEffect(() => {
    if (!agentId) return

    agentsApi.get(agentId).then(setAgent).catch(() => setError('Agent not found'))

    const ws = agentsApi.directChat(agentId)
    wsRef.current = ws

    ws.onopen = () => {}

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'connected':
          setConnected(true)
          setAgentOnline(data.agent_online)
          break

        case 'direct_message':
          setMessages((prev) => [...prev, {
            id: data.message_id,
            content: data.content,
            from: data.from,
            created_at: data.created_at,
          }])
          break

        case 'direct_message_sent':
          break

        case 'error':
          setError(data.detail)
          break
      }
    }

    ws.onclose = () => {
      setConnected(false)
    }

    ws.onerror = () => {
      setError('WebSocket connection failed')
    }

    return () => {
      ws.close()
    }
  }, [agentId])

  const sendMessage = () => {
    const text = input.trim()
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    wsRef.current.send(JSON.stringify({
      type: 'direct_message',
      content: text,
    }))

    setMessages((prev) => [...prev, {
      id: `local-${Date.now()}`,
      content: text,
      from: 'owner',
      created_at: new Date().toISOString(),
    }])

    setInput('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/agents" className="text-charcoal-400 hover:text-charcoal-600 text-sm">&larr; My Agents</Link>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${agentOnline ? 'bg-green-500' : 'bg-charcoal-300'}`} />
            <h1 className="font-display text-xl text-charcoal-800">
              {agent?.name || 'Agent Chat'}
            </h1>
            <span className="text-xs text-charcoal-400">
              {agentOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-charcoal-400">
          <span className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-400'}`} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-700 mb-3">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto rounded-2xl border border-cream-200 bg-cream-50/50 p-4 mb-4 space-y-3">
        {messages.length === 0 && connected && (
          <div className="text-center py-16 text-charcoal-400 text-sm">
            {agentOnline
              ? 'Your agent is online. Send a message to start chatting.'
              : 'Your agent is currently offline. Messages will be delivered when it reconnects.'}
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.from === 'owner' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                msg.from === 'owner'
                  ? 'bg-sage-600 text-white'
                  : 'bg-white border border-cream-200 text-charcoal-700'
              }`}
            >
              <div className="text-xs opacity-60 mb-1">
                {msg.from === 'owner' ? 'You' : agent?.name || 'Agent'}
                <span className="ml-2">{new Date(msg.created_at).toLocaleTimeString()}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={agentOnline ? 'Type a message...' : 'Agent is offline...'}
          disabled={!connected}
          className="input flex-1 resize-none"
          rows={2}
        />
        <button
          onClick={sendMessage}
          disabled={!connected || !input.trim() || !agentOnline}
          className="btn-primary self-end"
        >
          Send
        </button>
      </div>
    </div>
  )
}
