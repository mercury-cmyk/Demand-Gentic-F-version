#!/usr/bin/env bash
#
# WebRTC Compliance Check Script
#
# Ensures no WebSocket usage in the unified WebRTC calling stack.
# Run this before committing changes to WebRTC components.
#
# Usage: ./scripts/check-webrtc-compliance.sh

set -e

echo "🔍 WebRTC Compliance Check"
echo "=========================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FOUND_VIOLATIONS=false

# Paths that must be WebSocket-free
WEBRTC_PATHS=(
  "client/src/lib/webrtc"
  "client/src/hooks/useUnifiedWebRTC.ts"
  "client/src/components/softphone"
)

# Forbidden patterns
declare -A FORBIDDEN_PATTERNS
FORBIDDEN_PATTERNS["new WebSocket("]="Direct WebSocket instantiation"
FORBIDDEN_PATTERNS["socket.io"]="Socket.IO library"
FORBIDDEN_PATTERNS["from 'ws'"]="ws library import"
FORBIDDEN_PATTERNS['from "ws"']="ws library import"
FORBIDDEN_PATTERNS["engine.io"]="Engine.IO library"

echo "📁 Checking WebRTC calling stack for WebSocket usage..."
echo ""

for path in "${WEBRTC_PATHS[@]}"; do
  if [[ -d "$path" ]] || [[ -f "$path" ]]; then
    echo "  Checking: $path"
    
    for pattern in "${!FORBIDDEN_PATTERNS[@]}"; do
      desc="${FORBIDDEN_PATTERNS[$pattern]}"
      
      if grep -rn "$pattern" "$path" 2>/dev/null | grep -v "^\s*//" | grep -v "^\s*\*" | head -5; then
        echo -e "    ${RED}❌ Found: $desc${NC}"
        FOUND_VIOLATIONS=true
      fi
    done
    
    # Special check for wss:// URLs (not in comments)
    if grep -rn "wss://" "$path" 2>/dev/null | grep -v "^\s*//" | grep -v "^\s*\*" | grep -v "// " | head -3; then
      echo -e "    ${YELLOW}⚠️  Found wss:// URL (review if in code, not comment)${NC}"
    fi
    
  else
    echo -e "  ${YELLOW}⚠️  Path not found: $path${NC}"
  fi
done

echo ""

# Verify required WebRTC patterns exist
echo "✓ Verifying WebRTC patterns..."
echo ""

# Check Telnyx WebRTC SDK
if grep -q "@telnyx/webrtc" "client/src/lib/webrtc/telnyx-webrtc-client.ts" 2>/dev/null; then
  echo -e "  ${GREEN}✅ Telnyx WebRTC SDK import found${NC}"
else
  echo -e "  ${RED}❌ Missing @telnyx/webrtc import${NC}"
  FOUND_VIOLATIONS=true
fi

# Check RTCPeerConnection in OpenAI client
if grep -q "RTCPeerConnection" "client/src/lib/webrtc/openai-realtime-webrtc-client.ts" 2>/dev/null; then
  echo -e "  ${GREEN}✅ RTCPeerConnection usage found in OpenAI client${NC}"
else
  echo -e "  ${RED}❌ Missing RTCPeerConnection in OpenAI client${NC}"
  FOUND_VIOLATIONS=true
fi

# Check data channel
if grep -q "createDataChannel" "client/src/lib/webrtc/openai-realtime-webrtc-client.ts" 2>/dev/null; then
  echo -e "  ${GREEN}✅ Data channel usage found for events${NC}"
else
  echo -e "  ${YELLOW}⚠️  Data channel usage not found (may be in peer config)${NC}"
fi

# Check replaceTrack for audio bridging
if grep -q "replaceTrack" "client/src/lib/webrtc/audio-bridge-controller.ts" 2>/dev/null; then
  echo -e "  ${GREEN}✅ Track replacement (replaceTrack) found for audio bridging${NC}"
else
  echo -e "  ${RED}❌ Missing replaceTrack for audio bridging${NC}"
  FOUND_VIOLATIONS=true
fi

echo ""
echo "=========================="

if [[ "$FOUND_VIOLATIONS" == true ]]; then
  echo -e "${RED}❌ COMPLIANCE CHECK FAILED${NC}"
  echo ""
  echo "The unified WebRTC calling stack must NOT use WebSockets."
  echo ""
  echo "Requirements:"
  echo "  • Telnyx WebRTC SDK for PSTN/SIP calls"
  echo "  • OpenAI Realtime API over WebRTC peer connection"
  echo "  • Data channel for OpenAI events (not WebSocket)"
  echo "  • Audio bridging via track replacement"
  echo ""
  exit 1
else
  echo -e "${GREEN}✅ COMPLIANCE CHECK PASSED${NC}"
  echo ""
  echo "All WebRTC calling components are WebSocket-free."
  exit 0
fi