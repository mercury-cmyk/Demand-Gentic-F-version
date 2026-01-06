/**
 * Spam Analysis Utilities
 * 
 * Provides heuristics for identifying common spam triggers in B2B demand gen emails.
 * Note: These are client-side aids, actual ISP filtering is dynamic.
 */

export interface SpamAnalysisResult {
  score: number; // 0-100 (high = more likely spam)
  rating: 'safe' | 'warning' | 'critical';
  triggers: Array<{
    type: 'keyword' | 'formatting' | 'technical';
    label: string;
    message: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}

const SPAMMY_KEYWORDS = [
  'free', 'guaranteed', 'no cost', 'winner', 'urgent', 'act now',
  'limited time', 'risk-free', 'money back', 'cash', 'earn $$$',
  'million', 'billion', 'inheritance', 'lottery', 'viagra',
  'pharmacy', 'offshore', 'hidden', 'unsolicited', 'marketing'
];

const AGGRESSIVE_PUNCTUATION = /[!!]{2,}|[\?\?]{2,}/;
const ALL_CAPS_WORDS = /\b[A-Z]{5,}\b/;

/**
 * Run a multi-pass analysis on email content for deliverability risks
 */
export function analyzeSpamRisk(subject: string, html: string): SpamAnalysisResult {
  const triggers: SpamAnalysisResult['triggers'] = [];
  let score = 0;

  // 1. Subject Line Analysis
  const subLower = subject.toLowerCase();
  
  // Keyword check
  SPAMMY_KEYWORDS.forEach(word => {
    if (subLower.includes(word)) {
      triggers.push({
        type: 'keyword',
        label: `Spammy keyword in subject: "${word}"`,
        message: 'ISPs flag common marketing buzzwords in subject lines.',
        severity: 'medium'
      });
      score += 15;
    }
  });

  if (AGGRESSIVE_PUNCTUATION.test(subject)) {
    triggers.push({
      type: 'formatting',
      label: 'Excessive punctuation',
      message: 'Avoid multiple exclamation points or question marks.',
      severity: 'high'
    });
    score += 20;
  }

  // 2. Content Analysis
  const contentLower = html.toLowerCase();

  // Link safety
  const linkCount = (html.match(/<a/g) || []).length;
  if (linkCount > 10) {
    triggers.push({
      type: 'technical',
      label: 'Too many links',
      message: 'High link-to-text ratios are a common signature of phishing.',
      severity: 'medium'
    });
    score += 20;
  }

  // Tracking pixel check (Heuristic: very small images)
  const imageCount = (html.match(/<img/g) || []).length;
  if (imageCount > 5) {
    triggers.push({
      type: 'technical',
      label: 'Image heavy',
      message: 'Emails with many images and little text are often filtered.',
      severity: 'low'
    });
    score += 5;
  }

  // 3. Compliance checks
  if (!contentLower.includes('unsubscribe')) {
    triggers.push({
      type: 'technical',
      label: 'Missing unsubscribe link',
      message: 'CAN-SPAM compliance requires a clear way to opt-out.',
      severity: 'high'
    });
    score += 40;
  }

  // Final Rating
  let rating: SpamAnalysisResult['rating'] = 'safe';
  if (score > 50) rating = 'critical';
  else if (score > 25) rating = 'warning';

  return {
    score: Math.min(score, 100),
    rating,
    triggers
  };
}
