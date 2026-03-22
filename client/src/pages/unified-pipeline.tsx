/**
 * Admin Unified Pipeline Page
 *
 * Wraps the UnifiedPipelineTab (same component used in Client Portal)
 * for admin dashboard access with Bearer token auth.
 */

import { UnifiedPipelineTab } from '@/components/unified-pipeline';

export default function UnifiedPipelinePage() {
  const token = localStorage.getItem('authToken') || '';
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  return (
    <div className="p-6 space-y-6">
      <UnifiedPipelineTab authHeaders={authHeaders} />
    </div>
  );
}
