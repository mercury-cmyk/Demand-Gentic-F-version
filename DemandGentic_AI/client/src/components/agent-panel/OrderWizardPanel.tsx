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
  const stepMap: Record = {
    goal: 0, strategy_review: 0, configure: 1, review: 2, submitted: 2,
  };
  const activeIdx = stepMap[currentStep] ?? 0;

  return (
    
      {/* Connector Line */}
      
        
            
        
      

      {STEP_LABELS.map((label, i) => {
        const isActive = i === activeIdx;
        const isCompleted = i 
                
                    {isCompleted ? (
                        
                    ) : (
                        
                            {i + 1}
                        
                    )}
                
                
                    {label}
                
            
        )
      })}
    
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
    
      {/* Header */}
      
        
          
            
          
          
            Campaign Order
            
              {orderStep === 'submitted' ? 'Submitted' : `Step ${orderStep === 'goal' || orderStep === 'strategy_review' ? 1 : orderStep === 'configure' ? 2 : 3} of 3`}
            
          
        
        
          
          
            
          
        
      

      {/* Content */}
      
        
          
            {/* Step 1: Goal */}
            {(orderStep === 'goal' || orderStep === 'strategy_review') && (
              
                {/* Org Intelligence Banner */}
                {wizard.orgIntelData?.organization && (
                  
                    
                      
                        
                      
                      
                        Organization Intelligence Active
                        
                          Recommendations personalized using your ICP, positioning & offerings
                        
                      
                      AI Enhanced
                    
                  
                )}

                {/* Goal Input */}
                
                  What's your campaign goal?
                   setGoalInput(e.target.value)}
                    className="min-h-[100px] resize-none"
                    disabled={wizard.isRecommending}
                  />
                

                {/* Context Files */}
                
                  Context Documents (optional)
                  
                    {wizard.uploadedFiles.map(f => (
                      
                        
                        {f.name}
                         wizard.removeFile(f.key, 'context')}>
                          
                        
                      
                    ))}
                    
                      
                      Upload
                       wizard.handleFileUpload(e, 'context')}
                      />
                    
                  
                  {wizard.isExtracting && (
                    
                       Extracting targeting data...
                    
                  )}
                

                {/* Context URLs */}
                
                  Reference URLs (optional)
                  
                     setNewUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddUrl();
                        }
                      }}
                    />
                    
                      Add
                    
                  
                  {wizard.contextUrls.length > 0 && (
                    
                      {wizard.contextUrls.map((url) => (
                        
                          
                          {url}
                           wizard.removeUrl(url)}
                          >
                            
                          
                        
                      ))}
                    
                  )}
                

                {/* Generate Button */}
                
                  {wizard.isRecommending ? (
                    <> Generating AI Strategy...
                  ) : (
                    <> Generate AI Strategy
                  )}
                

                {/* AI Strategy Review */}
                {wizard.showAiReview && wizard.recommendation && (
                  
                    
                      
                        
                        AI Strategy Recommendation
                      
                      
                        {wizard.recommendation.rationale}
                      
                      
                      
                        
                          Campaign Type
                          
                            {CAMPAIGN_TYPES.find(c => c.value === wizard.recommendation?.campaignType)?.label || wizard.recommendation.campaignType}
                          
                        
                        
                          Volume
                          {wizard.recommendation.suggestedVolume} leads
                        
                        
                          Est. Cost
                          {formatCurrency(wizard.recommendation.estimatedCost)}
                        
                        
                          Channels
                          {wizard.recommendation.channels.join(', ')}
                        
                      
                      
                         {
                            wizard.approveStrategy();
                            onStepChange('configure');
                          }}
                        >
                           Approve & Configure
                        
                         {
                            wizard.reset();
                            setGoalInput('');
                            onStepChange('goal');
                          }}
                        >
                          Retry
                        
                      
                    
                  
                )}
              
            )}

            {/* Step 2: Configure */}
            {orderStep === 'configure' && (
              
                {/* Campaign Type */}
                
                  Campaign Type
                   wizard.updateConfig({ campaignType: v })}>
                    
                    
                      {CAMPAIGN_TYPES.map(ct => (
                        
                          {ct.label}
                        
                      ))}
                    
                  
                

                {/* Volume */}
                
                  
                    Volume
                    {wizard.config.volume} leads
                  
                   wizard.updateConfig({ volume: v })}
                    min={25}
                    max={wizard.config.campaignType === 'high_quality_leads' ? 100 : 1000}
                    step={wizard.config.campaignType === 'high_quality_leads' ? 5 : 25}
                  />
                  {wizard.config.campaignType === 'high_quality_leads' && (
                    HQL orders capped at 100 leads
                  )}
                

                {/* Targeting */}
                
                  
                    Industries
                     wizard.updateConfig({ industries: e.target.value })}
                    />
                  
                  
                    Job Titles
                     wizard.updateConfig({ jobTitles: e.target.value })}
                    />
                  
                  
                    Company Size
                    
                       wizard.updateConfig({ companySizeMin: parseInt(e.target.value) || undefined })}
                        className="w-full"
                      />
                      -
                       wizard.updateConfig({ companySizeMax: parseInt(e.target.value) || undefined })}
                        className="w-full"
                      />
                    
                  
                  
                    Geographies
                     wizard.updateConfig({ geographies: e.target.value })}
                    />
                  
                

                {/* Delivery */}
                
                  
                    Timeline
                     wizard.updateConfig({ deliveryTimeline: v })}>
                      
                      
                        {DELIVERY_TIMELINES.map(t => (
                          {t.label}
                        ))}
                      
                    
                  
                  
                    Delivery Method
                     wizard.updateConfig({ deliveryMethod: v })}>
                      
                      
                        {DELIVERY_METHODS.map(m => (
                          {m.label}
                        ))}
                      
                    
                  
                

                {/* Channels */}
                
                  Channels
                  
                    {['voice', 'email'].map(ch => (
                      
                         {
                            const newChannels = checked
                              ? [...wizard.config.channels, ch]
                              : wizard.config.channels.filter(c => c !== ch);
                            wizard.updateConfig({ channels: newChannels });
                          }}
                        />
                        
                          {ch === 'voice' ?  : }
                          {ch}
                        
                      
                    ))}
                  
                

                {/* File uploads */}
                
                  Additional Files
                  
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
                        
                          
                          
                            {labels[cat]}
                            {files.length > 0 && (
                              {files.length}
                            )}
                          
                           wizard.handleFileUpload(e, cat)}
                          />
                        
                      );
                    })}
                  
                

                {/* Special Requirements */}
                
                  Special Requirements
                   wizard.updateConfig({ specialRequirements: e.target.value })}
                    className="min-h-[60px] resize-none"
                  />
                

                {/* Cost Estimate */}
                {wizard.pricing && (
                  
                    
                      
                        Estimated Cost
                        
                          {formatCurrency(wizard.pricing.totalCost)}
                          
                            {formatCurrency(wizard.pricing.baseRate)}/lead x {wizard.config.volume}
                          
                        
                      
                      {(wizard.pricing.volumeDiscount > 0 || wizard.pricing.rushFee > 0) && (
                        
                          {wizard.pricing.volumeDiscount > 0 && (
                            
                              Volume discount ({wizard.pricing.volumeDiscountPercent}%)
                              -{formatCurrency(wizard.pricing.volumeDiscount)}
                            
                          )}
                          {wizard.pricing.rushFee > 0 && (
                            
                              Rush fee ({wizard.pricing.rushFeePercent}%)
                              +{formatCurrency(wizard.pricing.rushFee)}
                            
                          )}
                        
                      )}
                      {wizard.pricing.hasCustomPricing && (
                        Custom pricing applied
                      )}
                    
                  
                )}

                {/* Navigation */}
                
                   onStepChange('goal')} className="gap-1">
                     Back
                  
                   onStepChange('review')}>
                    Review Order 
                  
                
              
            )}

            {/* Step 3: Review & Submit */}
            {orderStep === 'review' && (
              
                
                  Review Your Order
                  Confirm details before submitting
                

                
                  
                    
                      
                        Campaign Type
                        {CAMPAIGN_TYPES.find(c => c.value === wizard.config.campaignType)?.label}
                      
                      
                        Volume
                        {wizard.config.volume} leads
                      
                      {wizard.config.industries && (
                        
                          Industries
                          {wizard.config.industries}
                        
                      )}
                      {wizard.config.jobTitles && (
                        
                          Job Titles
                          {wizard.config.jobTitles}
                        
                      )}
                      {wizard.config.geographies && (
                        
                          Geographies
                          {wizard.config.geographies}
                        
                      )}
                      
                        Timeline
                        
                          {DELIVERY_TIMELINES.find(t => t.value === wizard.config.deliveryTimeline)?.label}
                        
                      
                      
                        Channels
                        {wizard.config.channels.join(', ')}
                      
                      {wizard.config.deliveryMethod && (
                        
                          Delivery
                          
                            {DELIVERY_METHODS.find(m => m.value === wizard.config.deliveryMethod)?.label}
                          
                        
                      )}
                    

                    {/* Attached files summary */}
                    {(wizard.uploadedFiles.length > 0 || wizard.targetAccountFiles.length > 0 || wizard.suppressionFiles.length > 0 || wizard.contextUrls.length > 0) && (
                      <>
                        
                        
                          {wizard.contextUrls.length > 0 && (
                            
                               {wizard.contextUrls.length} URL{wizard.contextUrls.length > 1 ? 's' : ''}
                            
                          )}
                          {wizard.uploadedFiles.length > 0 && (
                            
                               {wizard.uploadedFiles.length} context docs
                            
                          )}
                          {wizard.targetAccountFiles.length > 0 && (
                            
                               {wizard.targetAccountFiles.length} target lists
                            
                          )}
                          {wizard.suppressionFiles.length > 0 && (
                            
                               {wizard.suppressionFiles.length} suppression lists
                            
                          )}
                        
                      
                    )}
                  
                

                {/* Total Cost */}
                {wizard.pricing && (
                  
                    
                      Estimated Total
                      {formatCurrency(wizard.pricing.totalCost)}
                      
                        {formatCurrency(wizard.pricing.baseRate)}/lead &middot; {wizard.config.volume} leads
                      
                    
                  
                )}

                {/* Actions */}
                
                   onStepChange('configure')} className="gap-1">
                     Edit
                  
                  
                    {wizard.isCreatingOrder ? (
                      <> Creating Order...
                    ) : (
                      <> Submit Order
                    )}
                  
                
              
            )}

            {/* Submitted Success */}
            {orderStep === 'submitted' && (
              
                
                  
                
                
                  Order Submitted!
                  Your campaign order has been submitted for review.
                
                
                   Done
                
              
            )}
          
        
      
    
  );
}