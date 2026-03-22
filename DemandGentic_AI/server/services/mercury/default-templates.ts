/**
 * Mercury Bridge — Default Template Definitions
 * 
 * Seed templates that are created on first access if they don't exist.
 * These can be edited by admins via the UI after creation.
 */

import { db } from '../../db';
import { eq, and } from 'drizzle-orm';
import { mercuryTemplates, mercuryNotificationRules } from '@shared/schema';

export interface DefaultTemplate {
  templateKey: string;
  name: string;
  description: string;
  category: string;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
  variables: Array;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    templateKey: 'client_invite',
    name: 'Client Portal Invitation',
    description: 'Premium invitation email sent to client users to set up their portal account.',
    category: 'invitation',
    subjectTemplate: '{{companyName}} — Set Your Portal Password',
    htmlTemplate: `











96





:root { color-scheme: light only; }
@media only screen and (max-width: 620px) {
  .main-table { width: 100% !important; min-width: 100% !important; }
  .mobile-padding { padding: 24px 20px !important; }
  .mobile-header { padding: 40px 24px !important; }
  .mobile-text { font-size: 15px !important; line-height: 1.6 !important; }
  .mobile-btn { padding: 14px 32px !important; }
  .feature-cell { display: block !important; width: 100% !important; padding: 8px 0 !important; }
}
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap { background-color: #ffffff !important; }
  .card-wrap td { background-color: #ffffff !important; }
  h1, h2, h3, p, td, span, a { color: inherit !important; }
  .header-band { background-color: #1e293b !important; }
  .header-band h1 { color: #ffffff !important; }
  .header-band p { color: #cbd5e1 !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #475569 !important; }
  .cta-btn { background-color: #2563eb !important; color: #ffffff !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #1e293b !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .header-band p { color: #cbd5e1 !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #475569 !important; }
[data-ogsc] .cta-btn { background-color: #2563eb !important; color: #ffffff !important; }



  
  
    Your workspace is ready — create your password to activate access. No previous password is required.
  

  
    
      

        
        

          
          
            
              
                
                  
                    &#9889;
                  
                
                
                  
                    Your Portal is Ready
                    Pivotal B2B &middot; DemandGentic.ai
                  
                
              
            
          

          
          
            
              Hi {{firstName}},

              
                You've been invited to the {{companyName}} workspace on our demand generation platform. Your account is ready — create your password to activate access. You do not need a previous password.
              

              
              
                
                  
                    
                      
                        
                          
                          
                          Set Up My Account
                          
                          
                          
                          
                            Set Up My Account
                          
                          
                        
                      
                    
                  
                
              
            
          

          
          
            
              
                
                  
                    What you'll get access to
                  
                
                
                  
                    
                      
                        
                          
                            
                              
                                &#10003;
                              
                              
                                Real-time campaign dashboard
                              
                            
                          
                        
                        
                          
                            
                              
                                &#10003;
                              
                              
                                Lead review &amp; approvals
                              
                            
                          
                        
                      
                      
                        
                          
                            
                              
                                &#10003;
                              
                              
                                Call recordings &amp; analytics
                              
                            
                          
                        
                        
                          
                            
                              
                                &#10003;
                              
                              
                                AI-powered reporting
                              
                            
                          
                        
                      
                    
                  
                
              
            
          

          
          
            
              
                
                  
                    
                      Heads up: This invitation link expires in {{expiryDays}} days. If it expires, ask your admin to resend your invitation.
                    
                  
                
              
            
          

          
          
            
              
            
          

          
          
            
              
                Button not working? Copy and paste this link into your browser:
              
              
                {{inviteLink}}
              
            
          
        

        
        
          
            
              
                Pivotal B2B &middot; DemandGentic.ai Platform
              
              
                &copy; 2026 Pivotal B2B. All rights reserved.
              
            
          
        

      
    
  

`,
    textTemplate: `Set Your Portal Password
  =========================

Hi {{firstName}},

You've been invited to the {{companyName}} workspace on the Pivotal B2B demand generation platform.

  Your account is ready — click the link below to create your password and activate access.

  You do not need an existing password from us.

Set Up Your Account: {{inviteLink}}

What you'll get access to:
- Real-time campaign dashboard
- Lead review & approvals
- Call recordings & analytics
- AI-powered reporting

This invitation link expires in {{expiryDays}} days.

If you have trouble with the link, copy and paste this URL into your browser:
{{inviteLink}}

--
Pivotal B2B - DemandGentic.ai Platform`,
    variables: [
      { name: 'firstName', description: 'Recipient first name', required: true, exampleValue: 'Jane' },
      { name: 'lastName', description: 'Recipient last name', required: false, exampleValue: 'Smith' },
      { name: 'email', description: 'Recipient email', required: true, exampleValue: 'jane@example.com' },
      { name: 'companyName', description: 'Client account name', required: true, exampleValue: 'Acme Corp' },
      { name: 'inviteLink', description: 'Password reset URL with token (legacy variable name)', required: true, exampleValue: 'https://demandgentic.ai/reset-password?token=abc123&type=client' },
      { name: 'resetLink', description: 'Password reset URL with token', required: false, exampleValue: 'https://demandgentic.ai/reset-password?token=abc123&type=client' },
      { name: 'expiryDays', description: 'Number of days until expiration', required: true, defaultValue: '7', exampleValue: '7' },
      { name: 'portalUrl', description: 'Client portal base URL', required: false, exampleValue: 'https://demandgentic.ai' },
    ],
  },
  {
    templateKey: 'project_request_approved',
    name: 'Project Request Approved',
    description: 'Notification sent to client when their project/campaign request is approved by admin.',
    category: 'notification',
    subjectTemplate: 'Your project "{{projectName}}" has been approved!',
    htmlTemplate: `




96

:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #059669 !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
  .cta-btn { background-color: #059669 !important; color: #ffffff !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #059669 !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }
[data-ogsc] .cta-btn { background-color: #059669 !important; color: #ffffff !important; }





  
    Project Approved
  
  
    Hi {{recipientName}},
    Great news! Your project request "{{projectName}}" has been approved.
    
      Project: {{projectName}}
      Approved on: {{approvalDate}}
      {{#if approvedBy}}Approved by: {{approvedBy}}{{/if}}
    
    {{#if portalLink}}
    
      View in Client Portal
      View in Client Portal
    
    {{/if}}
    Your campaign is now being set up. We'll notify you when leads start coming in.
  

Pivotal B2B &middot; DemandGentic.ai

`,
    textTemplate: `Hi {{recipientName}},

Great news! Your project request "{{projectName}}" has been approved.

Project: {{projectName}}
Approved on: {{approvalDate}}

View in Client Portal: {{portalLink}}

Your campaign is now being set up. We'll notify you when leads start coming in.`,
    variables: [
      { name: 'recipientName', description: 'Recipient full name', required: true, exampleValue: 'Jane Smith' },
      { name: 'projectName', description: 'Name of the approved project', required: true, exampleValue: 'Q1 Lead Generation Campaign' },
      { name: 'approvalDate', description: 'Date of approval', required: true, exampleValue: 'February 9, 2026' },
      { name: 'approvedBy', description: 'Admin who approved', required: false, exampleValue: 'Admin User' },
      { name: 'portalLink', description: 'Link to view project in portal', required: false, exampleValue: 'https://demandgentic.ai/client-portal/dashboard?projectId=123' },
    ],
  },
  {
    templateKey: 'project_request_rejected',
    name: 'Project Request Rejected',
    description: 'Notification sent to client when their project/campaign request is rejected.',
    category: 'notification',
    subjectTemplate: 'Update on your project "{{projectName}}"',
    htmlTemplate: `




96

:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #7c3aed !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #7c3aed !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }





  
    Project Update
  
  
    Hi {{recipientName}},
    We've reviewed your project request "{{projectName}}" and unfortunately we're unable to proceed with it at this time.
    {{#if rejectionReason}}
    
      Reason: {{rejectionReason}}
    
    {{/if}}
    You can submit a new request or contact your account manager for more details.
  

Pivotal B2B &middot; DemandGentic.ai

`,
    textTemplate: `Hi {{recipientName}},

We've reviewed your project request "{{projectName}}" and unfortunately we're unable to proceed with it at this time.

{{#if rejectionReason}}Reason: {{rejectionReason}}{{/if}}

You can submit a new request or contact your account manager for more details.`,
    variables: [
      { name: 'recipientName', description: 'Recipient full name', required: true, exampleValue: 'Jane Smith' },
      { name: 'projectName', description: 'Name of the rejected project', required: true, exampleValue: 'Q1 Campaign Request' },
      { name: 'rejectionReason', description: 'Reason for rejection', required: false, exampleValue: 'Budget not approved for this quarter' },
    ],
  },
  {
    templateKey: 'campaign_launched',
    name: 'Campaign Launched',
    description: 'Notification that a campaign has been launched and is live.',
    category: 'notification',
    subjectTemplate: 'Campaign "{{campaignName}}" is now live!',
    htmlTemplate: `




96

:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #2563eb !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
  .cta-btn { background-color: #2563eb !important; color: #ffffff !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #2563eb !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }
[data-ogsc] .cta-btn { background-color: #2563eb !important; color: #ffffff !important; }





  
    Campaign Live
  
  
    Hi {{recipientName}},
    Your campaign "{{campaignName}}" is now live and leads will start being generated.
    
      Campaign: {{campaignName}}
      Started: {{launchDate}}
      {{#if targetLeadCount}}Target Leads: {{targetLeadCount}}{{/if}}
    
    {{#if portalLink}}
    
      Track Progress
      Track Progress
    
    {{/if}}
  

Pivotal B2B &middot; DemandGentic.ai

`,
    textTemplate: `Hi {{recipientName}},

Your campaign "{{campaignName}}" is now live and leads will start being generated.

Campaign: {{campaignName}}
Started: {{launchDate}}

Track progress: {{portalLink}}`,
    variables: [
      { name: 'recipientName', description: 'Recipient name', required: true, exampleValue: 'Jane Smith' },
      { name: 'campaignName', description: 'Campaign name', required: true, exampleValue: 'Q1 Lead Gen' },
      { name: 'launchDate', description: 'Launch date', required: true, exampleValue: 'February 9, 2026' },
      { name: 'targetLeadCount', description: 'Target number of leads', required: false, exampleValue: '500' },
      { name: 'portalLink', description: 'Link to campaign in portal', required: false, exampleValue: 'https://demandgentic.ai/client-portal/dashboard?campaignId=abc123' },
    ],
  },
  {
    templateKey: 'leads_delivered',
    name: 'Leads Delivered',
    description: 'Notification that new leads have been delivered for a campaign.',
    category: 'notification',
    subjectTemplate: '{{leadCount}} new leads delivered for "{{campaignName}}"',
    htmlTemplate: `




96

:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #059669 !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
  .cta-btn { background-color: #059669 !important; color: #ffffff !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #059669 !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }
[data-ogsc] .cta-btn { background-color: #059669 !important; color: #ffffff !important; }





  
    New Leads Delivered
  
  
    Hi {{recipientName}},
    {{leadCount}} new leads have been delivered for campaign "{{campaignName}}".
    {{#if portalLink}}
    
      View Leads
      View Leads
    
    {{/if}}
  

Pivotal B2B &middot; DemandGentic.ai

`,
    textTemplate: `Hi {{recipientName}},

{{leadCount}} new leads have been delivered for campaign "{{campaignName}}".

View leads: {{portalLink}}`,
    variables: [
      { name: 'recipientName', description: 'Recipient name', required: true, exampleValue: 'Jane Smith' },
      { name: 'campaignName', description: 'Campaign name', required: true, exampleValue: 'Q1 Lead Gen' },
      { name: 'leadCount', description: 'Number of leads delivered', required: true, exampleValue: '25' },
      { name: 'portalLink', description: 'Link to view leads', required: false, exampleValue: 'https://demandgentic.ai/client-portal/dashboard?tab=leads' },
    ],
  },
  {
    templateKey: 'showcase_recordings_shared',
    name: 'Showcase Recordings Shared',
    description: 'Client notification with direct path to showcase call recordings in the portal.',
    category: 'notification',
    subjectTemplate: 'Your showcase call recordings are ready',
    htmlTemplate: `


  
  
  


  
    
      
        
          
            
              Showcase Call Recordings
            
          
          
            
              Hi {{recipientName}},
              We've published your latest showcase call recordings for review.
              
                Access them here:
                https://demandgentic.ai{{showcasePath}}
              
              Path reference: {{showcasePath}}

              
                
                  
                    Open Showcase Calls
                  
                
              

              {{#if notes}}
              Notes: {{notes}}
              {{/if}}

              If the button doesn't work, copy and paste the link above into your browser.
            
          
        
      
    
  

`,
    textTemplate: `Hi {{recipientName}},

We've published your latest showcase call recordings for review.

Open Showcase Calls:
https://demandgentic.ai{{showcasePath}}

Path reference: {{showcasePath}}

{{#if notes}}Notes: {{notes}}{{/if}}

If the link doesn't open directly, copy and paste it into your browser.`,
    variables: [
      { name: 'recipientName', description: 'Recipient name', required: true, exampleValue: 'Jane Smith' },
      { name: 'showcasePath', description: 'Portal path for showcase call recordings', required: true, defaultValue: '/client-portal/showcase-calls', exampleValue: '/client-portal/showcase-calls' },
      { name: 'notes', description: 'Optional note to include in the email', required: false, exampleValue: 'New highlighted calls from this week are now available.' },
    ],
  },
  {
    templateKey: 'test_notification',
    name: 'Test Notification',
    description: 'A test email template for verifying Mercury Bridge configuration.',
    category: 'system',
    subjectTemplate: '[Mercury Test] Email delivery test at {{timestamp}}',
    htmlTemplate: `




96

:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #6366f1 !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #6366f1 !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }





  
    Mercury Bridge &#8212; Test Email
  
  
    This is a test email from the Mercury Bridge notification system.
    
      Timestamp: {{timestamp}}
      Sent by: {{adminName}}
      Environment: {{environment}}
    
    If you received this email, the Mercury Bridge SMTP configuration is working correctly.
  

Pivotal B2B &middot; DemandGentic.ai

`,
    textTemplate: `Mercury Bridge — Test Email

This is a test email from the Mercury Bridge notification system.

Timestamp: {{timestamp}}
Sent by: {{adminName}}
Environment: {{environment}}

If you received this email, the Mercury Bridge SMTP configuration is working correctly.`,
    variables: [
      { name: 'timestamp', description: 'Current timestamp', required: true, exampleValue: new Date().toISOString() },
      { name: 'adminName', description: 'Name of admin who triggered the test', required: true, exampleValue: 'Admin' },
      { name: 'environment', description: 'Environment name', required: false, defaultValue: 'production', exampleValue: 'production' },
    ],
  },
  {
    templateKey: 'campaign_order_submitted',
    name: 'Campaign Order Submitted',
    description: 'Internal notification sent to admins when a client submits a new campaign work order.',
    category: 'notification',
    subjectTemplate: 'New Campaign Order: {{orderNumber}} — {{clientName}}',
    htmlTemplate: `




96

:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #d97706 !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
  .cta-btn { background-color: #d97706 !important; color: #ffffff !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #d97706 !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }
[data-ogsc] .cta-btn { background-color: #d97706 !important; color: #ffffff !important; }





  
    New Campaign Order
  
  
    A new campaign work order has been submitted and requires review.
    
      Order #: {{orderNumber}}
      Client: {{clientName}}
      Title: {{orderTitle}}
      Type: {{orderType}}
      Priority: {{priority}}
      {{#if targetLeadCount}}Target Leads: {{targetLeadCount}}{{/if}}
      {{#if budget}}Budget: {{budget}}{{/if}}
      Submitted: {{submittedAt}}
    
    {{#if description}}Description: {{description}}{{/if}}
    
      Review in Admin Portal
      Review in Admin Portal
    
    This is an automated notification from the DemandGentic.ai platform.
  

Pivotal B2B &middot; DemandGentic.ai

`,
    textTemplate: `New Campaign Order Submitted
============================

A new campaign work order has been submitted and requires review.

Order #: {{orderNumber}}
Client: {{clientName}}
Title: {{orderTitle}}
Type: {{orderType}}
Priority: {{priority}}
Target Leads: {{targetLeadCount}}
Budget: {{budget}}
Submitted: {{submittedAt}}

Description: {{description}}

Review in Admin Portal: {{adminLink}}

--
Pivotal B2B - DemandGentic.ai Platform`,
    variables: [
      { name: 'orderNumber', description: 'Work order reference number', required: true, exampleValue: 'WO-202602-ABC123' },
      { name: 'clientName', description: 'Client account name', required: true, exampleValue: 'Acme Corp' },
      { name: 'orderTitle', description: 'Work order title', required: true, exampleValue: 'Q1 Lead Generation Campaign' },
      { name: 'orderType', description: 'Order type (lead_generation, etc.)', required: true, exampleValue: 'lead_generation' },
      { name: 'priority', description: 'Order priority', required: true, defaultValue: 'normal', exampleValue: 'normal' },
      { name: 'targetLeadCount', description: 'Target number of leads', required: false, exampleValue: '500' },
      { name: 'budget', description: 'Estimated budget', required: false, exampleValue: '$5,000' },
      { name: 'description', description: 'Order description', required: false, exampleValue: 'Generate qualified leads in the healthcare vertical.' },
      { name: 'submittedAt', description: 'Submission timestamp', required: true, exampleValue: 'February 21, 2026' },
      { name: 'adminLink', description: 'Link to review in admin portal', required: false, defaultValue: 'https://demandgentic.ai/admin/project-requests', exampleValue: 'https://demandgentic.ai/admin/project-requests' },
    ],
  },
  {
    templateKey: 'campaign_order_approved',
    name: 'Campaign Order Approved',
    description: 'Confirmation email sent to the client when their campaign order is reviewed and approved.',
    category: 'notification',
    subjectTemplate: 'Your campaign order "{{orderTitle}}" has been approved!',
    htmlTemplate: `




96

:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #059669 !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
  .cta-btn { background-color: #059669 !important; color: #ffffff !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #059669 !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }
[data-ogsc] .cta-btn { background-color: #059669 !important; color: #ffffff !important; }





  
    Order Approved
  
  
    Hi {{recipientName}},
    Great news! Your campaign order "{{orderTitle}}" has been reviewed and approved.
    
      Order: {{orderTitle}}
      Approved on: {{approvalDate}}
      {{#if approvedBy}}Approved by: {{approvedBy}}{{/if}}
    
    You can now log in to your portal to preview the campaign within your campaigns list. Our team will begin setting up your campaign shortly.
    {{#if portalLink}}
    
      View Campaign in Portal
      View Campaign in Portal
    
    {{/if}}
    We'll notify you again when leads start being generated. Thank you for choosing Pivotal B2B.
  

Pivotal B2B &middot; DemandGentic.ai

`,
    textTemplate: `Hi {{recipientName}},

Great news! Your campaign order "{{orderTitle}}" has been reviewed and approved.

Order: {{orderTitle}}
Approved on: {{approvalDate}}

You can now log in to your portal to preview the campaign within your campaigns list.

View Campaign in Portal: {{portalLink}}

Our team will begin setting up your campaign shortly. We'll notify you when leads start being generated.

Thank you for choosing Pivotal B2B.

--
Pivotal B2B - DemandGentic.ai Platform`,
    variables: [
      { name: 'recipientName', description: 'Recipient full name', required: true, exampleValue: 'Jane Smith' },
      { name: 'orderTitle', description: 'Campaign order title or project name', required: true, exampleValue: 'Q1 Lead Generation Campaign' },
      { name: 'approvalDate', description: 'Date of approval', required: true, exampleValue: 'February 21, 2026' },
      { name: 'approvedBy', description: 'Admin who approved', required: false, exampleValue: 'Admin User' },
      { name: 'portalLink', description: 'Link to view campaign in client portal', required: false, exampleValue: 'https://demandgentic.ai/client-portal/dashboard?campaignId=abc123' },
    ],
  },
  {
    templateKey: 'campaign_order_rejected',
    name: 'Campaign Order Rejected',
    description: 'Notification sent to client users when their campaign order is rejected by an admin.',
    category: 'notification',
    subjectTemplate: 'Update on your campaign order "{{orderTitle}}"',
    htmlTemplate: `







&#10060;

Campaign Order Update

Hi {{recipientName}},
We've reviewed your campaign order "{{orderTitle}}" and unfortunately we are unable to proceed with it at this time.

Reason:
{{rejectionReason}}

Please feel free to submit a revised order or reach out to your account manager if you have any questions.

View in Portal

Thank you for your understanding.



`,
    textTemplate: `Hi {{recipientName}},

We've reviewed your campaign order "{{orderTitle}}" and unfortunately we are unable to proceed with it at this time.

Reason: {{rejectionReason}}

Please feel free to submit a revised order or reach out to your account manager if you have any questions.

View in Portal: {{portalLink}}

Thank you for your understanding.

--
Pivotal B2B - DemandGentic.ai Platform`,
    variables: [
      { name: 'recipientName', description: 'Recipient full name', required: true, exampleValue: 'Jane Smith' },
      { name: 'orderTitle', description: 'Campaign order title or project name', required: true, exampleValue: 'Q1 Lead Generation Campaign' },
      { name: 'rejectionReason', description: 'Reason for rejection', required: true, exampleValue: 'Insufficient budget allocation for the requested lead volume' },
      { name: 'rejectedAt', description: 'Date of rejection', required: false, exampleValue: 'February 27, 2026' },
      { name: 'portalLink', description: 'Link to view order in client portal', required: false, exampleValue: 'https://demandgentic.ai/client-portal/orders/abc123' },
    ],
  },
  {
    templateKey: 'project_request_approved',
    name: 'Project Request Approved',
    description: 'Notification sent to client users when their project request is approved by an admin.',
    category: 'notification',
    subjectTemplate: 'Your project "{{projectName}}" has been approved!',
    htmlTemplate: `




96

:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #059669 !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
  .cta-btn { background-color: #059669 !important; color: #ffffff !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #059669 !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }
[data-ogsc] .cta-btn { background-color: #059669 !important; color: #ffffff !important; }





  
    Project Approved
  
  
    Hi {{recipientName}},
    Great news! Your project "{{projectName}}" has been reviewed and approved.
    
      Project: {{projectName}}
      Approved on: {{approvalDate}}
    
    You can log in to your portal to view the project and track progress. Our team will begin working on it shortly.
    {{#if portalLink}}
    
      View in Portal
      View in Portal
    
    {{/if}}
    Thank you for choosing Pivotal B2B.
  

Pivotal B2B &middot; DemandGentic.ai

`,
    textTemplate: `Hi {{recipientName}},

Great news! Your project "{{projectName}}" has been reviewed and approved.

Project: {{projectName}}
Approved on: {{approvalDate}}

You can log in to your portal to view the project and track progress.

View in Portal: {{portalLink}}

Our team will begin working on it shortly. Thank you for choosing Pivotal B2B.

--
Pivotal B2B - DemandGentic.ai Platform`,
    variables: [
      { name: 'recipientName', description: 'Recipient full name or project name', required: true, exampleValue: 'Jane Smith' },
      { name: 'projectName', description: 'Project name', required: true, exampleValue: 'Q1 Lead Generation Campaign' },
      { name: 'approvalDate', description: 'Date of approval', required: true, exampleValue: 'February 21, 2026' },
      { name: 'approvedBy', description: 'Admin who approved', required: false, exampleValue: 'Admin User' },
      { name: 'portalLink', description: 'Link to view project in client portal', required: false, exampleValue: 'https://demandgentic.ai/client-portal/dashboard?projectId=123' },
    ],
  },
  {
    templateKey: 'project_request_rejected',
    name: 'Project Request Rejected',
    description: 'Notification sent to client users when their project request is rejected by an admin.',
    category: 'notification',
    subjectTemplate: 'Update on your project "{{projectName}}"',
    htmlTemplate: `







&#10060;

Project Request Update

Hi {{recipientName}},
We've reviewed your project "{{projectName}}" and unfortunately we are unable to proceed with it at this time.
{{#if rejectionReason}}

Reason:
{{rejectionReason}}

{{/if}}
Please feel free to submit a revised request or reach out to your account manager if you have any questions.
Thank you for your understanding.



`,
    textTemplate: `Hi {{recipientName}},

We've reviewed your project "{{projectName}}" and unfortunately we are unable to proceed with it at this time.

Reason: {{rejectionReason}}

Please feel free to submit a revised request or reach out to your account manager if you have any questions.

Thank you for your understanding.

--
Pivotal B2B - DemandGentic.ai Platform`,
    variables: [
      { name: 'recipientName', description: 'Recipient full name or project name', required: true, exampleValue: 'Jane Smith' },
      { name: 'projectName', description: 'Project name', required: true, exampleValue: 'Q1 Lead Generation Campaign' },
      { name: 'rejectionReason', description: 'Reason for rejection', required: false, exampleValue: 'Insufficient budget allocation for the requested scope' },
    ],
  },
];

/**
 * Seed default Mercury templates if they don't exist.
 * Safe to call multiple times — skips existing templates.
 */
export async function seedDefaultTemplates(): Promise {
  let created = 0;
  let skipped = 0;

  for (const template of DEFAULT_TEMPLATES) {
    const [existing] = await db
      .select({ id: mercuryTemplates.id })
      .from(mercuryTemplates)
      .where(eq(mercuryTemplates.templateKey, template.templateKey))
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(mercuryTemplates).values({
      templateKey: template.templateKey,
      name: template.name,
      description: template.description,
      category: template.category,
      subjectTemplate: template.subjectTemplate,
      htmlTemplate: template.htmlTemplate,
      textTemplate: template.textTemplate,
      variables: template.variables,
    });

    created++;
  }

  console.log(`[Mercury] Templates seeded: created=${created}, skipped=${skipped}`);
  return { created, skipped };
}

// ─── Default Notification Rules ───────────────────────────────────────────────

export interface DefaultRule {
  eventType: string;
  templateKey: string;
  channelType: string;
  recipientResolver: string;
  customRecipients?: string[];
  isEnabled: boolean;
  description: string;
}

export const DEFAULT_RULES: DefaultRule[] = [
  {
    eventType: 'campaign_order_submitted',
    templateKey: 'campaign_order_submitted',
    channelType: 'email',
    recipientResolver: 'custom',
    customRecipients: [
      'zahid.m@pivotal-b2b.com',
      'tabasum.hamdard@pivotal-b2b.com',
    ],
    isEnabled: true,
    description: 'Notify admins (Zahid and Tawassum) when a client submits a new campaign work order.',
  },
  {
    eventType: 'campaign_order_approved',
    templateKey: 'campaign_order_approved',
    channelType: 'email',
    recipientResolver: 'all_tenant_users',
    isEnabled: true,
    description: 'Send approval confirmation to all client users when their campaign order is approved.',
  },
  {
    eventType: 'campaign_order_rejected',
    templateKey: 'campaign_order_rejected',
    channelType: 'email',
    recipientResolver: 'all_tenant_users',
    isEnabled: true,
    description: 'Send rejection notification to all client users when their campaign order is rejected.',
  },
  {
    eventType: 'leads_delivered',
    templateKey: 'leads_delivered',
    channelType: 'email',
    recipientResolver: 'all_tenant_users',
    isEnabled: true,
    description: 'Notify all client users when new leads have been delivered for their campaign.',
  },
  {
    eventType: 'project_request_approved',
    templateKey: 'project_request_approved',
    channelType: 'email',
    recipientResolver: 'all_tenant_users',
    isEnabled: true,
    description: 'Send approval notification to all client users when their project request is approved.',
  },
  {
    eventType: 'project_request_rejected',
    templateKey: 'project_request_rejected',
    channelType: 'email',
    recipientResolver: 'all_tenant_users',
    isEnabled: true,
    description: 'Send rejection notification to all client users when their project request is rejected.',
  },
];

/**
 * Seed default Mercury notification rules if they don't exist.
 * Safe to call multiple times — skips existing rules by eventType + templateKey.
 */
export async function seedDefaultRules(): Promise {
  let created = 0;
  let skipped = 0;

  for (const rule of DEFAULT_RULES) {
    const [existing] = await db
      .select({ id: mercuryNotificationRules.id })
      .from(mercuryNotificationRules)
      .where(
        and(
          eq(mercuryNotificationRules.eventType, rule.eventType),
          eq(mercuryNotificationRules.templateKey, rule.templateKey),
        )
      )
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(mercuryNotificationRules).values({
      eventType: rule.eventType,
      templateKey: rule.templateKey,
      channelType: rule.channelType,
      recipientResolver: rule.recipientResolver,
      customRecipients: rule.customRecipients || null,
      isEnabled: rule.isEnabled,
      description: rule.description,
    });

    created++;
  }

  console.log(`[Mercury] Rules seeded: created=${created}, skipped=${skipped}`);
  return { created, skipped };
}