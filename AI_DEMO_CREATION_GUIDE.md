# How to Create AI-Powered Screen Demos

This guide explains how to generate a professional product demo using **AI Voiceover** (Google Cloud TTS) and **Automated Screen Recording** (Playwright).

## 1. Architecture

1.  **Script Phase**: Define the text script you want the AI to read.
2.  **Audio Generation**: Use `scripts/generate-demo-voiceover.ts` to create the `.mp3`.
3.  **Video Capture**: Use a browser automation tool (Playwright) to navigate the dashboard while recording.
4.  **Assembly**: The browser recorder captures the visual flow. You can overlay the audio later, or play it during recording (advanced).

---

## 2. Generate the AI Voiceover

We have created a script that uses your existing Google Cloud credentials to generate a high-quality "Journey" or "Studio" voice.

1.  Open `scripts/generate-demo-voiceover.ts`.
2.  Edit the `DEMO_SCRIPT_TEXT` constant with your desired script.
3.  Run the generator:

```bash
npx tsx scripts/generate-demo-voiceover.ts
```

**Output**: `demo_assets/demo_voiceover.mp3`

---

## 3. Capture Screen Video (Recommended Method)

To record a smooth, perfect demo, we recommend using **Playwright**. It controls the browser programmatically, ensuring no mouse jitters.

### Prerequisites
You need to install Playwright.

```bash
npm install -D @playwright/test
npx playwright install chromium
```

### Run the Recording Script

We have created a dedicated automation script at `scripts/record-demo.spec.ts`. This script navigates through the main sections of the client dashboard:
1.  Overview Dashboard
2.  Campaigns
3.  Leads
4.  Analytics & Reports
5.  Account Intelligence Settings

To run the recorder (ensure your dev server is running first):

```bash
npx playwright test scripts/record-demo.spec.ts --headed --project=chromium
```

The video will be saved in `test-results/` (check the output folder in the console).

To customize the timing, edit `STEP_DELAY` in `scripts/record-demo.spec.ts`.



---

## 4. Combine Audio and Video

Finally, combine the AI-generated voiceover with the screen recording using **FFmpeg**.

```bash
ffmpeg -i demo_assets/video/YOUR_VIDEO_FILE.webm -i demo_assets/demo_voiceover.mp3 -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 output_demo.mp4
```

## Tips for Pro Demos

*   **Smooth Mouse**: Playwright's `page.mouse.move(x, y, { steps: 20 })` creates smooth, human-like movement instead of instant jumping.
*   **Data Setup**: Create a specific "Demo User" in your seed scripts so the dashboard always looks populated and clean.
*   **Sync**: Measure the duration of your generated MP3 first, then adjust your `page.waitForTimeout` calls in the Playwright script to match the pacing of the voice.
