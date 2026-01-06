# Pivotal Pipeline Management — Spec v1.0

## Overview
Pivotal Pipeline Management centralizes revenue workflows for multi-tenant agencies. The system unifies pipeline governance, omnichannel engagement, telephony, automated sequences, and analytics while honoring tenant, client, and regulatory constraints. This specification documents goals, core data transfer objects (DTOs), operation identifiers, user experiences, supporting workers, infrastructure, quality assurance, and operational runbooks for delivering the v1.0 release.

## Product Goals
- Manage internal sales opportunities with staged pipelines, ownership, service-level agreements (SLAs), and forecasts.
- Centralize customer engagement across Office 365 email, calls, meetings, notes, tasks, and campaign interactions.
- Deliver a modern inbox workspace with unified search, click-to-call, and streamlined composition.
- Orchestrate manual and automated touchpoints (sequences) that keep opportunities warm.
- Blend opportunity data with clients, projects, campaigns, leads/QA, and human-filtered email analytics.
- Enforce strict multi-tenant isolation, client scoping, privacy controls, and compliance.

## Core Data Model
All DTOs include `id`, `tenantId`, `createdAt`, and `updatedAt` unless otherwise noted. Multi-tenant isolation is preserved by scoping every query to `tenantId` and (when applicable) to `clientId` and `projectId`.

### Pipeline DTO
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "name": "string",
  "ownerId": "uuid",
  "defaultCurrency": "ISO-4217",
  "stageOrder": ["qualification", "proposal", "negotiation", "closedWon", "closedLost"],
  "slaPolicy": {},
  "active": true,
  "clientId": "uuid|null",
  "projectIds": ["uuid"]
}
```

### Opportunity DTO
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "pipelineId": "uuid",
  "clientId": "uuid",
  "projectId": "uuid|null",
  "name": "string",
  "accountId": "uuid",
  "primaryContactId": "uuid|null",
  "ownerId": "uuid",
  "stage": "enum",
  "amount": "decimal",
  "currency": "ISO-4217",
  "probability": 0.0,
  "closeDate": "date",
  "source": "campaign|inbound|outbound|referral",
  "score": 0,
  "tags": ["string"],
  "customFields": {},
  "status": "open|won|lost|onHold",
  "reason": "string|null",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### Engagement DTO
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "opportunityId": "uuid|null",
  "accountId": "uuid",
  "contactId": "uuid|null",
  "actorId": "uuid",
  "type": "email_in|email_out|call_in|call_out|meeting|note|task|touchpoint|conversion|campaign_event",
  "direction": "in|out|null",
  "subject": "string|null",
  "bodyPreview": "string|null",
  "meta": {},
  "occurredAt": "timestamp",
  "isBot": false,
  "channel": "email|phone|web|inapp|calendar"
}
```

### Sequence DTO
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "name": "string",
  "goal": "meeting|reply|signup|custom",
  "steps": ["json_step"],
  "audience": "json_query",
  "sendWindow": {
    "timezone": "IANA",
    "businessHours": [{"day": 1, "start": "09:00", "end": "17:00"}],
    "quietHours": [{"day": 6, "start": "00:00", "end": "23:59"}]
  },
  "cooldowns": {
    "perContact": "PT24H",
    "perSequence": "PT12H"
  },
  "guardrails": {
    "unsubscribe": true,
    "dailyCap": 200,
    "respectOptOut": true
  }
}
```

### Sequence Enrollment DTO
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "sequenceId": "uuid",
  "opportunityId": "uuid|null",
  "contactId": "uuid|null",
  "status": "active|paused|completed|failed",
  "currentStep": 2,
  "nextRunAt": "timestamp",
  "lastActionAt": "timestamp|null",
  "ownerId": "uuid",
  "meta": {}
}
```

### Mailbox Account DTO
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "userId": "uuid",
  "provider": "o365",
  "scopes": ["mail.read", "mail.send", "offline_access", "calendar.readwrite"],
  "status": "connected|revoked|error",
  "connectedAt": "timestamp",
  "lastSyncAt": "timestamp",
  "encryptedTokens": "ciphertext"
}
```

### Message Index DTO
```json
{
  "id": "uuid",
  "mailboxId": "uuid",
  "externalId": "string",
  "folder": "inbox|sent|archive|custom",
  "from": "string",
  "to": ["string"],
  "cc": ["string"],
  "subject": "string",
  "snippet": "string",
  "hasAttachments": true,
  "receivedAt": "timestamp",
  "isRead": false,
  "isReplied": false,
  "threadKey": "string",
  "labels": ["string"],
  "bodyPointer": "string"
}
```

### Call Session DTO
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "userId": "uuid",
  "contactId": "uuid|null",
  "opportunityId": "uuid|null",
  "direction": "out|in",
  "status": "initiated|ringing|connected|ended|failed",
  "provider": "webrtc|twilio|sip",
  "startedAt": "timestamp",
  "endedAt": "timestamp|null",
  "durationSec": 45,
  "recordingUrl": "string|null",
  "transcriptId": "uuid|null",
  "notes": "string|null",
  "disposition": "no_answer|left_vm|connected|callback|custom"
}
```

### Task DTO
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "type": "call|email|followup|todo",
  "opportunityId": "uuid|null",
  "contactId": "uuid|null",
  "ownerId": "uuid",
  "dueAt": "timestamp",
  "priority": "low|normal|high",
  "status": "open|inProgress|completed|overdue",
  "origin": "sequence|manual|qa|campaign"
}
```

### Indexing Guidance
- Partition `engagement` tables monthly; index `(tenantId, opportunityId, occurredAt)` to power timelines.
- Create composite indexes for search on subjects, addresses, and metadata filters.

## Operation IDs
### Pipelines & Opportunities
- `pipeline.create`
- `pipeline.update`
- `pipeline.list`
- `pipeline.get`
- `pipeline.archive`
- `opportunity.create`
- `opportunity.update`
- `opportunity.list`
- `opportunity.get`
- `opportunity.moveStage`
- `opportunity.win`
- `opportunity.lose`
- `opportunity.forecast.get`

### Inbox & Mail (Office 365)
- `mailbox.connectO365`
- `mailbox.disconnect`
- `mailbox.status.get`
- `mail.sync.start`
- `mail.sync.resume`
- `mail.search`
- `mail.messages.list`
- `mail.message.get`
- `mail.message.send`
- `mail.thread.reply`
- `mail.message.move`
- `mail.message.flag`
- `mail.message.readState`

### Click-to-Call & Meetings
- `call.start`
- `call.end`
- `call.disposition`
- `call.recording.attach`
- `call.transcript.attach`
- `meeting.create`
- `meeting.log`

### Engagements & Tasks
- `engagement.log`
- `engagement.list`
- `task.create`
- `task.update`
- `task.complete`
- `task.list`
- `timeline.get`

### Sequences
- `sequence.create`
- `sequence.update`
- `sequence.list`
- `sequence.get`
- `sequence.archive`
- `sequence.enroll`
- `sequence.pause`
- `sequence.resume`
- `sequence.unsubscribe`
- `sequence.run.nextAction`
- `sequence.metrics.get`

### Analytics & Scoring
- `pipeline.metrics.get`
- `opportunity.metrics.get`
- `rep.performance.get`
- `score.compute`
- `score.config.update`

### Admin & Security
- `rbac.policy.update`
- `compliance.settings.update`
- `audit.log.list`

### Events
Emit canonical events with `tenantId` and relevant entity references:
- `pipeline.created`, `pipeline.updated`
- `opportunity.created`, `opportunity.updated`, `opportunity.stageChanged`, `opportunity.won`, `opportunity.lost`
- `engagement.logged`
- `mail.synced`, `mail.sent`, `mail.replyDetected`
- `call.started`, `call.ended`, `call.dispositioned`, `call.recorded`, `call.transcribed`
- `sequence.enrolled`, `sequence.advanced`, `sequence.paused`, `sequence.completed`, `sequence.failed`
- `score.updated`
- `task.created`, `task.completed`

## Inbox Workspace (React/TypeScript)
### Layout
- Three-pane layout: folders & filters, thread list, conversation view with context rail.
- Inbox supports unified search (people, domains, subject, attachments, opportunities, clients).
- Bulk actions: label, assign, create task, enroll contact to sequence.
- Snooze, pin, and thread collapsing behaviors mirror modern email clients.

### Composer
- Supports sender aliases, templates, attachments, merge tags, schedule send, read receipts, and optional tracking pixels/link wrapping.
- Integrates AI draft suggestions with tone and brevity controls; human approval required before sending.

### Smart Context
- Context cards surface opportunity stage, last touch, tasks, and related records.
- Click-to-call integrates with the telephony widget for one-click dialing.

## Pipeline Workspace
- Kanban board with drag-and-drop stages reflecting pipeline stage order.
- Forecast view calculates weighted projections and commit rollups by stage, owner, client, and project.
- Opportunity detail panels merge engagement timeline, tasks, sequences, and AI Next Best Action suggestions.

## Sequence Builder
- Visual editor for step orchestration: email (manual/auto), call task, LinkedIn task, wait/delay, conditional branches, task creation, webhook actions.
- Guardrails for business hours, quiet hours, per-day caps, opt-out compliance, and unsubscribe handling.
- Human-in-the-loop approvals for manual steps and review queues for bulk personalization.
- Stop rules triggered by replies, meetings booked, or opportunity stage change events.

### Sequence Step JSON Example
```json
{
  "type": "email",
  "mode": "manual",
  "templateId": "tpl_ai_exec",
  "wait": "P2D",
  "fallback": { "type": "task", "taskType": "call", "dueIn": "P1D" },
  "branch": [
    { "when": "replied", "do": [{ "type": "stop" }] },
    { "when": "no_open_48h", "do": [{ "type": "email", "mode": "auto", "templateId": "tpl_nudge" }] }
  ]
}
```

## Telephony Widget
- In-app WebRTC softphone powered by Telnyx WebRTC SIP, matching the provider used in our call campaign.
- Offers call controls (mute, hold, transfer, dial pad), warm transfer, callback scheduling, and power dialer mode.
- Automatically logs engagements with duration, disposition, and optional recording/transcript attachments.
- Consent toggles per tenant/region with visual indicators when recording.

## AI Assists
- AI email drafts with human approval workflow in the composer.
- Next Best Action recommendations per opportunity leveraging recency, multi-threading, and sequence progress.
- Call summary and action item extraction from transcripts; suggested tasks auto-populate queues.
- Opportunity health scoring to surface at-risk deals.

## Analytics & Dashboards
- Pipeline analytics: stage counts, conversion rates, velocity, weighted and commit forecasts, win/loss by reason.
- Rep performance dashboards: email/call/task volumes, SLA adherence, meetings booked, win rates.
- Engagement analytics: human opens/clicks/replies, call connect rates, meeting set rate, sequence step performance.
- Client and project rollups for agency reporting continuity.

## Office 365 Integration
- OAuth 2.0 multi-tenant app with scopes `mail.read`, `mail.send`, `offline_access`, and optional `calendar.readwrite`.
- Tokens are encrypted and stored per mailbox account; backfill 90 days of mail and apply incremental delta sync.
- Respect Microsoft throttling with exponential backoff and change notifications when enabled.
- Persist message metadata and secure pointers; fetch and cache full bodies only upon user view with TTL-based storage.

## Security, Privacy, and Compliance
- RBAC roles: Admin, Sales Manager, Sales Rep, Marketer, QA, Analyst, Client Viewer (no mailbox), Client Approver (no mailbox).
- Data isolation through tenant, client, and project scoping; mailbox data visible only to owners unless explicitly shared.
- Encrypt personally identifiable information (PII) at rest and redact sensitive content in logs.
- Honor recording consent and retention policies per region; enforce opt-out and suppression rules in sequences.
- Comprehensive audit logging for sends, moves, stage changes, and sequence actions.

## Feature Flags
- `pipeline`
- `inbox_o365`
- `webrtc_calls`
- `sequences`
- `ai_assist`

## Workers & Services
- **Mailbox Sync Worker**: runs incremental delta queries, manages throttling, emits `mail.synced`.
- **Sequence Runner Worker**: evaluates guardrails, schedules next actions, emits sequence events.
- **Scoring Worker**: recalculates opportunity and contact scores, emits `score.updated`.
- **O365 Webhook Processor**: ingests change notifications and queues targeted syncs.

## Database Migrations
- Create tables for pipelines, opportunities, engagements, sequences, sequence_enrollments, mailbox_accounts, message_index, call_sessions, tasks.
- Apply JSONB columns for `slaPolicy`, `customFields`, `meta`, `steps`, `audience`, `guardrails`.
- Partition engagements monthly and index `(tenantId, opportunityId, occurredAt)` plus text search indexes.
- Establish foreign keys across tenant, client, project, account, contact, pipeline, opportunity, and user relations.

## Quality Assurance Plans
- **Functional**: pipeline CRUD, drag/drop stage moves, forecast updates, inbox send/receive, call logging, sequence enrollment, AI approval flows.
- **Sync Correctness**: verify 90-day O365 backfill, delta sync accuracy, thread linking, secure body retrieval.
- **Call Flows**: WebRTC connection stability, power dialer throughput, recording/transcript attachment, disposition capture.
- **Sequence Guardrails**: business hours enforcement, opt-out handling, reply detection stop rules.
- **Permissions**: RBAC role coverage, client viewer restrictions, mailbox visibility, audit log completeness.

## Acceptance Criteria
- Users can create and manage pipelines and opportunities, move stages via drag-and-drop, and observe real-time forecast updates.
- Office 365 mailboxes connect successfully; inbox surfaces the latest 90 days of mail, in-app compose sends messages, and replies thread correctly.
- Click-to-call initiates telephony sessions, logs engagements with duration and disposition, and supports recordings/transcripts when enabled.
- Engagement timelines display unified mail, call, meeting, task, and campaign events for opportunities/accounts/contacts.
- Sequences can be authored, enroll opportunities, respect business hours and opt-outs, and automatically stop on reply detection.
- Analytics exclude bot activity, reflect human engagement, and feed opportunity and sequence dashboards.
- AI assists generate drafts and Next Best Action insights while requiring human approval for sends.
- Role-based access control ensures client users lack inbox access unless shared and internal pipelines remain private.
- SLA reminders trigger (e.g., "No activity in 3 days") and tasks populate in the assigned representative's queue.
- Audit logs capture all significant actions and exports enforce permissions.

## Runbooks
- **O365 Consent Troubleshooting**: validate OAuth configuration, refresh tokens, inspect Graph API errors.
- **Sync Backoff**: monitor throttling, adjust retry intervals, purge stuck deltas, rehydrate index.
- **Telephony QoS**: monitor WebRTC stats, diagnose Telnyx SIP connectivity, fall back to PSTN if WebRTC fails.

## Thoughtful Extras
- Opportunity health scoring with visual cues in pipeline and opportunity detail views.
- Next Best Action guidance driving timely outreach.
- Power dialer mode for outbound sequences.
- Reply detection halting sequences and notifying owners.
- Meeting auto-summary generating tasks when transcripts are available.
- Quiet hours and regional calendars ensuring respectful outreach.

## Non-Functional Requirements
- **Availability**: 99.9% uptime target across API and worker services.
- **Performance**: mailbox sync page retrieval p95 < 3s; composer send acknowledgement < 500ms.
- **Scale**: support 5k active opportunities per rep, 1M indexed emails per tenant, and 100k engagements per day.
- **Search**: maintain full-text indexes across message subjects and addresses with metadata filters for scoped queries.
- **Observability**: instrument per-tenant sync latency, call success rates, sequence throughput, and SLA breach alerts.
- **Feature Flags**: gate launch with `pipeline`, `inbox_o365`, `webrtc_calls`, `sequences`, and `ai_assist` flags.
