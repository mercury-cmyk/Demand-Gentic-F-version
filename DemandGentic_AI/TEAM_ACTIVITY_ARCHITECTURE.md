# Team Activity Manager - Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (React)                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────┐      ┌──────────────────────────┐    │
│  │ TeamActivityDashboard    │      │ UI Components            │    │
│  │ - Overview Tab           │      │ - Tables                 │    │
│  │ - Activities Tab         │      │ - Charts                 │    │
│  │ - Time Tracking Tab      │      │ - Status Badges          │    │
│  │ - CRM Tab                │      │ - KPI Cards              │    │
│  │ - Communication Tab      │      │                          │    │
│  └──────────────────────────┘      └──────────────────────────┘    │
│                                                                       │
│  ┌──────────────────────────┐      ┌──────────────────────────┐    │
│  │ React Hooks              │      │ Services                 │    │
│  │ - useActivityLogger      │      │ - presenceService        │    │
│  │ - useModuleTimeTracking  │      │ - activityLogger         │    │
│  │ - useCrmInteractionLog   │      │ - (WebSocket client)     │    │
│  │ - usePresence            │      │                          │    │
│  │ - useAutoPresence        │      │                          │    │
│  │ - useActivityDashboard   │      │                          │    │
│  └──────────────────────────┘      └──────────────────────────┘    │
│                                                                       │
└──────────────┬──────────────────────────────────────────────────────┘
               │ REST API + WebSocket
               │
┌──────────────▼──────────────────────────────────────────────────────┐
│                         SERVER (Express)                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────┐                               │
│  │ Socket.io Namespace: /presence   │                               │
│  │                                  │                               │
│  │ ┌─ join(userId, teamId)          │                               │
│  │ ├─ status-change(status)         │                               │
│  │ ├─ active() - heartbeat         │                               │
│  │ ├─ idle() - idle detection      │                               │
│  │ └─ logout()                      │                               │
│  │                                  │                               │
│  │ Emits:                           │                               │
│  │ ├─ user-joined                   │                               │
│  │ ├─ user-status-changed           │                               │
│  │ └─ user-left                     │                               │
│  └──────────────────────────────────┘                               │
│                                                                       │
│  ┌──────────────────────────────────┐                               │
│  │ Express Routes                   │                               │
│  │ /api/team-activity/*             │                               │
│  │                                  │                               │
│  │ ├─ Sessions                      │                               │
│  │ │  ├─ POST /sessions             │                               │
│  │ │  └─ POST /sessions/:id/logout  │                               │
│  │ │                                │                               │
│  │ ├─ Status                        │                               │
│  │ │  ├─ PUT /status                │                               │
│  │ │  └─ GET /team/:teamId/status   │                               │
│  │ │                                │                               │
│  │ ├─ Activities                    │                               │
│  │ │  ├─ POST /log                  │                               │
│  │ │  └─ GET /log/:teamId           │                               │
│  │ │                                │                               │
│  │ ├─ Time Tracking                 │                               │
│  │ │  ├─ POST /time-tracking/start  │                               │
│  │ │  ├─ POST /time-tracking/:id    │                               │
│  │ │  └─ GET /time-tracking/:teamId │                               │
│  │ │                                │                               │
│  │ ├─ CRM Interactions              │                               │
│  │ │  ├─ POST /crm-interaction      │                               │
│  │ │  └─ GET /crm-interaction/:id   │                               │
│  │ │                                │                               │
│  │ └─ Dashboard                     │                               │
│  │    ├─ GET /dashboard/:teamId     │                               │
│  │    └─ GET /summary/:teamId       │                               │
│  └──────────────────────────────────┘                               │
│                                                                       │
│  ┌──────────────────────────────────┐                               │
│  │ Middleware                       │                               │
│  │                                  │                               │
│  │ ├─ activityTrackingMiddleware()  │                               │
│  │ │  └─ Auto-logs module access    │                               │
│  │ │     Tracks time per module     │                               │
│  │ │                                │                               │
│  │ ├─ crmActivityLoggingMiddleware()│                               │
│  │ │  └─ Auto-logs CRM actions      │                               │
│  │ │     (CRUD operations)          │                               │
│  │ │                                │                               │
│  │ └─ activityCleanupMiddleware()   │                               │
│  │    └─ Ends tracking on logout    │                               │
│  └──────────────────────────────────┘                               │
│                                                                       │
└─────────────┬──────────────────────────────────────────────────────┘
              │
              │ SQL Queries (Drizzle ORM)
              │
┌─────────────▼──────────────────────────────────────────────────────┐
│                      PostgreSQL Database                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────┐  ┌──────────────────────┐                │
│  │ user_sessions        │  │ user_status          │                │
│  │ ├─ id                │  │ ├─ userId (unique)   │                │
│  │ ├─ userId           │  │ ├─ status (enum)     │                │
│  │ ├─ sessionToken     │  │ ├─ statusMessage     │                │
│  │ ├─ loginAt          │  │ ├─ lastSeenAt        │                │
│  │ ├─ logoutAt         │  │ └─ updatedAt         │                │
│  │ └─ isActive         │  └──────────────────────┘                │
│  └──────────────────────┘                                           │
│                                                                       │
│  ┌──────────────────────┐  ┌──────────────────────┐                │
│  │team_member_activity  │  │module_time_tracking  │                │
│  │ ├─ id                │  │ ├─ id                │                │
│  │ ├─ userId           │  │ ├─ userId           │                │
│  │ ├─ teamId           │  │ ├─ teamId           │                │
│  │ ├─ module           │  │ ├─ module           │                │
│  │ ├─ activityType     │  │ ├─ startTime        │                │
│  │ ├─ entityId         │  │ ├─ endTime          │                │
│  │ ├─ description      │  │ ├─ totalSeconds     │                │
│  │ ├─ metadata         │  │ └─ isActive         │                │
│  │ └─ createdAt        │  └──────────────────────┘                │
│  └──────────────────────┘                                           │
│                                                                       │
│  ┌──────────────────────┐  ┌──────────────────────┐                │
│  │crm_interaction_log   │  │activity_summary      │                │
│  │ ├─ id                │  │ ├─ id                │                │
│  │ ├─ userId           │  │ ├─ userId           │                │
│  │ ├─ interactionType  │  │ ├─ date (daily)      │                │
│  │ ├─ entityType       │  │ ├─ loginCount        │                │
│  │ ├─ entityName       │  │ ├─ sessionCount      │                │
│  │ ├─ outcome          │  │ ├─ moduleBreakdown   │                │
│  │ ├─ duration         │  │ └─ topModules        │                │
│  │ └─ createdAt        │  └──────────────────────┘                │
│  └──────────────────────┘                                           │
│                                                                       │
│  ┌──────────────────────┐                                           │
│  │communication_log     │                                           │
│  │ ├─ id                │                                           │
│  │ ├─ senderId         │                                           │
│  │ ├─ receiverId       │                                           │
│  │ ├─ type             │                                           │
│  │ ├─ subject          │                                           │
│  │ ├─ content          │                                           │
│  │ ├─ isRead           │                                           │
│  │ └─ createdAt        │                                           │
│  └──────────────────────┘                                           │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Login Flow

```
User Opens App
      │
      ▼
    Click Login
      │
      ▼
POST /api/auth/login
      │
      ▼
  Create Session
  user_sessions table
      │
      ▼
  Update user_status
  status = "online"
      │
      ▼
  WebSocket Connect
      │
      ▼
socket.emit("join", {userId, teamId})
      │
      ▼
Presence Namespace
  Updates in-memory map
      │
      ▼
Broadcast "user-joined"
  to team members
      │
      ▼
Team Members See User Online
```

### Activity Logging Flow

```
User Navigates to Module
      │
      ▼
activityTrackingMiddleware
  fires
      │
      ▼
Check if tracking this
  module already
      │
      ├─ No → Start new tracking
      │        Insert into
      │        module_time_tracking
      │
      └─ Yes → Continue existing
      │
      ▼
User Performs Action
(create/edit/delete)
      │
      ▼
logger.log() called
      │
      ▼
  Insert into
  team_member_activity
      │
      ▼
  Fetch returns
      │
      ▼
Dashboard Updates
  (via polling or WebSocket)
```

### Dashboard Data Flow

```
User Opens Dashboard
      │
      ▼
TeamActivityDashboard mounts
      │
      ▼
fetch("/api/team-activity/dashboard/:teamId")
      │
      ▼
Server Aggregates:
  │
  ├─ user_status
  │   └─ Get all team member status
  │
  ├─ team_member_activity
  │   └─ Count by activityType
  │
  ├─ module_time_tracking
  │   └─ Sum seconds by module
  │
  └─ crm_interaction_log
      └─ Count by type
      │
      ▼
Return aggregated data
      │
      ▼
render() charts & tables
      │
      ▼
  Poll every 30s for updates
  (or use WebSocket for real-time)
      │
      ▼
User sees updated dashboard
```

---

## Component Integration Points

```
Existing CRM Routes
      │
      ├─ /api/campaigns
      │  └─ activityTrackingMiddleware("campaigns")
      │
      ├─ /api/contacts
      │  └─ activityTrackingMiddleware("contacts")
      │
      ├─ /api/emails
      │  └─ activityTrackingMiddleware("emails")
      │
      └─ /api/crm/*
         └─ crmActivityLoggingMiddleware()

App.tsx / Layout Component
      │
      ├─ useAutoPresence hook
      │  └─ Auto track status
      │
      ├─ presenceService.join()
      │  └─ Join presence namespace
      │
      └─ presenceService.listen()
         └─ Listen for updates

Page / Feature Component
      │
      ├─ useActivityLogger
      │  └─ Log specific actions
      │
      ├─ useModuleTimeTracking
      │  └─ Track time in feature
      │
      └─ useCrmInteractionLogger
         └─ Log CRM interactions

Navigation / Admin Area
      │
      └─ 
         └─ Display analytics
```

---

## Technology Stack

```
Frontend:
├─ React (UI)
├─ TypeScript (Type Safety)
├─ Recharts (Charts)
├─ Socket.io-client (Real-time)
└─ shadcn/ui (Components)

Backend:
├─ Express (Framework)
├─ TypeScript (Type Safety)
├─ Drizzle ORM (Database)
├─ Socket.io (Real-time)
└─ JSON (Data Format)

Database:
├─ PostgreSQL (Primary)
├─ Drizzle Schema (ORM)
└─ Indexes (Performance)

DevOps:
├─ npm (Package Manager)
└─ Migrations (Schema Migration)
```

---

## Real-time Update Flow

```
User 1 Changes Status
      │
      ▼
socket.emit("status-change")
      │
      ▼
Presence Namespace receives
      │
      ▼
Updates user_status table
      │
      ▼
Broadcasts "user-status-changed"
      │
      ├─ To User 1
      │
      └─ To all Team Members
         │
         ├─ Dashboard listening
         │  └─ Updates UI
         │
         └─ Team List Component
            └─ Updates status badge
```

---

## Performance Optimization

```
Frontend:
├─ Component memoization
├─ Virtual scrolling for lists
├─ Request batching
└─ Polling vs WebSocket

Backend:
├─ Database indexes
├─ Query optimization
├─ Async logging
└─ Connection pooling

Database:
├─ Table indexes
├─ Query plans
├─ Data archival
└─ Partitioning (future)
```

---

## Error Handling

```
Activity Logging Fails
      │
      ├─ Async logging → Non-blocking
      │  └─ Continue user action
      │
      └─ Log to console
         └─ Fail gracefully

WebSocket Disconnect
      │
      ├─ Mark user as offline
      │  └─ Update user_status
      │
      └─ Clients reconnect
         └─ Rejoin presence

DB Connection Lost
      │
      └─ Retry logic
         └─ Circuit breaker
```

---

This architecture enables:
✅ Real-time team activity visibility
✅ Automatic action tracking
✅ Time allocation monitoring
✅ Rich analytics & reporting
✅ Scalable design
✅ Non-blocking operations