# Analyzing "Not Interested" Leads

We have created a script to analyze calls marked as "not_interested" from the last 48 hours. This analysis helps identify common objections, data quality issues, and potential areas for script improvement.

## How to Run the Analysis

Open a terminal and run:

```bash
npx tsx analyze-not-interested-leads.ts
```

This will:
1. Fetch all calls marked "not_interested" in the last 48 hours.
2. Display a summary of each call in the terminal.
3. Save a detailed report to `not_interested_analysis.csv` in your project root.

## Output Format

The CSV export contains:
*   **Campaign**: Which campaign the call was part of.
*   **Contact Name/Phone**: Who was called.
*   **Time**: When the call occurred.
*   **Duration**: How long the call lasted.
*   **AI Outcome**: The machine-readable outcome code.
*   **Summary**: A human-readable summary of the conversation (often explains *why* they weren't interested).
*   **Transcript Snippet**: The first 100 characters of the transcript.
*   **Recording URL**: Link to listen to the call audio.

## Initial Findings (Sample Run)

From a preliminary run, we observed:
*   **Timing Issues**: Some contacts were busy (e.g., "I'm breastfeeding").
*   **Data Quality**: Some contacts questioned how we got their number or were in the wrong geography (e.g., "I live in the United States" for a Canadian campaign?).
*   **Direct Refusals**: Simple "No" or "Not interested".
*   **Transcription Issues**: Some calls failed to transcribe, which might impede analysis.

## Investigating Transcription Failures

If you see "Transcription failed" or "No transcript available", check the `Recording URL` column. If the URL works, the audio exists but the transcription service failed.