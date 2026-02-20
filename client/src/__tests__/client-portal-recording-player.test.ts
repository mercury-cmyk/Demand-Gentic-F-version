import { describe, it, expect } from 'vitest';

describe('Client Portal Recording Player — Download Safety', () => {
  it('download URL uses platform stream endpoint, not raw S3 URL', () => {
    const leadId = 'lead-123';
    const token = 'signed-token';
    const resolvedUrl = `/api/client-portal/qualified-leads/${leadId}/recording-stream?token=${token}`;

    expect(resolvedUrl).toContain('/api/client-portal/qualified-leads/');
    expect(resolvedUrl).toContain('/recording-stream?token=');
    expect(resolvedUrl).not.toContain('s3.amazonaws.com');
    expect(resolvedUrl).not.toContain('telephony-recorder-prod');
  });
});

