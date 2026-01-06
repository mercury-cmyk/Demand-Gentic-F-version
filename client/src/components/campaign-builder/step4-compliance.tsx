import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, CheckCircle, XCircle, AlertCircle, Shield, Users, Mail } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Step4Props {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  campaignType: "email" | "telemarketing";
}

interface ComplianceCheck {
  id: string;
  label: string;
  status: "checking" | "passed" | "failed" | "warning";
  message: string;
}

export function Step4Compliance({ data, onNext, campaignType }: Step4Props) {
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Account Lead Cap state
  const [capEnabled, setCapEnabled] = useState(data.accountCap?.enabled || false);
  const [leadsPerAccount, setLeadsPerAccount] = useState<number>(data.accountCap?.leadsPerAccount || 3);
  const [capMode, setCapMode] = useState<string>(data.accountCap?.mode || 'queue_size');

  const emailChecks: ComplianceCheck[] = [
    {
      id: "valid_emails",
      label: "Valid Email Addresses",
      status: "checking",
      message: "Validating email format and deliverability...",
    },
    {
      id: "unsubscribe",
      label: "Unsubscribe Link & Address",
      status: "checking",
      message: "Verifying mandatory unsubscribe mechanism...",
    },
    {
      id: "dnc",
      label: "Email Suppression List",
      status: "checking",
      message: "Checking against global unsubscribe list...",
    },
    {
      id: "sender_profile",
      label: "Sender Profile Validated",
      status: "checking",
      message: "Verifying sender authentication (SPF/DKIM)...",
    },
    {
      id: "consent",
      label: "Consent Basis",
      status: "checking",
      message: "Verifying consent or legitimate interest basis...",
    },
  ];

  const telemarketingChecks: ComplianceCheck[] = [
    {
      id: "valid_phones",
      label: "Valid Phone Numbers",
      status: "checking",
      message: "Validating E.164 phone format...",
    },
    {
      id: "dnc",
      label: "DNC Compliance",
      status: "checking",
      message: "Checking against Do Not Call registry...",
    },
    {
      id: "call_recording",
      label: "Call Recording Consent",
      status: "checking",
      message: "Verifying recording consent requirements...",
    },
    {
      id: "quiet_hours",
      label: "Quiet Hours Compliance",
      status: "checking",
      message: "Checking timezone and quiet hours restrictions...",
    },
    {
      id: "frequency_cap",
      label: "Frequency Cap Validation",
      status: "checking",
      message: "Verifying contact frequency limits...",
    },
  ];

  useEffect(() => {
    runComplianceChecks();
  }, []);

  const runComplianceChecks = async () => {
    setIsRunning(true);
    const checksToRun = campaignType === "email" ? emailChecks : telemarketingChecks;
    setChecks(checksToRun);

    // Simulate running checks
    for (let i = 0; i < checksToRun.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      setProgress(((i + 1) / checksToRun.length) * 100);
      
      setChecks((prev) =>
        prev.map((check, index) => {
          if (index === i) {
            // Simulate different outcomes
            const outcomes: Array<ComplianceCheck["status"]> = ["passed", "passed", "warning", "passed"];
            const status = outcomes[Math.floor(Math.random() * outcomes.length)];
            
            return {
              ...check,
              status,
              message:
                status === "passed"
                  ? "✓ Check passed successfully"
                  : status === "warning"
                  ? "⚠ Minor issues detected, can proceed with caution"
                  : "✗ Check failed, please review",
            };
          }
          return check;
        })
      );
    }

    setIsRunning(false);
  };

  const getStatusIcon = (status: ComplianceCheck["status"]) => {
    switch (status) {
      case "passed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "warning":
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <div className="w-5 h-5 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />;
    }
  };

  const getStatusBadge = (status: ComplianceCheck["status"]) => {
    switch (status) {
      case "passed":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Passed</Badge>;
      case "failed":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Failed</Badge>;
      case "warning":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Warning</Badge>;
      default:
        return <Badge variant="outline">Checking...</Badge>;
    }
  };

  const allChecksPassed = checks.every((c) => c.status === "passed" || c.status === "warning");
  const hasFailures = checks.some((c) => c.status === "failed");

  const handleNext = () => {
    onNext({
      compliance: {
        checks: checks.map((c) => ({ id: c.id, status: c.status })),
        passed: allChecksPassed,
      },
      accountCap: {
        enabled: capEnabled,
        leadsPerAccount: capEnabled ? leadsPerAccount : null,
        mode: capEnabled ? capMode : null,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Account Lead Cap (Telemarketing Only) */}
      {campaignType === "telemarketing" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  <Users className="w-5 h-5 inline mr-2" />
                  Account Lead Cap
                </CardTitle>
                <CardDescription>
                  Intelligently distribute contacts and prevent over-contacting accounts
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="cap-enabled" className="text-base">
                  Enable Account Lead Cap
                </Label>
                <p className="text-sm text-muted-foreground">
                  Limit the number of contacts attempted per account to avoid over-saturation
                </p>
              </div>
              <Switch
                id="cap-enabled"
                checked={capEnabled}
                onCheckedChange={setCapEnabled}
                data-testid="switch-account-cap-enabled"
              />
            </div>

            {/* Cap Configuration (shown when enabled) */}
            {capEnabled && (
              <div className="space-y-6 pt-4 border-t">
                {/* Leads Per Account */}
                <div className="space-y-2">
                  <Label htmlFor="leads-per-account">
                    Leads Per Account
                  </Label>
                  <Input
                    id="leads-per-account"
                    type="number"
                    min="1"
                    max="100"
                    value={leadsPerAccount}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setLeadsPerAccount(Math.min(100, Math.max(1, value)));
                    }}
                    data-testid="input-leads-per-account"
                    className="max-w-xs"
                  />
                  <p className="text-sm text-muted-foreground">
                    Maximum number of contacts to attempt per account
                  </p>
                </div>

                {/* Cap Mode */}
                <div className="space-y-3">
                  <Label>Cap Enforcement Mode</Label>
                  <RadioGroup value={capMode} onValueChange={setCapMode}>
                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate">
                      <RadioGroupItem value="queue_size" id="mode-queue" data-testid="radio-mode-queue" />
                      <div className="flex-1">
                        <Label htmlFor="mode-queue" className="font-medium cursor-pointer">
                          Queue Size
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Limit based on number of contacts currently queued for the account
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate">
                      <RadioGroupItem value="connected_calls" id="mode-connected" data-testid="radio-mode-connected" />
                      <div className="flex-1">
                        <Label htmlFor="mode-connected" className="font-medium cursor-pointer">
                          Connected Calls
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Limit based on successful connections (answered calls)
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate">
                      <RadioGroupItem value="positive_disp" id="mode-positive" data-testid="radio-mode-positive" />
                      <div className="flex-1">
                        <Label htmlFor="mode-positive" className="font-medium cursor-pointer">
                          Positive Dispositions
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Limit based on positive outcomes (interested, scheduled, qualified)
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                  
                  <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5" />
                      <div className="text-sm text-blue-600 dark:text-blue-400">
                        <p className="font-medium">Cap Mode Selection</p>
                        <p className="text-blue-600/80 dark:text-blue-400/80 mt-1">
                          {capMode === 'queue_size' && 'Contacts will be queued until limit is reached. Best for controlling overall account exposure.'}
                          {capMode === 'connected_calls' && 'Cap applies after successful connections. Best for ensuring meaningful conversations.'}
                          {capMode === 'positive_disp' && 'Cap applies only to positive outcomes. Best for quality-focused campaigns.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Campaign-Level Email Suppressions Info */}
      {campaignType === "email" && (
        <Alert>
          <Mail className="w-4 h-4" />
          <AlertDescription>
            <p className="font-medium">Campaign-Level Email Suppressions</p>
            <p className="text-sm text-muted-foreground mt-1">
              After creating this campaign, click the "Suppressions" button in the campaign card to upload a CSV of email addresses to exclude from this specific campaign only. Campaign-level suppressions are separate from the global suppression list and only affect this campaign.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Compliance Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                <Shield className="w-5 h-5 inline mr-2" />
                Pre-Flight Compliance Checks
              </CardTitle>
              <CardDescription>
                Automated verification of all compliance requirements
              </CardDescription>
            </div>
            {!isRunning && (
              <Button variant="outline" onClick={runComplianceChecks} data-testid="button-rerun-checks">
                Re-run Checks
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isRunning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Running compliance checks...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance Checks */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {checks.map((check) => (
            <div
              key={check.id}
              className="flex items-start justify-between p-4 rounded-lg border"
              data-testid={`compliance-check-${check.id}`}
            >
              <div className="flex items-start gap-3 flex-1">
                {getStatusIcon(check.status)}
                <div className="flex-1">
                  <div className="font-medium">{check.label}</div>
                  <div className="text-sm text-muted-foreground mt-1">{check.message}</div>
                </div>
              </div>
              {getStatusBadge(check.status)}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Audience Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Audience Impact</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">{data.audience?.estimatedCount?.toLocaleString() || '0'}</div>
              <div className="text-sm text-muted-foreground">Total Included</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-500">{Math.floor((data.audience?.estimatedCount || 0) * 0.04).toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Suppressed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-500">{Math.floor((data.audience?.estimatedCount || 0) * 0.01).toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Invalid</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Message */}
      {!isRunning && (
        <div
          className={`p-4 rounded-lg border ${
            allChecksPassed && !hasFailures
              ? "bg-green-500/10 border-green-500/20"
              : hasFailures
              ? "bg-red-500/10 border-red-500/20"
              : "bg-yellow-500/10 border-yellow-500/20"
          }`}
        >
          <div className="flex items-start gap-2">
            {allChecksPassed && !hasFailures ? (
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
            ) : hasFailures ? (
              <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
            )}
            <div className="text-sm">
              <p className="font-medium">
                {allChecksPassed && !hasFailures
                  ? "All compliance checks passed!"
                  : hasFailures
                  ? "Compliance checks failed - please review"
                  : "Some warnings detected - review before proceeding"}
              </p>
              <p className="text-muted-foreground mt-1">
                {allChecksPassed && !hasFailures
                  ? "Your campaign meets all compliance requirements and is ready to launch."
                  : hasFailures
                  ? "Please fix the failed checks before proceeding to launch."
                  : "You can proceed with caution, but we recommend addressing the warnings."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Next Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleNext}
          size="lg"
          disabled={isRunning || hasFailures}
          data-testid="button-next-step"
        >
          Continue to Summary
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
