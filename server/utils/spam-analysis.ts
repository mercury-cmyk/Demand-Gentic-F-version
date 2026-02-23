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

  // 3. Link Safety Checks
  
  // HTTP (non-HTTPS) links detection
  const httpLinkCount = (html.match(/href=["']http:\/\//gi) || []).length;
  if (httpLinkCount > 0) {
    triggers.push({
      type: 'technical',
      label: `${httpLinkCount} non-HTTPS link(s) found`,
      message: 'HTTP links (not HTTPS) trigger spam filters. Always use HTTPS.',
      severity: 'high'
    });
    score += 25;
  }

  // URL shorteners detection (spam indicator)
  const urlShorteners = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly'];
  const hasShorteners = urlShorteners.some(shortener => contentLower.includes(shortener));
  if (hasShorteners) {
    triggers.push({
      type: 'technical',
      label: 'URL shortener detected',
      message: 'URL shorteners (bit.ly, etc.) are heavily filtered by ISPs.',
      severity: 'high'
    });
    score += 30;
  }

  // IP address links (major phishing indicator)
  const ipLinkPattern = /href=["']https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/gi;
  if (ipLinkPattern.test(html)) {
    triggers.push({
      type: 'technical',
      label: 'IP address link detected',
      message: 'Links with IP addresses (not domains) are blocked by most ISPs.',
      severity: 'high'
    });
    score += 40;
  }

  // Display text vs. actual URL mismatch (phishing indicator)
  const linkMismatchPattern = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>(?!\1)([^<]+)<\/a>/gi;
  let linkMismatchCount = 0;
  let match;
  while ((match = linkMismatchPattern.exec(html)) !== null) {
    const url = match[1];
    const displayText = match[2];
    if (displayText.includes('http') && !displayText.includes(url)) {
      linkMismatchCount++;
    }
  }
  if (linkMismatchCount > 0) {
    triggers.push({
      type: 'technical',
      label: 'Link text mismatch detected',
      message: 'Display text should match the actual URL to avoid phishing flags.',
      severity: 'medium'
    });
    score += 15;
  }

  // 4. Compliance checks
  if (!contentLower.includes('unsubscribe')) {
    triggers.push({
      type: 'technical',
      label: 'Missing unsubscribe link',
      message: 'CAN-SPAM compliance requires a clear way to opt-out.',
      severity: 'high'
    });
    score += 40;
  }

  // Physical address check (CAN-SPAM requirement)
  const hasAddress = /\d+\s+[A-Za-z]+\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)/i.test(html);
  if (!hasAddress) {
    triggers.push({
      type: 'technical',
      label: 'Physical address may be missing',
      message: 'CAN-SPAM requires a valid physical postal address in emails.',
      severity: 'medium'
    });
    score += 10;
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
