import { describe, expect, it, vi } from 'vitest';
import { generateAdminEmailTemplateFromPromptSystem } from '../admin-email-template-generator';

describe('generateAdminEmailTemplateFromPromptSystem', () => {
  it('uses Core Email Agent pipeline with structured event context', async () => {
    const generateWithCoreEmailAgent = vi.fn(async () =>
      JSON.stringify({
        subject: 'Webinar conversion playbook',
        preheader: 'Practical ideas for improving registration outcomes',
        textContent: 'Hi {{firstName}},\n\nSharing a quick event invite for {{company}}.',
        mergeFieldsUsed: ['{{firstName}}', '{{company}}'],
      })
    );

    const result = await generateAdminEmailTemplateFromPromptSystem(
      {
        campaignId: 'camp-1',
        projectId: 'project-1',
        clientAccountId: 'org-1',
        campaignType: 'argyle_event',
        channel: 'email',
        tone: 'professional',
        design: 'plain',
        campaignName: 'Argyle Summit',
        objective: 'Generate qualified meetings with sponsor-side leaders',
        description: 'Event-focused outreach for decision makers.',
        targetAudience: 'VP Marketing and Demand Gen leaders',
        successCriteria: '20 qualified meetings',
        targetJobTitles: ['VP Marketing'],
        targetIndustries: ['SaaS'],
        landingPageUrl: 'argyleforum.com/events/summit',
        organizationName: 'Argyle',
      },
      {
        generateWithCoreEmailAgent,
        loadEventContextFromDb: async () => ({
          title: 'Argyle Summit',
          sourceUrl: 'https://argyleforum.com/events/summit',
          overview: 'In-depth summit details from Argyle website for enterprise buyers.',
        }),
        fetchArgylePageHtml: async () => null,
      }
    );

    expect(generateWithCoreEmailAgent).toHaveBeenCalledTimes(1);
    const generationArgs = generateWithCoreEmailAgent.mock.calls[0][0];
    expect(generationArgs.input.campaignName).toBe('Argyle Summit');
    expect(generationArgs.ctaUrlWithUtm).toContain('utm_source=email');

    expect(result.promptKeyUsed).toBe('core_email_agent');
    expect(result.promptSource).toBe('core_email_agent');
    expect(result.bodyText).toContain('https://argyleforum.com/events/summit');
    expect(result.mergeFieldsUsed).toEqual(expect.arrayContaining(['{{firstName}}', '{{company}}']));
  });

  it('retries with Core Email Agent when internal language leaks into output', async () => {
    const generateWithCoreEmailAgent = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          subject: 'First draft',
          preheader: 'Preview',
          textContent: 'Emphasize urgency and align timing with internal strategy.',
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          subject: 'Second draft for {{company}}',
          preheader: 'Concise follow-up',
          textContent: 'Hi {{firstName}},\n\nThought this event brief might be relevant to your team.',
        })
      );

    const result = await generateAdminEmailTemplateFromPromptSystem(
      {
        tone: 'friendly',
        design: 'plain',
        campaignName: 'Argyle Forum',
        objective: 'Book sponsor conversations',
        description: '',
        targetAudience: 'CMOs',
        landingPageUrl: 'https://argyleforum.com/events/forum',
        organizationName: 'Argyle',
      },
      {
        generateWithCoreEmailAgent,
        loadEventContextFromDb: async () => null,
        fetchArgylePageHtml: async () => null,
      }
    );

    expect(generateWithCoreEmailAgent).toHaveBeenCalledTimes(2);
    expect(result.bodyText.toLowerCase()).not.toContain('internal strategy');
    expect(result.bodyText.toLowerCase()).not.toContain('emphasize');
  });

  it('builds a strict event-based body structure with no generic filler', async () => {
    const generateWithCoreEmailAgent = vi.fn(async () =>
      JSON.stringify({
        subject: 'Lead generation campaign for Argyle',
        preheader: 'Campaign objective: registration',
        textContent: 'You will get a concise summary and assess relevance.',
      })
    );

    const result = await generateAdminEmailTemplateFromPromptSystem(
      {
        campaignType: 'argyle_event',
        tone: 'professional',
        design: 'plain',
        campaignName: 'Webinar on webinar conversion',
        objective: 'Generate qualified leads',
        description: 'Event invite',
        targetAudience: 'Demand generation leaders',
        targetJobTitles: ['VP Marketing'],
        landingPageUrl: 'https://argyleforum.com/events/webinar-conversion',
        organizationName: 'Argyle',
        recipient: {
          firstName: 'Alex',
          jobTitle: 'VP Marketing',
          company: 'Acme',
        },
      },
      {
        generateWithCoreEmailAgent,
        loadEventContextFromDb: async () => ({
          title: 'Webinar on webinar conversion',
          date: 'March 12, 2026 at 1:00 PM ET',
          sourceUrl: 'https://argyleforum.com/events/webinar-conversion',
          overview: 'How B2B teams improve webinar conversion and follow-up quality.',
          keyTakeaways: [
            'Improve registration rates with tighter audience and messaging alignment',
            'Build a post-webinar follow-up sequence that converts more attendees',
            'Use practical metrics to optimize webinar ROI',
          ],
          speakersList: ['Jane Doe, VP Growth', 'Marcus Lee, Head of Demand Gen'],
        }),
        fetchArgylePageHtml: async () => null,
      }
    );

    expect(result.bodyText).toContain("In this webinar, you'll learn:");
    expect(result.bodyText).toContain('When: March 12, 2026 at 1:00 PM ET');
    expect(result.bodyText).toContain('Speakers: Jane Doe, VP Growth, Marcus Lee, Head of Demand Gen');
    expect(result.bodyText).toContain('View brief & register: https://argyleforum.com/events/webinar-conversion');
    expect(result.bodyText.toLowerCase()).not.toContain('concise summary');
    expect(result.bodyText.toLowerCase()).not.toContain('assess relevance');
    expect(result.bodyText.toLowerCase()).not.toContain('lead generation campaign');
  });

  it('extracts takeaways and speakers from landing page html when present', async () => {
    const generateWithCoreEmailAgent = vi.fn(async () =>
      JSON.stringify({
        subject: 'Webinar invite',
        preheader: 'Join this event',
      })
    );

    const html = `
      <html>
        <body>
          <main>
            <h1>Webinars That Convert</h1>
            <p>Learn how enterprise teams turn webinars into qualified pipeline through better planning and follow-up.</p>
            <h2>What you'll learn</h2>
            <ul>
              <li>How to increase registration rates with better value framing</li>
              <li>How to improve attendance with smart reminder cadences</li>
              <li>How to drive post-event conversion with focused next steps</li>
            </ul>
            <h2>Speakers</h2>
            <ul>
              <li>Nina Patel, Director of Demand Gen</li>
              <li>Chris Wong, VP Marketing Operations</li>
            </ul>
            <p>March 22, 2026 at 2:00 PM ET</p>
          </main>
        </body>
      </html>
    `;

    const result = await generateAdminEmailTemplateFromPromptSystem(
      {
        campaignType: 'argyle_event',
        tone: 'friendly',
        design: 'plain',
        campaignName: 'Argyle Webinar',
        objective: 'Drive registrations',
        description: '',
        targetAudience: 'Marketing leaders',
        landingPageUrl: 'https://argyleforum.com/events/webinars-that-convert',
        organizationName: 'Argyle',
      },
      {
        generateWithCoreEmailAgent,
        loadEventContextFromDb: async () => ({
          sourceUrl: 'https://argyleforum.com/events/webinars-that-convert',
        }),
        fetchArgylePageHtml: async () => html,
      }
    );

    expect(result.bodyText).toContain('How to increase registration rates with better value framing');
    expect(result.bodyText).toContain('How to improve attendance with smart reminder cadences');
    expect(result.bodyText).toContain('Speakers: Nina Patel, Director of Demand Gen, Chris Wong, VP Marketing Operations');
    expect(result.bodyText).toContain('When: March 22, 2026 at 2:00 PM ET');
  });
});
