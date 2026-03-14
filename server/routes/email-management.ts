import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { requireRole } from '../auth';
import { senderProfiles, type SenderProfile } from '@shared/schema';
import domainManagementRouter from './domain-management';
import {
  bindSenderProfileToCampaignEmailProvider,
  campaignEmailProviderService,
  getCampaignEmailProvider,
  getCampaignEmailProviderBindingForSender,
  listCampaignEmailProviders,
} from '../services/campaign-email-provider-service';
import {
  authenticateBrevoDomain,
  createBrevoDomain,
  createBrevoSender,
  deleteBrevoDomain,
  deleteBrevoSender,
  getBrevoDomain,
  getBrevoInfrastructureOverview,
  syncBrevoAssetsToDashboard,
  updateBrevoSender,
  validateBrevoSender,
} from '../services/brevo-infrastructure-service';

const router = Router();

router.use(requireRole('admin', 'campaign_manager'));

const providerSchemaBase = z.object({
  providerKey: z.enum(['mailgun', 'brevo', 'brainpool', 'custom']),
  name: z.string().min(1),
  description: z.string().optional().or(z.literal('')),
  transport: z.enum(['mailgun_api', 'brevo_api', 'smtp']).optional(),
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  priority: z.coerce.number().int().min(1).max(100).optional(),
  apiBaseUrl: z.string().optional().or(z.literal('')),
  apiDomain: z.string().optional().or(z.literal('')),
  apiRegion: z.string().optional().or(z.literal('')),
  apiKey: z.string().optional().or(z.literal('')),
  webhookSigningKey: z.string().optional().or(z.literal('')),
  smtpHost: z.string().optional().or(z.literal('')),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUsername: z.string().optional().or(z.literal('')),
  smtpPassword: z.string().optional().or(z.literal('')),
  defaultFromEmail: z.string().email().optional().or(z.literal('')),
  defaultFromName: z.string().optional().or(z.literal('')),
  replyToEmail: z.string().email().optional().or(z.literal('')),
  dnsProfile: z.object({
    spfInclude: z.string().optional(),
    dkimType: z.enum(['cname', 'txt']).optional(),
    dkimSelector: z.string().optional(),
    dkimValue: z.string().optional(),
    trackingHost: z.string().optional(),
    trackingValue: z.string().optional(),
    returnPathHost: z.string().optional(),
    returnPathValue: z.string().optional(),
    dmarcPolicy: z.enum(['none', 'quarantine', 'reject']).optional(),
    dmarcReportEmail: z.string().optional(),
    setupNotes: z.string().optional(),
  }).partial().optional(),
  sendingProfile: z.object({
    batchSize: z.coerce.number().int().positive().optional(),
    rateLimitPerMinute: z.coerce.number().int().positive().optional(),
    dailyCap: z.coerce.number().int().positive().optional(),
    enableOpenTracking: z.boolean().optional(),
    enableClickTracking: z.boolean().optional(),
    enableUnsubscribeHeader: z.boolean().optional(),
    retryCount: z.coerce.number().int().min(0).max(10).optional(),
    retryBackoffMs: z.coerce.number().int().min(0).optional(),
    warmupMode: z.boolean().optional(),
  }).partial().optional(),
});

const providerSchema = providerSchemaBase.superRefine((data, ctx) => {
  const transport = data.transport
    || (data.providerKey === 'mailgun'
      ? 'mailgun_api'
      : data.providerKey === 'brevo'
        ? 'brevo_api'
        : 'smtp');

  if (transport === 'mailgun_api') {
    if (!data.apiDomain?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['apiDomain'], message: 'Mailgun requires an API domain.' });
    }
    if (!data.apiKey?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['apiKey'], message: 'Mailgun requires an API key.' });
    }
  }

  if (transport === 'brevo_api' && !data.apiKey?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['apiKey'], message: 'Brevo requires an API key.' });
  }

  if (transport === 'smtp') {
    if (!data.smtpHost?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['smtpHost'], message: 'SMTP host is required.' });
    }
    if (!data.smtpPort) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['smtpPort'], message: 'SMTP port is required.' });
    }
    if (!data.smtpUsername?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['smtpUsername'], message: 'SMTP username is required.' });
    }
    if (!data.smtpPassword?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['smtpPassword'], message: 'SMTP password is required.' });
    }
  }
});

const providerUpdateSchema = providerSchemaBase.partial();

const senderProfileSchema = z.object({
  name: z.string().min(1),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional().nullable().or(z.literal('')),
  replyToEmail: z.string().email().optional().nullable().or(z.literal('')),
  signatureHtml: z.string().optional().or(z.literal('')),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  warmupStatus: z.enum(['not_started', 'in_progress', 'completed', 'paused']).optional().nullable().or(z.literal('')),
  domainAuthId: z.coerce.number().int().positive().optional().nullable(),
  campaignProviderId: z.string().optional().nullable(),
});

const senderProfileUpdateSchema = senderProfileSchema.partial();

function normalizeNullableString(value?: string | null) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function inferTransport(providerKey: 'mailgun' | 'brevo' | 'brainpool' | 'custom', transport?: 'mailgun_api' | 'brevo_api' | 'smtp') {
  if (transport) return transport;
  if (providerKey === 'mailgun') return 'mailgun_api';
  if (providerKey === 'brevo') return 'brevo_api';
  return 'smtp';
}

async function resolveProviderForBinding(providerId?: string | null) {
  if (!providerId) return null;
  return getCampaignEmailProvider(providerId);
}

async function formatSenderProfile(profile: SenderProfile) {
  const explicitProvider = await getCampaignEmailProviderBindingForSender(profile.id);
  const resolvedProvider = explicitProvider || await campaignEmailProviderService.resolveCampaignEmailProviderForSenderProfile(profile);

  return {
    ...profile,
    campaignProvider: resolvedProvider,
    campaignProviderId: explicitProvider?.id || null,
    hasExplicitCampaignProviderBinding: !!explicitProvider,
  };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(await campaignEmailProviderService.getCampaignEmailManagementOverview());
  } catch (error: any) {
    console.error('Error fetching email management overview:', error);
    res.status(500).json({ error: 'Failed to fetch email management overview' });
  }
});

router.get('/overview', async (_req: Request, res: Response) => {
  try {
    res.json(await campaignEmailProviderService.getCampaignEmailManagementOverview());
  } catch (error: any) {
    console.error('Error fetching email management overview:', error);
    res.status(500).json({ error: 'Failed to fetch email management overview' });
  }
});

router.get('/providers', async (_req: Request, res: Response) => {
  try {
    res.json(await listCampaignEmailProviders());
  } catch (error: any) {
    console.error('Error listing campaign email providers:', error);
    res.status(500).json({ error: 'Failed to list campaign email providers' });
  }
});

router.post('/providers', async (req: Request, res: Response) => {
  try {
    const data = providerSchema.parse(req.body);
    const transport = inferTransport(data.providerKey, data.transport);
    const created = await campaignEmailProviderService.createCampaignEmailProvider({
      providerKey: data.providerKey,
      name: data.name,
      description: normalizeNullableString(data.description) || undefined,
      transport,
      isEnabled: data.isEnabled,
      isDefault: data.isDefault,
      priority: data.priority,
      apiBaseUrl: normalizeNullableString(data.apiBaseUrl) || undefined,
      apiDomain: normalizeNullableString(data.apiDomain) || undefined,
      apiRegion: normalizeNullableString(data.apiRegion) || undefined,
      apiKey: normalizeNullableString(data.apiKey) || undefined,
      webhookSigningKey: normalizeNullableString(data.webhookSigningKey) || undefined,
      smtpHost: normalizeNullableString(data.smtpHost) || undefined,
      smtpPort: data.smtpPort,
      smtpSecure: data.smtpSecure,
      smtpUsername: normalizeNullableString(data.smtpUsername) || undefined,
      smtpPassword: normalizeNullableString(data.smtpPassword) || undefined,
      defaultFromEmail: normalizeNullableString(data.defaultFromEmail) || undefined,
      defaultFromName: normalizeNullableString(data.defaultFromName) || undefined,
      replyToEmail: normalizeNullableString(data.replyToEmail) || undefined,
      dnsProfile: data.dnsProfile,
      sendingProfile: data.sendingProfile,
      createdBy: (req as any).user?.id || null,
    });

    res.status(201).json(created);
  } catch (error: any) {
    console.error('Error creating campaign email provider:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to create campaign email provider' });
  }
});

router.get('/providers/:id', async (req: Request, res: Response) => {
  try {
    const provider = await getCampaignEmailProvider(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: 'Campaign email provider not found' });
    }

    const { apiKey, smtpPassword, webhookSigningKey, ...safeProvider } = provider;
    res.json(safeProvider);
  } catch (error: any) {
    console.error('Error fetching campaign email provider:', error);
    res.status(500).json({ error: 'Failed to fetch campaign email provider' });
  }
});

router.put('/providers/:id', async (req: Request, res: Response) => {
  try {
    const data = providerUpdateSchema.parse(req.body);
    const current = await getCampaignEmailProvider(req.params.id);
    if (!current) {
      return res.status(404).json({ error: 'Campaign email provider not found' });
    }

    const providerKey = (data.providerKey || current.providerKey) as 'mailgun' | 'brevo' | 'brainpool' | 'custom';
    const transport = inferTransport(providerKey, data.transport || (current.transport as 'mailgun_api' | 'brevo_api' | 'smtp'));
    const updated = await campaignEmailProviderService.updateCampaignEmailProvider(req.params.id, {
      providerKey,
      name: data.name,
      description: data.description === undefined ? undefined : normalizeNullableString(data.description) || undefined,
      transport,
      isEnabled: data.isEnabled,
      isDefault: data.isDefault,
      priority: data.priority,
      apiBaseUrl: data.apiBaseUrl === undefined ? undefined : normalizeNullableString(data.apiBaseUrl),
      apiDomain: data.apiDomain === undefined ? undefined : normalizeNullableString(data.apiDomain),
      apiRegion: data.apiRegion === undefined ? undefined : normalizeNullableString(data.apiRegion),
      apiKey: data.apiKey === undefined ? undefined : normalizeNullableString(data.apiKey),
      webhookSigningKey: data.webhookSigningKey === undefined ? undefined : normalizeNullableString(data.webhookSigningKey),
      smtpHost: data.smtpHost === undefined ? undefined : normalizeNullableString(data.smtpHost),
      smtpPort: data.smtpPort,
      smtpSecure: data.smtpSecure,
      smtpUsername: data.smtpUsername === undefined ? undefined : normalizeNullableString(data.smtpUsername),
      smtpPassword: data.smtpPassword === undefined ? undefined : normalizeNullableString(data.smtpPassword),
      defaultFromEmail: data.defaultFromEmail === undefined ? undefined : normalizeNullableString(data.defaultFromEmail),
      defaultFromName: data.defaultFromName === undefined ? undefined : normalizeNullableString(data.defaultFromName),
      replyToEmail: data.replyToEmail === undefined ? undefined : normalizeNullableString(data.replyToEmail),
      dnsProfile: data.dnsProfile,
      sendingProfile: data.sendingProfile,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Campaign email provider not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating campaign email provider:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to update campaign email provider' });
  }
});

router.delete('/providers/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await campaignEmailProviderService.deleteCampaignEmailProvider(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Campaign email provider not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting campaign email provider:', error);
    res.status(500).json({ error: error.message || 'Failed to delete campaign email provider' });
  }
});

router.post('/providers/:id/verify', async (req: Request, res: Response) => {
  try {
    res.json(await campaignEmailProviderService.verifyCampaignEmailProvider(req.params.id));
  } catch (error: any) {
    console.error('Error verifying campaign email provider:', error);
    res.status(500).json({ error: error.message || 'Failed to verify campaign email provider' });
  }
});

router.post('/providers/:id/test-send', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      to: z.string().email(),
      subject: z.string().min(1).default('DemandGentic campaign email provider test'),
      html: z.string().min(1).default('<p>This is a test email from DemandGentic campaign email management.</p>'),
      text: z.string().optional(),
      fromEmail: z.string().email().optional(),
      fromName: z.string().optional(),
      replyTo: z.string().email().optional(),
    });

    const data = schema.parse(req.body);
    const result = await campaignEmailProviderService.sendCampaignProviderTestEmail(req.params.id, data);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error sending provider test email:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to send provider test email' });
  }
});

router.post('/providers/:id/set-default', async (req: Request, res: Response) => {
  try {
    const updated = await campaignEmailProviderService.updateCampaignEmailProvider(req.params.id, { isDefault: true });
    if (!updated) {
      return res.status(404).json({ error: 'Campaign email provider not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Error setting default campaign email provider:', error);
    res.status(500).json({ error: error.message || 'Failed to set default campaign email provider' });
  }
});

router.get('/providers/:id/brevo/overview', async (req: Request, res: Response) => {
  try {
    res.json(await getBrevoInfrastructureOverview(req.params.id));
  } catch (error: any) {
    console.error('Error fetching Brevo infrastructure overview:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch Brevo infrastructure overview' });
  }
});

router.post('/providers/:id/brevo/sync-to-dashboard', async (req: Request, res: Response) => {
  try {
    res.json(await syncBrevoAssetsToDashboard(req.params.id));
  } catch (error: any) {
    console.error('Error syncing Brevo assets to dashboard:', error);
    res.status(500).json({ error: error.message || 'Failed to sync Brevo assets to dashboard' });
  }
});

router.post('/providers/:id/brevo/senders', async (req: Request, res: Response) => {
  try {
    const data = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      ips: z.array(z.string().min(1)).optional(),
    }).parse(req.body);

    await createBrevoSender(req.params.id, data);
    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error('Error creating Brevo sender:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to create Brevo sender' });
  }
});

router.put('/providers/:id/brevo/senders/:senderId', async (req: Request, res: Response) => {
  try {
    const data = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      ips: z.array(z.string().min(1)).optional(),
    }).parse(req.body);

    await updateBrevoSender(req.params.id, req.params.senderId, data);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating Brevo sender:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to update Brevo sender' });
  }
});

router.delete('/providers/:id/brevo/senders/:senderId', async (req: Request, res: Response) => {
  try {
    await deleteBrevoSender(req.params.id, req.params.senderId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting Brevo sender:', error);
    res.status(500).json({ error: error.message || 'Failed to delete Brevo sender' });
  }
});

router.post('/providers/:id/brevo/senders/:senderId/validate', async (req: Request, res: Response) => {
  try {
    const data = z.object({
      otp: z.string().min(1),
    }).parse(req.body);

    await validateBrevoSender(req.params.id, req.params.senderId, data.otp);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error validating Brevo sender:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to validate Brevo sender' });
  }
});

router.post('/providers/:id/brevo/domains', async (req: Request, res: Response) => {
  try {
    const data = z.object({
      domain: z.string().min(1),
    }).parse(req.body);

    await createBrevoDomain(req.params.id, data);
    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error('Error creating Brevo domain:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to create Brevo domain' });
  }
});

router.get('/providers/:id/brevo/domains/:domainName', async (req: Request, res: Response) => {
  try {
    const domain = await getBrevoDomain(req.params.id, req.params.domainName);
    if (!domain) {
      return res.status(404).json({ error: 'Brevo domain not found' });
    }

    res.json(domain);
  } catch (error: any) {
    console.error('Error fetching Brevo domain:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch Brevo domain' });
  }
});

router.post('/providers/:id/brevo/domains/:domainName/authenticate', async (req: Request, res: Response) => {
  try {
    await authenticateBrevoDomain(req.params.id, req.params.domainName);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error authenticating Brevo domain:', error);
    res.status(500).json({ error: error.message || 'Failed to authenticate Brevo domain' });
  }
});

router.delete('/providers/:id/brevo/domains/:domainName', async (req: Request, res: Response) => {
  try {
    await deleteBrevoDomain(req.params.id, req.params.domainName);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting Brevo domain:', error);
    res.status(500).json({ error: error.message || 'Failed to delete Brevo domain' });
  }
});

router.get('/sender-profiles', async (_req: Request, res: Response) => {
  try {
    const profiles = await db
      .select()
      .from(senderProfiles)
      .orderBy(desc(senderProfiles.isDefault), desc(senderProfiles.createdAt));

    res.json(await Promise.all(profiles.map((profile) => formatSenderProfile(profile))));
  } catch (error: any) {
    console.error('Error fetching sender profiles for email management:', error);
    res.status(500).json({ error: 'Failed to fetch sender profiles' });
  }
});

router.post('/sender-profiles', async (req: Request, res: Response) => {
  try {
    const data = senderProfileSchema.parse(req.body);
    if (data.isDefault) {
      await db.update(senderProfiles).set({ isDefault: false, updatedAt: new Date() });
    }

    const boundProvider = await resolveProviderForBinding(data.campaignProviderId);
    const [created] = await db
      .insert(senderProfiles)
      .values({
        name: data.name,
        fromName: data.fromName,
        fromEmail: data.fromEmail,
        replyTo: normalizeNullableString(data.replyTo),
        replyToEmail: normalizeNullableString(data.replyToEmail),
        signatureHtml: normalizeNullableString(data.signatureHtml),
        isDefault: data.isDefault ?? false,
        isActive: data.isActive ?? true,
        warmupStatus: normalizeNullableString(data.warmupStatus as string | null),
        domainAuthId: data.domainAuthId || null,
        espProvider: boundProvider?.providerKey || null,
        espAdapter: boundProvider?.providerKey || null,
        createdBy: (req as any).user?.id || null,
      })
      .returning();

    await bindSenderProfileToCampaignEmailProvider(created.id, data.campaignProviderId || null);
    res.status(201).json(await formatSenderProfile(created));
  } catch (error: any) {
    console.error('Error creating sender profile:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to create sender profile' });
  }
});

router.get('/sender-profiles/:id', async (req: Request, res: Response) => {
  try {
    const [profile] = await db
      .select()
      .from(senderProfiles)
      .where(eq(senderProfiles.id, req.params.id))
      .limit(1);

    if (!profile) {
      return res.status(404).json({ error: 'Sender profile not found' });
    }

    res.json(await formatSenderProfile(profile));
  } catch (error: any) {
    console.error('Error fetching sender profile:', error);
    res.status(500).json({ error: 'Failed to fetch sender profile' });
  }
});

router.put('/sender-profiles/:id', async (req: Request, res: Response) => {
  try {
    const data = senderProfileUpdateSchema.parse(req.body);
    const [existing] = await db
      .select()
      .from(senderProfiles)
      .where(eq(senderProfiles.id, req.params.id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Sender profile not found' });
    }

    if (data.isDefault) {
      await db.update(senderProfiles).set({ isDefault: false, updatedAt: new Date() });
    }

    const targetProviderId = data.campaignProviderId === undefined
      ? (await getCampaignEmailProviderBindingForSender(existing.id))?.id || null
      : data.campaignProviderId;
    const boundProvider = await resolveProviderForBinding(targetProviderId);
    const providerKeyValue = data.campaignProviderId === undefined
      ? existing.espProvider || null
      : boundProvider?.providerKey || null;
    const adapterKeyValue = data.campaignProviderId === undefined
      ? existing.espAdapter || null
      : boundProvider?.providerKey || null;

    const [updated] = await db
      .update(senderProfiles)
      .set({
        name: data.name ?? existing.name,
        fromName: data.fromName ?? existing.fromName,
        fromEmail: data.fromEmail ?? existing.fromEmail,
        replyTo: data.replyTo === undefined ? existing.replyTo : normalizeNullableString(data.replyTo),
        replyToEmail: data.replyToEmail === undefined ? existing.replyToEmail : normalizeNullableString(data.replyToEmail),
        signatureHtml: data.signatureHtml === undefined ? existing.signatureHtml : normalizeNullableString(data.signatureHtml),
        isDefault: data.isDefault ?? existing.isDefault,
        isActive: data.isActive ?? existing.isActive,
        warmupStatus: data.warmupStatus === undefined
          ? existing.warmupStatus
          : normalizeNullableString(data.warmupStatus as string | null),
        domainAuthId: data.domainAuthId === undefined ? existing.domainAuthId : data.domainAuthId,
        espProvider: providerKeyValue,
        espAdapter: adapterKeyValue,
        updatedAt: new Date(),
      })
      .where(eq(senderProfiles.id, req.params.id))
      .returning();

    if (data.campaignProviderId !== undefined) {
      await bindSenderProfileToCampaignEmailProvider(updated.id, data.campaignProviderId || null);
    }

    res.json(await formatSenderProfile(updated));
  } catch (error: any) {
    console.error('Error updating sender profile:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to update sender profile' });
  }
});

router.delete('/sender-profiles/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await db
      .delete(senderProfiles)
      .where(eq(senderProfiles.id, req.params.id))
      .returning({ id: senderProfiles.id });

    if (!deleted.length) {
      return res.status(404).json({ error: 'Sender profile not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting sender profile:', error);
    res.status(500).json({ error: error.message || 'Failed to delete sender profile' });
  }
});

router.post('/sender-profiles/:id/provider-binding', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      providerId: z.string().nullable().optional(),
    });

    const data = schema.parse(req.body);
    const [profile] = await db
      .select()
      .from(senderProfiles)
      .where(eq(senderProfiles.id, req.params.id))
      .limit(1);

    if (!profile) {
      return res.status(404).json({ error: 'Sender profile not found' });
    }

    const provider = await resolveProviderForBinding(data.providerId || null);
    await bindSenderProfileToCampaignEmailProvider(profile.id, data.providerId || null);
    await db
      .update(senderProfiles)
      .set({
        espProvider: provider?.providerKey || null,
        espAdapter: provider?.providerKey || null,
        updatedAt: new Date(),
      })
      .where(eq(senderProfiles.id, profile.id));

    const [updated] = await db
      .select()
      .from(senderProfiles)
      .where(eq(senderProfiles.id, profile.id))
      .limit(1);

    res.json(await formatSenderProfile(updated));
  } catch (error: any) {
    console.error('Error updating sender profile provider binding:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to update sender profile provider binding' });
  }
});

router.use('/domains', domainManagementRouter);

export default router;
