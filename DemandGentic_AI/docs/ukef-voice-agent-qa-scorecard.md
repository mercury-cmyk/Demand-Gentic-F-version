# UKEF Voice Agent QA Scorecard

## Purpose
Operational scorecard to reduce the top UKEF high-severity failures and enforce call-opening quality.

## Scoring Model
- Total score: `100`
- Pass threshold: `85`
- Warning threshold: `75-84`
- Fail threshold: ` identity confirm/correct -> purpose statement. | #2 |
| Voicemail Detection and Abort | 12 | Voicemail cues detected in  1 OR realtime.loop_detected = true`
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