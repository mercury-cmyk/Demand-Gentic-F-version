/**
 * SDP (Session Description Protocol) Parser
 * 
 * Parses SDP bodies to extract RTP endpoint information (address and port)
 * Used to determine where to send return RTP audio in media bridging scenarios
 */

export interface MediaInfo {
  type: 'audio' | 'video' | 'application';
  port: number;
  address?: string;
  rtcpPort?: number;
  codecs: number[];
  rtpMap?: Record;
}

export interface SessionInfo {
  connectionAddress?: string;
  sessionPort?: number;
  media: MediaInfo[];
}

/**
 * Parse an SDP body and extract media endpoint information
 * 
 * SDP Format (relevant lines):
 * v=0
 * o=
 * s=
 * c=IN IP4              ...   line.trim());

  let currentMedia: MediaInfo | null = null;
  let mediaConnectionAddress: string | undefined;

  for (const line of lines) {
    const [type, value] = line.split('=', 2);
    if (!type || !value) continue;

    const typeTrimmed = type.trim();
    const valueTrimmed = value.trim();

    switch (typeTrimmed) {
      // Session connection address (applies to all media unless overridden)
      case 'c':
        const cMatch = valueTrimmed.match(/IN IP[46]\s+([^\s]+)/);
        if (cMatch) {
          // If we're in a media section, this applies only to that media
          if (currentMedia) {
            mediaConnectionAddress = cMatch[1];
            currentMedia.address = cMatch[1];
          } else {
            result.connectionAddress = cMatch[1];
          }
        }
        break;

      // Media line: m=audio   
      case 'm':
        if (currentMedia) {
          result.media.push(currentMedia);
        }

        const mMatch = valueTrimmed.match(/^(\w+)\s+(\d+)\s+(\S+)\s+(.*)/);
        if (mMatch) {
          const [, mediaType, port, proto, codecStr] = mMatch;
          const codecs = codecStr
            .split(/\s+/)
            .map(c => parseInt(c, 10))
            .filter(c => !isNaN(c));

          currentMedia = {
            type: mediaType as 'audio' | 'video' | 'application',
            port: parseInt(port, 10),
            address: mediaConnectionAddress || result.connectionAddress,
            codecs,
            rtpMap: {},
          };
        }
        break;

      // RTCP port information
      case 'a':
        if (!currentMedia) break;

        if (valueTrimmed.startsWith('rtcp:')) {
          const rtcpMatch = valueTrimmed.match(/rtcp:(\d+)/);
          if (rtcpMatch) {
            currentMedia.rtcpPort = parseInt(rtcpMatch[1], 10);
          }
          break;
        }

        if (valueTrimmed.startsWith('rtpmap:')) {
          const rtpMapMatch = valueTrimmed.match(/rtpmap:(\d+)\s+([A-Za-z0-9_-]+)\/\d+/);
          if (rtpMapMatch) {
            const payloadType = parseInt(rtpMapMatch[1], 10);
            if (!Number.isNaN(payloadType)) {
              currentMedia.rtpMap ||= {};
              currentMedia.rtpMap[payloadType] = rtpMapMatch[2].toUpperCase();
            }
          }
        }
        break;
    }
  }

  // Don't forget the last media line
  if (currentMedia) {
    result.media.push(currentMedia);
  }

  return result;
}

/**
 * Get the audio media endpoint from SDP
 * Returns the first audio media section's address and port
 * 
 * @param sdpBody Raw SDP text
 * @returns Object with address and port, or null if not found
 */
export function getAudioEndpoint(sdpBody: string): { address: string; port: number } | null {
  const session = parseSDP(sdpBody);

  // Find first audio media section
  const audioMedia = session.media.find(m => m.type === 'audio');
  if (!audioMedia || !audioMedia.address) {
    return null;
  }

  return {
    address: audioMedia.address,
    port: audioMedia.port,
  };
}

export type G711Format = 'ulaw' | 'alaw';

/**
 * Detect the negotiated G.711 codec from the remote audio SDP answer.
 *
 * We honor the payload order in the remote audio media line first because that
 * reflects the codec the far end accepted for the session. If we can't infer
 * from payload ids, fall back to any matching rtpmap entry.
 */
export function getAudioG711Format(sdpBody: string): G711Format | null {
  const session = parseSDP(sdpBody);
  const audioMedia = session.media.find((media) => media.type === 'audio');
  if (!audioMedia) {
    return null;
  }

  for (const payloadType of audioMedia.codecs) {
    if (payloadType === 0) return 'ulaw';
    if (payloadType === 8) return 'alaw';

    const codecName = audioMedia.rtpMap?.[payloadType]?.toUpperCase();
    if (codecName === 'PCMU') return 'ulaw';
    if (codecName === 'PCMA') return 'alaw';
  }

  for (const codecName of Object.values(audioMedia.rtpMap || {})) {
    if (codecName === 'PCMU') return 'ulaw';
    if (codecName === 'PCMA') return 'alaw';
  }

  return null;
}

/**
 * Extract the main connection address from SDP
 * This is the address used for all media unless overridden at media level
 * 
 * @param sdpBody Raw SDP text
 * @returns Connection address or null if not found
 */
export function getSessionConnectionAddress(sdpBody: string): string | null {
  const session = parseSDP(sdpBody);
  return session.connectionAddress || null;
}

/**
 * Test helper: Validate SDP parsing with known test cases
 */
export function testSDPParser(): void {
  // Test case 1: Basic SDP with session-level connection
  const basicSDP = `v=0
o=- 1234567890 1234567890 IN IP4 192.168.1.100
s=Test Session
c=IN IP4 192.168.1.100
m=audio 5000 RTP/AVP 0 8
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
`;

  const result1 = parseSDP(basicSDP);
  console.log('[SDP Parser Test 1]', {
    sessionAddress: result1.connectionAddress,
    audioPort: result1.media[0]?.port,
    audioAddress: result1.media[0]?.address,
  });

  // Test case 2: SDP with media-level connection override
  const overrideSDP = `v=0
o=- 1234567890 1234567890 IN IP4 192.168.1.100
s=Test Session
c=IN IP4 192.168.1.100
m=audio 5000 RTP/AVP 0
c=IN IP4 10.0.0.50
`;

  const result2 = parseSDP(overrideSDP);
  console.log('[SDP Parser Test 2 - Media Override]', {
    sessionAddress: result2.connectionAddress,
    audioAddress: result2.media[0]?.address,
  });

  // Test case 3: Helper functions
  const endpoint = getAudioEndpoint(basicSDP);
  console.log('[SDP Parser Test 3 - Helper]', endpoint);
}