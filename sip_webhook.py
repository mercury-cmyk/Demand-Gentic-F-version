import os
from dotenv import load_dotenv
import json
import threading
import asyncio
from flask import Flask, request, Response
from openai import OpenAI, InvalidWebhookSignatureError
import requests
import websockets


load_dotenv()
app = Flask(__name__)

client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
    webhook_secret=os.environ.get("OPENAI_WEBHOOK_SECRET")
)

AUTH_HEADER = {
    "Authorization": "Bearer " + os.getenv("OPENAI_API_KEY")
}

call_accept = {
    "type": "realtime",
    "instructions": "You are a support agent.",
    "model": "gpt-realtime",
}

response_create = {
    "type": "response.create",
    "response": {
        "instructions": (
            "Say to the user 'Thank you for calling, how can I help you'"
        )
    },
}

async def websocket_task(call_id):
    try:
        async with websockets.connect(
            f"wss://api.openai.com/v1/realtime?call_id={call_id}",
            extra_headers=AUTH_HEADER,
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
                f"https://api.openai.com/v1/realtime/calls/{event.data.call_id}/accept",
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
    except Exception as e:
        print("Webhook error", e)
        return Response("Webhook error", status=500)

if __name__ == "__main__":
    app.run(port=8000)
