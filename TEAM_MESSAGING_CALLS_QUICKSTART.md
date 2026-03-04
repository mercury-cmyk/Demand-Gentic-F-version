# Team Messaging & Calls System - Quick Start Guide

## Overview
Complete team communication platform with real-time messaging, voice/video calls, transcripts, and call recordings integrated into your CRM.

**Features:**
- ✅ Real-time team messaging with channels
- ✅ Voice & video calling  
- ✅ Call recordings and transcripts
- ✅ Message reactions and threading
- ✅ File attachments
- ✅ Typing indicators
- ✅ Read receipts
- ✅ Call history & analytics

## 🚀 Quick Setup (15 minutes)

### 1. Database Migration
```bash
npm run db:push
```
Creates 9 new tables with proper indexing

### 2. Register Routes in server/index.ts

Find where routes are registered and add:

```typescript
import teamMessagingRoutes from './routes/team-messaging-routes';
import teamCallsRoutes from './routes/team-calls-routes';

// After other route registrations:
app.use('/api/team-messaging', requireAuth, teamMessagingRoutes);
app.use('/api/team-calls', requireAuth, teamCallsRoutes);
```

### 3. Initialize WebSocket Servers

In your server startup (after HTTP server created):

```typescript
import { initializeChatWebSocket } from './routes/chat-websocket';
import { initializeCallsWebSocket } from './routes/calls-websocket';

const server = createServer(app);
// ... start listening ...

const chatWss = initializeChatWebSocket(server);
const callsWss = initializeCallsWebSocket(server);
```

### 4. Add Components to React App

```typescript
import { TeamChatComponent } from '@/components/TeamChatComponent';
import { TeamCallsComponent } from '@/components/TeamCallsComponent';

// In your page/layout:
export default function Page() {
  return (
    <>
      <TeamChatComponent teamId="team-123" />
      <TeamCallsComponent teamId="team-123" />
    </>
  );
}
```

### 5. Use Hooks in Your Components

```typescript
import {
  useChannels,
  useMessages,
  useCalls,
  useCallParticipant,
} from '@/hooks/useTeamMessagingAndCalls';

function MyComponent({ teamId }: { teamId: string }) {
  const { channels, createChannel } = useChannels(teamId);
  const { messages, sendMessage } = useMessages(channelId);
  const { calls, initiateCall } = useCalls(teamId);

  return (
    <div>
      {/* Use the hooks here */}
    </div>
  );
}
```

## API Endpoints

### Messaging

**Channels**
- `GET /api/team-messaging/channels/:teamId` - List channels
- `POST /api/team-messaging/channels` - Create channel
- `GET /api/team-messaging/channels/:channelId/details` - Channel details + members
- `PUT /api/team-messaging/channels/:channelId` - Update channel

**Messages**
- `POST /api/team-messaging/messages` - Send message
- `GET /api/team-messaging/messages/:channelId` - Get messages (paginated)
- `PUT /api/team-messaging/messages/:messageId` - Edit message
- `DELETE /api/team-messaging/messages/:messageId` - Delete message
- `POST /api/team-messaging/messages/:messageId/read` - Mark as read
- `POST /api/team-messaging/messages/:messageId/reactions` - Add emoji reaction

**Members**
- `POST /api/team-messaging/channels/:channelId/members` - Add member
- `DELETE /api/team-messaging/channels/:channelId/members/:userId` - Remove member

**Search**
- `GET /api/team-messaging/search` - Search messages and channels

### Calls

**Call Management**
- `POST /api/team-calls/calls/initiate` - Start a call
- `POST /api/team-calls/calls/:callId/accept` - Accept call
- `POST /api/team-calls/calls/:callId/decline` - Decline call
- `POST /api/team-calls/calls/:callId/end` - End call
- `GET /api/team-calls/calls/:callId` - Get call details

**Call History**
- `GET /api/team-calls/calls/history/:teamId` - List calls (paginated, filterable)
- `GET /api/team-calls/calls/user/:userId` - User's calls
- `GET /api/team-calls/calls/stats/:teamId` - Call statistics

**Recordings & Transcripts**
- `POST /api/team-calls/calls/:callId/recording` - Save recording
- `GET /api/team-calls/calls/:callId/recording` - Get recording
- `POST /api/team-calls/calls/:callId/transcript` - Save transcript
- `GET /api/team-calls/calls/:callId/transcript` - Get transcript

## WebSocket Events

### Chat (/ws/chat/:channelId/:userId)

**Incoming:**
```javascript
{
  type: 'new_message',
  messageId: string,
  senderId: string,
  content: string,
  timestamp: string
}

{
  type: 'user_typing',
  userId: string,
  typingUsers: string[]  // Current typers in channel
}

{
  type: 'user_joined' | 'user_left',
  userId: string,
  timestamp: string
}

{
  type: 'message_reaction',
  messageId: string,
  emoji: string,
  userId: string,
  timestamp: string
}
```

**Outgoing:**
```javascript
{ type: 'message', content: string, messageId: string }
{ type: 'typing_start' }
{ type: 'typing_stop' }
{ type: 'reaction', messageId: string, emoji: string }
{ type: 'message_read', messageId: string }
```

### Calls (/ws/calls/:callId/:userId)

**Incoming:**
```javascript
{
  type: 'participant_joined',
  userId: string,
  status: 'ringing' | 'active',
  timestamp: string
}

{
  type: 'participant_status_changed',
  userId: string,
  status: 'ringing' | 'active' | 'ended',
  timestamp: string
}

{
  type: 'participant_media_changed',
  userId: string,
  audio?: boolean,  // true = unmuted
  video?: boolean,  // true = on
  timestamp: string
}

{
  type: 'webrtc_offer' | 'webrtc_answer' | 'webrtc_ice_candidate',
  from: string,
  data: any
}
```

**Outgoing:**
```javascript
{ type: 'accept_call' }
{ type: 'decline_call' }
{ type: 'end_call' }
{ type: 'mute_audio', muted: boolean }
{ type: 'mute_video', muted: boolean }
{ type: 'share_screen', streamId: string }
{ type: 'stop_screen_share' }
{ type: 'webrtc_offer' | 'webrtc_answer' | 'webrtc_ice_candidate', targetUserId: string, payload: any }
```

## Implementation Checklist

- [ ] Run `npm run db:push`
- [ ] Register routes in server/index.ts
- [ ] Initialize WebSocket servers  
- [ ] Add TeamChatComponent to a page
- [ ] Add TeamCallsComponent to a page
- [ ] Import and use hooks in components
- [ ] Test messaging (create channel, send message)
- [ ] Test calls (initiate, accept, record)
- [ ] Configure SSL/TLS for WSS (production)
- [ ] Set up call recording storage (S3/GCS)
- [ ] Set up transcript generation (Whisper/Google Speech-to-Text)
- [ ] Deploy to production

## Environment Variables

Add to your .env.production:

```bash
# Call Recording Storage
CALL_RECORDING_BUCKET=your-gcs-bucket-name
CALL_RECORDING_PREFIX=call-recordings/

# Transcription Service
TRANSCRIPTION_SERVICE=google  # or 'openai'
GOOGLE_SPEECH_API_KEY=xxx
OPENAI_API_KEY=xxx

# WebSocket Configuration
WS_HEARTBEAT_INTERVAL=30000  # 30s
WS_MAX_CHANNEL_USERS=500
WS_MESSAGE_RATE_LIMIT=20  # per minute
```

## Usage Examples

### Send a Message

```typescript
const { messages, sendMessage } = useMessages(channelId);

const handleSend = async () => {
  try {
    const message = await sendMessage('Hello team!');
    console.log('Message sent:', message.id);
  } catch (err) {
    console.error('Failed to send:', err);
  }
};
```

### Initiate a Call

```typescript
const { initiateCall } = useCalls(teamId);

const handleCall = async () => {
  try {
    const call = await initiateCall(
      ['user-123', 'user-456'],  // recipient IDs
      'video',  // 'voice' or 'video'
      channelId  // (optional) channel to link call to
    );
    console.log('Call initiated:', call.id);
  } catch (err) {
    console.error('Failed to initiate:', err);
  }
};
```

### Join & Accept Call

```typescript
const { call, acceptCall, endCall } = useCallParticipant(callId);

const handleAccept = async () => {
  await acceptCall();  // Updates call status to 'active'
};

const handleEnd = async () => {
  await endCall();  // Ends participant's participation
};
```

### Save Call Recording

```typescript
const { saveRecording } = useCallRecording(callId);

const handleSaveRecording = async (recordingUrl: string) => {
  const recording = await saveRecording(
    recordingUrl,
    120,  // duration in seconds
    5242880  // file size in bytes (5MB)
  );
  console.log('Recording saved:', recording.id);
};
```

## Performance Tips

1. **Pagination**: Always paginate messages with `limit=50` or less
2. **Debouncing**: Typing indicators auto-clear after 3 seconds
3. **Cleanup**: Auto-end empty channels and stale calls
4. **Compression**: Messages are streamed with compression enabled
5. **Caching**: Channel list cached in React state + localStorage

## Troubleshooting

**WebSocket refuses to connect:**
- Check firewall allows WebSocket upgrades
- Verify `/ws/*` paths aren't blocked by reverse proxy
- Ensure CORS headers include WebSocket origins

**Call audio/video not working:**
- Check browser permissions granted
- Verify HTTPS/WSS in production
- Check browser console for WebRTC errors

**Database errors on push:**
- Ensure psql version >= 13 (for UUID gen_random_uuid)
- Check user has CREATE TABLE permissions
- Run migrations in order

**High latency typing:**
- Reduce typing debounce (currently 3s)
- Check network latency with dev tools
- Monitor database connection pool

## Next Steps

1. Add push notifications for missed calls/messages
2. Implement call quality metrics (bitrate, latency, packet loss)
3. Add message encryption end-to-end
4. Implement Slack/Teams integration
5. Build mobile app with React Native
6. Add screen recording capabilities
7. Create call transcription workflow
8. Build analytics dashboard

## Support

For issues or questions, check:
- Database schema: `shared/schema.ts`
- API implementation: `server/routes/team-*-routes.ts`
- WebSocket handlers: `server/routes/*-websocket.ts`
- Components: `client/src/components/Team*.tsx`
- Hooks: `client/src/hooks/useTeamMessagingAndCalls.ts`
