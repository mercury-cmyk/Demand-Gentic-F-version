/**
 * Agentic Campaign Order Panel
 * AI-powered campaign ordering interface for client portal
 * Allows natural language campaign requests and AI-optimized order creation
 */
import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Package, Send, Loader2, Sparkles, Target, Building2, Users,
  DollarSign, Calendar, Zap, ChevronRight, Check, AlertCircle,
  MessageSquare, Bot, Lightbulb, ArrowRight, Globe, Phone, Mail
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface OrderRecommendation {
  campaignType: string;
  suggestedVolume: number;
  targetAudience: {
    industries: string[];
    titles: string[];
    companySize: string;
  };
  channels: string[];
  estimatedCost: number;
  expectedResults: {
    meetings: string;
    qualifiedLeads: string;
  };
}

interface AgenticCampaignOrderPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderCreated?: () => void;
}

const CAMPAIGN_TYPES = [
  { value: 'lead_generation', label: 'Lead Generation', description: 'Find and qualify new prospects' },
  { value: 'event_registration', label: 'Event Registration', description: 'Drive webinar/event signups' },
  { value: 'demo_booking', label: 'Demo Booking', description: 'Schedule product demonstrations' },
  { value: 'market_research', label: 'Market Research', description: 'Gather market intelligence' },
];

const DELIVERY_TIMELINES = [
  { value: 'standard', label: 'Standard (2-4 weeks)' },
  { value: '2_weeks', label: '2 Weeks' },
  { value: '1_week', label: '1 Week (+25%)' },
  { value: 'immediate', label: 'Rush (3-5 days) (+50%)' },
];

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Financial Services', 'Manufacturing',
  'Retail', 'Professional Services', 'Education', 'Government',
  'Real Estate', 'Energy', 'Telecommunications', 'Other'
];

export function AgenticCampaignOrderPanel({ open, onOpenChange, onOrderCreated }: AgenticCampaignOrderPanelProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'goal' | 'configure' | 'review'>('goal');
  const [goalDescription, setGoalDescription] = useState('');
  const [recommendation, setRecommendation] = useState<any>(null);
  
  // Order configuration
  const [campaignType, setCampaignType] = useState('lead_generation');
  const [volume, setVolume] = useState(100);
  const [industries, setIndustries] = useState<string[]>([]);
  const [jobTitles, setJobTitles] = useState('');
  const [companySizeMin, setCompanySizeMin] = useState<number | undefined>();
  const [companySizeMax, setCompanySizeMax] = useState<number | undefined>();
  const [geographies, setGeographies] = useState('');
  const [deliveryTimeline, setDeliveryTimeline] = useState('standard');
  const [channels, setChannels] = useState<string[]>(['voice', 'email']);
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Get AI recommendation based on goal
  const recommendMutation = useMutation({
    mutationFn: async (goal: string) => {
      const res = await fetch('/api/client-portal/agentic/orders/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ goal }),
      });
      if (!res.ok) throw new Error('Failed to get recommendations');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data?.recommendation) {
        const rec = data.data.recommendation;
        setRecommendation(data.data);
        
        // Pre-fill form with recommendations
        setCampaignType(rec.campaignType || 'lead_generation');
        setVolume(rec.suggestedVolume || 100);
        if (rec.targetAudience?.industries) {
          setIndustries(rec.targetAudience.industries);
        }
        if (rec.targetAudience?.titles) {
          setJobTitles(rec.targetAudience.titles.join(', '));
        }
        if (rec.channels) {
          setChannels(rec.channels);
        }
        setEstimatedCost(rec.estimatedCost);
        setStep('configure');
      }
    },
  });

  // Estimate cost
  const estimateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/agentic/billing/estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          volumeRequested: volume,
          campaignType,
          deliveryTimeline,
          channels,
        }),
      });
      if (!res.ok) throw new Error('Failed to estimate cost');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setEstimatedCost(data.data.estimatedCost);
      }
    },
  });

  // Create order
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/agentic/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          campaignType,
          industries,
          jobTitles: jobTitles.split(',').map(t => t.trim()).filter(Boolean),
          companySizeMin,
          companySizeMax,
          geographies: geographies.split(',').map(g => g.trim()).filter(Boolean),
          volumeRequested: volume,
          deliveryTimeline,
          channels,
          specialRequirements,
        }),
      });
      if (!res.ok) throw new Error('Failed to create order');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Order Created!',
          description: `Order #${data.data?.orderNumber || 'NEW'} has been submitted for review.`,
        });
        onOrderCreated?.();
        onOpenChange(false);
        resetForm();
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Order Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Recalculate estimate when key fields change
  useEffect(() => {
    if (step === 'configure' && volume > 0) {
      const timer = setTimeout(() => {
        estimateMutation.mutate();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [volume, campaignType, deliveryTimeline, channels]);

  const resetForm = () => {
    setStep('goal');
    setGoalDescription('');
    setRecommendation(null);
    setCampaignType('lead_generation');
    setVolume(100);
    setIndustries([]);
    setJobTitles('');
    setCompanySizeMin(undefined);
    setCompanySizeMax(undefined);
    setGeographies('');
    setDeliveryTimeline('standard');
    setChannels(['voice', 'email']);
    setSpecialRequirements('');
    setEstimatedCost(null);
  };

  const handleGoalSubmit = () => {
    if (!goalDescription.trim()) return;
    recommendMutation.mutate(goalDescription);
  };

  const handleIndustryToggle = (industry: string) => {
    setIndustries(prev =>
      prev.includes(industry)
        ? prev.filter(i => i !== industry)
        : [...prev, industry]
    );
  };

  const handleChannelToggle = (channel: string) => {
    setChannels(prev =>
      prev.includes(channel)
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-green-600 to-emerald-600 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl text-white">Create Campaign Order</DialogTitle>
              <DialogDescription className="text-green-100">
                AI-powered campaign ordering assistant
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-6">
          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center gap-2">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium",
                step === 'goal' ? "bg-green-600 text-white" : "bg-green-100 text-green-600"
              )}>
                1
              </div>
              <span className={cn("text-sm", step === 'goal' ? "text-green-600 font-medium" : "text-muted-foreground")}>
                Describe Goal
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground mx-2" />
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium",
                step === 'configure' ? "bg-green-600 text-white" : step === 'review' ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"
              )}>
                2
              </div>
              <span className={cn("text-sm", step === 'configure' ? "text-green-600 font-medium" : "text-muted-foreground")}>
                Configure
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground mx-2" />
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium",
                step === 'review' ? "bg-green-600 text-white" : "bg-gray-100 text-gray-400"
              )}>
                3
              </div>
              <span className={cn("text-sm", step === 'review' ? "text-green-600 font-medium" : "text-muted-foreground")}>
                Review & Submit
              </span>
            </div>
          </div>

          {/* Step 1: Describe Goal */}
          {step === 'goal' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="inline-flex p-3 bg-green-100 rounded-full mb-4">
                  <Sparkles className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">What would you like to achieve?</h3>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  Describe your campaign goal in natural language and our AI will recommend the best approach.
                </p>
              </div>

              <Textarea
                value={goalDescription}
                onChange={(e) => setGoalDescription(e.target.value)}
                placeholder="Example: I want to generate 200 qualified leads from IT directors at mid-size healthcare companies in the US who might be interested in our cybersecurity solution..."
                className="min-h-[120px] text-base"
              />

              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground">Quick examples:</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setGoalDescription("I need 100 qualified leads from CTOs at tech companies with 500+ employees")}
                >
                  Tech company leads
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setGoalDescription("I want to drive registrations for our upcoming webinar targeting finance executives")}
                >
                  Event registrations
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setGoalDescription("Book 50 product demos with decision makers at healthcare organizations")}
                >
                  Demo bookings
                </Button>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleGoalSubmit}
                disabled={!goalDescription.trim() || recommendMutation.isPending}
              >
                {recommendMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Get AI Recommendations
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Step 2: Configure Order */}
          {step === 'configure' && (
            <div className="space-y-6">
              {/* AI Recommendation Card */}
              {recommendation?.rationale && (
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-4">
                    <div className="flex gap-3">
                      <Bot className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-800 mb-1">AI Recommendation</p>
                        <p className="text-sm text-green-700">{recommendation.rationale}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-6">
                {/* Campaign Type */}
                <div className="space-y-2">
                  <Label>Campaign Type</Label>
                  <Select value={campaignType} onValueChange={setCampaignType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMPAIGN_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex flex-col">
                            <span>{type.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Volume */}
                <div className="space-y-2">
                  <Label>Lead Volume: {volume}</Label>
                  <Slider
                    value={[volume]}
                    onValueChange={(v) => setVolume(v[0])}
                    min={25}
                    max={1000}
                    step={25}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground">25 - 1,000 leads</p>
                </div>
              </div>

              {/* Target Industries */}
              <div className="space-y-2">
                <Label>Target Industries</Label>
                <div className="flex flex-wrap gap-2">
                  {INDUSTRIES.map(industry => (
                    <Badge
                      key={industry}
                      variant={industries.includes(industry) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => handleIndustryToggle(industry)}
                    >
                      {industries.includes(industry) && <Check className="h-3 w-3 mr-1" />}
                      {industry}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Job Titles */}
              <div className="space-y-2">
                <Label>Target Job Titles</Label>
                <Input
                  value={jobTitles}
                  onChange={(e) => setJobTitles(e.target.value)}
                  placeholder="CTO, VP of Engineering, IT Director (comma separated)"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Company Size */}
                <div className="space-y-2">
                  <Label>Company Size (Employees)</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      value={companySizeMin || ''}
                      onChange={(e) => setCompanySizeMin(e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Min"
                      className="w-24"
                    />
                    <span>to</span>
                    <Input
                      type="number"
                      value={companySizeMax || ''}
                      onChange={(e) => setCompanySizeMax(e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Max"
                      className="w-24"
                    />
                  </div>
                </div>

                {/* Delivery Timeline */}
                <div className="space-y-2">
                  <Label>Delivery Timeline</Label>
                  <Select value={deliveryTimeline} onValueChange={setDeliveryTimeline}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELIVERY_TIMELINES.map(timeline => (
                        <SelectItem key={timeline.value} value={timeline.value}>
                          {timeline.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Channels */}
              <div className="space-y-2">
                <Label>Outreach Channels</Label>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="channel-voice"
                      checked={channels.includes('voice')}
                      onCheckedChange={() => handleChannelToggle('voice')}
                    />
                    <Label htmlFor="channel-voice" className="flex items-center gap-1 cursor-pointer">
                      <Phone className="h-4 w-4" />
                      Voice Calls
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="channel-email"
                      checked={channels.includes('email')}
                      onCheckedChange={() => handleChannelToggle('email')}
                    />
                    <Label htmlFor="channel-email" className="flex items-center gap-1 cursor-pointer">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                  </div>
                </div>
              </div>

              {/* Geographies */}
              <div className="space-y-2">
                <Label>Target Geographies</Label>
                <Input
                  value={geographies}
                  onChange={(e) => setGeographies(e.target.value)}
                  placeholder="United States, Canada, UK (comma separated)"
                />
              </div>

              {/* Special Requirements */}
              <div className="space-y-2">
                <Label>Special Requirements (Optional)</Label>
                <Textarea
                  value={specialRequirements}
                  onChange={(e) => setSpecialRequirements(e.target.value)}
                  placeholder="Any additional requirements or preferences..."
                  className="min-h-[80px]"
                />
              </div>

              {/* Cost Estimate */}
              {estimatedCost !== null && (
                <Card className="bg-slate-50">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-green-600" />
                        <span className="font-medium">Estimated Cost</span>
                      </div>
                      <span className="text-2xl font-bold text-green-600">
                        {formatCurrency(estimatedCost)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatCurrency(estimatedCost / volume)} per lead • Final cost may vary based on delivery
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('goal')}>
                  Back
                </Button>
                <Button className="flex-1" onClick={() => setStep('review')}>
                  Review Order
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Review & Submit */}
          {step === 'review' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Campaign Type</p>
                      <p className="font-medium">{CAMPAIGN_TYPES.find(t => t.value === campaignType)?.label}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Volume</p>
                      <p className="font-medium">{volume} leads</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Target Industries</p>
                      <p className="font-medium">{industries.length > 0 ? industries.join(', ') : 'All industries'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Job Titles</p>
                      <p className="font-medium">{jobTitles || 'All decision makers'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Delivery Timeline</p>
                      <p className="font-medium">{DELIVERY_TIMELINES.find(t => t.value === deliveryTimeline)?.label}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Channels</p>
                      <p className="font-medium capitalize">{channels.join(' & ')}</p>
                    </div>
                  </div>

                  {specialRequirements && (
                    <div>
                      <p className="text-sm text-muted-foreground">Special Requirements</p>
                      <p className="font-medium">{specialRequirements}</p>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Estimated Total</p>
                      <p className="text-2xl font-bold text-green-600">
                        {estimatedCost ? formatCurrency(estimatedCost) : 'TBD'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('configure')}>
                  Back to Edit
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => createOrderMutation.mutate()}
                  disabled={createOrderMutation.isPending}
                >
                  {createOrderMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Submit Order
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AgenticCampaignOrderPanel;
