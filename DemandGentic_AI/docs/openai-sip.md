# Realtime API with SIP

Connect to the Realtime API using SIP. SIP is a protocol used to make phone calls over the
internet. With SIP and the Realtime API you can direct incoming phone calls to the API.

## Overview
If you want to connect a phone number to the Realtime API, use a SIP trunking provider
(for example, Twilio). This is a service that converts your phone call to IP traffic.

High-level steps:
1. Create an OpenAI webhook for incoming calls.
2. Point your SIP trunk at the OpenAI SIP endpoint using your project ID.
3. Accept or reject calls from the webhook and configure the Realtime session.
4. Monitor the call via WebSocket events.

To find your project ID, visit OpenAI Platform settings > Project > General. It will
have a `proj_` prefix.

SIP endpoint format:
```
sip:$PROJECT_ID@sip.api.openai.com;transport=tls
```

For project-specific configuration in this repo, see `docs/openai-sip-setup-complete.md`.

---

## Webhook event: realtime.call.incoming
When OpenAI receives SIP traffic for your project, your webhook will be fired with a
`realtime.call.incoming` event.

Example request:
```http
POST https://my_website.com/webhook_endpoint
user-agent: OpenAI/1.0 (+https://platform.openai.com/docs/webhooks)
content-type: application/json
webhook-id: wh_685342e6c53c8190a1be43f081506c52
webhook-timestamp: 1750287078
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=
```

```json
{
  "object": "event",
  "id": "evt_685343a1381c819085d44c354e1b330e",
  "type": "realtime.call.incoming",
  "created_at": 1750287018,
  "data": {
    "call_id": "some_unique_id",
    "sip_headers": [
      { "name": "From", "value": "sip:+142555512112@sip.example.com" },
      { "name": "To", "value": "sip:+18005551212@sip.example.com" },
      { "name": "Call-ID", "value": "03782086-4ce9-44bf-8b0d-4e303d2cc590" }
    ]
  }
}
```

Use the `call_id` to accept or reject the call.

---

## Accept the call
Use the Accept call endpoint to approve the inbound call and configure the session that
will answer it. Send the same parameters you would send in a Realtime session config
(model, voice, instructions, tools).

```bash
curl -X POST "https://api.openai.com/v1/realtime/calls/$CALL_ID/accept" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "type": "realtime",
        "model": "gpt-realtime",
        "instructions": "You are Alex, a friendly concierge for Example Corp."
      }'
```

The endpoint returns 200 OK once the SIP leg is ringing and the Realtime session is
being established.

---

## Reject the call
Use the Reject call endpoint to decline a call (for example, unsupported country code).

```bash
curl -X POST "https://api.openai.com/v1/realtime/calls/$CALL_ID/reject" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status_code": 486}'
```

If no status code is supplied the API uses 603 Decline by default.

---

## Monitor call events (WebSocket)
After you accept a call, open a WebSocket connection to the same session to stream
events and issue Realtime commands. The model is already configured via accept, so
it is not required in the WebSocket connect.

WebSocket request:
```
wss://api.openai.com/v1/realtime?call_id={call_id}
```

Headers:
```
Authorization: Bearer YOUR_API_KEY
```

Minimal Node example:
```javascript
import WebSocket from "ws";

const callId = "rtc_u1_9c6574da8b8a41a18da9308f4ad974ce";
const ws = new WebSocket(`wss://api.openai.com/v1/realtime?call_id=${callId}`, {
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
});

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "response.create" }));
});
```

---

## Redirect the call
Transfer an active call using the Refer call endpoint.

```bash
curl -X POST "https://api.openai.com/v1/realtime/calls/$CALL_ID/refer" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_uri": "tel:+14155550123"}'
```

---

## Hang up the call
Terminate the call (SIP or WebRTC) using the hangup endpoint.

```bash
curl -X POST "https://api.openai.com/v1/realtime/calls/$CALL_ID/hangup" \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

---

## Python webhook example
This example accepts incoming calls, then opens a WebSocket to monitor events.

```python
from flask import Flask, request, Response
from openai import OpenAI, InvalidWebhookSignatureError
import asyncio
import json
import os
import requests
import threading
import websockets

app = Flask(__name__)
client = OpenAI(webhook_secret=os.environ["OPENAI_WEBHOOK_SECRET"])

AUTH_HEADER = {"Authorization": "Bearer " + os.getenv("OPENAI_API_KEY")}

call_accept = {
    "type": "realtime",
    "instructions": "You are a support agent.",
    "model": "gpt-realtime",
}

response_create = {
    "type": "response.create",
    "response": {
        "instructions": "Say to the user 'Thank you for calling, how can I help you'"
    },
}


async def websocket_task(call_id):
    try:
        async with websockets.connect(
            "wss://api.openai.com/v1/realtime?call_id=" + call_id,
            additional_headers=AUTH_HEADER,
        ) as websocket:
            await websocket.send(json.dumps(response_create))
            while True:
                response = await websocket.recv()
                print(f"Received from WebSocket: {response}")
    except Exception as e:
        print(f"WebSocket error: {e}")


@app.route("/", methods=["POST"])
def webhook():
    try:
        event = client.webhooks.unwrap(request.data, request.headers)
        if event.type == "realtime.call.incoming":
            requests.post(
                "https://api.openai.com/v1/realtime/calls/"
                + event.data.call_id
                + "/accept",
                headers={**AUTH_HEADER, "Content-Type": "application/json"},
                json=call_accept,
            )
            threading.Thread(
                target=lambda: asyncio.run(websocket_task(event.data.call_id)),
                daemon=True,
            ).start()
            return Response(status=200)
    except InvalidWebhookSignatureError as e:
        print("Invalid signature", e)
        return Response("Invalid signature", status=400)


if __name__ == "__main__":
    app.run(port=8000)
```

---

## Next steps
- Configure your SIP trunk to the project SIP endpoint and enable TLS.
- Set `OPENAI_WEBHOOK_SECRET` and your API key in the environment.
- Update your webhook handler to accept/reject based on business rules.
- Open the WebSocket stream to log events and trigger responses.