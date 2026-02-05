# Email Deliverability Guide - Preventing Emails from Going to Junk

## Why Your Email is Going to Junk Folder

When emails land in the junk/spam folder, email clients (like Outlook) automatically block images and links for security reasons. Here's why your emails might be flagged:

### 1. **Missing Email Authentication (CRITICAL)**

The #1 reason emails go to spam is missing or incorrect email authentication:

- **SPF (Sender Policy Framework)** - Verifies your domain is authorized to send emails
- **DKIM (DomainKeys Identified Mail)** - Cryptographically signs your emails
- **DMARC (Domain-based Message Authentication)** - Policy for handling failed authentication

**Action Required:** Your IT/email administrator needs to set up SPF, DKIM, and DMARC records in your domain's DNS settings.

### 2. **Missing Unsubscribe Link**

Most jurisdictions (GDPR, CAN-SPAM) require an unsubscribe link. Spam filters penalize emails without one.

**Action Required:** Add an unsubscribe link to your email footer.

### 3. **Poor Sender Reputation**

Factors that hurt reputation:

- High bounce rates (invalid email addresses)
- High spam complaint rates
- Sending to inactive subscribers
- Using free email services (Gmail, Yahoo) for bulk sending

**Action Required:**

- Clean your email list regularly
- Remove hard bounces immediately
- Use a professional email service (Mailchimp, SendGrid, etc.) or your own domain

### 4. **Email Content Issues**

- Too many images with little text (image-only emails are spammy)
- Spam trigger words (though your newsletter looks clean)
- Suspicious links or domains
- Missing physical mailing address (required in some regions)

### 5. **Technical Issues**

- Broken HTML structure
- Missing text alternatives for images
- Suspicious link patterns

## How to Fix It

### Immediate Actions (You Can Do Now):

1. **Add Unsubscribe Link** ✅ (I'll add this to your email)
2. **Add Physical Address** (if required by law in your region)
3. **Test Your Email** using tools like:
   - Mail-tester.com (free spam score checker)
   - GlockApps
   - Litmus

### Actions for Your IT/Email Admin:

1. **Set Up SPF Record**

   ```
   Add to DNS: v=spf1 include:_spf.google.com ~all
   (Adjust based on your email service)
   ```

2. **Set Up DKIM**

   - Generate DKIM keys from your email service provider
   - Add public key to DNS as TXT record

3. **Set Up DMARC**

   ```
   Add to DNS: v=DMARC1; p=none; rua=mailto:dmarc@biofarm.co.uk
   (Start with "p=none" to monitor, then move to "p=quarantine" or "p=reject")
   ```

4. **Use Professional Email Service**
   - Consider using services like:
     - Mailchimp
     - SendGrid
     - Amazon SES
     - Campaign Monitor
   - These services handle authentication and improve deliverability

### Best Practices Going Forward:

1. **Maintain Clean Lists**

   - Remove bounced emails immediately
   - Remove inactive subscribers (6+ months)
   - Use double opt-in for new subscribers

2. **Monitor Engagement**

   - Track open rates, click rates, spam complaints
   - Low engagement = higher spam risk

3. **Warm Up New IPs/Domains**

   - If using new sending infrastructure, start with small volumes
   - Gradually increase over 2-4 weeks

4. **Ask Recipients to Whitelist**

   - Include instructions: "Add us to your contacts" or "Mark as not junk"
   - This trains the recipient's email client

5. **Test Before Sending**
   - Always test emails before sending to full list
   - Check spam scores
   - Test across different email clients

## Quick Checklist

- [ ] SPF record configured
- [ ] DKIM configured
- [ ] DMARC policy set
- [ ] Unsubscribe link added
- [ ] Physical address included (if required)
- [ ] Email list cleaned (no bounces)
- [ ] Using professional email service
- [ ] Tested with Mail-tester.com
- [ ] Text-to-image ratio is good (not image-only)
- [ ] All links are legitimate and working

## Testing Your Email

1. **Mail-tester.com** (Free)

   - Send test email to address provided
   - Get spam score (aim for 8+/10)
   - See detailed breakdown of issues

2. **Check Authentication**

   - Use MXToolbox.com to check SPF/DKIM/DMARC records
   - Verify all records are properly configured

3. **Test in Multiple Clients**
   - Gmail, Outlook, Apple Mail, etc.
   - Check if images load
   - Verify links work

## Why Images/Links Are Blocked in Junk Folder

Email clients automatically block images and links in emails marked as spam/junk to:

- Protect users from malicious content
- Prevent tracking pixels
- Block phishing attempts

**Solution:** Fix deliverability issues so emails land in inbox, not junk folder.

---

**Note:** The technical fixes (SPF/DKIM/DMARC) must be done by someone with access to your domain's DNS settings. This is typically your IT department or web hosting provider.
