export interface CampaignEmailRoutingMetadata {
  senderProfileId?: string | null;
  senderName?: string | null;
  fromEmail?: string | null;
  replyToEmail?: string | null;
  campaignProviderId?: string | null;
  campaignProviderKey?: string | null;
  campaignProviderName?: string | null;
  campaignProviderHealthStatus?: string | null;
  domainAuthId?: number | null;
  domainName?: string | null;
}

export const CAMPAIGN_EMAIL_ROUTING_FIELDS = [
  "senderProfileId",
  "senderName",
  "fromEmail",
  "replyToEmail",
  "campaignProviderId",
  "campaignProviderKey",
  "campaignProviderName",
  "campaignProviderHealthStatus",
  "domainAuthId",
  "domainName",
] as const;

type MutableRecord = Record;

function asRecord(value: unknown): MutableRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as MutableRecord) } : {};
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function readCampaignEmailRouting(campaign: { audienceRefs?: unknown } | null | undefined): CampaignEmailRoutingMetadata {
  const audienceRefs = asRecord(campaign?.audienceRefs);
  const wizardDetails = asRecord(audienceRefs.wizardDetails);
  const routing = asRecord(wizardDetails.emailRouting);

  return {
    senderProfileId: normalizeNullableString(routing.senderProfileId),
    senderName: normalizeNullableString(routing.senderName),
    fromEmail: normalizeNullableString(routing.fromEmail),
    replyToEmail: normalizeNullableString(routing.replyToEmail),
    campaignProviderId: normalizeNullableString(routing.campaignProviderId),
    campaignProviderKey: normalizeNullableString(routing.campaignProviderKey),
    campaignProviderName: normalizeNullableString(routing.campaignProviderName),
    campaignProviderHealthStatus: normalizeNullableString(routing.campaignProviderHealthStatus),
    domainAuthId: normalizeNullableNumber(routing.domainAuthId),
    domainName: normalizeNullableString(routing.domainName),
  };
}

export function withCampaignEmailRouting(campaign: T): T & CampaignEmailRoutingMetadata {
  return {
    ...campaign,
    ...readCampaignEmailRouting(campaign),
  };
}

export function mergeCampaignEmailRouting(
  input: MutableRecord,
  existingAudienceRefs?: unknown,
): MutableRecord {
  const nextData = { ...input };
  const hasRoutingFields = CAMPAIGN_EMAIL_ROUTING_FIELDS.some((field) => field in nextData);
  if (!hasRoutingFields) {
    return nextData;
  }

  const nextAudienceRefs = asRecord(("audienceRefs" in nextData ? nextData.audienceRefs : undefined) ?? existingAudienceRefs);
  const nextWizardDetails = asRecord(nextAudienceRefs.wizardDetails);
  const nextRouting = asRecord(nextWizardDetails.emailRouting);

  const normalizedFields: CampaignEmailRoutingMetadata = {
    senderProfileId: normalizeNullableString(nextData.senderProfileId),
    senderName: normalizeNullableString(nextData.senderName),
    fromEmail: normalizeNullableString(nextData.fromEmail),
    replyToEmail: normalizeNullableString(nextData.replyToEmail),
    campaignProviderId: normalizeNullableString(nextData.campaignProviderId),
    campaignProviderKey: normalizeNullableString(nextData.campaignProviderKey),
    campaignProviderName: normalizeNullableString(nextData.campaignProviderName),
    campaignProviderHealthStatus: normalizeNullableString(nextData.campaignProviderHealthStatus),
    domainAuthId: normalizeNullableNumber(nextData.domainAuthId),
    domainName: normalizeNullableString(nextData.domainName),
  };

  for (const field of CAMPAIGN_EMAIL_ROUTING_FIELDS) {
    delete nextData[field];
  }

  for (const [key, value] of Object.entries(normalizedFields)) {
    if (value === null || value === undefined || value === "") {
      delete nextRouting[key];
      continue;
    }
    nextRouting[key] = value;
  }

  if (Object.keys(nextRouting).length > 0) {
    nextWizardDetails.emailRouting = nextRouting;
  } else {
    delete nextWizardDetails.emailRouting;
  }

  if (Object.keys(nextWizardDetails).length > 0) {
    nextAudienceRefs.wizardDetails = nextWizardDetails;
  } else {
    delete nextAudienceRefs.wizardDetails;
  }

  if (Object.keys(nextAudienceRefs).length > 0) {
    nextData.audienceRefs = nextAudienceRefs;
  } else {
    delete nextData.audienceRefs;
  }

  return nextData;
}