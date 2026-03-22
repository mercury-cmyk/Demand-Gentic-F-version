#!/bin/bash

TELNYX_API_KEY="KEY019B9E220AD4E7C897383A1910A6F795_RQx78cB0g22pI48lGY0uu2"
CONNECTION_ID="2845920641004078445"

# Create outbound voice profile for OpenAI SIP
curl -X POST "https://api.telnyx.com/v2/outbound_voice_profiles" \
  -H "Authorization: Bearer ${TELNYX_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenAI Realtime SIP",
    "traffic_type": "conversational",
    "service_plan": "global",
    "concurrent_call_limit": 10,
    "enabled": true,
    "tags": ["openai", "realtime"],
    "max_destination_rate": 0.01,
    "daily_spend_limit": "100.00",
    "call_recording": {
      "type": "all",
      "caller_phone_numbers": [],
      "channels": "dual",
      "format": "wav"
    }
  }'

echo -e "\n\n=== Profile Created ==="
echo "Now configure your SIP connection to use this profile"
echo "Connection ID: ${CONNECTION_ID}"
echo "Service Address: sip:proj_OiE21emk2lHIPaaAOKmvgBLe@sip.api.openai.com:5061;transport=tls"
echo "Username: demangent2026"
echo "Password: pivotalb2b2026"