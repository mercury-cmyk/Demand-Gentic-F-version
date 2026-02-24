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
  { key: "contact.email", requiredForCall: false, validator: "email" },  // Optional - many contacts don't have email
  { key: "system.caller_id", requiredForCall: true, validator: "phone" },
  { key: "system.called_number", requiredForCall: true, validator: "phone" },
  { key: "system.time_utc", requiredForCall: true, validator: "utc_timestamp" },
];

export const CANONICAL_VOICE_VARIABLE_KEYS = VOICE_VARIABLE_CONTRACT.map((item) => item.key);

const VOICE_TEMPLATE_TOKEN_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;
const VOICE_TEMPLATE_TOKEN_ALIASES: Record<string, string> = {
  "agent.full_name": "agent.name",
  "agent.fullname": "agent.name",
  "agentfullname": "agent.name",
  "agent_full_name": "agent.name",
  "agent.name": "agent.name",
  "agentname": "agent.name",
  "agent_name": "agent.name",
  "org.name": "org.name",
  "orgname": "org.name",
  "org_name": "org.name",
  "account.name": "account.name",
  "accountname": "account.name",
  "account_name": "account.name",
  "companyname": "account.name",
  "company_name": "account.name",
  "contact.full_name": "contact.full_name",
  "contact.fullname": "contact.full_name",
  "contactfullname": "contact.full_name",
  "contact_full_name": "contact.full_name",
  "contact_fullname": "contact.full_name",
  "fullname": "contact.full_name",
  "full_name": "contact.full_name",
  "contact.first_name": "contact.first_name",
  "contact.firstname": "contact.first_name",
  "contactfirstname": "contact.first_name",
  "contact_first_name": "contact.first_name",
  "contact_firstname": "contact.first_name",
  "firstname": "contact.first_name",
  "first_name": "contact.first_name",
  "contact.last_name": "contact.last_name",
  "contact.lastname": "contact.last_name",
  "contactlastname": "contact.last_name",
  "contact_last_name": "contact.last_name",
  "contact_lastname": "contact.last_name",
  "lastname": "contact.last_name",
  "last_name": "contact.last_name",
  "contact.job_title": "contact.job_title",
  "contact.jobtitle": "contact.job_title",
  "contactjobtitle": "contact.job_title",
  "contact_job_title": "contact.job_title",
  "contact_jobtitle": "contact.job_title",
  "jobtitle": "contact.job_title",
  "job_title": "contact.job_title",
  "contact.email": "contact.email",
  "contactemail": "contact.email",
  "contact_email": "contact.email",
  "email": "contact.email",
  "system.time_utc": "system.time_utc",
  "system.timeutc": "system.time_utc",
  "system_time_utc": "system.time_utc",
  "system__time_utc": "system.time_utc",
  "system.time": "system.time_utc",
  "time_utc": "system.time_utc",
  "timeutc": "system.time_utc",
  "system.caller_id": "system.caller_id",
  "system.callerid": "system.caller_id",
  "system_caller_id": "system.caller_id",
  "system__caller_id": "system.caller_id",
  "caller_id": "system.caller_id",
  "system.called_number": "system.called_number",
  "system.callednumber": "system.called_number",
  "system_called_number": "system.called_number",
  "system__called_number": "system.called_number",
  "called_number": "system.called_number",
};

// Bracket-style aliases: [Name] → contact.full_name, [Your Name] → agent.name, etc.
// These map informal bracket tokens commonly used in campaign scripts
const BRACKET_TOKEN_ALIASES: Record<string, string> = {
  "name": "contact.full_name",
  "first name": "contact.first_name",
  "firstname": "contact.first_name",
  "last name": "contact.last_name",
  "lastname": "contact.last_name",
  "full name": "contact.full_name",
  "fullname": "contact.full_name",
  "contact name": "contact.full_name",
  "prospect name": "contact.full_name",
  "lead name": "contact.full_name",
  "your name": "agent.name",
  "agent name": "agent.name",
  "rep name": "agent.name",
  "caller name": "agent.name",
  "company": "account.name",
  "company name": "account.name",
  "companyname": "account.name",
  "organization": "org.name",
  "organization name": "org.name",
  "org": "org.name",
  "org name": "org.name",
  "title": "contact.job_title",
  "job title": "contact.job_title",
  "jobtitle": "contact.job_title",
  "email": "contact.email",
};

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

export function normalizeVoiceTemplateToken(token: string): string {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return "";
  const alias = VOICE_TEMPLATE_TOKEN_ALIASES[normalized];
  if (alias) return alias;
  const dotted = normalized.replace(/__+/g, ".");
  if (dotted !== normalized) {
    return VOICE_TEMPLATE_TOKEN_ALIASES[dotted] ?? dotted;
  }
  return normalized;
}

export function findDisallowedVoiceVariables(template: string): string[] {
  const variables = extractTemplateVariables(template).map(normalizeVoiceTemplateToken);
  const allowed = new Set(CANONICAL_VOICE_VARIABLE_KEYS);
  return variables.filter((variable) => variable && !allowed.has(variable));
}

export function interpolateVoiceTemplate(template: string, values: Record<string, string>): string {
  if (!template || !template.includes("{{")) return template;
  return template.replace(VOICE_TEMPLATE_TOKEN_PATTERN, (match, raw) => {
    const normalized = normalizeVoiceTemplateToken(raw);
    if (!normalized) return match;
    const value = values[normalized];
    if (!value || !value.trim()) return match;
    return value;
  });
}

/**
 * Interpolate bracket-style tokens: [Name], [Your Name], [Company], etc.
 * These are common in campaign scripts written by non-technical users.
 */
export function interpolateBracketTokens(template: string, values: Record<string, string>): string {
  if (!template) return template;
  // Match [Token] style — but NOT [[double brackets]] or [links](url)
  return template.replace(/(?<!\[)\[([^\[\]]+?)\](?!\()/g, (match, raw) => {
    const normalized = raw.trim().toLowerCase();
    const canonical = BRACKET_TOKEN_ALIASES[normalized];
    if (!canonical) return match; // Not a known token, leave as-is
    const value = values[canonical];
    if (!value || !value.trim()) return match; // No value available
    return value;
  });
}

/**
 * Check if a template contains bracket-style tokens like [Name], [Your Name]
 */
export function hasBracketTokens(template: string): boolean {
  if (!template) return false;
  const bracketMatches = template.match(/(?<!\[)\[([^\[\]]+?)\](?!\()/g) || [];
  return bracketMatches.some(m => {
    const inner = m.slice(1, -1).trim().toLowerCase();
    return inner in BRACKET_TOKEN_ALIASES;
  });
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
