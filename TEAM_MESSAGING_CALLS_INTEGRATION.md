# Team Messaging & Calls System - Integration Checklist

Complete step-by-step guide to integrate messaging and calls into your CRM.

## Phase 1: Database Setup (5 minutes)

- [ ] **Run database migration**
  ```bash
  npm run db:push
  ```
  
  Verify tables created:
  - `chat_channels`
  - `chat_messages`
  - `channel_members`
  - `message_read_receipts`
  - `voice_calls`
  - `call_participants`
  - `call_recordings`
  - `call_transcripts`
  - `file_uploads`

- [ ] **Test database connection**
  ```sql
  SELECT COUNT(*) FROM chat_channels;
  SELECT COUNT(*) FROM voice_calls;
  ```

---

## Phase 2: Backend Routes & WebSocket (10 minutes)

### Step 1: Register API Routes

Edit `server/index.ts` (find the route registration section):

```typescript
// Add imports at top
import teamMessagingRoutes from './routes/team-messaging-routes';
import teamCallsRoutes from './routes/team-calls-routes';

// In registerRoutes() or where other routes are mounted:
app.use('/api/team-messaging', requireAuth, teamMessagingRoutes);
app.use('/api/team-calls', requireAuth, teamCallsRoutes);
```

### Step 2: Initialize WebSocket Servers

In your server startup (after creating HTTP server):

```typescript
// Add imports
import { initializeChatWebSocket } from './routes/chat-websocket';
import { initializeCallsWebSocket } from './routes/calls-websocket';

// In the startup code (after server.listen()):
const chatWss = initializeChatWebSocket(server);
const callsWss = initializeCallsWebSocket(server);

console.log('✓ Chat WebSocket initialized at /ws/chat');
console.log('✓ Calls WebSocket initialized at /ws/calls');
```

- [ ] Routes registered
- [ ] WebSocket servers initialized
- [ ] No console errors on startup

### Step 3: Test Backend

```bash
# Start server
npm run dev

# In another terminal, test API
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/team-messaging/channels/team-123

# Should return: {"channels": [...]}
```

- [ ] API endpoints responding
- [ ] WebSocket connections accepted (check browser DevTools)

---

## Phase 3: Frontend Components (10 minutes)

### Step 1: Add Chat Component

Create or edit a page that will show the chat:

```typescript
// pages/messaging.tsx (or wherever)
'use client';

import { TeamChatComponent } from '@/components/TeamChatComponent';

export default function MessagingPage() {
  const teamId = 'team-123'; // Get from auth/params
  
  return (
    <div className="h-screen">
      <TeamChatComponent teamId={teamId} />
    </div>
  );
}
```

### Step 2: Add Calls Component

Create or edit a page for calls:

```typescript
// pages/calls.tsx
'use client';

import { TeamCallsComponent } from '@/components/TeamCallsComponent';

export default function CallsPage() {
  const teamId = 'team-123';
  
  return (
    <div className="h-screen">
      <TeamCallsComponent teamId={teamId} />
    </div>
  );
}
```

### Step 3: Add Navigation

Link to chat/calls pages in your main navigation:

```typescript
<nav>
  <Link href="/messaging">💬 Messages</Link>
  <Link href="/calls">📞 Calls</Link>
</nav>
```

- [ ] Chat page created and accessible
- [ ] Calls page created and accessible
- [ ] Navigation links working
- [ ] Components load without errors

---

## Phase 4: Functional Testing (10 minutes)

### Test Messaging

1. **Create a channel:**
   - Open messaging page
   - Click "+ New Channel"
   - Enter name: "test-channel"
   - Verify channel appears in sidebar

2. **Send a message:**
   - Select the test channel
   - Type: "Hello team!"
   - Click send
   - Verify message appears

3. **Test real-time updates:**
   - Open chat in 2 browser tabs
   - Send message in tab 1
   - Verify message appears in tab 2 within 1 second

4. **Test reactions:**
   - Hover over a message
   - Click emoji icon
   - Select 👍
   - Verify reaction appears on message

### Test Calls

1. **View call history:**
   - Open calls page
   - Verify list of recent calls loads

2. **View call details:**
   - Click on a call entry
   - Verify participant info displays
   - Check call duration calculation

3. **Test call stats:**
   - Check dashboard for average duration
   - Verify top callers listed

**Testing Checklist:**
- [ ] Create channel successfully
- [ ] Send and receive messages in real-time
- [ ] Typing indicator shows (watch for "User is typing...")
- [ ] Message reactions work
- [ ] Call history displays
- [ ] Call details show participants
- [ ] No WebSocket connection errors

---

## Phase 5: Advanced Features (15 minutes)

### Step 1: Add Hooks to Existing Components

Integrate messaging/calls into your existing CRM components:

```typescript
// In your campaign page or contact page
import { 
  useMessages, 
  useCalls,
  useChannels 
} from '@/hooks/useTeamMessagingAndCalls';

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const teamId = useTeamId(); // Get from context
  
  // Get campaign discussion channel
  const { channels } = useChannels(teamId);
  const campaignChannel = channels.find(c => c.name === `campaign-${campaignId}`);
  
  const { messages, sendMessage } = useMessages(campaignChannel?.id);
  
  return (
    <div>
      {/* Campaign details */}
      <div className="mt-4">
        <h3>Team Discussion</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {messages.map(msg => (
            <div key={msg.id}>
              <strong>{msg.sender.name}:</strong> {msg.content}
            </div>
          ))}
        </div>
        <form onSubmit={e => {
          e.preventDefault();
          sendMessage(messageInput);
          setMessageInput('');
        }}>
          <input
            value={messageInput}
            onChange={e => setMessageInput(e.target.value)}
            placeholder="Add comment..."
          />
          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  );
}
```

### Step 2: Add Call Button to Contact Page

```typescript
// In your contact detail page
const { initiateCall } = useCalls(teamId);

<button onClick={() => {
  initiateCall([contactId], 'voice');
}}>
  📞 Call Contact
</button>
```

### Step 3: Auto-Create Project Channels

Create a channel for each campaign/project:

```typescript
// In campaign creation
const { createChannel } = useChannels(teamId);

const createCampaign = async (name: string) => {
  // Create campaign
  const campaign = await createCampaign(name);
  
  // Auto-create discussion channel
  const channel = await createChannel(
    `campaign-${campaign.id}`,
    `Discussion for ${name}`,
    'private'
  );
  
  // Link to campaign in DB
  await linkCampaignChannel(campaign.id, channel.id);
};
```

**Advanced Features Checklist:**
- [ ] Messaging integrated into campaigns/contacts
- [ ] Call button available on contacts
- [ ] Auto-created channels for projects
- [ ] Real-time updates in embedded components
- [ ] Call notifications working

---

## Phase 6: Production Deployment (15 minutes)

### Step 1: Environment Configuration

Add to `.env.production`:

```bash
# WebSocket Configuration
WS_HEARTBEAT_INTERVAL=30000
WS_MAX_CONNECTIONS_PER_CHANNEL=500
WS_MESSAGE_RATE_LIMIT=20

# Call Recording (if using GCS)
CALL_RECORDING_BUCKET=your-bucket
CALL_RECORDING_PREFIX=call-recordings/
GCS_SERVICE_ACCOUNT_KEY=/etc/secrets/gcs-key.json

# Transcription Service
TRANSCRIPTION_SERVICE=google
GOOGLE_SPEECH_API_KEY=xxx

# Messaging
MESSAGE_RETENTION_DAYS=90
MAX_MESSAGE_SIZE_BYTES=10485760
```

### Step 2: SSL/TLS for WSS

Ensure HTTPS/WSS in production:

```typescript
// server/index.ts
const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

// browser client connects via WSS
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//...`);
```

### Step 3: Database Optimization

Run in production database:

```sql
-- Create additional indexes for query performance
CREATE INDEX CONCURRENTLY idx_messages_channel_created 
  ON chat_messages(channel_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_calls_team_created 
  ON voice_calls(team_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_participants_call_status
  ON call_participants(call_id, status);
```

### Step 4: Monitoring Setup

Add logging for production:

```typescript
// Log messaging metrics
import { logger } from './log';

// In message routes
logger.info('Message sent', {
  messageId,
  channelId,
  size: content.length,
});

// In call routes
logger.info('Call initiated', {
  callId,
  participantCount: recipientIds.length,
  callType,
});
```

### Step 5: Deployment

```bash
# Build and deploy
npm run build

# If using Cloud Run / Cloud Deployment
gcloud run deploy demandgentic-voice \
  --source . \
  --region us-central1 \
  --set-env-vars WS_MAX_CONNECTIONS_PER_CHANNEL=500
```

**Production Checklist:**
- [ ] Environment variables configured
- [ ] SSL/TLS enabled (HTTPS/WSS)
- [ ] Database indexes created
- [ ] Logging configured
- [ ] Backups enabled
- [ ] Monitoring alerts set up
- [ ] Rate limiting active
- [ ] Message retention policy set

---

## Phase 7: Post-Launch Optimization (Ongoing)

### Analytics

Track usage metrics:

```typescript
// Log messaging activity for analytics
const logMetrics = async () => {
  const stats = await fetch('/api/team-calls/calls/stats/team-123');
  console.log('Call stats:', stats);
};

// Monitor in dashboards
const dashboardMetrics = {
  dailyMessages: 1250,
  dailyCalls: 34,
  avgCallDuration: 480,
  activeUsers: 28,
};
```

### Performance

Monitor WebSocket connections:

```typescript
// Track connection quality
ws.addEventListener('open', () => {
  const latency = Date.now() - sentTime;
  metrics.wsLatency = latency;
});

// Monitor message delivery
const sendMessageWithTracking = async (content) => {
  const startTime = Date.now();
  await sendMessage(content);
  metrics.messageDeliveryTime = Date.now() - startTime;
};
```

### User Feedback

Create feedback channel:

```bash
# Create feedback channel for improvements
POST /api/team-messaging/channels
{
  "teamId": "team-123",
  "name": "messaging-feedback",
  "channelType": "private"
}
```

**Optimization Checklist:**
- [ ] Monitor WebSocket latency
- [ ] Track message delivery times
- [ ] Monitor database query performance
- [ ] Set up error alerts
- [ ] Collect user feedback
- [ ] Plan feature improvements
- [ ] Schedule database maintenance

---

## Troubleshooting

### WebSocket Won't Connect
- Check firewall allows WebSocket upgrades
- Verify `wss://` in production (not `ws://`)
- Check browser console for specific errors
- Verify `Authorization` header included

### Messages Not Showing in Real-Time
- Check WebSocket connection status
- Verify both users in same channel
- Check browser DevTools Network tab
- Examine server logs for errors

### Call Recording Not Saving
- Verify GCS bucket permissions
- Check recording URL is accessible
- Verify file size not exceeding limits
- Check storage service credentials

### High WebSocket Latency
- Check network connection quality
- Monitor server CPU and memory
- Check database connection pool
- Reduce typing indicator frequency

---

## Support & Escalation

If issues persist:

1. **Check logs:**
   ```bash
   npm run logs  # View server logs
   ```

2. **Database health:**
   ```sql
   SELECT * FROM pg_stat_statements ORDER BY query_time DESC LIMIT 5;
   ```

3. **WebSocket diagnostics:**
   - Open DevTools → Network
   - Filter by "WS"
   - Check frames and latency

4. **Contact support:**
   - Attach error logs
   - Include affected user IDs
   - Note exact reproduction steps

---

## Success Criteria

✅ All phases completed when:

- Employees can chat across teams
- Voice calls functional with recordings
- Messages load in <500ms
- WebSocket connections stable
- Call history accessible
- Search working on messages
- No errors in production logs
- User adoption >60% within 2 weeks
