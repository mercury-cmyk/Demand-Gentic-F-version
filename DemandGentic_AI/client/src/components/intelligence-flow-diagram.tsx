import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2,
  AlertTriangle,
  Calendar,
  Brain,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ProductMatch =
  | {
      matched: true;
      eventId: string;
      eventTitle: string;
      community: string;
      eventType: string | null;
      startDateHuman: string | null;
      matchReason: string;
      matchConfidence: number;
      matchSource: string;
      ctaLink: string | null;
      learnBullets: string[] | null;
    }
  | {
      matched: false;
      reason: string;
    };

type ThreePillarContext = {
  orgIntelligence: {
    available: boolean;
    organizationName: string | null;
    description: string | null;
    offerings: any | null;
  };
  accountProblems: {
    available: boolean;
    problemHypothesis: string | null;
    recommendedAngle: string | null;
    confidence: number | null;
  };
  productMatch: ProductMatch;
};

interface IntelligenceFlowDiagramProps {
  accountId?: string | null;
  campaignId?: string | null;
  contactId?: string | null;
  variant?: "compact" | "full";
  className?: string;
}

function PillarCard({
  icon: Icon,
  title,
  status,
  children,
  color,
  compact,
}: {
  icon: React.ElementType;
  title: string;
  status: "active" | "inactive" | "loading";
  children: React.ReactNode;
  color: string;
  compact?: boolean;
}) {
  const colorMap: Record = {
    blue: {
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-800",
      icon: "text-blue-600 dark:text-blue-400",
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    },
    amber: {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-800",
      icon: "text-amber-600 dark:text-amber-400",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    },
    emerald: {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-800",
      icon: "text-emerald-600 dark:text-emerald-400",
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    },
    purple: {
      bg: "bg-purple-50 dark:bg-purple-950/30",
      border: "border-purple-200 dark:border-purple-800",
      icon: "text-purple-600 dark:text-purple-400",
      badge: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    },
  };

  const colors = colorMap[color] || colorMap.blue;

  return (
    
      
        
          
        
        
          {title}
        
        {status === "active" ? (
          
        ) : status === "loading" ? (
          
        ) : (
          
        )}
      
      {children}
    
  );
}

function InfoMode({ compact }: { compact?: boolean }) {
  return (
    
      
        
        How Our AI Engages Your Prospects
      
      
        Every conversation is powered by three layers of intelligence that combine to create highly
        relevant, context-aware engagement for each prospect.
      
      
        
          
            Your organization&apos;s mission, offerings, and value proposition
          
        

        

        
          
            AI-researched challenges facing each target account
          
        

        

        
          
            Dynamically matched pinpoint killar content for them only
          
        
      

      {!compact && (
        
          
            
            
              Killer Context = All 3 Pillars Active
            
            
              Per-Interaction
            
          
        
      )}
    
  );
}

export function IntelligenceFlowDiagram({
  accountId,
  campaignId,
  contactId,
  variant = "compact",
  className,
}: IntelligenceFlowDiagramProps) {
  const compact = variant === "compact";

  const { data, isLoading } = useQuery({
    queryKey: ["/api/product-intelligence/three-pillars", accountId, campaignId, contactId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (campaignId) params.set("campaignId", campaignId);
      if (contactId) params.set("contactId", contactId);
      const qs = params.toString();

      const url = accountId
        ? `/api/product-intelligence/three-pillars/${accountId}${qs ? `?${qs}` : ""}`
        : `/api/product-intelligence/three-pillars${qs ? `?${qs}` : ""}`;

      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });

  // No account selected - show informational mode
  if (!accountId && !isLoading) {
    return (
      
        
          
        
      
    );
  }

  if (isLoading) {
    return (
      
        
          
          Loading intelligence context...
        
      
    );
  }

  if (!data) {
    return null;
  }

  const { orgIntelligence, accountProblems, productMatch } = data;

  const activePillars = [
    orgIntelligence.available,
    accountProblems.available,
    productMatch.matched,
  ].filter(Boolean).length;

  const confidenceLabel =
    activePillars === 3 ? "Killer Context" : activePillars === 2 ? "Strong Context" : activePillars === 1 ? "Basic Context" : "No Context";

  const confidenceColor =
    activePillars === 3 ? "success" : activePillars === 2 ? "warning" : activePillars === 1 ? "secondary" : "destructive";

  return (
    
      
        
          
            
            3-Pillar Intelligence
          
          
            {activePillars}/3 {confidenceLabel}
          
        

        
          {/* Pillar 1: Org Intelligence */}
          
            {orgIntelligence.available ? (
              
                {orgIntelligence.organizationName}
                {!compact && orgIntelligence.description && (
                  
                    {orgIntelligence.description}
                  
                )}
              
            ) : (
              Not configured
            )}
          

          

          {/* Pillar 2: Account Problems */}
          
            {accountProblems.available ? (
              
                {accountProblems.problemHypothesis}
                {!compact && accountProblems.confidence != null && (
                  
                    Confidence: {Math.round(accountProblems.confidence * 100)}%
                  
                )}
              
            ) : (
              No intel yet
            )}
          

          

          {/* Pillar 3: Product Match */}
          
            {productMatch.matched ? (
              
                {productMatch.eventTitle}
                {!compact && (
                  <>
                    {productMatch.startDateHuman && (
                      
                        {productMatch.startDateHuman}
                      
                    )}
                    
                      Match: {productMatch.matchReason}
                    
                    {productMatch.matchConfidence != null && (
                      
                        {Math.round(productMatch.matchConfidence * 100)}% confidence
                      
                    )}
                  
                )}
              
            ) : (
              
                {productMatch.reason || "No event match"}
              
            )}
          
        

        {/* Killer Context Summary - full variant only */}
        {!compact && activePillars >= 2 && (
          
            
              
              
                
                  {activePillars === 3
                    ? "All 3 pillars active — maximum context for every interaction"
                    : "2 of 3 pillars active — strong context, product match will enhance further"}
                
                
                  AI agents dynamically combine these signals for each call, email, and touchpoint.
                
              
            
          
        )}
      
    
  );
}

export default IntelligenceFlowDiagram;