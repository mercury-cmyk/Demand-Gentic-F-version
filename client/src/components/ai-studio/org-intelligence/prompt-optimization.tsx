import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Check, AlertCircle } from "lucide-react";

interface PromptOptimizationData {
  orgIntelligence: {
    raw: string;
    parsed: string[];
  };
  compliancePolicy: {
    raw: string;
    parsed: string[];
  };
  platformPolicies: {
    raw: string;
    parsed: string[];
  };
  agentVoiceDefaults: {
    raw: string;
    parsed: string[];
  };
}

const DEFAULT_ORG_INTELLIGENCE = [
  "Organization intelligence is not configured.",
  "Define brand name, positioning, offerings, ICP, personas, approved claims, and tone.",
];

const DEFAULT_COMPLIANCE_POLICY = [
  "Respect business hours in the prospect's local timezone.",
  "Immediately honor opt-out and do-not-call requests.",
  "Do not harass, pressure, or repeatedly call uninterested prospects.",
  "Be polite, professional, and calm at all times.",
  "No deceptive behavior or misrepresentation.",
  "Do not misuse personal data.",
  "Escalate to a human when uncertain.",
];

const DEFAULT_PLATFORM_POLICIES = [
  "Operate only within allowed tool permissions.",
  "Do not expand tool permissions implicitly.",
  "Use escalation rules when risk is detected.",
];

const DEFAULT_AGENT_VOICE_DEFAULTS = [
  "Use conversational turn-taking: listen before responding.",
  "Navigate IVR quickly and politely.",
  "Handle gatekeepers with concise, respectful requests.",
  "Ask for transfers using role-based language.",
  "Decide when to leave voicemail versus retry.",
  "Escalate to a human when needed.",
];

const DEFAULTS_RAW = {
  orgIntelligence: DEFAULT_ORG_INTELLIGENCE.join("\n"),
  compliancePolicy: DEFAULT_COMPLIANCE_POLICY.join("\n"),
  platformPolicies: DEFAULT_PLATFORM_POLICIES.join("\n"),
  agentVoiceDefaults: DEFAULT_AGENT_VOICE_DEFAULTS.join("\n"),
};

export function PromptOptimizationView() {
  const [data, setData] = useState<PromptOptimizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [usingDefaults, setUsingDefaults] = useState(false);

  const [formData, setFormData] = useState({
    orgIntelligence: "",
    compliancePolicy: "",
    platformPolicies: "",
    agentVoiceDefaults: "",
  });

  // Fetch data on mount
  useEffect(() => {
    fetchPromptOptimization();
  }, []);

  const fetchPromptOptimization = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/org-intelligence/prompt-optimization");
      if (!response.ok) throw new Error("Failed to fetch prompt optimization data");
      const result = await response.json();
      const hasAnyValue = [
        result.orgIntelligence.raw,
        result.compliancePolicy.raw,
        result.platformPolicies.raw,
        result.agentVoiceDefaults.raw,
      ].some((value: string) => value && value.trim().length > 0);

      if (!hasAnyValue) {
        setUsingDefaults(true);
        setData({
          orgIntelligence: { raw: DEFAULTS_RAW.orgIntelligence, parsed: DEFAULT_ORG_INTELLIGENCE },
          compliancePolicy: { raw: DEFAULTS_RAW.compliancePolicy, parsed: DEFAULT_COMPLIANCE_POLICY },
          platformPolicies: { raw: DEFAULTS_RAW.platformPolicies, parsed: DEFAULT_PLATFORM_POLICIES },
          agentVoiceDefaults: { raw: DEFAULTS_RAW.agentVoiceDefaults, parsed: DEFAULT_AGENT_VOICE_DEFAULTS },
        });
        setFormData({ ...DEFAULTS_RAW });
      } else {
        setUsingDefaults(false);
        setData(result);
        setFormData({
          orgIntelligence: result.orgIntelligence.raw,
          compliancePolicy: result.compliancePolicy.raw,
          platformPolicies: result.platformPolicies.raw,
          agentVoiceDefaults: result.agentVoiceDefaults.raw,
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to load prompt optimization data");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      const response = await fetch("/api/org-intelligence/prompt-optimization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error("Failed to save prompt optimization data");
      setSaveSuccess(true);
      setEditing(false);
      await fetchPromptOptimization();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

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

  if (!data) return null;

  const PolicySection = ({
    title,
    description,
    items,
    formKey,
  }: {
    title: string;
    description: string;
    items: string[];
    formKey: keyof typeof formData;
  }) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <Textarea
            value={formData[formKey]}
            onChange={(e) =>
              setFormData({ ...formData, [formKey]: e.target.value })
            }
            placeholder={`Enter ${title.toLowerCase()} (one item per line)`}
            rows={8}
            className="font-mono text-sm"
          />
        ) : (
          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No data configured</p>
            ) : (
              items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-muted rounded text-sm">
                  <span className="text-muted-foreground min-w-fit pt-1">•</span>
                  <span>{item}</span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {saveSuccess && (
        <Alert className="border-green-200 bg-green-50">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Prompt optimization intelligence updated successfully
          </AlertDescription>
        </Alert>
      )}

      {usingDefaults && !saveSuccess && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Showing recommended defaults. Save changes to store them for your organization.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        {editing ? (
          <>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </>
        ) : (
          <>
            {usingDefaults && (
              <Button variant="secondary" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Defaults
              </Button>
            )}
            <Button onClick={() => setEditing(true)}>Edit</Button>
          </>
        )}
      </div>

      <Tabs defaultValue="org" className="space-y-4">
        <TabsList>
          <TabsTrigger value="org">Organization</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="platform">Platform</TabsTrigger>
          <TabsTrigger value="agent">Agent Defaults</TabsTrigger>
        </TabsList>

        <TabsContent value="org">
          <PolicySection
            title="Organization Intelligence"
            description="Brand identity, positioning, services, ICP, personas, and approved claims"
            items={data.orgIntelligence.parsed}
            formKey="orgIntelligence"
          />
        </TabsContent>

        <TabsContent value="compliance">
          <PolicySection
            title="Compliance Policy"
            description="Legal and ethical guidelines for AI agent behavior"
            items={data.compliancePolicy.parsed}
            formKey="compliancePolicy"
          />
        </TabsContent>

        <TabsContent value="platform">
          <PolicySection
            title="Platform Policies"
            description="System constraints and tool permissions"
            items={data.platformPolicies.parsed}
            formKey="platformPolicies"
          />
        </TabsContent>

        <TabsContent value="agent">
          <PolicySection
            title="Agent Voice Defaults"
            description="Default behavior for voice AI agents"
            items={data.agentVoiceDefaults.parsed}
            formKey="agentVoiceDefaults"
          />
        </TabsContent>
      </Tabs>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          These settings are injected into all AI agent prompts to ensure consistent behavior across your organization.
          Updates take effect on the next agent interaction.
        </AlertDescription>
      </Alert>
    </div>
  );
}
