"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/lib/campaign-email-routing.ts
var campaign_email_routing_exports = {};
__export(campaign_email_routing_exports, {
  CAMPAIGN_EMAIL_ROUTING_FIELDS: () => CAMPAIGN_EMAIL_ROUTING_FIELDS,
  mergeCampaignEmailRouting: () => mergeCampaignEmailRouting,
  readCampaignEmailRouting: () => readCampaignEmailRouting,
  withCampaignEmailRouting: () => withCampaignEmailRouting
});
module.exports = __toCommonJS(campaign_email_routing_exports);
var CAMPAIGN_EMAIL_ROUTING_FIELDS = [
  "senderProfileId",
  "senderName",
  "fromEmail",
  "replyToEmail",
  "campaignProviderId",
  "campaignProviderKey",
  "campaignProviderName",
  "campaignProviderHealthStatus",
  "domainAuthId",
  "domainName"
];
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}
function normalizeNullableString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function normalizeNullableNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
function readCampaignEmailRouting(campaign) {
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
    domainName: normalizeNullableString(routing.domainName)
  };
}
function withCampaignEmailRouting(campaign) {
  return {
    ...campaign,
    ...readCampaignEmailRouting(campaign)
  };
}
function mergeCampaignEmailRouting(input, existingAudienceRefs) {
  const nextData = { ...input };
  const hasRoutingFields = CAMPAIGN_EMAIL_ROUTING_FIELDS.some((field) => field in nextData);
  if (!hasRoutingFields) {
    return nextData;
  }
  const nextAudienceRefs = asRecord(("audienceRefs" in nextData ? nextData.audienceRefs : void 0) ?? existingAudienceRefs);
  const nextWizardDetails = asRecord(nextAudienceRefs.wizardDetails);
  const nextRouting = asRecord(nextWizardDetails.emailRouting);
  const normalizedFields = {
    senderProfileId: normalizeNullableString(nextData.senderProfileId),
    senderName: normalizeNullableString(nextData.senderName),
    fromEmail: normalizeNullableString(nextData.fromEmail),
    replyToEmail: normalizeNullableString(nextData.replyToEmail),
    campaignProviderId: normalizeNullableString(nextData.campaignProviderId),
    campaignProviderKey: normalizeNullableString(nextData.campaignProviderKey),
    campaignProviderName: normalizeNullableString(nextData.campaignProviderName),
    campaignProviderHealthStatus: normalizeNullableString(nextData.campaignProviderHealthStatus),
    domainAuthId: normalizeNullableNumber(nextData.domainAuthId),
    domainName: normalizeNullableString(nextData.domainName)
  };
  for (const field of CAMPAIGN_EMAIL_ROUTING_FIELDS) {
    delete nextData[field];
  }
  for (const [key, value] of Object.entries(normalizedFields)) {
    if (value === null || value === void 0 || value === "") {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CAMPAIGN_EMAIL_ROUTING_FIELDS,
  mergeCampaignEmailRouting,
  readCampaignEmailRouting,
  withCampaignEmailRouting
});
