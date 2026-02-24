# Route Module Decision Sheet (Batch 1)

Date: 2026-02-23  
Scope: `backendRoutes.likelyUnusedRouteFiles` (22 files) from `docs/reports/active-files-audit.json`

## Decision Rules

- `safe_to_archive`: unmounted in `server/routes.ts` and no current runtime caller, or clearly replaced by an active route.
- `keep`: unmounted now, but there is active caller evidence or operational risk is too high to archive without migration/remount.

## Decisions

| Route module | Domain | Decision | Rationale | Next step |
| --- | --- | --- | --- | --- |
| `server/routes/agent-infrastructure-routes.ts` | Agent ops / email generation | keep | Not mounted, but endpoint paths are referenced in `server/services/agents/core-email-agent.ts`. | Keep module; validate/remount against current agent flow. |
| `server/routes/agent-prompt-visibility-routes.ts` | Agent prompt visibility | safe_to_archive | Not mounted; no runtime callers for this module's endpoint set. Active `/api/agent-prompts` is served by another mounted router. | Archive after one QA pass on current agent prompts pages. |
| `server/routes/call-monitoring-routes.ts` | Call monitoring | safe_to_archive | Not mounted; no runtime caller evidence. | Archive. |
| `server/routes/campaign-channels.ts` | Campaign channel configuration | safe_to_archive | Not mounted; no runtime caller evidence for these channel endpoints. | Archive. |
| `server/routes/campaign-contacts-by-event.ts` | Campaign execution analytics | keep | Not mounted, but called by `client/src/pages/contacts.tsx` (`/api/campaigns/${campaignId}/contacts-by-event`). | Keep and remount to restore/retain functionality. |
| `server/routes/campaign-context-routes.ts` | Campaign creation AI workflow | keep | Not mounted, but called by campaign builder components (`/api/campaign-context/*`). | Keep and remount; required for wizard flows. |
| `server/routes/campaign-ingestion-routes.ts` | Campaign creation ingestion | keep | Not mounted, but called by campaign auto-generation flows (`/api/campaigns/ingest*`). | Keep and remount. |
| `server/routes/campaign-preview.ts` | Campaign preview (legacy) | safe_to_archive | Not mounted; no runtime caller evidence for `/preview/*` endpoints from this module. | Archive. |
| `server/routes/campaign-templates.ts` | Campaign templates (legacy set) | safe_to_archive | Not mounted; no runtime caller evidence for this module’s endpoints. | Archive. |
| `server/routes/knowledge-hub.ts` | Knowledge / prompt context | keep | Not mounted, but heavily used by client pages (`/api/knowledge-hub*`). | Keep and remount with auth checks. |
| `server/routes/mailgun-webhook.ts` | Email webhook | safe_to_archive | Not mounted; active webhook handler already exists inline in `server/routes.ts` (`/api/mailgun/webhooks`). | Archive as duplicate legacy module. |
| `server/routes/openai-webrtc.ts` | Realtime AI / WebRTC | keep | Not mounted, but client references `/api/openai/webrtc/ephemeral-token`. | Keep and remount for WebRTC test/support flow. |
| `server/routes/phase6-routes.ts` | Campaign optimization (A/B etc.) | keep | Not mounted, but used by `client/src/components/Phase6Features.tsx` and integration tests. | Keep and remount. |
| `server/routes/preview-studio.ts` | Preview Studio | keep | Not mounted, but many client pages/components call `/api/preview-studio/*`. | Keep and remount with priority. |
| `server/routes/prompt-management.ts` | Prompt management (legacy) | safe_to_archive | Not mounted; active prompt APIs are mounted via `unifiedPromptRouter` on `/api/prompts`. | Archive as superseded by unified prompt routes. |
| `server/routes/prompt-variants-new.ts` | Prompt variants experiment | safe_to_archive | Not mounted; no runtime caller evidence outside variant route files themselves. | Archive. |
| `server/routes/prompt-variants.ts` | Prompt variants legacy | safe_to_archive | Not mounted; no runtime caller evidence. | Archive. |
| `server/routes/sip-agent-websocket.ts` | SIP agent realtime | keep | Not mounted as router, but client `useSIPWebSocket` uses `/api/sip-agent` path and this module exports WS setup. | Keep; wire setup explicitly if SIP flow is active. |
| `server/routes/smi-agent-routes.ts` | SMI intelligence routes | keep | Unmounted with no direct UI refs, but large specialized AI route set; high risk to archive blindly. | Keep pending targeted owner validation. |
| `server/routes/telnyx-webrtc.ts` | Telephony WebRTC credentials | keep | Not mounted, but client pages call `/api/telnyx/webrtc/credentials`. | Keep and remount. |
| `server/routes/vertex-ai.ts` | Vertex AI utilities | keep | Unmounted; no direct caller evidence, but central AI utility surface and high operational risk if removed. | Keep pending AI-owner validation. |
| `server/routes/voice-insights.ts` | Voice insights analytics | safe_to_archive | Not mounted; no runtime caller evidence. Overlaps with active disposition-intelligence/conversation-quality style surfaces. | Archive after confirming no downstream dependency. |

## Summary

- `keep`: 12
- `safe_to_archive`: 10

