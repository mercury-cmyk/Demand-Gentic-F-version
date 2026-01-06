import type { Account, Contact } from "./schema";

export type PhoneType = "direct" | "mobile" | "hq" | "other";

export interface UnifiedPhoneRecord {
  number: string;
  e164?: string | null;
  type: PhoneType;
  label: string;
  isPrimary: boolean;
  source: "contact" | "account";
}

export interface UnifiedContactRecord {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  emailStatus?: string | null;
  linkedinUrl?: string | null;
  ownerId?: string | null;
  accountId?: string | null;
  phones: UnifiedPhoneRecord[];
  job: {
    title?: string | null;
    department?: string | null;
    seniority?: string | null;
  };
  location: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
    postalCode?: string | null;
    timezone?: string | null;
    formatted?: string | null;
  };
  tags: string[];
  intentTopics: string[];
  account?: {
    id: string;
    name: string;
    domain?: string | null;
    industry?: string | null;
    size?: string | null;
    revenue?: string | null;
    hqCity?: string | null;
    hqState?: string | null;
    hqCountry?: string | null;
  };
  status: {
    phone?: string | null;
    email?: string | null;
    consentBasis?: string | null;
  };
  metadata: {
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface UnifiedAccountRecord {
  id: string;
  name: string;
  domain?: string | null;
  websiteDomain?: string | null;
  industry: {
    primary?: string | null;
    secondary: string[];
    sic?: string | null;
    naics?: string | null;
  };
  size: {
    employees?: string | null;
    revenue?: string | null;
  };
  location: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
    postalCode?: string | null;
    address?: string | null;
  };
  ownership: {
    ownerId?: string | null;
    parentAccountId?: string | null;
  };
  tags: string[];
  intentTopics: string[];
  phones: UnifiedPhoneRecord[];
  stats: {
    contacts?: number;
  };
  metadata: {
    createdAt?: string;
    updatedAt?: string;
  };
}

const toIsoString = (value?: Date | string | null): string | undefined => {
  if (!value) return undefined;
  try {
    if (value instanceof Date) {
      return value.toISOString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  } catch {
    return undefined;
  }
};

const buildName = (contact: Contact): string => {
  if (contact.fullName && contact.fullName.trim().length > 0) {
    return contact.fullName.trim();
  }

  const parts = [contact.firstName, contact.lastName]
    .map((part) => part?.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : "Unnamed Contact";
};

const pushPhone = (
  list: UnifiedPhoneRecord[],
  phone: Partial<UnifiedPhoneRecord> & { number?: string | null }
) => {
  if (!phone.number) return;
  const normalized = phone.number.trim();
  if (!normalized) return;

  const exists = list.some(
    (existing) =>
      existing.number === normalized || (!!phone.e164 && existing.e164 === phone.e164)
  );
  if (exists) return;

  list.push({
    number: normalized,
    e164: phone.e164 ?? null,
    type: phone.type ?? "other",
    label: phone.label ?? "Phone",
    isPrimary: phone.isPrimary ?? false,
    source: phone.source ?? "contact",
  });
};

export function toUnifiedContactRecord(
  contact: Contact,
  account?: Account | null
): UnifiedContactRecord {
  const phones: UnifiedPhoneRecord[] = [];
  const directNumber = contact.directPhone || contact.directPhoneE164 || undefined;
  const mobileNumber = contact.mobilePhone || contact.mobilePhoneE164 || undefined;
  const hqNumber = account?.mainPhone || account?.mainPhoneE164 || undefined;

  pushPhone(phones, {
    number: directNumber,
    e164: contact.directPhoneE164 ?? undefined,
    type: "direct",
    label: "Direct",
    isPrimary: true,
    source: "contact",
  });

  pushPhone(phones, {
    number: mobileNumber,
    e164: contact.mobilePhoneE164 ?? undefined,
    type: "mobile",
    label: "Mobile",
    isPrimary: phones.length === 0,
    source: "contact",
  });

  pushPhone(phones, {
    number: hqNumber,
    e164: account?.mainPhoneE164 ?? undefined,
    type: "hq",
    label: account?.name ? `${account.name} HQ` : "Company",
    isPrimary: phones.length === 0,
    source: "account",
  });

  const location = {
    city: contact.city || account?.hqCity || null,
    state: contact.state || account?.hqState || null,
    country: contact.country || account?.hqCountry || null,
    postalCode: contact.postalCode || account?.hqPostalCode || null,
    timezone: contact.timezone || null,
    formatted: contact.contactLocation || account?.companyLocation || null,
  };

  return {
    id: contact.id,
    name: buildName(contact),
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    emailStatus: contact.emailVerificationStatus,
    linkedinUrl: contact.linkedinUrl,
    ownerId: contact.ownerId,
    accountId: contact.accountId ?? undefined,
    phones,
    job: {
      title: contact.jobTitle,
      department: contact.department,
      seniority: contact.seniorityLevel,
    },
    location,
    tags: contact.tags ?? [],
    intentTopics: contact.intentTopics ?? [],
    account: account
      ? {
          id: account.id,
          name: account.name,
          domain: account.domain,
          industry: account.industryStandardized,
          size: account.employeesSizeRange,
          revenue: account.revenueRange,
          hqCity: account.hqCity,
          hqState: account.hqState,
          hqCountry: account.hqCountry,
        }
      : undefined,
    status: {
      phone: contact.phoneStatus,
      email: contact.emailVerificationStatus,
      consentBasis: contact.consentBasis,
    },
    metadata: {
      createdAt: toIsoString(contact.createdAt),
      updatedAt: toIsoString(contact.updatedAt),
    },
  };
}

export function toUnifiedAccountRecord(
  account: Account,
  options?: { contactCount?: number }
): UnifiedAccountRecord {
  const phones: UnifiedPhoneRecord[] = [];
  const accountPhoneNumber = account.mainPhone || account.mainPhoneE164 || undefined;

  pushPhone(phones, {
    number: accountPhoneNumber,
    e164: account.mainPhoneE164 ?? undefined,
    type: "hq",
    label: "HQ Phone",
    isPrimary: true,
    source: "account",
  });

  return {
    id: account.id,
    name: account.name,
    domain: account.domain,
    websiteDomain: account.websiteDomain,
    industry: {
      primary: account.industryStandardized,
      secondary: account.industrySecondary ?? [],
      sic: account.sicCode,
      naics: account.naicsCode,
    },
    size: {
      employees: account.employeesSizeRange,
      revenue: account.revenueRange,
    },
    location: {
      city: account.hqCity,
      state: account.hqState,
      country: account.hqCountry,
      postalCode: account.hqPostalCode,
      address: account.hqAddress || account.hqStreet1 || null,
    },
    ownership: {
      ownerId: account.ownerId,
      parentAccountId: account.parentAccountId,
    },
    tags: account.tags ?? [],
    intentTopics: account.intentTopics ?? [],
    phones,
    stats: {
      contacts: options?.contactCount,
    },
    metadata: {
      createdAt: toIsoString(account.createdAt),
      updatedAt: toIsoString(account.updatedAt),
    },
  };
}
