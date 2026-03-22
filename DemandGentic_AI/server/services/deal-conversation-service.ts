import { storage } from "../storage";
import type { M365Activity, InsertDealConversation, InsertDealMessage, PipelineOpportunity } from "@shared/schema";

interface EmailParticipants {
  from: string;
  to: string[];
  cc: string[];
}

interface EmailSyncContext {
  m365Activity: M365Activity;
  threadId?: string;
  conversationId?: string;
  subject: string;
  participants: EmailParticipants;
  direction: "inbound" | "outbound";
  mailboxEmail: string;
}

export class DealConversationService {
  private tenantMailboxes: Set = new Set();
  private lastMailboxSync: number = 0;
  private readonly MAILBOX_CACHE_TTL = 5 * 60 * 1000;

  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  private async getTenantMailboxAddresses(): Promise> {
    const now = Date.now();
    if (this.tenantMailboxes.size > 0 && (now - this.lastMailboxSync)  m.mailboxEmail)
        .filter(Boolean)
        .map(e => this.normalizeEmail(e!))
    );
    this.lastMailboxSync = now;
    return this.tenantMailboxes;
  }

  private async filterExternalParticipants(emails: string[]): Promise {
    const tenantMailboxes = await this.getTenantMailboxAddresses();
    return emails.filter(email => !tenantMailboxes.has(this.normalizeEmail(email)));
  }

  private extractAllParticipants(participants: EmailParticipants): string[] {
    const all = [
      participants.from,
      ...participants.to,
      ...(participants.cc || [])
    ];
    return [...new Set(all.map(e => this.normalizeEmail(e)))];
  }

  async findMatchingOpportunities(participantEmails: string[]): Promise {
    if (participantEmails.length === 0) return [];

    const externalParticipants = await this.filterExternalParticipants(participantEmails);
    if (externalParticipants.length === 0) return [];

    const normalizedEmails = externalParticipants.map(e => this.normalizeEmail(e));
    
    const contacts = await storage.getContactsByEmails(normalizedEmails);
    if (contacts.length === 0) return [];

    const contactIds = contacts.map(c => c.id);
    const opportunities = await storage.getOpportunitiesByContactIds(contactIds);

    return opportunities.filter(opp => opp.status === 'open');
  }

  async processEmailSync(context: EmailSyncContext): Promise {
    const allParticipants = this.extractAllParticipants(context.participants);
    
    const externalParticipants = await this.filterExternalParticipants(allParticipants);

    if (externalParticipants.length === 0) {
      return { conversationsCreated: 0, messagesCreated: 0 };
    }

    const matchingOpportunities = await this.findMatchingOpportunities(externalParticipants);

    if (matchingOpportunities.length === 0) {
      return { conversationsCreated: 0, messagesCreated: 0 };
    }

    let conversationsCreated = 0;
    let messagesCreated = 0;

    for (const opportunity of matchingOpportunities) {
      try {
        const existingMessage = await storage.getDealMessageByM365Id(context.m365Activity.messageId);
        if (existingMessage) {
          continue;
        }

        let conversation;
        if (context.threadId) {
          conversation = await storage.getDealConversationByThreadId(context.threadId, opportunity.id);
        }

        if (!conversation) {
          const conversationData: InsertDealConversation = {
            opportunityId: opportunity.id,
            subject: context.subject || "(No Subject)",
            threadId: context.threadId || null,
            participantEmails: externalParticipants,
            messageCount: 1,
            lastMessageAt: context.m365Activity.receivedDateTime || context.m365Activity.sentDateTime || new Date(),
            direction: context.direction,
            status: 'active'
          };

          conversation = await storage.createDealConversation(conversationData);
          conversationsCreated++;
        } else {
          const existingExternal = await this.filterExternalParticipants(conversation.participantEmails || []);
          const updatedParticipants = [...new Set([...existingExternal, ...externalParticipants])];
          
          await storage.updateDealConversation(conversation.id, {
            messageCount: (conversation.messageCount || 0) + 1,
            lastMessageAt: context.m365Activity.receivedDateTime || context.m365Activity.sentDateTime || new Date(),
            participantEmails: updatedParticipants
          });
        }

        const messageData: InsertDealMessage = {
          conversationId: conversation.id,
          opportunityId: opportunity.id,
          m365MessageId: context.m365Activity.messageId,
          fromEmail: context.participants.from,
          toEmails: context.participants.to,
          ccEmails: context.participants.cc || [],
          subject: context.subject,
          bodyPreview: context.m365Activity.bodyPreview || null,
          bodyContent: null,
          direction: context.direction,
          messageStatus: 'delivered',
          sentAt: context.m365Activity.sentDateTime || null,
          receivedAt: context.m365Activity.receivedDateTime || null,
          isFromCustomer: context.direction === 'inbound',
          hasAttachments: context.m365Activity.hasAttachments || false,
          importance: 'normal'
        };

        await storage.createDealMessage(messageData);
        messagesCreated++;

      } catch (error) {
        console.error(`[DealConversationService] Error processing opportunity ${opportunity.id}:`, error);
      }
    }

    return { conversationsCreated, messagesCreated };
  }

  async sendEmailFromOpportunity(params: {
    opportunityId: string;
    mailboxAccountId: string;
    to: string[];
    cc?: string[];
    subject: string;
    body: string;
    m365MessageId: string;
    threadId?: string;
  }): Promise {
    const { opportunityId, to, cc, subject, body, m365MessageId, threadId, mailboxAccountId } = params;

    const mailboxAccount = await storage.getMailboxAccountById(mailboxAccountId);
    if (!mailboxAccount) {
      throw new Error("Mailbox account not found");
    }

    const externalRecipients = await this.filterExternalParticipants([...to, ...(cc || [])]);

    let conversation;
    if (threadId) {
      const existingConversation = await storage.getDealConversationByThreadId(threadId, opportunityId);
      
      if (existingConversation && existingConversation.opportunityId !== opportunityId) {
        throw new Error("ThreadId does not belong to this opportunity");
      }
      
      conversation = existingConversation;
    }

    const allParticipants = [mailboxAccount.mailboxEmail!, ...externalRecipients];

    if (!conversation) {
      const conversationData: InsertDealConversation = {
        opportunityId,
        subject,
        threadId: threadId || null,
        participantEmails: allParticipants,
        messageCount: 1,
        lastMessageAt: new Date(),
        direction: 'outbound',
        status: 'active'
      };

      conversation = await storage.createDealConversation(conversationData);
    } else {
      await storage.updateDealConversation(conversation.id, {
        messageCount: (conversation.messageCount || 0) + 1,
        lastMessageAt: new Date(),
        participantEmails: [...new Set([...(conversation.participantEmails || []), ...allParticipants])]
      });
    }

    const messageData: InsertDealMessage = {
      conversationId: conversation.id,
      opportunityId,
      m365MessageId,
      fromEmail: mailboxAccount.mailboxEmail!,
      toEmails: to,
      ccEmails: cc || [],
      subject,
      bodyPreview: body.substring(0, 255),
      bodyContent: body,
      direction: 'outbound',
      messageStatus: 'sent',
      sentAt: new Date(),
      receivedAt: null,
      isFromCustomer: false,
      hasAttachments: false,
      importance: 'normal'
    };

    const message = await storage.createDealMessage(messageData);

    return {
      conversationId: conversation.id,
      messageId: message.id
    };
  }

  async getOpportunityConversations(opportunityId: string, options?: { limit?: number }) {
    const conversations = await storage.getDealConversations(opportunityId, options);
    
    const conversationsWithMessages = await Promise.all(
      conversations.map(async (conversation) => {
        const messages = await storage.getDealMessages(conversation.id, { limit: 100 });
        return {
          ...conversation,
          messages
        };
      })
    );

    return conversationsWithMessages;
  }
}

export const dealConversationService = new DealConversationService();