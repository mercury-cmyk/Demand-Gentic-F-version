/**
 * Update the Argyle notification draft with a properly branded HTML email.
 * The AI generation failed (expired key), so we craft the branded email manually
 * using the Mercury design system (dark header #1e293b, blue CTA #2563eb, etc.)
 */
import { db } from '../server/db';
import { clientNotifications } from '../shared/schema';
import { eq } from 'drizzle-orm';

const NOTIFICATION_ID = 'a42a6cfd-e999-49b7-b143-cec772c987c1';

const subject = 'Your Pipeline & Engagement Dashboard is Live — Argyle Executive Forum';

const htmlContent = `











96





:root { color-scheme: light only; }
@media only screen and (max-width: 620px) {
  .main-table { width: 100% !important; min-width: 100% !important; }
  .mobile-padding { padding: 24px 20px !important; }
  .mobile-header { padding: 40px 24px !important; }
  .mobile-text { font-size: 15px !important; line-height: 1.6 !important; }
  .mobile-btn { padding: 14px 32px !important; }
  .stat-cell { display: block !important; width: 100% !important; padding: 8px 0 !important; }
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



  
  
    Your client portal is live with real-time pipeline visibility, lead tracking, and AI-powered analytics for your campaign.
  

  
    
      

        
        

          
          
            
              
                
                  
                    
                      
                        &#128202;
                      
                    
                  
                
                
                  
                    Pipeline &amp; Engagement Dashboard
                    Pivotal B2B &middot; DemandGentic.ai
                  
                
              
            
          

          
          
            
              Hi Argyle Team,

              
                Great news! Your Client Portal is now live with full access to your Pipeline &amp; Engagement Dashboard. You can now track your campaign performance in real time.
              

              
                Your active campaign March and April: CIO / IT / Security is currently running, and here&rsquo;s a snapshot of your pipeline:
              

              
              
                
                  
                    31
                    Outreach
                  
                  
                    14
                    Engaged
                  
                  
                    10
                    Qualified
                  
                  
                    1
                    Appt. Set
                  
                
              

              
              
                
                  
                    
                      &#128230; 39 leads have been delivered and are available for your review in the portal.
                    
                  
                
              

              
              What You Can Access

              
                
                  
                    
                      
                        
                          &#10003;
                        
                        
                          Campaign Dashboard &mdash; Real-time campaign performance and engagement metrics
                        
                      
                    
                  
                
                
                  
                    
                      
                        
                          &#10003;
                        
                        
                          Lead Pipeline Review &mdash; Track accounts across Outreach, Engaged, Qualified, and Appointment Set stages
                        
                      
                    
                  
                
                
                  
                    
                      
                        
                          &#10003;
                        
                        
                          Call Recordings &amp; Transcripts &mdash; Listen to conversations and review AI-generated transcripts
                        
                      
                    
                  
                
                
                  
                    
                      
                        
                          &#10003;
                        
                        
                          AI-Powered Analytics &amp; Reporting &mdash; Insights, disposition breakdowns, and performance trends
                        
                      
                    
                  
                
              

              
              
                
                  
                    
                      
                        
                          
                          
                          Access Your Portal
                          
                          
                          
                          
                            Access Your Portal
                          
                          
                        
                      
                    
                  
                
              

              
              
                
                  
                    How to Log In
                    
                      Visit demandgentic.ai/client-portal/login and enter the email address associated with your account. If this is your first visit, you&rsquo;ll be prompted to create a password.
                    
                  
                
              

              
                If you have any questions, please reach out to your Pivotal B2B account team &mdash; we&rsquo;re here to help.
              
            
          

          
          
            
              
                Pivotal B2B &mdash; DemandGentic.ai Platform
              
              
                Argyle Executive Forum &middot; Pipeline &amp; Engagement Update
              
            
          

        
      
    
  

`;

const textContent = `Pipeline & Engagement Dashboard — Argyle Executive Forum

Hi Argyle Team,

Great news! Your Client Portal is now live with full access to your Pipeline & Engagement Dashboard. You can now track your campaign performance in real time.

Your active campaign "March and April: CIO / IT / Security" is currently running. Here's a snapshot of your pipeline:

  PIPELINE OVERVIEW (59 Total Accounts)
  ──────────────────────────────────────
  Outreach:         31 accounts
  Engaged:          14 accounts
  Qualified:        10 accounts
  Appointment Set:   1 account

  39 leads have been delivered and are available for your review in the portal.

WHAT YOU CAN ACCESS
───────────────────
✓ Campaign Dashboard — Real-time campaign performance and engagement metrics
✓ Lead Pipeline Review — Track accounts across Outreach, Engaged, Qualified, and Appointment Set stages
✓ Call Recordings & Transcripts — Listen to conversations and review AI-generated transcripts
✓ AI-Powered Analytics & Reporting — Insights, disposition breakdowns, and performance trends

ACCESS YOUR PORTAL
──────────────────
Visit https://demandgentic.ai/client-portal/login and enter the email address associated with your account. If this is your first visit, you'll be prompted to create a password.

If you have any questions, please reach out to your Pivotal B2B account team — we're here to help.

— Pivotal B2B / DemandGentic.ai Platform`;

async function main() {
  console.log('Updating draft notification with branded HTML email...\n');

  const [updated] = await db.update(clientNotifications)
    .set({
      subject,
      htmlContent,
      textContent,
      updatedAt: new Date(),
    })
    .where(eq(clientNotifications.id, NOTIFICATION_ID))
    .returning();

  if (!updated) {
    console.error('Notification not found:', NOTIFICATION_ID);
    process.exit(1);
  }

  console.log('✅ Draft notification updated successfully!');
  console.log(`   ID: ${updated.id}`);
  console.log(`   Subject: ${updated.subject}`);
  console.log(`   Status: ${updated.status}`);
  console.log(`   Recipients: ${(updated.recipientEmails || []).join(', ')}`);
  console.log('\n━━━━━━━━━ HTML PREVIEW ━━━━━━━━━');
  console.log(htmlContent);
  console.log('\n━━━━━━━━━ TEXT FALLBACK ━━━━━━━━━');
  console.log(textContent);
  console.log('\n\n✅ To send this notification:');
  console.log(`   POST /api/admin/client-notifications/${updated.id}/send`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});