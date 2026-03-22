// Storage layer - referenced from blueprint:javascript_database
import crypto from "node:crypto";
import { eq, sql, and, or, not, isNull, isNotNull, like, ilike, gte, lte, gt, lt, desc, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./db";
import { buildFilterQuery, buildSuppressionFilter } from "./filter-builder";
import { enrichCampaignQADefaults } from "./lib/campaign-qa-defaults";
import type { FilterGroup } from "@shared/filter-types";
import {
  users, accounts, contacts, campaigns, campaignAgentAssignments, segments, lists, domainSets, domainSetItems, domainSetContactLinks,
  leads, leadTags, leadTagAssignments, emailMessages, calls, suppressionEmails, suppressionPhones,
  campaignOrders, orderCampaignLinks, bulkImports, auditLogs, activityLog, savedFilters,
  selectionContexts, filterFieldRegistry, fieldChangeLog, industryReference,
  companySizeReference, revenueRangeReference,
  campaignAudienceSnapshots, campaignQueue, agentQueue, campaignAccountStats, senderProfiles, emailTemplates, emailSends, emailEvents,
  callScripts, callAttempts, callEvents, qualificationResponses,
  contentAssets, socialPosts, aiContentGenerations, contentAssetPushes,
  events, resources, news,
  softphoneProfiles, callRecordingAccessLogs, sipTrunkConfigs,
  campaignContentLinks,
  speakers, organizers, sponsors,
  pipelines, pipelineOpportunities, mailboxAccounts,
  emailSequences, sequenceSteps, sequenceEnrollments,
  userRoles,
  autoDialerQueues, agentStatus,
  type User, type InsertUser, type UserRole, type InsertUserRole,
  type Account, type InsertAccount,
  type Contact, type InsertContact,
  type Campaign, type InsertCampaign,
  type CampaignAgentAssignment, type InsertCampaignAgentAssignment,
  type Segment, type InsertSegment,
  type List, type InsertList,
  type DomainSet, type InsertDomainSet,
  type DomainSetItem, type InsertDomainSetItem,
  type DomainSetContactLink, type InsertDomainSetContactLink,
  type Lead, type InsertLead, type LeadWithAccount,
  type LeadTag, type InsertLeadTag, type LeadTagAssignment, type InsertLeadTagAssignment,
  type EmailMessage, type InsertEmailMessage,
  type Call, type InsertCall,
  type SuppressionEmail, type InsertSuppressionEmail,
  type SuppressionPhone, type InsertSuppressionPhone,
  type CampaignOrder, type InsertCampaignOrder,
  type OrderCampaignLink, type InsertOrderCampaignLink,
  type BulkImport, type InsertBulkImport,
  type AuditLog, type InsertAuditLog,
  type ActivityLog, type InsertActivityLog,
  type SavedFilter, type InsertSavedFilter,
  type SelectionContext, type InsertSelectionContext,
  type FilterField,
  type IndustryReference,
  type CompanySizeReference,
  type RevenueRangeReference,
  type CampaignAudienceSnapshot, type InsertCampaignAudienceSnapshot,
  type SenderProfile, type InsertSenderProfile,
  type EmailTemplate, type InsertEmailTemplate,
  type EmailSend, type InsertEmailSend,
  type EmailEvent, type InsertEmailEvent,
  type CallScript, type InsertCallScript,
  type CallAttempt, type InsertCallAttempt,
  type CallEvent, type InsertCallEvent,
  type QualificationResponse, type InsertQualificationResponse,
  type SoftphoneProfile, type InsertSoftphoneProfile,
  type CampaignContentLink, type InsertCampaignContentLink,
  type ContentAsset, type InsertContentAsset,
  type SocialPost, type InsertSocialPost,
  type AIContentGeneration, type InsertAIContentGeneration,
  type ContentAssetPush, type InsertContentAssetPush,
  type Event, type InsertEvent,
  type Resource, type InsertResource,
  type News, type InsertNews,
  type Speaker, type InsertSpeaker,
  type Organizer, type InsertOrganizer,
  type Sponsor, type InsertSponsor,
  type Pipeline, type InsertPipeline,
  type PipelineOpportunity, type InsertPipelineOpportunity,
  type MailboxAccount, type InsertMailboxAccount,
  type EmailSequence, type InsertEmailSequence,
  type SequenceStep, type InsertSequenceStep,
  type SequenceEnrollment, type InsertSequenceEnrollment,
  domainAuth, trackingDomains, ipPools, warmupPlans, sendPolicies,
  domainReputationSnapshots, perDomainStats,
  type DomainAuth, type InsertDomainAuth,
  type TrackingDomain, type InsertTrackingDomain,
  type IpPool, type InsertIpPool,
  type WarmupPlan, InsertWarmupPlan,
  type SendPolicy, type InsertSendPolicy,
  type DomainReputationSnapshot, type InsertDomainReputationSnapshot,
  type PerDomainStats, type InsertPerDomainStats,
  customFieldDefinitions,
  type CustomFieldDefinition,
  m365Activities,
  type M365Activity, type InsertM365Activity,
  dealConversations, dealMessages,
  type DealConversation, type InsertDealConversation,
  type DealMessage, type InsertDealMessage,
  oiBatchJobs,
  type OiBatchJob, type InsertOiBatchJob,
} from "@shared/schema";
import { getBestPhoneForContact, normalizePhoneWithCountryCode, normalizeCountryToCode } from "./lib/phone-utils";
import { detectContactTimezone } from "./utils/business-hours";

// Local type aliases for tables without exported type helpers
type SipTrunkConfig = typeof sipTrunkConfigs.$inferSelect;
type InsertSipTrunkConfig = typeof sipTrunkConfigs.$inferInsert;
type InsertCustomFieldDefinition = typeof customFieldDefinitions.$inferInsert;
type CallRecordingAccessLog = typeof callRecordingAccessLogs.$inferSelect;
type InsertCallRecordingAccessLog = typeof callRecordingAccessLogs.$inferInsert;

export interface IStorage {
  // Users
  getUser(id: string): Promise;
  getUsers(): Promise;
  getUserByUsername(username: string): Promise;
  getUserByEmail(email: string): Promise;
  createUser(user: InsertUser): Promise;
  updateUser(id: string, data: Partial): Promise;

  // User Roles (Multi-role support)
  getUserRoles(userId: string): Promise;
  assignUserRole(userId: string, role: string, assignedBy?: string): Promise;
  removeUserRole(userId: string, role: string): Promise;
  updateUserRoles(userId: string, roles: string[], assignedBy?: string): Promise;
  getAllUsersWithRoles(): Promise>;

  // Accounts
  getAccounts(filters?: FilterGroup, limit?: number): Promise;
  getAccountsCount(filters?: FilterGroup): Promise;
  getAccount(id: string): Promise;
  getAccountsByIds(ids: string[]): Promise;
  getAccountByDomain(domain: string): Promise;
  getAccountsByDomains(domains: string[]): Promise;
  createAccount(account: InsertAccount): Promise;
  createAccountsBulk(accounts: InsertAccount[]): Promise;
  updateAccount(id: string, account: Partial): Promise;
  deleteAccount(id: string): Promise;

  // Contacts
  getContacts(filters?: FilterGroup, limit?: number): Promise;
  getContactsCount(filters?: FilterGroup): Promise;
  getContact(id: string): Promise;
  getContactsByIds(ids: string[]): Promise;
  getContactsByAccountId(accountId: string): Promise;
  getContactsByEmails(emails: string[]): Promise;
  createContact(contact: InsertContact): Promise;
  createContactsBulk(contacts: InsertContact[]): Promise;
  updateContact(id: string, contact: Partial): Promise;
  deleteContact(id: string): Promise;

  // Custom Field Definitions
  getCustomFieldDefinitions(entityType?: 'account' | 'contact'): Promise;
  getCustomFieldDefinition(id: string): Promise;
  createCustomFieldDefinition(definition: InsertCustomFieldDefinition): Promise;
  updateCustomFieldDefinition(id: string, definition: Partial): Promise;
  deleteCustomFieldDefinition(id: string): Promise;

  // Campaigns
  getCampaigns(filters?: any): Promise;
  getCampaign(id: string): Promise;
  createCampaign(campaign: InsertCampaign): Promise;
  updateCampaign(id: string, campaign: Partial): Promise;
  deleteCampaign(id: string): Promise;

  // Campaign Agent Assignments
  listAgents(): Promise>;
  getCampaignAgentAssignments(campaignId: string): Promise;
  listActiveAgentAssignments(): Promise>;
  assignAgentsToCampaign(campaignId: string, agentIds: string[], assignedBy: string): Promise;
  releaseAgentAssignment(campaignId: string, agentId: string): Promise;
  getCampaignAgents(campaignId: string): Promise;

  // Campaign Audience Snapshots
  createCampaignAudienceSnapshot(snapshot: InsertCampaignAudienceSnapshot): Promise;
  getCampaignAudienceSnapshots(campaignId: string): Promise;

  // Campaign Queue (Account Lead Cap)
  getCampaignQueue(campaignId: string, status?: string): Promise;
  getInvalidQueueItems(campaignId: string): Promise;
  bulkRemoveInvalidItems(campaignId: string, reason?: string): Promise;
  enqueueContact(campaignId: string, contactId: string, accountId: string, priority?: number): Promise;
  bulkEnqueueContacts(campaignId: string, contacts: Array): Promise;
  updateQueueStatus(id: string, status: string, removedReason?: string, isPositiveDisposition?: boolean): Promise;
  removeFromQueue(campaignId: string, contactId: string, reason: string): Promise;
  removeFromQueueById(campaignId: string, queueId: string, reason: string): Promise;
  getCampaignAccountStats(campaignId: string, accountId?: string): Promise;
  upsertCampaignAccountStats(campaignId: string, accountId: string, updates: any): Promise;
  enforceAccountCap(campaignId: string): Promise;

  // Agent Queue Assignment
  getAgents(): Promise;
  assignQueueToAgents(campaignId: string, agentIds: string[], mode?: 'round_robin' | 'weighted'): Promise;
  getAgentQueue(agentId: string, campaignId?: string, status?: string): Promise;
  getQueueItemById(id: string): Promise;

  // Call Dispositions
  createCallDisposition(callData: InsertCall): Promise;
  getCallsByQueueItem(queueItemId: string): Promise;
  getCallsByContact(contactId: string): Promise;

  // Email Templates
  getEmailTemplates(): Promise;
  getEmailTemplate(id: string): Promise;
  createEmailTemplate(template: InsertEmailTemplate): Promise;
  updateEmailTemplate(id: string, template: Partial): Promise;
  approveEmailTemplate(id: string, approvedById: string): Promise;
  deleteEmailTemplate(id: string): Promise;

  // Email Sends
  getEmailSends(campaignId?: string): Promise;
  getEmailSend(id: string): Promise;
  createEmailSend(send: InsertEmailSend): Promise;
  updateEmailSend(id: string, send: Partial): Promise;

  // Email Events
  createEmailEvent(event: InsertEmailEvent): Promise;
  getEmailEvents(sendId: string): Promise;

  // Call Scripts
  getCallScripts(campaignId?: string): Promise;
  getCallScript(id: string): Promise;
  createCallScript(script: InsertCallScript): Promise;
  updateCallScript(id: string, script: Partial): Promise;
  deleteCallScript(id: string): Promise;

  // Call Attempts
  getCallAttempts(campaignId?: string, agentId?: string): Promise;
  getCallAttempt(id: string): Promise;
  getCallAttemptsByTelnyxId(telnyxCallId: string): Promise;
  createCallAttempt(attempt: InsertCallAttempt): Promise;
  updateCallAttempt(id: string, attempt: Partial): Promise;

  // Call Events
  createCallEvent(event: InsertCallEvent): Promise;
  getCallEvents(attemptId: string): Promise;

  // Softphone Profiles (Phase 27)
  getSoftphoneProfile(userId: string): Promise;
  upsertSoftphoneProfile(profile: InsertSoftphoneProfile): Promise;

  // Call Recording Access Logs (Phase 27)
  createCallRecordingAccessLog(log: InsertCallRecordingAccessLog): Promise;
  getCallRecordingAccessLogs(callAttemptId: string): Promise;

  // SIP Trunk Configuration (WebRTC)
  getSipTrunkConfigs(): Promise;
  getSipTrunkConfig(id: string): Promise;
  getDefaultSipTrunkConfig(): Promise;
  createSipTrunkConfig(config: InsertSipTrunkConfig): Promise;
  updateSipTrunkConfig(id: string, config: Partial): Promise;
  deleteSipTrunkConfig(id: string): Promise;
  setDefaultSipTrunk(id: string): Promise;

  // Campaign Content Links (Resources Centre Integration)
  getCampaignContentLinks(campaignId: string): Promise;
  getCampaignContentLink(id: number): Promise;
  createCampaignContentLink(link: InsertCampaignContentLink): Promise;
  deleteCampaignContentLink(id: number): Promise;

  // Speakers, Organizers, Sponsors
  getSpeakers(): Promise;
  getSpeaker(id: number): Promise;
  createSpeaker(speaker: InsertSpeaker): Promise;
  updateSpeaker(id: number, speaker: Partial): Promise;
  deleteSpeaker(id: number): Promise;

  getOrganizers(): Promise;
  getOrganizer(id: number): Promise;
  createOrganizer(organizer: InsertOrganizer): Promise;
  updateOrganizer(id: number, organizer: Partial): Promise;
  deleteOrganizer(id: number): Promise;

  getSponsors(): Promise;
  getSponsor(id: number): Promise;
  createSponsor(sponsor: InsertSponsor): Promise;
  updateSponsor(id: number, sponsor: Partial): Promise;
  deleteSponsor(id: number): Promise;

  // Qualification Responses
  createQualificationResponse(response: InsertQualificationResponse): Promise;
  getQualificationResponses(attemptId?: string, leadId?: string): Promise;

  // Segments
  getSegments(filters?: any): Promise;
  getSegment(id: string): Promise;
  getSegmentMembers(segmentId: string): Promise;
  createSegment(segment: InsertSegment): Promise;
  updateSegment(id: string, segment: Partial): Promise;
  deleteSegment(id: string): Promise;
  previewSegment(entityType: 'contact' | 'account', criteria: any): Promise;
  convertSegmentToList(segmentId: string, listName: string, userId: string): Promise;

  // Lists
  getLists(filters?: any): Promise;
  getList(id: string): Promise;
  getListById(id: string): Promise;
  getListMembers(listId: string): Promise;
  createList(list: InsertList): Promise;
  updateList(id: string, list: Partial): Promise;
  deleteList(id: string): Promise;
  exportList(listId: string, format: 'csv' | 'json'): Promise;

  // Leads
  getLeads(filters?: any): Promise;
  getLead(id: string): Promise;
  getLeadByCallAttemptId(callAttemptId: string): Promise;
  getLeadWithDetails(id: string): Promise;
  createLead(lead: InsertLead): Promise;
  createLeadFromCallAttempt(callAttemptId: string): Promise;
  updateLead(id: string, lead: Partial): Promise;
  approveLead(id: string, approvedById: string): Promise;
  rejectLead(id: string, reason: string, rejectedById: string): Promise;
  deleteLead(id: string, deletedById?: string): Promise;
  getDeletedLeads(): Promise;
  restoreLead(id: string): Promise;
  bulkRestoreLeads(ids: string[]): Promise;

  // Lead Tags
  getLeadTags(): Promise;
  getLeadTag(id: string): Promise;
  createLeadTag(tag: InsertLeadTag): Promise;
  updateLeadTag(id: string, tag: Partial): Promise;
  deleteLeadTag(id: string): Promise;
  getTagsForLead(leadId: string): Promise;
  addTagToLead(leadId: string, tagId: string, assignedById?: string): Promise;
  removeTagFromLead(leadId: string, tagId: string): Promise;
  addTagToLeads(leadIds: string[], tagId: string, assignedById?: string): Promise;
  removeTagFromLeads(leadIds: string[], tagId: string): Promise;

  // Suppressions
  getEmailSuppressions(): Promise;
  addEmailSuppression(suppression: InsertSuppressionEmail): Promise;
  deleteEmailSuppression(id: number): Promise;
  isEmailSuppressed(email: string): Promise;
  checkEmailSuppressionBulk(emails: string[]): Promise>;
  getPhoneSuppressions(): Promise;
  addPhoneSuppression(suppression: InsertSuppressionPhone): Promise;
  deletePhoneSuppression(id: number): Promise;
  isPhoneSuppressed(phoneE164: string): Promise;
  checkPhoneSuppressionBulk(phonesE164: string[]): Promise>;

  // Campaign Orders
  getCampaignOrders(filters?: any): Promise;
  getCampaignOrder(id: string): Promise;
  createCampaignOrder(order: InsertCampaignOrder): Promise;
  updateCampaignOrder(id: string, order: Partial): Promise;

  // Order Campaign Links (Bridge Model)
  getOrderCampaignLinks(orderId: string): Promise;
  createOrderCampaignLink(link: InsertOrderCampaignLink): Promise;
  deleteOrderCampaignLink(id: string): Promise;

  // Bulk Imports
  getBulkImports(): Promise;
  createBulkImport(bulkImport: InsertBulkImport): Promise;
  getBulkImport(id: string): Promise;
  updateBulkImport(id: string, bulkImport: Partial): Promise;

  // Email Messages
  createEmailMessage(message: InsertEmailMessage): Promise;
  getEmailMessagesByCampaign(campaignId: string): Promise;

  // Calls
  createCall(call: InsertCall): Promise;
  getCallsByCampaign(campaignId: string): Promise;

  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise;
  getAuditLogs(filters?: any): Promise;

  // Activity Logs
  createActivityLog(log: InsertActivityLog): Promise;
  getActivityLogs(
    entityType: 'contact' | 'account' | 'campaign' | 'call_job' | 'call_session' | 'lead' | 'user' | 'email_message',
    entityId: string,
    limit?: number
  ): Promise;

  // Saved Filters
  getSavedFilters(userId: string, entityType?: string): Promise;
  getSavedFilter(id: string, userId: string): Promise;
  createSavedFilter(filter: InsertSavedFilter): Promise;
  updateSavedFilter(id: string, userId: string, filter: Partial): Promise;
  deleteSavedFilter(id: string, userId: string): Promise;

  // Selection Contexts (for bulk operations)
  getSelectionContext(id: string, userId: string): Promise;
  createSelectionContext(context: InsertSelectionContext & { expiresAt: Date }): Promise;
  deleteSelectionContext(id: string, userId: string): Promise;
  deleteExpiredSelectionContexts(): Promise;

  // Filter Fields Registry
  getFilterFields(category?: string): Promise;
  getFilterFieldsByEntity(entity: string): Promise;

  // Industry Reference (Standardized Taxonomy)
  getIndustries(activeOnly?: boolean): Promise;
  searchIndustries(query: string, limit?: number): Promise;
  getIndustryById(id: string): Promise;

  // Company Size Reference (Standardized Employee Ranges)
  getCompanySizes(activeOnly?: boolean): Promise;
  getCompanySizeByCode(code: string): Promise;

  // Revenue Range Reference (Standardized Annual Revenue Brackets)
  getRevenueRanges(activeOnly?: boolean): Promise;
  getRevenueRangeByLabel(label: string): Promise;

  // Dual-Industry Management (Phase 8)
  updateAccountIndustry(id: string, data: { primary?: string; secondary?: string[]; code?: string }): Promise;
  reviewAccountIndustryAI(id: string, userId: string, review: { accept_primary?: string; add_secondary?: string[]; reject?: string[] }): Promise;
  getAccountsNeedingReview(limit?: number): Promise;

  // Domain Sets (Phase 21) - Renamed to Accounts List (TAL)
  getDomainSets(userId?: string): Promise;
  getDomainSet(id: string): Promise;
  createDomainSet(domainSet: InsertDomainSet): Promise;
  updateDomainSet(id: string, domainSet: Partial): Promise;
  deleteDomainSet(id: string): Promise;

  // Domain Set Items
  getDomainSetItems(domainSetId: string): Promise;
  createDomainSetItem(item: InsertDomainSetItem): Promise;
  createDomainSetItemsBulk(items: InsertDomainSetItem[]): Promise;
  updateDomainSetItem(id: string, item: Partial): Promise;

  // Domain Set Contact Links
  getDomainSetContactLinks(domainSetId: string): Promise;
  createDomainSetContactLink(link: InsertDomainSetContactLink): Promise;
  createDomainSetContactLinksBulk(links: InsertDomainSetContactLink[]): Promise;

  // Domain Set Operations
  processDomainSetMatching(domainSetId: string): Promise;
  expandDomainSetToContacts(domainSetId: string, filters?: any): Promise;
  convertDomainSetToList(domainSetId: string, listName: string, userId: string): Promise;

  // ==================== CONTENT STUDIO ====================
  getContentAssets(): Promise;
  getContentAsset(id: string): Promise;
  createContentAsset(data: InsertContentAsset & { ownerId: string }): Promise;
  updateContentAsset(id: string, data: Partial): Promise;
  deleteContentAsset(id: string): Promise;

  // ==================== SOCIAL POSTS ====================
  getSocialPosts(): Promise;
  getSocialPost(id: string): Promise;
  createSocialPost(data: InsertSocialPost): Promise;
  updateSocialPost(id: string, data: Partial): Promise;
  deleteSocialPost(id: string): Promise;

  // ==================== AI CONTENT GENERATION ====================
  createAIContentGeneration(data: InsertAIContentGeneration): Promise;
  getAIContentGenerations(userId?: string): Promise;

  // ==================== CONTENT PUSH TRACKING ====================
  createContentPush(data: InsertContentAssetPush): Promise;
  getContentPushes(assetId: string): Promise;
  getContentPush(id: string): Promise;
  updateContentPush(id: string, data: Partial): Promise;
  getLatestContentPush(assetId: string): Promise;

  // ==================== EVENTS ====================
  getEvents(): Promise;
  getEvent(id: string): Promise;
  getEventBySlug(slug: string): Promise;
  createEvent(data: InsertEvent): Promise;
  updateEvent(id: string, data: Partial): Promise;
  deleteEvent(id: string): Promise;

  // ==================== RESOURCES ====================
  getResources(): Promise;
  getResource(id: string): Promise;
  getResourceBySlug(slug: string): Promise;
  createResource(data: InsertResource): Promise;
  updateResource(id: string, data: Partial): Promise;
  deleteResource(id: string): Promise;

  // ==================== NEWS ====================
  getNews(): Promise;
  getNewsItem(id: string): Promise;
  getNewsBySlug(slug: string): Promise;
  createNews(data: InsertNews): Promise;
  updateNews(id: string, data: Partial): Promise;
  deleteNews(id: string): Promise;

  // ==================== EMAIL INFRASTRUCTURE (Phase 26) ====================

  // Sender Profiles
  getSenderProfiles(): Promise;
  getSenderProfile(id: string): Promise;
  createSenderProfile(profile: InsertSenderProfile): Promise;
  updateSenderProfile(id: string, profile: Partial): Promise;
  deleteSenderProfile(id: string): Promise;

  // Domain Authentication
  getDomainAuths(): Promise;
  getDomainAuth(id: number): Promise;
  getDomainAuthByDomain(domain: string): Promise;
  createDomainAuth(domainAuth: InsertDomainAuth): Promise;
  updateDomainAuth(id: number, domainAuth: Partial): Promise;
  deleteDomainAuth(id: number): Promise;
  verifyDomainAuth(id: number): Promise;

  // Tracking Domains
  getTrackingDomains(): Promise;
  getTrackingDomain(id: number): Promise;
  createTrackingDomain(trackingDomain: InsertTrackingDomain): Promise;
  updateTrackingDomain(id: number, trackingDomain: Partial): Promise;
  deleteTrackingDomain(id: number): Promise;

  // IP Pools
  getIpPools(): Promise;
  getIpPool(id: number): Promise;
  createIpPool(ipPool: InsertIpPool): Promise;
  updateIpPool(id: number, ipPool: Partial): Promise;
  deleteIpPool(id: number): Promise;

  // Send Policies
  getSendPolicies(): Promise;
  getSendPolicy(id: number): Promise;
  createSendPolicy(sendPolicy: InsertSendPolicy): Promise;
  updateSendPolicy(id: number, sendPolicy: Partial): Promise;
  deleteSendPolicy(id: number): Promise;

  // Pipelines & Opportunities
  listPipelines(): Promise;
  getPipeline(id: string): Promise;
  createPipeline(pipeline: InsertPipeline & { id?: string }): Promise;
  updatePipeline(id: string, pipeline: Partial): Promise;
  deletePipeline(id: string): Promise;
  listPipelineOpportunities(
    pipelineId: string,
  ): Promise>;
  getPipelineOpportunity(id: string): Promise;
  createPipelineOpportunity(opportunity: InsertPipelineOpportunity & { id?: string }): Promise;
  updatePipelineOpportunity(
    id: string,
    opportunity: Partial,
  ): Promise;
  deletePipelineOpportunity(id: string): Promise;
  getOpportunitiesByAccountId(accountId: string): Promise>;
  getOpportunitiesByContactId(contactId: string): Promise>;

  // Mailbox Accounts
  getMailboxAccount(userId: string, provider: string): Promise;
  getMailboxAccountById(id: string): Promise;
  getAllMailboxAccounts(provider?: string): Promise;
  getMailboxAccountsByUserId(userId: string): Promise;
  createMailboxAccount(account: InsertMailboxAccount & { id?: string }): Promise;
  updateMailboxAccount(id: string, account: Partial): Promise;
  
  // M365 Activities
  getM365Activities(mailboxAccountId: string, options?: { limit?: number; accountId?: string; contactId?: string }): Promise;
  getM365Activity(id: string): Promise;
  getM365ActivityByMessageId(mailboxAccountId: string, messageId: string): Promise;
  createM365Activity(activity: InsertM365Activity): Promise;
  createM365ActivitiesBulk(activities: InsertM365Activity[]): Promise;
  updateM365Activity(id: string, activity: Partial): Promise;
  getActivitiesByAccount(accountId: string, limit?: number): Promise;
  getActivitiesByContact(contactId: string, limit?: number): Promise;

  // Deal Conversations & Messages
  getDealConversations(opportunityId: string, options?: { limit?: number }): Promise;
  getDealConversation(id: string): Promise;
  getDealConversationByThreadId(threadId: string, opportunityId: string): Promise;
  createDealConversation(conversation: InsertDealConversation & { id?: string }): Promise;
  updateDealConversation(id: string, conversation: Partial): Promise;
  
  getDealMessages(conversationId: string, options?: { limit?: number }): Promise;
  getDealMessage(id: string): Promise;
  getDealMessageByM365Id(m365MessageId: string): Promise;
  createDealMessage(message: InsertDealMessage & { id?: string }): Promise;
  updateDealMessage(id: string, message: Partial): Promise;
  getOpportunityMessages(opportunityId: string, options?: { limit?: number }): Promise;
  
  getOpportunitiesByContactIds(contactIds: string[]): Promise;

  // Email Sequences
  getEmailSequences(): Promise;
  getEmailSequence(id: string): Promise;
  createEmailSequence(sequence: InsertEmailSequence & { id?: string }): Promise;
  updateEmailSequence(id: string, data: Partial): Promise;
  deleteEmailSequence(id: string): Promise;
  
  // Sequence Steps
  getSequenceSteps(sequenceId: string): Promise;
  getSequenceStep(id: string): Promise;
  createSequenceStep(step: InsertSequenceStep & { id?: string }): Promise;
  updateSequenceStep(id: string, data: Partial): Promise;
  deleteSequenceStep(id: string): Promise;
  
  // Sequence Enrollments
  getSequenceEnrollments(sequenceId?: string, contactId?: string): Promise;
  getSequenceEnrollment(id: string): Promise;
  createSequenceEnrollment(enrollment: InsertSequenceEnrollment & { id?: string }): Promise;
  updateSequenceEnrollment(id: string, data: Partial): Promise;
  stopSequenceEnrollment(id: string, reason: string): Promise;
  getActiveEnrollmentForContact(sequenceId: string, contactId: string): Promise;

  // Auto-dialer Queues
  getAllAutoDialerQueues(activeOnly?: boolean): Promise;
  getAutoDialerQueue(campaignId: string): Promise;

  // OI Batch Pipeline
  createOiBatchJob(data: InsertOiBatchJob): Promise;
  getOiBatchJob(id: string): Promise;
  updateOiBatchJob(id: string, data: Partial): Promise;
  listOiBatchJobs(limit?: number, offset?: number): Promise;
}

export class DatabaseStorage implements IStorage {
  private campaignTimezonePriorityColumnReady = false;
  private campaignArchivedColumnReady = false;
  private ensureCampaignTimezonePriorityColumnPromise: Promise | null = null;
  private ensureCampaignArchivedColumnPromise: Promise | null = null;

  private isMissingTimezonePriorityConfigColumnError(error: unknown): boolean {
    const dbError = error as { code?: string; message?: string } | undefined;
    return dbError?.code === "42703" && String(dbError?.message || "").includes("timezone_priority_config");
  }

  private isMissingCampaignArchivedColumnError(error: unknown): boolean {
    const dbError = error as { code?: string; message?: string } | undefined;
    return dbError?.code === "42703" && String(dbError?.message || "").includes("is_archived");
  }

  private async ensureCampaignTimezonePriorityColumn(): Promise {
    if (this.campaignTimezonePriorityColumnReady) {
      return;
    }

    if (!this.ensureCampaignTimezonePriorityColumnPromise) {
      this.ensureCampaignTimezonePriorityColumnPromise = (async () => {
        await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS timezone_priority_config jsonb`);
        this.campaignTimezonePriorityColumnReady = true;
        console.warn("[DB] Added missing campaigns.timezone_priority_config column on demand.");
      })().finally(() => {
        this.ensureCampaignTimezonePriorityColumnPromise = null;
      });
    }

    await this.ensureCampaignTimezonePriorityColumnPromise;
  }

  private async ensureCampaignArchivedColumn(): Promise {
    if (this.campaignArchivedColumnReady) {
      return;
    }

    if (!this.ensureCampaignArchivedColumnPromise) {
      this.ensureCampaignArchivedColumnPromise = (async () => {
        await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false`);
        this.campaignArchivedColumnReady = true;
        console.warn("[DB] Added missing campaigns.is_archived column on demand.");
      })().finally(() => {
        this.ensureCampaignArchivedColumnPromise = null;
      });
    }

    await this.ensureCampaignArchivedColumnPromise;
  }

  // Users
  async getUser(id: string): Promise {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUsers(): Promise {
    return await db.select().from(users);
  }

  async getUserByUsername(username: string): Promise {
    const [user] = await db.select().from(users).where(
      or(eq(users.username, username), eq(users.email, username))
    );
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updateData: Partial): Promise {
    const [user] = await db
      .update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  // User Roles (Multi-role support)
  async getUserRoles(userId: string): Promise {
    const roles = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return roles.map(r => r.role);
  }

  async assignUserRole(userId: string, role: string, assignedBy?: string): Promise {
    try {
      await db.insert(userRoles).values({
        userId,
        role: role as any, // Cast to enum type
        assignedBy,
      });
    } catch (error) {
      // Ignore duplicate role assignment errors due to unique index
      console.log(`Role ${role} already assigned to user ${userId}`);
    }
  }

  async removeUserRole(userId: string, role: string): Promise {
    await db.delete(userRoles).where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.role, role as any) // Cast to enum type
      )
    );
  }

  async updateUserRoles(userId: string, roles: string[], assignedBy?: string): Promise {
    // Remove all existing roles
    await db.delete(userRoles).where(eq(userRoles.userId, userId));

    // Insert new roles
    if (roles.length > 0) {
      await db.insert(userRoles).values(
        roles.map(role => ({
          userId,
          role: role as any, // Cast to enum type
          assignedBy,
        }))
      );
    }
  }

  async getAllUsersWithRoles(): Promise> {
    const allUsers = await db.select({
      id: users.id,
      username: users.username,
    }).from(users);

    const result = [];
    for (const user of allUsers) {
      const roles = await this.getUserRoles(user.id);
      result.push({
        id: user.id,
        username: user.username,
        roles,
      });
    }

    return result;
  }

  // Accounts
  async getAccounts(filters?: FilterGroup, limit?: number): Promise {
    let query = db.select().from(accounts);

    if (filters) {
      const filterCondition = buildFilterQuery(filters, accounts);
      if (filterCondition) {
        query = query.where(filterCondition) as any;
      }
    }

    const orderedQuery = query.orderBy(desc(accounts.createdAt));
    return limit ? await orderedQuery.limit(limit) : await orderedQuery;
  }

  async getAccountsCount(filters?: FilterGroup): Promise {
    let query = db.select({ count: sql`count(*)::int` }).from(accounts);

    if (filters) {
      const filterCondition = buildFilterQuery(filters, accounts);
      if (filterCondition) {
        query = query.where(filterCondition) as any;
      }
    }

    const result = await query;
    return result[0]?.count || 0;
  }

  async getAccount(id: string): Promise {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account || undefined;
  }

  async getAccountsByIds(ids: string[]): Promise {
    if (ids.length === 0) return [];
    return await db.select().from(accounts).where(inArray(accounts.id, ids));
  }

  async getAccountByDomain(domain: string): Promise {
    const [account] = await db.select().from(accounts).where(eq(accounts.domain, domain));
    return account || undefined;
  }

  async getAccountsByDomains(domains: string[]): Promise {
    if (domains.length === 0) return [];
    return await db.select().from(accounts).where(inArray(accounts.domain, domains));
  }

  async createAccount(insertAccount: InsertAccount): Promise {
    const [account] = await db.insert(accounts).values(insertAccount).returning();
    return account;
  }

  async createAccountsBulk(insertAccounts: InsertAccount[]): Promise {
    if (insertAccounts.length === 0) return [];
    return await db.insert(accounts).values(insertAccounts).returning();
  }

  async updateAccount(id: string, updateData: Partial): Promise {
    const [account] = await db
      .update(accounts)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(accounts.id, id))
      .returning();
    return account || undefined;
  }

  async deleteAccount(id: string): Promise {
    await db.delete(accounts).where(eq(accounts.id, id));
  }

  // Contacts
  async getContacts(filters?: FilterGroup, limit?: number): Promise {
    let query = db.select().from(contacts);

    if (filters) {
      const filterCondition = buildFilterQuery(filters, contacts);
      if (filterCondition) {
        query = query.where(filterCondition) as any;
      }
    }

    const orderedQuery = query.orderBy(desc(contacts.createdAt));
    return limit ? await orderedQuery.limit(limit) : await orderedQuery;
  }

  async getContactsCount(filters?: FilterGroup): Promise {
    let query = db.select({ count: sql`count(*)::int` }).from(contacts);

    if (filters) {
      const filterCondition = buildFilterQuery(filters, contacts);
      if (filterCondition) {
        query = query.where(filterCondition) as any;
      }
    }

    const result = await query;
    return result[0]?.count || 0;
  }

  async getContact(id: string): Promise {
    const result = await db
      .select()
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(contacts.id, id));

    if (!result || result.length === 0) {
      return undefined;
    }

    const row = result[0];
    return {
      ...row.contacts,
      // Include HQ phone data for phone prioritization logic
      hqPhone: row.accounts?.mainPhone,
      hqPhoneE164: row.accounts?.mainPhoneE164,
      hqCountry: row.accounts?.hqCountry,
      account: row.accounts ? {
        id: row.accounts.id,
        name: row.accounts.name,
        industryStandardized: row.accounts.industryStandardized,
        mainPhone: row.accounts.mainPhone,
        mainPhoneE164: row.accounts.mainPhoneE164,
        hqCountry: row.accounts.hqCountry,
      } : undefined
    } as any;
  }

  async getContactsByAccountId(accountId: string): Promise {
    return await db.select().from(contacts).where(eq(contacts.accountId, accountId));
  }

  async getContactsByIds(ids: string[]): Promise {
    if (ids.length === 0) {
      return [];
    }
    // Batch large arrays to avoid PostgreSQL parameter limits
    if (ids.length  {
    if (emails.length === 0) return [];
    // Normalize emails for comparison (lowercase, trim)
    const normalizedEmails = emails.map(e => e.toLowerCase().trim());
    return await db.select().from(contacts).where(inArray(contacts.emailNormalized, normalizedEmails));
  }

  async createContact(insertContact: InsertContact): Promise {
    const [contact] = await db.insert(contacts).values(insertContact).returning();
    return contact;
  }

  async createContactsBulk(insertContacts: InsertContact[]): Promise {
    if (insertContacts.length === 0) return [];
    return await db.insert(contacts).values(insertContacts).returning();
  }

  async updateContact(id: string, updateData: Partial): Promise {
    const [contact] = await db
      .update(contacts)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();
    return contact || undefined;
  }

  async deleteContact(id: string): Promise {
    await db.delete(contacts).where(eq(contacts.id, id));
  }

  // Custom Field Definitions
  async getCustomFieldDefinitions(entityType?: 'account' | 'contact'): Promise {
    if (entityType) {
      const definitions = await db
        .select()
        .from(customFieldDefinitions)
        .where(and(
          eq(customFieldDefinitions.active, true),
          eq(customFieldDefinitions.entityType, entityType)
        ))
        .orderBy(customFieldDefinitions.displayOrder);
      return definitions;
    } else {
      const definitions = await db
        .select()
        .from(customFieldDefinitions)
        .where(eq(customFieldDefinitions.active, true))
        .orderBy(customFieldDefinitions.displayOrder);
      return definitions;
    }
  }

  async getCustomFieldDefinition(id: string): Promise {
    const [definition] = await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.id, id));
    return definition || undefined;
  }

  async createCustomFieldDefinition(insertData: InsertCustomFieldDefinition): Promise {
    const [definition] = await db
      .insert(customFieldDefinitions)
      .values(insertData)
      .returning();
    return definition;
  }

  async updateCustomFieldDefinition(id: string, updateData: Partial): Promise {
    const [definition] = await db
      .update(customFieldDefinitions)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(customFieldDefinitions.id, id))
      .returning();
    return definition || undefined;
  }

  async deleteCustomFieldDefinition(id: string): Promise {
    // Soft delete by setting active to false
    await db
      .update(customFieldDefinitions)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(customFieldDefinitions.id, id));
  }

  async upsertContact(data: Partial & { email: string }, options?: {
    sourceSystem?: string,
    sourceRecordId?: string,
    sourceUpdatedAt?: Date,
    actorId?: string
  }): Promise {
    const { normalizeEmail, normalizePhoneE164 } = await import('./normalization.js');

    // Normalize business keys
    const emailNormalized = normalizeEmail(data.email);

    // Deterministic lookup: find by normalized email
    const [existing] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.emailNormalized, emailNormalized),
          isNull(contacts.deletedAt)
        )
      )
      .limit(1);

    if (existing) {
      // UPDATE: Apply field-level survivorship with audit logging
      const updates: Partial = {
        emailNormalized,
        sourceSystem: options?.sourceSystem,
        sourceRecordId: options?.sourceRecordId,
        sourceUpdatedAt: options?.sourceUpdatedAt,
        updatedAt: new Date()
      };

      const changeLogs: any[] = [];

      // Survivorship: prefer new if not null, otherwise keep existing
      const fieldsToUpdate = [
        'fullName', 'firstName', 'lastName', 'jobTitle', 'email',
        'directPhone', 'phoneExtension', 'seniorityLevel', 'department',
        'address', 'linkedinUrl', 'consentBasis', 'consentSource', 'accountId'
      ];

      for (const field of fieldsToUpdate) {
        if (data[field as keyof typeof data] !== undefined && data[field as keyof typeof data] !== null) {
          const newValue = data[field as keyof typeof data];
          const oldValue = (existing as any)[field];

          if (newValue !== oldValue) {
            (updates as any)[field] = newValue;

            // Log field change
            changeLogs.push({
              entityType: 'contact',
              entityId: existing.id,
              fieldKey: field,
              oldValue: oldValue,
              newValue: newValue,
              sourceSystem: options?.sourceSystem || null,
              actorId: options?.actorId || null,
              survivorshipPolicy: 'prefer_new_if_not_null'
            });
          }
        }
      }

      // Union for array fields (tags, intentTopics)
      if (data.tags && data.tags.length > 0) {
        const existingTags = existing.tags || [];
        const newTags = Array.from(new Set([...existingTags, ...data.tags]));
        if (JSON.stringify(existingTags.sort()) !== JSON.stringify(newTags.sort())) {
          updates.tags = newTags;
          changeLogs.push({
            entityType: 'contact',
            entityId: existing.id,
            fieldKey: 'tags',
            oldValue: existingTags,
            newValue: newTags,
            sourceSystem: options?.sourceSystem || null,
            actorId: options?.actorId || null,
            survivorshipPolicy: 'union'
          });
        }
      }

      if (data.intentTopics && data.intentTopics.length > 0) {
        const existingTopics = existing.intentTopics || [];
        const newTopics = Array.from(new Set([...existingTopics, ...data.intentTopics]));
        if (JSON.stringify(existingTopics.sort()) !== JSON.stringify(newTopics.sort())) {
          updates.intentTopics = newTopics;
          changeLogs.push({
            entityType: 'contact',
            entityId: existing.id,
            fieldKey: 'intentTopics',
            oldValue: existingTopics,
            newValue: newTopics,
            sourceSystem: options?.sourceSystem || null,
            actorId: options?.actorId || null,
            survivorshipPolicy: 'union'
          });
        }
      }

      // Custom fields: merge
      if (data.customFields) {
        const mergedCustomFields = { ...existing.customFields as any, ...data.customFields as any };
        updates.customFields = mergedCustomFields;
        changeLogs.push({
          entityType: 'contact',
          entityId: existing.id,
          fieldKey: 'customFields',
          oldValue: existing.customFields,
          newValue: mergedCustomFields,
          sourceSystem: options?.sourceSystem || null,
          actorId: options?.actorId || null,
          survivorshipPolicy: 'merge'
        });
      }

      // Normalize phone if provided
      if (data.directPhone) {
        const e164 = normalizePhoneE164(data.directPhone);
        if (e164 && e164 !== existing.directPhoneE164) {
          updates.directPhoneE164 = e164;
          changeLogs.push({
            entityType: 'contact',
            entityId: existing.id,
            fieldKey: 'directPhoneE164',
            oldValue: existing.directPhoneE164,
            newValue: e164,
            sourceSystem: options?.sourceSystem || null,
            actorId: options?.actorId || null,
            survivorshipPolicy: 'prefer_new_normalized'
          });
        }
      }

      // Write change logs if there are any changes
      if (changeLogs.length > 0) {
        await db.insert(fieldChangeLog).values(changeLogs);
      }

      const [updated] = await db
        .update(contacts)
        .set(updates)
        .where(eq(contacts.id, existing.id))
        .returning();

      return { contact: updated, action: 'updated' };
    } else {
      // CREATE: New contact
      // Compute fullName if not provided
      const fullName = data.fullName || 
        (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : 
         data.firstName || data.lastName || data.email);

      const insertData: InsertContact = {
        ...data,
        fullName,
        emailNormalized,
        sourceSystem: options?.sourceSystem,
        sourceRecordId: options?.sourceRecordId,
        sourceUpdatedAt: options?.sourceUpdatedAt
      } as InsertContact;

      // Normalize phone if provided
      if (data.directPhone) {
        const e164 = normalizePhoneE164(data.directPhone);
        if (e164) {
          insertData.directPhoneE164 = e164;
        }
      }

      const [created] = await db.insert(contacts).values(insertData).returning();
      return { contact: created, action: 'created' };
    }
  }

  async upsertAccount(data: Partial & { name: string }, options?: {
    sourceSystem?: string,
    sourceRecordId?: string,
    sourceUpdatedAt?: Date,
    actorId?: string
  }): Promise {
    const { normalizeDomain, normalizeName, normalizePhoneE164 } = await import('./normalization.js');

    // Normalize business keys
    const nameNormalized = normalizeName(data.name);
    const domainNormalized = data.domain ? normalizeDomain(data.domain) : null;

    // Deterministic lookup: prefer domain, fallback to name+geo
    let existing: Account | undefined;

    if (domainNormalized) {
      [existing] = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.domainNormalized, domainNormalized)
          )
        )
        .limit(1);
    }

    // Fallback: match by name + city + country if no domain match
    if (!existing && data.hqCity && data.hqCountry) {
      [existing] = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.nameNormalized, nameNormalized),
            eq(accounts.hqCity, data.hqCity),
            eq(accounts.hqCountry, data.hqCountry),
            isNull(accounts.domainNormalized)
          )
        )
        .limit(1);
    }

    if (existing) {
      // UPDATE: Apply field-level survivorship with audit logging
      const updates: Partial = {
        nameNormalized,
        domainNormalized: domainNormalized || existing.domainNormalized,
        sourceSystem: options?.sourceSystem,
        sourceRecordId: options?.sourceRecordId,
        sourceUpdatedAt: options?.sourceUpdatedAt,
        updatedAt: new Date()
      };

      const changeLogs: any[] = [];

      // Survivorship: prefer new if not null
      const fieldsToUpdate = [
        'name', 'domain', 'industry', 'annualRevenue', 'employeesSizeRange',
        'staffCount', 'description', 'hqAddress', 'hqCity', 'hqState', 'hqCountry',
        'yearFounded', 'sicCode', 'naicsCode', 'linkedinUrl', 'mainPhone',
        'mainPhoneExtension', 'ownerId'
      ];

      for (const field of fieldsToUpdate) {
        if (data[field as keyof typeof data] !== undefined && data[field as keyof typeof data] !== null) {
          const newValue = data[field as keyof typeof data];
          const oldValue = (existing as any)[field];

          if (newValue !== oldValue) {
            (updates as any)[field] = newValue;

            changeLogs.push({
              entityType: 'account',
              entityId: existing.id,
              fieldKey: field,
              oldValue: oldValue,
              newValue: newValue,
              sourceSystem: options?.sourceSystem || null,
              actorId: options?.actorId || null,
              survivorshipPolicy: 'prefer_new_if_not_null'
            });
          }
        }
      }

      // Union for array fields
      if (data.tags && data.tags.length > 0) {
        const existingTags = existing.tags || [];
        const newTags = Array.from(new Set([...existingTags, ...data.tags]));
        if (JSON.stringify(existingTags.sort()) !== JSON.stringify(newTags.sort())) {
          updates.tags = newTags;
          changeLogs.push({
            entityType: 'account',
            entityId: existing.id,
            fieldKey: 'tags',
            oldValue: existingTags,
            newValue: newTags,
            sourceSystem: options?.sourceSystem || null,
            actorId: options?.actorId || null,
            survivorshipPolicy: 'union'
          });
        }
      }

      if (data.intentTopics && data.intentTopics.length > 0) {
        const existingTopics = existing.intentTopics || [];
        const newTopics = Array.from(new Set([...existingTopics, ...data.intentTopics]));
        if (JSON.stringify(existingTopics.sort()) !== JSON.stringify(newTopics.sort())) {
          updates.intentTopics = newTopics;
          changeLogs.push({
            entityType: 'account',
            entityId: existing.id,
            fieldKey: 'intentTopics',
            oldValue: existingTopics,
            newValue: newTopics,
            sourceSystem: options?.sourceSystem || null,
            actorId: options?.actorId || null,
            survivorshipPolicy: 'union'
          });
        }
      }

      if (data.techStack && data.techStack.length > 0) {
        const existingTech = existing.techStack || [];
        const newTech = Array.from(new Set([...existingTech, ...data.techStack]));
        if (JSON.stringify(existingTech.sort()) !== JSON.stringify(newTech.sort())) {
          updates.techStack = newTech;
          changeLogs.push({
            entityType: 'account',
            entityId: existing.id,
            fieldKey: 'techStack',
            oldValue: existingTech,
            newValue: newTech,
            sourceSystem: options?.sourceSystem || null,
            actorId: options?.actorId || null,
            survivorshipPolicy: 'union'
          });
        }
      }

      if (data.linkedinSpecialties && data.linkedinSpecialties.length > 0) {
        const existingSpec = existing.linkedinSpecialties || [];
        const newSpec = Array.from(new Set([...existingSpec, ...data.linkedinSpecialties]));
        if (JSON.stringify(existingSpec.sort()) !== JSON.stringify(newSpec.sort())) {
          updates.linkedinSpecialties = newSpec;
          changeLogs.push({
            entityType: 'account',
            entityId: existing.id,
            fieldKey: 'linkedinSpecialties',
            oldValue: existingSpec,
            newValue: newSpec,
            sourceSystem: options?.sourceSystem || null,
            actorId: options?.actorId || null,
            survivorshipPolicy: 'union'
          });
        }
      }

      // Custom fields: merge
      if (data.customFields) {
        const mergedCustomFields = { ...existing.customFields as any, ...data.customFields as any };
        updates.customFields = mergedCustomFields;
        changeLogs.push({
          entityType: 'account',
          entityId: existing.id,
          fieldKey: 'customFields',
          oldValue: existing.customFields,
          newValue: mergedCustomFields,
          sourceSystem: options?.sourceSystem || null,
          actorId: options?.actorId || null,
          survivorshipPolicy: 'merge'
        });
      }

      // Normalize phone if provided
      if (data.mainPhone) {
        const e164 = normalizePhoneE164(data.mainPhone);
        if (e164 && e164 !== existing.mainPhoneE164) {
          updates.mainPhoneE164 = e164;
          changeLogs.push({
            entityType: 'account',
            entityId: existing.id,
            fieldKey: 'mainPhoneE164',
            oldValue: existing.mainPhoneE164,
            newValue: e164,
            sourceSystem: options?.sourceSystem || null,
            actorId: options?.actorId || null,
            survivorshipPolicy: 'prefer_new_normalized'
          });
        }
      }

      // Write change logs if there are any changes
      if (changeLogs.length > 0) {
        await db.insert(fieldChangeLog).values(changeLogs);
      }

      const [updated] = await db
        .update(accounts)
        .set(updates)
        .where(eq(accounts.id, existing.id))
        .returning();

      return { account: updated, action: 'updated' };
    } else {
      // CREATE: New account
      const insertData: InsertAccount = {
        ...data,
        nameNormalized,
        domainNormalized: domainNormalized || undefined,
        sourceSystem: options?.sourceSystem,
        sourceRecordId: options?.sourceRecordId,
        sourceUpdatedAt: options?.sourceUpdatedAt
      } as InsertAccount;

      // Normalize phone if provided
      if (data.mainPhone) {
        const e164 = normalizePhoneE164(data.mainPhone);
        if (e164) {
          insertData.mainPhoneE164 = e164;
        }
      }

      const [created] = await db.insert(accounts).values(insertData).returning();
      return { account: created, action: 'created' };
    }
  }

  // Campaigns
  async getCampaigns(filters?: any): Promise {
    const conditions: any[] = [];

    if (filters?.status) {
      conditions.push(eq(campaigns.status, filters.status));
    }

    if (filters?.dialMode) {
      conditions.push(eq(campaigns.dialMode, filters.dialMode));
    }

    if (filters?.type) {
      conditions.push(eq(campaigns.type, filters.type));
    }

    const runQuery = async (): Promise => {
      const query = db.select().from(campaigns);

      if (conditions.length > 0) {
        return await query.where(and(...conditions)).orderBy(desc(campaigns.createdAt));
      }

      return await query.orderBy(desc(campaigns.createdAt));
    };

    try {
      return await runQuery();
    } catch (error) {
      if (this.isMissingTimezonePriorityConfigColumnError(error)) {
        await this.ensureCampaignTimezonePriorityColumn();
        return await runQuery();
      }

      if (this.isMissingCampaignArchivedColumnError(error)) {
        await this.ensureCampaignArchivedColumn();
        return await runQuery();
      }

      if (!this.isMissingTimezonePriorityConfigColumnError(error)) {
        throw error;
      }

      return await runQuery();
    }
  }

  async getCampaign(id: string): Promise {
    const runQuery = async () => {
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
      return campaign || undefined;
    };

    try {
      return await runQuery();
    } catch (error) {
      if (this.isMissingTimezonePriorityConfigColumnError(error)) {
        await this.ensureCampaignTimezonePriorityColumn();
        return await runQuery();
      }

      if (this.isMissingCampaignArchivedColumnError(error)) {
        await this.ensureCampaignArchivedColumn();
        return await runQuery();
      }

      if (!this.isMissingTimezonePriorityConfigColumnError(error)) {
        throw error;
      }

      return await runQuery();
    }
  }

  async createCampaign(insertCampaign: InsertCampaign): Promise {
    // Auto-generate qaParameters and campaignContextBrief from wizard context if not set
    const enriched = enrichCampaignQADefaults(insertCampaign);
    const [campaign] = await db.insert(campaigns).values(enriched).returning();
    return campaign;
  }

  async updateCampaign(id: string, updateData: Partial): Promise {
    const runQuery = async () => {
      const [campaign] = await db
        .update(campaigns)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(campaigns.id, id))
        .returning();
      return campaign || undefined;
    };

    try {
      return await runQuery();
    } catch (error) {
      if (this.isMissingCampaignArchivedColumnError(error)) {
        await this.ensureCampaignArchivedColumn();
        return await runQuery();
      }

      throw error;
    }
  }

  async deleteCampaign(id: string): Promise {
    await db.delete(campaigns).where(eq(campaigns.id, id));
  }

  // Campaign Agent Assignments
  async listAgents(): Promise> {
    // Get all users with agent role (including those from legacy role field)
    const agentRoleUsers = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.role, 'agent'));

    const agentIds = agentRoleUsers.map(r => r.userId);

    // Also get users with legacy 'agent' role
    const legacyAgents = await db
      .select()
      .from(users)
      .where(eq(users.role, 'agent'));

    // Combine both sets of agent IDs
    const allAgentIds = Array.from(new Set([
      ...agentIds,
      ...legacyAgents.map(u => u.id)
    ]));

    if (allAgentIds.length === 0) {
      return [];
    }

    // Get all agents with their current active assignments
    const agents = await db
      .select({
        user: users,
        assignment: campaignAgentAssignments,
        campaign: campaigns,
      })
      .from(users)
      .leftJoin(
        campaignAgentAssignments, 
        and(
          eq(users.id, campaignAgentAssignments.agentId),
          eq(campaignAgentAssignments.isActive, true)
        )
      )
      .leftJoin(campaigns, eq(campaignAgentAssignments.campaignId, campaigns.id))
      .where(inArray(users.id, allAgentIds));

    return agents.map(row => ({
      ...row.user,
      currentAssignment: row.assignment && row.campaign ? {
        campaignId: row.campaign.id,
        campaignName: row.campaign.name,
      } : undefined
    }));
  }

  async getCampaignAgentAssignments(campaignId: string): Promise {
    return await db
      .select()
      .from(campaignAgentAssignments)
      .where(
        and(
          eq(campaignAgentAssignments.campaignId, campaignId),
          eq(campaignAgentAssignments.isActive, true)
        )
      );
  }

  async listActiveAgentAssignments(): Promise> {
    const assignments = await db
      .select({
        assignment: campaignAgentAssignments,
        agent: users,
        campaign: campaigns,
      })
      .from(campaignAgentAssignments)
      .innerJoin(users, eq(campaignAgentAssignments.agentId, users.id))
      .innerJoin(campaigns, eq(campaignAgentAssignments.campaignId, campaigns.id))
      .where(eq(campaignAgentAssignments.isActive, true));

    return assignments.map(row => ({
      ...row.assignment,
      agentName: `${row.agent.firstName || ''} ${row.agent.lastName || ''}`.trim() || row.agent.username,
      campaignName: row.campaign.name,
    }));
  }

  async assignAgentsToCampaign(campaignId: string, agentIds: string[], assignedBy: string): Promise {
    // ATOMIC TRANSACTION: Fully replace active assignments for this campaign
    // This ensures GET queries always reflect the exact list provided in the latest POST
    await db.transaction(async (tx) => {
      console.log(`[ASSIGN AGENTS] Starting transaction for campaign ${campaignId}, ${agentIds.length} agents`);
      
      // STEP 1: Deactivate ALL current active assignments for this campaign
      // This ensures removed agents are properly deactivated
      const deactivated = await tx
        .update(campaignAgentAssignments)
        .set({
          isActive: false,
          releasedAt: new Date()
        })
        .where(
          and(
            eq(campaignAgentAssignments.campaignId, campaignId),
            eq(campaignAgentAssignments.isActive, true)
          )
        )
        .returning({ agentId: campaignAgentAssignments.agentId });
      
      console.log(`[ASSIGN AGENTS] Deactivated ${deactivated.length} existing assignments`);

      // STEP 2: Activate (create or reactivate) only the provided agents
      for (const agentId of agentIds) {
        // Check if assignment record exists (active or inactive)
        const [existingAssignment] = await tx
          .select()
          .from(campaignAgentAssignments)
          .where(
            and(
              eq(campaignAgentAssignments.agentId, agentId),
              eq(campaignAgentAssignments.campaignId, campaignId)
            )
          );

        if (existingAssignment) {
          // Reactivate existing record
          await tx
            .update(campaignAgentAssignments)
            .set({
              isActive: true,
              assignedBy,
              assignedAt: new Date(),
              releasedAt: null
            })
            .where(
              and(
                eq(campaignAgentAssignments.campaignId, campaignId),
                eq(campaignAgentAssignments.agentId, agentId)
              )
            );
        } else {
          // Create new assignment
          await tx.insert(campaignAgentAssignments).values({
            campaignId,
            agentId,
            assignedBy,
            isActive: true,
          });
        }
      }

      console.log(`[ASSIGN AGENTS] Activated ${agentIds.length} agent assignments`);

      // STEP 3: Release and redistribute queue items from deactivated agents
      // Handles both manual dial (agentQueue) and power dial (campaignQueue)
      // Use FOR UPDATE to prevent concurrent races

      // Get list of deactivated agent IDs (agents who were active but are not in the new list)
      const deactivatedAgentIds = deactivated
        .map(d => d.agentId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0 && !agentIds.includes(id));

      console.log(`[ASSIGN AGENTS] Deactivated agents: ${deactivatedAgentIds.length}`);

      // ONLY redistribute if agents were actually removed
      // If we're just adding new agents, existing contacts should stay with their current agents
      if (deactivatedAgentIds.length > 0) {
        console.log(`[ASSIGN AGENTS] Redistributing queue items because agents were removed`);

        // Check campaign dial mode to determine which queue to handle
        const [campaign] = await tx
          .select({ dialMode: campaigns.dialMode })
          .from(campaigns)
          .where(eq(campaigns.id, campaignId))
          .limit(1);

        const dialMode = campaign?.dialMode || 'manual';

        if (dialMode === 'manual') {
          // MANUAL MODE: Delete items from deactivated agents and re-insert with new agents
          // agent_queue has NOT NULL constraint on agent_id, so we can't just set it to null
          
          // Step 3A: Fetch queue items from deactivated agents to redistribute
          const itemsToRedistribute = await tx
            .select({
              id: agentQueue.id,
              contactId: agentQueue.contactId,
              accountId: agentQueue.accountId,
              dialedNumber: agentQueue.dialedNumber,
              priority: agentQueue.priority,
              queueState: agentQueue.queueState,
              scheduledFor: agentQueue.scheduledFor,
              enqueuedBy: agentQueue.enqueuedBy,
              enqueuedReason: agentQueue.enqueuedReason,
            })
            .from(agentQueue)
            .where(
              and(
                eq(agentQueue.campaignId, campaignId),
                inArray(agentQueue.agentId, deactivatedAgentIds)
                // Get all items from deactivated agents
              )
            );

          console.log(`[ASSIGN AGENTS] [MANUAL] Found ${itemsToRedistribute.length} queue items from deactivated agents`);

          if (itemsToRedistribute.length > 0 && agentIds.length > 0) {
            // Step 3B: Delete items from deactivated agents
            const deleted = await tx
              .delete(agentQueue)
              .where(
                and(
                  eq(agentQueue.campaignId, campaignId),
                  inArray(agentQueue.agentId, deactivatedAgentIds)
                )
              )
              .returning({ id: agentQueue.id });

            console.log(`[ASSIGN AGENTS] [MANUAL] Deleted ${deleted.length} queue items from deactivated agents`);

            // Step 3C: Re-insert items with new agents assigned round-robin
            const newQueueItems = itemsToRedistribute.map((item, index) => ({
              agentId: agentIds[index % agentIds.length], // Round-robin assignment
              campaignId,
              contactId: item.contactId,
              accountId: item.accountId,
              dialedNumber: item.dialedNumber,
              queueState: 'queued' as const, // Reset to queued
              priority: item.priority,
              scheduledFor: item.scheduledFor,
              enqueuedBy: item.enqueuedBy,
              enqueuedReason: item.enqueuedReason,
              lockedBy: null,
              lockedAt: null,
              lockVersion: 0,
              lockExpiresAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

            await tx.insert(agentQueue).values(newQueueItems);

            console.log(`[ASSIGN AGENTS] [MANUAL] Re-inserted ${newQueueItems.length} queue items with new agents`);
          }
        } else if (dialMode === 'hybrid') {
          // HYBRID MODE: Same as power (shared queue with humans + AI), release items from deactivated agents, then redistribute all available items
          
          // Step 3A: Release ALL queue items from deactivated agents (regardless of status)
          const released = await tx
            .update(campaignQueue)
            .set({
              status: 'queued', // Reset status back to queued
              agentId: null, // campaignQueue uses agentId, not assignedAgentId
              virtualAgentId: null, // Also clear virtualAgentId for AI agents
              lockVersion: 0, // Reset lock version
              lockExpiresAt: null, // Clear lock expiration
              nextAttemptAt: null, // Clear next attempt time
              updatedAt: new Date()
            })
            .where(
              and(
                eq(campaignQueue.campaignId, campaignId),
                inArray(campaignQueue.agentId, deactivatedAgentIds)
                // No status filter - release ALL items from deactivated agents
              )
            )
            .returning({ id: campaignQueue.id });

          console.log(`[ASSIGN AGENTS] [HYBRID] Released ${released.length} queue items from deactivated agents`);

          // Step 3B: Redistribute all unassigned queue items to newly assigned agents
          const availableCampaignQueue = await tx
            .select()
            .from(campaignQueue)
            .where(
              and(
                eq(campaignQueue.campaignId, campaignId),
                eq(campaignQueue.status, 'queued'), // Only queued items
                isNull(campaignQueue.agentId), // Now includes released items
                isNull(campaignQueue.virtualAgentId) // Not assigned to any agent
              )
            )
            .for('update'); // Lock rows to prevent concurrent reassignment

          if (availableCampaignQueue.length > 0 && agentIds.length > 0) {
            console.log(`[ASSIGN AGENTS] [HYBRID] Redistributing ${availableCampaignQueue.length} campaignQueue items to ${agentIds.length} agents`);

            // Round-robin assignment
            for (let i = 0; i  {
    await db
      .update(campaignAgentAssignments)
      .set({ 
        isActive: false,
        releasedAt: new Date()
      })
      .where(
        and(
          eq(campaignAgentAssignments.campaignId, campaignId),
          eq(campaignAgentAssignments.agentId, agentId)
        )
      );
  }

  async getCampaignAgents(campaignId: string): Promise {
    const assignments = await db
      .select({
        agentId: campaignAgentAssignments.agentId,
        assignedAt: campaignAgentAssignments.assignedAt,
        isActive: campaignAgentAssignments.isActive,
        agent: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        }
      })
      .from(campaignAgentAssignments)
      .innerJoin(users, eq(campaignAgentAssignments.agentId, users.id))
      .where(
        and(
          eq(campaignAgentAssignments.campaignId, campaignId),
          eq(campaignAgentAssignments.isActive, true)
        )
      );

    console.log(`[GET CAMPAIGN AGENTS] Found ${assignments.length} agents for campaign ${campaignId}`);
    return assignments;
  }

  // Campaign Audience Snapshots
  async createCampaignAudienceSnapshot(insertSnapshot: InsertCampaignAudienceSnapshot): Promise {
    const [snapshot] = await db.insert(campaignAudienceSnapshots).values(insertSnapshot).returning();
    return snapshot;
  }

  async getCampaignAudienceSnapshots(campaignId: string): Promise {
    return await db.select().from(campaignAudienceSnapshots).where(eq(campaignAudienceSnapshots.campaignId, campaignId));
  }

  // Campaign Queue (Account Lead Cap)
  async getCampaignQueueStats(campaignId: string): Promise;
    agents: number;
  }> {
    // Determine dial mode to query the correct table
    const [campaign] = await db
      .select({ dialMode: campaigns.dialMode })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    const dialMode = campaign?.dialMode || 'manual';

    // Get agent count
    const agents = await this.getCampaignAgents(campaignId);
    const agentCount = agents.filter(a => a.isActive).length;

    if (dialMode === 'manual') {
      // MANUAL MODE: Query agent_queue table with GROUP BY for efficiency
      const stats = await db
        .select({
          status: agentQueue.queueState,
          count: sql`count(*)::int`
        })
        .from(agentQueue)
        .where(eq(agentQueue.campaignId, campaignId))
        .groupBy(agentQueue.queueState);

      // Aggregate counts
      let total = 0;
      let queued = 0;
      let inProgress = 0;
      let completed = 0;

      for (const row of stats) {
        const count = row.count;
        total += count;
        
        if (row.status === 'queued') {
          queued += count;
        } else if (row.status === 'locked') {
          inProgress += count;
        } else if (row.status === 'completed') {
          completed += count;
        }
      }

      return { total, queued, inProgress, completed, removed: 0, invalid: 0, removedBreakdown: {}, agents: agentCount };
    } else {
      // POWER MODE: Query campaign_queue table with GROUP BY for efficiency
      const stats = await db
        .select({
          status: campaignQueue.status,
          count: sql`count(*)::int`
        })
        .from(campaignQueue)
        .where(eq(campaignQueue.campaignId, campaignId))
        .groupBy(campaignQueue.status);

      // Also get removed reason breakdown
      const removedStats = await db
        .select({
          reason: campaignQueue.removedReason,
          count: sql`count(*)::int`
        })
        .from(campaignQueue)
        .where(and(
          eq(campaignQueue.campaignId, campaignId),
          eq(campaignQueue.status, 'removed')
        ))
        .groupBy(campaignQueue.removedReason);

      const removedBreakdown: Record = {};
      for (const row of removedStats) {
        const key = row.reason || 'unknown';
        removedBreakdown[key] = row.count;
      }

      // Count invalid records: queued items whose contacts have NO valid phone number
      const [invalidResult] = await db
        .select({ count: sql`count(*)::int` })
        .from(campaignQueue)
        .leftJoin(contacts, eq(campaignQueue.contactId, contacts.id))
        .where(and(
          eq(campaignQueue.campaignId, campaignId),
          eq(campaignQueue.status, 'queued'),
          sql`(
            ${contacts.id} IS NULL
            OR (
              COALESCE(${contacts.dialingPhoneE164}, '') = ''
              AND COALESCE(${contacts.directPhoneE164}, '') = ''
              AND COALESCE(${contacts.mobilePhoneE164}, '') = ''
              AND COALESCE(${contacts.directPhone}, '') = ''
              AND COALESCE(${contacts.mobilePhone}, '') = ''
            )
          )`
        ));

      const invalid = invalidResult?.count ?? 0;

      // Aggregate counts
      let total = 0;
      let queued = 0;
      let inProgress = 0;
      let completed = 0;
      let removed = 0;

      for (const row of stats) {
        const count = row.count;
        total += count;

        if (row.status === 'queued') {
          queued += count;
        } else if (row.status === 'in_progress') {
          inProgress += count;
        } else if (row.status === 'done') {
          completed += count;
        } else if (row.status === 'removed') {
          removed += count;
        }
      }

      return { total, queued, inProgress, completed, removed, invalid, removedBreakdown, agents: agentCount };
    }
  }

  async getCampaignQueue(campaignId: string, status?: string): Promise {
    // Determine dial mode to query the correct table
    const [campaign] = await db
      .select({ dialMode: campaigns.dialMode })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    const dialMode = campaign?.dialMode || 'manual';

    if (dialMode === 'manual') {
      // MANUAL MODE: Query agentQueue table
      const whereConditions = status
        ? and(eq(agentQueue.campaignId, campaignId), eq(agentQueue.queueState, status as any))
        : eq(agentQueue.campaignId, campaignId);

      const rows = await db
        .select({
          id: agentQueue.id,
          campaignId: agentQueue.campaignId,
          contactId: agentQueue.contactId,
          accountId: agentQueue.accountId,
          priority: agentQueue.priority,
          status: agentQueue.queueState,
          removedReason: agentQueue.removedReason,
          queuedAt: agentQueue.createdAt,
          processedAt: agentQueue.updatedAt,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
          contactEmail: contacts.email,
          contactPhone: contacts.directPhone,
          accountName: accounts.name,
        })
        .from(agentQueue)
        .leftJoin(contacts, eq(agentQueue.contactId, contacts.id))
        .leftJoin(accounts, eq(agentQueue.accountId, accounts.id))
        .where(whereConditions)
        .orderBy(desc(agentQueue.priority), agentQueue.createdAt);

      return rows.map(r => ({
        id: r.id,
        campaignId: r.campaignId,
        contactId: r.contactId,
        accountId: r.accountId,
        priority: r.priority,
        status: r.status,
        removedReason: r.removedReason,
        queuedAt: r.queuedAt,
        processedAt: r.processedAt,
        contact: r.contactFirstName ? {
          firstName: r.contactFirstName,
          lastName: r.contactLastName,
          email: r.contactEmail,
          phoneNumber: r.contactPhone,
        } : null,
        account: r.accountName ? { name: r.accountName } : null,
      }));
    } else {
      // POWER MODE: Query campaignQueue table
      const whereConditions = status
        ? and(eq(campaignQueue.campaignId, campaignId), eq(campaignQueue.status, status as any))
        : eq(campaignQueue.campaignId, campaignId);

      const rows = await db
        .select({
          id: campaignQueue.id,
          campaignId: campaignQueue.campaignId,
          contactId: campaignQueue.contactId,
          accountId: campaignQueue.accountId,
          priority: campaignQueue.priority,
          status: campaignQueue.status,
          removedReason: campaignQueue.removedReason,
          queuedAt: campaignQueue.createdAt,
          processedAt: campaignQueue.updatedAt,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
          contactEmail: contacts.email,
          contactPhone: contacts.directPhone,
          accountName: accounts.name,
        })
        .from(campaignQueue)
        .leftJoin(contacts, eq(campaignQueue.contactId, contacts.id))
        .leftJoin(accounts, eq(campaignQueue.accountId, accounts.id))
        .where(whereConditions)
        .orderBy(desc(campaignQueue.priority), campaignQueue.createdAt);

      return rows.map(r => ({
        id: r.id,
        campaignId: r.campaignId,
        contactId: r.contactId,
        accountId: r.accountId,
        priority: r.priority,
        status: r.status,
        removedReason: r.removedReason,
        queuedAt: r.queuedAt,
        processedAt: r.processedAt,
        contact: r.contactFirstName ? {
          firstName: r.contactFirstName,
          lastName: r.contactLastName,
          email: r.contactEmail,
          phoneNumber: r.contactPhone,
        } : null,
        account: r.accountName ? { name: r.accountName } : null,
      }));
    }
  }

  /**
   * Get invalid queue items — queued contacts with no valid phone number or missing contact record.
   * Returns enriched records with invalidity reason for UI display.
   */
  async getInvalidQueueItems(campaignId: string): Promise {
    const rows = await db
      .select({
        id: campaignQueue.id,
        campaignId: campaignQueue.campaignId,
        contactId: campaignQueue.contactId,
        accountId: campaignQueue.accountId,
        priority: campaignQueue.priority,
        status: campaignQueue.status,
        queuedAt: campaignQueue.createdAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
        contactDirectPhone: contacts.directPhone,
        contactDirectPhoneE164: contacts.directPhoneE164,
        contactMobilePhone: contacts.mobilePhone,
        contactMobilePhoneE164: contacts.mobilePhoneE164,
        contactDialingPhone: contacts.dialingPhoneE164,
        contactId2: contacts.id,
        accountName: accounts.name,
      })
      .from(campaignQueue)
      .leftJoin(contacts, eq(campaignQueue.contactId, contacts.id))
      .leftJoin(accounts, eq(campaignQueue.accountId, accounts.id))
      .where(and(
        eq(campaignQueue.campaignId, campaignId),
        eq(campaignQueue.status, 'queued'),
        sql`(
          ${contacts.id} IS NULL
          OR (
            COALESCE(${contacts.dialingPhoneE164}, '') = ''
            AND COALESCE(${contacts.directPhoneE164}, '') = ''
            AND COALESCE(${contacts.mobilePhoneE164}, '') = ''
            AND COALESCE(${contacts.directPhone}, '') = ''
            AND COALESCE(${contacts.mobilePhone}, '') = ''
          )
        )`
      ))
      .orderBy(campaignQueue.createdAt);

    return rows.map(r => {
      let invalidReason = 'no_phone_number';
      if (!r.contactId2) {
        invalidReason = 'contact_not_found';
      } else if (!r.contactDirectPhone && !r.contactDirectPhoneE164 && !r.contactMobilePhone && !r.contactMobilePhoneE164 && !r.contactDialingPhone) {
        invalidReason = 'no_phone_number';
      }

      return {
        id: r.id,
        campaignId: r.campaignId,
        contactId: r.contactId,
        accountId: r.accountId,
        priority: r.priority,
        status: r.status,
        queuedAt: r.queuedAt,
        invalidReason,
        contact: r.contactFirstName ? {
          firstName: r.contactFirstName,
          lastName: r.contactLastName,
          email: r.contactEmail,
          directPhone: r.contactDirectPhone,
          directPhoneE164: r.contactDirectPhoneE164,
          mobilePhone: r.contactMobilePhone,
          mobilePhoneE164: r.contactMobilePhoneE164,
          dialingPhone: r.contactDialingPhone,
        } : null,
        account: r.accountName ? { name: r.accountName } : null,
      };
    });
  }

  /**
   * Bulk remove all invalid queue items (no valid phone) from a campaign.
   * Sets status='removed', removed_reason='invalid_data'.
   * Returns count of removed items.
   */
  async bulkRemoveInvalidItems(campaignId: string, reason: string = 'invalid_data'): Promise {
    const result = await db.execute(sql`
      UPDATE campaign_queue cq
      SET status = 'removed',
          removed_reason = ${reason},
          updated_at = NOW()
      FROM (
        SELECT cq2.id
        FROM campaign_queue cq2
        LEFT JOIN contacts c ON cq2.contact_id = c.id
        WHERE cq2.campaign_id = ${campaignId}
          AND cq2.status = 'queued'
          AND (
            c.id IS NULL
            OR (
              COALESCE(c.dialing_phone_e164, '') = ''
              AND COALESCE(c.direct_phone_e164, '') = ''
              AND COALESCE(c.mobile_phone_e164, '') = ''
              AND COALESCE(c.direct_phone, '') = ''
              AND COALESCE(c.mobile_phone, '') = ''
            )
          )
      ) invalid_items
      WHERE cq.id = invalid_items.id
    `);

    const removed = (result as any)?.rowCount ?? 0;
    return { removed };
  }

  async enqueueContact(campaignId: string, contactId: string, accountId: string, priority: number = 0): Promise {
    return await db.transaction(async (tx) => {
      // Fetch contact to get the best phone number
      const [contact] = await tx.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
      if (!contact) {
        throw new Error(`Contact ${contactId} not found`);
      }
      
      // AUTO-NORMALIZE: Ensure phone numbers and timezone are up-to-date when queueing
      const countryCode = normalizeCountryToCode(contact.country);
      const updates: Partial = {};
      
      // Normalize phone numbers if country is known
      if (countryCode) {
        // Normalize direct phone
        if (contact.directPhone && !contact.directPhoneE164) {
          const normalized = normalizePhoneWithCountryCode(contact.directPhone, countryCode);
          if (normalized.e164) {
            updates.directPhoneE164 = normalized.e164;
          }
        }
        // Normalize mobile phone
        if (contact.mobilePhone && !contact.mobilePhoneE164) {
          const normalized = normalizePhoneWithCountryCode(contact.mobilePhone, countryCode);
          if (normalized.e164) {
            updates.mobilePhoneE164 = normalized.e164;
          }
        }
      }
      
      // Auto-detect timezone if not set
      if (!contact.timezone) {
        const detectedTimezone = detectContactTimezone(contact);
        if (detectedTimezone) {
          updates.timezone = detectedTimezone;
        }
      }
      
      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        await tx.update(contacts).set(updates).where(eq(contacts.id, contactId));
        // Refresh contact data for phone selection
        Object.assign(contact, updates);
      }
      
      const dialedNumber = getBestPhoneForContact(contact).phone || null;

      // Skip contacts with no valid phone number
      if (!dialedNumber) {
        console.log(`[Enqueue] Skipping contact ${contactId} — no valid phone number`);
        return null;
      }

      const [queueItem] = await tx.insert(campaignQueue).values({
        campaignId,
        contactId,
        accountId,
        dialedNumber, // CRITICAL: Store exact dialed number for Telnyx recording sync
        priority,
        status: 'queued',
      }).returning();

      // Atomic upsert using ON CONFLICT - handles concurrent first-writes
      await tx.insert(campaignAccountStats).values({
        campaignId,
        accountId,
        queuedCount: 1,
        connectedCount: 0,
        positiveDispCount: 0,
      }).onConflictDoUpdate({
        target: [campaignAccountStats.campaignId, campaignAccountStats.accountId],
        set: {
          queuedCount: sql`${campaignAccountStats.queuedCount} + 1`,
        },
      });

      return queueItem;
    });
  }

  async bulkEnqueueContacts(campaignId: string, contactsToEnqueue: Array): Promise {
    if (contactsToEnqueue.length === 0) {
      return { enqueued: 0 };
    }

    // Process in batches to handle large audiences (10k+ contacts)
    const BATCH_SIZE = 500;
    let totalEnqueued = 0;
    const totalAccountCounts = new Map();
    const totalBatches = Math.ceil(contactsToEnqueue.length / BATCH_SIZE);

    for (let batchStart = 0; batchStart  1) {
        console.log(`[Bulk Enqueue] Processing batch ${batchNum}/${totalBatches} (${batch.length} contacts)`);
      }

      // Fetch contacts in this batch to get phone numbers (outside transaction for speed)
      const batchContactIds = batch.map(c => c.contactId);
      const contactData = await db.select().from(contacts).where(inArray(contacts.id, batchContactIds));
      const contactMap = new Map(contactData.map(c => [c.id, c]));

      // AUTO-NORMALIZE: Compute updates locally, then batch-write in small transactions
      const contactUpdates: Array }> = [];

      for (const contact of contactData) {
        const countryCode = normalizeCountryToCode(contact.country);
        const updates: Record = {};

        if (countryCode) {
          if (contact.directPhone && !contact.directPhoneE164) {
            const normalized = normalizePhoneWithCountryCode(contact.directPhone, countryCode);
            if (normalized.e164) updates.directPhoneE164 = normalized.e164;
          }
          if (contact.mobilePhone && !contact.mobilePhoneE164) {
            const normalized = normalizePhoneWithCountryCode(contact.mobilePhone, countryCode);
            if (normalized.e164) updates.mobilePhoneE164 = normalized.e164;
          }
        }

        if (!contact.timezone) {
          const detectedTimezone = detectContactTimezone(contact);
          if (detectedTimezone) updates.timezone = detectedTimezone;
        }

        if (Object.keys(updates).length > 0) {
          contactUpdates.push({ id: contact.id, updates });
          Object.assign(contact, updates);
        }
      }

      // Write normalization updates in small batches to avoid Neon connection timeouts
      if (contactUpdates.length > 0) {
        const NORM_BATCH = 50;
        for (let i = 0; i  {
            for (const { id, updates } of normBatch) {
              await tx.update(contacts).set(updates).where(eq(contacts.id, id));
            }
          });
        }
        console.log(`[Bulk Enqueue] Auto-normalized ${contactUpdates.length} contacts (phones/timezone)`);
      }

      // Insert queue items with dialed numbers — skip contacts with no valid phone
      const queueValues = batch.map(c => {
        const contact = contactMap.get(c.contactId);
        const dialedNumber = contact ? getBestPhoneForContact(contact).phone || null : null;

        return {
          campaignId,
          contactId: c.contactId,
          accountId: c.accountId,
          dialedNumber,
          priority: c.priority ?? 0,
          status: 'queued' as const,
        };
      }).filter(v => v.dialedNumber !== null);

      if (queueValues.length > 0) {
        await db.insert(campaignQueue).values(queueValues).onConflictDoNothing();
      }
      const skippedCount = batch.length - queueValues.length;
      if (skippedCount > 0) {
        console.log(`[Bulk Enqueue] Skipped ${skippedCount} contacts with no valid phone number`);
      }
      totalEnqueued += queueValues.length;

      // Accumulate account counts
      for (const item of batch) {
        totalAccountCounts.set(item.accountId, (totalAccountCounts.get(item.accountId) || 0) + 1);
      }
    }

    // Update account stats in small batches
    if (totalAccountCounts.size > 0) {
      const accountEntries = Array.from(totalAccountCounts.entries());
      const STATS_BATCH = 50;
      for (let i = 0; i  {
          for (const [accountId, count] of statsBatch) {
            await tx.insert(campaignAccountStats).values({
              campaignId,
              accountId,
              queuedCount: count,
              connectedCount: 0,
              positiveDispCount: 0,
            }).onConflictDoUpdate({
              target: [campaignAccountStats.campaignId, campaignAccountStats.accountId],
              set: {
                queuedCount: sql`${campaignAccountStats.queuedCount} + ${count}`,
              },
            });
          }
        });
      }
    }

    return { enqueued: totalEnqueued };
  }

  async updateQueueStatus(id: string, status: string, removedReason?: string, isPositiveDisposition?: boolean): Promise {
    return await db.transaction(async (tx) => {
      const [current] = await tx.select().from(campaignQueue).where(eq(campaignQueue.id, id));
      if (!current) return undefined;

      // Include old status in WHERE to prevent duplicate transitions
      const updated = await tx
        .update(campaignQueue)
        .set({ status: status as any, removedReason, updatedAt: new Date() })
        .where(and(
          eq(campaignQueue.id, id),
          eq(campaignQueue.status, current.status as any)
        ))
        .returning();

      // Only update counters if status actually changed (UPDATE succeeded)
      if (updated.length === 0) {
        // Status already changed by another transaction - no counter adjustments needed
        return current;
      }

      // Build upsert values for atomic counter updates
      const baseValues = {
        campaignId: current.campaignId,
        accountId: current.accountId,
        queuedCount: 0,
        connectedCount: 0,
        positiveDispCount: 0,
      };

      const updateSet: any = {};

      if (current.status === 'queued' && status !== 'queued') {
        updateSet.queuedCount = sql`GREATEST(0, ${campaignAccountStats.queuedCount} - 1)`;
      }

      if (status === 'done' || status === 'in_progress') {
        updateSet.connectedCount = sql`${campaignAccountStats.connectedCount} + 1`;
      }

      if (isPositiveDisposition) {
        updateSet.positiveDispCount = sql`${campaignAccountStats.positiveDispCount} + 1`;
      }

      if (Object.keys(updateSet).length > 0) {
        await tx.insert(campaignAccountStats).values(baseValues).onConflictDoUpdate({
          target: [campaignAccountStats.campaignId, campaignAccountStats.accountId],
          set: updateSet,
        });
      }

      return updated[0];
    });
  }

  async removeFromQueue(campaignId: string, contactId: string, reason: string): Promise {
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(campaignQueue).where(
        and(
          eq(campaignQueue.campaignId, campaignId),
          eq(campaignQueue.contactId, contactId)
        )
      );

      if (!current) return;

      await tx
        .update(campaignQueue)
        .set({ status: 'removed', removedReason: reason, updatedAt: new Date() })
        .where(and(
          eq(campaignQueue.campaignId, campaignId),
          eq(campaignQueue.contactId, contactId)
        ));

      // Atomic decrement using ON CONFLICT if was queued
      if (current.status === 'queued') {
        await tx.insert(campaignAccountStats).values({
          campaignId,
          accountId: current.accountId,
          queuedCount: 0,
          connectedCount: 0,
          positiveDispCount: 0,
        }).onConflictDoUpdate({
          target: [campaignAccountStats.campaignId, campaignAccountStats.accountId],
          set: {
            queuedCount: sql`GREATEST(0, ${campaignAccountStats.queuedCount} - 1)`,
          },
        });
      }
    });
  }

  async removeFromQueueById(campaignId: string, queueId: string, reason: string): Promise {
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(campaignQueue).where(
        and(
          eq(campaignQueue.id, queueId),
          eq(campaignQueue.campaignId, campaignId)
        )
      );

      if (!current) {
        throw new Error("Queue item not found or does not belong to this campaign");
      }

      await tx
        .update(campaignQueue)
        .set({ status: 'removed', removedReason: reason, updatedAt: new Date() })
        .where(
          and(
            eq(campaignQueue.id, queueId),
            eq(campaignQueue.campaignId, campaignId)
          )
        );

      // Atomic decrement using ON CONFLICT if was queued
      if (current.status === 'queued') {
        await tx.insert(campaignAccountStats).values({
          campaignId: current.campaignId,
          accountId: current.accountId,
          queuedCount: 0,
          connectedCount: 0,
          positiveDispCount: 0,
        }).onConflictDoUpdate({
          target: [campaignAccountStats.campaignId, campaignAccountStats.accountId],
          set: {
            queuedCount: sql`GREATEST(0, ${campaignAccountStats.queuedCount} - 1)`,
          },
        });
      }
    });
  }

  async getCampaignAccountStats(campaignId: string, accountId?: string): Promise {
    const conditions = [eq(campaignAccountStats.campaignId, campaignId)];
    if (accountId) {
      conditions.push(eq(campaignAccountStats.accountId, accountId));
    }

    return await db
      .select({
        accountId: campaignAccountStats.accountId,
        accountName: accounts.name,
        queuedCount: campaignAccountStats.queuedCount,
        connectedCount: campaignAccountStats.connectedCount,
        positiveDispCount: campaignAccountStats.positiveDispCount,
      })
      .from(campaignAccountStats)
      .leftJoin(accounts, eq(campaignAccountStats.accountId, accounts.id))
      .where(and(...conditions));
  }

  async upsertCampaignAccountStats(campaignId: string, accountId: string, updates: any): Promise {
    const existing = await db.select().from(campaignAccountStats).where(
      and(
        eq(campaignAccountStats.campaignId, campaignId),
        eq(campaignAccountStats.accountId, accountId)
      )
    );

    if (existing.length > 0) {
      const current = existing[0];
      const [updated] = await db
        .update(campaignAccountStats)
        .set({
          queuedCount: current.queuedCount + (updates.queuedCount || 0),
          connectedCount: current.connectedCount + (updates.connectedCount || 0),
          positiveDispCount: current.positiveDispCount + (updates.positiveDispCount || 0),
        })
        .where(and(
          eq(campaignAccountStats.campaignId, campaignId),
          eq(campaignAccountStats.accountId, accountId)
        ))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(campaignAccountStats).values({
        campaignId,
        accountId,
        queuedCount: updates.queuedCount || 0,
        connectedCount: updates.connectedCount || 0,
        positiveDispCount: updates.positiveDispCount || 0,
      }).returning();
      return created;
    }
  }

  async enforceAccountCap(campaignId: string): Promise {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign || !campaign.accountCapEnabled || !campaign.accountCapValue) {
      return { removed: 0, accounts: [] };
    }

    const { accountCapValue, accountCapMode } = campaign;
    const affectedAccounts: string[] = [];
    let totalRemoved = 0;

    // Get all accounts in this campaign's queue
    const accountsInQueue = await db
      .selectDistinct({ accountId: campaignQueue.accountId })
      .from(campaignQueue)
      .where(and(
        eq(campaignQueue.campaignId, campaignId),
        eq(campaignQueue.status, 'queued')
      ));

    for (const { accountId } of accountsInQueue) {
      let currentCount = 0;

      // Determine count based on mode
      if (accountCapMode === 'queue_size') {
        const stats = await this.getCampaignAccountStats(campaignId, accountId);
        currentCount = stats[0]?.queuedCount || 0;
      } else if (accountCapMode === 'connected_calls') {
        const stats = await this.getCampaignAccountStats(campaignId, accountId);
        currentCount = stats[0]?.connectedCount || 0;
      } else if (accountCapMode === 'positive_disp') {
        const stats = await this.getCampaignAccountStats(campaignId, accountId);
        currentCount = stats[0]?.positiveDispCount || 0;
      }

      if (currentCount > accountCapValue) {
        const overflow = currentCount - accountCapValue;

        // Remove lowest priority items for this account
        const toRemove = await db
          .select()
          .from(campaignQueue)
          .where(and(
            eq(campaignQueue.campaignId, campaignId),
            eq(campaignQueue.accountId, accountId),
            eq(campaignQueue.status, 'queued')
          ))
          .orderBy(campaignQueue.priority, desc(campaignQueue.createdAt))
          .limit(overflow);

        for (const item of toRemove) {
          await this.updateQueueStatus(item.id, 'removed', 'ACCOUNT_CAP_TRIM');
          totalRemoved++;
        }

        if (toRemove.length > 0) {
          affectedAccounts.push(accountId);
        }
      }
    }

    return { removed: totalRemoved, accounts: affectedAccounts };
  }

  // Agent Queue Assignment
  async getAgents(): Promise {
    return await db.select().from(users).where(eq(users.role, 'agent'));
  }

  async assignQueueToAgents(campaignId: string, agentIds: string[], mode: 'round_robin' | 'weighted' = 'round_robin'): Promise {
    console.log(`[assignQueueToAgents] Starting assignment for campaign ${campaignId}, ${agentIds.length} agents, mode: ${mode}`);
    
    // Get all unassigned queued items for this campaign (only IDs and priority for performance)
    const queueItems = await db
      .select({ id: campaignQueue.id, priority: campaignQueue.priority })
      .from(campaignQueue)
      .where(and(
        eq(campaignQueue.campaignId, campaignId),
        eq(campaignQueue.status, 'queued'),
        isNull(campaignQueue.agentId)
      ))
      .orderBy(desc(campaignQueue.priority), campaignQueue.createdAt);

    if (queueItems.length === 0 || agentIds.length === 0) {
      console.log(`[assignQueueToAgents] No items to assign (items: ${queueItems.length}, agents: ${agentIds.length})`);
      return { assigned: 0 };
    }

    console.log(`[assignQueueToAgents] Found ${queueItems.length} unassigned queue items`);

    // Build assignment map: queueItemId -> agentId
    const assignments = new Map();

    if (mode === 'round_robin') {
      // Round robin assignment
      for (let i = 0; i  id);
      const caseStatements = batch.map(([id, agentId]) => 
        `WHEN id = '${id}' THEN '${agentId}'`
      ).join(' ');
      
      await db.execute(sql.raw(`
        UPDATE campaign_queue
        SET 
          agent_id = CASE ${caseStatements} END,
          updated_at = NOW()
        WHERE id IN (${ids.map(id => `'${id}'`).join(', ')})
      `));
      
      assignedCount += batch.length;
      
      if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= entries.length) {
        console.log(`[assignQueueToAgents] Progress: ${Math.min(i + BATCH_SIZE, entries.length)}/${entries.length} items assigned`);
      }
    }

    console.log(`[assignQueueToAgents] ✅ Successfully assigned ${assignedCount} queue items to ${agentIds.length} agents`);
    return { assigned: assignedCount };
  }

  async getAgentQueue(agentId: string, campaignId?: string, status?: string): Promise {
    // Build the where conditions
    const conditions = [eq(campaignQueue.agentId, agentId)];

    if (campaignId) {
      conditions.push(eq(campaignQueue.campaignId, campaignId));
    }

    if (status) {
      conditions.push(eq(campaignQueue.status, status as any));
    }

    const results = await db
      .select({
        id: campaignQueue.id,
        campaignId: campaignQueue.campaignId,
        campaignName: campaigns.name,
        contactId: campaignQueue.contactId,
        contactName: sql`COALESCE(${contacts.fullName}, CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}))`.as('contactName'),
        contactEmail: contacts.email,
        contactPhone: contacts.directPhone,
        accountId: campaignQueue.accountId,
        accountName: accounts.name,
        priority: campaignQueue.priority,
        status: campaignQueue.status,
        createdAt: campaignQueue.createdAt,
        updatedAt: campaignQueue.updatedAt,
      })
      .from(campaignQueue)
      .leftJoin(contacts, eq(campaignQueue.contactId, contacts.id))
      .leftJoin(accounts, eq(campaignQueue.accountId, accounts.id))
      .leftJoin(campaigns, eq(campaignQueue.campaignId, campaigns.id))
      .where(and(...conditions))
      .orderBy(desc(campaignQueue.priority), campaignQueue.createdAt);

    return results;
  }

  async getQueueItemById(id: string): Promise {
    // Try agent_queue first (manual dial)
    const [agentQueueItem] = await db
      .select()
      .from(agentQueue)
      .where(eq(agentQueue.id, id))
      .limit(1);
    
    if (agentQueueItem) {
      return { ...agentQueueItem, _queueTable: 'agent_queue' };
    }

    // Try campaign_queue (power dial)
    const [campaignQueueItem] = await db
      .select()
      .from(campaignQueue)
      .where(eq(campaignQueue.id, id))
      .limit(1);
    
    if (campaignQueueItem) {
      return { ...campaignQueueItem, _queueTable: 'campaign_queue' };
    }

    return null;
  }

  // Call Dispositions
  async createCallDisposition(callData: InsertCall): Promise {
    const [call] = await db.insert(calls).values(callData).returning();

    // If this is linked to a queue item and has a disposition, update queue status
    if (call.queueItemId && call.disposition) {
      // Get queue item to determine which table to update
      const queueItem = await this.getQueueItemById(call.queueItemId);
      
      if (queueItem) {
        // Update the appropriate queue table based on dial mode
        if (queueItem._queueTable === 'agent_queue') {
          // agent_queue uses 'queueState' column with 'completed' value
          await db
            .update(agentQueue)
            .set({ queueState: 'completed' as any })
            .where(eq(agentQueue.id, call.queueItemId));
        } else {
          // campaign_queue uses 'status' column with 'done' value
          await db
            .update(campaignQueue)
            .set({ status: 'done' as any })
            .where(eq(campaignQueue.id, call.queueItemId));
        }
      }

      // Auto-create Lead for qualified dispositions
      // CRITICAL FIX: Never create leads for voicemail or other non-qualifying dispositions
      // Use canonical disposition names: qualified_lead (not just 'qualified')
      const QUALIFYING_DISPOSITIONS = ['qualified_lead', 'qualified', 'lead'];
      const NON_QUALIFYING_DISPOSITIONS = ['voicemail', 'no_answer', 'not_interested', 'do_not_call', 'invalid_data', 'needs_review'];
      const isQualifyingDisposition = QUALIFYING_DISPOSITIONS.includes(call.disposition || '');
      const isNonQualifying = NON_QUALIFYING_DISPOSITIONS.includes(call.disposition || '');
      
      // DURATION GUARD: Block AI-generated leads from ghost/short calls
      const callDurationSec = call.duration || 0;
      const MIN_AI_LEAD_DURATION = 45;
      const isGhostCall = callDurationSec  {
                  console.log(`[LEAD QA] Email validated for contact ${contact.id}:`, validationResult.status);
                  
                  // Update contact with email status
                  await db.update(contacts).set({
                    emailStatus: validationResult.status,
                    updatedAt: new Date(),
                  }).where(eq(contacts.id, contact.id));
                  
                  // Update account-level email deliverability score
                  if (contact.accountId) {
                    await updateAccountEmailDeliverabilityScore(contact.accountId);
                  }
                })
                .catch((error) => {
                  console.error('[LEAD QA] Email validation error for contact:', contact.id, error);
                });
            }
          } catch (leadError) {
            console.error('[LEAD CREATION] ❌ Failed to create lead:', leadError);
            throw leadError;
          }
        }
      } else if (call.disposition === 'qualified') {
        console.warn('[LEAD CREATION] ⚠️ Qualified disposition but no contactId:', call);
      }

      // Update account stats for positive dispositions (qualified, callback_requested)
      if (call.disposition === 'qualified' || call.disposition === 'callback-requested') {
        const queueItem = await db
          .select()
          .from(campaignQueue)
          .where(eq(campaignQueue.id, call.queueItemId))
          .limit(1);

        if (queueItem.length > 0) {
          await this.upsertCampaignAccountStats(
            queueItem[0].campaignId,
            queueItem[0].accountId,
            { positiveDispCount: 1 }
          );
        }
      }

      // Update connected count
      if (call.disposition === 'connected' || call.disposition === 'qualified' || call.disposition === 'callback-requested' || call.disposition === 'not_interested') {
        const queueItem = await db
          .select()
          .from(campaignQueue)
          .where(eq(campaignQueue.id, call.queueItemId))
          .limit(1);

        if (queueItem.length > 0) {
          await this.upsertCampaignAccountStats(
            queueItem[0].campaignId,
            queueItem[0].accountId,
            { connectedCount: 1 }
          );
        }
      }
    }

    return call;
  }

  async getCallsByQueueItem(queueItemId: string): Promise {
    return await db.select().from(calls).where(eq(calls.queueItemId, queueItemId));
  }

  async getCallsByContact(contactId: string): Promise {
    return await db.select().from(calls).where(eq(calls.contactId, contactId)).orderBy(desc(calls.createdAt));
  }

  // Email Templates
  async getEmailTemplates(): Promise {
    return await db.select().from(emailTemplates).orderBy(desc(emailTemplates.createdAt));
  }

  async getEmailTemplate(id: string): Promise {
    const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
    return template || undefined;
  }

  async createEmailTemplate(insertTemplate: InsertEmailTemplate): Promise {
    const [template] = await db.insert(emailTemplates).values(insertTemplate).returning();
    return template;
  }

  async updateEmailTemplate(id: string, updateData: Partial): Promise {
    const [template] = await db
      .update(emailTemplates)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning();
    return template || undefined;
  }

  async approveEmailTemplate(id: string, approvedById: string): Promise {
    const [template] = await db
      .update(emailTemplates)
      .set({
        isApproved: true,
        approvedById,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailTemplates.id, id))
      .returning();
    return template || undefined;
  }

  async deleteEmailTemplate(id: string): Promise {
    await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  }

  // Email Sends
  async getEmailSends(campaignId?: string): Promise {
    if (campaignId) {
      return await db.select().from(emailSends).where(eq(emailSends.campaignId, campaignId));
    }
    return await db.select().from(emailSends).orderBy(desc(emailSends.createdAt));
  }

  async getEmailSend(id: string): Promise {
    const [send] = await db.select().from(emailSends).where(eq(emailSends.id, id));
    return send || undefined;
  }

  async createEmailSend(insertSend: InsertEmailSend): Promise {
    const [send] = await db.insert(emailSends).values(insertSend).returning();
    return send;
  }

  async updateEmailSend(id: string, updateData: Partial): Promise {
    const [send] = await db
      .update(emailSends)
      .set(updateData)
      .where(eq(emailSends.id, id))
      .returning();
    return send || undefined;
  }

  // Email Events
  async createEmailEvent(insertEvent: InsertEmailEvent): Promise {
    const [event] = await db.insert(emailEvents).values(insertEvent).returning();
    return event;
  }

  async getEmailEvents(sendId: string): Promise {
    return await db.select().from(emailEvents).where(eq(emailEvents.sendId, sendId)).orderBy(desc(emailEvents.createdAt));
  }

  // Call Scripts
  async getCallScripts(campaignId?: string): Promise {
    if (campaignId) {
      return await db.select().from(callScripts).where(eq(callScripts.campaignId, campaignId));
    }
    return await db.select().from(callScripts).orderBy(desc(callScripts.createdAt));
  }

  async getCallScript(id: string): Promise {
    const [script] = await db.select().from(callScripts).where(eq(callScripts.id, id));
    return script || undefined;
  }

  async createCallScript(insertScript: InsertCallScript): Promise {
    const [script] = await db.insert(callScripts).values(insertScript).returning();
    return script;
  }

  async updateCallScript(id: string, updateData: Partial): Promise {
    const [script] = await db
      .update(callScripts)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(callScripts.id, id))
      .returning();
    return script || undefined;
  }

  async deleteCallScript(id: string): Promise {
    await db.delete(callScripts).where(eq(callScripts.id, id));
  }

  // Call Attempts
  async getCallAttempts(campaignId?: string, agentId?: string): Promise {
    const conditions: any[] = [];

    if (campaignId) {
      conditions.push(eq(callAttempts.campaignId, campaignId));
    }
    if (agentId) {
      conditions.push(eq(callAttempts.agentId, agentId));
    }

    const query = conditions.length > 0
      ? db.select().from(callAttempts).where(and(...conditions))
      : db.select().from(callAttempts);

    return await query.orderBy(desc(callAttempts.createdAt));
  }

  async getCallAttempt(id: string): Promise {
    const [attempt] = await db.select().from(callAttempts).where(eq(callAttempts.id, id));
    return attempt || undefined;
  }

  async getCallAttemptsByTelnyxId(telnyxCallId: string): Promise {
    return await db
      .select()
      .from(callAttempts)
      .where(eq(callAttempts.telnyxCallId, telnyxCallId));
  }

  async createCallAttempt(data: {
    contactId: string;
    agentId: string;
    campaignId: string;
    startedAt: Date;
    telnyxCallId?: string;
  }): Promise {
    const attempt = {
      id: crypto.randomUUID(),
      ...data,
      disposition: 'no-answer' as const,
      createdAt: new Date(),
    };
    await db.insert(callAttempts).values(attempt);
    return attempt;
  }

  async updateCallAttempt(attemptId: string, data: Partial): Promise {
    await db.update(callAttempts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(callAttempts.id, attemptId));

    return await this.getCallAttempt(attemptId);
  }

  // Call Events
  async createCallEvent(data: {
    attemptId: string;
    type: string;
    metadata?: any;
  }): Promise {
    const event = {
      id: crypto.randomUUID(),
      ...data,
      timestamp: new Date(),
    };
    await db.insert(callEvents).values(event);
    return event;
  }

  async getCallEvents(attemptId: string): Promise {
    return await db.select().from(callEvents).where(eq(callEvents.attemptId, attemptId)).orderBy(desc(callEvents.createdAt));
  }

  // Softphone Profiles (Phase 27)
  async getSoftphoneProfile(userId: string): Promise {
    const [profile] = await db.select().from(softphoneProfiles).where(eq(softphoneProfiles.userId, userId));
    return profile || undefined;
  }

  async upsertSoftphoneProfile(insertProfile: InsertSoftphoneProfile): Promise {
    const [profile] = await db
      .insert(softphoneProfiles)
      .values({ ...insertProfile, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: softphoneProfiles.userId,
        set: {
          micDeviceId: insertProfile.micDeviceId,
          speakerDeviceId: insertProfile.speakerDeviceId,
          lastTestAt: insertProfile.lastTestAt,
          testResultsJson: insertProfile.testResultsJson,
          updatedAt: new Date(),
        },
      })
      .returning();
    return profile;
  }

  // Call Recording Access Logs (Phase 27)
  async createCallRecordingAccessLog(insertLog: InsertCallRecordingAccessLog): Promise {
    const [log] = await db.insert(callRecordingAccessLogs).values(insertLog).returning();
    return log;
  }

  async getCallRecordingAccessLogs(callAttemptId: string): Promise {
    return await db
      .select()
      .from(callRecordingAccessLogs)
      .where(eq(callRecordingAccessLogs.callAttemptId, callAttemptId))
      .orderBy(desc(callRecordingAccessLogs.createdAt));
  }

  // SIP Trunk Configuration (WebRTC)
  async getSipTrunkConfigs(): Promise {
    return await db.select().from(sipTrunkConfigs).orderBy(desc(sipTrunkConfigs.isDefault), sipTrunkConfigs.name);
  }

  async getSipTrunkConfig(id: string): Promise {
    const [config] = await db.select().from(sipTrunkConfigs).where(eq(sipTrunkConfigs.id, id));
    return config || undefined;
  }

  async getDefaultSipTrunkConfig(): Promise {
    const [config] = await db.select().from(sipTrunkConfigs).where(and(eq(sipTrunkConfigs.isDefault, true), eq(sipTrunkConfigs.isActive, true)));
    return config || undefined;
  }

  async createSipTrunkConfig(insertConfig: InsertSipTrunkConfig): Promise {
    const [config] = await db.insert(sipTrunkConfigs).values({ ...insertConfig, updatedAt: new Date() }).returning();
    return config;
  }

  async updateSipTrunkConfig(id: string, updateData: Partial): Promise {
    const [config] = await db
      .update(sipTrunkConfigs)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(sipTrunkConfigs.id, id))
      .returning();
    return config || undefined;
  }

  async deleteSipTrunkConfig(id: string): Promise {
    await db.delete(sipTrunkConfigs).where(eq(sipTrunkConfigs.id, id));
  }

  async setDefaultSipTrunk(id: string): Promise {
    // First, set all to non-default
    await db.update(sipTrunkConfigs).set({ isDefault: false });
    // Then set the specified one as default
    await db.update(sipTrunkConfigs).set({ isDefault: true }).where(eq(sipTrunkConfigs.id, id));
  }

  // Campaign Content Links (Resources Centre Integration)
  async getCampaignContentLinks(campaignId: string): Promise {
    return await db
      .select()
      .from(campaignContentLinks)
      .where(eq(campaignContentLinks.campaignId, campaignId))
      .orderBy(desc(campaignContentLinks.createdAt));
  }

  async getCampaignContentLink(id: number): Promise {
    const [link] = await db.select().from(campaignContentLinks).where(eq(campaignContentLinks.id, id));
    return link || undefined;
  }

  async createCampaignContentLink(insertLink: InsertCampaignContentLink): Promise {
    const [link] = await db.insert(campaignContentLinks).values(insertLink).returning();
    return link;
  }

  async deleteCampaignContentLink(id: number): Promise {
    await db.delete(campaignContentLinks).where(eq(campaignContentLinks.id, id));
  }

  // Speakers
  async getSpeakers(): Promise {
    return await db.select().from(speakers).orderBy(speakers.name);
  }

  async getSpeaker(id: number): Promise {
    const [speaker] = await db.select().from(speakers).where(eq(speakers.id, id));
    return speaker || undefined;
  }

  async createSpeaker(insertSpeaker: InsertSpeaker): Promise {
    const [speaker] = await db.insert(speakers).values(insertSpeaker).returning();
    return speaker;
  }

  async updateSpeaker(id: number, updateData: Partial): Promise {
    const [speaker] = await db.update(speakers).set({ ...updateData, updatedAt: new Date() }).where(eq(speakers.id, id)).returning();
    return speaker || undefined;
  }

  async deleteSpeaker(id: number): Promise {
    await db.delete(speakers).where(eq(speakers.id, id));
  }

  // Organizers
  async getOrganizers(): Promise {
    return await db.select().from(organizers).orderBy(organizers.name);
  }

  async getOrganizer(id: number): Promise {
    const [organizer] = await db.select().from(organizers).where(eq(organizers.id, id));
    return organizer || undefined;
  }

  async createOrganizer(insertOrganizer: InsertOrganizer): Promise {
    const [organizer] = await db.insert(organizers).values(insertOrganizer).returning();
    return organizer;
  }

  async updateOrganizer(id: number, updateData: Partial): Promise {
    const [organizer] = await db.update(organizers).set({ ...updateData, updatedAt: new Date() }).where(eq(organizers.id, id)).returning();
    return organizer || undefined;
  }

  async deleteOrganizer(id: number): Promise {
    await db.delete(organizers).where(eq(organizers.id, id));
  }

  // Sponsors
  async getSponsors(): Promise {
    return await db.select().from(sponsors).orderBy(sponsors.name);
  }

  async getSponsor(id: number): Promise {
    const [sponsor] = await db.select().from(sponsors).where(eq(sponsors.id, id));
    return sponsor || undefined;
  }

  async createSponsor(insertSponsor: InsertSponsor): Promise {
    const [sponsor] = await db.insert(sponsors).values(insertSponsor).returning();
    return sponsor;
  }

  async updateSponsor(id: number, updateData: Partial): Promise {
    const [sponsor] = await db.update(sponsors).set({ ...updateData, updatedAt: new Date() }).where(eq(sponsors.id, id)).returning();
    return sponsor || undefined;
  }

  async deleteSponsor(id: number): Promise {
    await db.delete(sponsors).where(eq(sponsors.id, id));
  }

  // Qualification Responses
  async createQualificationResponse(insertResponse: InsertQualificationResponse): Promise {
    const [response] = await db.insert(qualificationResponses).values(insertResponse).returning();
    return response;
  }

  async getQualificationResponses(attemptId?: string, leadId?: string): Promise {
    if (attemptId) {
      return await db.select().from(qualificationResponses).where(eq(qualificationResponses.attemptId, attemptId));
    } else if (leadId) {
      return await db.select().from(qualificationResponses).where(eq(qualificationResponses.leadId, leadId));
    }
    return await db.select().from(qualificationResponses).orderBy(desc(qualificationResponses.createdAt));
  }

  // Segments
  async getSegments(filters?: any): Promise {
    return await db.select().from(segments).orderBy(desc(segments.createdAt));
  }

  async getSegment(id: string): Promise {
    const [segment] = await db.select().from(segments).where(eq(segments.id, id));
    return segment || undefined;
  }

  async getSegmentMembers(segmentId: string): Promise {
    const segment = await this.getSegment(segmentId);
    if (!segment) {
      throw new Error('Segment not found');
    }

    // Build query based on entity type to get ALL matching records
    const table = segment.entityType === 'account' ? accounts : contacts;
    const baseQuery = db.select().from(table) as any;

    // Apply filters if criteria exists
    if (segment.definitionJson && (segment.definitionJson as any).conditions?.length > 0) {
      const filterSql = buildFilterQuery(segment.definitionJson as any, table);
      if (filterSql) {
        const query = baseQuery.where(filterSql);
        const allRecords = await query;

        if (allRecords.length === 0) {
          return [];
        }

        return segment.entityType === 'account' ? (allRecords as Account[]) : (allRecords as Contact[]);
      }
    }
    // Execute query to get all matching records when no filterSql is present
    const allRecords = await baseQuery;
    if (allRecords.length === 0) return [];
    return segment.entityType === 'account' ? (allRecords as Account[]) : (allRecords as Contact[]);
  }

  async createSegment(insertSegment: InsertSegment): Promise {
    const [segment] = await db.insert(segments).values(insertSegment).returning();
    return segment;
  }

  async updateSegment(id: string, updateData: Partial): Promise {
    const [segment] = await db
      .update(segments)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(segments.id, id))
      .returning();
    return segment || undefined;
  }

  async deleteSegment(id: string): Promise {
    await db.delete(segments).where(eq(segments.id, id));
  }

  async previewSegment(entityType: 'contact' | 'account', criteria: any): Promise {
    // Build query based on entity type
    const table = entityType === 'contact' ? contacts : accounts;

    // Apply filter criteria using SQL builder
    const baseQuery = db.select({ id: table.id }).from(table) as any;

    const results = await (criteria && criteria.conditions && criteria.conditions.length > 0
      ? (() => {
          const filterSql = buildFilterQuery(criteria, table);
          return filterSql ? baseQuery.where(filterSql) : baseQuery;
        })()
      : baseQuery);
    const allIds = results.map(r => r.id);

    // Return count and sample IDs (first 100 for list conversion)
    return {
      count: allIds.length,
      sampleIds: allIds.slice(0, 100)
    };
  }

  async convertSegmentToList(segmentId: string, listName: string, listDescription?: string): Promise {
    // Get the segment
    const segment = await this.getSegment(segmentId);
    if (!segment) {
      throw new Error('Segment not found');
    }

    // Preview segment to get ALL matching IDs (not just samples)
    const { sampleIds } = await this.previewSegment(
      segment.entityType || 'contact', 
      segment.definitionJson
    );

    // Create a new list with the segment's record IDs
    const newList: InsertList = {
      name: listName,
      description: listDescription || `Static list created from segment: ${segment.name}`,
      entityType: segment.entityType || 'contact',
      sourceType: 'segment',
      sourceRef: segmentId,
      recordIds: sampleIds,
      ownerId: segment.ownerId,
      tags: segment.tags,
      visibilityScope: segment.visibilityScope || 'private',
    };

    return await this.createList(newList);
  }

  // Lists
  async getLists(filters?: any): Promise {
    return await db.select().from(lists).orderBy(desc(lists.createdAt));
  }

  async getList(id: string): Promise {
    const [list] = await db.select().from(lists).where(eq(lists.id, id));
    return list || undefined;
  }

  async getListById(id: string): Promise {
    return this.getList(id);
  }

  async getListMembers(listId: string): Promise {
    const list = await this.getList(listId);
    if (!list) {
      throw new Error('List not found');
    }

    if (!list.recordIds || list.recordIds.length === 0) {
      return [];
    }

    // Batch to avoid PostgreSQL parameter limits (max ~1000)
    const BATCH_SIZE = 500;
    const allRecords: any[] = [];

    if (list.entityType === 'account') {
      for (let i = 0; i  ({
        ...c,
        // Store account name in a way the frontend can access it
        account: c.accountName ? { name: c.accountName } : undefined
      })) as any;
    }
  }

  async createList(insertList: InsertList): Promise {
    const [list] = await db.insert(lists).values(insertList).returning();
    return list;
  }

  async updateList(id: string, updateData: Partial): Promise {
    const [list] = await db
      .update(lists)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(lists.id, id))
      .returning();
    return list || undefined;
  }

  async deleteList(id: string): Promise {
    await db.delete(lists).where(eq(lists.id, id));
  }

  async exportList(listId: string, format: 'csv' | 'json'): Promise {
    // Get the list
    const list = await this.getList(listId);
    if (!list) {
      throw new Error('List not found');
    }

    // If no record IDs, return empty data
    if (!list.recordIds || list.recordIds.length === 0) {
      const timestamp = new Date().toISOString().split('T')[0];
      const sanitizedName = list.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      return {
        data: format === 'csv' ? '' : '[]',
        filename: `${sanitizedName}_${timestamp}.${format}`
      };
    }

    // Get all records based on entity type
    const table = list.entityType === 'contact' ? contacts : accounts;
    const records = await db
      .select()
      .from(table)
      .where(inArray(table.id, list.recordIds));

    const timestamp = new Date().toISOString().split('T')[0];
    const sanitizedName = list.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    if (format === 'csv') {
      // Convert to CSV
      if (records.length === 0) {
        return {
          data: '',
          filename: `${sanitizedName}_${timestamp}.csv`
        };
      }

      const headers = Object.keys(records[0]).join(',');
      const rows = records.map(record => 
        Object.values(record).map(val => 
          typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
        ).join(',')
      );

      return {
        data: [headers, ...rows].join('\n'),
        filename: `${sanitizedName}_${timestamp}.csv`
      };
    } else {
      // Return JSON
      return {
        data: JSON.stringify(records, null, 2),
        filename: `${sanitizedName}_${timestamp}.json`
      };
    }
  }


  // Leads
  async getLeads(filters?: FilterGroup): Promise {
    // Create aliases for user joins
    const agentUser = alias(users, 'agent');
    const approverUser = alias(users, 'approver');
    const rejectorUser = alias(users, 'rejector');
    
    // Join with contacts, accounts, and users (agents) to get full details
    let query = db
      .select({
        id: leads.id,
        contactId: leads.contactId,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        campaignId: leads.campaignId,
        callAttemptId: leads.callAttemptId,
        recordingUrl: leads.recordingUrl,
        recordingS3Key: leads.recordingS3Key,
        recordingStatus: leads.recordingStatus,
        telnyxCallId: leads.telnyxCallId,
        callDuration: leads.callDuration,
        dialedNumber: leads.dialedNumber,
        agentId: leads.agentId,
        qaStatus: leads.qaStatus,
        checklistJson: leads.checklistJson,
        customFields: leads.customFields,
        approvedAt: leads.approvedAt,
        approvedById: leads.approvedById,
        rejectedReason: leads.rejectedReason,
        rejectedAt: leads.rejectedAt,
        rejectedById: leads.rejectedById,
        notes: leads.notes,
        transcript: leads.transcript,
        transcriptionStatus: leads.transcriptionStatus,
        aiScore: leads.aiScore,
        aiAnalysis: leads.aiAnalysis,
        aiQualificationStatus: leads.aiQualificationStatus,
        submittedToClient: leads.submittedToClient,
        submittedAt: leads.submittedAt,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        // Contact info
        contactTitle: contacts.jobTitle,
        contactCity: contacts.city,
        contactState: contacts.state,
        contactCountry: contacts.country,
        contactLinkedin: contacts.linkedinUrl,
        // Account info — prefer joined accounts.name, fall back to denormalized leads.accountName
        accountName: sql`COALESCE(${accounts.name}, ${leads.accountName})`.as('account_name_resolved'),
        accountId: contacts.accountId,
        accountCity: accounts.hqCity,
        accountState: accounts.hqState,
        accountCountry: accounts.hqCountry,
        accountIndustry: sql`COALESCE(${accounts.industryStandardized}, ${leads.accountIndustry})`.as('account_industry_resolved'),
        accountRevenueRange: accounts.revenueRange,
        accountEmployeesRange: accounts.employeesSizeRange,
        accountLinkedin: accounts.linkedinUrl,
        // Agent info
        agentFirstName: agentUser.firstName,
        agentLastName: agentUser.lastName,
        agentEmail: agentUser.email,
        aiAgentName: sql`(${leads.customFields}::jsonb ->> 'aiAgentName')`,
        agentDisplayName: sql`COALESCE(NULLIF(TRIM(CONCAT(${agentUser.firstName}::text, ' ', ${agentUser.lastName}::text)), ''), (${leads.customFields}::jsonb ->> 'aiAgentName'))`,
        // Approver/Rejector info
        approverFirstName: approverUser.firstName,
        approverLastName: approverUser.lastName,
        rejectorFirstName: rejectorUser.firstName,
        rejectorLastName: rejectorUser.lastName,
      })
      .from(leads)
      .leftJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(agentUser, eq(leads.agentId, agentUser.id))
      .leftJoin(approverUser, eq(leads.approvedById, approverUser.id))
      .leftJoin(rejectorUser, eq(leads.rejectedById, rejectorUser.id));

    // Always exclude deleted leads, plus apply any additional filters
    const baseCondition = isNull(leads.deletedAt);
    
    if (filters) {
      const filterCondition = buildFilterQuery(filters, leads);
      if (filterCondition) {
        query = query.where(and(baseCondition, filterCondition)) as any;
      } else {
        query = query.where(baseCondition) as any;
      }
    } else {
      query = query.where(baseCondition) as any;
    }
    
    const results = await query.orderBy(desc(leads.createdAt));
    
    // Fetch tags for all leads in one query
    if (results.length > 0) {
      const leadIds = results.map(r => r.id);
      const tagAssignments = await db
        .select({ 
          leadId: leadTagAssignments.leadId,
          tag: leadTags 
        })
        .from(leadTagAssignments)
        .innerJoin(leadTags, eq(leadTagAssignments.tagId, leadTags.id))
        .where(inArray(leadTagAssignments.leadId, leadIds));
      
      // Group tags by lead ID
      const tagsByLeadId: Record = {};
      for (const assignment of tagAssignments) {
        if (!tagsByLeadId[assignment.leadId]) {
          tagsByLeadId[assignment.leadId] = [];
        }
        tagsByLeadId[assignment.leadId].push(assignment.tag);
      }
      
      // Attach tags to each lead
      return results.map(lead => ({
        ...lead,
        tags: tagsByLeadId[lead.id] || []
      }));
    }
    
    return results;
  }

  async getLead(id: string): Promise {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead || undefined;
  }

  async getLeadByCallAttemptId(callAttemptId: string): Promise {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.callAttemptId, callAttemptId));
    return lead || undefined;
  }

  async getLeadWithDetails(id: string): Promise {
    const agentUser = alias(users, 'agentUser');
    const approverUser = alias(users, 'approverUser');
    const rejectorUser = alias(users, 'rejectorUser');
    
    const [result] = await db
      .select({
        // Lead fields
        id: leads.id,
        contactId: leads.contactId,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        campaignId: leads.campaignId,
        callAttemptId: leads.callAttemptId,
        recordingUrl: leads.recordingUrl,
        recordingS3Key: leads.recordingS3Key,
        recordingStatus: leads.recordingStatus,
        telnyxCallId: leads.telnyxCallId,
        callDuration: leads.callDuration,
        agentId: leads.agentId,
        qaStatus: leads.qaStatus,
        checklistJson: leads.checklistJson,
        approvedAt: leads.approvedAt,
        approvedById: leads.approvedById,
        rejectedReason: leads.rejectedReason,
        rejectedAt: leads.rejectedAt,
        rejectedById: leads.rejectedById,
        notes: leads.notes,
        transcript: leads.transcript,
        transcriptionStatus: leads.transcriptionStatus,
        aiScore: leads.aiScore,
        aiAnalysis: leads.aiAnalysis,
        aiQualificationStatus: leads.aiQualificationStatus,
        submittedToClient: leads.submittedToClient,
        submittedAt: leads.submittedAt,
        submissionResponse: leads.submissionResponse,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        // Contact info
        contact: {
          id: contacts.id,
          fullName: contacts.fullName,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          directPhone: contacts.directPhone,
          jobTitle: contacts.jobTitle,
          accountId: contacts.accountId,
        },
        // Account info
        account: {
          id: accounts.id,
          name: accounts.name,
          domain: accounts.domain,
          industryStandardized: accounts.industryStandardized,
          staffCount: accounts.staffCount,
          annualRevenue: accounts.annualRevenue,
        },
        // Agent info
        agent: {
          id: agentUser.id,
          firstName: agentUser.firstName,
          lastName: agentUser.lastName,
          email: agentUser.email,
          username: agentUser.username,
        },
        // Approver info
        approver: {
          id: approverUser.id,
          firstName: approverUser.firstName,
          lastName: approverUser.lastName,
          email: approverUser.email,
        },
        // Rejector info
        rejector: {
          id: rejectorUser.id,
          firstName: rejectorUser.firstName,
          lastName: rejectorUser.lastName,
          email: rejectorUser.email,
        },
        // Campaign info
        campaign: {
          id: campaigns.id,
          name: campaigns.name,
          type: campaigns.type,
          status: campaigns.status,
        },
      })
      .from(leads)
      .leftJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(agentUser, eq(leads.agentId, agentUser.id))
      .leftJoin(approverUser, eq(leads.approvedById, approverUser.id))
      .leftJoin(rejectorUser, eq(leads.rejectedById, rejectorUser.id))
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(eq(leads.id, id));
    
    return result || undefined;
  }

  async createLead(insertLead: InsertLead): Promise {
    let leadValues: InsertLead = { ...insertLead };

    if (leadValues.contactId && (!leadValues.accountId || !leadValues.accountName || !leadValues.accountIndustry)) {
      const contact = await this.getContact(leadValues.contactId);
      if (contact) {
        const account = (contact as any).account as { id?: string | null; name?: string | null; industryStandardized?: string | null } | undefined;
        leadValues = {
          ...leadValues,
          accountId: leadValues.accountId ?? contact.accountId ?? account?.id ?? undefined,
          accountName: leadValues.accountName ?? account?.name ?? contact.companyNorm ?? undefined,
          accountIndustry: leadValues.accountIndustry ?? account?.industryStandardized ?? undefined,
        };
      }
    }

    const [lead] = await db.insert(leads).values(leadValues).returning();
    return lead;
  }

  async createLeadFromCallAttempt(callAttemptId: string): Promise {
    console.log('[LEAD CREATION] Creating lead from call attempt:', callAttemptId);

    // Get the call attempt
    const attempt = await this.getCallAttempt(callAttemptId);
    if (!attempt) {
      console.error('[LEAD CREATION] ❌ Call attempt not found:', callAttemptId);
      return undefined;
    }

    // CRITICAL FIX: Explicitly reject voicemail calls - they should NEVER become leads
    if (attempt.voicemailDetected) {
      console.log('[LEAD CREATION] 🚫 VOICEMAIL DETECTED - Rejecting lead creation for voicemail call:', {
        callAttemptId,
        voicemailDetected: attempt.voicemailDetected,
        disposition: attempt.disposition
      });
      return undefined;
    }

    // Also check disposition for voicemail (belt-and-suspenders approach)
    if (attempt.disposition === 'voicemail') {
      console.log('[LEAD CREATION] 🚫 VOICEMAIL DISPOSITION - Rejecting lead creation:', {
        callAttemptId,
        disposition: attempt.disposition
      });
      return undefined;
    }

    // Only create leads for qualified dispositions
    if (attempt.disposition !== 'qualified' && attempt.disposition !== 'qualified_lead') {
      console.log('[LEAD CREATION] ⏭️ Skipping - disposition is not qualified:', attempt.disposition);
      return undefined;
    }

    // DURATION GUARD: Block leads from ghost/short AI calls
    const attemptDuration = attempt.callDurationSeconds || 0;
    const MIN_QUALIFIED_DURATION = 45;
    if (attemptDuration  0) {
      console.log('[LEAD CREATION] ✓ Lead already exists for this call attempt:', existingLeads[0].id);
      return existingLeads[0];
    }

    // Create the lead with call recording details
    const leadData: InsertLead = {
      contactId: contact.id,
      contactName: contactName || undefined,
      contactEmail: contact.email || undefined,
      campaignId: attempt.campaignId,
      callAttemptId: callAttemptId,
      accountId: contact.accountId || account?.id || undefined,
      accountName: account?.name || contact.companyNorm || undefined,
      accountIndustry: account?.industryStandardized || undefined,
      recordingUrl: attempt.recordingUrl || undefined,
      callDuration: attempt.duration || undefined,
      agentId: attempt.agentId,
      qaStatus: 'new',
    };

    const [newLead] = await db.insert(leads).values(leadData).returning();

    console.log('[LEAD CREATION] ✅ Lead created successfully:', {
      leadId: newLead.id,
      contactName: newLead.contactName,
      campaignId: newLead.campaignId,
      hasRecording: !!newLead.recordingUrl
    });

    // Trigger email validation when lead enters QA
    if (contact.email) {
      console.log('[LEAD QA] Triggering email validation for contact:', contact.id);
      
      // Import validation service
      const { validateAndStoreBusinessEmail } = await import('./services/email-validation');
      const { updateAccountEmailDeliverabilityScore } = await import('./services/account-email-scoring');
      
      // Run email validation asynchronously (don't block lead creation)
      validateAndStoreBusinessEmail(contact.id, contact.email, {
        skipSmtp: false, // Use strict SMTP validation for QA leads
      })
        .then(async (validationResult) => {
          console.log(`[LEAD QA] Email validated for contact ${contact.id}:`, validationResult.status);
          
          // Update contact with email status
          await db.update(contacts).set({
            emailStatus: validationResult.status,
            updatedAt: new Date(),
          }).where(eq(contacts.id, contact.id));
          
          // Update account-level email deliverability score
          if (contact.accountId) {
            await updateAccountEmailDeliverabilityScore(contact.accountId);
          }
        })
        .catch((error) => {
          console.error('[LEAD QA] Email validation error for contact:', contact.id, error);
        });
    }

    return newLead;
  }

  async updateLead(id: string, updateData: Partial): Promise {
    const [lead] = await db
      .update(leads)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(leads.id, id))
      .returning();
    return lead || undefined;
  }

  async approveLead(id: string, approvedById: string): Promise {
    const [lead] = await db
      .update(leads)
      .set({
        qaStatus: 'approved',
        approvedAt: new Date(),
        approvedById,
        submittedToClient: true,
        submittedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(leads.id, id))
      .returning();
    return lead || undefined;
  }

  async rejectLead(id: string, reason: string, rejectedById: string): Promise {
    const [lead] = await db
      .update(leads)
      .set({ 
        qaStatus: 'rejected', 
        rejectedReason: reason,
        rejectedAt: new Date(),
        rejectedById,
        updatedAt: new Date()
      })
      .where(eq(leads.id, id))
      .returning();
    return lead || undefined;
  }

  async deleteLead(id: string, deletedById?: string): Promise {
    // Soft delete: set deletedAt timestamp instead of removing record
    await db.update(leads)
      .set({ 
        deletedAt: new Date(),
        deletedById: deletedById || null,
        updatedAt: new Date()
      })
      .where(eq(leads.id, id));
  }

  async getDeletedLeads(): Promise {
    const agentUser = alias(users, 'agent');
    const approverUser = alias(users, 'approver');
    const rejectorUser = alias(users, 'rejector');
    const deleterUser = alias(users, 'deleter');
    
    const results = await db
      .select({
        id: leads.id,
        contactId: leads.contactId,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        campaignId: leads.campaignId,
        callAttemptId: leads.callAttemptId,
        recordingUrl: leads.recordingUrl,
        recordingS3Key: leads.recordingS3Key,
        recordingStatus: leads.recordingStatus,
        telnyxCallId: leads.telnyxCallId,
        callDuration: leads.callDuration,
        dialedNumber: leads.dialedNumber,
        agentId: leads.agentId,
        qaStatus: leads.qaStatus,
        checklistJson: leads.checklistJson,
        approvedAt: leads.approvedAt,
        approvedById: leads.approvedById,
        rejectedReason: leads.rejectedReason,
        rejectedAt: leads.rejectedAt,
        rejectedById: leads.rejectedById,
        notes: leads.notes,
        transcript: leads.transcript,
        transcriptionStatus: leads.transcriptionStatus,
        aiScore: leads.aiScore,
        aiAnalysis: leads.aiAnalysis,
        aiQualificationStatus: leads.aiQualificationStatus,
        submittedToClient: leads.submittedToClient,
        submittedAt: leads.submittedAt,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        deletedAt: leads.deletedAt,
        deletedById: leads.deletedById,
        // Contact info
        contactTitle: contacts.jobTitle,
        contactCity: contacts.city,
        contactState: contacts.state,
        contactCountry: contacts.country,
        contactLinkedin: contacts.linkedinUrl,
        // Account info — prefer joined accounts.name, fall back to denormalized leads.accountName
        accountName: sql`COALESCE(${accounts.name}, ${leads.accountName})`.as('account_name_resolved'),
        accountId: contacts.accountId,
        accountCity: accounts.hqCity,
        accountState: accounts.hqState,
        accountCountry: accounts.hqCountry,
        accountIndustry: sql`COALESCE(${accounts.industryStandardized}, ${leads.accountIndustry})`.as('account_industry_resolved'),
        accountRevenueRange: accounts.revenueRange,
        accountEmployeesRange: accounts.employeesSizeRange,
        accountLinkedin: accounts.linkedinUrl,
        // Agent info
        agentFirstName: agentUser.firstName,
        agentLastName: agentUser.lastName,
        agentEmail: agentUser.email,
        // Approver/Rejector info
        approverFirstName: approverUser.firstName,
        approverLastName: approverUser.lastName,
        rejectorFirstName: rejectorUser.firstName,
        rejectorLastName: rejectorUser.lastName,
        // Deleter info
        deleterFirstName: deleterUser.firstName,
        deleterLastName: deleterUser.lastName,
      })
      .from(leads)
      .leftJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(agentUser, eq(leads.agentId, agentUser.id))
      .leftJoin(approverUser, eq(leads.approvedById, approverUser.id))
      .leftJoin(rejectorUser, eq(leads.rejectedById, rejectorUser.id))
      .leftJoin(deleterUser, eq(leads.deletedById, deleterUser.id))
      .where(isNotNull(leads.deletedAt))
      .orderBy(desc(leads.deletedAt));

    // Fetch tags for all leads in one query
    if (results.length > 0) {
      const leadIds = results.map(r => r.id);
      const tagAssignments = await db
        .select({ 
          leadId: leadTagAssignments.leadId,
          tag: leadTags 
        })
        .from(leadTagAssignments)
        .innerJoin(leadTags, eq(leadTagAssignments.tagId, leadTags.id))
        .where(inArray(leadTagAssignments.leadId, leadIds));
      
      const tagsByLeadId: Record = {};
      for (const assignment of tagAssignments) {
        if (!tagsByLeadId[assignment.leadId]) {
          tagsByLeadId[assignment.leadId] = [];
        }
        tagsByLeadId[assignment.leadId].push(assignment.tag);
      }
      
      return results.map(lead => ({
        ...lead,
        tags: tagsByLeadId[lead.id] || []
      }));
    }
    
    return results;
  }

  async restoreLead(id: string): Promise {
    const [lead] = await db.update(leads)
      .set({ 
        deletedAt: null,
        deletedById: null,
        updatedAt: new Date()
      })
      .where(eq(leads.id, id))
      .returning();
    return lead || undefined;
  }

  async bulkRestoreLeads(ids: string[]): Promise {
    if (ids.length === 0) return 0;
    const result = await db.update(leads)
      .set({ 
        deletedAt: null,
        deletedById: null,
        updatedAt: new Date()
      })
      .where(inArray(leads.id, ids))
      .returning({ id: leads.id });
    return result.length;
  }

  // Lead Tags
  async getLeadTags(): Promise {
    return await db.select().from(leadTags).orderBy(leadTags.name);
  }

  async getLeadTag(id: string): Promise {
    const [tag] = await db.select().from(leadTags).where(eq(leadTags.id, id));
    return tag || undefined;
  }

  async createLeadTag(tag: InsertLeadTag): Promise {
    const [created] = await db.insert(leadTags).values(tag).returning();
    return created;
  }

  async updateLeadTag(id: string, tag: Partial): Promise {
    const [updated] = await db.update(leadTags).set({ ...tag, updatedAt: new Date() }).where(eq(leadTags.id, id)).returning();
    return updated || undefined;
  }

  async deleteLeadTag(id: string): Promise {
    await db.delete(leadTags).where(eq(leadTags.id, id));
  }

  async getTagsForLead(leadId: string): Promise {
    const assignments = await db
      .select({ tag: leadTags })
      .from(leadTagAssignments)
      .innerJoin(leadTags, eq(leadTagAssignments.tagId, leadTags.id))
      .where(eq(leadTagAssignments.leadId, leadId));
    return assignments.map(a => a.tag);
  }

  async addTagToLead(leadId: string, tagId: string, assignedById?: string): Promise {
    await db.insert(leadTagAssignments).values({ leadId, tagId, assignedById }).onConflictDoNothing();
  }

  async removeTagFromLead(leadId: string, tagId: string): Promise {
    await db.delete(leadTagAssignments).where(and(eq(leadTagAssignments.leadId, leadId), eq(leadTagAssignments.tagId, tagId)));
  }

  async addTagToLeads(leadIds: string[], tagId: string, assignedById?: string): Promise {
    if (leadIds.length === 0) return;
    const values = leadIds.map(leadId => ({ leadId, tagId, assignedById }));
    await db.insert(leadTagAssignments).values(values).onConflictDoNothing();
  }

  async removeTagFromLeads(leadIds: string[], tagId: string): Promise {
    if (leadIds.length === 0) return;
    await db.delete(leadTagAssignments).where(and(inArray(leadTagAssignments.leadId, leadIds), eq(leadTagAssignments.tagId, tagId)));
  }

  // Suppressions
  async getEmailSuppressions(): Promise {
    return await db.select().from(suppressionEmails).orderBy(desc(suppressionEmails.createdAt));
  }

  async addEmailSuppression(insertSuppression: InsertSuppressionEmail): Promise {
    const [suppression] = await db.insert(suppressionEmails).values(insertSuppression).returning();
    return suppression;
  }

  async deleteEmailSuppression(id: number): Promise {
    await db.delete(suppressionEmails).where(eq(suppressionEmails.id, id));
  }

  async isEmailSuppressed(email: string): Promise {
    const [result] = await db
      .select()
      .from(suppressionEmails)
      .where(eq(suppressionEmails.email, email.toLowerCase()))
      .limit(1);
    return !!result;
  }

  async checkEmailSuppressionBulk(emails: string[]): Promise> {
    if (emails.length === 0) return new Set();

    const normalizedEmails = emails.map(e => e.toLowerCase());
    const suppressedRecords = await db
      .select()
      .from(suppressionEmails)
      .where(inArray(suppressionEmails.email, normalizedEmails));

    return new Set(suppressedRecords.map(r => r.email));
  }

  async getPhoneSuppressions(): Promise{
    return await db.select().from(suppressionPhones).orderBy(desc(suppressionPhones.createdAt));
  }

  async addPhoneSuppression(insertSuppression: InsertSuppressionPhone): Promise {
    const [suppression] = await db.insert(suppressionPhones).values(insertSuppression).returning();
    return suppression;
  }

  async deletePhoneSuppression(id: number): Promise {
    await db.delete(suppressionPhones).where(eq(suppressionPhones.id, id));
  }

  async isPhoneSuppressed(phoneE164: string): Promise {
    const [result] = await db
      .select()
      .from(suppressionPhones)
      .where(eq(suppressionPhones.phoneE164, phoneE164))
      .limit(1);
    return !!result;
  }

  async checkPhoneSuppressionBulk(phonesE164: string[]): Promise> {
    if (phonesE164.length === 0) return new Set();

    const suppressedRecords = await db
      .select()
      .from(suppressionPhones)
      .where(inArray(suppressionPhones.phoneE164, phonesE164));

    return new Set(suppressedRecords.map(r => r.phoneE164));
  }

  // Campaign Orders
  async getCampaignOrders(filters?: any): Promise {
    return await db.select().from(campaignOrders).orderBy(desc(campaignOrders.createdAt));
  }

  async getCampaignOrder(id: string): Promise {
    const [order] = await db.select().from(campaignOrders).where(eq(campaignOrders.id, id));
    return order || undefined;
  }

  async createCampaignOrder(insertOrder: InsertCampaignOrder): Promise {
    const [order] = await db.insert(campaignOrders).values(insertOrder).returning();
    return order;
  }

  async updateCampaignOrder(id: string, updateData: Partial): Promise {
    const [order] = await db
      .update(campaignOrders)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(campaignOrders.id, id))
      .returning();
    return order || undefined;
  }

  // Order Campaign Links (Bridge Model)
  async getOrderCampaignLinks(orderId: string): Promise {
    return await db
      .select()
      .from(orderCampaignLinks)
      .where(eq(orderCampaignLinks.orderId, orderId))
      .orderBy(desc(orderCampaignLinks.linkedAt));
  }

  async createOrderCampaignLink(insertLink: InsertOrderCampaignLink): Promise {
    const [link] = await db.insert(orderCampaignLinks).values(insertLink as any).returning();
    return link;
  }

  async deleteOrderCampaignLink(id: string): Promise {
    await db.delete(orderCampaignLinks).where(eq(orderCampaignLinks.id, id));
  }

  // Bulk Imports
  async getBulkImports(): Promise {
    return await db.select().from(bulkImports).orderBy(desc(bulkImports.createdAt));
  }

  async createBulkImport(insertBulkImport: InsertBulkImport): Promise {
    const [bulkImport] = await db.insert(bulkImports).values(insertBulkImport as any).returning();
    return bulkImport;
  }

  async getBulkImport(id: string): Promise {
    const [bulkImport] = await db.select().from(bulkImports).where(eq(bulkImports.id, id));
    return bulkImport || undefined;
  }

  async updateBulkImport(id: string, updateData: Partial): Promise {
    const [bulkImport] = await db
      .update(bulkImports)
      .set(updateData)
      .where(eq(bulkImports.id, id))
      .returning();
    return bulkImport || undefined;
  }

  // Email Messages
  async createEmailMessage(insertMessage: InsertEmailMessage): Promise {
    const [message] = await db.insert(emailMessages).values(insertMessage).returning();
    return message;
  }

  async getEmailMessagesByCampaign(campaignId: string): Promise {
    return await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.campaignId, campaignId))
      .orderBy(desc(emailMessages.createdAt));
  }

  // Calls
  async createCall(insertCall: InsertCall): Promise {
    const [call] = await db.insert(calls).values(insertCall).returning();
    return call;
  }

  async getCallsByCampaign(campaignId: string): Promise {
    return await db
      .select()
      .from(calls)
      .where(eq(calls.campaignId, campaignId))
      .orderBy(desc(calls.createdAt));
  }

  // Audit Logs
  async createAuditLog(insertLog: InsertAuditLog): Promise {
    const [log] = await db.insert(auditLogs).values(insertLog as any).returning();
    return log;
  }

  async getAuditLogs(filters?: any): Promise {
    return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
  }

  // Activity Logs
  async createActivityLog(insertLog: InsertActivityLog): Promise {
    const [log] = await db.insert(activityLog).values(insertLog).returning();
    return log;
  }

  async getActivityLogs(
    entityType: 'contact' | 'account' | 'campaign' | 'call_job' | 'call_session' | 'lead' | 'user' | 'email_message',
    entityId: string,
    limit: number = 50
  ): Promise {
    return await db
      .select()
      .from(activityLog)
      .where(
        and(
          eq(activityLog.entityType, entityType),
          eq(activityLog.entityId, entityId)
        )
      )
      .orderBy(desc(activityLog.createdAt))
      .limit(limit);
  }

  // Saved Filters
  async getSavedFilters(userId: string, entityType?: string): Promise {
    let query = db.select().from(savedFilters).where(eq(savedFilters.userId, userId));

    if (entityType) {
      return await query.where(
        and(
          eq(savedFilters.userId, userId),
          eq(savedFilters.entityType, entityType)
        )
      ).orderBy(desc(savedFilters.createdAt));
    }

    return await query.orderBy(desc(savedFilters.createdAt));
  }

  async getSavedFilter(id: string, userId: string): Promise {
    const [filter] = await db
      .select()
      .from(savedFilters)
      .where(and(eq(savedFilters.id, id), eq(savedFilters.userId, userId)));
    return filter || undefined;
  }

  async createSavedFilter(insertFilter: InsertSavedFilter): Promise {
    const [filter] = await db.insert(savedFilters).values(insertFilter).returning();
    return filter;
  }

  async updateSavedFilter(id: string, userId: string, updateData: Partial): Promise {
    const [filter] = await db
      .update(savedFilters)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(savedFilters.id, id), eq(savedFilters.userId, userId)))
      .returning();
    return filter || undefined;
  }

  async deleteSavedFilter(id: string, userId: string): Promise {
    const result = await db
      .delete(savedFilters)
      .where(and(eq(savedFilters.id, id), eq(savedFilters.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Selection Contexts (for bulk operations)
  async getSelectionContext(id: string, userId: string): Promise {
    const now = new Date();
    const [context] = await db
      .select()
      .from(selectionContexts)
      .where(and(
        eq(selectionContexts.id, id),
        eq(selectionContexts.userId, userId),
        sql`${selectionContexts.expiresAt} > ${now}` // Only return non-expired contexts
      ));
    return context || undefined;
  }

  async createSelectionContext(insertContext: InsertSelectionContext & { expiresAt: Date }): Promise {
    const [context] = await db.insert(selectionContexts).values(insertContext as any).returning();
    return context;
  }

  async deleteSelectionContext(id: string, userId: string): Promise {
    const result = await db
      .delete(selectionContexts)
      .where(and(eq(selectionContexts.id, id), eq(selectionContexts.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteExpiredSelectionContexts(): Promise {
    const now = new Date();
    const result = await db
      .delete(selectionContexts)
      .where(sql`${selectionContexts.expiresAt}  {
    let query = db
      .select()
      .from(filterFieldRegistry)
      .where(eq(filterFieldRegistry.visibleInFilters, true))
      .orderBy(filterFieldRegistry.category, filterFieldRegistry.sortOrder);

    if (category) {
      query = query.where(
        and(
          eq(filterFieldRegistry.visibleInFilters, true),
          eq(filterFieldRegistry.category, category)
        )
      ) as any;
    }

    return await query;
  }

  async getFilterFieldsByEntity(entity: string): Promise {
    return await db
      .select()
      .from(filterFieldRegistry)
      .where(
        and(
          eq(filterFieldRegistry.entity, entity),
          eq(filterFieldRegistry.visibleInFilters, true)
        )
      )
      .orderBy(filterFieldRegistry.sortOrder);
  }

  // Industry Reference (Standardized Taxonomy)
  async getIndustries(activeOnly: boolean = true): Promise {
    let query = db
      .select()
      .from(industryReference)
      .orderBy(industryReference.name);

    if (activeOnly) {
      query = query.where(eq(industryReference.isActive, true)) as any;
    }

    return await query;
  }

  async searchIndustries(query: string, limit: number = 50): Promise {
    return await db
      .select()
      .from(industryReference)
      .where(
        and(
          eq(industryReference.isActive, true),
          or(
            like(industryReference.name, `%${query}%`),
            sql`${query} = ANY(${industryReference.synonyms})`
          )
        )
      )
      .orderBy(industryReference.name)
      .limit(limit);
  }

  async getIndustryById(id: string): Promise {
    const [industry] = await db
      .select()
      .from(industryReference)
      .where(eq(industryReference.id, id));
    return industry || undefined;
  }

  // Company Size Reference (Standardized Employee Ranges)
  async getCompanySizes(activeOnly: boolean = true): Promise {
    let query = db
      .select()
      .from(companySizeReference)
      .orderBy(companySizeReference.sortOrder);

    if (activeOnly) {
      query = query.where(eq(companySizeReference.isActive, true)) as any;
    }

    return await query;
  }

  async getCompanySizeByCode(code: string): Promise {
    const [size] = await db
      .select()
      .from(companySizeReference)
      .where(eq(companySizeReference.code, code));
    return size || undefined;
  }

  // Revenue Range Reference (Standardized Annual Revenue Brackets)
  async getRevenueRanges(activeOnly: boolean = true): Promise {
    let query = db
      .select()
      .from(revenueRangeReference)
      .orderBy(revenueRangeReference.sortOrder);

    if (activeOnly) {
      query = query.where(eq(revenueRangeReference.isActive, true)) as any;
    }

    return await query;
  }

  async getRevenueRangeByLabel(label: string): Promise {
    const [range] = await db
      .select()
      .from(revenueRangeReference)
      .where(eq(revenueRangeReference.label, label));
    return range || undefined;
  }

  // Dual-Industry Management (Phase 8)
  async updateAccountIndustry(
    id: string, 
    data: { primary?: string; secondary?: string[]; code?: string }
  ): Promise {
    const updateData: any = { updatedAt: new Date() };

    if (data.primary !== undefined) {
      updateData.industryStandardized = data.primary;
    }
    if (data.secondary !== undefined) {
      updateData.industrySecondary = data.secondary;
    }
    if (data.code !== undefined) {
      updateData.industryCode = data.code;
    }

    const [account] = await db
      .update(accounts)
      .set(updateData)
      .where(eq(accounts.id, id))
      .returning();

    return account || undefined;
  }

  async reviewAccountIndustryAI(
    id: string, 
    userId: string, 
    review: { accept_primary?: string; add_secondary?: string[]; reject?: string[] }
  ): Promise {
    const account = await this.getAccount(id);
    if (!account) return undefined;

    const updateData: any = {
      industryAiReviewedBy: userId,
      industryAiReviewedAt: new Date(),
      updatedAt: new Date(),
    };

    // Handle accept_primary - replaces primary industry
    if (review.accept_primary) {
      updateData.industryStandardized = review.accept_primary;
    }

    // Handle add_secondary - appends to secondary industries array
    if (review.add_secondary && review.add_secondary.length > 0) {
      const currentSecondary = account.industrySecondary || [];
      updateData.industrySecondary = [
        ...currentSecondary,
        ...review.add_secondary.filter(s => !currentSecondary.includes(s))
      ];
    }

    // Determine AI status based on review actions
    if (review.accept_primary && !review.add_secondary?.length && !review.reject?.length) {
      updateData.industryAiStatus = 'accepted';
    } else if (review.reject && review.reject.length > 0 && !review.accept_primary && !review.add_secondary?.length) {
      updateData.industryAiStatus = 'rejected';
    } else if ((review.accept_primary || review.add_secondary?.length) && review.reject?.length) {
      updateData.industryAiStatus = 'partial';
    } else if (review.accept_primary || review.add_secondary?.length) {
      updateData.industryAiStatus = 'accepted';
    }

    // Clear AI suggestions after review
    updateData.industryAiCandidates = null;

    const [updated] = await db
      .update(accounts)
      .set(updateData)
      .where(eq(accounts.id, id))
      .returning();

    return updated || undefined;
  }

  async getAccountsNeedingReview(limit: number = 50): Promise {
    return await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.industryAiStatus, 'pending'),
          sql`${accounts.industryAiConfidence}::float >= 0.5`
        )
      )
      .orderBy(sql`${accounts.industryAiConfidence}::float DESC`)
      .limit(limit);
  }

  // Domain Sets (Phase 21) - Renamed to Accounts List (TAL)
  async getDomainSets(userId?: string): Promise {
    let query = db.select().from(domainSets);

    if (userId) {
      query = query.where(eq(domainSets.ownerId, userId)) as any;
    }

    return await query.orderBy(desc(domainSets.createdAt));
  }

  async getDomainSet(id: string): Promise {
    const [domainSet] = await db.select().from(domainSets).where(eq(domainSets.id, id));
    return domainSet || undefined;
  }

  async createDomainSet(insertDomainSet: InsertDomainSet): Promise {
    const [domainSet] = await db.insert(domainSets).values(insertDomainSet).returning();
    return domainSet;
  }

  async updateDomainSet(id: string, updateData: Partial): Promise {
    const [domainSet] = await db
      .update(domainSets)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(domainSets.id, id))
      .returning();
    return domainSet || undefined;
  }

  async deleteDomainSet(id: string): Promise {
    await db.delete(domainSets).where(eq(domainSets.id, id));
  }

  // Domain Set Items
  async getDomainSetItems(domainSetId: string): Promise {
    return await db
      .select()
      .from(domainSetItems)
      .where(eq(domainSetItems.domainSetId, domainSetId))
      .orderBy(domainSetItems.createdAt);
  }

  async createDomainSetItem(item: InsertDomainSetItem): Promise {
    const [created] = await db.insert(domainSetItems).values(item).returning();
    return created;
  }

  async createDomainSetItemsBulk(items: InsertDomainSetItem[]): Promise {
    if (items.length === 0) return [];
    return await db.insert(domainSetItems).values(items).returning();
  }

  async updateDomainSetItem(id: string, updateData: Partial): Promise {
    const [item] = await db
      .update(domainSetItems)
      .set(updateData)
      .where(eq(domainSetItems.id, id))
      .returning();
    return item || undefined;
  }

  // Domain Set Contact Links
  async getDomainSetContactLinks(domainSetId: string): Promise {
    return await db
      .select()
      .from(domainSetContactLinks)
      .where(eq(domainSetContactLinks.domainSetId, domainSetId))
      .orderBy(domainSetContactLinks.createdAt);
  }

  async createDomainSetContactLink(link: InsertDomainSetContactLink): Promise {
    const [created] = await db.insert(domainSetContactLinks).values(link).returning();
    return created;
  }

  async createDomainSetContactLinksBulk(links: InsertDomainSetContactLink[]): Promise {
    if (links.length === 0) return [];
    return await db.insert(domainSetContactLinks).values(links).returning();
  }

  // Domain Set Operations
  async processDomainSetMatching(domainSetId: string): Promise {
    // Import domain utils
    const { normalizeDomain, getMatchTypeAndConfidence, extractCompanyNameFromDomain } = await import('@shared/domain-utils');

    // Get the domain set
    const domainSet = await this.getDomainSet(domainSetId);
    if (!domainSet) throw new Error('Domain set not found');

    // Get all items for this set
    const items = await this.getDomainSetItems(domainSetId);

    // Get all accounts for matching
    const allAccounts = await db.select().from(accounts);

    let matchedAccounts = 0;
    let matchedContacts = 0;
    let unknownDomains = 0;

    // Process each domain item
    for (const item of items) {
      const normalizedDomain = normalizeDomain(item.domain);
      
      // Try exact domain match first
      const exactDomainMatch = allAccounts.find(acc => 
        acc.domain && normalizeDomain(acc.domain) === normalizedDomain
      );

      if (exactDomainMatch) {
        // Exact domain match found
        await this.updateDomainSetItem(item.id, {
          normalizedDomain,
          accountId: exactDomainMatch.id,
          matchType: 'exact',
          matchConfidence: '1.00',
          matchedBy: 'domain',
        });
        matchedAccounts++;

        // Count contacts for this account
        const accountContacts = await this.getContactsByAccountId(exactDomainMatch.id);
        await this.updateDomainSetItem(item.id, {
          matchedContactsCount: accountContacts.length,
        });
        matchedContacts += accountContacts.length;
      } else {
        // Try fuzzy matching (domain + name)
        let bestMatch: { account: typeof allAccounts[0]; confidence: number; matchedBy?: string } | null = null;

        for (const account of allAccounts) {
          // Use the full matching function with both domain and account name from CSV
          const matchResult = getMatchTypeAndConfidence(
            item.domain,
            item.accountName || undefined,  // Pass account name from CSV
            account.domain || '',
            account.name
          );

          if ((matchResult.matchType === 'exact' || matchResult.matchType === 'fuzzy') && 
              (!bestMatch || matchResult.confidence > bestMatch.confidence)) {
            bestMatch = { 
              account, 
              confidence: matchResult.confidence,
              matchedBy: matchResult.matchedBy
            };
          }
        }

        if (bestMatch) {
          // Match found (exact name or fuzzy domain/name)
          await this.updateDomainSetItem(item.id, {
            normalizedDomain,
            accountId: bestMatch.account.id,
            matchType: bestMatch.confidence === 1.0 ? 'exact' : 'fuzzy',
            matchConfidence: bestMatch.confidence.toFixed(2),
            matchedBy: bestMatch.matchedBy || 'domain',
          });
          matchedAccounts++;

          // Count contacts
          const accountContacts = await this.getContactsByAccountId(bestMatch.account.id);
          await this.updateDomainSetItem(item.id, {
            matchedContactsCount: accountContacts.length,
          });
          matchedContacts += accountContacts.length;
        } else {
          // No match found
          await this.updateDomainSetItem(item.id, {
            normalizedDomain,
            matchType: 'none',
            matchConfidence: '0.00',
            matchedBy: null,
          });
          unknownDomains++;
        }
      }
    }

    // Update domain set stats
    await this.updateDomainSet(domainSetId, {
      matchedAccounts,
      matchedContacts,
      unknownDomains,
      status: 'completed',
    });
  }

  async findLeadByAiCallId(aiCallId: string): Promise {
    const [lead] = await db
      .select()
      .from(leads)
      .where(sql`(${leads.customFields}->>'aiCallId') = ${aiCallId}`)
      .limit(1);
    return lead || undefined;
  }

  async expandDomainSetToContacts(domainSetId: string, filters?: any): Promise {
    // Get all items with matched accounts
    const items = await this.getDomainSetItems(domainSetId);
    const accountIds = items
      .filter(item => item.accountId)
      .map(item => item.accountId as string);

    if (accountIds.length === 0) return [];

    // Get all contacts for these accounts
    let contacts: Contact[] = [];
    for (const accountId of accountIds) {
      const accountContacts = await this.getContactsByAccountId(accountId);
      contacts.push(...accountContacts);
    }

    // Apply additional filters if provided (title, seniority, etc.)
    // This is a simplified version - full implementation would use FilterGroup

    return contacts;
  }

  async convertDomainSetToList(domainSetId: string, listName: string, userId: string): Promise {
    // Get all contacts from the domain set
    const contacts = await this.expandDomainSetToContacts(domainSetId);
    const contactIds = contacts.map(c => c.id);

    // Create a new list
    const list = await this.createList({
      name: listName,
      description: `Generated from domain set`,
      entityType: 'contact',
      sourceType: 'manual_upload',
      sourceRef: domainSetId,
      recordIds: contactIds,
      ownerId: userId,
      tags: ['domain-set'],
      visibilityScope: 'private',
    });

    return list;
  }

  // ==================== CONTENT STUDIO ====================

  async getContentAssets(): Promise {
    return await db.select().from(contentAssets).orderBy(contentAssets.updatedAt);
  }

  async getContentAsset(id: string): Promise {
    const result = await db.select().from(contentAssets).where(eq(contentAssets.id, id));
    return result[0] || null;
  }

  async createContentAsset(data: InsertContentAsset & { ownerId: string }): Promise {
    const result = await db.insert(contentAssets).values(data as any).returning();
    return result[0];
  }

  async updateContentAsset(id: string, data: Partial): Promise {
    const result = await db.update(contentAssets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contentAssets.id, id))
      .returning();
    return result[0] || null;
  }

  async deleteContentAsset(id: string): Promise {
    const result = await db.delete(contentAssets).where(eq(contentAssets.id, id)).returning();
    return result.length > 0;
  }

  // ==================== SOCIAL POSTS ====================

  async getSocialPosts(): Promise {
    return await db.select().from(socialPosts).orderBy(socialPosts.createdAt);
  }

  async getSocialPost(id: string): Promise {
    const result = await db.select().from(socialPosts).where(eq(socialPosts.id, id));
    return result[0] || null;
  }

  async createSocialPost(data: InsertSocialPost): Promise {
    const result = await db.insert(socialPosts).values(data).returning();
    return result[0];
  }

  async updateSocialPost(id: string, data: Partial): Promise {
    const result = await db.update(socialPosts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(socialPosts.id, id))
      .returning();
    return result[0] || null;
  }

  async deleteSocialPost(id: string): Promise {
    const result = await db.delete(socialPosts).where(eq(socialPosts.id, id)).returning();
    return result.length > 0;
  }

  // ==================== AI CONTENT GENERATION ====================

  async createAIContentGeneration(data: InsertAIContentGeneration): Promise {
    const result = await db.insert(aiContentGenerations).values(data).returning();
    return result[0];
  }

  async getAIContentGenerations(userId?: string): Promise {
    if (userId) {
      return await db.select().from(aiContentGenerations)
        .where(eq(aiContentGenerations.userId, userId))
        .orderBy(aiContentGenerations.createdAt);
    }
    return await db.select().from(aiContentGenerations).orderBy(aiContentGenerations.createdAt);
  }

  // ==================== CONTENT PUSH TRACKING ====================

  async createContentPush(data: InsertContentAssetPush): Promise {
    const result = await db.insert(contentAssetPushes).values(data).returning();
    return result[0];
  }

  async getContentPushes(assetId: string): Promise {
    return await db.select().from(contentAssetPushes)
      .where(eq(contentAssetPushes.assetId, assetId))
      .orderBy(contentAssetPushes.createdAt);
  }

  async getContentPush(id: string): Promise {
    const result = await db.select().from(contentAssetPushes)
      .where(eq(contentAssetPushes.id, id));
    return result[0] || null;
  }

  async updateContentPush(id: string, data: Partial): Promise {
    const result = await db.update(contentAssetPushes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contentAssetPushes.id, id))
      .returning();
    return result[0] || null;
  }

  async getLatestContentPush(assetId: string): Promise {
    const result = await db.select().from(contentAssetPushes)
      .where(eq(contentAssetPushes.assetId, assetId))
      .orderBy(desc(contentAssetPushes.createdAt))
      .limit(1);
    return result[0] || null;
  }

  // ==================== EVENTS ====================

  async getEvents(): Promise {
    return await db.select().from(events).orderBy(desc(events.createdAt));
  }

  async getEvent(id: string): Promise {
    const result = await db.select().from(events).where(eq(events.id, id));
    return result[0] || null;
  }

  async getEventBySlug(slug: string): Promise {
    const result = await db.select().from(events).where(eq(events.slug, slug));
    return result[0] || null;
  }

  async createEvent(data: InsertEvent): Promise {
    const result = await db.insert(events).values(data).returning();
    return result[0];
  }

  async updateEvent(id: string, data: Partial): Promise {
    const result = await db.update(events)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    return result[0] || null;
  }

  async deleteEvent(id: string): Promise {
    const result = await db.delete(events).where(eq(events.id, id)).returning();
    return result.length > 0;
  }

  // ==================== RESOURCES ====================

  async getResources(): Promise {
    return await db.select().from(resources).orderBy(desc(resources.createdAt));
  }

  async getResource(id: string): Promise {
    const result = await db.select().from(resources).where(eq(resources.id, id));
    return result[0] || null;
  }

  async getResourceBySlug(slug: string): Promise {
    const result = await db.select().from(resources).where(eq(resources.slug, slug));
    return result[0] || null;
  }

  async createResource(data: InsertResource): Promise {
    const result = await db.insert(resources).values(data).returning();
    return result[0];
  }

  async updateResource(id: string, data: Partial): Promise {
    const result = await db.update(resources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(resources.id, id))
      .returning();
    return result[0] || null;
  }

  async deleteResource(id: string): Promise {
    const result = await db.delete(resources).where(eq(resources.id, id)).returning();
    return result.length > 0;
  }

  // ==================== NEWS ====================

  async getNews(): Promise {
    return await db.select().from(news).orderBy(desc(news.createdAt));
  }

  async getNewsItem(id: string): Promise {
    const result = await db.select().from(news).where(eq(news.id, id));
    return result[0] || null;
  }

  async getNewsBySlug(slug: string): Promise {
    const result = await db.select().from(news).where(eq(news.slug, slug));
    return result[0] || null;
  }

  async createNews(data: InsertNews): Promise {
    const result = await db.insert(news).values(data).returning();
    return result[0];
  }

  async updateNews(id: string, data: Partial): Promise {
    const result = await db.update(news)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(news.id, id))
      .returning();
    return result[0] || null;
  }

  async deleteNews(id: string): Promise {
    const result = await db.delete(news).where(eq(news.id, id)).returning();
    return result.length > 0;
  }

  // ==================== EMAIL INFRASTRUCTURE (Phase 26) ====================

  // Sender Profiles
  async getSenderProfiles(): Promise {
    return await db.select().from(senderProfiles).orderBy(desc(senderProfiles.createdAt));
  }

  async getSenderProfile(id: string): Promise {
    const [profile] = await db.select().from(senderProfiles).where(eq(senderProfiles.id, id));
    return profile || undefined;
  }

  async createSenderProfile(profile: InsertSenderProfile): Promise {
    const [result] = await db.insert(senderProfiles).values(profile).returning();
    return result;
  }

  async updateSenderProfile(id: string, profile: Partial): Promise {
    const [result] = await db.update(senderProfiles)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(senderProfiles.id, id))
      .returning();
    return result || undefined;
  }

  async deleteSenderProfile(id: string): Promise {
    await db.delete(senderProfiles).where(eq(senderProfiles.id, id));
  }

  // Domain Authentication
  async getDomainAuths(): Promise {
    return await db.select().from(domainAuth).orderBy(desc(domainAuth.createdAt));
  }

  async getDomainAuth(id: number): Promise {
    const [result] = await db.select().from(domainAuth).where(eq(domainAuth.id, id));
    return result || undefined;
  }

  async getDomainAuthByDomain(domain: string): Promise {
    const [result] = await db.select().from(domainAuth).where(eq(domainAuth.domain, domain));
    return result || undefined;
  }

  async createDomainAuth(data: InsertDomainAuth): Promise {
    const [result] = await db.insert(domainAuth).values(data).returning();
    return result;
  }

  async updateDomainAuth(id: number, data: Partial): Promise {
    const [result] = await db.update(domainAuth)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(domainAuth.id, id))
      .returning();
    return result || undefined;
  }

  async deleteDomainAuth(id: number): Promise {
    console.log("[Storage] Attempting to delete domain auth with id:", id);
    const result = await db.delete(domainAuth).where(eq(domainAuth.id, id)).returning();
    console.log("[Storage] Delete result:", result.length > 0 ? "Domain deleted" : "Domain not found");
  }

  async verifyDomainAuth(id: number): Promise {
    // Placeholder for DNS verification logic
    // In production, this would call DNS verification APIs
    const [result] = await db.update(domainAuth)
      .set({ 
        lastCheckedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(domainAuth.id, id))
      .returning();
    return result || undefined;
  }

  // Tracking Domains
  async getTrackingDomains(): Promise {
    return await db.select().from(trackingDomains).orderBy(desc(trackingDomains.createdAt));
  }

  async getTrackingDomain(id: number): Promise {
    const [result] = await db.select().from(trackingDomains).where(eq(trackingDomains.id, id));
    return result || undefined;
  }

  async createTrackingDomain(data: InsertTrackingDomain): Promise {
    const [result] = await db.insert(trackingDomains).values(data).returning();
    return result;
  }

  async updateTrackingDomain(id: number, data: Partial): Promise {
    const [result] = await db.update(trackingDomains)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(trackingDomains.id, id))
      .returning();
    return result || undefined;
  }

  async deleteTrackingDomain(id: number): Promise {
    await db.delete(trackingDomains).where(eq(trackingDomains.id, id));
  }

  // IP Pools
  async getIpPools(): Promise {
    return await db.select().from(ipPools).orderBy(desc(ipPools.createdAt));
  }

  async getIpPool(id: number): Promise {
    const [result] = await db.select().from(ipPools).where(eq(ipPools.id, id));
    return result || undefined;
  }

  async createIpPool(data: InsertIpPool): Promise {
    const [result] = await db.insert(ipPools).values(data).returning();
    return result;
  }

  async updateIpPool(id: number, data: Partial): Promise {
    const [result] = await db.update(ipPools)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ipPools.id, id))
      .returning();
    return result || undefined;
  }

  async deleteIpPool(id: number): Promise {
    await db.delete(ipPools).where(eq(ipPools.id, id));
  }

  // Send Policies
  async getSendPolicies(): Promise {
    return await db.select().from(sendPolicies).orderBy(desc(sendPolicies.createdAt));
  }

  async getSendPolicy(id: number): Promise {
    const [result] = await db.select().from(sendPolicies).where(eq(sendPolicies.id, id));
    return result || undefined;
  }

  async createSendPolicy(data: InsertSendPolicy): Promise {
    const [result] = await db.insert(sendPolicies).values(data).returning();
    return result;
  }

  async updateSendPolicy(id: number, data: Partial): Promise {
    const [result] = await db.update(sendPolicies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sendPolicies.id, id))
      .returning();
    return result || undefined;
  }

  async deleteSendPolicy(id: number): Promise {
    await db.delete(sendPolicies).where(eq(sendPolicies.id, id));
  }

  // ==================== PIPELINES ====================
  async listPipelines(): Promise {
    return await db.select().from(pipelines).orderBy(desc(pipelines.createdAt));
  }

  async getPipeline(id: string): Promise {
    const [record] = await db.select().from(pipelines).where(eq(pipelines.id, id));
    return record || undefined;
  }

  async createPipeline(data: InsertPipeline & { id?: string }): Promise {
    const payload = {
      ...data,
      id: data.id ?? crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [record] = await db
      .insert(pipelines)
      .values(payload as any)
      .returning();

    return record;
  }

  async updatePipeline(id: string, data: Partial): Promise {
    const [record] = await db
      .update(pipelines)
      .set({ ...(data as any), updatedAt: new Date() })
      .where(eq(pipelines.id, id))
      .returning();

    return record || undefined;
  }

  async deletePipeline(id: string): Promise {
    await db.delete(pipelines).where(eq(pipelines.id, id));
  }

  async listPipelineOpportunities(
    pipelineId: string,
  ): Promise> {
    const rows = await db
      .select({
        opportunity: pipelineOpportunities,
        accountName: accounts.name,
        accountDomain: accounts.domain,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
        ownerFirstName: users.firstName,
        ownerLastName: users.lastName,
      })
      .from(pipelineOpportunities)
      .leftJoin(accounts, eq(pipelineOpportunities.accountId, accounts.id))
      .leftJoin(contacts, eq(pipelineOpportunities.contactId, contacts.id))
      .leftJoin(users, eq(pipelineOpportunities.ownerId, users.id))
      .where(eq(pipelineOpportunities.pipelineId, pipelineId))
      .orderBy(desc(pipelineOpportunities.updatedAt));

    return rows.map((row) => ({
      ...row.opportunity,
      accountName: row.accountName ?? null,
      accountDomain: row.accountDomain ?? null,
      contactName: row.contactFirstName || row.contactLastName
        ? [row.contactFirstName, row.contactLastName].filter(Boolean).join(' ')
        : null,
      contactEmail: row.contactEmail ?? null,
      ownerName: row.ownerFirstName || row.ownerLastName
        ? [row.ownerFirstName, row.ownerLastName].filter(Boolean).join(' ')
        : null,
    }));
  }

  async getPipelineOpportunity(id: string): Promise {
    const [record] = await db.select().from(pipelineOpportunities).where(eq(pipelineOpportunities.id, id));
    return record || undefined;
  }

  async createPipelineOpportunity(
    data: InsertPipelineOpportunity & { id?: string },
  ): Promise {
    const payload = {
      ...data,
      id: data.id ?? crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [record] = await db.insert(pipelineOpportunities).values(payload as any).returning();
    return record;
  }

  async updatePipelineOpportunity(
    id: string,
    data: Partial,
  ): Promise {
    const [record] = await db
      .update(pipelineOpportunities)
      .set({ ...(data as any), updatedAt: new Date() })
      .where(eq(pipelineOpportunities.id, id))
      .returning();

    return record || undefined;
  }

  async deletePipelineOpportunity(id: string): Promise {
    await db.delete(pipelineOpportunities).where(eq(pipelineOpportunities.id, id));
  }

  async getOpportunitiesByAccountId(accountId: string): Promise> {
    const results = await db
      .select({
        opportunity: pipelineOpportunities,
        pipelineName: pipelines.name,
      })
      .from(pipelineOpportunities)
      .leftJoin(pipelines, eq(pipelineOpportunities.pipelineId, pipelines.id))
      .where(eq(pipelineOpportunities.accountId, accountId))
      .orderBy(desc(pipelineOpportunities.createdAt));

    return results.map(row => ({
      ...row.opportunity,
      pipelineName: row.pipelineName || 'Unknown Pipeline',
      pipelineId: row.opportunity.pipelineId,
    }));
  }

  async getOpportunitiesByContactId(contactId: string): Promise> {
    const results = await db
      .select({
        opportunity: pipelineOpportunities,
        pipelineName: pipelines.name,
      })
      .from(pipelineOpportunities)
      .leftJoin(pipelines, eq(pipelineOpportunities.pipelineId, pipelines.id))
      .where(eq(pipelineOpportunities.contactId, contactId))
      .orderBy(desc(pipelineOpportunities.createdAt));

    return results.map(row => ({
      ...row.opportunity,
      pipelineName: row.pipelineName || 'Unknown Pipeline',
      pipelineId: row.opportunity.pipelineId,
    }));
  }

  async getMailboxAccount(userId: string, provider: string): Promise {
    const [record] = await db
      .select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.userId, userId), eq(mailboxAccounts.provider, provider)))
      .limit(1);

    return record || undefined;
  }

  async getMailboxAccountById(id: string): Promise {
    const [record] = await db
      .select()
      .from(mailboxAccounts)
      .where(eq(mailboxAccounts.id, id))
      .limit(1);

    return record || undefined;
  }

  async getAllMailboxAccounts(provider?: string): Promise {
    let records;
    if (provider) {
      records = await db.select().from(mailboxAccounts).where(eq(mailboxAccounts.provider, provider));
    } else {
      records = await db.select().from(mailboxAccounts);
    }
    
    // Map database fields to frontend interface
    return records.map(record => ({
      id: record.id,
      mailboxEmail: record.mailboxEmail || '',
      mailboxName: record.displayName || record.mailboxEmail || 'Unknown',
      provider: record.provider,
      isActive: record.status === 'connected',
      lastSyncAt: record.lastSyncAt ? record.lastSyncAt.toISOString() : undefined,
    }));
  }

  async getMailboxAccountsByUserId(userId: string): Promise {
    const records = await db
      .select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.userId, userId), not(eq(mailboxAccounts.status, 'disconnected'))));

    return records.map(record => ({
      id: record.id,
      mailboxEmail: record.mailboxEmail || '',
      mailboxName: record.displayName || record.mailboxEmail || 'Unknown',
      provider: record.provider,
      isActive: record.status === 'connected',
      lastSyncAt: record.lastSyncAt ? record.lastSyncAt.toISOString() : undefined,
    }));
  }

  async createMailboxAccount(account: InsertMailboxAccount & { id?: string }): Promise {
    const payload = {
      ...account,
      id: account.id ?? crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [record] = await db.insert(mailboxAccounts).values(payload).returning();
    return record;
  }

  async updateMailboxAccount(
    id: string,
    account: Partial,
  ): Promise {
    const [record] = await db
      .update(mailboxAccounts)
      .set({ ...account, updatedAt: new Date() })
      .where(eq(mailboxAccounts.id, id))
      .returning();

    return record || undefined;
  }

  // ==================== M365 ACTIVITIES ====================
  async getM365Activities(
    mailboxAccountId: string,
    options?: { limit?: number; accountId?: string; contactId?: string }
  ): Promise {
    const conditions = [eq(m365Activities.mailboxAccountId, mailboxAccountId)];

    if (options?.accountId) {
      conditions.push(eq(m365Activities.accountId, options.accountId));
    }
    if (options?.contactId) {
      conditions.push(eq(m365Activities.contactId, options.contactId));
    }

    let query = db
      .select()
      .from(m365Activities)
      .where(and(...conditions))
      .orderBy(desc(m365Activities.receivedDateTime));

    if (options?.limit) {
      query = query.limit(options.limit) as any;
    }

    return await query;
  }

  async getM365Activity(id: string): Promise {
    const [record] = await db.select().from(m365Activities).where(eq(m365Activities.id, id)).limit(1);
    return record || undefined;
  }

  async getM365ActivityByMessageId(
    mailboxAccountId: string,
    messageId: string
  ): Promise {
    const [record] = await db
      .select()
      .from(m365Activities)
      .where(and(eq(m365Activities.mailboxAccountId, mailboxAccountId), eq(m365Activities.messageId, messageId)))
      .limit(1);
    return record || undefined;
  }

  async createM365Activity(activity: InsertM365Activity): Promise {
    const payload = {
      ...activity,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };

    const [record] = await db.insert(m365Activities).values(payload).returning();
    return record;
  }

  async createM365ActivitiesBulk(activities: InsertM365Activity[]): Promise {
    if (activities.length === 0) return [];

    const payload = activities.map(activity => ({
      ...activity,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    }));

    const records = await db.insert(m365Activities).values(payload).returning();
    return records;
  }

  async updateM365Activity(
    id: string,
    activity: Partial
  ): Promise {
    const [record] = await db
      .update(m365Activities)
      .set(activity)
      .where(eq(m365Activities.id, id))
      .returning();

    return record || undefined;
  }

  async getActivitiesByAccount(accountId: string, limit: number = 50): Promise {
    return await db
      .select()
      .from(m365Activities)
      .where(eq(m365Activities.accountId, accountId))
      .orderBy(desc(m365Activities.receivedDateTime))
      .limit(limit);
  }

  async getActivitiesByContact(contactId: string, limit: number = 50): Promise {
    return await db
      .select()
      .from(m365Activities)
      .where(eq(m365Activities.contactId, contactId))
      .orderBy(desc(m365Activities.receivedDateTime))
      .limit(limit);
  }

  // ==================== DEAL CONVERSATIONS & MESSAGES ====================
  async getDealConversations(opportunityId: string, options?: { limit?: number }): Promise {
    const limit = options?.limit || 50;
    return await db
      .select()
      .from(dealConversations)
      .where(eq(dealConversations.opportunityId, opportunityId))
      .orderBy(desc(dealConversations.lastMessageAt))
      .limit(limit);
  }

  async getDealConversation(id: string): Promise {
    const [conversation] = await db
      .select()
      .from(dealConversations)
      .where(eq(dealConversations.id, id));
    return conversation;
  }

  async getDealConversationByThreadId(threadId: string, opportunityId: string): Promise {
    const [conversation] = await db
      .select()
      .from(dealConversations)
      .where(and(
        eq(dealConversations.threadId, threadId),
        eq(dealConversations.opportunityId, opportunityId)
      ));
    return conversation;
  }

  async createDealConversation(data: InsertDealConversation & { id?: string }): Promise {
    const id = data.id || crypto.randomUUID();
    const [conversation] = await db
      .insert(dealConversations)
      .values({ ...data, id })
      .returning();
    return conversation!;
  }

  async updateDealConversation(id: string, data: Partial): Promise {
    const [updated] = await db
      .update(dealConversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dealConversations.id, id))
      .returning();
    return updated;
  }

  async getDealMessages(conversationId: string, options?: { limit?: number }): Promise {
    const limit = options?.limit || 100;
    return await db
      .select()
      .from(dealMessages)
      .where(eq(dealMessages.conversationId, conversationId))
      .orderBy(dealMessages.sentAt)
      .limit(limit);
  }

  async getDealMessage(id: string): Promise {
    const [message] = await db
      .select()
      .from(dealMessages)
      .where(eq(dealMessages.id, id));
    return message;
  }

  async getDealMessageByM365Id(m365MessageId: string): Promise {
    const [message] = await db
      .select()
      .from(dealMessages)
      .where(eq(dealMessages.m365MessageId, m365MessageId));
    return message;
  }

  async createDealMessage(data: InsertDealMessage & { id?: string }): Promise {
    const id = data.id || crypto.randomUUID();
    const [message] = await db
      .insert(dealMessages)
      .values({ ...data, id })
      .returning();
    return message!;
  }

  async updateDealMessage(id: string, data: Partial): Promise {
    const [updated] = await db
      .update(dealMessages)
      .set(data)
      .where(eq(dealMessages.id, id))
      .returning();
    return updated;
  }

  async getOpportunityMessages(opportunityId: string, options?: { limit?: number }): Promise {
    const limit = options?.limit || 100;
    return await db
      .select()
      .from(dealMessages)
      .where(eq(dealMessages.opportunityId, opportunityId))
      .orderBy(desc(dealMessages.sentAt))
      .limit(limit);
  }

  async getOpportunitiesByContactIds(contactIds: string[]): Promise {
    if (contactIds.length === 0) return [];
    
    return await db
      .select()
      .from(pipelineOpportunities)
      .where(
        or(
          ...contactIds.map(cId => eq(pipelineOpportunities.contactId, cId))
        )
      );
  }

  // ==================== EMAIL SEQUENCES ====================
  async getEmailSequences(): Promise {
    return await db.select().from(emailSequences).orderBy(desc(emailSequences.createdAt));
  }

  async getEmailSequence(id: string): Promise {
    const [record] = await db.select().from(emailSequences).where(eq(emailSequences.id, id));
    return record || undefined;
  }

  async createEmailSequence(data: InsertEmailSequence & { id?: string }): Promise {
    const payload = {
      ...data,
      id: data.id ?? crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [record] = await db.insert(emailSequences).values(payload).returning();
    return record;
  }

  async updateEmailSequence(id: string, data: Partial): Promise {
    const [record] = await db
      .update(emailSequences)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(emailSequences.id, id))
      .returning();

    return record || undefined;
  }

  async deleteEmailSequence(id: string): Promise {
    await db.delete(emailSequences).where(eq(emailSequences.id, id));
  }

  // ==================== SEQUENCE STEPS ====================
  async getSequenceSteps(sequenceId: string): Promise {
    return await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId))
      .orderBy(sequenceSteps.stepNumber);
  }

  async getSequenceStep(id: string): Promise {
    const [record] = await db.select().from(sequenceSteps).where(eq(sequenceSteps.id, id));
    return record || undefined;
  }

  async createSequenceStep(data: InsertSequenceStep & { id?: string }): Promise {
    const payload = {
      ...data,
      id: data.id ?? crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [record] = await db.insert(sequenceSteps).values(payload).returning();
    return record;
  }

  async updateSequenceStep(id: string, data: Partial): Promise {
    const [record] = await db
      .update(sequenceSteps)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sequenceSteps.id, id))
      .returning();

    return record || undefined;
  }

  async deleteSequenceStep(id: string): Promise {
    await db.delete(sequenceSteps).where(eq(sequenceSteps.id, id));
  }

  // ==================== SEQUENCE ENROLLMENTS ====================
  async getSequenceEnrollments(sequenceId?: string, contactId?: string): Promise {
    let query = db.select().from(sequenceEnrollments);

    if (sequenceId && contactId) {
      return await query
        .where(and(
          eq(sequenceEnrollments.sequenceId, sequenceId),
          eq(sequenceEnrollments.contactId, contactId)
        ))
        .orderBy(desc(sequenceEnrollments.enrolledAt));
    } else if (sequenceId) {
      return await query
        .where(eq(sequenceEnrollments.sequenceId, sequenceId))
        .orderBy(desc(sequenceEnrollments.enrolledAt));
    } else if (contactId) {
      return await query
        .where(eq(sequenceEnrollments.contactId, contactId))
        .orderBy(desc(sequenceEnrollments.enrolledAt));
    }

    return await query.orderBy(desc(sequenceEnrollments.enrolledAt));
  }

  async getSequenceEnrollment(id: string): Promise {
    const [record] = await db.select().from(sequenceEnrollments).where(eq(sequenceEnrollments.id, id));
    return record || undefined;
  }

  async createSequenceEnrollment(data: InsertSequenceEnrollment & { id?: string }): Promise {
    const payload = {
      ...data,
      id: data.id ?? crypto.randomUUID(),
      enrolledAt: new Date(),
      lastActivityAt: new Date(),
    };

    const [record] = await db.insert(sequenceEnrollments).values(payload).returning();
    return record;
  }

  async updateSequenceEnrollment(id: string, data: Partial): Promise {
    const [record] = await db
      .update(sequenceEnrollments)
      .set({ ...data, lastActivityAt: new Date() })
      .where(eq(sequenceEnrollments.id, id))
      .returning();

    return record || undefined;
  }

  async stopSequenceEnrollment(id: string, reason: string): Promise {
    const [record] = await db
      .update(sequenceEnrollments)
      .set({
        status: 'stopped',
        stopReason: reason as any,
        stoppedAt: new Date(),
        lastActivityAt: new Date(),
      })
      .where(eq(sequenceEnrollments.id, id))
      .returning();

    return record || undefined;
  }

  async getActiveEnrollmentForContact(sequenceId: string, contactId: string): Promise {
    const [record] = await db
      .select()
      .from(sequenceEnrollments)
      .where(and(
        eq(sequenceEnrollments.sequenceId, sequenceId),
        eq(sequenceEnrollments.contactId, contactId),
        eq(sequenceEnrollments.status, 'active')
      ));

    return record || undefined;
  }

  // ==================== AUTO-DIALER QUEUE ====================
  async getAllAutoDialerQueues(activeOnly: boolean = false): Promise {
    if (activeOnly) {
      return await db.select().from(autoDialerQueues).where(eq(autoDialerQueues.isActive, true));
    }
    return await db.select().from(autoDialerQueues);
  }

  async getAutoDialerQueue(campaignId: string) {
    const [queue] = await db.select().from(autoDialerQueues).where(eq(autoDialerQueues.campaignId, campaignId));
    return queue || undefined;
  }

  async createAutoDialerQueue(data: any): Promise {
    const [queue] = await db.insert(autoDialerQueues).values(data).returning();
    return queue;
  }

  async updateAutoDialerQueue(campaignId: string, data: any): Promise {
    const [queue] = await db.update(autoDialerQueues)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(autoDialerQueues.campaignId, campaignId))
      .returning();
    return queue || undefined;
  }

  // Agent Status Management
  async getAvailableAgents(): Promise {
    return await db.select().from(agentStatus).where(eq(agentStatus.status, 'available'));
  }

  async updateAgentStatus(agentId: string, data: any): Promise {
    const [status] = await db.update(agentStatus)
      .set({ ...data, lastStatusChangeAt: new Date(), updatedAt: new Date() })
      .where(eq(agentStatus.agentId, agentId))
      .returning();
    return status || undefined;
  }

  async upsertAgentStatus(data: any): Promise {
    const [status] = await db.insert(agentStatus)
      .values({ ...data, lastStatusChangeAt: new Date() })
      .onConflictDoUpdate({
        target: agentStatus.agentId,
        set: {
          status: data.status,
          campaignId: data.campaignId,
          currentCallId: data.currentCallId,
          lastStatusChangeAt: new Date(),
          lastCallEndedAt: data.lastCallEndedAt,
          totalCallsToday: data.totalCallsToday,
          totalTalkTimeToday: data.totalTalkTimeToday,
          updatedAt: new Date(),
        },
      })
      .returning();
    return status;
  }

  async getAgentStatus(agentId: string): Promise {
    const [status] = await db.select().from(agentStatus).where(eq(agentStatus.agentId, agentId));
    return status || undefined;
  }

  async getAllAgentStatuses(campaignId?: string): Promise {
    if (campaignId) {
      return await db.select().from(agentStatus).where(eq(agentStatus.campaignId, campaignId));
    }
    return await db.select().from(agentStatus);
  }

  async toggleAutoDialerQueue(campaignId: string, isActive: boolean): Promise {
    const [queue] = await db.update(autoDialerQueues)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(autoDialerQueues.campaignId, campaignId))
      .returning();
    return queue || undefined;
  }

  async assignRole(userId: string, role: string): Promise {
    return this.assignUserRole(userId, role);
  }

  // OI Batch Pipeline
  async createOiBatchJob(data: InsertOiBatchJob): Promise {
    const [job] = await db.insert(oiBatchJobs).values(data).returning();
    return job;
  }

  async getOiBatchJob(id: string): Promise {
    const [job] = await db.select().from(oiBatchJobs).where(eq(oiBatchJobs.id, id));
    return job || undefined;
  }

  async updateOiBatchJob(id: string, data: Partial): Promise {
    const [job] = await db.update(oiBatchJobs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(oiBatchJobs.id, id))
      .returning();
    return job || undefined;
  }

  async listOiBatchJobs(limit = 50, offset = 0): Promise {
    return db.select().from(oiBatchJobs)
      .orderBy(desc(oiBatchJobs.createdAt))
      .limit(limit)
      .offset(offset);
  }
}

export const storage = new DatabaseStorage();