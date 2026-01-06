// Email Builder Components - Central Export Point
// All components are fully functional and ready to use

// Core Builders
export { EmailCanvas } from "./EmailCanvas";
export { SimpleEmailCanvas } from "./SimpleEmailCanvas";
export { HtmlCodeEditor } from "./HtmlCodeEditor";
export { EmailPreview } from "./EmailPreview";

// Builder Wrappers
export { EmailBuilderClean } from "./EmailBuilderClean";
export { EmailBuilderUltraClean } from "./EmailBuilderUltraClean";
export { EmailBuilderBrevoStyle } from "./EmailBuilderBrevoStyle";
export { EmailBuilderPro } from "./EmailBuilderPro"; // NEW: Production-ready, deliverability-focused builder

// Blocks
export { ButtonBlock, createButtonHtml } from "./ButtonBlock";

// Modals
export { SendTestEmailModal } from "./SendTestEmailModal";
export { TemplateSelectorModal } from "./TemplateSelectorModal";
export { TemplatePreviewModal } from "./TemplatePreviewModal";

// Utilities
export {
  buildBrandedEmailHtml,
  buildTextFirstEmailHtml,
  escapeHtml,
  EMAIL_TEMPLATES,
  type BrandPaletteKey,
  type EmailTemplateCopy
} from "./ai-email-template";

// Usage Examples:
// 
// 1. Simple Visual Builder:
//    import { EmailCanvas } from "@/components/email-builder";
//    <EmailCanvas onChange={(html, design) => console.log(html)} />
//
// 2. Content Editable Alternative:
//    import { SimpleEmailCanvas } from "@/components/email-builder";
//    <SimpleEmailCanvas onChange={(html) => console.log(html)} />
//
// 3. HTML Code Editor:
//    import { HtmlCodeEditor } from "@/components/email-builder";
//    <HtmlCodeEditor value={html} onChange={(code) => setHtml(code)} />
//
// 4. Multi-Device Preview:
//    import { EmailPreview } from "@/components/email-builder";
//    <EmailPreview open={true} onOpenChange={setOpen} htmlContent={html} />
//
// 5. Complete Clean Builder:
//    import { EmailBuilderClean } from "@/components/email-builder";
//    <EmailBuilderClean onSave={handleSave} onSendTest={handleTest} />
//
// 6. Ultra-Minimalist Builder:
//    import { EmailBuilderUltraClean } from "@/components/email-builder";
//    <EmailBuilderUltraClean onSave={handleSave} />
//
// 7. Advanced Builder with AI Features (Legacy):
//    import { EmailBuilderBrevoStyle } from "@/components/email-builder";
//    <EmailBuilderBrevoStyle onSave={handleSave} />
//
// 8. Production-Ready Deliverability-Focused Builder (RECOMMENDED):
//    import { EmailBuilderPro } from "@/components/email-builder";
//    <EmailBuilderPro onSave={handleSave} />
//
// 9. Template Management:
//    import { TemplateSelectorModal, TemplatePreviewModal } from "@/components/email-builder";
//    - Use to browse and select from email templates
//
// 10. Test Email Modal:
//     import { SendTestEmailModal } from "@/components/email-builder";
//     - Use to send test emails with personalization preview
//
// 11. AI Template Generation:
//     import { buildBrandedEmailHtml, EMAIL_TEMPLATES } from "@/components/email-builder";
//     const html = buildBrandedEmailHtml({
//       copy: EMAIL_TEMPLATES.welcome,
//       brandPalette: "indigo"
//     });
//
// 12. Text-First Email (Better Deliverability):
//     import { buildTextFirstEmailHtml } from "@/components/email-builder";
//     const html = buildTextFirstEmailHtml({
//       body: "Your email content here...",
//       organizationName: "Your Company",
//       organizationAddress: "123 Main St"
//     });
