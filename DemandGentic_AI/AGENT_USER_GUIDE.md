# Pivotal CRM - Agent User Guide

## Welcome to Pivotal CRM Agent Console

This guide will help you get started with making calls, managing your queue, and completing dispositions in the Pivotal CRM Agent Console.

---
## Access Platform

Access the Pivotal B2B platform at the following URL:

- [Pivotal B2B Platform](https://beta-platform.pivotal-b2b.com/)

Ensure you're logged into your account to access all features.

---
## Table of Contents
1. [Login Instructions](#login-instructions)
2. [Accessing the Agent Console](#accessing-the-agent-console)
3. [Understanding the Agent Console](#understanding-the-agent-console)
4. [Selecting Your Campaign](#selecting-your-campaign)
5. [Managing Your Call Queue](#managing-your-call-queue)
6. [Making Calls](#making-calls)
7. [Dispositioning Calls (CRITICAL)](#dispositioning-calls-critical)
8. [Call Scripts & Personalization](#call-scripts--personalization)
9. [Power Dial vs Manual Dial Mode](#power-dial-vs-manual-dial-mode)
10. [Troubleshooting](#troubleshooting)

---

## Login Instructions
#### Pivotal B2B – Agent Credentials (Setup Sheet)

**Default Password Policy:** Password = Username (case-sensitive)

| Username        | Full Name             | Email                | Role            | Secondary Role | Password | Date Added    |
|-----------------|-----------------------|----------------------|-----------------|----------------|----------|---------------|
| belalm          | Belal Mirzayee        | belalm@crm.local     | Agent           | —              | belalm   | 19 Oct 2025   |
| samp            | Sami Peerzad          | sam@crm.local        | Quality Analyst | Agent          | samp     | 19 Oct 2025   |
| paikanm         | Paikan Adham          | paikan@crm.local     | Agent           | —              | paikanm  | 19 Oct 2025   |
| besmullaha      | Besumullah Ahmadi     | besmulllah@crm.local | Agent           | —              | besmullaha | 19 Oct 2025  |
| mashalh         | Mashal Hayat          | mashal@crm.global    | Agent           | —              | mashalh  | 19 Oct 2025   |
| mashalf         | Fatima Mashal         | mashal.f@crm.local   | Agent           | —              | mashalf  | 19 Oct 2025   |
| anasa           | Anas Ahmad            | anas@crm.local       | Agent           | —              | anasa    | 19 Oct 2025   |
### Step 1: Access the System
Navigate to your Pivotal CRM URL in your web browser (Chrome, Firefox, or Safari recommended).

### Step 2: Enter Your Credentials
Use the credentials provided by your administrator:

**Available Agent Accounts:** 



> **Note:** Passwords should be provided separately by your system administrator for security reasons.

### Step 3: Navigate to Login Page
1. Click the "Sign In" button on the homepage
2. Enter your **username** or **email**
3. Enter your **password**
4. Click "Sign In"

---

## Accessing the Agent Console

### From the Main Navigation

**Option 1: Using the Sidebar (Desktop)**
1. After logging in, look at the left sidebar
2. Click on **"Campaigns"** section
3. Select **"Agent Console"**

**Option 2: Direct Navigation**
- Simply navigate to: `/agent-console` in your browser URL

### First Time Setup
When you first access the Agent Console, you'll need to:
1. Allow microphone permissions (browser will prompt you)
2. Wait for WebRTC connection to establish (you'll see "Ready" status)
3. Select your campaign from the dropdown

---

## Understanding the Agent Console

The Agent Console is divided into several key areas:

### 📱 **Mobile Layout** (Phones & Tablets)
- **Row 1:** Campaign selector and page title
- **Row 2:** Status badges and quick controls
- **Row 3:** Queue progress indicator
- **Contact Card:** Contact information with call controls
- **Script Area:** Call script with personalized fields

### 💻 **Desktop Layout** (Large Screens)
- **Top Header:** Campaign selector, queue progress, status badges
- **Left Sidebar:** Contact queue (scrollable list)
- **Center Panel:** Contact information and call controls
- **Bottom Panel:** Call script, disposition, and notes

### Key Status Indicators

| Status | Meaning |
|--------|---------|
| 🟢 **Ready** | Connected and ready to make calls |
| 🔴 **Disconnected** | Not connected to phone system |
| 🔵 **Active - 00:15** | Currently on a call (with timer) |
| 🟠 **Wrap-Up** | Call ended, must complete disposition |
| ⚪ **Connecting...** | Call is being initiated |
| ⚪ **Ringing...** | Phone is ringing |

---

## Selecting Your Campaign

### Step 1: Choose Your Campaign
1. Look for the **Campaign** dropdown in the header
2. Click to see available campaigns you're assigned to
3. Select the campaign you want to work on

### Step 2: Understand Campaign Types

**🔌 Power Dial Mode**
- Automated dialing system
- System dials numbers automatically
- Only connected calls (humans) are routed to you
- AMD (Answering Machine Detection) enabled
- Higher efficiency for large volume outreach

**📞 Manual Dial Mode**
- You control when to dial each contact
- Review contact information before calling
- Click "Call Now" to initiate each call
- Better for complex or personalized conversations

---

## Managing Your Call Queue

### Understanding Your Queue

Your queue shows all contacts assigned to you for the selected campaign.

**Queue Controls (Manual Dial Mode Only):**
- **Add Contacts:** Use the "+" button to add new contacts to your queue
- **Filters:** Apply filters to focus on specific types of contacts
- **Refresh:** Click the refresh button to update your queue

### Navigating Contacts

**Desktop:** 
- Click on any contact in the left sidebar to view their details
- Use ← and → buttons to move between contacts

**Mobile:**
- Swipe or use navigation buttons
- Contact list shows up to 15 contacts at a time

### Queue Progress
The progress bar shows: **Contact X of Y**
- X = Current contact position
- Y = Total contacts in queue

> **⚠️ IMPORTANT:** You cannot switch contacts while a call is active or if you haven't saved the disposition!

---

## Making Calls

### For Manual Dial Mode:

**Step 1: Review Contact Information**
- Name, title, and company
- Email address
- Phone numbers available

**Step 2: Select Phone Number**
1. Click the **Phone Type** dropdown
2. Choose from:
   - **Direct Phone** (contact's direct line)
   - **Company Phone** (main company number)
   - **Manual Dial** (enter any phone number)

**Step 3: Initiate the Call**
1. Click the green **"Call Now"** button
2. Wait for the call to connect
3. Status will change: Connecting → Ringing → Active

**Step 4: During the Call**
- **Mute/Unmute:** Click mute button to toggle microphone
- **Hold:** (if available) Put the call on hold
- **Follow the Script:** Read the personalized call script below
- **Take Notes:** Use the notes field to document the conversation

**Step 5: End the Call**
1. Click the red **"Hang Up"** button
2. Status changes to **"Wrap-Up"**
3. You must now complete the disposition (see next section)

### For Power Dial Mode:

**Step 1: Be Ready**
- System automatically dials contacts
- Ensure your headset is working
- Be prepared to speak immediately when connected

**Step 2: Call Connects**
- You'll hear a tone when a human answers
- System filters out answering machines and voicemails
- Quickly review the contact information displayed

**Step 3: Handle the Call**
- Follow your script
- Take notes during conversation
- Click "Hang Up" when finished

---

## Dispositioning Calls (CRITICAL)

### ⚠️ WHY DISPOSITIONS ARE CRITICAL

**Dispositions are the single most important step in your workflow because:**

1. **Data Accuracy:** They record the outcome of every call attempt
2. **Campaign Tracking:** Managers use this data to measure campaign success
3. **Follow-up Actions:** Determines if and when to contact this person again
4. **Compliance:** Required for regulatory reporting (Do Not Call lists)
5. **Performance Metrics:** Your productivity is measured by completed dispositions
6. **Queue Management:** You cannot move to the next contact without completing it

> **🚫 YOU CANNOT SKIP DISPOSITIONS!** The system will block you from making another call until you complete the disposition for the current contact.

### How to Complete a Disposition

**Step 1: Call Ends**
- After you click "Hang Up", status changes to "Wrap-Up"
- Disposition form appears at the bottom of the screen

**Step 2: Select Disposition Code**
Choose the appropriate outcome:

| Disposition | When to Use |
|-------------|-------------|
| **Qualified** | Contact meets qualification criteria |
| **Not Interested** | Contact declined/not interested |
| **Voicemail** | Reached voicemail, left message |
| **Call Back** | Contact asked to be called back later |
| **Do Not Call** | Contact requested to be removed from calling list |
| **Invalid Data** | Wrong number, disconnected, or bad data |

**Step 3: Add Call Notes**
- Document key points from the conversation
- Include any action items or follow-up needed
- Note contact's specific feedback or concerns
- Be clear and concise

**Step 4: Set Callback (if applicable)**
- If contact requested callback, set date/time
- System will re-queue this contact automatically

**Step 5: Save Disposition**
1. Click **"Save Disposition"** button
2. Wait for confirmation message
3. System automatically advances to next contact

### Best Practices for Dispositions

✅ **DO:**
- Complete disposition immediately after each call
- Be accurate and honest
- Add detailed notes
- Use "Do Not Call" when requested

❌ **DON'T:**
- Skip or rush through dispositions
- Use incorrect codes to inflate metrics
- Leave notes field empty
- Delay completing dispositions

---

## Call Scripts & Personalization

### Understanding the Script

The call script appears below the contact information and is **automatically personalized** with:

**Contact Information:**
- Full Name, First Name, Last Name
- Job Title
- Department
- Seniority Level
- Direct Phone, Mobile Phone
- Email Address
- Location (City, State, Country)
- LinkedIn URL

**Company Information:**
- Company Name
- Company Domain
- Industry
- Staff Count
- Annual Revenue
- Main Phone Number
- Headquarters Location
- Year Founded
- Technology Stack
- Company LinkedIn URL

### How to Use the Script

1. **Review Before Calling:** Read through the script before dialing
2. **Personalize Your Delivery:** Don't sound like you're reading robotically
3. **Use Placeholders:** Fields like `{{firstName}}` will show "John" for example
4. **Adapt as Needed:** Script is a guide, adjust based on conversation flow
5. **Handle Objections:** Script may include objection handling sections

### Example Script with Personalization

```
Hi {{firstName}}, this is [Your Name] from Pivotal B2B.

I'm reaching out because I noticed {{companyName}} is in the {{industry}} 
industry, and we help companies like yours improve their sales processes.

I see you're the {{jobTitle}} - is this still accurate?

[Continue with your pitch...]
```

**This would appear to the agent as:**

```
Hi John, this is Sarah from Pivotal B2B.

I'm reaching out because I noticed Acme Corporation is in the Technology 
industry, and we help companies like yours improve their sales processes.

I see you're the VP of Sales - is this still accurate?

[Continue with your pitch...]
```

---

##

### "Disconnected" Status

**Problem:** Red "Disconnected" badge appears

**Solutions:**
1. Refresh your browser page
2. Check your internet connection
3. Ensure microphone permissions are granted
4. Contact IT support if issue persists

### Cannot Hear Caller

**Problem:** Call connects but no audio

**Solutions:**
1. Check your headset is plugged in
2. Verify browser has microphone access
3. Click "Refresh" button in header
4. Try different browser (Chrome recommended)

### Stuck in "Wrap-Up" Mode

**Problem:** Cannot make next call, stuck in wrap-up

**Solutions:**
1. Ensure you've selected a disposition code
2. Check that you've added call notes
3. Click "Save Disposition" button
4. Wait for confirmation message
5. If still stuck, refresh page (disposition should be saved)

### Contact Queue is Empty

**Problem:** "No contacts in queue" message

**Solutions:**
1. Check you've selected the correct campaign
2. Click refresh button to reload queue
3. For Manual Dial: Use "Add Contacts" button
4. Contact your manager if queue should have contacts

### Call Recording Not Available

**Problem:** Cannot hear call recording

**Solutions:**
1. Check if campaign has recording enabled
2. Recording may take a few minutes to process
3. Ensure you have proper permissions
4. Contact supervisor if recordings should be available

### Script Not Showing Contact Information

**Problem:** Script shows `{{firstName}}` instead of actual name

**Solutions:**
1. This means contact data is incomplete
2. Note the missing information in disposition
3. Contact may need data enrichment
4. Proceed with call using available information

---

## Mobile & Tablet Usage

### Optimized for All Devices

The Agent Console is fully responsive and works on:
- 📱 **Mobile Phones** (iPhone, Android)
- 📱 **Tablets** (iPad, Android tablets)
- 💻 **Laptops & Desktops**

### Mobile-Specific Features

**Touch-Friendly Controls:**
- All buttons are 40px+ for easy tapping
- Campaign selector optimized for touch
- Swipe-friendly navigation
- Larger call control buttons

**Compact Layout:**
- 3-row header with essential controls
- Collapsible sections for more screen space
- Streamlined contact information
- Easy-to-read script display

**Best Practices for Mobile:**
1. Use landscape mode for better script reading
2. Ensure stable WiFi connection
3. Use headphones for better audio quality
4. Close other apps to free up memory

---

## Performance Tips

### Maximize Your Productivity

1. **Stay Organized**
   - Keep notes concise but detailed
   - Complete dispositions immediately
   - Review scripts before campaigns start

2. **Efficient Call Flow**
   - Have script memorized for natural delivery
   - Keep water nearby for voice health
   - Take short breaks between call sessions

3. **Quality Over Quantity**
   - Accurate dispositions are more important than speed
   - Listen actively to prospects
   - Build rapport, don't just read scripts

4. **Technical Setup**
   - Use wired headset for best audio
   - Close unnecessary browser tabs
   - Use Chrome for best performance
   - Ensure strong internet connection

---

## Getting Help

### Support Resources

**Technical Issues:**
- Contact IT Support
- Check system status page
- Review this guide's troubleshooting section

**Campaign Questions:**
- Ask your campaign manager
- Review campaign briefing documents
- Attend team huddles

**Product/Offering Questions:**
- Review sales collateral
- Consult knowledge base
- Ask senior team members

---

## Quick Reference Card

### Essential Keyboard Shortcuts
- **Space:** Mute/Unmute (when call active)
- **Enter:** Save disposition (when in wrap-up)
- **← →:** Navigate between contacts (when not on call)

### Status Meanings Quick Reference
- 🟢 Ready = Make calls
- 🔵 Active = On call
- 🟠 Wrap-Up = Complete disposition
- 🔴 Disconnected = Technical issue

### Remember the 3 S's
1. **Select** your campaign
2. **Start** making calls
3. **Save** dispositions

---

## Frequently Asked Questions

**Q: Can I skip a contact I don't want to call?**
A: Yes, use the → button to move to next contact (Manual mode only).

**Q: What if I accidentally hang up?**
A: Complete the disposition based on what you observed. You can note it was accidental in the notes.

**Q: Can I call a contact back later in the day?**
A: Yes, use "Callback Requested" disposition and set the callback date/time.

**Q: What if the contact asks to be removed from calling?**
A: Use "Do Not Call" disposition immediately. This is legally required.

**Q: How many calls should I make per day?**
A: Your manager will set daily goals. Focus on quality conversations, not just volume.

**Q: Can I work from home?**
A: Check with your manager. You'll need stable internet and a quiet environment.

---

## Version Information

**Document Version:** 1.0  
**Last Updated:** October 20, 2025  
**System Version:** Pivotal CRM v1.0

---

**Need Additional Help?** Contact your team supervisor or system administrator.

**Remember:** Your success as an agent depends on accurate dispositions, professional communication, and efficient queue management. This guide is your companion - refer to it often!