import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  Package, Send, Loader2, Sparkles, Target, Building2, Users,
  DollarSign, Calendar, Zap, ChevronRight, Check, AlertCircle,
  Brain, ArrowRight, Globe, Phone, Mail, Upload, X, FileText,
  CheckCircle2, ArrowLeft, Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useOrderWizard,
  CAMPAIGN_TYPES,
  DELIVERY_TIMELINES,
  DELIVERY_METHODS,
} from './hooks/useOrderWizard';
import type { OrderStep } from './hooks/useAgentPanel';

interface OrderWizardPanelProps {
  orderStep: OrderStep;
  onStepChange: (step: OrderStep) => void;
  onClose: () => void;
  onOrderCreated?: () => void;
}

const STEP_LABELS = ['Describe Goal', 'Configure', 'Review & Submit'];

function StepIndicator({ currentStep }: { currentStep: OrderStep }) {
  const stepMap: Record<string, number> = {
    goal: 0, strategy_review: 0, configure: 1, review: 2, submitted: 2,
  };
  const activeIdx = stepMap[currentStep] ?? 0;

  return (
    <div className="relative flex items-center justify-between w-full max-w-xs mx-auto px-4 py-2">
      {/* Connector Line */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full px-8 -z-10">
        <div className="h-0.5 w-full bg-gradient-to-r from-border via-border to-border relative">
            <motion.div 
                className="absolute left-0 top-0 h-full bg-primary"
                initial={{ width: '0%' }}
                animate={{ width: `${(activeIdx / (STEP_LABELS.length - 1)) * 100}%` }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
            />
        </div>
      </div>

      {STEP_LABELS.map((label, i) => {
        const isActive = i === activeIdx;
        const isCompleted = i < activeIdx;

        return (
            <div key={label} className="flex flex-col items-center gap-2">
                <motion.div 
                    initial={false}
                    animate={{
                        scale: isActive ? 1.1 : 1,
                        borderColor: isActive || isCompleted ? 'var(--primary)' : 'var(--border)',
                        backgroundColor: isActive ? 'var(--background)' : isCompleted ? 'var(--primary)' : 'var(--background)'
                    }}
                    className={cn(
                        "w-8 h-8 rounded-full border-2 flex items-center justify-center z-10 transition-all duration-300",
                        isActive && "shadow-lg shadow-primary/30 ring-4 ring-primary/10 scale-110"
                    )}
                >
                    {isCompleted ? (
                        <Check className="h-4 w-4 text-primary-foreground" />
                    ) : (
                        <span className={cn("text-xs font-bold", isActive ? "text-primary" : "text-muted-foreground")}>
                            {i + 1}
                        </span>
                    )}
                </motion.div>
                <span className={cn(
                    "text-[10px] font-medium tracking-tight absolute -bottom-4 w-20 text-center transition-colors duration-300",
                    isActive ? "text-primary font-bold" : "text-muted-foreground"
                )}>
                    {label}
                </span>
            </div>
        )
      })}
    </div>
  );
}

export function OrderWizardPanel({ orderStep, onStepChange, onClose, onOrderCreated }: OrderWizardPanelProps) {
  const wizard = useOrderWizard(true, onStepChange);
  const [goalInput, setGoalInput] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const handleGoalSubmit = () => {
    if (!goalInput.trim()) return;
    wizard.submitGoal(goalInput.trim());
  };

  const handleAddUrl = () => {
    if (!newUrl.trim()) return;
    wizard.addUrl(newUrl.trim());
    setNewUrl('');
  };

  const handleSubmitOrder = () => {
    wizard.submitOrder();
  };

  const handleClose = () => {
    wizard.reset();
    onClose();
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Campaign Order</h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {orderStep === 'submitted' ? 'Submitted' : `Step ${orderStep === 'goal' || orderStep === 'strategy_review' ? 1 : orderStep === 'configure' ? 2 : 3} of 3`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StepIndicator currentStep={orderStep} />
          <Button variant="ghost" size="icon" className="h-7 w-7 ml-2" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <AnimatePresence mode="wait">
            {/* Step 1: Goal */}
            {(orderStep === 'goal' || orderStep === 'strategy_review') && (
              <motion.div
                key="goal"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {/* Org Intelligence Banner */}
                {wizard.orgIntelData?.organization && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Brain className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">Organization Intelligence Active</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          Recommendations personalized using your ICP, positioning & offerings
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] shrink-0">AI Enhanced</Badge>
                    </CardContent>
                  </Card>
                )}

                {/* Goal Input */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">What's your campaign goal?</Label>
                  <Textarea
                    placeholder="e.g., Generate 50 high-quality leads from tech companies with 200+ employees interested in cloud security..."
                    value={goalInput}
                    onChange={e => setGoalInput(e.target.value)}
                    className="min-h-[100px] resize-none"
                    disabled={wizard.isRecommending}
                  />
                </div>

                {/* Context Files */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Context Documents (optional)</Label>
                  <div className="flex flex-wrap gap-2">
                    {wizard.uploadedFiles.map(f => (
                      <Badge key={f.key} variant="secondary" className="gap-1 pr-1">
                        <FileText className="h-3 w-3" />
                        <span className="max-w-[120px] truncate text-xs">{f.name}</span>
                        <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => wizard.removeFile(f.key, 'context')}>
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                    <label className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-dashed rounded-md cursor-pointer hover:bg-muted transition-colors">
                      <Upload className="h-3 w-3" />
                      Upload
                      <input
                        ref={wizard.fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx,.doc,.txt,.csv,.xlsx"
                        multiple
                        onChange={e => wizard.handleFileUpload(e, 'context')}
                      />
                    </label>
                  </div>
                  {wizard.isExtracting && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Extracting targeting data...
                    </p>
                  )}
                </div>

                {/* Context URLs */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Reference URLs (optional)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="https://your-site.com/landing-page"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddUrl();
                        }
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={handleAddUrl}>
                      Add
                    </Button>
                  </div>
                  {wizard.contextUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {wizard.contextUrls.map((url) => (
                        <Badge key={url} variant="secondary" className="gap-1 pr-1">
                          <Globe className="h-3 w-3" />
                          <span className="max-w-[140px] truncate text-xs">{url}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 p-0 hover:bg-transparent"
                            onClick={() => wizard.removeUrl(url)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Generate Button */}
                <Button
                  onClick={handleGoalSubmit}
                  disabled={!goalInput.trim() || wizard.isRecommending}
                  className="w-full gap-2"
                >
                  {wizard.isRecommending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating AI Strategy...</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> Generate AI Strategy</>
                  )}
                </Button>

                {/* AI Strategy Review */}
                {wizard.showAiReview && wizard.recommendation && (
                  <Card className="border-amber-200 bg-amber-50/50">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-600" />
                        <h4 className="font-semibold text-sm">AI Strategy Recommendation</h4>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {wizard.recommendation.rationale}
                      </p>
                      <Separator />
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Campaign Type</p>
                          <p className="font-medium">
                            {CAMPAIGN_TYPES.find(c => c.value === wizard.recommendation?.campaignType)?.label || wizard.recommendation.campaignType}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Volume</p>
                          <p className="font-medium">{wizard.recommendation.suggestedVolume} leads</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Est. Cost</p>
                          <p className="font-medium">{formatCurrency(wizard.recommendation.estimatedCost)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Channels</p>
                          <p className="font-medium capitalize">{wizard.recommendation.channels.join(', ')}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button
                          className="flex-1 gap-1"
                          onClick={() => {
                            wizard.approveStrategy();
                            onStepChange('configure');
                          }}
                        >
                          <Check className="h-4 w-4" /> Approve & Configure
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            wizard.reset();
                            setGoalInput('');
                            onStepChange('goal');
                          }}
                        >
                          Retry
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            )}

            {/* Step 2: Configure */}
            {orderStep === 'configure' && (
              <motion.div
                key="configure"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {/* Campaign Type */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Campaign Type</Label>
                  <Select value={wizard.config.campaignType} onValueChange={v => wizard.updateConfig({ campaignType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CAMPAIGN_TYPES.map(ct => (
                        <SelectItem key={ct.value} value={ct.value}>
                          <span className="font-medium">{ct.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Volume */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Volume</Label>
                    <span className="text-sm font-bold text-primary">{wizard.config.volume} leads</span>
                  </div>
                  <Slider
                    value={[wizard.config.volume]}
                    onValueChange={([v]) => wizard.updateConfig({ volume: v })}
                    min={25}
                    max={wizard.config.campaignType === 'high_quality_leads' ? 100 : 1000}
                    step={wizard.config.campaignType === 'high_quality_leads' ? 5 : 25}
                  />
                  {wizard.config.campaignType === 'high_quality_leads' && (
                    <p className="text-[10px] text-amber-600">HQL orders capped at 100 leads</p>
                  )}
                </div>

                {/* Targeting */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Industries</Label>
                    <Input
                      placeholder="Technology, Finance..."
                      value={wizard.config.industries}
                      onChange={e => wizard.updateConfig({ industries: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Job Titles</Label>
                    <Input
                      placeholder="CTO, VP Engineering..."
                      value={wizard.config.jobTitles}
                      onChange={e => wizard.updateConfig({ jobTitles: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Company Size</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={wizard.config.companySizeMin || ''}
                        onChange={e => wizard.updateConfig({ companySizeMin: parseInt(e.target.value) || undefined })}
                        className="w-full"
                      />
                      <span className="text-muted-foreground text-xs">-</span>
                      <Input
                        type="number"
                        placeholder="Max"
                        value={wizard.config.companySizeMax || ''}
                        onChange={e => wizard.updateConfig({ companySizeMax: parseInt(e.target.value) || undefined })}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Geographies</Label>
                    <Input
                      placeholder="United States, Canada..."
                      value={wizard.config.geographies}
                      onChange={e => wizard.updateConfig({ geographies: e.target.value })}
                    />
                  </div>
                </div>

                {/* Delivery */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Timeline</Label>
                    <Select value={wizard.config.deliveryTimeline} onValueChange={v => wizard.updateConfig({ deliveryTimeline: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DELIVERY_TIMELINES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Delivery Method</Label>
                    <Select value={wizard.config.deliveryMethod} onValueChange={v => wizard.updateConfig({ deliveryMethod: v })}>
                      <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                      <SelectContent>
                        {DELIVERY_METHODS.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Channels */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Channels</Label>
                  <div className="flex gap-4">
                    {['voice', 'email'].map(ch => (
                      <label key={ch} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={wizard.config.channels.includes(ch)}
                          onCheckedChange={(checked) => {
                            const newChannels = checked
                              ? [...wizard.config.channels, ch]
                              : wizard.config.channels.filter(c => c !== ch);
                            wizard.updateConfig({ channels: newChannels });
                          }}
                        />
                        <div className="flex items-center gap-1">
                          {ch === 'voice' ? <Phone className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                          <span className="text-sm capitalize">{ch}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* File uploads */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Additional Files</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['target_accounts', 'suppression', 'template'] as const).map(cat => {
                      const labels = {
                        target_accounts: 'Target Accounts',
                        suppression: 'Suppression List',
                        template: 'Templates',
                      };
                      const files = cat === 'target_accounts' ? wizard.targetAccountFiles
                        : cat === 'suppression' ? wizard.suppressionFiles
                        : wizard.templateFiles;
                      const ref = cat === 'target_accounts' ? wizard.targetAccountsInputRef
                        : cat === 'suppression' ? wizard.suppressionInputRef
                        : wizard.templateInputRef;
                      return (
                        <label key={cat} className="flex items-center gap-2 p-2 border border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                          <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs">{labels[cat]}</span>
                            {files.length > 0 && (
                              <Badge variant="secondary" className="ml-1 text-[10px]">{files.length}</Badge>
                            )}
                          </div>
                          <input
                            ref={ref}
                            type="file"
                            className="hidden"
                            accept={cat === 'template' ? '.pdf,.docx,.doc,.txt' : '.csv,.xlsx,.xls'}
                            multiple
                            onChange={e => wizard.handleFileUpload(e, cat)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Special Requirements */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Special Requirements</Label>
                  <Textarea
                    placeholder="Any additional requirements or notes..."
                    value={wizard.config.specialRequirements}
                    onChange={e => wizard.updateConfig({ specialRequirements: e.target.value })}
                    className="min-h-[60px] resize-none"
                  />
                </div>

                {/* Cost Estimate */}
                {wizard.pricing && (
                  <Card className="border-primary/20">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Estimated Cost</span>
                        <div className="text-right">
                          <span className="text-xl font-bold">{formatCurrency(wizard.pricing.totalCost)}</span>
                          <p className="text-[10px] text-muted-foreground">
                            {formatCurrency(wizard.pricing.baseRate)}/lead x {wizard.config.volume}
                          </p>
                        </div>
                      </div>
                      {(wizard.pricing.volumeDiscount > 0 || wizard.pricing.rushFee > 0) && (
                        <div className="space-y-1 pt-1 border-t">
                          {wizard.pricing.volumeDiscount > 0 && (
                            <div className="flex justify-between text-xs text-green-600">
                              <span>Volume discount ({wizard.pricing.volumeDiscountPercent}%)</span>
                              <span>-{formatCurrency(wizard.pricing.volumeDiscount)}</span>
                            </div>
                          )}
                          {wizard.pricing.rushFee > 0 && (
                            <div className="flex justify-between text-xs text-amber-600">
                              <span>Rush fee ({wizard.pricing.rushFeePercent}%)</span>
                              <span>+{formatCurrency(wizard.pricing.rushFee)}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {wizard.pricing.hasCustomPricing && (
                        <Badge variant="secondary" className="text-[10px]">Custom pricing applied</Badge>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Navigation */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => onStepChange('goal')} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button className="flex-1 gap-1" onClick={() => onStepChange('review')}>
                    Review Order <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Review & Submit */}
            {orderStep === 'review' && (
              <motion.div
                key="review"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center pb-2">
                  <h4 className="font-semibold">Review Your Order</h4>
                  <p className="text-xs text-muted-foreground">Confirm details before submitting</p>
                </div>

                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Campaign Type</p>
                        <p className="font-medium">{CAMPAIGN_TYPES.find(c => c.value === wizard.config.campaignType)?.label}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Volume</p>
                        <p className="font-medium">{wizard.config.volume} leads</p>
                      </div>
                      {wizard.config.industries && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Industries</p>
                          <p className="font-medium">{wizard.config.industries}</p>
                        </div>
                      )}
                      {wizard.config.jobTitles && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Job Titles</p>
                          <p className="font-medium">{wizard.config.jobTitles}</p>
                        </div>
                      )}
                      {wizard.config.geographies && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Geographies</p>
                          <p className="font-medium">{wizard.config.geographies}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Timeline</p>
                        <p className="font-medium">
                          {DELIVERY_TIMELINES.find(t => t.value === wizard.config.deliveryTimeline)?.label}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Channels</p>
                        <p className="font-medium capitalize">{wizard.config.channels.join(', ')}</p>
                      </div>
                      {wizard.config.deliveryMethod && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Delivery</p>
                          <p className="font-medium">
                            {DELIVERY_METHODS.find(m => m.value === wizard.config.deliveryMethod)?.label}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Attached files summary */}
                    {(wizard.uploadedFiles.length > 0 || wizard.targetAccountFiles.length > 0 || wizard.suppressionFiles.length > 0 || wizard.contextUrls.length > 0) && (
                      <>
                        <Separator />
                        <div className="flex flex-wrap gap-1.5">
                          {wizard.contextUrls.length > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Globe className="h-3 w-3" /> {wizard.contextUrls.length} URL{wizard.contextUrls.length > 1 ? 's' : ''}
                            </Badge>
                          )}
                          {wizard.uploadedFiles.length > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <FileText className="h-3 w-3" /> {wizard.uploadedFiles.length} context docs
                            </Badge>
                          )}
                          {wizard.targetAccountFiles.length > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Target className="h-3 w-3" /> {wizard.targetAccountFiles.length} target lists
                            </Badge>
                          )}
                          {wizard.suppressionFiles.length > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <X className="h-3 w-3" /> {wizard.suppressionFiles.length} suppression lists
                            </Badge>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Total Cost */}
                {wizard.pricing && (
                  <Card className="border-primary bg-gradient-to-br from-primary/5 to-primary/10">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase font-medium">Estimated Total</p>
                      <p className="text-3xl font-bold text-primary mt-1">{formatCurrency(wizard.pricing.totalCost)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatCurrency(wizard.pricing.baseRate)}/lead &middot; {wizard.config.volume} leads
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => onStepChange('configure')} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> Edit
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={handleSubmitOrder}
                    disabled={wizard.isCreatingOrder}
                  >
                    {wizard.isCreatingOrder ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Creating Order...</>
                    ) : (
                      <><Rocket className="h-4 w-4" /> Submit Order</>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Submitted Success */}
            {orderStep === 'submitted' && (
              <motion.div
                key="submitted"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 space-y-4"
              >
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div className="text-center space-y-1">
                  <h4 className="text-lg font-semibold">Order Submitted!</h4>
                  <p className="text-sm text-muted-foreground">Your campaign order has been submitted for review.</p>
                </div>
                <Button onClick={handleClose} className="gap-2">
                  <Check className="h-4 w-4" /> Done
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}
