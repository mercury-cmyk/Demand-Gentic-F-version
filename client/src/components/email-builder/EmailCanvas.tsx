import { useEffect, useRef, useState } from "react";
import grapesjs, { Editor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import newsletterPlugin from "grapesjs-preset-newsletter";
import { Button } from "@/components/ui/button";
import {
  Undo,
  Redo,
  Eye,
  Code,
  Smartphone,
  Monitor,
  Tablet
} from "lucide-react";

interface EmailCanvasProps {
  initialHtml?: string;
  initialDesign?: any;
  onChange?: (html: string, design: any) => void;
  onModeChange?: (mode: "design" | "code") => void;
  placeholders?: Array<{ group: string; items: string[] }>;
}

export function EmailCanvas({
  initialHtml = "",
  initialDesign,
  onChange,
  onModeChange,
  placeholders = []
}: EmailCanvasProps) {
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const isInternalUpdate = useRef(false);
  const lastAppliedHtml = useRef<string | null>(null);
  const lastAppliedDesign = useRef<any>(null);
  const allowedProtocols = ["http:", "https:", "mailto:", "tel:"];
  const emailBaseCss = `
    /* Reset + Outlook smoothing */
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; }
    /* Fluid responsiveness */
    .full-width, .fluid { width: 100% !important; max-width: 100% !important; }
    .stack-column, .stack-column-cell { display: block !important; width: 100% !important; }
    @media only screen and (max-width: 600px) {
      .stack-column, .stack-column-cell { display: block !important; width: 100% !important; }
      .center-on-mobile { text-align: center !important; }
      .full-width { width: 100% !important; }
    }
  `;

  // Normalize CTA/anchor URLs to avoid unsafe protocols and prefer https where possible.
  const sanitizeLinks = (html: string) => {
    if (typeof window === "undefined" || typeof DOMParser === "undefined") return html;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    doc.querySelectorAll("a").forEach(anchor => {
      const rawHref = anchor.getAttribute("href") || "";
      const trimmedHref = rawHref.trim();
      const isPlaceholder = trimmedHref.startsWith("{{") && trimmedHref.endsWith("}}");

      if (!trimmedHref) {
        anchor.removeAttribute("href");
        return;
      }

      const lowerHref = trimmedHref.toLowerCase();
      if (lowerHref.startsWith("javascript:") || lowerHref.startsWith("data:") || lowerHref.startsWith("vbscript:") || lowerHref.startsWith("file:")) {
        anchor.setAttribute("href", "#");
      } else if (!isPlaceholder) {
        try {
          const normalized = new URL(trimmedHref, "https://example.com");
          if (!allowedProtocols.includes(normalized.protocol)) {
            anchor.setAttribute("href", "#");
          } else {
            if (normalized.protocol === "http:") {
              normalized.protocol = "https:";
            }
            anchor.setAttribute("href", normalized.toString());
          }
        } catch {
          anchor.setAttribute("href", "#");
        }
      }

      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    });

    return doc.body.innerHTML;
  };

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    // Initialize GrapesJS editor
    const editor = grapesjs.init({
      container: containerRef.current,
      fromElement: false,
      height: "600px",
      width: "auto",
      storageManager: false,
      plugins: [newsletterPlugin],
      pluginsOpts: {
        [newsletterPlugin as unknown as string]: {
          modalTitleImport: "Import template",
          // Add custom blocks and options
        }
      },
      canvas: {
        styles: [
          'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
        ],
      },
      deviceManager: {
        devices: [
          {
            id: "desktop",
            name: "Desktop",
            width: "100%",
          },
          {
            id: "tablet",
            name: "Tablet",
            width: "768px",
            widthMedia: "768px",
          },
          {
            id: "mobile",
            name: "Mobile",
            width: "375px",
            widthMedia: "480px",
          },
        ],
      },
      blockManager: {
        appendTo: "#blocks-container",
        blocks: [
          {
            id: "text",
            label: "Text",
            category: "Basic",
            content: `<table role="presentation" width="100%" style="max-width: 640px; margin: 0 auto;" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding: 20px; font-family: Inter, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #374151;">
                  <p style="margin: 0;">Your text here. Add personalization like {{contact.first_name}}.</p>
                </td>
              </tr>
            </table>`,
          },
          {
            id: "image",
            label: "Image",
            category: "Basic",
            content: `<table role="presentation" width="100%" style="max-width: 640px; margin: 0 auto;" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding: 20px; text-align: center; background-color: #f8fafc;">
                  <img src="https://via.placeholder.com/600x300" alt="Placeholder image" width="600" height="300" style="display: block; width: 100%; max-width: 600px; height: auto; margin: 0 auto; color: #374151; font-family: Inter, Arial, sans-serif; font-size: 14px;" />
                </td>
              </tr>
            </table>`,
          },
          {
            id: "logo",
            label: "Logo",
            category: "Basic",
            content: `<table role="presentation" width="100%" style="max-width: 640px; margin: 0 auto;" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding: 24px; text-align: center; background-color: #ffffff;">
                  <img src="/demangent-logo.png" alt="DemanGent.ai" width="200" style="display: inline-block; width: 200px; max-width: 100%; height: auto; margin: 0 auto;" />
                </td>
              </tr>
            </table>`,
          },
          {
            id: "button",
            label: "Button",
            category: "Basic",
            content: `<table role="presentation" width="100%" style="max-width: 640px; margin: 0 auto;" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td align="center" style="padding: 20px;">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://example.com" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="12%" stroke="f" fillcolor="#3b82f6">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Inter, Arial, sans-serif;font-size:14px;font-weight:600;">Click Here</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-- -->
                  <a href="https://example.com" style="background-color: #3b82f6; border-radius: 6px; color: #ffffff; display: inline-block; font-family: Inter, Arial, sans-serif; font-size: 14px; font-weight: 600; line-height: 44px; min-width: 200px; padding: 0 32px; text-align: center;">Click Here</a>
                  <!--<![endif]-->
                </td>
              </tr>
            </table>`,
          },
          {
            id: "divider",
            label: "Divider",
            category: "Basic",
            content: `<table role="presentation" width="100%" style="max-width: 640px; margin: 0 auto;" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding: 20px;">
                  <p style="border-top: 1px solid #e5e7eb; font-size: 0; line-height: 0; margin: 0;">&nbsp;</p>
                </td>
              </tr>
            </table>`,
          },
          {
            id: "spacer",
            label: "Spacer",
            category: "Basic",
            content: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="height: 40px; line-height: 40px; font-size: 0;">&nbsp;</td>
              </tr>
            </table>`,
          },
          {
            id: "2-columns",
            label: "2 Columns",
            category: "Layout",
            content: `<table role="presentation" width="100%" style="max-width: 640px; margin: 0 auto;" cellspacing="0" cellpadding="0" border="0" class="fluid">
              <tr>
                <td class="stack-column-cell" style="width: 50%; padding: 10px; vertical-align: top;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td style="padding: 20px; background-color: #f3f4f6; border-radius: 8px; font-family: Inter, Arial, sans-serif; color: #111827;">
                        <p style="margin: 0;">Column 1 content</p>
                      </td>
                    </tr>
                  </table>
                </td>
                <td class="stack-column-cell" style="width: 50%; padding: 10px; vertical-align: top;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td style="padding: 20px; background-color: #f3f4f6; border-radius: 8px; font-family: Inter, Arial, sans-serif; color: #111827;">
                        <p style="margin: 0;">Column 2 content</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>`,
          },
          {
            id: "social",
            label: "Social Icons",
            category: "Components",
            content: `<table role="presentation" width="100%" style="max-width: 640px; margin: 0 auto;" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding: 20px; text-align: center; font-family: Inter, Arial, sans-serif; background-color: #ffffff;">
                  <a href="https://www.linkedin.com" style="display: inline-block; margin: 0 8px;">
                    <img src="https://img.icons8.com/color/48/000000/linkedin.png" alt="LinkedIn" width="32" height="32" style="display: block; width: 32px; height: 32px; color: #0f172a; font-size: 12px;" />
                  </a>
                  <a href="https://twitter.com" style="display: inline-block; margin: 0 8px;">
                    <img src="https://img.icons8.com/color/48/000000/twitter.png" alt="Twitter" width="32" height="32" style="display: block; width: 32px; height: 32px; color: #0f172a; font-size: 12px;" />
                  </a>
                  <a href="https://www.facebook.com" style="display: inline-block; margin: 0 8px;">
                    <img src="https://img.icons8.com/color/48/000000/facebook.png" alt="Facebook" width="32" height="32" style="display: block; width: 32px; height: 32px; color: #0f172a; font-size: 12px;" />
                  </a>
                </td>
              </tr>
            </table>`,
          },
          {
            id: "footer",
            label: "Footer",
            category: "Components",
            content: `<table role="presentation" width="100%" style="max-width: 640px; margin: 0 auto; background-color: #f9fafb;" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding: 30px 20px; text-align: center; font-family: Inter, Arial, sans-serif; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0 0 8px 0;">Your Company Name</p>
                  <p style="margin: 0 0 8px 0;">123 Business St, City, State 12345</p>
                  <p style="margin: 0 0 16px 0;">
                    <a href="{{unsubscribe_url}}" style="color: #3b82f6; text-decoration: none; margin: 0 8px;">Unsubscribe</a> |
                    <a href="https://example.com/preferences" style="color: #3b82f6; text-decoration: none; margin: 0 8px;">Update Preferences</a>
                  </p>
                  <p style="margin: 0; font-size: 11px;">
                    You received this email because you signed up for our service.
                  </p>
                </td>
              </tr>
            </table>`,
          },
          {
            id: "interactive-cta",
            label: "Interactive CTA",
            category: "Components",
            content: `<table role="presentation" width="100%" style="max-width: 640px; margin: 0 auto;" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding: 24px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; font-family: Inter, Arial, sans-serif; color: #0f172a;">
                  <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 700;">Let us know with one click</p>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td class="stack-column-cell" style="padding: 4px 0;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="left">
                          <tr>
                            <td align="center">
                              <!--[if mso]>
                              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="mailto:{{fromEmail}}?subject=Yes%20let%27s%20talk&body=Hi%20{{contact.first_name}},%0A%0AI%27d%20love%20to%20connect.%20Reply%20yes%20to%20book%20a%20call." style="height:44px;v-text-anchor:middle;width:180px;" arcsize="20%" stroke="f" fillcolor="#4f46e5">
                                <w:anchorlock/>
                                <center style="color:#ffffff;font-family:Inter, Arial, sans-serif;font-size:14px;font-weight:700;">Reply “Yes”</center>
                              </v:roundrect>
                              <![endif]-->
                              <!--[if !mso]><!-- -->
                              <a href="mailto:{{fromEmail}}?subject=Yes%20let%27s%20talk&body=Hi%20{{contact.first_name}},%0A%0AI%27d%20love%20to%20connect.%20Reply%20yes%20to%20book%20a%20call." style="background: #4f46e5; border-radius: 10px; color: #ffffff; display: inline-block; font-family: Inter, Arial, sans-serif; font-size: 14px; font-weight: 700; line-height: 44px; min-width: 180px; padding: 0 18px; text-align: center;">Reply “Yes”</a>
                              <!--<![endif]-->
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td class="stack-column-cell" style="padding: 4px 0;" align="right">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="right">
                          <tr>
                            <td align="center">
                              <!--[if mso]>
                              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{feedback_url}}" style="height:44px;v-text-anchor:middle;width:180px;" arcsize="20%" stroke="f" fillcolor="#e2e8f0">
                                <w:anchorlock/>
                                <center style="color:#0f172a;font-family:Inter, Arial, sans-serif;font-size:14px;font-weight:600;">Share feedback</center>
                              </v:roundrect>
                              <![endif]-->
                              <!--[if !mso]><!-- -->
                              <a href="{{feedback_url}}" style="background: #e2e8f0; border-radius: 10px; color: #0f172a; display: inline-block; font-family: Inter, Arial, sans-serif; font-size: 14px; font-weight: 600; line-height: 44px; min-width: 180px; padding: 0 18px; text-align: center;">Share feedback</a>
                              <!--<![endif]-->
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                  <p style="margin: 12px 0 0 0; font-size: 13px; color: #475569;">These buttons open your email or a feedback page. Replace {{fromEmail}} and {{feedback_url}} with your values.</p>
                </td>
              </tr>
            </table>`,
          },
        ],
      },
      styleManager: {
        sectors: [
          {
            name: "General",
            properties: [
              "font-family",
              "font-size",
              "font-weight",
              "color",
              "text-align",
            ],
          },
          {
            name: "Dimension",
            properties: [
              "width",
              "height",
              "max-width",
              "padding",
              "margin",
            ],
          },
          {
            name: "Background",
            properties: [
              "background-color",
              "background-image",
            ],
          },
          {
            name: "Border",
            properties: [
              "border",
              "border-radius",
            ],
          },
        ],
      },
      layerManager: {
        appendTo: "#layers-container",
      },
    });

    // Load initial content
    if (initialDesign) {
      editor.loadProjectData(initialDesign);
    } else if (initialHtml) {
      editor.setComponents(initialHtml);
    }

    // Listen for changes
    editor.on("update", () => {
      isInternalUpdate.current = true;
      const html = editor.getHtml();
      const css = editor.getCss();
      const sanitizedHtml = sanitizeLinks(html);
      const fullHtml = `<style>${emailBaseCss}${css}</style>${sanitizedHtml}`;
      const design = editor.getProjectData();
      lastAppliedHtml.current = fullHtml;
      lastAppliedDesign.current = design;
      onChange?.(fullHtml, design);
    });

    // Add custom commands for personalization tokens
    placeholders.forEach(group => {
      group.items.forEach(token => {
        editor.Commands.add(`insert-${token}`, {
          run(editor) {
            const selected = editor.getSelected();
            if (selected && selected.is("text")) {
              const content = selected.components().models[0];
              if (content) {
                content.set("content", content.get("content") + " " + token);
              }
            }
          }
        });
      });
    });

    editorRef.current = editor;

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  // Apply externally provided HTML/design when they change (e.g., AI generation)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Skip if this effect was triggered by our own internal change
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    // Apply design JSON if provided and different
    if (initialDesign && JSON.stringify(initialDesign) !== JSON.stringify(lastAppliedDesign.current)) {
      editor.loadProjectData(initialDesign);
      lastAppliedDesign.current = initialDesign;
      return;
    }

    // Apply raw HTML if provided and different
    if (initialHtml && initialHtml !== lastAppliedHtml.current) {
      editor.setComponents(initialHtml);
      lastAppliedHtml.current = initialHtml;
    }
  }, [initialHtml, initialDesign]);

  const handleUndo = () => {
    editorRef.current?.runCommand("core:undo");
  };

  const handleRedo = () => {
    editorRef.current?.runCommand("core:redo");
  };

  const handlePreview = () => {
    editorRef.current?.runCommand("preview");
  };

  const handleViewCode = () => {
    const html = editorRef.current?.getHtml();
    const css = editorRef.current?.getCss();
    console.log("HTML:", html);
    console.log("CSS:", css);
    onModeChange?.("code");
  };

  const changeDevice = (device: "desktop" | "tablet" | "mobile") => {
    setViewMode(device);
    editorRef.current?.setDevice(device);
  };

  return (
    <div className="email-canvas-wrapper">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUndo}
            title="Undo"
          >
            <Undo className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRedo}
            title="Redo"
          >
            <Redo className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1 border rounded-md p-1">
          <Button
            variant={viewMode === "desktop" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => changeDevice("desktop")}
            title="Desktop View"
          >
            <Monitor className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "tablet" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => changeDevice("tablet")}
            title="Tablet View"
          >
            <Tablet className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "mobile" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => changeDevice("mobile")}
            title="Mobile View"
          >
            <Smartphone className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePreview}
            title="Preview"
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleViewCode}
            title="View HTML Code"
          >
            <Code className="w-4 h-4 mr-2" />
            View Code
          </Button>
        </div>
      </div>

      {/* Main Editor */}
      <div className="flex" style={{ height: "600px" }}>
        {/* Blocks Panel */}
        <div id="blocks-container" className="w-48 border-r bg-muted/20 overflow-y-auto p-2"></div>

        {/* Canvas */}
        <div ref={containerRef} className="flex-1"></div>

        {/* Layers and Styles Panel */}
        <div className="w-64 border-l bg-muted/20 overflow-y-auto">
          <div className="p-2">
            <h3 className="font-semibold text-sm mb-2">Layers</h3>
            <div id="layers-container"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
