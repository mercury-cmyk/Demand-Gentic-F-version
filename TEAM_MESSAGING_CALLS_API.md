# Team Messaging & Calls System - Complete API Documentation

## Table of Contents
1. [Authentication](#authentication)
2. [Channels API](#channels-api)
3. [Messages API](#messages-api)
4. [Calls API](#calls-api)
5. [Recordings & Transcripts](#recordings--transcripts)
6. [Error Handling](#error-handling)
7. [Rate Limiting](#rate-limiting)

---

## Authentication

All endpoints require Bearer token in Authorization header:

```
Authorization: Bearer {token}
```

---

## Channels API

### Get All Channels

**Endpoint:** `GET /api/team-messaging/channels/:teamId`

**Parameters:**
- `teamId` (path) - Team ID

**Response:**
```json
{
  "channels": [
    {
      "id": "ch_123",
      "teamId": "team_456",
      "name": "general",
      "description": "General discussion",
      "channelType": "general",
      "isActive": true,
      "isArchived": false,
      "createdById": "user_789",
      "memberCount": 12,
      "unreadCount": 3,
      "createdAt": "2026-03-01T10:00:00Z",
      "updatedAt": "2026-03-04T15:30:00Z"
    }
  ]
}
```

### Create Channel

**Endpoint:** `POST /api/team-messaging/channels`

**Body:**
```json
{
  "teamId": "team_456",
  "name": "marketing",
  "description": "Marketing team discussions",
  "channelType": "private",
  "memberIds": ["user_123", "user_456"]
}
```

**Response:**
```json
{
  "channel": {
    "id": "ch_new",
    "teamId": "team_456",
    "name": "marketing",
    "channelType": "private",
    "createdById": "user_789",
    "isActive": true,
    "createdAt": "2026-03-04T16:00:00Z",
    "updatedAt": "2026-03-04T16:00:00Z"
  }
}
```

### Get Channel Details

**Endpoint:** `GET /api/team-messaging/channels/:channelId/details`

**Response:**
```json
{
  "channel": {
    "id": "ch_123",
    "name": "general",
    "description": "General discussion",
    "channelType": "general",
    "memberCount": 12
  },
  "members": [
    {
      "id": "cm_123",
      "channelId": "ch_123",
      "userId": "user_789",
      "role": "owner",
      "lastReadAt": "2026-03-04T15:00:00Z",
      "isMuted": false,
      "joinedAt": "2026-03-01T10:00:00Z",
      "user": {
        "id": "user_789",
        "name": "John Doe",
        "avatar": "https://..."
      }
    }
  ]
}
```

### Update Channel

**Endpoint:** `PUT /api/team-messaging/channels/:channelId`

**Body:**
```json
{
  "name": "general-chat",
  "description": "Updated description",
  "metadata": { "color": "#0066CC" }
}
```

**Response:** Updated channel object

---

## Messages API

### Send Message

**Endpoint:** `POST /api/team-messaging/messages`

**Body:**
```json
{
  "channelId": "ch_123",
  "content": "Hello team!",
  "messageType": "text",
  "parentMessageId": null,
  "attachmentIds": ["file_123", "file_456"]
}
```

**Response:**
```json
{
  "message": {
    "id": "msg_789",
    "channelId": "ch_123",
    "senderId": "user_789",
    "content": "Hello team!",
    "messageType": "text",
    "reactions": {},
    "createdAt": "2026-03-04T16:15:00Z",
    "sender": {
      "id": "user_789",
      "name": "John Doe",
      "avatar": "https://..."
    }
  }
}
```

### Get Messages

**Endpoint:** `GET /api/team-messaging/messages/:channelId`

**Query Parameters:**
- `limit` - Number of messages (default: 50, max: 200)
- `offset` - Pagination offset (default: 0)

**Response:**
```json
{
  "messages": [
    {
      "id": "msg_789",
      "channelId": "ch_123",
      "senderId": "user_789",
      "content": "Hello team!",
      "messageType": "text",
      "createdAt": "2026-03-04T16:15:00Z",
      "editedAt": null,
      "reactions": {
        "👍": ["user_123", "user_456"],
        "❤️": ["user_123"]
      },
      "isPinned": false,
      "readCount": 8,
      "sender": {
        "id": "user_789",
        "name": "John Doe"
      }
    }
  ],
  "total": 150
}
```

### Edit Message

**Endpoint:** `PUT /api/team-messaging/messages/:messageId`

**Body:**
```json
{
  "content": "Updated message content"
}
```

**Requirements:**
- User must be the message sender
- Only content can be edited (cannot change attachments)

### Delete Message

**Endpoint:** `DELETE /api/team-messaging/messages/:messageId`

**Requirements:**
- User must be the message sender or channel admin

### Mark as Read

**Endpoint:** `POST /api/team-messaging/messages/:messageId/read`

**Response:**
```json
{
  "success": true
}
```

### Add Reaction

**Endpoint:** `POST /api/team-messaging/messages/:messageId/reactions`

**Body:**
```json
{
  "emoji": "👍"
}
```

**Response:**
```json
{
  "message": {
    "id": "msg_789",
    "reactions": {
      "👍": ["user_789", "user_123"]
    }
  }
}
```

---

## Channel Members API

### Add Member to Channel

**Endpoint:** `POST /api/team-messaging/channels/:channelId/members`

**Body:**
```json
{
  "userId": "user_123"
}
```

**Response:**
```json
{
  "member": {
    "id": "cm_new",
    "channelId": "ch_123",
    "userId": "user_123",
    "role": "member",
    "joinedAt": "2026-03-04T16:30:00Z"
  }
}
```

**Requirements:**
- Requester must be channel owner or admin
- User must not already be a member

### Remove Member from Channel

**Endpoint:** `DELETE /api/team-messaging/channels/:channelId/members/:userId`

**Requirements:**
- Requester must be channel owner or admin
- Cannot remove channel owner

---

## Search API

### Search Messages & Channels

**Endpoint:** `GET /api/team-messaging/search`

**Query Parameters:**
- `q` - Search query (required)
- `teamId` - Filter by team (required)
- `type` - Search type: 'all', 'messages', 'channels' (optional)

**Response:**
```json
{
  "channels": [
    { "channel": { "id": "ch_123", "name": "marketing" } }
  ],
  "messages": [
    {
      "message": { "id": "msg_789", "content": "..." },
      "sender": { "id": "user_789", "name": "John Doe" }
    }
  ]
}
```

---

## Calls API

### Initiate a Call

**Endpoint:** `POST /api/team-calls/calls/initiate`

**Body:**
```json
{
  "teamId": "team_456",
  "recipientIds": ["user_123", "user_456"],
  "callType": "voice",
  "channelId": "ch_123"
}
```

**Response:**
```json
{
  "call": {
    "id": "call_789",
    "teamId": "team_456",
    "initiatorId": "user_789",
    "recipientIds": ["user_123", "user_456"],
    "callType": "voice",
    "status": "ringing",
    "startTime": null,
    "createdAt": "2026-03-04T16:45:00Z"
  },
  "callId": "call_789"
}
```

### Accept Call

**Endpoint:** `POST /api/team-calls/calls/:callId/accept`

**Response:**
```json
{
  "participant": {
    "id": "cp_123",
    "callId": "call_789",
    "userId": "user_789",
    "status": "active",
    "joinTime": "2026-03-04T16:46:00Z"
  }
}
```

### Decline Call

**Endpoint:** `POST /api/team-calls/calls/:callId/decline`

### End Call

**Endpoint:** `POST /api/team-calls/calls/:callId/end`

**Calculates:**
- Participant duration (leave_time - join_time)
- Call duration (when all participants have left)
- Updates call status to 'ended'

### Get Call Details

**Endpoint:** `GET /api/team-calls/calls/:callId`

**Response:**
```json
{
  "call": {
    "id": "call_789",
    "teamId": "team_456",
    "initiatorId": "user_789",
    "status": "active",
    "startTime": "2026-03-04T16:46:00Z",
    "callDuration": null,
    "recordingId": "rec_123"
  },
  "participants": [
    {
      "id": "cp_123",
      "userId": "user_789",
      "status": "active",
      "joinTime": "2026-03-04T16:46:00Z",
      "leaveTime": null,
      "participationDuration": null,
      "mediaEnabled": { "audio": true, "video": false },
      "user": {
        "id": "user_789",
        "name": "John Doe"
      }
    }
  ],
  "recording": { "id": "rec_123", "recordingUrl": "..." }
}
```

---

## Call History API

### Get Team Call History

**Endpoint:** `GET /api/team-calls/calls/history/:teamId`

**Query Parameters:**
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset (default: 0)
- `userId` - Filter by initiator (optional)
- `status` - Filter by status: 'ringing', 'active', 'missed', 'declined', 'ended' (optional)

**Response:**
```json
{
  "calls": [
    {
      "id": "call_789",
      "initiatorId": "user_789",
      "status": "ended",
      "startTime": "2026-03-04T16:46:00Z",
      "endTime": "2026-03-04T16:56:00Z",
      "callDuration": 600,
      "participantCount": 3,
      "initiator": { "id": "user_789", "name": "John Doe" }
    }
  ],
  "total": 145
}
```

### Get User's Calls

**Endpoint:** `GET /api/team-calls/calls/user/:userId`

**Query Parameters:**
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset (default: 0)

### Get Call Statistics

**Endpoint:** `GET /api/team-calls/calls/stats/:teamId`

**Query Parameters:**
- `days` - Look back period (default: 30)

**Response:**
```json
{
  "summary": {
    "totalCalls": 145,
    "avgDuration": 480,
    "activeCalls": 2
  },
  "byStatus": [
    { "status": "active", "count": 2 },
    { "status": "ended", "count": 138 },
    { "status": "declined", "count": 5 }
  ],
  "topInitiators": [
    {
      "user": { "id": "user_789", "name": "John Doe" },
      "callCount": 34
    }
  ]
}
```

---

## Recordings & Transcripts

### Save Call Recording

**Endpoint:** `POST /api/team-calls/calls/:callId/recording`

**Body:**
```json
{
  "recordingUrl": "https://storage.googleapis.com/bucket/call_123.mp3",
  "recordingDuration": 600,
  "fileSize": 5242880,
  "format": "mp3"
}
```

**Response:**
```json
{
  "recording": {
    "id": "rec_123",
    "callId": "call_789",
    "recordingUrl": "...",
    "recordingDuration": 600,
    "fileSize": "5242880",
    "format": "mp3",
    "isPublic": false,
    "downloadCount": 0,
    "createdAt": "2026-03-04T17:00:00Z"
  }
}
```

### Get Call Recording

**Endpoint:** `GET /api/team-calls/calls/:callId/recording`

### Save Call Transcript

**Endpoint:** `POST /api/team-calls/calls/:callId/transcript`

**Body:**
```json
{
  "transcriptText": "Speaker 1: Hello, how are you? Speaker 2: Good, thanks!",
  "transcriptJson": [
    {
      "speaker": "user_789",
      "text": "Hello, how are you?",
      "timeStart": 0,
      "timeEnd": 3
    },
    {
      "speaker": "user_123",
      "text": "Good, thanks!",
      "timeStart": 3,
      "timeEnd": 5
    }
  ],
  "summary": "Pleasant greeting between two team members",
  "keyPoints": ["Greeting", "Health check"],
  "sentiment": "positive"
}
```

**Response:**
```json
{
  "transcript": {
    "id": "trans_123",
    "callId": "call_789",
    "transcriptText": "...",
    "summary": "...",
    "keyPoints": [...],
    "sentiment": "positive",
    "isPublic": false
  }
}
```

### Get Call Transcript

**Endpoint:** `GET /api/team-calls/calls/:callId/transcript`

---

## Error Handling

### Error Response Format

```json
{
  "message": "Error description",
  "code": "ERROR_CODE",
  "status": 400
}
```

### Common Errors

| Code | Status | Description |
|------|--------|-------------|
| UNAUTHORIZED | 401 | Missing or invalid token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource already exists |
| VALIDATION_ERROR | 400 | Invalid input data |
| CHANNEL_FULL | 400 | Channel member limit reached |
| USER_NOT_MEMBER | 403 | User is not channel member |
| CALL_ENDED | 400 | Cannot modify ended call |

### Example Error Response

```json
{
  "message": "User is not a member of this channel",
  "code": "USER_NOT_MEMBER",
  "status": 403
}
```

---

## Rate Limiting

Applied per user:

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Messages | 60 | 1 minute |
| Reactions | 100 | 1 minute |
| Channel Creation | 10 | 1 hour |
| File Uploads | 100 | 1 hour |
| Call Initiation | 50 | 1 hour |

**Headers in Response:**
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1678020360
```

**Rate Limit Exceeded (429):**
```json
{
  "message": "Too many requests. Try again in 45 seconds.",
  "retryAfter": 45
}
```

---

## Pagination

Standard pagination across list endpoints:

```
GET /api/endpoint?limit=50&offset=100
```

- `limit` - Items per page (default: 50, max: 200)
- `offset` - Start position (default: 0)

**Response includes:**
```json
{
  "data": [...],
  "total": 500,
  "limit": 50,
  "offset": 100
}
```

---

## Best Practices

1. **Batch Operations**: Fetch related data together (e.g., channel + members)
2. **Caching**: Cache channel list as it changes infrequently
3. **Pagination**: Always paginate messages, never fetch all at once
4. **Error Recovery**: Implement exponential backoff for retries
5. **Cleanup**: Auto-disconnect WebSocket on page leave
6. **Timestamps**: Use ISO 8601 for all dates
7. **Compression**: Enable gzip/brotli for API responses
