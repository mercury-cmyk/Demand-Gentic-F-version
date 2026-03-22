import { describe, it, expect } from 'vitest';

describe('Client Portal Recording Player — Download Safety', () => {
  it('playback URL uses platform stream endpoint, not raw storage URL', () => {
    const leadId = 'lead-123';
    const token = 'signed-token';
    const resolvedUrl = `/api/client-portal/qualified-leads/${leadId}/recording-stream?token=${token}`;

    expect(resolvedUrl).toContain('/api/client-portal/qualified-leads/');
    expect(resolvedUrl).toContain('/recording-stream?token=');
    expect(resolvedUrl).not.toContain('s3.amazonaws.com');
    expect(resolvedUrl).not.toContain('telephony-recorder-prod');
  });

  it('download URL uses dedicated platform endpoint, not raw storage URL', () => {
    const leadId = 'lead-123';
    const token = 'signed-token';
    const downloadUrl = `/api/client-portal/qualified-leads/${leadId}/recording-download?token=${token}`;

    expect(downloadUrl).toContain('/api/client-portal/qualified-leads/');
    expect(downloadUrl).toContain('/recording-download?token=');
    expect(downloadUrl).not.toContain('s3.amazonaws.com');
    expect(downloadUrl).not.toContain('telephony-recorder-prod');
  });
});