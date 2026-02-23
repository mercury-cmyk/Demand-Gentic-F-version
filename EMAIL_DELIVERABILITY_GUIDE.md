# Email Deliverability & Anti-Spam Guide

## Overview
This guide ensures all emails sent through the platform avoid spam filters and maintain high deliverability rates.

## ✅ Implemented Security Features

### 1. **HTTPS Enforcement**
- All generated URLs automatically upgraded from HTTP to HTTPS
- Non-HTTPS links flagged in spam analysis
- **Impact**: HTTP links are a major spam trigger for ISPs

### 2. **URL Safety Validation**
The system now validates all URLs for:
- ✅ IP address detection (blocked - major phishing indicator)
- ✅ URL shortener detection (bit.ly, tinyurl.com, etc.)
- ✅ Suspicious TLD detection (.tk, .ml, .xyz, etc.)
- ✅ Domain length validation
- ✅ Excessive subdomain nesting detection

### 3. **Enhanced Spam Analysis**
Automatically checks for:
- ✅ Non-HTTPS links
- ✅ URL shorteners
- ✅ IP address links
- ✅ Display text vs. URL mismatch (phishing indicator)
- ✅ Missing unsubscribe links
- ✅ Missing physical address
- ✅ Excessive links (>10)
- ✅ Spammy keywords
- ✅ Aggressive punctuation

### 4. **CAN-SPAM Compliance**
- ✅ Automatic unsubscribe URL generation
- ✅ View in browser URL support
- ✅ Physical address requirement check
- ✅ Clear opt-out mechanism

## 🔧 Configuration Required

### Environment Variables
Ensure these are set in your `.env` file:

```bash
# Your domain (MUST be HTTPS)
APP_BASE_URL=https://your-domain.com

# Email authentication (CRITICAL for deliverability)
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=your-email@your-domain.com
SMTP_PASS=your-password

# Sender domain (should match FROM address domain)
SENDER_DOMAIN=your-domain.com
```

## 📧 Email Authentication Setup (CRITICAL)

### SPF Record (Sender Policy Framework)
Add this TXT record to your DNS:

```txt
v=spf1 include:_spf.google.com include:spf.mailgun.org ~all
```

**Adjust based on your email provider:**
- Gmail: `include:_spf.google.com`
- SendGrid: `include:sendgrid.net`
- Mailgun: `include:mailgun.org`
- Amazon SES: `include:amazonses.com`

### DKIM (DomainKeys Identified Mail)
1. Generate DKIM keys via your email provider
2. Add the DKIM TXT record to your DNS
3. Example record:
   ```txt
   default._domainkey.your-domain.com TXT "v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY"
   ```

### DMARC (Domain-based Message Authentication)
Add this TXT record for your domain:

```txt
_dmarc.your-domain.com TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@your-domain.com"
```

**Policy options:**
- `p=none` - Monitor only (testing phase)
- `p=quarantine` - Send suspicious emails to spam
- `p=reject` - Block unauthenticated emails (production)

### List-Unsubscribe Header (RFC 8058)
The system automatically adds:

```
List-Unsubscribe: <https://your-domain.com/unsubscribe?email=...>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

This enables one-click unsubscribe in Gmail, Yahoo, and Outlook.

## 🚫 Things to AVOID

### URL Mistakes (Spam Triggers)
❌ **Never Use:**
- `http://` (always use `https://`)
- IP addresses instead of domains (`https://192.168.1.1/page`)
- URL shorteners (`bit.ly`, `tinyurl.com`, `goo.gl`)
- Free/suspicious domains (`.tk`, `.ml`, `.xyz`)

✅ **Always Use:**
- `https://your-trusted-domain.com/page`
- Full domain names with proper TLDs
- Direct links (no redirects)

### Email Content Mistakes
❌ **Avoid:**
- ALL CAPS SUBJECT LINES!!!
- Multiple exclamation marks!!!!
- Spammy keywords: "FREE", "GUARANTEED", "ACT NOW"
- Too many links (>10 per email)
- Images with no text
- Mismatched link text (link says "google.com" but goes to "suspicious.com")

✅ **Best Practices:**
- Professional subject lines
- Balanced text-to-image ratio
- Clear, honest link descriptions
- Include unsubscribe link
- Include physical address

## 🔍 Testing Your Emails

### Use the Built-in Spam Analyzer
Before sending any campaign:

```bash
POST /api/campaigns/analyze-spam
{
  "subject": "Your subject line",
  "html": "<html>Your email content</html>"
}
```

Response shows spam score (0-100) and specific issues to fix.

### External Testing Tools
1. **Mail-Tester.com** - Comprehensive spam score
2. **GlockApps** - Inbox placement testing
3. **MXToolbox** - DNS and email server health
4. **Google Postmaster Tools** - Gmail reputation monitoring

## 📊 Monitoring Deliverability

### Key Metrics to Track
- **Bounce Rate** - Should be <2%
- **Spam Complaint Rate** - Should be <0.1%
- **Open Rate** - Varies by industry (15-25% typical)
- **Domain Reputation** - Check via SenderScore.org

### Red Flags
🚨 **Immediate Action Needed:**
- Bounce rate >5%
- Spam complaints >0.5%
- Sudden drop in open rates
- Emails going to spam consistently

## 🛡️ URL Safety API

### Check URL Safety Programmatically

```typescript
import { validateUrlSafety } from './server/lib/urlGenerator';

const result = validateUrlSafety('https://example.com/page');
console.log(result);
// {
//   isValid: true,
//   warnings: []
// }
```

### Example Warnings

```javascript
// Bad: HTTP link
validateUrlSafety('http://example.com');
// ⚠️ HTTP links trigger spam filters. Use HTTPS only.

// Bad: IP address
validateUrlSafety('https://192.168.1.1/page');
// ❌ IP addresses (not domain names) are blocked by most ISPs.

// Bad: URL shortener
validateUrlSafety('https://bit.ly/abc123');
// ⚠️ URL shorteners (bit.ly, etc.) trigger spam filters.
```

## 📝 Merge Tags for Compliance

### Required in All Email Templates

```html
<!-- Unsubscribe Link (REQUIRED by CAN-SPAM) -->
<a href="{{unsubscribe_url}}">Unsubscribe from this list</a>

<!-- Physical Address (REQUIRED by CAN-SPAM) -->
<p>
  Your Company Name<br>
  123 Business Street, Suite 100<br>
  City, State 12345<br>
  United States
</p>

<!-- View in Browser (Recommended) -->
<a href="{{view_in_browser_url}}">View this email in your browser</a>
```

### Landing Page Merge Tags (Secure)

```html
<!-- Prefilled landing page (recommended) -->
<a href="{{campaign.landing_page}}">Register Now</a>

<!-- Raw landing page URL (not recommended - no tracking) -->
<a href="{{campaign.landing_page_raw}}">Register Now</a>
```

## 🔐 Security Best Practices

### URL Parameter Encoding
All URL parameters are automatically encoded:
- `john.doe@example.com` → `john.doe%40example.com`
- `Smith & Co.` → `Smith%20%26%20Co.`

### XSS Prevention
- Never insert user input directly into URLs
- Always use the `generateTrackingUrl()` function
- Parameters are sanitized automatically

### GDPR Compliance
- Unsubscribe must work within 10 business days
- Store consent records
- Honor "Do Not Email" requests immediately
- Provide data export/deletion on request

## 📞 Support

### If Emails Are Going to Spam
1. Run spam analysis via `/api/campaigns/analyze-spam`
2. Check DNS records (SPF, DKIM, DMARC)
3. Verify sender domain reputation
4. Review email content for triggers
5. Warm up new domains gradually (start with small batches)

### Domain Warm-up Schedule
New sending domains should follow this schedule:

| Day | Volume |
|-----|---------|
| 1-2 | 50 emails/day |
| 3-5 | 100 emails/day |
| 6-10 | 500 emails/day |
| 11-15 | 1,000 emails/day |
| 16+ | Full volume |

## ✨ Summary Checklist

Before launching any email campaign:

- [ ] Subject line passes spam analysis (<25 score)
- [ ] All links use HTTPS (no HTTP)
- [ ] No URL shorteners used
- [ ] Unsubscribe link present and working
- [ ] Physical address included
- [ ] SPF record configured
- [ ] DKIM keys active
- [ ] DMARC policy set
- [ ] Sender domain matches FROM address
- [ ] Test email sent to spam checker
- [ ] Preview looks good on mobile
- [ ] Links tested and working
- [ ] Merge tags render correctly

---

**Last Updated**: February 23, 2026  
**Maintained By**: Engineering Team
