import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Eye, 
  Code, 
  Layout, 
  ChevronRight, 
  Plus,
  Type,
  Image as ImageIcon,
  Link as LinkIcon,
  Mail
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Step2EmailProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export function Step2EmailContent({ data, onNext }: Step2EmailProps) {
  const [subject, setSubject] = useState(data.content?.subject || "");
  const [fromName, setFromName] = useState(data.content?.fromName || "");
  const [fromEmail, setFromEmail] = useState(data.content?.fromEmail || "");
  const [editorMode, setEditorMode] = useState("design");
  const [htmlContent, setHtmlContent] = useState(data.content?.html || "");

  const handleNext = () => {
    onNext({
      content: {
        subject,
        fromName,
        fromEmail,
        html: htmlContent,
        editorMode,
      },
    });
  };

  const placeholders = [
    { group: "Contact", items: ["{{contact.first_name}}", "{{contact.last_name}}", "{{contact.job_title}}", "{{contact.company}}"] },
    { group: "Account", items: ["{{account.name}}", "{{account.industry}}", "{{account.city}}"] },
  ];

  return (
    
      {/* Email Settings */}
      
        
          Email Settings
          Configure sender information and subject line
        
        
          
            
              From Name
               setFromName(e.target.value)}
                placeholder="Your Company"
                data-testid="input-from-name"
              />
            
            
              From Email
               setFromEmail(e.target.value)}
                placeholder="hello@company.com"
                data-testid="input-from-email"
              />
            
          
          
            Subject Line
             setSubject(e.target.value)}
              placeholder="Your personalized email subject..."
              data-testid="input-subject"
            />
            
              Use placeholders like {"{{"} contact.first_name {"}} "} for personalization
            
          
        
      

      {/* Email Editor */}
      
        
          
            
              
                
                  Email Content
                  Design your email with rich content and personalization
                
                 setEditorMode(v as any)}>
                  
                    
                      
                      Design
                    
                    
                      
                      HTML
                    
                  
                
              
            
            
              {editorMode === "design" ? (
                
                  {/* Design Mode - Drag & Drop Builder Placeholder */}
                  
                    
                      
                      
                        Drag & Drop Email Builder
                        
                          Add blocks to build your email: text, images, buttons, dividers
                        
                      
                      
                        
                          
                          Add Text
                        
                        
                          
                          Add Image
                        
                        
                          
                          Add Button
                        
                      
                    
                  

                  {/* Compliance Notice */}
                  
                    
                      
                      
                        Mandatory Compliance Blocks
                        
                          Unsubscribe link and company address will be auto-appended to all emails
                        
                      
                    
                  
                
              ) : (
                
                  {/* HTML Code Editor */}
                   setHtmlContent(e.target.value)}
                    placeholder="..."
                    className="font-mono text-sm min-h-[400px] email-content font-sans"
                    data-testid="textarea-html-content"
                  />
                  
                    
                    Preview HTML
                  
                
              )}
            
          
        

        {/* Personalization Sidebar */}
        
          
            
              Personalization
              Insert dynamic placeholders
            
            
              {placeholders.map((group) => (
                
                  {group.group} Fields
                  
                    {group.items.map((placeholder) => (
                       {
                          // Insert placeholder logic
                          setHtmlContent(htmlContent + " " + placeholder);
                        }}
                        data-testid={`button-placeholder-${placeholder}`}
                      >
                        {placeholder}
                      
                    ))}
                  
                
              ))}

              
                Preview Contact
                
                  
                    
                  
                  
                    John Doe - Acme Corp
                    Jane Smith - Tech Inc
                  
                
                
                  
                  Preview Email
                
              

              
                
                  Save as Template
                
              
            
          
        
      

      {/* Next Button */}
      
        
          Continue to Scheduling
          
        
      
    
  );
}