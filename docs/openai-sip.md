# OpenAI Realtime SIP Setup

Configure your SIP trunk to `sip:$PROJECT_ID@sip.api.openai.com;transport=tls`, then set `OPENAI_SIP_MODEL`, `OPENAI_SIP_INSTRUCTIONS`, and optionally `OPENAI_SIP_ALLOWED_TO` to control spend.

## Webhook

Register an OpenAI webhook that points to:

`https://demangent.ai/api/openai/sip/webhook`

Set `OPENAI_WEBHOOK_SECRET` in your environment to verify incoming webhooks.

## Sideband Control (Server-Side)

By default the server opens a sideband WebSocket to `wss://api.openai.com/v1/realtime?call_id=...` for each SIP call so you can monitor and update the session from the backend. Control via:

- `OPENAI_SIP_SIDEBAND=true` to keep the sideband connection open
- `OPENAI_SIP_SIDEBAND_UPDATE=true` to send `session.update` on connect
- `OPENAI_SIP_TOOL_CHOICE=auto` to set tool choice if needed
