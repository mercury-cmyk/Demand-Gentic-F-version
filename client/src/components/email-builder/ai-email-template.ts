export type BrandPaletteKey = "indigo" | "emerald" | "slate";
export type BrandPaletteOverrides = Partial<{
  heroGradient: string;
  cta: string;
  accent: string;
  surface: string;
  button: string;
}>;

export interface SubjectVariantInsight {
  variant: string;
  length: number;
  openRateScore: number;
  spamRiskScore: number;
  spamKeywords?: string[];
}

export interface EmailTemplateCopy {
  subject: string;
  subjectVariants?: string[];
  preheader?: string;
  previewText?: string;
  heroTitle: string;
  heroSubtitle: string;
  intro: string;
  valueBullets: string[];
  ctaLabel: string;
  secondaryCtaLabel?: string;
  closingLine: string;
  ctaUrl?: string;
  subjectInsights?: SubjectVariantInsight[];
}

const paletteMap: Record<BrandPaletteKey, {
  heroGradient: string;
  cta: string;
  accent: string;
  surface: string;
  button: string;
}> = {
  indigo: {
    heroGradient: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #22d3ee 100%)",
    cta: "#4f46e5",
    accent: "#22d3ee",
    surface: "#f8fafc",
    button: "#4f46e5",
  },
  emerald: {
    heroGradient: "linear-gradient(135deg, #10b981 0%, #22c55e 50%, #a3e635 100%)",
    cta: "#16a34a",
    accent: "#10b981",
    surface: "#f0fdf4",
    button: "#16a34a",
  },
  slate: {
    heroGradient: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)",
    cta: "#0ea5e9",
    accent: "#38bdf8",
    surface: "#f8fafc",
    button: "#0ea5e9",
  },
};

export const escapeHtml = (value?: string) =>
  (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function buildBrandedEmailHtml(args: {
  copy: EmailTemplateCopy;
  brand?: BrandPaletteKey;
  brandPalette?: BrandPaletteKey; // Alias for backwards compatibility
  paletteOverrides?: BrandPaletteOverrides;
  companyName?: string;
  companyAddress?: string;
  ctaUrl?: string;
  includeFooter?: boolean;
}): string {
  const { copy, brand, brandPalette, paletteOverrides, companyName, companyAddress, ctaUrl, includeFooter = true } = args;
  // Support both 'brand' and 'brandPalette' params
  const basePalette = paletteMap[brandPalette || brand || 'indigo'] ?? paletteMap.indigo;
  const palette = { ...basePalette, ...paletteOverrides };
  const bullets = copy.valueBullets.slice(0, 3);
  while (bullets.length < 3) bullets.push("Clear value tailored to your team.");
  const resolvedAddress = companyAddress || "123 Business St, Suite 500 - San Francisco, CA 94105";

  // Ensure CTA URL is always valid and clickable
  let resolvedCta = copy.ctaUrl || ctaUrl || "https://example.com";
  if (resolvedCta !== '#' && !resolvedCta.startsWith('http') && !resolvedCta.startsWith('{{')) {
    resolvedCta = 'https://' + resolvedCta;
  }
  const introHtml = escapeHtml(copy.intro).replace(/\n/g, "<br/>");
  // Return a complete HTML document for proper email rendering
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>${escapeHtml(copy.subject || 'Email')}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { color: inherit; text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: ${palette.surface};">
  <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #0f172a; background: ${palette.surface}; padding: 32px 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 20px; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.12); overflow: hidden;">
        <tr>
          <td style="padding: 40px 32px; background: ${palette.heroGradient}; color: #ffffff;">
            <div style="font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.95; font-weight: 700; margin-bottom: 12px;">
              ${escapeHtml(companyName || "Your Company")}
            </div>
            <div data-block="heading" style="font-size: 32px; font-weight: 800; line-height: 1.2; margin-bottom: 12px;">
              ${escapeHtml(copy.heroTitle)}
            </div>
            <div data-block="subheading" style="font-size: 17px; line-height: 1.6; opacity: 0.96; margin-bottom: 24px;">
              ${escapeHtml(copy.heroSubtitle)}
            </div>
            <a data-block="cta" href="${escapeHtml(resolvedCta)}" style="display:inline-block; padding: 14px 28px; background: ${palette.button}; color:#ffffff; border-radius: 12px; font-weight: 700; text-decoration:none; font-size: 16px;">
              ${escapeHtml(copy.secondaryCtaLabel || copy.ctaLabel)}
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding: 40px 32px;">
            <div data-block="intro" style="font-size: 17px; color: #0f172a; line-height: 1.7; margin-bottom: 24px;">
              ${introHtml}
            </div>
            <div style="background:#f8fafc; border-left: 4px solid ${palette.accent}; border-radius:12px; padding:24px; margin-bottom:28px;">
              <div style="font-weight:700; margin-bottom:12px; color:#0f172a; font-size: 18px;">What you’ll get:</div>
              <ul data-block="bullets" style="margin:0; padding-left:20px; color:#475569; line-height:1.8; font-size: 16px;">
                <li>${escapeHtml(bullets[0])}</li>
                <li>${escapeHtml(bullets[1])}</li>
                <li>${escapeHtml(bullets[2])}</li>
              </ul>
            </div>
            <div style="text-align:center; margin: 32px 0;">
              <a data-block="cta" href="${escapeHtml(resolvedCta)}" style="display:inline-block; padding: 16px 32px; background: ${palette.cta}; color:#ffffff; border-radius: 12px; font-weight: 700; text-decoration:none; font-size: 17px;">
                ${escapeHtml(copy.ctaLabel)}
              </a>
            </div>
            <div data-block="closing" style="text-align:center; color:#64748b; font-size:14px; margin-top:16px;">
              ${escapeHtml(copy.closingLine)}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px 32px; background:#0f172a; color:#e2e8f0; text-align:center;">
            <div style="font-weight:700; font-size:15px; margin-bottom: 8px;">${escapeHtml(companyName || "Your Company")}</div>
            <div style="font-size:13px; opacity:0.8; margin-bottom: 16px;">${escapeHtml(resolvedAddress)}</div>
            <div>
              <a href="{{unsubscribe_url}}" style="color:${palette.accent}; text-decoration:none; margin:0 12px; font-size: 13px;">Unsubscribe</a>
              <a href="#" style="color:${palette.accent}; text-decoration:none; margin:0 12px; font-size: 13px;">Preferences</a>
            </div>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>
  `;
}

export { paletteMap };

// Template presets for quick setup
export const EMAIL_TEMPLATES = {
  pipeline_gap: {
    subject: "Are Pipeline Gaps Slowing Growth?",
    preheader: "A closer look at hidden friction in your funnel",
    heroTitle: "Pipeline Friction: The Unseen Cost",
    heroSubtitle: "Why top-of-funnel activity isn’t translating to revenue",
    intro: "Many teams see strong lead volume but still miss revenue targets. The real issue often isn’t volume—it’s unseen friction points that stall progress. For organizations in [industry], this challenge is especially acute given recent [market trend or event].",
    valueBullets: [
      "Where are prospects stalling or disengaging?",
      "What signals are you missing in early qualification?",
      "How are handoffs between teams impacting velocity?"
    ],
    ctaLabel: "See Analysis",
    ctaUrl: "https://example.com/pipeline-gap-insight",
    closingLine: "If this resonates, I’m happy to share more context from similar accounts."
  },
  conversion_insight: {
    subject: "Conversion Drop-Off: What’s Really Happening?",
    preheader: "A data-driven look at your mid-funnel challenges",
    heroTitle: "Conversion Blind Spots",
    heroSubtitle: "What most teams overlook in B2B buying journeys",
    intro: "Conversion rates often mask deeper issues—especially in complex B2B cycles. For [account], recent activity suggests there may be unseen blockers at key decision points. Here’s what we’re seeing across the market:",
    valueBullets: [
      "Decision group misalignment slows progress",
      "Unaddressed risk factors stall deals late-stage",
      "Generic messaging fails to provoke action"
    ],
    ctaLabel: "Explore Insight",
    ctaUrl: "https://example.com/conversion-blindspots",
    closingLine: "Let me know if you’d like a tailored breakdown for your team."
  },
  market_shift: {
    subject: "How [Industry] Leaders Are Responding to [Market Shift]",
    preheader: "Peer strategies for navigating uncertainty",
    heroTitle: "Adapting to Market Change",
    heroSubtitle: "What’s working (and what isn’t) for your peers",
    intro: "With [market shift or event], many [industry] teams are rethinking their approach to demand generation. The most successful are focusing on [specific strategy or insight]. Here’s what’s emerging:",
    valueBullets: [
      "Doubling down on account-specific relevance",
      "Reprioritizing channels based on real buyer behavior",
      "Building feedback loops between sales and marketing"
    ],
    ctaLabel: "See Peer Data",
    ctaUrl: "https://example.com/market-shift-insight",
    closingLine: "Happy to share anonymized examples from similar organizations."
  },
  account_specific: {
    subject: "[Account]: A Fresh Perspective on [Known Challenge]",
    preheader: "Not a pitch—just a relevant observation",
    heroTitle: "A Challenge Worth Rethinking",
    heroSubtitle: "What’s unique about [account]’s current situation?",
    intro: "Having followed [account]’s recent moves—especially [event or initiative]—I noticed a pattern that’s worth a second look. It’s not about solutions, but about framing the right questions:",
    valueBullets: [
      "What’s changed in your buying process this year?",
      "Where are teams spending more time than expected?",
      "What’s one metric that’s become harder to move?"
    ],
    ctaLabel: "Discuss Trends",
    ctaUrl: "https://example.com/account-perspective",
    closingLine: "If this sparks any thoughts, I’d welcome your perspective."
  },
  webinar: {
    subject: "Join Our Exclusive Webinar - Register Now",
    preheader: "Live expert insights + Q&A",
    heroTitle: "Exclusive Webinar Invitation",
    heroSubtitle: "Learn from industry experts",
    intro: "You're invited to join us for an exclusive webinar featuring leading experts in the industry. Discover best practices, insider tips, and get your questions answered live.",
    valueBullets: [
      "Expert-led session with live Q&A",
      "Exclusive resources and templates",
      "Networking with industry professionals"
    ],
    ctaLabel: "Register for Free",
    ctaUrl: "https://example.com/webinar",
    closingLine: "Spots filling up fast—register today!"
  },
  whitepaper: {
    subject: "Download Your Free Whitepaper: Essential Guide Inside",
    preheader: "Industry insights and best practices",
    heroTitle: "Free Whitepaper",
    heroSubtitle: "The Complete Guide to Success",
    intro: "Discover the latest research and industry insights in our comprehensive whitepaper. Learn proven strategies used by market leaders.",
    valueBullets: [
      "In-depth research and data analysis",
      "Practical strategies you can implement today",
      "Real case studies from successful companies"
    ],
    ctaLabel: "Download Now",
    ctaUrl: "https://example.com/whitepaper",
    closingLine: "Free download available for a limited time."
  },
  ebook: {
    subject: "Get Your Free eBook: Master the Fundamentals",
    preheader: "Everything you need to know",
    heroTitle: "Free eBook for You",
    heroSubtitle: "Your Complete Resource Guide",
    intro: "We've created a comprehensive eBook packed with actionable advice, real-world examples, and expert insights to help you succeed.",
    valueBullets: [
      "10 chapters of proven strategies",
      "Downloadable checklists and templates",
      "Expert interviews and case studies"
    ],
    ctaLabel: "Claim Your Free Copy",
    ctaUrl: "https://example.com/ebook",
    closingLine: "Download it now and start reading instantly."
  },
  infographic: {
    subject: "Stunning Infographic: 5 Stats You Need to Know",
    preheader: "Data visualization you'll love",
    heroTitle: "Visual Insights",
    heroSubtitle: "Key Statistics at a Glance",
    intro: "We've created an eye-catching infographic that breaks down the most important trends and statistics in our industry.",
    valueBullets: [
      "5 game-changing statistics",
      "Beautiful visual design",
      "Share-worthy insights"
    ],
    ctaLabel: "View Infographic",
    ctaUrl: "https://example.com/infographic",
    closingLine: "Share this with your team and network."
  },
  casestudy: {
    subject: "See How [Company] Achieved 3x Growth",
    preheader: "Real results from real companies",
    heroTitle: "Case Study: Real Results",
    heroSubtitle: "Learn how to replicate this success",
    intro: "Discover how a company like yours achieved remarkable results using our solution. See the metrics, strategy, and outcomes.",
    valueBullets: [
      "300% ROI improvement documented",
      "Step-by-step implementation strategy",
      "Measurable results in 90 days"
    ],
    ctaLabel: "Read Full Case Study",
    ctaUrl: "https://example.com/casestudy",
    closingLine: "Are you ready to achieve similar results?"
  },
  newsletter: {
    subject: "Your Weekly Digest: This Week's Top Insights",
    preheader: "Latest updates and industry news",
    heroTitle: "This Week's Highlights",
    heroSubtitle: "Stay informed with curated content",
    intro: "Here's your weekly roundup of the most important trends, news, and insights happening in your industry right now.",
    valueBullets: [
      "Trending stories and top analysis",
      "Expert insights and commentary",
      "Exclusive industry news you won't find elsewhere"
    ],
    ctaLabel: "Read Full Newsletter",
    ctaUrl: "https://example.com/newsletter",
    closingLine: "Stay tuned for next week's edition."
  },
  event: {
    subject: "🎫 Early Bird Tickets Available - Limited Spots",
    preheader: "Save your seat at our exclusive event",
    heroTitle: "Event Registration Open",
    heroSubtitle: "Don't miss this year's must-attend conference",
    intro: "Join us for an unforgettable event with industry leaders, networking opportunities, and exclusive sessions designed to accelerate your success.",
    valueBullets: [
      "3 days of actionable insights",
      "Networking with 500+ industry professionals",
      "Exclusive VIP dinner and after-parties"
    ],
    ctaLabel: "Get Early Bird Tickets",
    ctaUrl: "https://example.com/event",
    closingLine: "Early bird pricing ends in 48 hours."
  },
  survey: {
    subject: "Your Opinion Matters - Quick 2-Minute Survey",
    preheader: "Help us improve your experience",
    heroTitle: "We Want Your Feedback",
    heroSubtitle: "Your voice shapes our future",
    intro: "We're committed to making our service better for you. Help us by sharing your thoughts in a quick 2-minute survey. Your insights are invaluable.",
    valueBullets: [
      "Takes only 2 minutes",
      "Chance to win a $100 gift card",
      "Direct impact on product improvements"
    ],
    ctaLabel: "Take the Survey",
    ctaUrl: "https://example.com/survey",
    closingLine: "Thank you for helping us improve!"
  },
  feedback: {
    subject: "We'd Love to Hear From You",
    preheader: "Tell us how we're doing",
    heroTitle: "Help Us Improve",
    heroSubtitle: "Your feedback drives our innovation",
    intro: "We're continuously working to enhance your experience. Please share your feedback so we can serve you better.",
    valueBullets: [
      "Dedicated support team listening",
      "Monthly feature requests from feedback",
      "Priority support for engaged customers"
    ],
    ctaLabel: "Share Feedback",
    ctaUrl: "https://example.com/feedback",
    closingLine: "We read every message personally."
  }
};

/**
 * Build a text-first, deliverability-optimized email (NEW - Recommended)
 * No logos, no heavy images, Gmail/Outlook first
 */
export function buildTextFirstEmailHtml(args: {
  body: string;
  organizationName: string;
  organizationAddress: string;
  ctaText?: string;
  ctaUrl?: string;
}): string {
  const { body, organizationName, organizationAddress, ctaText, ctaUrl } = args;
  
  let ctaHtml = '';
  if (ctaText && ctaUrl) {
    const safeUrl = ctaUrl.startsWith('http') ? ctaUrl : `https://${ctaUrl}`;
    ctaHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
        <tr>
          <td style="background-color: #2563eb; border-radius: 6px;">
            <a href="${escapeHtml(safeUrl)}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px;">
              ${escapeHtml(ctaText)}
            </a>
          </td>
        </tr>
      </table>
    `;
  }
  
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <title>Email</title>
  <style type="text/css">
    body { margin: 0; padding: 0; }
    table { border-spacing: 0; }
    td { padding: 0; }
    img { border: 0; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 32px; font-size: 16px; line-height: 1.6; color: #1f2937;">
              ${body}
              ${ctaHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
              <div style="margin-bottom: 8px; font-weight: 600; color: #374151;">${escapeHtml(organizationName)}</div>
              <div style="margin-bottom: 16px;">${escapeHtml(organizationAddress)}</div>
              <div>
                <a href="{{unsubscribe_url}}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
                <span style="margin: 0 8px; color: #d1d5db;">|</span>
                <a href="{{preferences_url}}" style="color: #6b7280; text-decoration: underline;">Manage Preferences</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
