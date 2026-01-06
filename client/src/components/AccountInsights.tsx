import { useState } from 'react';
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  TrendingUp,
  Users,
  Target,
  Lightbulb,
  Building2,
  Globe,
  AlertCircle
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AccountBrief {
  accountId: string;
  mainProducts?: Array<{ name: string; desc: string }>;
  targetMarkets?: Array<{ segment: string; geo: string }>;
  buyerTitles?: string[];
  industries?: string[];
  painHypotheses?: Array<{ pain: string; proof: string }>;
  tailoredAngles?: {
    openingHook?: string;
    tailoredOffer?: string;
    caseStudy?: string;
  };
  confidence: number;
  generatedAt?: string;
}

interface AccountInsightsProps {
  accountId: string;
  accountName: string;
}

export function AccountInsights({ accountId, accountName }: AccountInsightsProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: brief, isLoading, error } = useQuery<AccountBrief>({
    queryKey: [`/api/accounts/${accountId}/brief`],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${accountId}/brief`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch brief');
      }
      return response.json();
    },
    retry: false,
  });

  const generateBriefMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/accounts/${accountId}/brief`, {});
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/brief`] });
      toast({
        title: "Account Brief Generated",
        description: `Strategic insights for ${accountName} have been generated with ${data.confidence}% confidence.`,
      });
      setIsGenerating(false);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: "Unable to generate account brief. Please try again.",
      });
      setIsGenerating(false);
    },
  });

  const handleGenerate = () => {
    setIsGenerating(true);
    generateBriefMutation.mutate();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Account Insights</CardTitle>
            </div>
          </div>
          <CardDescription>AI-powered strategic analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !brief) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Account Insights</CardTitle>
            </div>
            <Button 
              size="sm" 
              onClick={handleGenerate}
              disabled={isGenerating}
              data-testid="button-generate-brief"
            >
              {isGenerating ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Insights
                </>
              )}
            </Button>
          </div>
          <CardDescription>AI-powered strategic analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No account brief available. Click "Generate Insights" to create AI-powered strategic analysis for {accountName}.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const confidenceColor = brief.confidence >= 80 ? 'text-green-600 dark:text-green-400' : 
                          brief.confidence >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 
                          'text-orange-600 dark:text-orange-400';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>Account Insights</CardTitle>
            <Badge variant="secondary" className={confidenceColor}>
              {brief.confidence}% confidence
            </Badge>
          </div>
          <Button 
            size="sm" 
            variant="outline"
            onClick={handleGenerate}
            disabled={isGenerating}
            data-testid="button-regenerate-brief"
          >
            {isGenerating ? (
              <>
                <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                Regenerating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Regenerate
              </>
            )}
          </Button>
        </div>
        <CardDescription>
          AI-powered strategic analysis
          {brief.generatedAt && (
            <span className="ml-2 text-xs">
              • Generated {new Date(brief.generatedAt).toLocaleDateString()}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Products/Services */}
        {brief.mainProducts && brief.mainProducts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Main Products & Services</h3>
            </div>
            <div className="space-y-2">
              {brief.mainProducts.map((product, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-muted/50 border">
                  <p className="font-medium text-sm">{product.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">{product.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Target Markets */}
        {brief.targetMarkets && brief.targetMarkets.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Target Markets</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {brief.targetMarkets.map((market, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-muted/50 border">
                  <p className="font-medium text-sm">{market.segment}</p>
                  <p className="text-xs text-muted-foreground mt-1">{market.geo}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buyer Personas */}
        {brief.buyerTitles && brief.buyerTitles.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Key Buyer Personas</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {brief.buyerTitles.map((title, idx) => (
                <Badge key={idx} variant="secondary">
                  {title}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Industries Served */}
        {brief.industries && brief.industries.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Industries Served</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {brief.industries.map((industry, idx) => (
                <Badge key={idx} variant="outline">
                  {industry}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Pain Hypotheses */}
        {brief.painHypotheses && brief.painHypotheses.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Key Pain Points</h3>
            </div>
            <div className="space-y-2">
              {brief.painHypotheses.map((hypothesis, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-muted/50 border">
                  <p className="font-medium text-sm">{hypothesis.pain}</p>
                  <p className="text-xs text-muted-foreground mt-1">{hypothesis.proof}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tailored Outreach Angles */}
        {brief.tailoredAngles && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Tailored Outreach Angles</h3>
            </div>
            <div className="space-y-3">
              {brief.tailoredAngles.openingHook && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Opening Hook</p>
                  <p className="text-sm">{brief.tailoredAngles.openingHook}</p>
                </div>
              )}
              {brief.tailoredAngles.tailoredOffer && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Tailored Offer</p>
                  <p className="text-sm">{brief.tailoredAngles.tailoredOffer}</p>
                </div>
              )}
              {brief.tailoredAngles.caseStudy && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Relevant Case Study</p>
                  <p className="text-sm">{brief.tailoredAngles.caseStudy}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
