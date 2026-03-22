# Duplicate Page Cleanup Plan

## Overview

This document outlines the safe, phased approach for consolidating multiple conversation/call intelligence pages into the new Unified Intelligence page. **No deletions should be performed until the Unified Intelligence page has been validated in production.**

---

## Pages/Routes That Become Redundant

After the Unified Intelligence page is fully validated, the following pages can be consolidated:

| Page | Route | File Path | Status |
|------|-------|-----------|--------|
| Conversation Quality | `/conversation-quality` | `client/src/pages/conversation-quality.tsx` | Redundant |
| Call Intelligence Dashboard | `/call-intelligence` | `client/src/pages/call-intelligence-dashboard.tsx` | Redundant |
| Call Recordings | `/recordings` | `client/src/pages/call-recordings.tsx` | Redundant |
| Campaign Test Panel (partial) | Component in campaigns | `client/src/components/campaigns/campaign-test-panel.tsx` | Keep - still used in campaign detail view |

### Routes to Remove (after validation)

```typescript
// In client/src/App.tsx, these routes can be removed:



```

### Route Constants to Remove (after validation)

```typescript
// In client/src/lib/routes.ts:
CONVERSATION_QUALITY: '/conversation-quality',
CALL_INTELLIGENCE: '/call-intelligence', 
RECORDINGS: '/recordings',
```

---

## Shared Modules/Components That MUST Remain

The following components are used elsewhere and must NOT be deleted:

### 1. Call Intelligence Component Library
**Location:** `client/src/components/call-intelligence/`

| Component | Used By | Keep? |
|-----------|---------|-------|
| `AudioPlayerEnhanced.tsx` | Campaign Test Panel, Unified Intelligence | ✅ Yes |
| `TranscriptDisplay.tsx` | Campaign Test Panel | ✅ Yes |
| `QualityMetricsPanel.tsx` | Campaign Test Panel, Call Intelligence | ✅ Yes |
| `CallList.tsx` | Call Intelligence Dashboard | ⚠️ Review |
| `CallFilters.tsx` | Call Intelligence Dashboard | ⚠️ Review |
| `useCallIntelligence.ts` | Multiple | ✅ Yes |

### 2. Campaign Test Panel
**Location:** `client/src/components/campaigns/campaign-test-panel.tsx`

This component is embedded in campaign detail views and provides test call functionality. It should remain as-is since it serves a different use case (testing campaigns).

### 3. API Routes
**Location:** `server/routes/`

| Route File | Endpoints | Keep? |
|------------|-----------|-------|
| `call-intelligence-routes.ts` | `/api/call-intelligence/*` | ✅ Yes |
| `recordings.ts` | `/api/recordings/*` | ✅ Yes |
| `routes.ts` (qa section) | `/api/qa/conversations` | ✅ Yes |

**Note:** All API routes must remain as they serve the Unified Intelligence page and other consumers.

### 4. Shared Types/Utilities
**Location:** `shared/types/`

All shared types should remain as they may be used by API routes and other components.

---

## Safe Phased Cleanup Plan

### Phase 0: Current State (NOW)
- ✅ Unified Intelligence page created at `/unified-intelligence`
- ✅ All existing pages remain functional
- ✅ No breaking changes

### Phase 1: Validation (Week 1-2)
- [ ] Deploy Unified Intelligence page to staging
- [ ] QA team validates all functionality:
  - [ ] Filters and search work correctly
  - [ ] Recording playback works (no CORS/auth/expired URL issues)
  - [ ] Two-sided transcripts render correctly
  - [ ] Call analysis matches Test AI Agent format
  - [ ] Quality scores display properly
  - [ ] Real-time updates work for in-progress calls
- [ ] Collect user feedback
- [ ] Fix any critical bugs

### Phase 2: Soft Launch (Week 3-4)
- [ ] Add Unified Intelligence to main navigation
- [ ] Add deprecation notices to old pages:
  ```tsx
  
    This page is being consolidated into the new 
    Unified Intelligence page.
  
  ```
- [ ] Monitor usage analytics for both old and new pages
- [ ] Continue collecting feedback

### Phase 3: Navigation Redirect (Week 5-6)
- [ ] Update navigation to point to Unified Intelligence
- [ ] Add automatic redirects from old routes:
  ```tsx
  // In App.tsx
  
    
  
  ```
- [ ] Keep old pages functional but hidden from nav
- [ ] Monitor for any issues

### Phase 4: Final Cleanup (Week 7+)
Only proceed if:
- No critical bugs reported in 2+ weeks
- User feedback is positive
- Analytics show successful migration

**Files to Delete:**
```
client/src/pages/conversation-quality.tsx
client/src/pages/call-intelligence-dashboard.tsx
client/src/pages/call-recordings.tsx
```

**Route changes in App.tsx:**
- Remove the three deprecated page routes
- Remove the redirect routes (users should have updated bookmarks)

**Route constants in routes.ts:**
- Remove deprecated route constants

---

## Pre-Deletion Checklist

Before deleting any file, verify:

- [ ] No imports reference the file (grep search)
- [ ] No routes point to the component
- [ ] No navigation links to the old routes
- [ ] Analytics confirm minimal usage
- [ ] Support team is aware of the change
- [ ] Documentation is updated

### Search Commands

```bash
# Check for imports of deprecated pages
grep -r "conversation-quality" client/src --include="*.tsx" --include="*.ts"
grep -r "call-intelligence-dashboard" client/src --include="*.tsx" --include="*.ts"
grep -r "call-recordings" client/src --include="*.tsx" --include="*.ts"

# Check for route references
grep -r "CONVERSATION_QUALITY\|CALL_INTELLIGENCE\|RECORDINGS" client/src --include="*.tsx" --include="*.ts"
```

---

## Rollback Plan

If issues are discovered after cleanup:

1. **Immediate:** Revert the App.tsx changes to restore old routes
2. **Files:** Old page files can be recovered from git history
3. **Data:** No data migrations involved - rollback is safe

---

## Summary

| Phase | Timeline | Action | Risk |
|-------|----------|--------|------|
| 0 | Now | Deploy new page alongside existing | None |
| 1 | Week 1-2 | Validate and fix bugs | Low |
| 2 | Week 3-4 | Add deprecation notices | Low |
| 3 | Week 5-6 | Redirect old routes | Medium |
| 4 | Week 7+ | Delete deprecated files | Medium |

**Golden Rule:** Never delete until the replacement is proven stable.