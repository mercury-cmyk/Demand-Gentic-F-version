# Team Activity Manager - Integration Checklist

## Quick Start

Complete these steps to integrate the Team Activity Manager into your CRM platform.

---

## Phase 1: Database Setup

- [ ] **Run Migration** - The schema has been updated with new tables:
  - `user_sessions` - User login/logout tracking
  - `user_status` - Real-time online/offline status
  - `team_member_activity` - Activity logging
  - `module_time_tracking` - Module time tracking
  - `activity_summary` - Daily activity summaries
  - `crm_interaction_log` - CRM interaction tracking
  - `communication_log` - Team communication logging

  Run: `npm run db:push` to apply schema changes

- [ ] **Verify Table Creation** - Check PostgreSQL for new tables

---

## Phase 2: Backend Integration

### 2.1 Register API Routes

**File**: `server/index.ts` or `server/routes.ts`

```typescript
import teamActivityRoutes from "./routes/team-activity-routes";

// Add this line near other route registrations
app.use("/api/team-activity", requireAuth, teamActivityRoutes);
```

- [ ] Routes registered

### 2.2 Initialize WebSocket for Real-time Presence

**File**: `server/index.ts`

```typescript
import { Server } from "socket.io";
import { initializePresenceTracking } from "./routes/team-activity-presence";

// Create Socket.io server if not already created
const io = new Server(app, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Initialize presence tracking
initializePresenceTracking(io);

// Make io accessible to other routes if needed
app.set("io", io);
```

- [ ] WebSocket initialized
- [ ] CORS configured correctly

### 2.3 Add Activity Tracking Middleware

**File**: Update your route definitions

```typescript
import { 
  activityTrackingMiddleware,
  crmActivityLoggingMiddleware,
  activityCleanupMiddleware 
} from "./middleware/activity-tracking";

// Add middleware to specific routes
// Time tracking for module access
app.use("/api/campaigns", activityTrackingMiddleware("campaigns"));
app.use("/api/contacts", activityTrackingMiddleware("contacts"));
app.use("/api/leads", activityTrackingMiddleware("leads"));
app.use("/api/emails", activityTrackingMiddleware("emails"));
app.use("/api/reports", activityTrackingMiddleware("reports"));

// CRM activity logging
app.use("/api/crm", crmActivityLoggingMiddleware);

// Cleanup middleware (should be last)
app.use(activityCleanupMiddleware());
```

- [ ] Middleware added to relevant routes
- [ ] Tested with sample requests

### 2.4 Environment Variables

**File**: `.env`

```
# Socket.io configuration
SOCKET_IO_ENABLED=true
CLIENT_URL=http://localhost:3000
```

- [ ] Environment variables configured

---

## Phase 3: Frontend Integration

### 3.1 Create Presence Service

**File**: `client/src/services/presenceService.ts` (create new file)

```typescript
import io from "socket.io-client";

const socket = io(process.env.REACT_APP_API_URL + "/presence", {
  auth() {
    return {
      token: localStorage.getItem("token"),
    };
  },
});

export const presenceService = {
  join: (userId: string, teamId: string, username: string) => {
    socket.emit("join", { userId, teamId, username });
  },

  updateStatus: (userId: string, status: string, teamId: string) => {
    socket.emit("status-change", { userId, status, teamId });
  },

  signalActive: (userId: string, teamId: string) => {
    socket.emit("active", { userId, teamId });
  },

  logout: (userId: string, teamId: string) => {
    socket.emit("logout", { userId, teamId });
  },

  onStatusChange: (callback: (data: any) => void) => {
    socket.on("user-status-changed", callback);
  },

  onUserJoined: (callback: (data: any) => void) => {
    socket.on("user-joined", callback);
  },

  onUserLeft: (callback: (data: any) => void) => {
    socket.on("user-left", callback);
  },

  disconnect: () => {
    socket.disconnect();
  },
};
```

- [ ] Presence service created

### 3.2 Add Hooks for Activity Tracking

**File**: `client/src/hooks/useActivityTracking.ts`

- [ ] File already created with hooks:
  - `useActivityLogger` - Log activities
  - `useModuleTimeTracking` - Track time in modules
  - `useCrmInteractionLogger` - Log CRM interactions
  - `usePresence` - Manage user presence
  - `useAutoPresence` - Automatic presence tracking
  - `useCommunicationLogger` - Log communications
  - `useActivityDashboard` - Fetch dashboard data

### 3.3 Create Activity Logger Utility

**File**: `client/src/utils/activityLogger.ts` (create new file)

```typescript
export async function logActivity(
  teamId: string,
  activityType: string,
  module: string,
  options?: {
    entityType?: string;
    entityId?: string;
    entityName?: string;
    description?: string;
    metadata?: any;
    duration?: number;
  }
) {
  try {
    const response = await fetch("/api/team-activity/log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        teamId,
        activityType,
        module,
        ...options,
      }),
    });

    if (!response.ok) {
      console.error("Failed to log activity:", response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error logging activity:", error);
    return null;
  }
}
```

- [ ] Activity logger utility created

### 3.4 Add Dashboard Component

**File**: `client/src/components/TeamActivityDashboard.tsx`

- [ ] File already created with:
  - Overview (team status, time by module)
  - Activities tab
  - Time tracking tab
  - CRM interactions tab
  - Communication tab

### 3.5 Integrate Dashboard in Routes

**File**: `client/src/pages/TeamActivity.tsx` (create new page)

```typescript
import React from "react";
import TeamActivityDashboard from "@/components/TeamActivityDashboard";
import { useAuth } from "@/hooks/useAuth";

export default function TeamActivityPage() {
  const { user } = useAuth();
  const teamId = user?.currentTeamId; // or however you get this

  if (!teamId) {
    return <div>Team not selected</div>;
  }

  return <TeamActivityDashboard teamId={teamId} />;
}
```

- [ ] Dashboard page created
- [ ] Route added to navigation

### 3.6 Initialize Presence on App Load

**File**: `client/src/App.tsx` or `client/src/layouts/MainLayout.tsx`

```typescript
import { useEffect } from "react";
import { presenceService } from "@/services/presenceService";
import { useAuth } from "@/hooks/useAuth";

function App() {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id && user?.currentTeamId) {
      // Join presence
      presenceService.join(user.id, user.currentTeamId, user.username);

      // Set up periodic activity signals
      const interval = setInterval(() => {
        presenceService.signalActive(user.id, user.currentTeamId);
      }, 30000); // Every 30 seconds

      return () => {
        clearInterval(interval);
        presenceService.logout(user.id, user.currentTeamId);
      };
    }
  }, [user?.id, user?.currentTeamId, user?.username]);

  // ... rest of app
}
```

- [ ] Presence initialized on app load

---

## Phase 4: Testing & Validation

### 4.1 Test Session Management

- [ ] Create session (login)
- [ ] Verify session recorded in `user_sessions` table
- [ ] End session (logout)  
- [ ] Verify `logoutAt` timestamp

### 4.2 Test Real-time Presence

- [ ] Open app in multiple tabs/windows
- [ ] Change status in one tab
- [ ] Verify status updates in other tabs in real-time
- [ ] Check `user_status` table for updates

### 4.3 Test Activity Logging

- [ ] Navigate to different modules (campaigns, contacts, emails)
- [ ] Verify activities logged in `team_member_activity` table
- [ ] Check activity appears in dashboard

### 4.4 Test Time Tracking

- [ ] Spend time in a module
- [ ] End session
- [ ] Verify time calculated in `module_time_tracking` table
- [ ] Check dashboard shows correct time

### 4.5 Test CRM Interactions

- [ ] Create/edit contact
- [ ] Send email
- [ ] Make call
- [ ] Verify interactions logged in `crm_interaction_log` table
- [ ] Check interactions appear on CRM dashboard tab

### 4.6 Test Dashboard

- [ ] Check KPI cards load correctly
- [ ] Verify all charts render properly
- [ ] Test date range filtering
- [ ] Test user filtering
- [ ] Check performance with large datasets

---

## Phase 5: Integration with Existing Features

### 5.1 Campaign Module

**File**: `server/routes/campaign-manager.ts` (or similar)

```typescript
import { logActivity } from "../utils/activityLogger";

// When viewing campaign
router.get("/:campaignId", requireAuth, async (req, res) => {
  // ... existing logic
  
  // Log the view
  await logActivity(req.user.userId, {
    teamId: req.body.teamId,
    activityType: "view",
    module: "campaigns",
    entityType: "campaign",
    entityId: campaign.id,
    entityName: campaign.name,
  });

  res.json(campaign);
});
```

- [ ] Campaign views logged
- [ ] Campaign creates logged
- [ ] Campaign updates logged

### 5.2 Contact Module

- [ ] Contact views logged
- [ ] Contact creates logged
- [ ] Contact edits logged
- [ ] Contact deletes logged

### 5.3 Email Module

- [ ] Email sends logged
- [ ] Email opens logged
- [ ] Email clicks logged

### 5.4 Call Module

- [ ] Call initiations logged
- [ ] Call completions logged
- [ ] Call durations tracked

---

## Phase 6: Performance Optimization

### 6.1 Database Indexes

- [ ] Verify all indexes created (from schema)
- [ ] Run: `SELECT indexname FROM pg_indexes WHERE tablename LIKE 'activity%' OR tablename LIKE 'user_%';`

### 6.2 Query Optimization

- [ ] Test dashboard with 1 month of data
- [ ] Test with 100+ team members
- [ ] Monitor query performance using `EXPLAIN ANALYZE`

### 6.3 Data Retention Policy

Add a scheduled job to archive old activity records:

```typescript
// scripts/archive-activity-data.ts
import { db } from "../server/db";
import { teamMemberActivity } from "@shared/schema";
import { lt } from "drizzle-orm";

// Run daily to archive records older than 6 months
const sixMonthsAgo = new Date();
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

await db
  .delete(teamMemberActivity)
  .where(lt(teamMemberActivity.createdAt, sixMonthsAgo));
```

- [ ] Archive job configured
- [ ] Runs on schedule

---

## Phase 7: Security & Compliance

### 7.1 Access Control

- [ ] Only authenticated users can access activity endpoints
- [ ] Only admins/managers can view team activity
- [ ] Users can only see their own detailed sessions

### 7.2 Data Protection

- [ ] IP addresses stored for audit trail
- [ ] Consider GDPR compliance for user data
- [ ] Implement data retention policy

### 7.3 Rate Limiting

Consider adding rate limiting to activity endpoints:

```typescript
import rateLimit from "express-rate-limit";

const activityLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use("/api/team-activity", activityLimiter);
```

- [ ] Rate limiting configured if needed

---

## Phase 8: Documentation & Training

- [ ] Update user documentation with activity tracking features
- [ ] Create video tutorials for dashboard
- [ ] Train team on privacy and data retention policies
- [ ] Document API for external integrations

---

## Deployment Checklist

### Before Production Deployment

- [ ] All phases completed
- [ ] All tests passing
- [ ] Performance benchmarks acceptable
- [ ] Security review completed
- [ ] Backup strategy for activity data
- [ ] Monitoring and alerting configured

### Deployment Steps

1. [ ] Deploy database migrations
2. [ ] Deploy backend code
3. [ ] Deploy frontend code
4. [ ] Verify Socket.io connection
5. [ ] Monitor logs for errors
6. [ ] Test with real users

### Post-Deployment

- [ ] Monitor database performance
- [ ] Check WebSocket connection stability
- [ ] Verify data is being logged correctly
- [ ] Get user feedback on dashboard UI/UX
- [ ] Plan for future enhancements

---

## Troubleshooting Guide

### Issue: Activities not being logged

**Solutions:**
1. Check middleware registration order
2. Verify `teamId` is being sent in requests
3. Check server logs for errors
4. Verify database table exists and has correct schema

### Issue: Real-time updates not working

**Solutions:**
1. Check Socket.io is initialized correctly
2. Verify client is connecting to `/presence` namespace
3. Check CORS configuration
4. Check browser console for connection errors

### Issue: Dashboard slow to load

**Solutions:**
1. Add database indexes
2. Reduce date range in queries
3. Implement pagination
4. Add caching for frequently accessed data

### Issue: High database storage usage

**Solutions:**
1. Implement data archival policy
2. Reduce logging granularity
3. Clean up old records regularly
4. Consider partitioning large tables

---

## Support & Resources

- **API Documentation**: See `TEAM_ACTIVITY_MANAGER_GUIDE.md`
- **React Hooks**: `client/src/hooks/useActivityTracking.ts`
- **Dashboard Component**: `client/src/components/TeamActivityDashboard.tsx`
- **Error Logs**: Check browser console and server logs
- **Database**: PostgreSQL activity tables

---

**Status**: Ready for integration
**Last Updated**: March 4, 2026
