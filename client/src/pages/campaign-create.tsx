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
import { useLocation } from "wouter";
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
  const [selectedChannel, setSelectedChannel] = useState<'email' | 'voice' | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const handleChannelSelect = (channel: 'email' | 'voice') => {
    setSelectedChannel(channel);
    setSelectedType(null); // Reset type when channel changes
  };

  const handleTypeSelect = (typeValue: string) => {
    setSelectedType(typeValue);
  };

  const handleContinue = () => {
    if (!selectedChannel || !selectedType) return;

    // Navigate to the appropriate creation flow with the selected type
    if (selectedChannel === 'email') {
      setLocation(`/campaigns/email/create?type=${selectedType}`);
    } else {
      setLocation(`/phone-campaigns/create?type=${selectedType}`);
    }
  };

  const availableTypes = selectedChannel
    ? getCampaignTypesForChannel(selectedChannel)
    : UNIFIED_CAMPAIGN_TYPES;

  const selectedTypeDetails = selectedType ? getCampaignType(selectedType) : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Create New Campaign</h1>
          <p className="text-muted-foreground max-w-2xl">
            Launch a unified campaign with consistent strategy across email and voice channels.
            Campaign types, messaging, and strategic intent are standardized to ensure alignment.
          </p>
        </div>

        {/* Step 1: Channel Selection */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1">Step 1</Badge>
            <h2 className="text-xl font-semibold">Select Channel</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {CHANNEL_OPTIONS.map((channel) => {
              const Icon = channel.icon;
              const isSelected = selectedChannel === channel.id;
              const colorClasses = channel.id === 'email'
                ? 'border-blue-500 bg-blue-500/5'
                : 'border-purple-500 bg-purple-500/5';

              return (
                <Card
                  key={channel.id}
                  className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                    isSelected ? colorClasses : 'hover:border-muted-foreground/30'
                  }`}
                  onClick={() => handleChannelSelect(channel.id)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className={`p-3 rounded-lg ${
                        channel.id === 'email' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                      }`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      {isSelected && (
                        <Badge className={channel.id === 'email' ? 'bg-blue-500' : 'bg-purple-500'}>
                          Selected
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="mt-4">{channel.title}</CardTitle>
                    <CardDescription>{channel.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      {channel.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            channel.id === 'email' ? 'bg-blue-500' : 'bg-purple-500'
                          }`} />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Step 2: Campaign Type Selection */}
        {selectedChannel && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="px-3 py-1">Step 2</Badge>
              <h2 className="text-xl font-semibold">Select Campaign Type</h2>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Campaign Objective
                </CardTitle>
                <CardDescription>
                  Campaign types are unified across email and voice channels.
                  The same strategic intent drives both your emails and voice conversations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="all" className="w-full">
                  <TabsList className="grid w-full grid-cols-5 mb-4">
                    <TabsTrigger value="all">All Types</TabsTrigger>
                    <TabsTrigger value="conversion">Conversion</TabsTrigger>
                    <TabsTrigger value="qualification">Qualification</TabsTrigger>
                    <TabsTrigger value="engagement">Engagement</TabsTrigger>
                    <TabsTrigger value="awareness">Awareness</TabsTrigger>
                  </TabsList>

                  {['all', 'conversion', 'qualification', 'engagement', 'awareness', 'retention'].map((goal) => (
                    <TabsContent key={goal} value={goal} className="mt-4">
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {availableTypes
                          .filter(type => goal === 'all' || type.primaryGoal === goal)
                          .map((type) => {
                            const isSelected = selectedType === type.value;

                            return (
                              <Card
                                key={type.value}
                                className={`cursor-pointer transition-all duration-200 ${
                                  isSelected
                                    ? 'border-primary bg-primary/5 shadow-sm'
                                    : 'hover:border-muted-foreground/30 hover:bg-muted/20'
                                }`}
                                onClick={() => handleTypeSelect(type.value)}
                              >
                                <CardContent className="p-4">
                                  <div className="flex items-start justify-between mb-2">
                                    <h4 className="font-medium">{type.label}</h4>
                                    {isSelected && (
                                      <Badge variant="default" className="text-xs">Selected</Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-3">
                                    {type.description}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-xs capitalize">
                                      {type.primaryGoal}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs capitalize">
                                      {type.emailTone}
                                    </Badge>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Strategic Intent Preview */}
        {selectedTypeDetails && (
          <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300 border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Strategic Intent
              </CardTitle>
              <CardDescription>
                This strategic intent will guide both email content and voice conversations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed">
                {selectedTypeDetails.strategicIntent}
              </p>

              <div className="grid md:grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Mail className="h-4 w-4 text-blue-500" />
                    Email Approach
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Tone: <span className="capitalize font-medium">{selectedTypeDetails.emailTone}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Phone className="h-4 w-4 text-purple-500" />
                    Voice Personality
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedTypeDetails.voicePersonality.map((trait, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs capitalize">
                        {trait}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Continue Button */}
        {selectedChannel && selectedType && (
          <div className="flex justify-end animate-in fade-in slide-in-from-bottom-4 duration-300">
            <Button size="lg" onClick={handleContinue} className="gap-2">
              Continue to {selectedChannel === 'email' ? 'Email' : 'Voice'} Setup
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Important Notice */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Campaign-Bound Content</p>
                <p className="text-sm text-muted-foreground">
                  Email templates and voice scripts are created within the context of each campaign.
                  This ensures messaging consistency and prevents orphaned or misaligned content.
                  All content generation uses the same strategic framework via DeepSeek AI.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
