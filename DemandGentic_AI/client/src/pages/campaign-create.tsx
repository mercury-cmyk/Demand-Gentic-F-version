/**
 * Unified Campaign Creation Page
 *
 * DESIGN PRINCIPLES:
 * 1. Single entry point for ALL campaign creation (email and voice)
 * 2. Campaign types are UNIFIED across channels
 * 3. Email templates and voice scripts are CAMPAIGN-BOUND
 * 4. Consistent strategic intent regardless of channel
 *
 * This page replaces scattered campaign creation flows with a unified experience.
 */

import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Mail, Phone, ArrowRight, Sparkles, Target, MessageSquare, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UNIFIED_CAMPAIGN_TYPES, getCampaignTypesForChannel, getCampaignType } from "@/lib/campaign-types";

interface ChannelOption {
  id: 'email' | 'voice';
  title: string;
  description: string;
  icon: React.ElementType;
  features: string[];
  color: string;
}

const CHANNEL_OPTIONS: ChannelOption[] = [
  {
    id: 'email',
    title: 'Email Campaign',
    description: 'Reach contacts through personalized email outreach',
    icon: Mail,
    features: [
      'AI-generated email content using DeepSeek',
      'Campaign-specific templates',
      'A/B testing and optimization',
      'Deliverability compliance checks',
    ],
    color: 'blue',
  },
  {
    id: 'voice',
    title: 'Voice Campaign',
    description: 'Connect with contacts through phone calls',
    icon: Phone,
    features: [
      'AI voice agents or human dialers',
      'Campaign-specific call scripts',
      'Lead qualification and routing',
      'Call recording and analytics',
    ],
    color: 'purple',
  },
];

export default function CampaignCreatePage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const urlClientId = searchParams.get('clientId') || '';
  const urlProjectId = searchParams.get('projectId') || '';
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [selectedType, setSelectedType] = useState(null);

  const handleChannelSelect = (channel: 'email' | 'voice') => {
    setSelectedChannel(channel);
    setSelectedType(null); // Reset type when channel changes
  };

  const handleTypeSelect = (typeValue: string) => {
    setSelectedType(typeValue);
  };

  const handleContinue = () => {
    if (!selectedChannel || !selectedType) return;

    // Build query params, forwarding clientId/projectId if present
    const params = new URLSearchParams({ type: selectedType });
    if (urlClientId) params.set('clientId', urlClientId);
    if (urlProjectId) params.set('projectId', urlProjectId);

    // Navigate to the appropriate creation flow with the selected type
    if (selectedChannel === 'email') {
      setLocation(`/campaigns/email/create?${params.toString()}`);
    } else {
      setLocation(`/phone-campaigns/create?${params.toString()}`);
    }
  };

  const availableTypes = selectedChannel
    ? getCampaignTypesForChannel(selectedChannel)
    : UNIFIED_CAMPAIGN_TYPES;

  const selectedTypeDetails = selectedType ? getCampaignType(selectedType) : null;

  return (
    
      
        {/* Header */}
        
          Create New Campaign
          
            Launch a unified campaign with consistent strategy across email and voice channels.
            Campaign types, messaging, and strategic intent are standardized to ensure alignment.
          
        

        {/* Step 1: Channel Selection */}
        
          
            Step 1
            Select Channel
          

          
            {CHANNEL_OPTIONS.map((channel) => {
              const Icon = channel.icon;
              const isSelected = selectedChannel === channel.id;
              const colorClasses = channel.id === 'email'
                ? 'border-blue-500 bg-blue-500/5'
                : 'border-purple-500 bg-purple-500/5';

              return (
                 handleChannelSelect(channel.id)}
                >
                  
                    
                      
                        
                      
                      {isSelected && (
                        
                          Selected
                        
                      )}
                    
                    {channel.title}
                    {channel.description}
                  
                  
                    
                      {channel.features.map((feature, idx) => (
                        
                          
                          {feature}
                        
                      ))}
                    
                  
                
              );
            })}
          
        

        {/* Step 2: Campaign Type Selection */}
        {selectedChannel && (
          
            
              Step 2
              Select Campaign Type
            

            
              
                
                  
                  Campaign Objective
                
                
                  Campaign types are unified across email and voice channels.
                  The same strategic intent drives both your emails and voice conversations.
                
              
              
                
                  
                    All Types
                    Conversion
                    Qualification
                    Engagement
                    Awareness
                  

                  {['all', 'conversion', 'qualification', 'engagement', 'awareness', 'retention'].map((goal) => (
                    
                      
                        {availableTypes
                          .filter(type => goal === 'all' || type.primaryGoal === goal)
                          .map((type) => {
                            const isSelected = selectedType === type.value;

                            return (
                               handleTypeSelect(type.value)}
                              >
                                
                                  
                                    {type.label}
                                    {isSelected && (
                                      Selected
                                    )}
                                  
                                  
                                    {type.description}
                                  
                                  
                                    
                                      {type.primaryGoal}
                                    
                                    
                                      {type.emailTone}
                                    
                                  
                                
                              
                            );
                          })}
                      
                    
                  ))}
                
              
            
          
        )}

        {/* Strategic Intent Preview */}
        {selectedTypeDetails && (
          
            
              
                
                Strategic Intent
              
              
                This strategic intent will guide both email content and voice conversations
              
            
            
              
                {selectedTypeDetails.strategicIntent}
              

              
                
                  
                    
                    Email Approach
                  
                  
                    Tone: {selectedTypeDetails.emailTone}
                  
                

                
                  
                    
                    Voice Personality
                  
                  
                    {selectedTypeDetails.voicePersonality.map((trait, idx) => (
                      
                        {trait}
                      
                    ))}
                  
                
              
            
          
        )}

        {/* Continue Button */}
        {selectedChannel && selectedType && (
          
            
              Continue to {selectedChannel === 'email' ? 'Email' : 'Voice'} Setup
              
            
          
        )}

        {/* Important Notice */}
        
          
            
              
              
                Campaign-Bound Content
                
                  Email templates and voice scripts are created within the context of each campaign.
                  This ensures messaging consistency and prevents orphaned or misaligned content.
                  All content generation uses the same strategic framework via DeepSeek AI.
                
              
            
          
        
      
    
  );
}