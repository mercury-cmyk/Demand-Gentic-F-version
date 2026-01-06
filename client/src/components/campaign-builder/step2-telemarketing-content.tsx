import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronRight, 
  Plus,
  FileText,
  Eye,
  History,
  ClipboardList
} from "lucide-react";

interface Step2TelemarketingProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export function Step2TelemarketingContent({ data, onNext }: Step2TelemarketingProps) {
  const [scriptContent, setScriptContent] = useState(data.content?.script || "");
  const [qualificationFields, setQualificationFields] = useState(data.content?.qualificationFields || []);

  const handleNext = () => {
    onNext({
      content: {
        script: scriptContent,
        qualificationFields,
      },
    });
  };

  const handleAddQualificationField = () => {
    setQualificationFields([
      ...qualificationFields,
      { id: Date.now(), label: "", type: "text", required: false },
    ]);
  };

  const placeholderGroups = [
    {
      name: "Contact",
      items: [
        "{{contact.fullName}}",
        "{{contact.firstName}}",
        "{{contact.lastName}}",
        "{{contact.email}}",
        "{{contact.directPhone}}",
        "{{contact.mobilePhone}}",
        "{{contact.jobTitle}}",
        "{{contact.department}}",
        "{{contact.seniorityLevel}}",
        "{{contact.city}}",
        "{{contact.state}}",
        "{{contact.country}}",
        "{{contact.linkedinUrl}}",
      ]
    },
    {
      name: "Account",
      items: [
        "{{account.name}}",
        "{{account.domain}}",
        "{{account.industry}}",
        "{{account.staffCount}}",
        "{{account.revenue}}",
        "{{account.mainPhone}}",
        "{{account.hqCity}}",
        "{{account.hqState}}",
        "{{account.hqCountry}}",
        "{{account.yearFounded}}",
        "{{account.techStack}}",
        "{{account.linkedinUrl}}",
      ]
    },
    {
      name: "Agent",
      items: [
        "{{agent.fullName}}",
        "{{agent.firstName}}",
        "{{agent.lastName}}",
        "{{agent.email}}",
      ]
    },
    {
      name: "Campaign",
      items: [
        "{{campaign.name}}",
      ]
    }
  ];

  return (
    <div className="space-y-6">
      {/* Call Script Builder */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Call Script</CardTitle>
              <CardDescription>Create your calling script with personalization placeholders</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" data-testid="button-script-history">
                <History className="w-4 h-4 mr-2" />
                Version History
              </Button>
              <Button variant="outline" size="sm" data-testid="button-preview-script">
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Script Content</Label>
            <Textarea
              value={scriptContent}
              onChange={(e) => setScriptContent(e.target.value)}
              placeholder="Hello {{contact.first_name}}, my name is [YOUR NAME] calling from [COMPANY]..."
              className="min-h-[300px]"
              data-testid="textarea-script-content"
            />
          </div>

          {/* Grouped Placeholders */}
          <div className="space-y-3">
            <Label>Available Placeholders</Label>
            <div className="space-y-3">
              {placeholderGroups.map((group) => (
                <div key={group.name} className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {group.name}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((placeholder) => (
                      <Button
                        key={placeholder}
                        variant="outline"
                        size="sm"
                        onClick={() => setScriptContent(scriptContent + " " + placeholder)}
                        className="font-mono text-xs h-7"
                        data-testid={`button-insert-${placeholder}`}
                      >
                        {placeholder}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Agent View</p>
                <p className="text-muted-foreground">
                  Agents will see this script in read-only mode during calls. All changes are version-tracked.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Qualification Form Builder */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Qualification Questions</CardTitle>
              <CardDescription>Build the qualification form for lead capture</CardDescription>
            </div>
            <Button onClick={handleAddQualificationField} size="sm" data-testid="button-add-question">
              <Plus className="w-4 h-4 mr-2" />
              Add Question
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {qualificationFields.length === 0 ? (
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <ClipboardList className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                No qualification questions yet. Add questions to capture lead information during calls.
              </p>
              <Button onClick={handleAddQualificationField} variant="outline" data-testid="button-add-first-question">
                <Plus className="w-4 h-4 mr-2" />
                Add First Question
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {qualificationFields.map((field: any, index: number) => (
                <Card key={field.id} data-testid={`qualification-field-${index}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Question Label</Label>
                        <Input
                          placeholder="e.g., Budget Range"
                          data-testid={`input-question-label-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Field Type</Label>
                        <Select defaultValue="text">
                          <SelectTrigger data-testid={`select-field-type-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="dropdown">Dropdown</SelectItem>
                            <SelectItem value="radio">Radio</SelectItem>
                            <SelectItem value="checkbox">Checkbox</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" data-testid={`checkbox-required-${index}`} />
                        Required field
                      </label>
                      <Badge variant="outline">Question {index + 1}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm">
              <p className="font-medium mb-1">Form Integration</p>
              <p className="text-muted-foreground">
                Qualification responses are linked to QA portal and auto-populate lead records
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
