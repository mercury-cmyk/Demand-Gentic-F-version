import { db } from "../db";
import { accounts, contacts, dialerCallAttempts, virtualAgents } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getOrganizationBrain } from "./agent-brain-service";

export const VOICE_VARIABLE_CONTRACT_VERSION = "2026-01-06";

type ValidatorType = "nonempty" | "email" | "phone" | "utc_timestamp";

type ContractItem = {
  key: string;
  requiredForCall: boolean;
  validator: ValidatorType;
};

const VOICE_VARIABLE_CONTRACT: ContractItem[] = [
  { key: "agent.name", requiredForCall: true, validator: "nonempty" },
  { key: "org.name", requiredForCall: true, validator: "nonempty" },
  { key: "account.name", requiredForCall: true, validator: "nonempty" },
  { key: "contact.full_name", requiredForCall: true, validator: "nonempty" },
  { key: "contact.first_name", requiredForCall: true, validator: "nonempty" },
  { key: "contact.job_title", requiredForCall: true, validator: "nonempty" },
  { key: "contact.email", requiredForCall: true, validator: "email" },
  { key: "system.caller_id", requiredForCall: true, validator: "phone" },
  { key: "system.called_number", requiredForCall: true, validator: "phone" },
  { key: "system.time_utc", requiredForCall: true, validator: "utc_timestamp" },
];

export const CANONICAL_VOICE_VARIABLE_KEYS = VOICE_VARIABLE_CONTRACT.map((item) => item.key);

const PLACEHOLDER_VALUES = new Set([
  "",
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "tbd",
  "?",
  "our company",
  "your company",
  "your representative",
  "decision maker",
  "there",
]);

export interface VoiceVariableResolveInput {
  contactId?: string;
  virtualAgentId?: string;
  callAttemptId?: string;
  callerId?: string | null;
  calledNumber?: string | null;
  orgName?: string | null;
  agentName?: string | null;
  timeUtc?: string;
  contact?: {
    fullName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    jobTitle?: string | null;
    email?: string | null;
    accountId?: string | null;
  };
  account?: {
    name?: string | null;
  };
}

export interface VoiceVariablePreflightResult {
  valid: boolean;
  missingKeys: string[];
  invalidKeys: string[];
  errors: string[];
  values: Record<string, string>;
  contractVersion: string;
}

export class VoiceVariablePreflightError extends Error {
  readonly result: VoiceVariablePreflightResult;

  constructor(result: VoiceVariablePreflightResult) {
    super("Voice variable contract preflight failed");
    this.name = "VoiceVariablePreflightError";
    this.result = result;
  }
}

export function isVoiceVariablePreflightError(
  error: unknown
): error is VoiceVariablePreflightError {
  return error instanceof VoiceVariablePreflightError;
}

export function extractTemplateVariables(template: string): string[] {
  const matches = template.match(/\{\{\s*([^}]+?)\s*\}\}/g) || [];
  const variables = matches.map((match) => match.replace(/\{\{|\}\}/g, "").trim());
  return Array.from(new Set(variables));
}

export function findDisallowedVoiceVariables(template: string): string[] {
  const variables = extractTemplateVariables(template);
  const allowed = new Set(CANONICAL_VOICE_VARIABLE_KEYS);
  return variables.filter((variable) => !allowed.has(variable));
}

function normalizeValue(value: string | null | undefined): string {
  return (value ?? "").toString().trim();
}

function isPlaceholder(value: string | null | undefined): boolean {
  const normalized = normalizeValue(value).toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized);
}

function isValidEmail(value: string): boolean {
  if (isPlaceholder(value)) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function isValidPhone(value: string): boolean {
  if (isPlaceholder(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10;
}

function isValidUtcTimestamp(value: string): boolean {
  if (isPlaceholder(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function validateValue(validator: ValidatorType, value: string): string | null {
  switch (validator) {
    case "nonempty":
      return value && !isPlaceholder(value) ? null : "Value is missing or placeholder";
    case "email":
      return isValidEmail(value) ? null : "Invalid email format";
    case "phone":
      return isValidPhone(value) ? null : "Invalid phone format";
    case "utc_timestamp":
      return isValidUtcTimestamp(value) ? null : "Invalid UTC timestamp";
    default:
      return "Unknown validator";
  }
}

async function resolveContact(contactId?: string, fallback?: VoiceVariableResolveInput["contact"]) {
  if (fallback) return fallback;
  if (!contactId) return null;

  const [contact] = await db
    .select({
      fullName: contacts.fullName,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      jobTitle: contacts.jobTitle,
      email: contacts.email,
      accountId: contacts.accountId,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  return contact || null;
}

async function resolveAccount(
  accountId?: string | null,
  fallback?: VoiceVariableResolveInput["account"]
) {
  if (fallback) return fallback;
  if (!accountId) return null;

  const [account] = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  return account || null;
}

async function resolveAgentName(
  virtualAgentId?: string,
  override?: string | null
): Promise<string> {
  if (override) return override;
  if (!virtualAgentId) return "";

  const [agent] = await db
    .select({ name: virtualAgents.name })
    .from(virtualAgents)
    .where(eq(virtualAgents.id, virtualAgentId))
    .limit(1);

  return agent?.name || "";
}

async function resolveOrgName(override?: string | null): Promise<string> {
  if (override) return override;
  const orgBrain = await getOrganizationBrain();
  return orgBrain?.identity?.companyName || "";
}

async function resolveCalledNumber(
  callAttemptId?: string,
  override?: string | null
): Promise<string> {
  if (override) return override;
  if (!callAttemptId) return "";

  const [attempt] = await db
    .select({ phoneDialed: dialerCallAttempts.phoneDialed })
    .from(dialerCallAttempts)
    .where(eq(dialerCallAttempts.id, callAttemptId))
    .limit(1);

  return attempt?.phoneDialed || "";
}

function resolveFullName(contact: VoiceVariableResolveInput["contact"] | null): string {
  if (!contact) return "";
  const fullName = normalizeValue(contact.fullName);
  if (fullName) return fullName;

  const parts = [normalizeValue(contact.firstName), normalizeValue(contact.lastName)].filter(Boolean);
  return parts.join(" ").trim();
}

export async function preflightVoiceVariableContract(
  input: VoiceVariableResolveInput
): Promise<VoiceVariablePreflightResult> {
  const contact = await resolveContact(input.contactId, input.contact);
  const account = await resolveAccount(contact?.accountId ?? input.contact?.accountId, input.account);

  const agentName = await resolveAgentName(input.virtualAgentId, input.agentName);
  const orgName = await resolveOrgName(input.orgName);
  const calledNumber = await resolveCalledNumber(input.callAttemptId, input.calledNumber);
  const callerId =
    normalizeValue(input.callerId) || normalizeValue(process.env.TELNYX_FROM_NUMBER);
  const timeUtc = normalizeValue(input.timeUtc) || new Date().toISOString();

  const values: Record<string, string> = {
    "agent.name": normalizeValue(agentName),
    "org.name": normalizeValue(orgName),
    "account.name": normalizeValue(account?.name),
    "contact.full_name": normalizeValue(resolveFullName(contact)),
    "contact.first_name": normalizeValue(contact?.firstName),
    "contact.job_title": normalizeValue(contact?.jobTitle),
    "contact.email": normalizeValue(contact?.email),
    "system.caller_id": normalizeValue(callerId),
    "system.called_number": normalizeValue(calledNumber),
    "system.time_utc": timeUtc,
  };

  const missingKeys: string[] = [];
  const invalidKeys: string[] = [];
  const errors: string[] = [];

  for (const contractItem of VOICE_VARIABLE_CONTRACT) {
    const value = values[contractItem.key];
    const missing = !value || isPlaceholder(value);
    if (contractItem.requiredForCall && missing) {
      missingKeys.push(contractItem.key);
      errors.push(`${contractItem.key} is missing`);
      continue;
    }

    const validationError = validateValue(contractItem.validator, value);
    if (validationError) {
      invalidKeys.push(contractItem.key);
      errors.push(`${contractItem.key}: ${validationError}`);
    }
  }

  return {
    valid: missingKeys.length === 0 && invalidKeys.length === 0,
    missingKeys,
    invalidKeys,
    errors,
    values,
    contractVersion: VOICE_VARIABLE_CONTRACT_VERSION,
  };
}
