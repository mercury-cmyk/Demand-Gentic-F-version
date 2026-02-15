# Telnyx Qualified Lead Recording Import & Verification

## Import Script

- Script: `import-telnyx-qualified-lead-recordings.ts`
- Usage: Run locally with your admin environment (Node.js, tsx, or similar):

```
npx tsx import-telnyx-qualified-lead-recordings.ts
```
- The script will:
  - Search Telnyx for the specified recordings (by date, from/to, duration ±5s)
  - Insert minimal metadata (recording ID, from, to, duration, org) into the DB
  - Skip if already imported
  - Output a summary of imported recordings

## Verification Steps (Localhost)

1. Run the import script as above.
2. Login as a client user for the target org (Green Leads) in the Client Portal.
3. Open the Qualified Leads page:
   - The three imported recordings should appear as rows/cards with correct metadata (date/time, from/to, duration, provider badge).
4. Click Play on each recording:
   - Audio should play seamlessly in-app (no Telnyx URL exposed, no redirect).
   - Refresh the page and play again after >10 minutes to confirm fresh URL resolution.
5. Confirm that only the correct org's leads/recordings are visible to the client.
6. No .env or secret changes are required. No deployment is performed.

## Safety/Constraints
- No changes to .env or secrets.
- No breaking changes to existing call recording or intelligence pages.
- All changes are local and reversible.

---

If you need to re-import or test with different recordings, update the `RECORDINGS_TO_IMPORT` array in the script and re-run.
