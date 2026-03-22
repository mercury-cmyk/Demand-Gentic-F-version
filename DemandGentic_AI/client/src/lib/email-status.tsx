import { CheckCircle2, XCircle, HelpCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// TypeScript type for the 4-status email validation system
export type EmailStatus = 'valid' | 'acceptable' | 'invalid' | 'unknown';

// Map legacy 10-status values to new 4-status system (defensive programming)
export function normalizeLegacyEmailStatus(status: string | null | undefined): EmailStatus {
  if (!status) return 'unknown';
  
  // Already using new 4-status system
  if (['valid', 'acceptable', 'invalid', 'unknown'].includes(status)) {
    return status as EmailStatus;
  }
  
  // Map legacy statuses to new 4-status system
  const legacyMapping: Record = {
    'safe_to_send': 'valid',
    'risky': 'acceptable',
    'send_with_caution': 'acceptable',
    'accept_all': 'acceptable',
    'disabled': 'invalid',
    'disposable': 'invalid',
    'spam_trap': 'invalid',
    'syntax_error': 'invalid', // Additional legacy status from validation errors
  };
  
  return legacyMapping[status] || 'unknown';
}

// Email status display configuration - 4-status system
export const EMAIL_STATUS_CONFIG = {
  // High quality - verified deliverable
  valid: { 
    label: "Valid", 
    variant: "default" as const, 
    icon: CheckCircle2, 
    color: "text-green-600",
    description: "Verified deliverable, high quality"
  },
  
  // Medium risk - acceptable but proceed with caution
  acceptable: { 
    label: "Acceptable", 
    variant: "secondary" as const, 
    icon: AlertTriangle, 
    color: "text-yellow-600",
    description: "May deliver but has risk factors (catch-all, role account, or risky patterns)"
  },
  
  // Cannot verify
  unknown: { 
    label: "Unknown", 
    variant: "outline" as const, 
    icon: HelpCircle, 
    color: "text-muted-foreground",
    description: "Cannot verify (SMTP blocked, timeout, or insufficient data)"
  },
  
  // Invalid - do not send
  invalid: { 
    label: "Invalid", 
    variant: "destructive" as const, 
    icon: XCircle, 
    color: "text-red-600",
    description: "Not deliverable (syntax error, no MX, disposable, disabled, or spam trap)"
  },
} as const;

// Helper to render email status badge with icon (handles legacy statuses)
export function renderEmailStatusBadge(status: string | null | undefined, size: 'sm' | 'md' = 'md') {
  // Normalize legacy status to new 4-status system
  const normalizedStatus = normalizeLegacyEmailStatus(status);
  const config = EMAIL_STATUS_CONFIG[normalizedStatus];
  const Icon = config.icon;
  
  return (
    
      
      {config.label}
    
  );
}