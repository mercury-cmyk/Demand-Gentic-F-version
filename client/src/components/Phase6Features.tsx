// File: client/src/components/Phase6Features.tsx
// Phase 6 Advanced Features Frontend Components

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import './Phase6Features.css';

// ====================
// A/B Testing Component
// ====================

interface ABTestConfig {
  name: string;
  variantA: string;
  variantB: string;
  splitPercentage: number;
}

interface ABTestResult {
  testId: string;
  variantA: {
    opens: number;
    clicks: number;
    bounces: number;
    openRate: number;
    clickRate: number;
  };
  variantB: {
    opens: number;
    clicks: number;
    bounces: number;
    openRate: number;
    clickRate: number;
  };
  significance: number;
  winner?: 'A' | 'B';
}

export const ABTestingPanel: React.FC<{ campaignId: string }> = ({
  campaignId,
}) => {
  const [tests, setTests] = useState<ABTestConfig[]>([]);
  const [results, setResults] = useState<ABTestResult | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<ABTestConfig>({
    name: '',
    variantA: '',
    variantB: '',
    splitPercentage: 50,
  });

  const handleCreateTest = async () => {
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/ab-tests`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        }
      );

      if (response.ok) {
        const result = await response.json();
        setTests([...tests, formData]);
        setFormData({
          name: '',
          variantA: '',
          variantB: '',
          splitPercentage: 50,
        });
        alert('A/B test created successfully');
      }
    } catch (error) {
      console.error('Failed to create A/B test:', error);
    }
  };

  const handleDeclareWinner = async (testId: string, winner: 'A' | 'B') => {
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/ab-tests/${testId}/declare-winner`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ winner }),
        }
      );

      if (response.ok) {
        alert(`Winner declared: Variant ${winner}`);
        // Refresh results
      }
    } catch (error) {
      console.error('Failed to declare winner:', error);
    }
  };

  return (
    <div className="ab-testing-panel">
      <h3>A/B Testing</h3>

      <div className="create-test-form">
        <h4>Create New Test</h4>
        <input
          type="text"
          placeholder="Test Name"
          value={formData.name}
          onChange={(e) =>
            setFormData({ ...formData, name: e.target.value })
          }
        />
        <textarea
          placeholder="Variant A Content"
          value={formData.variantA}
          onChange={(e) =>
            setFormData({ ...formData, variantA: e.target.value })
          }
        />
        <textarea
          placeholder="Variant B Content"
          value={formData.variantB}
          onChange={(e) =>
            setFormData({ ...formData, variantB: e.target.value })
          }
        />
        <input
          type="number"
          min="1"
          max="99"
          placeholder="Split %"
          value={formData.splitPercentage}
          onChange={(e) =>
            setFormData({
              ...formData,
              splitPercentage: parseInt(e.target.value),
            })
          }
        />
        <button onClick={handleCreateTest}>Create Test</button>
      </div>

      {results && (
        <div className="test-results">
          <h4>Test Results</h4>
          <div className="variant-comparison">
            <div className="variant">
              <h5>Variant A</h5>
              <p>Open Rate: {(results.variantA.openRate * 100).toFixed(2)}%</p>
              <p>Click Rate: {(results.variantA.clickRate * 100).toFixed(2)}%</p>
              <p>Bounces: {results.variantA.bounces}</p>
            </div>
            <div className="variant">
              <h5>Variant B</h5>
              <p>Open Rate: {(results.variantB.openRate * 100).toFixed(2)}%</p>
              <p>Click Rate: {(results.variantB.clickRate * 100).toFixed(2)}%</p>
              <p>Bounces: {results.variantB.bounces}</p>
            </div>
          </div>
          <p>
            Statistical Significance:{' '}
            {(results.significance * 100).toFixed(2)}%
          </p>
          {results.winner ? (
            <p className="winner">
              🏆 Winner: Variant {results.winner}
            </p>
          ) : (
            <div>
              <button onClick={() => handleDeclareWinner(results.testId, 'A')}>
                Declare A Winner
              </button>
              <button onClick={() => handleDeclareWinner(results.testId, 'B')}>
                Declare B Winner
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ====================
// Conditional Personalization Component
// ====================

interface ConditionalBlock {
  id: string;
  name: string;
  conditions: string;
  content: string;
  blockType: 'text' | 'image' | 'button' | 'cta';
}

export const ConditionalPersonalizationPanel: React.FC<{
  campaignId: string;
}> = ({ campaignId }) => {
  const [blocks, setBlocks] = useState<ConditionalBlock[]>([]);
  const [preview, setPreview] = useState<string>('');
  const [formData, setFormData] = useState<Partial<ConditionalBlock>>({
    name: '',
    conditions: '',
    content: '',
    blockType: 'text',
  });

  const handleCreateBlock = async () => {
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/conditional-blocks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockName: formData.name,
            conditions: formData.conditions,
            content: formData.content,
            blockType: formData.blockType,
          }),
        }
      );

      if (response.ok) {
        setBlocks([...blocks, formData as ConditionalBlock]);
        setFormData({
          name: '',
          conditions: '',
          content: '',
          blockType: 'text',
        });
        alert('Block created successfully');
      }
    } catch (error) {
      console.error('Failed to create block:', error);
    }
  };

  const handlePreview = async () => {
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/validate-template`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template: formData.content }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        alert('Template is valid');
      }
    } catch (error) {
      console.error('Validation error:', error);
    }
  };

  return (
    <div className="personalization-panel">
      <h3>Conditional Personalization</h3>

      <div className="syntax-guide">
        <h4>Syntax Guide</h4>
        <p>
          <code>
            {`{{if field == value}} content {{endif}}`}
          </code>
        </p>
        <p>
          Operators: ==, !=, &gt;, &lt;, contains, startsWith, in
        </p>
      </div>

      <div className="create-block-form">
        <h4>Create Conditional Block</h4>
        <input
          type="text"
          placeholder="Block Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
        <select
          value={formData.blockType}
          onChange={(e) =>
            setFormData({ ...formData, blockType: e.target.value as any })
          }
        >
          <option value="text">Text</option>
          <option value="image">Image</option>
          <option value="button">Button</option>
          <option value="cta">CTA</option>
        </select>
        <textarea
          placeholder="Condition (e.g., country == 'US')"
          value={formData.conditions}
          onChange={(e) =>
            setFormData({ ...formData, conditions: e.target.value })
          }
        />
        <textarea
          placeholder="Content"
          value={formData.content}
          onChange={(e) =>
            setFormData({ ...formData, content: e.target.value })
          }
        />
        <button onClick={handleCreateBlock}>Create Block</button>
        <button onClick={handlePreview}>Validate Template</button>
      </div>

      <div className="blocks-list">
        <h4>Active Blocks</h4>
        {blocks.map((block) => (
          <div key={block.id} className="block-item">
            <strong>{block.name}</strong>
            <p>{block.conditions}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ====================
// Analytics Dashboard Component
// ====================

interface CampaignMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
}

interface DailyMetric {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
}

export const AnalyticsDashboard: React.FC<{ campaignId: string }> = ({
  campaignId,
}) => {
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [segments, setSegments] = useState<any>(null);

  useEffect(() => {
    fetchMetrics();
  }, [campaignId]);

  const fetchMetrics = async () => {
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/metrics`
      );
      if (response.ok) {
        const data = await response.json();
        setMetrics(data.data);
      }

      const dailyResponse = await fetch(
        `/api/campaigns/${campaignId}/metrics/daily`
      );
      if (dailyResponse.ok) {
        const data = await dailyResponse.json();
        setDailyMetrics(data.data);
      }

      const segmentsResponse = await fetch(
        `/api/campaigns/${campaignId}/segments`
      );
      if (segmentsResponse.ok) {
        const data = await segmentsResponse.json();
        setSegments(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  return (
    <div className="analytics-dashboard">
      <h3>Campaign Analytics</h3>

      {metrics && (
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-value">{metrics.sent}</div>
            <div className="metric-label">Sent</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">
              {(metrics.openRate * 100).toFixed(2)}%
            </div>
            <div className="metric-label">Open Rate</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">
              {(metrics.clickRate * 100).toFixed(2)}%
            </div>
            <div className="metric-label">Click Rate</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{metrics.bounced}</div>
            <div className="metric-label">Bounced</div>
          </div>
        </div>
      )}

      <div className="charts">
        <div className="chart-container">
          <h4>Performance Over Time</h4>
          {dailyMetrics.length > 0 && (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyMetrics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="sent" stroke="#8884d8" />
                <Line type="monotone" dataKey="opened" stroke="#82ca9d" />
                <Line type="monotone" dataKey="clicked" stroke="#ffc658" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {segments && (
          <div className="chart-container">
            <h4>Engagement Segments</h4>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={segments}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  <Cell fill="#8884d8" />
                  <Cell fill="#82ca9d" />
                  <Cell fill="#ffc658" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <button onClick={fetchMetrics}>Refresh Metrics</button>
    </div>
  );
};

// ====================
// Webhook Management Component
// ====================

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export const WebhookManagement: React.FC = () => {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [formData, setFormData] = useState({
    url: '',
    events: [] as string[],
  });

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    try {
      const response = await fetch('/api/webhooks');
      if (response.ok) {
        const data = await response.json();
        setWebhooks(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch webhooks:', error);
    }
  };

  const handleCreateWebhook = async () => {
    try {
      const response = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        fetchWebhooks();
        setFormData({ url: '', events: [] });
        alert('Webhook created successfully');
      }
    } catch (error) {
      console.error('Failed to create webhook:', error);
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (confirm('Delete this webhook?')) {
      try {
        await fetch(`/api/webhooks/${webhookId}`, { method: 'DELETE' });
        fetchWebhooks();
      } catch (error) {
        console.error('Failed to delete webhook:', error);
      }
    }
  };

  return (
    <div className="webhook-management">
      <h3>Webhook Management</h3>

      <div className="create-webhook-form">
        <h4>Register New Webhook</h4>
        <input
          type="url"
          placeholder="Webhook URL"
          value={formData.url}
          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
        />
        <div className="event-checkboxes">
          <label>
            <input
              type="checkbox"
              onChange={(e) => {
                if (e.target.checked) {
                  setFormData({
                    ...formData,
                    events: [...formData.events, 'email.sent'],
                  });
                }
              }}
            />
            Email Sent
          </label>
          <label>
            <input
              type="checkbox"
              onChange={(e) => {
                if (e.target.checked) {
                  setFormData({
                    ...formData,
                    events: [...formData.events, 'email.opened'],
                  });
                }
              }}
            />
            Email Opened
          </label>
          <label>
            <input
              type="checkbox"
              onChange={(e) => {
                if (e.target.checked) {
                  setFormData({
                    ...formData,
                    events: [...formData.events, 'email.clicked'],
                  });
                }
              }}
            />
            Email Clicked
          </label>
        </div>
        <button onClick={handleCreateWebhook}>Create Webhook</button>
      </div>

      <div className="webhooks-list">
        <h4>Active Webhooks</h4>
        {webhooks.map((webhook) => (
          <div key={webhook.id} className="webhook-item">
            <div>
              <strong>{webhook.url}</strong>
              <p>Events: {webhook.events.join(', ')}</p>
              <small>Created: {new Date(webhook.createdAt).toLocaleDateString()}</small>
            </div>
            <button onClick={() => handleDeleteWebhook(webhook.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default {
  ABTestingPanel,
  ConditionalPersonalizationPanel,
  AnalyticsDashboard,
  WebhookManagement,
};
