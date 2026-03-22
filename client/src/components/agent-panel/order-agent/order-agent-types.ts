/**
 * Order Agent Types
 * TypeScript interfaces for the AgentC order creation feature
 */

export interface UploadedFile {
  name: string;
  key: string;
  type: string;
}

export interface OrderRecommendation {
  campaignType: string;
  suggestedVolume: number;
  targetAudience: {
    industries: string[];
    titles: string[];
    companySize: string;
    companySizeMin?: number;
    companySizeMax?: number;
  };
  channels: string[];
  deliveryTimeline: string;
  geographies: string[];
  estimatedCost: number;
  rationale: string;
  expectedResults?: {
    meetings: string;
    qualifiedLeads: string;
  };
}

export interface OrderConfiguration {
  campaignType: string;
  volume: number;
  industries: string;
  jobTitles: string;
  companySizeMin?: number;
  companySizeMax?: number;
  geographies: string;
  deliveryTimeline: string;
  channels: string[];
  deliveryMethod?: string;
  specialRequirements?: string;
}

export interface OrderContext {
  goal: string;
  contextUrls: string[];
  contextFiles: UploadedFile[];
  targetAccountFiles: UploadedFile[];
  suppressionFiles: UploadedFile[];
  templateFiles: UploadedFile[];
}

export interface PricingBreakdown {
  baseRate: number;
  basePrice: number;
  volumeDiscountPercent: number;
  volumeDiscount: number;
  rushFeePercent: number;
  rushFee: number;
  hasCustomPricing: boolean;
  minimumOrderSize: number;
  totalCost: number;
}

export interface OrderExecutionPlan {
  id: string;
  steps: OrderPlanStep[];
  riskLevel: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'rejected';
  orderData: OrderConfiguration & OrderContext;
  estimatedCost: number;
  pricingBreakdown: PricingBreakdown;
}

export interface OrderPlanStep {
  id: string;
  stepNumber: number;
  tool: 'validate_targeting' | 'calculate_pricing' | 'create_order' | 'create_project' | 'send_notification';
  description: string;
  args: Record<string, any>;
  isDestructive: boolean;
  estimatedImpact?: string;
  status?: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
}

export interface OrderCreationResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  projectId?: string;
  error?: string;
}

export type OrderAgentState =
  | 'idle'
  | 'goal_input'
  | 'context_upload'
  | 'analyzing'
  | 'strategy_review'
  | 'configuration'
  | 'plan_pending'
  | 'executing'
  | 'completed'
  | 'failed';

export interface OrderAgentContext {
  state: OrderAgentState;
  goal: string;
  context: OrderContext;
  recommendation: OrderRecommendation | null;
  configuration: OrderConfiguration | null;
  pricingBreakdown: PricingBreakdown | null;
  plan: OrderExecutionPlan | null;
  result: OrderCreationResult | null;
  error: string | null;
}

// Campaign types matching the existing implementation
export const CAMPAIGN_TYPES = [
  { value: 'high_quality_leads', label: 'HQL - High Quality Leads', description: 'Account-aware, verified MQLs with firmographic & technographic targeting' },
  { value: 'bant_leads', label: 'BANT Qualified Leads', description: 'Budget, Authority, Need, Timeline qualified with full buying signals' },
  { value: 'sql', label: 'SQL Generation', description: 'Sales-ready leads with confirmed interest and engagement' },
  { value: 'appointment_generation', label: 'Appointment Setting', description: 'Direct calendar bookings with verified decision makers' },
  { value: 'lead_qualification', label: 'Lead Qualification', description: 'BANT/custom qualification of your existing contact lists' },
  { value: 'content_syndication', label: 'Content Syndication (CS)', description: 'Gated asset distribution with double opt-in consent capture' },
  { value: 'webinar_invite', label: 'Webinar Invitation', description: 'Targeted webinar registration with attendee qualification' },
  { value: 'live_webinar', label: 'Live Webinar Promotion', description: 'Full-service live event marketing with registration management' },
  { value: 'on_demand_webinar', label: 'On-Demand Webinar', description: 'Evergreen webinar promotion with ongoing lead capture' },
  { value: 'executive_dinner', label: 'Executive Dinner', description: 'High-touch C-suite event with personalized outreach' },
  { value: 'leadership_forum', label: 'Leadership Forum', description: 'Executive roundtable with buying committee targeting' },
  { value: 'conference', label: 'Conference/Event', description: 'Trade show & conference attendee acquisition' },
  { value: 'email', label: 'Email-Only Campaign', description: 'Targeted email sequences with engagement tracking' },
  { value: 'data_validation', label: 'Data Validation & Enrichment', description: 'Contact verification, firmographic enrichment, and list hygiene' },
] as const;

export const DELIVERY_TIMELINES = [
  { value: 'standard', label: 'Standard (2-4 weeks)' },
  { value: '2_weeks', label: '2 Weeks' },
  { value: '1_week', label: '1 Week (+25%)' },
  { value: 'immediate', label: 'Rush (3-5 days) (+50%)' },
] as const;

export const DELIVERY_METHODS = [
  { value: 'api', label: 'API Integration', description: 'Real-time delivery via REST API' },
  { value: 'csv', label: 'CSV Export', description: 'Downloadable CSV file delivery' },
  { value: 'realtime_push', label: 'Real-time Push', description: 'Instant push to your CRM/system' },
  { value: 'sftp', label: 'SFTP Transfer', description: 'Secure file transfer to your server' },
  { value: 'email', label: 'Email Delivery', description: 'Leads delivered via secure email' },
] as const;
