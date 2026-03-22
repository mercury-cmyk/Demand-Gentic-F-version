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
  placeholders?: Array;
}

export function EmailCanvas({
  initialHtml = "",
  initialDesign,
  onChange,
  onModeChange,
  placeholders = []
}: EmailCanvasProps) {
  const editorRef = useRef(null);
  const containerRef = useRef(null);
  const [viewMode, setViewMode] = useState("desktop");
  const isInternalUpdate = useRef(false);
  const lastAppliedHtml = useRef(null);
  const lastAppliedDesign = useRef(null);
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
            content: `
              
                
                  Your text here. Add personalization like {{contact.first_name}}.
                
              
            `,
          },
          {
            id: "image",
            label: "Image",
            category: "Basic",
            content: `
              
                
                  
                
              
            `,
          },
          {
            id: "logo",
            label: "Logo",
            category: "Basic",
            content: `
              
                
                  
                
              
            `,
          },
          {
            id: "button",
            label: "Button",
            category: "Basic",
            content: `
              
                
                  
                  
                    
                    Click Here
                  
                  
                  
                  Click Here
                  
                
              
            `,
          },
          {
            id: "divider",
            label: "Divider",
            category: "Basic",
            content: `
              
                
                  &nbsp;
                
              
            `,
          },
          {
            id: "spacer",
            label: "Spacer",
            category: "Basic",
            content: `
              
                &nbsp;
              
            `,
          },
          {
            id: "2-columns",
            label: "2 Columns",
            category: "Layout",
            content: `
              
                
                  
                    
                      
                        Column 1 content
                      
                    
                  
                
                
                  
                    
                      
                        Column 2 content
                      
                    
                  
                
              
            `,
          },
          {
            id: "social",
            label: "Social Icons",
            category: "Components",
            content: `
              
                
                  
                    
                  
                  
                    
                  
                  
                    
                  
                
              
            `,
          },
          {
            id: "footer",
            label: "Footer",
            category: "Components",
            content: `
              
                
                  Your Company Name
                  123 Business St, City, State 12345
                  
                    Unsubscribe |
                    Update Preferences
                  
                  
                    You received this email because you signed up for our service.
                  
                
              
            `,
          },
          {
            id: "interactive-cta",
            label: "Interactive CTA",
            category: "Components",
            content: `
              
                
                  Let us know with one click
                  
                    
                      
                        
                          
                            
                              
                              
                                
                                Reply “Yes”
                              
                              
                              
                              Reply “Yes”
                              
                            
                          
                        
                      
                      
                        
                          
                            
                              
                              
                                
                                Share feedback
                              
                              
                              
                              Share feedback
                              
                            
                          
                        
                      
                    
                  
                  These buttons open your email or a feedback page. Replace {{fromEmail}} and {{feedback_url}} with your values.
                
              
            `,
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
      const fullHtml = `${emailBaseCss}${css}${sanitizedHtml}`;
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
    
      {/* Toolbar */}
      
        
          
            
          
          
            
          
        

        
           changeDevice("desktop")}
            title="Desktop View"
          >
            
          
           changeDevice("tablet")}
            title="Tablet View"
          >
            
          
           changeDevice("mobile")}
            title="Mobile View"
          >
            
          
        

        
          
            
            Preview
          
          
            
            View Code
          
        
      

      {/* Main Editor */}
      
        {/* Blocks Panel */}
        

        {/* Canvas */}
        

        {/* Layers and Styles Panel */}
        
          
            Layers
            
          
        
      
    
  );
}