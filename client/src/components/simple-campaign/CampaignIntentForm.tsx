/**
 * CampaignIntentForm - Page 1 of Simple Campaign Builder
 * 
 * Collects campaign intent: name, sender settings, subject line
 * No audience. No scheduling. No distractions.
 * 
 * Design: Single column, top-to-bottom flow
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Mail, ArrowRight, User, Reply, AlertCircle, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SenderProfile {
  id: string;
  name: string;
  email: string;
  replyTo?: string;
  isVerified: boolean;
}

interface CampaignIntent {
  campaignName: string;
  senderProfileId: string;
  senderName: string;
  fromEmail: string;
  replyToEmail: string;
  subject: string;
}

interface CampaignIntentFormProps {
  initialData?: Partial<CampaignIntent>;
  onNext: (data: CampaignIntent) => void;
  onCancel: () => void;
}

export function CampaignIntentForm({ initialData, onNext, onCancel }: CampaignIntentFormProps) {
  const { toast } = useToast();
  
  // Form state
  const [campaignName, setCampaignName] = useState(initialData?.campaignName || "");
  const [senderProfileId, setSenderProfileId] = useState(initialData?.senderProfileId || "");
  const [subject, setSubject] = useState(initialData?.subject || "");
  
  // Sender profile state
  const [senderProfiles, setSenderProfiles] = useState<SenderProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<SenderProfile | null>(null);
  
  // AI suggestion state
  const [aiSuggesting, setAiSuggesting] = useState(false);
  
  // Fetch sender profiles
  useEffect(() => {
    const fetchSenderProfiles = async () => {
      try {
        setLoadingProfiles(true);
        const res = await apiRequest("GET", "/api/sender-profiles");
        const profiles = await res.json();
        setSenderProfiles(profiles || []);
        
        // Auto-select first verified profile
        if (!senderProfileId && profiles?.length > 0) {
          const verifiedProfile = profiles.find((p: SenderProfile) => p.isVerified);
          if (verifiedProfile) {
            setSenderProfileId(verifiedProfile.id);
            setSelectedProfile(verifiedProfile);
          }
        } else if (senderProfileId) {
          const existing = profiles.find((p: SenderProfile) => p.id === senderProfileId);
          if (existing) {
            setSelectedProfile(existing);
          }
        }
      } catch (error) {
        console.error("Failed to fetch sender profiles:", error);
        toast({
          title: "Error",
          description: "Failed to load sender profiles",
          variant: "destructive"
        });
      } finally {
        setLoadingProfiles(false);
      }
    };
    
    fetchSenderProfiles();
  }, []);
  
  // Update selected profile when ID changes
  const handleProfileChange = (profileId: string) => {
    setSenderProfileId(profileId);
    const profile = senderProfiles.find(p => p.id === profileId);
    setSelectedProfile(profile || null);
  };
  
  // AI Subject suggestion
  const handleAiSuggestSubject = async () => {
    if (!campaignName.trim()) {
      toast({
        title: "Campaign name needed",
        description: "Enter a campaign name first to get AI suggestions",
        variant: "destructive"
      });
      return;
    }
    
    setAiSuggesting(true);
    try {
      const res = await apiRequest("POST", "/api/ai/suggest-subject", {
        campaignName,
        context: campaignName
      });
      const data = await res.json();
      if (data.subject) {
        setSubject(data.subject);
      }
    } catch (error) {
      // Fallback: generate a simple subject from campaign name
      const words = campaignName.split(" ").slice(0, 4).join(" ");
      setSubject(`Quick question about ${words}`);
    } finally {
      setAiSuggesting(false);
    }
  };
  
  // Validation
  const isValid = campaignName.trim() && senderProfileId && subject.trim();
  
  // Handle submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValid || !selectedProfile) return;
    
    onNext({
      campaignName: campaignName.trim(),
      senderProfileId,
      senderName: selectedProfile.name,
      fromEmail: selectedProfile.email,
      replyToEmail: selectedProfile.replyTo || selectedProfile.email,
      subject: subject.trim()
    });
  };
  
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-xl mx-auto">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
            Create Email Campaign
          </h1>
          <p className="mt-2 text-slate-500">
            Define your campaign intent. Build the message next.
          </p>
        </div>
        
        {/* Main Form Card */}
        <Card className="shadow-lg border-slate-200">
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Campaign Name */}
              <div className="space-y-2">
                <Label htmlFor="campaignName" className="text-sm font-semibold text-slate-700">
                  Campaign Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="campaignName"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Q1 ABM Outreach – Finance Leaders"
                  className="h-12 text-base"
                  autoFocus
                />
                <p className="text-xs text-slate-400">Internal name for tracking. Not visible to recipients.</p>
              </div>
              
              {/* Sender Settings Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <User className="w-4 h-4 text-slate-400" />
                  <Label className="text-sm font-semibold text-slate-700">Sender Settings</Label>
                </div>
                
                {/* Sender Profile Select */}
                <div className="space-y-2">
                  <Label htmlFor="senderProfile" className="text-xs font-medium text-slate-500">
                    Sender Profile <span className="text-red-500">*</span>
                  </Label>
                  {loadingProfiles ? (
                    <div className="flex items-center justify-center h-12 bg-slate-50 rounded-md border">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    </div>
                  ) : (
                    <Select value={senderProfileId} onValueChange={handleProfileChange}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select a verified sender" />
                      </SelectTrigger>
                      <SelectContent>
                        {senderProfiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{profile.name}</span>
                              <span className="text-slate-400">&lt;{profile.email}&gt;</span>
                              {profile.isVerified ? (
                                <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-green-50 text-green-700 border-green-200">
                                  <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                  Verified
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-amber-50 text-amber-700 border-amber-200">
                                  <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                                  Unverified
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                
                {/* Show selected profile details */}
                {selectedProfile && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">From Name</Label>
                      <p className="text-sm font-medium text-slate-700 mt-1">{selectedProfile.name}</p>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">From Email</Label>
                      <p className="text-sm font-medium text-slate-700 mt-1">{selectedProfile.email}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Reply-To</Label>
                      <p className="text-sm font-medium text-slate-700 mt-1">{selectedProfile.replyTo || selectedProfile.email}</p>
                    </div>
                  </div>
                )}
                
                {senderProfiles.length === 0 && !loadingProfiles && (
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">No sender profiles found</span>
                    </div>
                    <p className="text-xs text-amber-600 mt-1">
                      Create a sender profile in Settings → Sender Profiles to continue.
                    </p>
                  </div>
                )}
              </div>
              
              {/* Subject Line */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="subject" className="text-sm font-semibold text-slate-700">
                    Subject Line <span className="text-red-500">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAiSuggestSubject}
                    disabled={aiSuggesting}
                    className="text-xs h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    {aiSuggesting ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Thinking...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 mr-1" />
                        AI Suggest
                      </>
                    )}
                  </Button>
                </div>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Quick question about..."
                  className="h-12 text-base"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    Keep it under 60 characters for best visibility
                  </p>
                  <span className={`text-xs ${subject.length > 60 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                    {subject.length}/60
                  </span>
                </div>
              </div>
              
              {/* Submit Button */}
              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={!isValid}
                  className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700"
                >
                  <Mail className="w-5 h-5 mr-2" />
                  Create Email Template
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
              
              {/* Cancel Link */}
              <div className="text-center">
                <Button 
                  type="button" 
                  variant="link" 
                  onClick={onCancel}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel and go back
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        
        {/* Help Text */}
        <p className="text-center text-xs text-slate-400 mt-6">
          This is step 1 of 3. You'll design the email content next.
        </p>
      </div>
    </div>
  );
}

export default CampaignIntentForm;
