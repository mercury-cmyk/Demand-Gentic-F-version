import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/queryClient";

type FieldStatus = "suggested" | "edited" | "verified";

interface IntelligenceField {
  value?: string;
  source?: string;
  confidence?: number;
  status?: FieldStatus;
  locked?: boolean;
}

interface AccountProfile {
  icp: {
    industries?: IntelligenceField;
    personas?: IntelligenceField;
    objections?: IntelligenceField;
  };
  positioning: {
    oneLiner?: IntelligenceField;
    competitors?: IntelligenceField;
    whyUs?: IntelligenceField;
  };
}

const statusLabels: Record = {
  suggested: "AI Suggested",
  edited: "Human Edited",
  verified: "Verified",
};

function formatConfidence(value?: number) {
  if (value === undefined || value === null) return null;
  const normalized = value 
      
        {label}
        {field?.status && (
          
            {statusLabels[field.status]}
          
        )}
      
      
        {value || Not configured}
      
      {(field?.source || confidence) && (
        
          {[field?.source ? `Source: ${field.source}` : null, confidence ? `Confidence: ${confidence}` : null]
            .filter(Boolean)
            .join(" | ")}
        
      )}
    
  );
}

interface ICPPositioningTabProps {
  organizationId?: string | null;
}

export function ICPPositioningTab({ organizationId }: ICPPositioningTabProps) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Skip loading if no organizationId provided
    if (!organizationId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        const url = `/api/org-intelligence/profile?organizationId=${organizationId}`;
        const response = await fetch(url, { headers: getAuthHeaders(url) });
        if (!response.ok) throw new Error("Failed to load organization profile");
        const result = await response.json();
        setProfile(result.profile ?? null);
      } catch (err: any) {
        setError(err.message || "Failed to load organization profile");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [organizationId]);

  if (loading) {
    return (
      
        
          
        
      
    );
  }

  if (error) {
    return (
      
        
        {error}
      
    );
  }

  if (!profile) {
    return (
      
        
          ICP & Positioning
        
        
          
            No organization profile found. Run the Organization Profile analysis to generate ICP and positioning data.
          
        
      
    );
  }

  return (
    
      
        
          Ideal Customer Profile
        
        
          
          
          
        
      

      
        
          Positioning
        
        
          
          
          
        
      
    
  );
}