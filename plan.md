# Lead Journey Pipeline Management - Implementation Plan

## Overview
Build a lead nurture pipeline management system in the client portal dashboard. When appointment-setting campaigns produce leads that don't book (mid-conversation drop-offs, voicemails, callbacks requested, etc.), those leads enter a managed journey where the client can schedule follow-up callbacks, emails, and move them through stages — all with AI-generated context from previous activity.

---

## 1. Schema Additions (`shared/schema.ts`)

### Table: `clientJourneyPipelines`
Pipeline definitions tied to campaigns.

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(36) PK | |
| clientAccountId | varchar(36) | FK to clientAccounts |
| campaignId | varchar(36) | FK to campaigns (optional) |
| name | text | e.g. "Appointment Follow-Up Pipeline" |
| description | text | |
| stages | jsonb | `[{ id, name, order, color, defaultActionType }]` |
| autoEnrollDispositions | jsonb | Which dispositions auto-enroll: `["voicemail", "callback_requested", "needs_review"]` |
| status | enum | active / paused / archived |
| createdBy | varchar(36) | |
| createdAt / updatedAt | timestamp | |

**Default stages:** New Lead → Callback Scheduled → Contacted → Engaged → Appointment Set → Closed

### Table: `clientJourneyLeads`
Individual leads enrolled in a pipeline.

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(36) PK | |
| pipelineId | varchar(36) FK | |
| contactId | varchar(36) FK | |
| contactName | text | Denormalized |
| contactEmail | text | Denormalized |
| contactPhone | text | Denormalized |
| companyName | text | Denormalized |
| jobTitle | text | Denormalized |
| sourceCallSessionId | varchar(36) | The call that triggered enrollment |
| sourceCampaignId | varchar(36) | |
| sourceDisposition | text | e.g. "voicemail", "callback_requested" |
| sourceCallSummary | text | AI summary of the original call |
| sourceAiAnalysis | jsonb | Full AI analysis from call |
| currentStageId | text | Current stage in pipeline |
| currentStageEnteredAt | timestamp | |
| status | enum | active / paused / completed / lost |
| priority | integer | 1-5 (5 = highest) |
| nextActionType | text | callback / email / sms |
| nextActionAt | timestamp | When next action is due |
| lastActivityAt | timestamp | |
| totalActions | integer default 0 | |
| notes | text | |
| metadata | jsonb | Flexible extra data |
| createdBy | varchar(36) | |
| createdAt / updatedAt | timestamp | |

### Table: `clientJourneyActions`
Scheduled and completed follow-up actions.

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(36) PK | |
| journeyLeadId | varchar(36) FK | |
| pipelineId | varchar(36) FK | |
| actionType | enum | callback / email / sms / note / stage_change |
| status | enum | scheduled / in_progress / completed / skipped / failed |
| scheduledAt | timestamp | When action should happen |
| completedAt | timestamp | |
| title | text | Short description |
| description | text | Details |
| aiGeneratedContext | jsonb | AI talking points, email draft, etc. |
| previousActivitySummary | text | Context from prior interactions |
| outcome | text | What happened (after completion) |
| outcomeDetails | jsonb | Structured outcome data |
| resultDisposition | text | Disposition from this action |
| triggeredNextAction | boolean | Did this create a follow-up? |
| createdBy | varchar(36) | |
| completedBy | varchar(36) | |
| createdAt / updatedAt | timestamp | |

### Enums
- `clientJourneyPipelineStatusEnum`: active, paused, archived
- `clientJourneyLeadStatusEnum`: active, paused, completed, lost
- `clientJourneyActionTypeEnum`: callback, email, sms, note, stage_change
- `clientJourneyActionStatusEnum`: scheduled, in_progress, completed, skipped, failed

---

## 2. AI Service (`server/services/ai-journey-pipeline.ts`)

Three AI functions using Vertex AI:

### `generateFollowUpContext(leadId)`
- Fetches lead's source call transcript + AI analysis + all prior journey actions
- Uses `generateJSON()` to produce:
  - Talking points for next callback (personalized to previous conversation)
  - Objection responses based on what was discussed
  - Recommended approach (tone, timing, key points to address)

### `generateFollowUpEmail(leadId, emailType)`
- Generates personalized follow-up email based on:
  - Previous call context
  - Lead's company/role
  - Campaign positioning (from OI)
  - Journey stage and history
- Returns: subject, body HTML, preview text

### `recommendNextAction(leadId)`
- Analyzes lead's full journey history
- Returns: recommended action type, timing, priority, reasoning

All three use OI context via `wrapPromptWithOI()` for brand-aligned outputs.

---

## 3. API Routes (`server/routes/client-journey-pipeline-routes.ts`)

Mounted at `/api/client-portal/journey-pipeline` under `requireClientAuth`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Feature probe |
| GET | `/pipelines` | List pipelines for client |
| POST | `/pipelines` | Create new pipeline |
| GET | `/pipelines/:id` | Get pipeline with stage counts |
| PATCH | `/pipelines/:id` | Update pipeline settings |
| GET | `/pipelines/:id/leads` | List leads with filtering, sorting, pagination |
| POST | `/pipelines/:id/leads` | Manually enroll a lead |
| GET | `/leads/:id` | Full lead detail + actions timeline |
| PATCH | `/leads/:id` | Update lead (move stage, change status, add notes) |
| POST | `/leads/:id/actions` | Schedule a new action (callback/email/etc.) |
| PATCH | `/actions/:id` | Complete/skip/update an action |
| POST | `/leads/:id/generate-followup` | AI-generate context-aware follow-up |
| GET | `/pipelines/:id/analytics` | Pipeline metrics (stage distribution, conversion rates) |

Register in `server/routes/client-portal.ts` alongside campaign-planner.

---

## 4. Frontend Components (`client/src/components/client-journey-pipeline/`)

### `journey-pipeline-tab.tsx` — Main tab component
- Three views: **Board** (Kanban), **List** (table), **Analytics**
- Pipeline selector dropdown (if multiple pipelines)
- "Create Pipeline" flow for first-time setup

### `pipeline-board.tsx` — Kanban board
- Columns = pipeline stages
- Cards = leads with: name, company, priority badge, next action due, last activity
- Drag-and-drop to move stages (updates via PATCH)
- Click card → slide-out lead detail panel
- Color-coded priority indicators
- Overdue action indicators (red highlight)

### `lead-detail-panel.tsx` — Slide-out panel for lead details
- **Header**: Contact info, company, stage badge, priority
- **Source Context**: Original call summary, disposition, campaign
- **Activity Timeline**: Chronological list of all actions (scheduled, completed, notes)
- **Quick Actions**: Schedule Callback, Send Email, Add Note, Change Stage
- **AI Context**: Button to generate AI follow-up context with talking points

### `schedule-action-dialog.tsx` — Dialog for scheduling actions
- Action type selector (callback, email, note)
- Date/time picker for scheduling
- **For callbacks**: Show AI-generated talking points, previous call context
- **For emails**: AI-generate email draft with edit capability
- Notes field
- Priority adjustment

### `ai-followup-panel.tsx` — AI-generated follow-up context
- Shows previous activity summary
- AI-generated talking points
- Recommended approach
- One-click to schedule action with AI context pre-filled

### `create-pipeline-dialog.tsx` — Pipeline creation
- Name, description, campaign selection
- Stage editor (add/remove/reorder stages)
- Auto-enroll disposition selector
- Default stage colors

### `index.ts` — Exports

---

## 5. Dashboard & Navigation Integration

### `client-portal-dashboard.tsx`
- Add feature probe query for journey-pipeline
- Add conditional tab rendering for `activeTab === 'journey-pipeline'`
- Import and render `JourneyPipelineTab`

### `client-portal-layout.tsx`
- Add "Lead Pipeline" to the **Campaigns** navigation group (after Leads)
- Icon: `GitBranch` or `Workflow` from lucide-react

---

## 6. Implementation Order

1. **Schema** — Add 3 tables + 4 enums to `shared/schema.ts`, run migration
2. **Routes** — Build CRUD API with auth, mount in client-portal router
3. **AI Service** — Implement 3 AI functions for context-aware follow-ups
4. **UI: Pipeline Tab + Board** — Main tab with Kanban view
5. **UI: Lead Detail + Actions** — Detail panel with timeline and scheduling
6. **UI: AI Follow-up** — AI context generation integration
7. **Dashboard Integration** — Tab rendering, sidebar nav, feature probe
8. **Testing** — Build verification

---

## Key Design Decisions

- **Client-scoped**: All data filtered by `clientAccountId` — clients only see their own leads
- **Campaign-linked**: Pipelines optionally tied to campaigns for context
- **AI-powered context**: Every follow-up action can be enriched with AI-generated talking points from previous activity
- **Flexible stages**: Clients can customize pipeline stages per their workflow
- **Outcome tracking**: Each action records outcomes to inform future AI recommendations
- **Leverages existing infra**: Uses existing contacts, call sessions, dispositions, and OI — no duplication
