/**
 * Preflight Validator Service
 * Ensures all required variables exist before initiating ANY call
 * Blocks call and requests missing fields if validation fails
 */

import { z } from "zod";

const LOG_PREFIX = "[PreflightValidator]";

/**
 * Zod schema for preflight validation
 * Single source of truth for what's required before calling
 */
export const PreflightSchema = z.object({
  // Agent & Organization
  agent: z.object({
    name: z.string().min(1, "Agent name required"),
  }),
  org: z.object({
    name: z.string().min(1, "Organization name required"),
  }),

  // Contact Information (always required)
  contact: z.object({
    full_name: z.string().min(1, "Contact full name required"),
    first_name: z.string().min(1, "Contact first name required"),
    job_title: z.string().min(1, "Contact job title required"),
    email: z.string().email().optional(), // Required only if followUpEnabled
  }),

  // Account/Company Information
  account: z.object({
    name: z.string().min(1, "Account/company name required"),
  }),

  // System Information
  system: z.object({
    caller_id: z.string().min(1, "System caller ID required"),
    called_number: z.string().min(1, "System called number required"),
    time_utc: z.string().min(1, "System time UTC required"),
  }),

  // Campaign Context (optional but should be tracked)
  campaign: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),

  // Call Context (optional)
  callContext: z
    .object({
      followUpEnabled: z.boolean().optional(),
      suppressionEnabled: z.boolean().optional(),
    })
    .optional(),
});

export type PreflightData = z.infer;

export interface PreflightValidationResult {
  isValid: boolean;
  missingFields: string[];
  errors: Record;
  action?: PreflightAction;
}

export interface PreflightAction {
  type: "BLOCK_CALL" | "REQUEST_MISSING_FIELDS" | "PROCEED";
  missingVariables?: string[];
  message?: string;
}

/**
 * Validate all preflight requirements
 * Throws if critical fields are missing
 */
export function validatePreflight(data: Record): PreflightValidationResult {
  try {
    // Add contextual validation for followUp
    if (data.callContext?.followUpEnabled && !data.contact?.email) {
      const result = PreflightSchema.safeParse(data);

      if (!result.success) {
        const missingFields = extractMissingFields(result.error.errors);
        missingFields.push("contact.email (required for follow-up)");

        return {
          isValid: false,
          missingFields,
          errors: flattenErrors(result.error.errors),
          action: {
            type: "BLOCK_CALL",
            missingVariables: missingFields,
            message: "Cannot initiate call: missing required variables for follow-up enabled campaign",
          },
        };
      }
    }

    // Parse with base schema
    const result = PreflightSchema.safeParse(data);

    if (!result.success) {
      const missingFields = extractMissingFields(result.error.errors);

      return {
        isValid: false,
        missingFields,
        errors: flattenErrors(result.error.errors),
        action: {
          type: "BLOCK_CALL",
          missingVariables: missingFields,
          message: "Cannot initiate call: missing required preflight variables",
        },
      };
    }

    return {
      isValid: true,
      missingFields: [],
      errors: {},
      action: {
        type: "PROCEED",
      },
    };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Preflight validation threw error:`, error);

    return {
      isValid: false,
      missingFields: ["unknown"],
      errors: { error: error.message },
      action: {
        type: "BLOCK_CALL",
        message: "Preflight validation failed",
      },
    };
  }
}

/**
 * Get list of missing/invalid fields
 */
function extractMissingFields(errors: z.ZodError["errors"]): string[] {
  return errors.map((err) => {
    const path = err.path.join(".");
    if (err.code === "too_small" || err.code === "invalid_string") {
      return path;
    }
    return path || "unknown";
  });
}

/**
 * Flatten Zod error structure for easier logging
 */
function flattenErrors(errors: z.ZodError["errors"]): Record {
  return errors.reduce(
    (acc, err) => {
      const path = err.path.join(".");
      acc[path] = err.message;
      return acc;
    },
    {} as Record
  );
}

/**
 * Check if a single variable is valid (used for dynamic checks)
 */
export function validateVariable(variablePath: string, value: any): boolean {
  if (!value) {
    console.warn(`${LOG_PREFIX} Variable ${variablePath} is missing or empty`);
    return false;
  }

  // Special validation for email
  if (variablePath === "contact.email") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      console.warn(`${LOG_PREFIX} Variable ${variablePath} is not a valid email`);
      return false;
    }
  }

  return true;
}

/**
 * Get all required preflight variable names
 */
export function getRequiredVariables(followUpEnabled: boolean = false): string[] {
  const required = [
    "agent.name",
    "org.name",
    "contact.full_name",
    "contact.first_name",
    "contact.job_title",
    "account.name",
    "system.caller_id",
    "system.called_number",
    "system.time_utc",
  ];

  if (followUpEnabled) {
    required.push("contact.email");
  }

  return required;
}

/**
 * Generate error response for missing variables
 */
export function generatePreflightErrorResponse(validation: PreflightValidationResult): {
  statusCode: number;
  body: Record;
} {
  return {
    statusCode: 400,
    body: {
      error: validation.action?.message || "Preflight validation failed",
      code: "PREFLIGHT_VALIDATION_FAILED",
      action: "ASK_FOR_MISSING_VARIABLES_FORM",
      missingVariables: validation.missingFields,
      details: validation.errors,
      requiredFields: getRequiredVariables(),
      userMessage: `Missing required information: ${validation.missingFields.join(", ")}. Please provide these fields to initiate the call.`,
    },
  };
}

/**
 * For logging: create a human-readable preflight report
 */
export function generatePreflightReport(data: Record): string {
  const lines = [
    "=== PREFLIGHT VALIDATION REPORT ===",
    "",
    "Checking required variables:",
    `  ✓ Agent: ${data.agent?.name || "MISSING"}`,
    `  ✓ Organization: ${data.org?.name || "MISSING"}`,
    `  ✓ Contact Name: ${data.contact?.full_name || "MISSING"}`,
    `  ✓ Contact First Name: ${data.contact?.first_name || "MISSING"}`,
    `  ✓ Contact Job Title: ${data.contact?.job_title || "MISSING"}`,
    `  ✓ Account Name: ${data.account?.name || "MISSING"}`,
    `  ✓ Caller ID: ${data.system?.caller_id || "MISSING"}`,
    `  ✓ Called Number: ${data.system?.called_number || "MISSING"}`,
    `  ✓ Time UTC: ${data.system?.time_utc || "MISSING"}`,
    ...(data.callContext?.followUpEnabled ? [`  ✓ Contact Email: ${data.contact?.email || "MISSING"}`] : []),
    "",
  ];

  return lines.join("\n");
}