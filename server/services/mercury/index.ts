/**
 * Mercury Bridge — Module Index
 * 
 * Central re-exports for the Mercury notification system.
 */

export { mercuryEmailService, MercuryEmailService } from './email-service';
export { notificationService, NotificationService } from './notification-service';
export { bulkInvitationService, BulkInvitationService } from './invitation-service';
export { seedDefaultTemplates, DEFAULT_TEMPLATES } from './default-templates';
export {
  renderTemplate,
  escapeHtml,
  extractTemplateVariables,
  validateTemplateVariables,
  applyDefaults,
  generateSampleVariables,
} from './template-engine';
export * from './types';
