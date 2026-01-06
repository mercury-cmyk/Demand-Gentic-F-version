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
  const [editorMode, setEditorMode] = useState<"design" | "code">("design");
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
    <div className="space-y-6">
      {/* Email Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Email Settings</CardTitle>
          <CardDescription>Configure sender information and subject line</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From Name</Label>
              <Input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Your Company"
                data-testid="input-from-name"
              />
            </div>
            <div className="space-y-2">
              <Label>From Email</Label>
              <Input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="hello@company.com"
                data-testid="input-from-email"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Subject Line</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Your personalized email subject..."
              data-testid="input-subject"
            />
            <p className="text-xs text-muted-foreground">
              Use placeholders like {"{{"} contact.first_name {"}} "} for personalization
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Email Editor */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Email Content</CardTitle>
                  <CardDescription>Design your email with rich content and personalization</CardDescription>
                </div>
                <Tabs value={editorMode} onValueChange={(v) => setEditorMode(v as any)}>
                  <TabsList>
                    <TabsTrigger value="design" data-testid="tab-design-mode">
                      <Layout className="w-4 h-4 mr-2" />
                      Design
                    </TabsTrigger>
                    <TabsTrigger value="code" data-testid="tab-code-mode">
                      <Code className="w-4 h-4 mr-2" />
                      HTML
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {editorMode === "design" ? (
                <div className="space-y-4">
                  {/* Design Mode - Drag & Drop Builder Placeholder */}
                  <div className="border-2 border-dashed rounded-lg p-8 min-h-[400px]">
                    <div className="text-center space-y-4">
                      <Layout className="w-12 h-12 mx-auto text-muted-foreground" />
                      <div>
                        <p className="font-medium mb-2">Drag & Drop Email Builder</p>
                        <p className="text-sm text-muted-foreground mb-4">
                          Add blocks to build your email: text, images, buttons, dividers
                        </p>
                      </div>
                      <div className="flex gap-2 justify-center">
                        <Button variant="outline" size="sm">
                          <Type className="w-4 h-4 mr-2" />
                          Add Text
                        </Button>
                        <Button variant="outline" size="sm">
                          <ImageIcon className="w-4 h-4 mr-2" />
                          Add Image
                        </Button>
                        <Button variant="outline" size="sm">
                          <LinkIcon className="w-4 h-4 mr-2" />
                          Add Button
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Compliance Notice */}
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Mail className="w-4 h-4 text-blue-500 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-blue-500">Mandatory Compliance Blocks</p>
                        <p className="text-blue-500/80">
                          Unsubscribe link and company address will be auto-appended to all emails
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* HTML Code Editor */}
                  <Textarea
                    value={htmlContent}
                    onChange={(e) => setHtmlContent(e.target.value)}
                    placeholder="<html>...</html>"
                    className="font-mono text-sm min-h-[400px] email-content font-sans"
                    data-testid="textarea-html-content"
                  />
                  <Button variant="outline" size="sm" data-testid="button-preview-html">
                    <Eye className="w-4 h-4 mr-2" />
                    Preview HTML
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Personalization Sidebar */}
        <div className="col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Personalization</CardTitle>
              <CardDescription>Insert dynamic placeholders</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {placeholders.map((group) => (
                <div key={group.group} className="space-y-2">
                  <Label>{group.group} Fields</Label>
                  <div className="space-y-1">
                    {group.items.map((placeholder) => (
                      <Button
                        key={placeholder}
                        variant="outline"
                        size="sm"
                        className="w-full justify-start font-mono text-xs"
                        onClick={() => {
                          // Insert placeholder logic
                          setHtmlContent(htmlContent + " " + placeholder);
                        }}
                        data-testid={`button-placeholder-${placeholder}`}
                      >
                        {placeholder}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="pt-4 border-t">
                <Label className="mb-2 block">Preview Contact</Label>
                <Select>
                  <SelectTrigger data-testid="select-preview-contact">
                    <SelectValue placeholder="Choose sample contact..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">John Doe - Acme Corp</SelectItem>
                    <SelectItem value="2">Jane Smith - Tech Inc</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" className="w-full mt-2" size="sm" data-testid="button-preview-email">
                  <Eye className="w-4 h-4 mr-2" />
                  Preview Email
                </Button>
              </div>

              <div className="pt-4 border-t">
                <Button variant="outline" className="w-full" size="sm" data-testid="button-save-template">
                  Save as Template
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Next Button */}
      <div className="flex justify-end">
        <Button onClick={handleNext} size="lg" data-testid="button-next-step">
          Continue to Scheduling
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}