import { db } from '../db';
import { clientUsers, clientAccounts, clientProjects, clientPortalOrders } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export class NotificationService {
  private apiKey: string;
  private domain: string;
  private apiBase: string;
  private adminEmail: string;

  constructor() {
    this.apiKey = process.env.MAILGUN_API_KEY || '';
    this.domain = process.env.MAILGUN_DOMAIN || '';
    this.apiBase = process.env.MAILGUN_API_BASE || 'https://api.mailgun.net/v3';
    this.adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@pivotal-b2b.com';
  }

  private async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.apiKey || !this.domain) {
      console.log(`[NotificationService] Mailgun not configured. Skipping email to ${options.to}: ${options.subject}`);
      return false;
    }

    try {
      const formData = new FormData();
      formData.append('from', `Pivotal B2B <notifications@${this.domain}>`);
      formData.append('to', options.to);
      formData.append('subject', options.subject);
      formData.append('html', options.html);

      const auth = Buffer.from(`api:${this.apiKey}`).toString('base64');
      
      const response = await fetch(`${this.apiBase}/${this.domain}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[NotificationService] Mailgun error: ${text}`);
        return false;
      }

      console.log(`[NotificationService] Sent email to ${options.to}: ${options.subject}`);
      return true;
    } catch (error) {
      console.error('[NotificationService] Send error:', error);
      return false;
    }
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
    await this.sendEmail({ to: this.adminEmail, subject, html });
  }

  async notifyClientOfProjectApproval(project: typeof clientProjects.$inferSelect, clientEmail: string) {
    const subject = `Campaign Approved: ${project.name}`;
    const html = `
      <h2>Campaign Approved</h2>
      <p>Your campaign request "<strong>${project.name}</strong>" has been approved and is now Active.</p>
      <p>You can now view the campaign details in your dashboard.</p>
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
    await this.sendEmail({ to: this.adminEmail, subject, html });
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
