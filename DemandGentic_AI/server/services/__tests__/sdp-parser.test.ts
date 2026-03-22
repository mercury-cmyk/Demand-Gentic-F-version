import { describe, expect, it } from 'vitest';

import { getAudioEndpoint, getAudioG711Format } from '../sip/sdp-parser';

describe('sdp-parser', () => {
  it('extracts the remote audio endpoint from answered SDP', () => {
    const sdp = `v=0
o=- 123 456 IN IP4 203.0.113.10
s=-
c=IN IP4 203.0.113.20
m=audio 49170 RTP/AVP 8 101
a=rtpmap:8 PCMA/8000
a=rtpmap:101 telephone-event/8000
`;

    expect(getAudioEndpoint(sdp)).toEqual({
      address: '203.0.113.20',
      port: 49170,
    });
  });

  it('detects alaw when the remote answer negotiates PCMA first', () => {
    const sdp = `v=0
o=- 123 456 IN IP4 203.0.113.10
s=-
c=IN IP4 203.0.113.20
m=audio 49170 RTP/AVP 8 101
a=rtpmap:8 PCMA/8000
a=rtpmap:101 telephone-event/8000
`;

    expect(getAudioG711Format(sdp)).toBe('alaw');
  });

  it('detects ulaw when the remote answer negotiates PCMU first', () => {
    const sdp = `v=0
o=- 123 456 IN IP4 203.0.113.10
s=-
c=IN IP4 203.0.113.20
m=audio 49170 RTP/AVP 0 101
a=rtpmap:0 PCMU/8000
a=rtpmap:101 telephone-event/8000
`;

    expect(getAudioG711Format(sdp)).toBe('ulaw');
  });

  it('falls back to rtpmap names when payload ids are non-standard', () => {
    const sdp = `v=0
o=- 123 456 IN IP4 203.0.113.10
s=-
c=IN IP4 203.0.113.20
m=audio 49170 RTP/AVP 118 101
a=rtpmap:118 PCMA/8000
a=rtpmap:101 telephone-event/8000
`;

    expect(getAudioG711Format(sdp)).toBe('alaw');
  });

  it('returns null when no G.711 codec can be inferred', () => {
    const sdp = `v=0
o=- 123 456 IN IP4 203.0.113.10
s=-
c=IN IP4 203.0.113.20
m=audio 49170 RTP/AVP 111
a=rtpmap:111 opus/48000/2
`;

    expect(getAudioG711Format(sdp)).toBeNull();
  });
});