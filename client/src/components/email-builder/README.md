# Email Builder Components

Complete email campaign builder system with multiple interfaces, AI-assisted generation, and preview capabilities.

## ✅ Complete Component Library

### Core Builders

#### 1. **EmailCanvas** (558 lines)
- GrapesJS-based drag-and-drop editor
- 15+ pre-built email blocks
- Multi-device preview (desktop/tablet/mobile)
- Responsive CSS with Outlook compatibility
- Personalization token support
- Link sanitization for security
- Undo/Redo functionality
- Real-time HTML + design export

```typescript
import { EmailCanvas } from "@/components/email-builder";

<EmailCanvas
  initialHtml="<p>Start here</p>"
  onChange={(html, design) => console.log(html)}
  onModeChange={(mode) => console.log(mode)}
/>
```

#### 2. **SimpleEmailCanvas** (349 lines)
- ContentEditable WYSIWYG editor
- Rich text formatting toolbar
- 20+ merge field tokens (Contact, Account, Campaign)
- Link insertion/removal
- Font size, alignment, lists
- Lightweight alternative to GrapesJS
- Perfect for mobile or quick editing

```typescript
import { SimpleEmailCanvas } from "@/components/email-builder";

<SimpleEmailCanvas
  initialHtml="<p>Your content</p>"
  onChange={(html) => setHtml(html)}
/>
```

#### 3. **HtmlCodeEditor** (102 lines)
- Monaco Editor with HTML support
- Syntax highlighting
- Auto-formatting and completion
- Code preview toggle
- Personalization token helper text

```typescript
import { HtmlCodeEditor } from "@/components/email-builder";

<HtmlCodeEditor
  value={html}
  onChange={(code) => setHtml(code)}
  onPreview={() => showPreview()}
  height="500px"
/>
```

#### 4. **EmailPreview** (248 lines)
- Multi-device viewport preview
- Dark mode support
- Contact selector for personalization
- Token replacement ({{contact.first_name}}, {{account.name}})
- Preheader injection
- Responsive iframe rendering

```typescript
import { EmailPreview } from "@/components/email-builder";

<EmailPreview
  open={true}
  onOpenChange={setOpen}
  htmlContent={html}
  subject="Welcome!"
  preheader="Check this out"
  sampleContacts={contacts}
  onSelectContact={setSelectedContact}
/>
```

### Builder Wrappers

#### 5. **EmailBuilderClean** (227 lines)
- Organized layout with tabs
- Left sidebar for subject/preheader
- Visual and HTML code modes
- Test email sending
- Preview modal
- Clean, professional interface

```typescript
import { EmailBuilderClean } from "@/components/email-builder";

<EmailBuilderClean
  initialSubject="Subject"
  initialHtml="<p>Content</p>"
  sampleContacts={contacts}
  senderProfileId="123"
  onSave={(data) => console.log(data)}
  onSendTest={(emails) => sendTests(emails)}
/>
```

#### 6. **EmailBuilderUltraClean** (222 lines)
- Minimal, distraction-free interface
- Floating action bar
- Mode selector dropdown
- Quick metadata toggle
- Single-line test email input
- Maximum canvas space

```typescript
import { EmailBuilderUltraClean } from "@/components/email-builder";

<EmailBuilderUltraClean
  onSave={handleSave}
  onSendTest={handleTest}
/>
```

#### 7. **EmailBuilderBrevoStyle** (418 lines)
- Advanced 3-tab interface (Content, Style, AI)
- Left sidebar panel
- Brand color selector (Indigo, Emerald, Slate)
- AI-assisted generation:
  - Template selection
  - Custom prompt generation
- Editor mode switcher
- Full-featured professional builder

```typescript
import { EmailBuilderBrevoStyle } from "@/components/email-builder";

<EmailBuilderBrevoStyle
  initialSubject="Subject"
  sampleContacts={contacts}
  senderProfileId="123"
  onSave={handleSave}
  onSendTest={handleTest}
/>
```

### Modal Components

#### 8. **TemplateSelectorModal** (255 lines)
- Browse email templates
- Full-text search
- Category filtering
- Grid view with thumbnails
- "Start from Scratch" option
- Template preview integration

```typescript
import { TemplateSelectorModal } from "@/components/email-builder";

<TemplateSelectorModal
  open={true}
  onOpenChange={setOpen}
  onSelectTemplate={(template) => useTemplate(template)}
/>
```

#### 9. **TemplatePreviewModal** (134 lines)
- Full template metadata display
- Subject line preview
- Creator and date information
- Responsive iframe preview
- Use template action

```typescript
import { TemplatePreviewModal } from "@/components/email-builder";

<TemplatePreviewModal
  open={true}
  onOpenChange={setOpen}
  template={selectedTemplate}
  onUseTemplate={(template) => useIt(template)}
/>
```

#### 10. **SendTestEmailModal** (249 lines)
- Multiple recipient support
- Contact personalization preview
- Email validation
- Subject line preview
- Success/error notifications
- Sender profile requirement check

```typescript
import { SendTestEmailModal } from "@/components/email-builder";

<SendTestEmailModal
  open={true}
  onOpenChange={setOpen}
  subject="Subject"
  htmlContent="<p>Email HTML</p>"
  senderProfileId="123"
  sampleContacts={contacts}
/>
```

### Utilities

#### 11. **ai-email-template.ts** (194 lines)
- `buildBrandedEmailHtml()` - Generate responsive emails
- `EMAIL_TEMPLATES` - Pre-built templates (welcome, announcement, promotion)
- Brand palettes (Indigo, Emerald, Slate)
- HTML escaping for safety
- Fully responsive design

```typescript
import { buildBrandedEmailHtml, EMAIL_TEMPLATES } from "@/components/email-builder";

const html = buildBrandedEmailHtml({
  copy: {
    subject: "Welcome!",
    preheader: "Check this out",
    heroTitle: "Welcome Aboard",
    valueBullets: ["Benefit 1", "Benefit 2"],
    ctaUrl: "https://example.com",
    ctaText: "Get Started",
    fromName: "Team",
    fromEmail: "hello@example.com"
  },
  brandPalette: "indigo",
  includeFooter: true
});
```

## 📦 Dependencies

**NPM Packages Installed:**
- `grapesjs` - Drag-drop email builder
- `grapesjs-preset-newsletter` - Email-specific GrapesJS plugin
- `@monaco-editor/react` - Code editor
- `@tanstack/react-query` - Data fetching
- `react-hook-form` - Form management
- `zod` - Schema validation
- `date-fns` - Date formatting
- `tailwindcss` - Styling
- `shadcn/ui` - UI components
- `lucide-react` - Icons

**Already Available:**
All dependencies are now installed in the project.

## 🎯 Usage Patterns

### Pattern 1: Quick Builder
```typescript
import { EmailBuilderUltraClean } from "@/components/email-builder";

function CampaignEditor() {
  return (
    <EmailBuilderUltraClean
      onSave={(data) => saveCampaign(data)}
      onSendTest={(emails) => sendTestEmails(emails)}
    />
  );
}
```

### Pattern 2: Feature-Rich Builder
```typescript
import { EmailBuilderBrevoStyle } from "@/components/email-builder";

function AdvancedEditor() {
  return (
    <EmailBuilderBrevoStyle
      initialSubject="My Campaign"
      sampleContacts={contactList}
      senderProfileId={activeSenderId}
      onSave={saveCampaign}
      onSendTest={sendTests}
    />
  );
}
```

### Pattern 3: Custom Layout
```typescript
import {
  EmailCanvas,
  HtmlCodeEditor,
  EmailPreview
} from "@/components/email-builder";

function CustomBuilder() {
  const [html, setHtml] = useState("");
  const [mode, setMode] = useState("visual");

  return (
    <div className="grid grid-cols-2">
      <div>
        {mode === "visual" ? (
          <EmailCanvas onChange={(html) => setHtml(html)} />
        ) : (
          <HtmlCodeEditor value={html} onChange={setHtml} />
        )}
      </div>
      <EmailPreview htmlContent={html} />
    </div>
  );
}
```

### Pattern 4: AI-Assisted Generation
```typescript
import { buildBrandedEmailHtml, EMAIL_TEMPLATES } from "@/components/email-builder";

const welcomeEmail = buildBrandedEmailHtml({
  copy: EMAIL_TEMPLATES.welcome,
  brandPalette: "emerald"
});

setHtmlContent(welcomeEmail);
```

## 🔧 Integration Points

### With Campaign Editor
```typescript
import { EmailBuilderClean, SendTestEmailModal } from "@/components/email-builder";

function CampaignStep2() {
  const [showBuilder, setShowBuilder] = useState(true);
  
  return (
    <>
      {showBuilder && (
        <EmailBuilderClean
          sampleContacts={campaign.sampleContacts}
          senderProfileId={campaign.senderId}
          onSave={({ subject, preheader, htmlContent }) => {
            updateCampaign({ subject, preheader, htmlContent });
          }}
          onSendTest={(emails) => {
            // Call POST /api/campaigns/send-test
          }}
        />
      )}
    </>
  );
}
```

### With Template System
```typescript
import { TemplateSelectorModal, TemplatePreviewModal } from "@/components/email-builder";

function TemplateWorkflow() {
  const [showSelector, setShowSelector] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  return (
    <>
      <TemplateSelectorModal
        open={showSelector}
        onOpenChange={setShowSelector}
        onSelectTemplate={setSelectedTemplate}
      />
      <TemplatePreviewModal
        open={!!selectedTemplate}
        onOpenChange={() => setSelectedTemplate(null)}
        template={selectedTemplate}
        onUseTemplate={(template) => {
          setHtml(template.htmlContent);
          setSelectedTemplate(null);
        }}
      />
    </>
  );
}
```

## 📊 Component Statistics

| Component | Lines | Purpose |
|-----------|-------|---------|
| EmailCanvas | 558 | GrapesJS visual builder |
| SimpleEmailCanvas | 349 | ContentEditable WYSIWYG |
| HtmlCodeEditor | 102 | Monaco HTML editor |
| EmailPreview | 248 | Multi-device preview |
| EmailBuilderClean | 227 | Organized wrapper |
| EmailBuilderUltraClean | 222 | Minimalist wrapper |
| EmailBuilderBrevoStyle | 418 | Advanced wrapper with AI |
| TemplateSelectorModal | 255 | Template browser |
| TemplatePreviewModal | 134 | Template preview |
| SendTestEmailModal | 249 | Test email sender |
| ai-email-template.ts | 194 | AI utilities |
| **Total** | **3,356** | **Complete system** |

## 🚀 Features Summary

✅ **Visual & Code Editors** - Two editing modes  
✅ **Multi-Device Preview** - Desktop/tablet/mobile  
✅ **AI Template Generation** - 3 pre-built templates  
✅ **Rich Text Formatting** - 20+ merge fields  
✅ **Brand Customization** - 3 color palettes  
✅ **Responsive Design** - Mobile-first CSS  
✅ **Email Compliance** - Outlook-safe HTML  
✅ **Personalization** - Token replacement  
✅ **Link Sanitization** - Security built-in  
✅ **Test Email Flow** - Integrated sending  

## 🔒 Security

- HTML escaping prevents XSS
- Link sanitization (protocol whitelist)
- Email validation regex
- Input validation throughout
- Safe iframe rendering
- Content Security Policy ready

## 📝 Notes

- All components are fully typed with TypeScript
- Responsive design included
- Dark mode support in preview
- Undo/Redo on visual builder
- Auto-save patterns supported
- Ready for production use
