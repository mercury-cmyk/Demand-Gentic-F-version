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

const statusLabels: Record<FieldStatus, string> = {
  suggested: "AI Suggested",
  edited: "Human Edited",
  verified: "Verified",
};

function formatConfidence(value?: number) {
  if (value === undefined || value === null) return null;
  const normalized = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return `${normalized}%`;
}

function FieldRow({ label, field }: { label: string; field?: IntelligenceField }) {
  const value = field?.value?.trim();
  const confidence = formatConfidence(field?.confidence);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {field?.status && (
          <Badge variant="secondary" className="text-[10px] h-5">
            {statusLabels[field.status]}
          </Badge>
        )}
      </div>
      <div className="rounded-md border bg-card p-3 text-sm">
        {value || <span className="text-muted-foreground">Not configured</span>}
      </div>
      {(field?.source || confidence) && (
        <div className="text-xs text-muted-foreground">
          {[field?.source ? `Source: ${field.source}` : null, confidence ? `Confidence: ${confidence}` : null]
            .filter(Boolean)
            .join(" | ")}
        </div>
      )}
    </div>
  );
}

interface ICPPositioningTabProps {
  organizationId?: string | null;
}

export function ICPPositioningTab({ organizationId }: ICPPositioningTabProps) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ICP & Positioning</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No organization profile found. Run the Organization Profile analysis to generate ICP and positioning data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Ideal Customer Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="Target industries" field={profile.icp?.industries} />
          <FieldRow label="Buyer personas" field={profile.icp?.personas} />
          <FieldRow label="Common objections" field={profile.icp?.objections} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Positioning</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="One-liner" field={profile.positioning?.oneLiner} />
          <FieldRow label="Competitors" field={profile.positioning?.competitors} />
          <FieldRow label="Why us" field={profile.positioning?.whyUs} />
        </CardContent>
      </Card>
    </div>
  );
}
