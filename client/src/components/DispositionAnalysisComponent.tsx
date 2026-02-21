import React, { useState } from 'react';
import {
  useDispositionAnalysisJob,
  useJobPolling,
} from './hooks/use-disposition-job-queue';

/**
 * Example component showing how to use the disposition analysis job hooks
 * Demonstrates the complete workflow: schedule → poll → display results → export
 */
export function DispositionAnalysisComponent() {
  const [campaignId, setCampaignId] = useState('');
  const [limit, setLimit] = useState(50);
  const [filters, setFilters] = useState<any>({});
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'json' | 'jsonl'>('csv');

  // Use the combined hook for complete job management
  const job = useDispositionAnalysisJob();

  const handlePreview = async () => {
    try {
      await job.scheduleJob('queue/preview', {
        campaignId,
        limit,
        ...filters,
      });
    } catch (error) {
      console.error('Failed to schedule preview:', error);
    }
  };

  const handleApply = async () => {
    try {
      await job.scheduleJob('queue/apply', {
        campaignId,
        limit,
        ...filters,
      });
    } catch (error) {
      console.error('Failed to schedule apply:', error);
    }
  };

  const handleCancel = async () => {
    const success = await job.cancelJob();
    if (success) {
      job.resetJob();
    }
  };

  const handleExport = async () => {
    const success = await job.exportResults(selectedFormat);
    if (success) {
      console.log(`✅ Results exported as ${selectedFormat.toUpperCase()}`);
    }
  };

  const isJobRunning = job.status && !job.isComplete;

  return (
    <div className="disposition-analysis-container" style={styles.container}>
      <h1>Disposition Reanalysis Tool</h1>

      {/* Input Section */}
      <div style={styles.section}>
        <h2>Configuration</h2>

        <div style={styles.formGroup}>
          <label>Campaign ID:</label>
          <input
            type="text"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            placeholder="Enter campaign ID"
            disabled={!!job.jobId}
            style={styles.input}
          />
        </div>

        <div style={styles.formGroup}>
          <label>Batch Size:</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value))}
            min="10"
            max="1000"
            disabled={!!job.jobId}
            style={styles.input}
          />
        </div>

        {job.scheduleError && (
          <div style={styles.error}>
            <strong>Error:</strong> {job.scheduleError}
          </div>
        )}

        {/* Action Buttons */}
        <div style={styles.buttonGroup}>
          <button
            onClick={handlePreview}
            disabled={!campaignId || job.isScheduling || !!job.jobId}
            style={{
              ...styles.button,
              ...styles.buttonPrimary,
              opacity: !campaignId || job.isScheduling || !!job.jobId ? 0.5 : 1,
            }}
          >
            {job.isScheduling ? 'Scheduling...' : '📊 Preview Changes'}
          </button>

          <button
            onClick={handleApply}
            disabled={!campaignId || job.isScheduling || !!job.jobId}
            style={{
              ...styles.button,
              ...styles.buttonSuccess,
              opacity: !campaignId || job.isScheduling || !!job.jobId ? 0.5 : 1,
            }}
          >
            {job.isScheduling ? 'Scheduling...' : '✅ Apply Changes'}
          </button>

          {job.jobId && (
            <button
              onClick={handleCancel}
              disabled={job.isCanceling}
              style={{
                ...styles.button,
                ...styles.buttonDanger,
                opacity: job.isCanceling ? 0.5 : 1,
              }}
            >
              {job.isCanceling ? 'Canceling...' : '❌ Cancel'}
            </button>
          )}
        </div>
      </div>

      {/* Status Section */}
      {job.jobId && (
        <div style={styles.section}>
          <h2>Job Status</h2>

          {job.status ? (
            <div style={styles.statusCard}>
              <div style={styles.statusRow}>
                <span>Job ID:</span>
                <code style={styles.code}>{job.jobId}</code>
              </div>

              <div style={styles.statusRow}>
                <span>Status:</span>
                <span style={getStatusStyle(job.status.status)}>
                  {job.status.status.toUpperCase()}
                </span>
              </div>

              <div style={styles.statusRow}>
                <span>Progress:</span>
                <span>
                  {job.status.processed} / {job.status.total} calls (
                  {job.progress}%)
                </span>
              </div>

              {/* Progress Bar */}
              <div style={styles.progressBar}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${job.progress}%`,
                  }}
                />
              </div>

              <div style={styles.statusRow}>
                <span>Estimated Time Remaining:</span>
                <span>
                  {job.status.estimatedSecondsRemaining > 0
                    ? `${job.status.estimatedSecondsRemaining}s`
                    : 'Complete'}
                </span>
              </div>

              {job.isLoading && (
                <div style={styles.loadingSpinner}>⏳ Updating status...</div>
              )}

              {job.error && (
                <div style={styles.error}>
                  <strong>Status Error:</strong> {job.error}
                </div>
              )}
            </div>
          ) : (
            <div style={styles.loadingSpinner}>⏳ Fetching job status...</div>
          )}
        </div>
      )}

      {/* Results Section */}
      {job.isComplete && job.result && (
        <div style={styles.section}>
          <h2>Analysis Results</h2>

          <div style={styles.resultsCard}>
            <div style={styles.resultRow}>
              <div style={styles.resultMetric}>
                <div style={styles.metricValue}>
                  {job.result.totalCalls}
                </div>
                <div style={styles.metricLabel}>Total Calls Analyzed</div>
              </div>

              <div style={styles.resultMetric}>
                <div
                  style={{
                    ...styles.metricValue,
                    color: job.result.totalShouldChange > 0 ? '#dc2626' : '#10b981',
                  }}
                >
                  {job.result.totalShouldChange}
                </div>
                <div style={styles.metricLabel}>Should Change</div>
              </div>

              <div style={styles.resultMetric}>
                <div style={styles.metricValue}>
                  {job.result.executionTimeSeconds}s
                </div>
                <div style={styles.metricLabel}>Execution Time</div>
              </div>
            </div>

            {job.result.totalShouldChange > 0 && (
              <div style={styles.exportSection}>
                <h3>Export Results</h3>

                <div style={styles.formGroup}>
                  <label>Format:</label>
                  <select
                    value={selectedFormat}
                    onChange={(e) =>
                      setSelectedFormat(
                        e.target.value as 'csv' | 'json' | 'jsonl'
                      )
                    }
                    style={styles.select}
                  >
                    <option value="csv">CSV (Excel-compatible)</option>
                    <option value="json">JSON (Pretty-printed)</option>
                    <option value="jsonl">JSONL (One per line)</option>
                  </select>
                </div>

                <button
                  onClick={handleExport}
                  disabled={job.isExporting}
                  style={{
                    ...styles.button,
                    ...styles.buttonInfo,
                    opacity: job.isExporting ? 0.5 : 1,
                  }}
                >
                  {job.isExporting
                    ? 'Exporting...'
                    : `💾 Download as ${selectedFormat.toUpperCase()}`}
                </button>

                {job.exportError && (
                  <div style={styles.error}>
                    <strong>Export Error:</strong> {job.exportError}
                  </div>
                )}
              </div>
            )}

            {/* Sample Result Preview */}
            {job.result.result && job.result.result.length > 0 && (
              <div style={styles.previewSection}>
                <h3>Sample Results (First 3)</h3>
                <pre
                  style={styles.preview}
                >
                  {JSON.stringify(
                    job.result.result.slice(0, 3),
                    null,
                    2
                  )}
                </pre>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={styles.buttonGroup}>
            <button
              onClick={() => job.resetJob()}
              style={{
                ...styles.button,
                ...styles.buttonSecondary,
              }}
            >
              🔄 Run Another Analysis
            </button>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div style={styles.infoSection}>
        <h3>ℹ️ How It Works</h3>
        <ul>
          <li>
            <strong>Preview:</strong> Shows what changes would be made without
            modifying the database
          </li>
          <li>
            <strong>Apply:</strong> Makes the recommended changes permanently
          </li>
          <li>
            <strong>Real-time Updates:</strong> Progress updates automatically
            every 1-2 seconds
          </li>
          <li>
            <strong>Export:</strong> Download results in CSV, JSON, or JSONL
            format
          </li>
        </ul>
      </div>
    </div>
  );
}

// Helper function to get status styling
function getStatusStyle(status: string) {
  const styles: any = {
    backgroundColor: '#f3f4f6',
    padding: '4px 12px',
    borderRadius: '4px',
    fontWeight: 'bold',
    fontSize: '12px',
  };

  switch (status) {
    case 'waiting':
      styles.color = '#9333ea';
      styles.backgroundColor = '#f3e8ff';
      break;
    case 'processing':
      styles.color = '#0ea5e9';
      styles.backgroundColor = '#e0f2fe';
      break;
    case 'completed':
      styles.color = '#10b981';
      styles.backgroundColor = '#ecfdf5';
      break;
    case 'failed':
      styles.color = '#dc2626';
      styles.backgroundColor = '#fee2e2';
      break;
  }

  return styles;
}

// Styles object
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  },

  section: {
    backgroundColor: 'white',
    padding: '24px',
    marginBottom: '24px',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },

  formGroup: {
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,

  input: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    marginTop: '4px',
  },

  select: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    marginTop: '4px',
  },

  buttonGroup: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
    flexWrap: 'wrap',
  },

  button: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  buttonPrimary: {
    backgroundColor: '#3b82f6',
    color: 'white',
  },

  buttonSuccess: {
    backgroundColor: '#10b981',
    color: 'white',
  },

  buttonDanger: {
    backgroundColor: '#dc2626',
    color: 'white',
  },

  buttonSecondary: {
    backgroundColor: '#6b7280',
    color: 'white',
  },

  buttonInfo: {
    backgroundColor: '#8b5cf6',
    color: 'white',
  },

  statusCard: {
    backgroundColor: '#f9fafb',
    padding: '16px',
    borderRadius: '4px',
    border: '1px solid #e5e7eb',
  },

  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,

  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
    margin: '12px 0',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    transition: 'width 0.3s ease',
  },

  code: {
    backgroundColor: '#f3f4f6',
    padding: '2px 6px',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '12px',
  },

  loadingSpinner: {
    color: '#6b7280',
    fontStyle: 'italic',
    padding: '12px',
  },

  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '12px',
    borderRadius: '4px',
    marginTop: '12px',
    border: '1px solid #fecaca',
  },

  resultsCard: {
    backgroundColor: '#f9fafb',
    padding: '24px',
    borderRadius: '4px',
    border: '1px solid #e5e7eb',
  },

  resultRow: {
    display: 'flex',
    gap: '24px',
    justifyContent: 'space-around',
    marginBottom: '24px',
  },

  resultMetric: {
    textAlign: 'center' as const,
  },

  metricValue: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
  },

  metricLabel: {
    fontSize: '12px',
    color: '#6b7280',
    textTransform: 'uppercase' as const,
  },

  exportSection: {
    marginTop: '24px',
    paddingTop: '24px',
    borderTop: '1px solid #e5e7eb',
  },

  previewSection: {
    marginTop: '24px',
    paddingTop: '24px',
    borderTop: '1px solid #e5e7eb',
  },

  preview: {
    backgroundColor: '#1f2937',
    color: '#10b981',
    padding: '12px',
    borderRadius: '4px',
    overflow: 'auto',
    fontSize: '12px',
    maxHeight: '300px',
  },

  infoSection: {
    backgroundColor: '#eff6ff',
    padding: '16px',
    borderRadius: '4px',
    border: '1px solid #bfdbfe',
    color: '#1e40af',
  },
};
