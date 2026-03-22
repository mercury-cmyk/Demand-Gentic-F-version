import { db } from '../db';
import { clientUsers, clientAccounts, clientProjects, clientPortalOrders } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { mercuryEmailService } from './mercury/email-service';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

interface ClientRequestNotificationInput {
  requestRef: string;
  title: string;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  requestType?: string | null;
  targetLeadCount?: number | null;
  budget?: string | number | null;
}

export class NotificationService {
  private adminEmails: string[];

  constructor() {
    this.adminEmails = (process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@pivotal-b2b.com')
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean);
  }

  private async sendEmail(options: EmailOptions): Promise {
    try {
      const result = await mercuryEmailService.sendDirect({
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      if (!result.success) {
        console.error(`[NotificationService] Mercury send failed to ${options.to}: ${result.error || 'Unknown error'}`);
        return false;
      }

      console.log(`[NotificationService] Sent via Mercury SMTP to ${options.to}: ${options.subject}`);
      return true;
    } catch (error) {
      console.error('[NotificationService] Send error:', error);
      return false;
    }
  }

  private async sendToAllAdmins(subject: string, html: string): Promise {
    if (this.adminEmails.length === 0) {
      console.log('[NotificationService] No admin recipients configured');
      return;
    }

    await Promise.all(
      this.adminEmails.map((email) => this.sendEmail({ to: email, subject, html }))
    );
  }

  // --- Campaign/Project Notifications ---

  async notifyAdminOfNewProject(project: typeof clientProjects.$inferSelect, clientName: string) {
    const subject = `New Campaign Request: ${project.name}`;
    const html = `
      New Campaign Request
      Client: ${clientName}
      Campaign Name: ${project.name}
      Description: ${project.description || 'N/A'}
      Budget: ${project.budgetCurrency} ${project.budgetAmount || '0.00'}
      Please review explicitly in the Admin Portal.
    `;
    await this.sendToAllAdmins(subject, html);
  }

  async notifyClientOfProjectApprovalOld(project: typeof clientProjects.$inferSelect, clientEmail: string) {
    const subject = `Campaign Approved: ${project.name}`;
    const html = `
      Campaign Approved
      Your campaign request "${project.name}" has been approved and is now Active.
      You can now view the campaign details in your dashboard.
    `;
    await this.sendEmail({ to: clientEmail, subject, html });
  }

  async notifyClientOfProjectApproval(clientAccountId: string, projectName: string, campaignId?: string) {
    const clientEmail = await this.getClientAccountPrimaryEmail(clientAccountId);
    if (!clientEmail) {
      console.log(`[NotificationService] No email found for client account ${clientAccountId}`);
      return;
    }
    const subject = `Project Approved: ${projectName}`;
    const html = `
      Project Approved
      Your project "${projectName}" has been approved and is now active.
      ${campaignId ? 'A campaign has been automatically created for your project. You can view it in your dashboard.' : ''}
      Login to your portal to view details and track progress.
    `;
    await this.sendEmail({ to: clientEmail, subject, html });
  }

  async notifyClientOfProjectRejection(clientAccountId: string, projectName: string, reason: string) {
    const clientEmail = await this.getClientAccountPrimaryEmail(clientAccountId);
    if (!clientEmail) {
      console.log(`[NotificationService] No email found for client account ${clientAccountId}`);
      return;
    }
    const subject = `Project Request: ${projectName}`;
    const html = `
      Project Request Update
      Your project request "${projectName}" could not be approved at this time.
      Reason: ${reason}
      Please contact your account manager for more details or submit a revised request.
    `;
    await this.sendEmail({ to: clientEmail, subject, html });
  }

  // --- Order/Lead Notifications ---

  async notifyAdminOfNewOrder(order: typeof clientPortalOrders.$inferSelect, clientName: string) {
    const subject = `New Order Request: ${order.orderNumber}`;
    const html = `
      New Order Request
      Client: ${clientName}
      Order #: ${order.orderNumber}
      Quantity: ${order.requestedQuantity}
      Status: ${order.status}
      Please review order #${order.orderNumber} in the Admin Portal.
    `;
    await this.sendToAllAdmins(subject, html);
  }

  async notifyAdminOfClientRequest(
    request: ClientRequestNotificationInput,
    clientName: string,
    category: 'order' | 'campaign' = 'order'
  ) {
    const categoryLabel = category === 'campaign' ? 'Campaign Request' : 'Order Request';
    const subject = `New ${categoryLabel}: ${request.requestRef}`;
    const html = `
      New ${categoryLabel}
      Client: ${clientName}
      Reference: ${request.requestRef}
      Title: ${request.title}
      Type: ${request.requestType || 'N/A'}
      Status: ${request.status || 'submitted'}
      Priority: ${request.priority || 'normal'}
      Target Leads: ${request.targetLeadCount ?? 'N/A'}
      Budget: ${request.budget ?? 'N/A'}
      Description: ${request.description || 'N/A'}
      Please review this request in the Admin Portal.
    `;

    await this.sendToAllAdmins(subject, html);
  }

  async notifyClientOfOrderApproval(order: typeof clientPortalOrders.$inferSelect, clientEmail: string) {
    const subject = `Order Approved: ${order.orderNumber}`;
    const html = `
      Order Approved
      Your order #${order.orderNumber} has been approved.
      Approved Quantity: ${order.approvedQuantity}
      We will begin fulfillment shortly.
    `;
    await this.sendEmail({ to: clientEmail, subject, html });
  }

  async notifyClientOfOrderDelivery(order: typeof clientPortalOrders.$inferSelect, clientEmail: string) {
    const subject = `Order Delivered: ${order.orderNumber}`;
    const html = `
      Order Delivered
      Good news! Your order #${order.orderNumber} has been fulfilled.
      Delivered Quantity: ${order.deliveredQuantity}
      You can login to the portal to view your leads.
    `;
    await this.sendEmail({ to: clientEmail, subject, html });
  }

  async getClientUserEmail(clientUserId: string | null): Promise {
    if (!clientUserId) return null;
    const [user] = await db.select().from(clientUsers).where(eq(clientUsers.id, clientUserId));
    return user ? user.email : null;
  }
  
  async getClientAccountPrimaryEmail(clientAccountId: string): Promise {
     // Fallback if no specific user is attached to the action, use account contact email
     const [account] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, clientAccountId));
     return account ? account.contactEmail : null;
  }
}

export const notificationService = new NotificationService();