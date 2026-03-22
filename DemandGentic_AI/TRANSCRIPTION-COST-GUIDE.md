# Transcription Cost & Speed Guide - January 15, 2026 Calls

## Quick Summary

For transcribing January 15th calls (>60 seconds duration), here are your best options:

### Cost Comparison (2026 Pricing)

| Provider | Cost per Minute | Cost per Hour | Speed | Quality |
|----------|----------------|---------------|-------|---------|
| **AssemblyAI** ⭐ | $0.0025 | $0.15 | Fast (async) | Excellent |
| **Deepgram** | $0.0043 | $0.26 | Very Fast | Excellent |
| **OpenAI Whisper** | $0.006 | $0.36 | Medium (sync) | Excellent |

### Recommendation: **AssemblyAI**

✅ **58% cheaper than Whisper**
✅ **Already installed** in your project
✅ **Excellent accuracy** for business calls
✅ **Fast processing** with async API

## Cost Estimate for Your Jan 15 Calls

Assuming you have ~100 calls averaging 2 minutes each:
- **Total duration**: ~200 minutes
- **AssemblyAI cost**: $0.50
- **Whisper cost**: $1.20
- **Savings with AssemblyAI**: $0.70 (58%)

For 1,000 calls (2,000 minutes):
- **AssemblyAI**: $5.00
- **Whisper**: $12.00
- **Savings**: $7.00 (58%)

## Using the Batch Transcription Script

### Prerequisites

1. **For AssemblyAI** (recommended):
   ```bash
   # Add to .env file
   ASSEMBLYAI_API_KEY=your_key_here
   ```
   Get free API key at: https://www.assemblyai.com/

2. **For Whisper** (already configured):
   - Uses existing `OPENAI_API_KEY` from .env

### Usage

#### 1. Dry Run (Preview only - no changes)
```bash
npx tsx batch-transcribe-jan15.ts
```

#### 2. Execute with AssemblyAI (cheapest)
```bash
npx tsx batch-transcribe-jan15.ts --execute
```

#### 3. Execute with Whisper
```bash
npx tsx batch-transcribe-jan15.ts --execute --provider=whisper
```

#### 4. Test with limited calls first
```bash
# Process only 10 calls to test
npx tsx batch-transcribe-jan15.ts --execute --limit 10 --verbose
```

### Options

- `--execute` - Actually run transcription (omit for dry-run)
- `--provider=assemblyai` - Use AssemblyAI (default)
- `--provider=whisper` - Use OpenAI Whisper
- `--limit N` - Process only first N calls
- `--verbose` - Show detailed progress for each call

## Script Features

✅ **Concurrent Processing** - Processes 5 calls simultaneously for speed
✅ **Auto-retry** - Retries failed transcriptions up to 3 times
✅ **Recording Fetch** - Automatically fetches recordings from Telnyx if missing
✅ **Cost Estimation** - Shows estimated cost before execution
✅ **Progress Tracking** - Real-time progress updates
✅ **Error Handling** - Continues processing even if some calls fail
✅ **Safe Updates** - Appends transcripts without overwriting existing notes

## What Gets Transcribed

The script targets:
- **Date**: January 15, 2026
- **Duration**: Calls ≥ 60 seconds
- **Status**: Only calls without existing transcripts
- **Source**: `dialer_call_attempts` table

## Output Format

Transcripts are saved to the `notes` field in `dialer_call_attempts`:

```
[Call Transcript]
[Transcribed conversation text here...]
```

Existing notes are preserved - transcripts are appended.

## Performance Expectations

### AssemblyAI (async)
- **Submission**: ~1 second per call
- **Processing**: 3-5 seconds per minute of audio
- **Total time for 100 calls** (~2 min avg): ~15-20 minutes

### Whisper (sync)
- **Processing**: Immediate, synchronous
- **Total time for 100 calls** (~2 min avg): ~10-15 minutes

## Next Steps After Transcription

Once transcripts are generated, you can:

1. **Analyze transcripts for insights**:
   ```bash
   npx tsx analyze-transcripts-manual.ts
   ```

2. **Re-evaluate dispositions** based on transcripts:
   ```bash
   npx tsx reevaluate-calls.ts
   ```

3. **Find qualified leads**:
   ```bash
   npx tsx check-qualified-leads.ts
   ```

## Troubleshooting

### No AssemblyAI API Key
If you see "API key not configured":
1. Get free key: https://www.assemblyai.com/
2. Add to `.env`: `ASSEMBLYAI_API_KEY=your_key_here`
3. Restart script

### Recordings Not Found
The script will automatically fetch from Telnyx if:
- `telnyx_call_id` exists in `dialer_call_attempts`
- Recording is available in Telnyx API

### Transcription Failures
- Script retries 3 times automatically
- Check error messages in output
- Common causes:
  - Invalid recording URL
  - Audio file corrupted
  - API rate limits (rare with batch processing)

## Cost Optimization Tips

1. **Use AssemblyAI** for lowest cost ($0.0025/min)
2. **Filter by duration** - Only transcribe calls >60s (already configured)
3. **Test with --limit** first to verify before bulk processing
4. **Batch process** during off-peak hours (no difference in API cost, but better for system load)

## API Provider Details

### AssemblyAI
- **Website**: https://www.assemblyai.com/
- **Pricing**: $0.15/hour base transcription
- **Features**: Speaker diarization (+$0.02/hr), sentiment (+$0.02/hr)
- **Accuracy**: 95%+ for business calls
- **Free tier**: $50 credit (333 hours of transcription!)

### OpenAI Whisper
- **Website**: https://platform.openai.com/docs/guides/speech-to-text
- **Pricing**: $0.006/min flat rate
- **Features**: Multiple languages, high quality
- **Accuracy**: 95%+ across languages
- **Note**: No volume discounts

## Sources & References

This guide is based on 2026 pricing data from:
- [Whisper API Pricing 2026](https://brasstranscripts.com/blog/openai-whisper-api-pricing-2025-self-hosted-vs-managed)
- [AssemblyAI vs Deepgram vs Whisper Comparison](https://www.index.dev/skill-vs-skill/ai-whisper-vs-assemblyai-vs-deepgram)
- [Speech-to-Text API Pricing Breakdown 2025](https://deepgram.com/learn/speech-to-text-api-pricing-breakdown-2025)