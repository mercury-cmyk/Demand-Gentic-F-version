export type BrandPaletteKey = "indigo" | "emerald" | "slate";
export type BrandPaletteOverrides = Partial;

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
  logoUrl?: string;
}

export const ARGYLE_LOGO_URL = "https://argyleforum.com/wp-content/themes/argyle-theme/assets/images/logo.png";
export const DEFAULT_LOGO_URL = "";

const paletteMap: Record = {
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
    .replace(//g, "&gt;")
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
  logoUrl?: string;
  includeFooter?: boolean;
}): string {
  const { copy, brand, brandPalette, paletteOverrides, companyName, companyAddress, ctaUrl, logoUrl, includeFooter = true } = args;
  // Support both 'brand' and 'brandPalette' params
  const basePalette = paletteMap[brandPalette || brand || 'indigo'] ?? paletteMap.indigo;
  const palette = { ...basePalette, ...paletteOverrides };
  const bullets = copy.valueBullets.slice(0, 3);
  while (bullets.length 
          
            ${resolvedCompanyName ? `${escapeHtml(resolvedCompanyName)}` : ""}
            ${resolvedAddress ? `${escapeHtml(resolvedAddress)}` : ""}
            
              Unsubscribe
              Manage Preferences
            
          
        
      `
    : "";

  // Ensure CTA URL is always valid and clickable
  let resolvedCta = copy.ctaUrl || ctaUrl || "https://example.com";
  if (resolvedCta !== '#' && !resolvedCta.startsWith('http') && !resolvedCta.startsWith('{{')) {
    resolvedCta = 'https://' + resolvedCta;
  }
  const introHtml = escapeHtml(copy.intro).replace(/\n/g, "");
  // Return a complete HTML document for proper email rendering
  return `


  
  
  
  ${escapeHtml(copy.subject || 'Email')}
  
  
    
      
        96
      
    
  
  
  
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { color: inherit; text-decoration: none; }
  


  
    
        
          
            ${resolvedLogoUrl ? `` : ""}
            ${resolvedCompanyName && !resolvedLogoUrl ? `${escapeHtml(resolvedCompanyName)}` : ""}
            
              ${escapeHtml(copy.heroTitle)}
            
            
              ${escapeHtml(copy.heroSubtitle)}
            
            
              ${escapeHtml(copy.secondaryCtaLabel || copy.ctaLabel)}
            
          
        
        
          
            
              ${introHtml}
            
            
              What you’ll get:
              
                ${escapeHtml(bullets[0])}
                ${escapeHtml(bullets[1])}
                ${escapeHtml(bullets[2])}
              
            
            
              
                ${escapeHtml(copy.ctaLabel)}
              
            
            
              ${escapeHtml(copy.closingLine)}
            
          
        
        ${footerRow}
      
    
  

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
      
        
          
            
              ${escapeHtml(ctaText)}
            
          
        
      
    `;
  }
  
  return `


  
  
  
  
  
  
  
    
      
        
        96
      
    
  
  
  Email
  
    body { margin: 0; padding: 0; }
    table { border-spacing: 0; }
    td { padding: 0; }
    img { border: 0; }
  


  
    
      
        
          
            
              ${body}
              ${ctaHtml}
            
          
          
            
              ${escapeHtml(organizationName)}
              ${escapeHtml(organizationAddress)}
              
                Unsubscribe
                |
                Manage Preferences
              
            
          
        
      
    
  

`;
}