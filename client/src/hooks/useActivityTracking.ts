import { useEffect, useRef, useCallback } from "react";

interface ActivityLoggerOptions {
  teamId: string;
  userId: string;
  username: string;
}

interface ActivityData {
  activityType: string;
  module: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  description?: string;
  metadata?: any;
  duration?: number;
}

/**
 * Hook for logging team member activities
 * Usage: const logger = useActivityLogger({ teamId, userId, username });
 *        logger.log("create", "campaigns", { entityId: "123", ... });
 */
export function useActivityLogger(options: ActivityLoggerOptions) {
  const { teamId, userId, username } = options;

  const logActivity = useCallback(
    async (data: ActivityData) => {
      try {
        const res = await fetch("/api/team-activity/log", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            teamId,
            ...data,
          }),
        });

        if (!res.ok) {
          console.error("Failed to log activity:", res.statusText);
        }

        return res.json();
      } catch (error) {
        console.error("Error logging activity:", error);
        throw error;
      }
    },
    [teamId]
  );

  return { log: logActivity };
}

/**
 * Hook for tracking time spent in a module
 * Usage: const { startTracking, endTracking } = useModuleTimeTracking(...);
 */
export function useModuleTimeTracking(
  options: ActivityLoggerOptions & { module: string }
) {
  const { teamId, userId, module } = options;
  const trackingIdRef = useRef<string | null>(null);

  const startTracking = useCallback(async () => {
    try {
      const res = await fetch("/api/team-activity/time-tracking/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          teamId,
          module,
        }),
      });

      if (!res.ok) {
        console.error("Failed to start tracking:", res.statusText);
        return null;
      }

      const data = await res.json();
      trackingIdRef.current = data.tracking.id;
      return data.tracking;
    } catch (error) {
      console.error("Error starting tracking:", error);
      return null;
    }
  }, [teamId, module]);

  const endTracking = useCallback(async () => {
    if (!trackingIdRef.current) {
      console.warn("No active tracking session");
      return null;
    }

    try {
      const res = await fetch(
        `/api/team-activity/time-tracking/${trackingIdRef.current}/end`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (!res.ok) {
        console.error("Failed to end tracking:", res.statusText);
        return null;
      }

      const data = await res.json();
      trackingIdRef.current = null;
      return data.tracking;
    } catch (error) {
      console.error("Error ending tracking:", error);
      return null;
    }
  }, []);

  return {
    startTracking,
    endTracking,
    isTracking: trackingIdRef.current !== null,
  };
}

/**
 * Hook for CRM interaction logging
 */
export function useCrmInteractionLogger(
  options: ActivityLoggerOptions
) {
  const { teamId } = options;

  const logInteraction = useCallback(
    async (data: {
      interactionType: string;
      entityType: string;
      entityId: string;
      entityName?: string;
      details?: any;
      duration?: number;
      outcome?: string;
    }) => {
      try {
        const res = await fetch("/api/team-activity/crm-interaction", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            teamId,
            ...data,
          }),
        });

        if (!res.ok) {
          console.error("Failed to log interaction:", res.statusText);
        }

        return res.json();
      } catch (error) {
        console.error("Error logging interaction:", error);
        throw error;
      }
    },
    [teamId]
  );

  return { logInteraction };
}

/**
 * Hook for managing user presence/status
 */
export function usePresence(options: ActivityLoggerOptions) {
  const { teamId, userId, username } = options;

  const updateStatus = useCallback(
    async (status: "online" | "offline" | "away" | "busy" | "do_not_disturb") => {
      try {
        const res = await fetch("/api/team-activity/status", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ status }),
        });

        if (!res.ok) {
          console.error("Failed to update status:", res.statusText);
        }

        return res.json();
      } catch (error) {
        console.error("Error updating status:", error);
      }
    },
    []
  );

  const getTeamStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/team-activity/team/${teamId}/status`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!res.ok) {
        console.error("Failed to fetch team status:", res.statusText);
        return [];
      }

      const data = await res.json();
      return data.statuses;
    } catch (error) {
      console.error("Error fetching team status:", error);
      return [];
    }
  }, [teamId]);

  return { updateStatus, getTeamStatus };
}

/**
 * Hook for automatic presence tracking with activity detection
 */
export function useAutoPresence(options: ActivityLoggerOptions) {
  const { userId, teamId } = options;
  const { updateStatus, getTeamStatus } = usePresence(options);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activityCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const resetInactivityTimer = useCallback(() => {
    // Clear existing timeout
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }

    // Set new timeout for marking as away (5 minutes)
    inactivityTimeoutRef.current = setTimeout(() => {
      updateStatus("away");
    }, 5 * 60 * 1000);
  }, [updateStatus]);

  useEffect(() => {
    // Set initial online status
    updateStatus("online");
    resetInactivityTimer();

    // Listen for user activity
    const handleActivity = () => {
      // Update status back to online if was away
      updateStatus("online");
      resetInactivityTimer();
    };

    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((event) =>
      window.addEventListener(event, handleActivity, true)
    );

    // Periodically signal activity
    activityCheckIntervalRef.current = setInterval(() => {
      fetch("/api/team-activity/sessions/active", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }).catch(() => {
        /* ignore */
      });
    }, 30000);

    return () => {
      // Cleanup
      events.forEach((event) =>
        window.removeEventListener(event, handleActivity, true)
      );
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      if (activityCheckIntervalRef.current) {
        clearInterval(activityCheckIntervalRef.current);
      }
      // Mark as offline on unmount
      updateStatus("offline").catch(() => {
        /* ignore */
      });
    };
  }, [updateStatus, resetInactivityTimer]);

  return { getTeamStatus };
}

/**
 * Hook for logging communication
 */
export function useCommunicationLogger(
  options: ActivityLoggerOptions
) {
  const { teamId } = options;

  const logMessage = useCallback(
    async (data: {
      receiverId?: string;
      communicationType: string;
      subject?: string;
      content: string;
      attachments?: any[];
    }) => {
      try {
        const res = await fetch("/api/team-activity/communication", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            teamId,
            ...data,
          }),
        });

        if (!res.ok) {
          console.error("Failed to log message:", res.statusText);
        }

        return res.json();
      } catch (error) {
        console.error("Error logging message:", error);
        throw error;
      }
    },
    [teamId]
  );

  return { logMessage };
}

/**
 * Hook for fetching activity dashboard data
 */
export function useActivityDashboard(teamId: string) {
  const [dashboard, setDashboard] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const fetch = useCallback(
    async (days: number = 7) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/team-activity/dashboard/${teamId}?days=${days}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        setDashboard(data.dashboard);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        console.error("Error fetching dashboard:", error);
      } finally {
        setLoading(false);
      }
    },
    [teamId]
  );

  return { dashboard, loading, error, fetch };
}
