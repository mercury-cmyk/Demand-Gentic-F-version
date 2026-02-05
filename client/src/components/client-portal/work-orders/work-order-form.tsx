/**
 * Work Order Form Component
 *
 * Allows clients to submit work orders (campaign requests) that flow to admin review.
 * Connects to: Projects, Campaigns, QA, and Leads
 */

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  FileText, Phone, Mail, Target, Users, Building2, MapPin,
  Calendar, DollarSign, Loader2, Send, Save, CheckCircle2,
  Sparkles, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkOrderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (order: WorkOrder) => void;
}

interface WorkOrder {
  id: string;
  orderNumber: string;
  title: string;
  description?: string;
  orderType: string;
  priority: string;
  status: string;
  targetLeadCount?: number;
  submittedAt?: string;
}

const ORDER_TYPES = [
  { value: 'lead_generation', label: 'Lead Generation', icon: Target, description: 'Generate new qualified leads for your sales team' },
  { value: 'call_campaign', label: 'AI Call Campaign', icon: Phone, description: 'Automated AI-powered calling campaign' },
  { value: 'email_campaign', label: 'Email Campaign', icon: Mail, description: 'Email outreach and nurture campaign' },
  { value: 'combo_campaign', label: 'Call + Email Combo', icon: Sparkles, description: 'Combined multi-channel outreach' },
  { value: 'appointment_setting', label: 'Appointment Setting', icon: Calendar, description: 'Book meetings with qualified prospects' },
  { value: 'data_enrichment', label: 'Data Enrichment', icon: Users, description: 'Enrich and verify your contact data' },
  { value: 'market_research', label: 'Market Research', icon: Building2, description: 'Gather market intelligence through calls' },
  { value: 'custom', label: 'Custom Request', icon: FileText, description: 'Other specialized requirements' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-700' },
  { value: 'normal', label: 'Normal', color: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700' },
];

const COMPANY_SIZES = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1001-5000', label: '1001-5000 employees' },
  { value: '5001+', label: '5001+ employees' },
];

export function WorkOrderForm({ open, onOpenChange, onSuccess }: WorkOrderFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    orderType: 'lead_generation',
    priority: 'normal',
    targetIndustries: [] as string[],
    targetTitles: [] as string[],
    targetCompanySize: '',
    targetRegions: [] as string[],
    targetAccountCount: undefined as number | undefined,
    targetLeadCount: undefined as number | undefined,
    requestedStartDate: '',
    requestedEndDate: '',
    estimatedBudget: undefined as number | undefined,
    clientNotes: '',
    specialRequirements: '',
  });

  // Temporary input states for array fields
  const [industryInput, setIndustryInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [regionInput, setRegionInput] = useState('');

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Create work order mutation
  const createMutation = useMutation({
    mutationFn: async (submitNow: boolean) => {
      const res = await fetch('/api/client-portal/work-orders/client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          ...formData,
          submitNow,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create work order');
      }
      return res.json();
    },
    onSuccess: (data, submitNow) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      toast({
        title: submitNow ? 'Direct Agentic Order Submitted!' : 'Draft Saved',
        description: submitNow
          ? `Order ${data.workOrder.orderNumber} has been submitted for review`
          : 'Your Direct Agentic Order has been saved as a draft',
      });
      onSuccess?.(data.workOrder);
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      orderType: 'lead_generation',
      priority: 'normal',
      targetIndustries: [],
      targetTitles: [],
      targetCompanySize: '',
      targetRegions: [],
      targetAccountCount: undefined,
      targetLeadCount: undefined,
      requestedStartDate: '',
      requestedEndDate: '',
      estimatedBudget: undefined,
      clientNotes: '',
      specialRequirements: '',
    });
    setStep(1);
    setIndustryInput('');
    setTitleInput('');
    setRegionInput('');
  };

  const handleAddItem = (field: 'targetIndustries' | 'targetTitles' | 'targetRegions', value: string) => {
    if (value.trim()) {
      setFormData(prev => ({
        ...prev,
        [field]: [...prev[field], value.trim()],
      }));
    }
  };

  const handleRemoveItem = (field: 'targetIndustries' | 'targetTitles' | 'targetRegions', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const isStepValid = (stepNum: number) => {
    switch (stepNum) {
      case 1:
        return formData.title.trim().length > 0;
      case 2:
        return true; // Targeting is optional
      case 3:
        return true; // Additional details are optional
      default:
        return true;
    }
  };

  const selectedOrderType = ORDER_TYPES.find(t => t.value === formData.orderType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Create Direct Agentic Order
          </DialogTitle>
          <DialogDescription>
            Submit a new Direct Agentic Order to request campaigns, lead generation, or other services
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 py-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <button
                onClick={() => s < step && setStep(s)}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  step >= s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </button>
              {s < 3 && (
                <div className={cn(
                  'w-16 h-1 mx-2',
                  step > s ? 'bg-primary' : 'bg-muted'
                )} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-8 text-xs text-muted-foreground mb-4">
          <span className={step >= 1 ? 'text-primary font-medium' : ''}>Request Details</span>
          <span className={step >= 2 ? 'text-primary font-medium' : ''}>Targeting</span>
          <span className={step >= 3 ? 'text-primary font-medium' : ''}>Review</span>
        </div>

        <div className="flex-1 overflow-y-auto px-1">
          {/* Step 1: Request Details */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Request Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Q1 Lead Generation Campaign"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Request Type</Label>
                <div className="grid grid-cols-2 gap-3">
                  {ORDER_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setFormData(prev => ({ ...prev, orderType: type.value }))}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                        formData.orderType === type.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <type.icon className={cn(
                        'h-5 w-5 mt-0.5',
                        formData.orderType === type.value ? 'text-primary' : 'text-muted-foreground'
                      )} />
                      <div>
                        <div className="font-medium text-sm">{type.label}</div>
                        <div className="text-xs text-muted-foreground">{type.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <Badge className={opt.color}>{opt.label}</Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Target Lead Count</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 500"
                    value={formData.targetLeadCount || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      targetLeadCount: e.target.value ? parseInt(e.target.value) : undefined
                    }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Describe your campaign goals, target audience, and any specific requirements..."
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                />
              </div>
            </div>
          )}

          {/* Step 2: Targeting */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Target Industries</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add industry (press Enter)"
                    value={industryInput}
                    onChange={(e) => setIndustryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddItem('targetIndustries', industryInput);
                        setIndustryInput('');
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      handleAddItem('targetIndustries', industryInput);
                      setIndustryInput('');
                    }}
                  >
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.targetIndustries.map((industry, idx) => (
                    <Badge key={idx} variant="secondary" className="gap-1">
                      {industry}
                      <button
                        onClick={() => handleRemoveItem('targetIndustries', idx)}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Target Job Titles</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add job title (press Enter)"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddItem('targetTitles', titleInput);
                        setTitleInput('');
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      handleAddItem('targetTitles', titleInput);
                      setTitleInput('');
                    }}
                  >
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.targetTitles.map((title, idx) => (
                    <Badge key={idx} variant="secondary" className="gap-1">
                      {title}
                      <button
                        onClick={() => handleRemoveItem('targetTitles', idx)}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company Size</Label>
                  <Select
                    value={formData.targetCompanySize}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, targetCompanySize: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select size range" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_SIZES.map((size) => (
                        <SelectItem key={size.value} value={size.value}>
                          {size.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Target Account Count</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 1000"
                    value={formData.targetAccountCount || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      targetAccountCount: e.target.value ? parseInt(e.target.value) : undefined
                    }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Target Regions</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add region (press Enter)"
                    value={regionInput}
                    onChange={(e) => setRegionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddItem('targetRegions', regionInput);
                        setRegionInput('');
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      handleAddItem('targetRegions', regionInput);
                      setRegionInput('');
                    }}
                  >
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.targetRegions.map((region, idx) => (
                    <Badge key={idx} variant="secondary" className="gap-1">
                      {region}
                      <button
                        onClick={() => handleRemoveItem('targetRegions', idx)}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Requested Start Date</Label>
                  <Input
                    type="date"
                    value={formData.requestedStartDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, requestedStartDate: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Requested End Date</Label>
                  <Input
                    type="date"
                    value={formData.requestedEndDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, requestedEndDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Estimated Budget ($)</Label>
                <Input
                  type="number"
                  placeholder="e.g., 10000"
                  value={formData.estimatedBudget || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    estimatedBudget: e.target.value ? parseFloat(e.target.value) : undefined
                  }))}
                />
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {selectedOrderType && <selectedOrderType.icon className="h-5 w-5 text-primary" />}
                    {formData.title || 'Untitled Request'}
                  </CardTitle>
                  <CardDescription>{selectedOrderType?.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Type:</span>{' '}
                      <span className="font-medium">{selectedOrderType?.label}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Priority:</span>{' '}
                      <Badge className={PRIORITY_OPTIONS.find(p => p.value === formData.priority)?.color}>
                        {PRIORITY_OPTIONS.find(p => p.value === formData.priority)?.label}
                      </Badge>
                    </div>
                    {formData.targetLeadCount && (
                      <div>
                        <span className="text-muted-foreground">Target Leads:</span>{' '}
                        <span className="font-medium">{formData.targetLeadCount.toLocaleString()}</span>
                      </div>
                    )}
                    {formData.estimatedBudget && (
                      <div>
                        <span className="text-muted-foreground">Budget:</span>{' '}
                        <span className="font-medium">${formData.estimatedBudget.toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {formData.description && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Description:</div>
                      <p className="text-sm bg-muted p-3 rounded">{formData.description}</p>
                    </div>
                  )}

                  {(formData.targetIndustries.length > 0 || formData.targetTitles.length > 0) && (
                    <div className="space-y-2">
                      {formData.targetIndustries.length > 0 && (
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Industries:</div>
                          <div className="flex flex-wrap gap-1">
                            {formData.targetIndustries.map((i, idx) => (
                              <Badge key={idx} variant="outline">{i}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {formData.targetTitles.length > 0 && (
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Job Titles:</div>
                          <div className="flex flex-wrap gap-1">
                            {formData.targetTitles.map((t, idx) => (
                              <Badge key={idx} variant="outline">{t}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {(formData.requestedStartDate || formData.requestedEndDate) && (
                    <div className="flex gap-4 text-sm">
                      {formData.requestedStartDate && (
                        <div>
                          <span className="text-muted-foreground">Start:</span>{' '}
                          <span className="font-medium">{formData.requestedStartDate}</span>
                        </div>
                      )}
                      {formData.requestedEndDate && (
                        <div>
                          <span className="text-muted-foreground">End:</span>{' '}
                          <span className="font-medium">{formData.requestedEndDate}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label>Additional Notes (Optional)</Label>
                <Textarea
                  placeholder="Any additional information for our team..."
                  value={formData.clientNotes}
                  onChange={(e) => setFormData(prev => ({ ...prev, clientNotes: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Special Requirements (Optional)</Label>
                <Textarea
                  placeholder="Any specific requirements or constraints..."
                  value={formData.specialRequirements}
                  onChange={(e) => setFormData(prev => ({ ...prev, specialRequirements: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 pt-4 border-t">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <div className="flex-1" />

          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!isStepValid(step)}
            >
              Continue
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => createMutation.mutate(false)}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Draft
              </Button>
              <Button
                onClick={() => setShowConfirmSubmit(true)}
                disabled={createMutation.isPending || !formData.title}
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit Request
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Confirm Submit Dialog */}
      <Dialog open={showConfirmSubmit} onOpenChange={setShowConfirmSubmit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Direct Agentic Order?</DialogTitle>
            <DialogDescription>
              Once submitted, your Direct Agentic Order will be reviewed by our team. You'll receive updates on its progress.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmSubmit(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowConfirmSubmit(false);
                createMutation.mutate(true);
              }}
            >
              <Send className="h-4 w-4 mr-2" />
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

export default WorkOrderForm;
