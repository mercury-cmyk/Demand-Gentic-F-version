function normalizeSenderIpValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || null;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const candidate = typeof record.ip === 'string'
      ? record.ip
      : typeof record.address === 'string'
        ? record.address
        : typeof record.value === 'string'
          ? record.value
          : null;

    if (!candidate) return null;
    const normalized = candidate.trim();
    return normalized || null;
  }

  return null;
}

export function parseBrevoBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'verified', 'authenticated', 'active'].includes(normalized)) return true;
    if (['false', '0', 'no', 'pending', 'inactive', 'failed', 'unverified', 'requested'].includes(normalized)) return false;
  }
  return null;
}

export function extractBrevoSenderIps(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const ips: string[] = [];

  for (const entry of value) {
    const normalized = normalizeSenderIpValue(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ips.push(normalized);
  }

  return ips;
}

export function inferBrevoSenderVerification(
  raw: Record<string, unknown>,
  active: boolean | null,
): boolean | null {
  const explicitVerification = parseBrevoBoolean(
    raw.verified
    ?? raw.isVerified
    ?? raw.authenticated
    ?? raw.validationStatus
    ?? raw.validation_status
    ?? raw.validationState,
  );

  if (explicitVerification !== null) {
    return explicitVerification;
  }

  return active;
}

export function buildBrevoSenderIpAssignments(
  email: string,
  ips?: string[],
): Array<{ ip: string; domain: string; weight: number }> | undefined {
  const normalizedIps = Array.from(new Set((ips || []).map((entry) => entry.trim()).filter(Boolean)));
  if (!normalizedIps.length) {
    return undefined;
  }

  const domain = email.split('@')[1]?.trim().toLowerCase();
  if (!domain) {
    return undefined;
  }

  const baseWeight = Math.floor(100 / normalizedIps.length);
  const remainder = 100 - (baseWeight * normalizedIps.length);

  return normalizedIps.map((ip, index) => ({
    ip,
    domain,
    weight: baseWeight + (index < remainder ? 1 : 0),
  }));
}
