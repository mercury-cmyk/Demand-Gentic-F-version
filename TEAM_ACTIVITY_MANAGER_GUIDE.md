# Team Activity Manager - Implementation Guide

## Overview

The Team Activity Manager is a comprehensive system for tracking team member activities, online status, time spent on different modules, and CRM interactions. It provides real-time presence tracking, activity logging, and detailed analytics/reporting.

## Features

1. **User Session Management** - Track login/logout times
2. **Real-time Status Tracking** - Online/offline/away status with WebSocket updates
3. **Activity Logging** - Automatic logging of all team member actions
4. **Time Tracking** - Monitor time spent on different modules
5. **CRM Interaction Tracking** - Track contact, account, email interactions
6. **Team Communication Log** - Record internal team communications
7. **Activity Dashboard** - Visual analytics and reporting
8. **Activity Summary** - Daily aggregated statistics

## Database Schema

### New Tables:

```
1. user_sessions - User login/logout sessions
2. user_status - Current online/offline status
3. team_member_activity - Individual team member activities
4. module_time_tracking - Time spent in different modules
5. activity_summary - Daily aggregated activity statistics
6. crm_interaction_log - CRM-specific interactions
7. communication_log - Internal team communications
```

See `schema.ts` for detailed schema definitions.

## API Endpoints

### Session Management
- `POST /api/team-activity/sessions` - Create session (login)
- `POST /api/team-activity/sessions/:sessionId/logout` - End session
- `GET /api/team-activity/sessions` - Get user's sessions

### Status Management
- `PUT /api/team-activity/status` - Update user status
- `GET /api/team-activity/team/:teamId/status` - Get all team members' status

### Activity Logging
- `POST /api/team-activity/log` - Log an activity
- `GET /api/team-activity/log/:teamId` - Get activity log (requires admin/manager role)

### Time Tracking
- `POST /api/team-activity/time-tracking/start` - Start tracking time
- `POST /api/team-activity/time-tracking/:trackingId/end` - End tracking session
- `GET /api/team-activity/time-tracking/:teamId` - Get time tracking stats

### CRM Interactions
- `POST /api/team-activity/crm-interaction` - Log CRM interaction
- `GET /api/team-activity/crm-interaction/:teamId` - Get CRM interactions

### Analytics & Reporting
- `GET /api/team-activity/summary/:teamId` - Get activity summary
- `GET /api/team-activity/dashboard/:teamId` - Get comprehensive dashboard data

### Communication
- `POST /api/team-activity/communication` - Log communication
- `GET /api/team-activity/communication/:userId` - Get messages for user

## Integration Steps

### 1. Register API Routes

Add to your main Express server (`server/index.ts` or `server/routes.ts`):

```typescript
import teamActivityRoutes from "./routes/team-activity-routes";

app.use("/api/team-activity", requireAuth, teamActivityRoutes);
```

### 2. Initialize WebSocket Presence Tracking

In your main Express/Socket.io setup:

```typescript
import { initializePresenceTracking } from "./routes/team-activity-presence";
import { Server } from "socket.io";

const io = new Server(app, { cors: { origin: "*" } });
initializePresenceTracking(io);
```

### 3. Add Activity Tracking Middleware

For automatic tracking on relevant routes:

```typescript
import { 
  activityTrackingMiddleware, 
  crmActivityLoggingMiddleware,
  activityCleanupMiddleware 
} from "./middleware/activity-tracking";

// Apply to specific routes
app.use("/api/campaigns", activityTrackingMiddleware("campaigns"));
app.use("/api/contacts", activityTrackingMiddleware("contacts"));
app.use("/api/emails", activityTrackingMiddleware("emails"));

// CRM activity logging
app.use("/api/crm", crmActivityLoggingMiddleware);

// Cleanup on logout
app.use(activityCleanupMiddleware());
```

### 4. Add Dashboard Component to Client

In your React app:

```typescript
import TeamActivityDashboard from "@/components/TeamActivityDashboard";

// In a page or panel:
<TeamActivityDashboard teamId={yourTeamId} />
```

### 5. Initialize Presence Tracking on Client

Create a presence service in your client:

```typescript
// services/presenceService.ts
import io from "socket.io-client";

const socket = io("/presence", {
  auth: {
    token: localStorage.getItem("token")
  }
});

export const presenceService = {
  // Join team presence
  join: (userId: string, teamId: string, username: string) => {
    socket.emit("join", { userId, teamId, username });
  },

  // Update status
  updateStatus: (userId: string, status: string, teamId: string) => {
    socket.emit("status-change", { userId, status, teamId });
  },

  // Signal activity
  signalActive: (userId: string, teamId: string) => {
    socket.emit("active", { userId, teamId });
  },

  // Handle status changes
  onStatusChange: (callback: (data: any) => void) => {
    socket.on("user-status-changed", callback);
  },

  // Handle user joined
  onUserJoined: (callback: (data: any) => void) => {
    socket.on("user-joined", callback);
  },

  // Handle user left
  onUserLeft: (callback: (data: any) => void) => {
    socket.on("user-left", callback);
  },

  // Logout
  logout: (userId: string, teamId: string) => {
    socket.emit("logout", { userId, teamId });
  }
};
```

### 6. Add Activity Logger Utility

Create a utility for logging activities from your components:

```typescript
// utils/activityLogger.ts
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
    const res = await fetch("/api/team-activity/log", {
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
    
    if (!res.ok) {
      console.error("Failed to log activity");
    }
  } catch (error) {
    console.error("Error logging activity:", error);
  }
}
```

## Usage Examples

### Example 1: Logging a Campaign View

```typescript
import { logActivity } from "@/utils/activityLogger";

function CampaignDetail({ campaign, teamId }) {
  useEffect(() => {
    // Log that user viewed this campaign
    logActivity(teamId, "view", "campaigns", {
      entityType: "campaign",
      entityId: campaign.id,
      entityName: campaign.name,
      description: `Viewed campaign: ${campaign.name}`,
    });
  }, [campaign.id]);

  // ... component code
}
```

### Example 2: Logging a Contact Creation

```typescript
async function createContact(data) {
  const contact = await api.createContact(data);
  
  // Log the activity
  await logActivity(userTeamId, "create", "contacts", {
    entityType: "contact",
    entityId: contact.id,
    entityName: `${contact.firstName} ${contact.lastName}`,
    description: `Created contact: ${contact.firstName} ${contact.lastName}`,
  });

  return contact;
}
```

### Example 3: Tracking Email Send Action

```typescript
async function sendEmail(emailData) {
  const result = await api.sendEmail(emailData);
  
  await logActivity(userTeamId, "create", "emails", {
    entityType: "email",
    entityId: result.id,
    entityName: emailData.subject,
    duration: result.processingTime,
    description: `Sent email: ${emailData.subject}`,
    metadata: {
      recipientCount: emailData.recipients.length,
      templateUsed: emailData.template,
    },
  });

  return result;
}
```

### Example 4: Logging CRM Interaction

```typescript
async function logCrmInteraction(interaction) {
  const res = await fetch("/api/team-activity/crm-interaction", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    body: JSON.stringify({
      teamId: userTeamId,
      interactionType: interaction.type, // e.g., "contact_edit", "email_send"
      entityType: interaction.entityType, // e.g., "contact"
      entityId: interaction.entityId,
      entityName: interaction.entityName,
      details: interaction.details,
      outcome: interaction.outcome,
    }),
  });

  return res.json();
}
```

### Example 5: Real-time Status Updates

```typescript
// In your app's authentication/session management:

function usePresence(userId: string, teamId: string, username: string) {
  useEffect(() => {
    presenceService.join(userId, teamId, username);

    const handleStatusChange = (data: any) => {
      // Update local state with user status
      console.log(`${data.userId} is now ${data.status}`);
    };

    presenceService.onStatusChange(handleStatusChange);

    // Signal activity periodically
    const activityInterval = setInterval(() => {
      presenceService.signalActive(userId, teamId);
    }, 30000); // Every 30 seconds

    return () => {
      clearInterval(activityInterval);
      presenceService.logout(userId, teamId);
    };
  }, [userId, teamId, username]);
}
```

## Dashboard Features

The `TeamActivityDashboard` component provides:

- **Overview Tab**: Team member status, time by module pie chart
- **Activities Tab**: Detailed activity log with filtering
- **Time Tab**: Module-based time tracking visualization
- **CRM Tab**: CRM interactions by type with recent activity list
- **Communication Tab**: Team communication history (future feature)

### Customization

You can customize the dashboard colors and metrics:

```typescript
// Colors for modules
const COLORS_MODULES = ["#3b82f6", "#10b981", ...];

// Status colors
const COLORS_STATUS = {
  online: "#10b981",
  offline: "#6b7280",
  // ...
};
```

## Performance Considerations

1. **Activity Logging**: Runs asynchronously to avoid blocking user interactions
2. **Presence Updates**: WebSocket-based for real-time updates
3. **Database Indexing**: All tables have appropriate indexes for quick queries
4. **Data Retention**: Consider archiving old activity logs (>6 months) for performance

## Security & Privacy

1. **Authentication Required**: All endpoints require authentication
2. **Role-Based Access**: Admin/Manager roles can view team activity
3. **Users Can Only See Own Sessions**: Activity filtering is user-scoped by default
4. **Admin Override**: Managers/Admins can view any team member's activity

## Troubleshooting

### Activity Not Being Logged

1. Check that middleware is properly registered
2. Verify token is being sent in Authorization header
3. Check database connection and table existence
4. Look at server logs for errors

### Real-time Status Not Updating

1. Verify Socket.io is properly initialized
2. Check that presence namespace is correctly configured
3. Verify client is connecting to `/presence` namespace
4. Check browser console for connection errors

### Dashboard Not Loading Data

1. Verify API routes are registered
2. Check team ID is being passed correctly
3. Verify user has admin/manager role for viewing team data
4. Check browser network tab for API errors

## Future Enhancements

- [ ] Activity heatmaps by day/time
- [ ] Team productivity scoring
- [ ] Goal tracking and progress monitoring
- [ ] Badge/achievement system
- [ ] Slack/Teams integration for status
- [ ] Mobile app for activity tracking
- [ ] AI-powered insights and recommendations
- [ ] Custom activity categories per organization
