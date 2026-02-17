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

  private async sendEmail(options: EmailOptions): Promise<boolean> {
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

  private async sendToAllAdmins(subject: string, html: string): Promise<void> {
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
      <h2>New Campaign Request</h2>
      <p><strong>Client:</strong> ${clientName}</p>
      <p><strong>Campaign Name:</strong> ${project.name}</p>
      <p><strong>Description:</strong> ${project.description || 'N/A'}</p>
      <p><strong>Budget:</strong> ${project.budgetCurrency} ${project.budgetAmount || '0.00'}</p>
      <p>Please review explicitly in the Admin Portal.</p>
    `;
    await this.sendToAllAdmins(subject, html);
  }

  async notifyClientOfProjectApprovalOld(project: typeof clientProjects.$inferSelect, clientEmail: string) {
    const subject = `Campaign Approved: ${project.name}`;
    const html = `
      <h2>Campaign Approved</h2>
      <p>Your campaign request "<strong>${project.name}</strong>" has been approved and is now Active.</p>
      <p>You can now view the campaign details in your dashboard.</p>
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
      <h2>Project Approved</h2>
      <p>Your project "<strong>${projectName}</strong>" has been approved and is now active.</p>
      ${campaignId ? '<p>A campaign has been automatically created for your project. You can view it in your dashboard.</p>' : ''}
      <p>Login to your portal to view details and track progress.</p>
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
      <h2>Project Request Update</h2>
      <p>Your project request "<strong>${projectName}</strong>" could not be approved at this time.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p>Please contact your account manager for more details or submit a revised request.</p>
    `;
    await this.sendEmail({ to: clientEmail, subject, html });
  }

  // --- Order/Lead Notifications ---

  async notifyAdminOfNewOrder(order: typeof clientPortalOrders.$inferSelect, clientName: string) {
    const subject = `New Order Request: ${order.orderNumber}`;
    const html = `
      <h2>New Order Request</h2>
      <p><strong>Client:</strong> ${clientName}</p>
      <p><strong>Order #:</strong> ${order.orderNumber}</p>
      <p><strong>Quantity:</strong> ${order.requestedQuantity}</p>
      <p><strong>Status:</strong> ${order.status}</p>
      <p>Please review order #${order.orderNumber} in the Admin Portal.</p>
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
      <h2>New ${categoryLabel}</h2>
      <p><strong>Client:</strong> ${clientName}</p>
      <p><strong>Reference:</strong> ${request.requestRef}</p>
      <p><strong>Title:</strong> ${request.title}</p>
      <p><strong>Type:</strong> ${request.requestType || 'N/A'}</p>
      <p><strong>Status:</strong> ${request.status || 'submitted'}</p>
      <p><strong>Priority:</strong> ${request.priority || 'normal'}</p>
      <p><strong>Target Leads:</strong> ${request.targetLeadCount ?? 'N/A'}</p>
      <p><strong>Budget:</strong> ${request.budget ?? 'N/A'}</p>
      <p><strong>Description:</strong> ${request.description || 'N/A'}</p>
      <p>Please review this request in the Admin Portal.</p>
    `;

    await this.sendToAllAdmins(subject, html);
  }

  async notifyClientOfOrderApproval(order: typeof clientPortalOrders.$inferSelect, clientEmail: string) {
    const subject = `Order Approved: ${order.orderNumber}`;
    const html = `
      <h2>Order Approved</h2>
      <p>Your order #${order.orderNumber} has been approved.</p>
      <p><strong>Approved Quantity:</strong> ${order.approvedQuantity}</p>
      <p>We will begin fulfillment shortly.</p>
    `;
    await this.sendEmail({ to: clientEmail, subject, html });
  }

  async notifyClientOfOrderDelivery(order: typeof clientPortalOrders.$inferSelect, clientEmail: string) {
    const subject = `Order Delivered: ${order.orderNumber}`;
    const html = `
      <h2>Order Delivered</h2>
      <p>Good news! Your order #${order.orderNumber} has been fulfilled.</p>
      <p><strong>Delivered Quantity:</strong> ${order.deliveredQuantity}</p>
      <p>You can login to the portal to view your leads.</p>
    `;
    await this.sendEmail({ to: clientEmail, subject, html });
  }

  async getClientUserEmail(clientUserId: string | null): Promise<string | null> {
    if (!clientUserId) return null;
    const [user] = await db.select().from(clientUsers).where(eq(clientUsers.id, clientUserId));
    return user ? user.email : null;
  }
  
  async getClientAccountPrimaryEmail(clientAccountId: string): Promise<string | null> {
     // Fallback if no specific user is attached to the action, use account contact email
     const [account] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, clientAccountId));
     return account ? account.contactEmail : null;
  }
}

export const notificationService = new NotificationService();
