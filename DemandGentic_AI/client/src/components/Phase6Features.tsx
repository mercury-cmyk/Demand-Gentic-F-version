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

export const ABTestingPanel: React.FC = ({
  campaignId,
}) => {
  const [tests, setTests] = useState([]);
  const [results, setResults] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
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
    
      A/B Testing

      
        Create New Test
        
            setFormData({ ...formData, name: e.target.value })
          }
        />
        
            setFormData({ ...formData, variantA: e.target.value })
          }
        />
        
            setFormData({ ...formData, variantB: e.target.value })
          }
        />
        
            setFormData({
              ...formData,
              splitPercentage: parseInt(e.target.value),
            })
          }
        />
        Create Test
      

      {results && (
        
          Test Results
          
            
              Variant A
              Open Rate: {(results.variantA.openRate * 100).toFixed(2)}%
              Click Rate: {(results.variantA.clickRate * 100).toFixed(2)}%
              Bounces: {results.variantA.bounces}
            
            
              Variant B
              Open Rate: {(results.variantB.openRate * 100).toFixed(2)}%
              Click Rate: {(results.variantB.clickRate * 100).toFixed(2)}%
              Bounces: {results.variantB.bounces}
            
          
          
            Statistical Significance:{' '}
            {(results.significance * 100).toFixed(2)}%
          
          {results.winner ? (
            
              🏆 Winner: Variant {results.winner}
            
          ) : (
            
               handleDeclareWinner(results.testId, 'A')}>
                Declare A Winner
              
               handleDeclareWinner(results.testId, 'B')}>
                Declare B Winner
              
            
          )}
        
      )}
    
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

export const ConditionalPersonalizationPanel: React.FC = ({ campaignId }) => {
  const [blocks, setBlocks] = useState([]);
  const [preview, setPreview] = useState('');
  const [formData, setFormData] = useState>({
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
    
      Conditional Personalization

      
        Syntax Guide
        
          
            {`{{if field == value}} content {{endif}}`}
          
        
        
          Operators: ==, !=, &gt;, &lt;, contains, startsWith, in
        
      

      
        Create Conditional Block
         setFormData({ ...formData, name: e.target.value })}
        />
        
            setFormData({ ...formData, blockType: e.target.value as any })
          }
        >
          Text
          Image
          Button
          CTA
        
        
            setFormData({ ...formData, conditions: e.target.value })
          }
        />
        
            setFormData({ ...formData, content: e.target.value })
          }
        />
        Create Block
        Validate Template
      

      
        Active Blocks
        {blocks.map((block) => (
          
            {block.name}
            {block.conditions}
          
        ))}
      
    
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

export const AnalyticsDashboard: React.FC = ({
  campaignId,
}) => {
  const [metrics, setMetrics] = useState(null);
  const [dailyMetrics, setDailyMetrics] = useState([]);
  const [segments, setSegments] = useState(null);

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
    
      Campaign Analytics

      {metrics && (
        
          
            {metrics.sent}
            Sent
          
          
            
              {(metrics.openRate * 100).toFixed(2)}%
            
            Open Rate
          
          
            
              {(metrics.clickRate * 100).toFixed(2)}%
            
            Click Rate
          
          
            {metrics.bounced}
            Bounced
          
        
      )}

      
        
          Performance Over Time
          {dailyMetrics.length > 0 && (
            
              
                
                
                
                
                
                
                
                
              
            
          )}
        

        {segments && (
          
            Engagement Segments
            
              
                
                  
                  
                  
                
                
              
            
          
        )}
      

      Refresh Metrics
    
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
  const [webhooks, setWebhooks] = useState([]);
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
    
      Webhook Management

      
        Register New Webhook
         setFormData({ ...formData, url: e.target.value })}
        />
        
          
             {
                if (e.target.checked) {
                  setFormData({
                    ...formData,
                    events: [...formData.events, 'email.sent'],
                  });
                }
              }}
            />
            Email Sent
          
          
             {
                if (e.target.checked) {
                  setFormData({
                    ...formData,
                    events: [...formData.events, 'email.opened'],
                  });
                }
              }}
            />
            Email Opened
          
          
             {
                if (e.target.checked) {
                  setFormData({
                    ...formData,
                    events: [...formData.events, 'email.clicked'],
                  });
                }
              }}
            />
            Email Clicked
          
        
        Create Webhook
      

      
        Active Webhooks
        {webhooks.map((webhook) => (
          
            
              {webhook.url}
              Events: {webhook.events.join(', ')}
              Created: {new Date(webhook.createdAt).toLocaleDateString()}
            
             handleDeleteWebhook(webhook.id)}>
              Delete
            
          
        ))}
      
    
  );
};

export default {
  ABTestingPanel,
  ConditionalPersonalizationPanel,
  AnalyticsDashboard,
  WebhookManagement,
};