import { storage } from "../storage";
import { db } from "../db";
import { eq, and, sql, gte } from "drizzle-orm";
import { contactVoicemailTracking, voicemailAssets, callAttempts } from "@shared/schema";
import type { 
  VoicemailMachinePolicy, 
  VoicemailTokenContext,
  AutoDialerQueue 
} from "@shared/schema";

interface VoicemailExecutionResult {
  action: 'voicemail' | 'callback_scheduled' | 'silent_drop' | 'skipped';
  reason?: string;
  assetId?: string;
  scheduledCallbackAt?: Date;
}

export class VoicemailPolicyExecutor {
  /**
   * Execute voicemail policy for a machine-detected call
   */
  async executeMachinePolicy(
    contactId: string,
    campaignId: string,
    callAttemptId: string,
    policy: VoicemailMachinePolicy,
    queue: AutoDialerQueue,
    amdResult?: 'human' | 'machine' | 'unknown',
    amdConfidence?: number
  ): Promise {
    
    // Record AMD results in call attempt immediately
    if (amdResult) {
      await db
        .update(callAttempts)
        .set({
          amdResult,
          amdConfidence: amdConfidence !== undefined ? sql`${amdConfidence}::numeric(3,2)` : null,
        })
        .where(eq(callAttempts.id, callAttemptId));
    }
    
    // Check campaign daily cap
    if (policy.campaign_daily_vm_cap) {
      const dailyCount = await this.getCampaignDailyVmCount(campaignId);
      if (dailyCount >= policy.campaign_daily_vm_cap) {
        console.log(`[VoicemailPolicy] Campaign ${campaignId} daily VM cap (${policy.campaign_daily_vm_cap}) reached`);
        return { action: 'skipped', reason: 'campaign_daily_cap_reached' };
      }
    }

    // Check per-contact cap
    if (policy.max_vm_per_contact) {
      const contactVmCount = await this.getContactVmCount(contactId, campaignId);
      if (contactVmCount >= policy.max_vm_per_contact) {
        console.log(`[VoicemailPolicy] Contact ${contactId} VM cap (${policy.max_vm_per_contact}) reached`);
        return { action: 'skipped', reason: 'contact_vm_cap_reached' };
      }
    }

    // Check cooldown period
    if (policy.vm_cooldown_hours) {
      const lastVm = await this.getLastVoicemail(contactId, campaignId);
      if (lastVm) {
        const hoursSinceLastVm = (Date.now() - lastVm.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastVm  {
    
    const contact = await storage.getContact(contactId);
    const account = contact?.accountId ? await storage.getAccount(contact.accountId) : null;
    const campaign = await storage.getCampaign(campaignId);

    // Get voicemail asset if audio file
    let asset = null;
    if (policy.message_type === 'audio_file' && policy.audio_asset_id) {
      asset = await db.query.voicemailAssets.findFirst({
        where: eq(voicemailAssets.id, policy.audio_asset_id),
      });

      if (!asset || !asset.isActive) {
        console.log(`[VoicemailPolicy] Audio asset ${policy.audio_asset_id} not found or inactive`);
        return { action: 'skipped', reason: 'asset_not_found' };
      }
    }

    // Build token context for TTS template substitution
    const tokenContext: VoicemailTokenContext = {
      contact: {
        first_name: contact?.firstName || '',
        last_name: contact?.lastName || '',
        full_name: contact?.fullName || '',
        company: account?.name || '',
        email: contact?.email || '',
        phone: contact?.directPhone || contact?.mobilePhone || '',
      },
      company: {
        name: account?.name || '',
        domain: account?.domain || '',
      },
      callback: {
        number: '', // TODO: Add callback phone to queue config
        hours: 'business hours',
      },
      campaign: {
        name: campaign?.name || '',
        owner_name: '', // TODO: Get from campaign owner user record
      },
    };

    // For TTS: substitute tokens in template
    let ttsMessage = '';
    if (policy.message_type === 'tts' && policy.template_id) {
      // In production, you'd fetch template from database
      // For now, use a basic template with token substitution
      ttsMessage = this.substituteTokens(
        `Hello {{contact.first_name}}, this is {{campaign.owner_name}} from {{company.name}}. Please call us back at {{callback.number}} during {{callback.hours}}.`,
        tokenContext
      );
    }

    // TODO: Integrate with Telnyx to actually play the voicemail
    // For now, we'll just log the action and update tracking

    // Update call attempt with voicemail info
    await db
      .update(callAttempts)
      .set({
        disposition: 'voicemail',
        vmAssetId: asset?.id || null,
        vmDelivered: true,
        vmDurationSec: asset?.durationSec || policy.message_max_sec || 30,
      })
      .where(eq(callAttempts.id, callAttemptId));

    // Track voicemail for this contact/campaign
    await this.trackVoicemail(contactId, campaignId, asset?.id);

    console.log(`[VoicemailPolicy] Voicemail left for contact ${contactId}, campaign ${campaignId}`);
    console.log(`[VoicemailPolicy] TTS Message: ${ttsMessage}`);

    return {
      action: 'voicemail',
      assetId: asset?.id,
    };
  }

  /**
   * Schedule callback for later
   */
  private async scheduleCallback(
    contactId: string,
    campaignId: string,
    callAttemptId: string,
    policy: VoicemailMachinePolicy
  ): Promise {
    
    // Calculate callback time (2 hours from now)
    const callbackDelay = 2 * 60 * 60 * 1000;
    const scheduledAt = new Date(Date.now() + callbackDelay);

    // Mark disposition as callback - the auto-dialer's retry rules will handle re-queueing
    await db
      .update(callAttempts)
      .set({
        disposition: 'callback-requested',
      })
      .where(eq(callAttempts.id, callAttemptId));

    console.log(`[VoicemailPolicy] Callback scheduled for contact ${contactId} at ${scheduledAt}`);

    return {
      action: 'callback_scheduled',
      scheduledCallbackAt: scheduledAt,
    };
  }

  /**
   * Drop call silently (no voicemail, no callback)
   */
  private dropSilent(callAttemptId: string): VoicemailExecutionResult {
    // Just hang up - no action needed
    console.log(`[VoicemailPolicy] Silent drop for call attempt ${callAttemptId}`);
    
    return {
      action: 'silent_drop',
    };
  }

  /**
   * Track voicemail delivery for contact/campaign
   */
  private async trackVoicemail(
    contactId: string,
    campaignId: string,
    assetId?: string
  ): Promise {
    
    // Check if tracking record exists
    const existing = await db.query.contactVoicemailTracking.findFirst({
      where: and(
        eq(contactVoicemailTracking.contactId, contactId),
        eq(contactVoicemailTracking.campaignId, campaignId)
      ),
    });

    if (existing) {
      // Update existing record
      await db
        .update(contactVoicemailTracking)
        .set({
          vmCount: sql`${contactVoicemailTracking.vmCount} + 1`,
          lastVmAt: new Date(),
          lastVmAssetId: assetId || null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(contactVoicemailTracking.contactId, contactId),
          eq(contactVoicemailTracking.campaignId, campaignId)
        ));
    } else {
      // Create new tracking record
      await db.insert(contactVoicemailTracking).values({
        contactId,
        campaignId,
        vmCount: 1,
        lastVmAt: new Date(),
        lastVmAssetId: assetId || null,
        updatedAt: new Date(),
      });
    }
  }

  /**
   * Get contact's voicemail count for campaign
   */
  private async getContactVmCount(contactId: string, campaignId: string): Promise {
    const tracking = await db.query.contactVoicemailTracking.findFirst({
      where: and(
        eq(contactVoicemailTracking.contactId, contactId),
        eq(contactVoicemailTracking.campaignId, campaignId)
      ),
    });

    return tracking?.vmCount || 0;
  }

  /**
   * Get last voicemail timestamp for contact/campaign
   */
  private async getLastVoicemail(contactId: string, campaignId: string): Promise {
    const tracking = await db.query.contactVoicemailTracking.findFirst({
      where: and(
        eq(contactVoicemailTracking.contactId, contactId),
        eq(contactVoicemailTracking.campaignId, campaignId)
      ),
    });

    return tracking?.lastVmAt || null;
  }

  /**
   * Get campaign daily voicemail count
   */
  private async getCampaignDailyVmCount(campaignId: string): Promise {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db
      .select({ count: sql`count(*)` })
      .from(callAttempts)
      .where(and(
        eq(callAttempts.campaignId, campaignId),
        eq(callAttempts.vmDelivered, true),
        gte(callAttempts.startedAt, today)
      ));

    return Number(result[0]?.count || 0);
  }

  /**
   * Check if current time is within local time window
   */
  private isWithinLocalTimeWindow(
    timezone?: string,
    window?: { start_hhmm: string; end_hhmm: string }
  ): boolean {
    if (!window || !timezone) return true;

    try {
      // Get current time in contact's timezone
      const now = new Date();
      const localTime = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);

      const currentHHMM = localTime.replace(':', '');
      const startHHMM = window.start_hhmm.replace(':', '');
      const endHHMM = window.end_hhmm.replace(':', '');

      return currentHHMM >= startHHMM && currentHHMM  {
      const keys = path.trim().split('.');
      let value: any = context;

      for (const key of keys) {
        value = value?.[key];
        if (value === undefined) break;
      }

      return value !== undefined ? String(value) : match;
    });

    return result;
  }
}

// Export singleton instance
export const voicemailPolicyExecutor = new VoicemailPolicyExecutor();