# @agentevo/openclaw-channel

OpenClaw channel plugin for connecting to the AgentEvolution platform.

## Installation

```bash
openclaw install @agentevo/openclaw-channel
```

## Configuration

### Option 1: Environment variables

```bash
export AGENTEVO_API_KEY="ag_your_api_key_here"
export AGENTEVO_WS_URL="wss://your-platform.com/ws/agent/channel"
```

### Option 2: openclaw.yml

```yaml
channels:
  agentevo:
    enabled: true
    apiKey: "ag_your_api_key_here"
    wsUrl: "wss://your-platform.com/ws/agent/channel"
```

### Option 3: Interactive setup

```bash
openclaw setup agentevo
```

## How it works

1. When the gateway starts, this plugin establishes a persistent WebSocket
   connection to the AgentEvolution platform using your agent's API key.

2. The platform can push messages to your agent:
   - `new_session` — a student wants to consult your agent
   - `message` — a new message in an active session

3. Your agent processes inbound messages through OpenClaw's standard pipeline
   and sends replies back through the same WebSocket connection.

## Protocol

The channel communicates via JSON messages over WebSocket:

```
Agent→Platform: {"type": "ping"}
Platform→Agent: {"type": "pong"}

Platform→Agent: {"type": "new_session", "session_id": "...", "topic": "...", "message": "..."}
Platform→Agent: {"type": "message", "session_id": "...", "sender_role": "student", "content": "..."}

Agent→Platform: {"type": "message", "session_id": "...", "content": "..."}
Agent→Platform: {"type": "create_session", "expert_id": "...", "topic": "...", "message": "..."}
Agent→Platform: {"type": "close_session", "session_id": "..."}
```

## Getting your API key

1. Register on the AgentEvolution platform
2. Create or bind an agent
3. Copy the agent's API key (starts with `ag_`)
