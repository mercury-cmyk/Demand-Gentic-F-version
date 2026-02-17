# UKEF Voice Agent QA Scorecard

## Purpose
Operational scorecard to reduce the top UKEF high-severity failures and enforce call-opening quality.

## Scoring Model
- Total score: `100`
- Pass threshold: `85`
- Warning threshold: `75-84`
- Fail threshold: `<75`
- Hard-fail rules override score.

## Hard-Fail Rules
- No clear purpose/value statement within `2.0s` after identity confirmation.
- Full live-call script delivered to voicemail.
- Startup loop: opener repeated more than once in the first `10s`.
- Unacknowledged direct question ("who is this?", "are you there?") for more than `1.5s`.

## Dimensions
| Dimension | Weight | Pass Criteria | Maps To |
|---|---:|---|---|
| Opening Compression and Value Pivot | 35 | After identity confirmation, purpose starts in <= `700ms` and includes offer ("free Leading with Finance white paper"). | #1, #2 |
| Intro Flow Reliability | 20 | Opening sequence executes fully: request contact -> identity confirm/correct -> purpose statement. | #2 |
| Voicemail Detection and Abort | 12 | Voicemail cues detected in <= `3s`; switch to voicemail path immediately. | #3 |
| Responsiveness to Direct Inquiries | 8 | Identity/connectivity questions acknowledged in <= `1.0s` with direct response. | #9 |
| Technical Stability | 20 | No startup looping, p95 agent response latency <= `900ms`, max dead air <= `1200ms`, audible quality acceptable. | #5, #6, #7, #8 |
| Data Quality Outcome Handling | 5 | "Contact unknown" outcomes flagged for enrichment/suppression within `24h`. | #4 |

## Required Event Telemetry
- `opening.identity_prompt_sent_at`
- `opening.identity_confirmed_at`
- `opening.purpose_started_at`
- `opening.value_statement_completed_at`
- `opening.restart_count`
- `realtime.voicemail_detected_at`
- `realtime.first_human_audio_at`
- `realtime.max_dead_air_ms`
- `realtime.p95_model_latency_ms`
- `realtime.loop_detected`
- `qa.contact_unknown_flagged_at`

## Metric Definitions
- `purpose_gap_ms = opening.purpose_started_at - opening.identity_confirmed_at`
- `vm_detection_ms = realtime.voicemail_detected_at - realtime.first_human_audio_at`
- `startup_loop_flag = opening.restart_count > 1 OR realtime.loop_detected = true`
- `direct_question_ack_ms = agent_ack_timestamp - prospect_direct_question_timestamp`

## Weekly Targets
- Reduce opening failures (#1 + #2) by `>=50%` in 2 weeks.
- Keep technical failures (#5-#8) below `3%` of total calls.
- Keep voicemail script leakage (#3) below `1%` of answered calls.
- Keep "contact unknown but not flagged" at `0%`.

## Disposition and Action Mapping
- `voicemail_misfire`: immediate bug ticket + provider/VAD trace capture.
- `startup_loop`: block deployment and roll back latest audio/session config.
- `contact_unknown`: set suppression + enrichment queue status.
- `identity_or_connectivity_unanswered`: mark as responsiveness defect and retrain prompt/state logic.

