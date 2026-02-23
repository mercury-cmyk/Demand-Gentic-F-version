# Active File Audit

Generated at: 2026-02-23T22:58:47.126Z

## Entrypoints

- Core runtime: client/src/main.tsx, server/gemini-relay.ts, server/index.ts, server/services/livekit/worker.ts
- Package script files discovered: 12

## Counts

- Total code files scanned: 1966
- Runtime reachable files: 917
- Runtime + package-script reachable files: 926
- Tooling-only files (not runtime but reachable from package scripts): 9
- Core-domain files not operationally reachable (candidate archive): 265

## Backend Route Footprint

- Route modules on disk: 145
- Route modules mounted via app.use: 106
- Route modules imported in server/routes.ts: 106
- Route modules likely unused (not mounted and not runtime-reachable): 22

## Frontend Route Footprint

- <Route> declarations in App.tsx: 213
- Unique route paths: 203

## Operational Category Coverage (runtime-reachable)

- Campaign/Execution files: 225
- AI files: 397
- Database/Data files: 29
- Integration/Webhook files: 69

## Candidate Archive Files (sample)

- client/src/components/accounts/account-activity-panel.tsx
- client/src/components/accounts/account-header.tsx
- client/src/components/accounts/account-intelligence-workspace.tsx
- client/src/components/accounts/account-lists-tags-panel.tsx
- client/src/components/accounts/account-profile-panel.tsx
- client/src/components/accounts/AccountEmailActivityTimeline.tsx
- client/src/components/accounts/related-contacts-table.tsx
- client/src/components/admin-agentic/agentic-campaign-chat.tsx
- client/src/components/admin-agentic/context-extractor.tsx
- client/src/components/admin-agentic/index.ts
- client/src/components/admin-agentic/step-configuration-panel.tsx
- client/src/components/admin-agentic/voice-selector.tsx
- client/src/components/agent-panel/order-agent/index.ts
- client/src/components/agent-panel/order-agent/order-agent-types.ts
- client/src/components/agent-panel/order-agent/OrderConfigurationCard.tsx
- client/src/components/agent-panel/order-agent/OrderContextPanel.tsx
- client/src/components/agent-panel/order-agent/OrderCostEstimate.tsx
- client/src/components/agents/prompt-variant-management.tsx
- client/src/components/agents/prompt-variant-selector.tsx
- client/src/components/ai-studio/account-intelligence/pipeline-status.tsx
- client/src/components/ai-studio/account-intelligence/reasoning-engine-view.tsx
- client/src/components/ai-studio/account-intelligence/research-engine-view.tsx
- client/src/components/ai-studio/operator/chat-interface.tsx
- client/src/components/ai-studio/org-intelligence/company-profile-form.tsx
- client/src/components/ai-studio/org-intelligence/compliance-rules.tsx
- client/src/components/ai-studio/org-intelligence/playbook-manager.tsx
- client/src/components/ai-studio/org-intelligence/tabs/assets-manager.tsx
- client/src/components/ai-studio/org-intelligence/tabs/notes-overrides.tsx
- client/src/components/ai-studio/org-intelligence/tabs/services-offers.tsx
- client/src/components/ai-studio/org-intelligence/tabs/training-center.tsx
- client/src/components/app-sidebar_v1.tsx
- client/src/components/business-hours-config.tsx
- client/src/components/campaign-builder/campaign-auto-generate.tsx
- client/src/components/campaign-builder/role-expansion.tsx
- client/src/components/campaign-builder/section-editor.tsx
- client/src/components/campaign-builder/step-campaign-context.tsx
- client/src/components/campaign-builder/step-phone-number.tsx
- client/src/components/campaign-builder/step2-email-content.tsx
- client/src/components/campaign-builder/step2-telemarketing-content.tsx
- client/src/components/campaign-builder/step2b-dial-mode-config.HEAD.tsx
- client/src/components/campaign-builder/step2b-dial-mode-config.tsx
- client/src/components/campaign-builder/step4b-suppressions.tsx
- client/src/components/campaign-builder/voice-input.tsx
- client/src/components/campaign-link-dialog.tsx
- client/src/components/campaigns/campaign-org-intelligence-binding.tsx
- client/src/components/campaigns/org-context-loader.tsx
- client/src/components/campaigns/unified-campaign-card.tsx
- client/src/components/client-portal/agent/client-agent-chat.tsx
- client/src/components/client-portal/email/ai-email-test-dialog.tsx
- client/src/components/client-portal/email/email-template-generator-panel.tsx
- client/src/components/client-portal/email/index.ts
- client/src/components/client-portal/index.ts
- client/src/components/client-portal/leads/call-recordings-view.tsx
- client/src/components/client-portal/orders/agentic-campaign-order-panel.tsx
- client/src/components/client-portal/orders/index.ts
- client/src/components/client-portal/reports/index.ts
- client/src/components/client-portal/work-orders/index.ts
- client/src/components/client-portal/work-orders/work-orders-list.tsx
- client/src/components/custom-fields-renderer.tsx
- client/src/components/DispositionAnalysisComponent.tsx
- client/src/components/filter-bar-advanced.tsx
- client/src/components/filters/async-typeahead-filter.tsx
- client/src/components/filters/chips-bar.tsx
- client/src/components/filters/filter-shell.tsx
- client/src/components/filters/multi-select-filter.tsx
- client/src/components/filters/operator-based-filter.tsx
- client/src/components/filters/operator-pills.tsx
- client/src/components/filters/text-query-input.tsx
- client/src/components/layout/page-nav.tsx
- client/src/components/NavItem.tsx
- client/src/components/patterns/chips-list.tsx
- client/src/components/patterns/copy-button.tsx
- client/src/components/patterns/detail-page-layout.tsx
- client/src/components/patterns/engagement-summary.tsx
- client/src/components/patterns/field-group.tsx
- client/src/components/patterns/index.ts
- client/src/components/patterns/kanban-board.tsx
- client/src/components/patterns/stepper.tsx
- client/src/components/Phase6Features.tsx
- client/src/components/pipeline/email-sequence-form-dialog.tsx
- ... and 185 more

## Likely Manual Scripts (sample)

- _cleanup-qc.ts
- _diagnose-rc-deep.ts
- _diagnose-rc-leads.ts
- _reject-rc-bad-leads.ts
- _run-prod-migrations.ts
- .tmp-campaign-queue-columns.cjs
- .tmp-campaign-queue-statuses.cjs
- .tmp-check-campaign-status.cjs
- .tmp-check-pm-approve-ids.cjs
- .tmp-clear-stale-stall-reason.cjs
- .tmp-columns-check.cjs
- .tmp-contacts-columns.cjs
- .tmp-force-publish-27.cjs
- .tmp-pm-override-preview-27.cjs
- .tmp-pm-queue-check.cjs
- .tmp-ringcentral-stall-check.ts
- .tmp-ukef-attempt-evidence.cjs
- .tmp-ukef-attempt-summary.cjs
- .tmp-ukef-campaign-confirm.cjs
- .tmp-ukef-cleanup-dryrun.cjs
- .tmp-ukef-diagnostics.cjs
- .tmp-ukef-failed-starts.cjs
- .tmp-ukef-final-health.cjs
- .tmp-ukef-phone-quality.cjs
- .tmp-ukef-placeholder-cleanup.cjs
- .tmp-ukef-post-cleanup-health.cjs
- .tmp-ukef-queue-markers.cjs
- .tmp-ukef-queued-placeholder-check.cjs
- .tmp-ukef-runs.cjs
- .tmp-ukef-schema-safe-diagnostics.cjs
- .tmp-ukef-second-pass-cleanup.cjs
- .tmp-ukef-second-pass-dryrun.cjs
- .tmp-ukef-third-pass-cleanup.cjs
- .tmp-ukef-uk-whitelist-proof.cjs
- .tmp-ukef-whitelist-count.cjs
- .tmp-verify-published-27.cjs
- add-approval-notes-migration.ts
- add-call-flow-tables-migration.ts
- add-callback-phone.ts
- add-campaign-types.ts
- add-client-invite-links-migration.ts
- add-global-agent-defaults-migration.ts
- add-intake-request-id-migration.ts
- add-intake-request-id-to-campaigns.ts
- add-intelligence-toggle-migration.ts
- add-jan15-leads.ts
- add-jordan-radewan-lead.ts
- add-numbers-with-cnam.ts
- add-org-intelligence-columns.ts
- add-recording-fields-migration.ts
- add-telephony-providers-migration.ts
- add-telnyx-columns.ts
- add-telnyx-recording-id-migration.ts
- add-unified-agent-architecture-migration.ts
- add-voice-enum-values.ts
- analyze-7day-dispositions.ts
- analyze-ai-dispositions.ts
- analyze-ai-missing-leads.ts
- analyze-all-jan15-calls.ts
- analyze-back-to-back-calls.ts
- analyze-call-quality.ts
- analyze-calls-7d.ts
- analyze-completed-calls.ts
- analyze-disposition-engagement.ts
- analyze-dispositions.ts
- analyze-genuine-leads-7d.ts
- analyze-improvement.ts
- analyze-invalid-data.ts
- analyze-jan-19-20-calls.ts
- analyze-jan15-transcripts.ts
- analyze-jan30-31-calls.ts
- analyze-legacy-leads.ts
- analyze-missed-leads.ts
- analyze-multiple-days.ts
- analyze-needs-review.ts
- analyze-no-answer-dispositions.ts
- analyze-not-interested-leads.ts
- analyze-pending-review.ts
- analyze-qualified-potential.ts
- analyze-real-calls-properly.ts
- ... and 528 more

## Safety Note

- This is static reachability (imports + route mounts).
- Dynamic runtime loading (string-based imports, DB-driven config, external schedulers) can create false negatives.
- Treat candidate lists as review queues, not delete queues.

Full details: docs/reports/active-files-audit.json

