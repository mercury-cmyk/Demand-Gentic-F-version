import type { ActivityItem } from "@/components/patterns/activity-timeline";

export type ActivityEntityType =
  | "contact"
  | "account"
  | "campaign"
  | "call_job"
  | "call_session"
  | "lead"
  | "user"
  | "email_message";

export type ActivityLogEntry = {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  eventType: string;
  payload?: Record | null;
  createdBy?: string | null;
  createdAt: string;
};

const EVENT_LABELS: Record = {
  call_job_created: "Call job created",
  call_job_scheduled: "Call job scheduled",
  call_job_removed: "Call job removed",
  call_started: "Call started",
  call_connected: "Call connected",
  call_ended: "Call ended",
  disposition_saved: "Disposition saved",
  added_to_global_dnc: "Added to DNC",
  campaign_opt_out_saved: "Campaign opt-out",
  data_marked_invalid: "Data marked invalid",
  retry_scheduled: "Retry scheduled",
  account_cap_reached: "Account cap reached",
  queue_rebuilt: "Queue rebuilt",
  queue_set: "Queue set",
  queue_cleared: "Queue cleared",
  queue_cleared_all: "Queue cleared all",
  contact_called: "Contact called",
  email_sent: "Email sent",
  email_opened: "Email opened",
  email_clicked: "Email clicked",
  form_submitted: "Form submitted",
  task_created: "Task created",
  task_completed: "Task completed",
  note_added: "Note added",
  quick_linkedin_lookup: "LinkedIn lookup",
  lead_verification_linkedin: "LinkedIn verification",
  lead_verification_oncall: "On-call verification",
};

function toTitleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveTitle(eventType: string, payload?: Record | null) {
  if (payload && typeof payload.title === "string" && payload.title.trim()) {
    return payload.title.trim();
  }
  return EVENT_LABELS[eventType] || toTitleCase(eventType);
}

function resolveDescription(payload?: Record | null) {
  if (!payload) {
    return undefined;
  }
  if (typeof payload.description === "string" && payload.description.trim()) {
    return payload.description.trim();
  }
  if (typeof payload.summary === "string" && payload.summary.trim()) {
    return payload.summary.trim();
  }
  return undefined;
}

function isEmailEvent(eventType: string) {
  return eventType.startsWith("email_");
}

function isCallEvent(eventType: string) {
  return eventType.startsWith("call_") || eventType === "contact_called";
}

function isTaskEvent(eventType: string) {
  return eventType.startsWith("task_");
}

function isNoteEvent(eventType: string) {
  return eventType === "note_added";
}

export function buildActivityTimelineItems(logs: ActivityLogEntry[]): ActivityItem[] {
  const items = logs.map((log) => {
    const eventType = log.eventType;
    let type: ActivityItem["type"] = "campaign";

    if (isEmailEvent(eventType)) {
      type = "email";
    } else if (isCallEvent(eventType)) {
      type = "call";
    } else if (isTaskEvent(eventType)) {
      type = "task";
    } else if (isNoteEvent(eventType)) {
      type = "note";
    }

    return {
      id: log.id,
      type,
      title: resolveTitle(eventType, log.payload),
      description: resolveDescription(log.payload),
      timestamp: log.createdAt,
      metadata: log.payload ? { ...log.payload } : undefined,
    } satisfies ActivityItem;
  });

  return items.sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    return bTime - aTime;
  });
}

export function summarizeEngagement(items: ActivityItem[]) {
  const calls = items.filter((item) => item.type === "call").length;
  const emails = items.filter((item) => item.type === "email").length;
  const campaignEvents = items.filter((item) => item.type === "campaign").length;
  const lastCall = items.find((item) => item.type === "call");

  return {
    calls,
    emails,
    campaignEvents,
    lastCallAt: lastCall ? new Date(lastCall.timestamp).toISOString() : null,
  };
}