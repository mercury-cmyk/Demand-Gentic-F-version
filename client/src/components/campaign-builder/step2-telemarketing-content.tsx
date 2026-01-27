import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronRight,
  Plus,
  ClipboardList,
  Sparkles,
  PenLine
} from "lucide-react";
import { CampaignAutoGenerate } from "./campaign-auto-generate";
import { CampaignContextEditor } from "@/components/campaigns/CampaignContextEditor";

interface Step2TelemarketingProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export function Step2TelemarketingContent({ data, onNext }: Step2TelemarketingProps) {
  const [qualificationFields, setQualificationFields] = useState(data.content?.qualificationFields || []);
  const [inputMode, setInputMode] = useState<"auto" | "manual">("auto");

  // Campaign Context fields (shared between AI and Human agents)
  const [campaignObjective, setCampaignObjective] = useState(data.campaignObjective || '');
  const [productServiceInfo, setProductServiceInfo] = useState(data.productServiceInfo || '');
  const [talkingPoints, setTalkingPoints] = useState<string[]>(data.talkingPoints || []);
  const [targetAudienceDescription, setTargetAudienceDescription] = useState(data.targetAudienceDescription || '');
  const [successCriteria, setSuccessCriteria] = useState(data.successCriteria || '');
  const [campaignObjections, setCampaignObjections] = useState<any[]>(data.campaignObjections || []);

  // Handle AI-generated campaign application
  const handleAutoGenerateApply = (generated: {
    campaignObjective: string;
    productServiceInfo: string;
    talkingPoints: string[];
    targetAudienceDescription: string;
    successCriteria: string;
    campaignObjections: any[];
    qualificationQuestions: any[];
  }) => {
    setCampaignObjective(generated.campaignObjective);
    setProductServiceInfo(generated.productServiceInfo);
    setTalkingPoints(generated.talkingPoints);
    setTargetAudienceDescription(generated.targetAudienceDescription);
    setSuccessCriteria(generated.successCriteria);
    setCampaignObjections(generated.campaignObjections);
    
    // Convert qualification questions to the existing format
    if (generated.qualificationQuestions?.length > 0) {
      const converted = generated.qualificationQuestions.map((q, idx) => ({
        id: Date.now() + idx,
        label: q.question,
        type: q.type === 'boolean' ? 'radio' : q.type,
        required: q.required,
        options: q.options
      }));
      setQualificationFields(converted);
    }
    
    // Switch to manual mode to show filled fields
    setInputMode("manual");
  };

  const handleNext = () => {
    onNext({
      content: {
        qualificationFields,
      },
      // Campaign Context fields
      campaignObjective,
      productServiceInfo,
      talkingPoints: talkingPoints.length > 0 ? talkingPoints : undefined,
      targetAudienceDescription,
      successCriteria,
      campaignObjections: campaignObjections.length > 0 ? campaignObjections : undefined,
    });
  };

  const handleAddQualificationField = () => {
    setQualificationFields([
      ...qualificationFields,
      { id: Date.now(), label: "", type: "text", required: false },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Mode Selection Tabs */}
      <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "auto" | "manual")}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="auto" className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            AI Auto-Generate
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex items-center gap-2">
            <PenLine className="w-4 h-4" />
            Manual Entry
          </TabsTrigger>
        </TabsList>

        {/* AI Auto-Generate Tab */}
        <TabsContent value="auto" className="space-y-6">
          <CampaignAutoGenerate
            onCampaignGenerated={() => {}}
            onApply={handleAutoGenerateApply}
          />
        </TabsContent>

        {/* Manual Entry Tab */}
        <TabsContent value="manual" className="space-y-6">
          {/* Campaign Context Section */}
          <CampaignContextEditor
            data={{
              campaignObjective,
              productServiceInfo,
              talkingPoints,
              targetAudienceDescription,
              successCriteria,
              campaignObjections,
            }}
            onChange={(newData) => {
              setCampaignObjective(newData.campaignObjective);
              setProductServiceInfo(newData.productServiceInfo);
              setTalkingPoints(newData.talkingPoints);
              setTargetAudienceDescription(newData.targetAudienceDescription);
              setSuccessCriteria(newData.successCriteria);
              setCampaignObjections(newData.campaignObjections || []);
            }}
          />

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
        </TabsContent>
      </Tabs>

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
