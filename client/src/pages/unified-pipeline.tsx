/**
 * Admin Unified Pipeline Page
 *
 * Wraps the UnifiedPipelineTab (same component used in Client Portal)
 * for admin dashboard access with cookie-based auth.
 */

import { UnifiedPipelineTab } from '@/components/unified-pipeline';

export default function UnifiedPipelinePage() {
  // Admin uses cookie-based auth — no explicit Authorization header needed.
  // The UnifiedPipelineTab's fetch calls hit /api/unified-pipelines which uses requireAuth (cookie).
  const authHeaders = { headers: { Authorization: '' } };

  return (
    <div className="p-6 space-y-6">
      <UnifiedPipelineTab authHeaders={authHeaders} />
    </div>
  );
}
