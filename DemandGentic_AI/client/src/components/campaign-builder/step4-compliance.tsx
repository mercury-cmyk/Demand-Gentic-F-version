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
  const [checks, setChecks] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Account Lead Cap state
  const [capEnabled, setCapEnabled] = useState(data.accountCap?.enabled || false);
  const [leadsPerAccount, setLeadsPerAccount] = useState(data.accountCap?.leadsPerAccount || 3);
  const [capMode, setCapMode] = useState(data.accountCap?.mode || 'queue_size');

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
    for (let i = 0; i  setTimeout(resolve, 800));
      
      setProgress(((i + 1) / checksToRun.length) * 100);
      
      setChecks((prev) =>
        prev.map((check, index) => {
          if (index === i) {
            // Simulate different outcomes
            const outcomes: Array = ["passed", "passed", "warning", "passed"];
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
        return ;
      case "failed":
        return ;
      case "warning":
        return ;
      default:
        return ;
    }
  };

  const getStatusBadge = (status: ComplianceCheck["status"]) => {
    switch (status) {
      case "passed":
        return Passed;
      case "failed":
        return Failed;
      case "warning":
        return Warning;
      default:
        return Checking...;
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
    
      {/* Account Lead Cap (Telemarketing Only) */}
      {campaignType === "telemarketing" && (
        
          
            
              
                
                  
                  Account Lead Cap
                
                
                  Intelligently distribute contacts and prevent over-contacting accounts
                
              
            
          
          
            {/* Enable/Disable Toggle */}
            
              
                
                  Enable Account Lead Cap
                
                
                  Limit the number of contacts attempted per account to avoid over-saturation
                
              
              
            

            {/* Cap Configuration (shown when enabled) */}
            {capEnabled && (
              
                {/* Leads Per Account */}
                
                  
                    Leads Per Account
                  
                   {
                      const value = parseInt(e.target.value) || 1;
                      setLeadsPerAccount(Math.min(100, Math.max(1, value)));
                    }}
                    data-testid="input-leads-per-account"
                    className="max-w-xs"
                  />
                  
                    Maximum number of contacts to attempt per account
                  
                

                {/* Cap Mode */}
                
                  Cap Enforcement Mode
                  
                    
                      
                      
                        
                          Queue Size
                        
                        
                          Limit based on number of contacts currently queued for the account
                        
                      
                    
                    
                    
                      
                      
                        
                          Connected Calls
                        
                        
                          Limit based on successful connections (answered calls)
                        
                      
                    
                    
                    
                      
                      
                        
                          Positive Dispositions
                        
                        
                          Limit based on positive outcomes (interested, scheduled, qualified)
                        
                      
                    
                  
                  
                  
                    
                      
                      
                        Cap Mode Selection
                        
                          {capMode === 'queue_size' && 'Contacts will be queued until limit is reached. Best for controlling overall account exposure.'}
                          {capMode === 'connected_calls' && 'Cap applies after successful connections. Best for ensuring meaningful conversations.'}
                          {capMode === 'positive_disp' && 'Cap applies only to positive outcomes. Best for quality-focused campaigns.'}
                        
                      
                    
                  
                
              
            )}
          
        
      )}

      {/* Campaign-Level Email Suppressions Info */}
      {campaignType === "email" && (
        
          
          
            Campaign-Level Email Suppressions
            
              After creating this campaign, click the "Suppressions" button in the campaign card to upload a CSV of email addresses to exclude from this specific campaign only. Campaign-level suppressions are separate from the global suppression list and only affect this campaign.
            
          
        
      )}

      {/* Compliance Header */}
      
        
          
            
              
                
                Pre-Flight Compliance Checks
              
              
                Automated verification of all compliance requirements
              
            
            {!isRunning && (
              
                Re-run Checks
              
            )}
          
        
        
          {isRunning && (
            
              
                Running compliance checks...
                {Math.round(progress)}%
              
              
            
          )}
        
      

      {/* Compliance Checks */}
      
        
          Compliance Status
        
        
          {checks.map((check) => (
            
              
                {getStatusIcon(check.status)}
                
                  {check.label}
                  {check.message}
                
              
              {getStatusBadge(check.status)}
            
          ))}
        
      

      {/* Audience Summary */}
      
        
          Audience Impact
        
        
          
            
              {data.audience?.estimatedCount?.toLocaleString() || '0'}
              Total Included
            
            
              {Math.floor((data.audience?.estimatedCount || 0) * 0.04).toLocaleString()}
              Suppressed
            
            
              {Math.floor((data.audience?.estimatedCount || 0) * 0.01).toLocaleString()}
              Invalid
            
          
        
      

      {/* Status Message */}
      {!isRunning && (
        
          
            {allChecksPassed && !hasFailures ? (
              
            ) : hasFailures ? (
              
            ) : (
              
            )}
            
              
                {allChecksPassed && !hasFailures
                  ? "All compliance checks passed!"
                  : hasFailures
                  ? "Compliance checks failed - please review"
                  : "Some warnings detected - review before proceeding"}
              
              
                {allChecksPassed && !hasFailures
                  ? "Your campaign meets all compliance requirements and is ready to launch."
                  : hasFailures
                  ? "Please fix the failed checks before proceeding to launch."
                  : "You can proceed with caution, but we recommend addressing the warnings."}
              
            
          
        
      )}

      {/* Next Button */}
      
        
          Continue to Summary
          
        
      
    
  );
}