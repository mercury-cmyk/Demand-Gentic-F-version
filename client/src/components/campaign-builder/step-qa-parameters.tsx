import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Info, Trash2, Plus, Sparkles, ChevronRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface QAParametersStepProps {
  data: any;
  onChange: (data: any) => void;
  onNext: (data: any) => void;
}

interface ScoringWeights {
  content_interest: number;
  permission_given: number;
  email_confirmation: number;
  compliance_consent: number;
  qualification_answers: number;
  data_accuracy: number;
  email_deliverable: number;
  phone_valid: number;
}

interface QualificationQuestion {
  question: string;
  required: boolean;
  acceptable_responses: string[];
}

interface CustomQAField {
  name: string;
  label: string;
  type: 'text' | 'select' | 'boolean' | 'number';
  required: boolean;
  options?: string[]; // For select type
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  content_interest: 20,
  permission_given: 25,
  email_confirmation: 15,
  compliance_consent: 10,
  qualification_answers: 10,
  data_accuracy: 10,
  email_deliverable: 5,
  phone_valid: 5,
};

const WEIGHT_LABELS = {
  content_interest: "Content Interest",
  permission_given: "Permission Given",
  email_confirmation: "Email Confirmation",
  compliance_consent: "Compliance Consent",
  qualification_answers: "Qualification Answers",
  data_accuracy: "Data Accuracy",
  email_deliverable: "Email Deliverable",
  phone_valid: "Phone Valid",
};

const WEIGHT_DESCRIPTIONS = {
  content_interest: "Did prospect show genuine interest in the offer?",
  permission_given: "Did they explicitly agree to receive the content?",
  email_confirmation: "Did the agent confirm/verify their email address?",
  compliance_consent: "Did they agree to marketing/privacy statements?",
  qualification_answers: "Did they answer qualification questions satisfactorily?",
  data_accuracy: "Does contact/company data match client criteria?",
  email_deliverable: "Is the email verified as deliverable?",
  phone_valid: "Is the phone number valid and formatted correctly?",
};

export function StepQAParameters({ data, onChange, onNext }: QAParametersStepProps) {
  const [minScore, setMinScore] = useState(data.qaParameters?.min_score || 70);
  const [weights, setWeights] = useState<ScoringWeights>(
    data.qaParameters?.scoring_weights || DEFAULT_WEIGHTS
  );
  const [clientCriteria, setClientCriteria] = useState({
    job_titles: data.qaParameters?.client_criteria?.job_titles || [],
    seniority_levels: data.qaParameters?.client_criteria?.seniority_levels || [],
    industries: data.qaParameters?.client_criteria?.industries || [],
  });
  const [qualificationQuestions, setQualificationQuestions] = useState<QualificationQuestion[]>(
    data.qaParameters?.qualification_questions || []
  );
  const [customQaFields, setCustomQaFields] = useState<CustomQAField[]>(
    data.customQaFields || []
  );
  const [customQaRules, setCustomQaRules] = useState(
    data.customQaRules || ""
  );

  // Input states for adding new criteria
  const [newJobTitle, setNewJobTitle] = useState("");
  const [selectedSeniority, setSelectedSeniority] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("");

  // Predefined seniority levels
  const SENIORITY_OPTIONS = [
    "C-Level",
    "VP / SVP",
    "Director",
    "Senior Manager",
    "Manager",
    "Team Lead",
    "Senior Individual Contributor",
    "Individual Contributor",
    "Entry Level",
  ];

  // Hydrate state when data changes (e.g., when editing existing campaign)
  useEffect(() => {
    if (data.qaParameters) {
      setMinScore(data.qaParameters.min_score || 70);
      setWeights(data.qaParameters.scoring_weights || DEFAULT_WEIGHTS);
      setClientCriteria(data.qaParameters.client_criteria || {
        job_titles: [],
        seniority_levels: [],
        industries: [],
      });
      setQualificationQuestions(data.qaParameters.qualification_questions || []);
    }
    if (data.customQaFields !== undefined) {
      setCustomQaFields(data.customQaFields || []);
    }
    if (data.customQaRules !== undefined) {
      setCustomQaRules(data.customQaRules || "");
    }
  }, [data.qaParameters, data.customQaFields, data.customQaRules]);

  useEffect(() => {
    // Update parent component whenever any parameter changes
    onChange({
      ...data,
      qaParameters: {
        required_info: ["permission", "email_confirmation"],
        scoring_weights: weights,
        min_score: minScore,
        client_criteria: clientCriteria,
        qualification_questions: qualificationQuestions,
      },
      customQaFields,
      customQaRules,
    });
  }, [weights, minScore, clientCriteria, qualificationQuestions, customQaFields, customQaRules]);

  const updateWeight = (key: keyof ScoringWeights, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
  };

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

  const addCriteria = (type: string, value: string) => {
    if (!value.trim()) return;
    
    setClientCriteria((prev) => ({
      ...prev,
      [type]: [...prev[type as keyof typeof prev], value.trim()],
    }));

    // Clear input
    switch (type) {
      case "job_titles": setNewJobTitle(""); break;
      case "seniority_levels": setSelectedSeniority(""); break;
    }
  };

  const addSeniorityLevel = (level: string) => {
    if (!level || clientCriteria.seniority_levels.includes(level)) return;
    setClientCriteria((prev) => ({
      ...prev,
      seniority_levels: [...prev.seniority_levels, level],
    }));
    setSelectedSeniority("");
  };

  const addIndustry = (industry: string) => {
    if (!industry || (clientCriteria.industries || []).includes(industry)) return;
    setClientCriteria((prev) => ({
      ...prev,
      industries: [...(prev.industries || []), industry],
    }));
    setSelectedIndustry("");
  };

  const removeCriteria = (type: string, index: number) => {
    setClientCriteria((prev) => ({
      ...prev,
      [type]: prev[type as keyof typeof prev].filter((_: any, i: number) => i !== index),
    }));
  };

  const addQualificationQuestion = () => {
    setQualificationQuestions((prev) => [
      ...prev,
      { question: "", required: false, acceptable_responses: [] },
    ]);
  };

  const updateQualificationQuestion = (index: number, field: string, value: any) => {
    setQualificationQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
  };

  const removeQualificationQuestion = (index: number) => {
    setQualificationQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  // Custom QA Fields Management
  const addCustomQaField = () => {
    setCustomQaFields((prev) => [
      ...prev,
      { name: "", label: "", type: "text", required: false, options: [] },
    ]);
  };

  const updateCustomQaField = (index: number, field: keyof CustomQAField, value: any) => {
    setCustomQaFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, [field]: value } : f))
    );
  };

  const removeCustomQaField = (index: number) => {
    setCustomQaFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    onNext({
      ...data,
      qaParameters: {
        required_info: ["permission", "email_confirmation"],
        scoring_weights: weights,
        min_score: minScore,
        client_criteria: clientCriteria,
        qualification_questions: qualificationQuestions,
      },
      customQaFields,
      customQaRules,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">AI Quality Parameters</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure how AI analyzes lead quality and determines qualification status
        </p>
      </div>

      {/* Minimum Score Threshold */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Minimum Qualification Score</CardTitle>
          <CardDescription>
            Leads must score at least this percentage to be marked as "Qualified"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Slider
                value={[minScore]}
                onValueChange={(values) => setMinScore(values[0])}
                min={0}
                max={100}
                step={5}
                className="w-full"
                data-testid="slider-min-score"
              />
            </div>
            <div className="w-20">
              <Input
                type="number"
                value={minScore}
                onChange={(e) => setMinScore(parseInt(e.target.value) || 0)}
                min={0}
                max={100}
                className="text-center"
                data-testid="input-min-score"
              />
            </div>
            <span className="text-sm font-medium w-8">%</span>
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="bg-green-50 dark:bg-green-950">
              ≥{minScore}% = Qualified
            </Badge>
            <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-950">
              40-{minScore - 1}% = Needs Review
            </Badge>
            <Badge variant="outline" className="bg-red-50 dark:bg-red-950">
              &lt;40% = Not Qualified
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Scoring Weights */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Scoring Weights</CardTitle>
              <CardDescription>
                Adjust the importance of each qualification criterion
              </CardDescription>
            </div>
            <Badge variant={totalWeight === 100 ? "default" : "destructive"}>
              Total: {totalWeight}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(Object.keys(weights) as Array<keyof ScoringWeights>).map((key) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">
                    {WEIGHT_LABELS[key]}
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{WEIGHT_DESCRIPTIONS[key]}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={weights[key]}
                    onChange={(e) => updateWeight(key, parseInt(e.target.value) || 0)}
                    min={0}
                    max={100}
                    className="w-16 text-center text-sm h-8"
                    data-testid={`input-weight-${key}`}
                  />
                  <span className="text-sm w-4">%</span>
                </div>
              </div>
              <Slider
                value={[weights[key]]}
                onValueChange={(values) => updateWeight(key, values[0])}
                min={0}
                max={100}
                step={1}
                className="w-full"
                data-testid={`slider-weight-${key}`}
              />
            </div>
          ))}
          {totalWeight !== 100 && (
            <div className="text-sm text-destructive flex items-center gap-2 pt-2">
              <Info className="h-4 w-4" />
              <span>Warning: Weights should total 100%</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client Criteria */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client Target Criteria</CardTitle>
          <CardDescription>
            Define specific requirements for qualified leads (industry, size, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Job Titles */}
          <div className="space-y-2">
            <Label>Target Job Titles</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., CTO, VP of Engineering, IT Director"
                value={newJobTitle}
                onChange={(e) => setNewJobTitle(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addCriteria("job_titles", newJobTitle)}
                data-testid="input-new-job-title"
              />
              <Button
                type="button"
                size="icon"
                onClick={() => addCriteria("job_titles", newJobTitle)}
                data-testid="button-add-job-title"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {clientCriteria.job_titles.map((item: string, idx: number) => (
                <Badge key={idx} variant="secondary" className="gap-1">
                  {item}
                  <button
                    onClick={() => removeCriteria("job_titles", idx)}
                    className="ml-1 hover:text-destructive"
                    data-testid={`button-remove-job-title-${idx}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Seniority Levels */}
          <div className="space-y-2">
            <Label>Target Seniority Levels</Label>
            <div className="flex gap-2">
              <Select value={selectedSeniority} onValueChange={addSeniorityLevel}>
                <SelectTrigger className="flex-1" data-testid="select-seniority-level">
                  <SelectValue placeholder="Select seniority level" />
                </SelectTrigger>
                <SelectContent>
                  {SENIORITY_OPTIONS.filter(
                    (option) => !clientCriteria.seniority_levels.includes(option)
                  ).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {clientCriteria.seniority_levels.map((item: string, idx: number) => (
                <Badge key={idx} variant="secondary" className="gap-1">
                  {item}
                  <button
                    onClick={() => removeCriteria("seniority_levels", idx)}
                    className="ml-1 hover:text-destructive"
                    data-testid={`button-remove-seniority-${idx}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            {clientCriteria.seniority_levels.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No seniority levels selected. Leads at any level will be accepted.
              </p>
            )}
          </div>

          <Separator />

          {/* Target Industries */}
          <div className="space-y-2">
            <Label>Target Industries</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter industry (e.g., Technology, Healthcare)"
                value={selectedIndustry}
                onChange={(e) => setSelectedIndustry(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addIndustry(selectedIndustry);
                  }
                }}
                className="flex-1"
                data-testid="input-industry"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => addIndustry(selectedIndustry)}
                disabled={!selectedIndustry.trim()}
                data-testid="button-add-industry"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(clientCriteria.industries || []).map((item: string, idx: number) => (
                <Badge key={idx} variant="secondary" className="gap-1">
                  {item}
                  <button
                    onClick={() => removeCriteria("industries", idx)}
                    className="ml-1 hover:text-destructive"
                    data-testid={`button-remove-industry-${idx}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            {(clientCriteria.industries || []).length === 0 && (
              <p className="text-xs text-muted-foreground">
                No industries selected. Leads from any industry will be accepted.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Natural Language AI Rules */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Natural Language Qualification Rules</CardTitle>
              <CardDescription>
                Define qualification criteria in plain English. AI will interpret and apply these rules automatically.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={`Example:\n\nContent Interest is Yes (Mandatory).\nPermission to Send Content is Yes (Mandatory).\nDeduct 5 points if Email Confirmation is missing.\nLead has no objection to future contact.\nCompany must be active in the UK Companies House Database (Required).\nContact must be Manager or above.`}
            value={customQaRules}
            onChange={(e) => setCustomQaRules(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
            data-testid="textarea-custom-qa-rules"
          />
          <p className="text-xs text-muted-foreground mt-2">
            The AI will parse these rules and apply them during call transcript analysis and lead scoring.
          </p>
        </CardContent>
      </Card>

      {/* Custom QA Fields */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Custom QA Fields</CardTitle>
              <CardDescription>
                Define custom fields to extract from call transcripts and CRM data
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={addCustomQaField}
              data-testid="button-add-custom-qa-field"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {customQaFields.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom QA fields defined. Click "Add Field" to create one.
            </p>
          ) : (
            customQaFields.map((field, idx) => (
              <Card key={idx}>
                <CardContent className="pt-6 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Field Name (snake_case)</Label>
                      <Input
                        placeholder="e.g., content_interest"
                        value={field.name}
                        onChange={(e) => updateCustomQaField(idx, "name", e.target.value)}
                        data-testid={`input-qa-field-name-${idx}`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Display Label</Label>
                      <Input
                        placeholder="e.g., Content Interest"
                        value={field.label}
                        onChange={(e) => updateCustomQaField(idx, "label", e.target.value)}
                        data-testid={`input-qa-field-label-${idx}`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Field Type</Label>
                      <Select
                        value={field.type}
                        onValueChange={(value) => updateCustomQaField(idx, "type", value)}
                      >
                        <SelectTrigger data-testid={`select-qa-field-type-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="select">Select</SelectItem>
                          <SelectItem value="boolean">Boolean</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={field.required}
                          onCheckedChange={(checked) => updateCustomQaField(idx, "required", checked)}
                          data-testid={`switch-qa-field-required-${idx}`}
                        />
                        <Label className="text-xs">Required</Label>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeCustomQaField(idx)}
                        data-testid={`button-remove-qa-field-${idx}`}
                        className="ml-auto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {field.type === "select" && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Options (comma-separated)
                      </Label>
                      <Input
                        placeholder="e.g., Yes, No, Maybe"
                        value={field.options?.join(", ") || ""}
                        onChange={(e) =>
                          updateCustomQaField(
                            idx,
                            "options",
                            e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                          )
                        }
                        data-testid={`input-qa-field-options-${idx}`}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      {/* Qualification Questions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Custom Qualification Questions</CardTitle>
              <CardDescription>
                Define specific questions agents should ask and acceptable responses
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={addQualificationQuestion}
              data-testid="button-add-qual-question"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Question
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {qualificationQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom questions defined. Click "Add Question" to create one.
            </p>
          ) : (
            qualificationQuestions.map((q, idx) => (
              <Card key={idx}>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <Input
                        placeholder="Enter question..."
                        value={q.question}
                        onChange={(e) =>
                          updateQualificationQuestion(idx, "question", e.target.value)
                        }
                        data-testid={`input-qual-question-${idx}`}
                      />
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={q.required}
                          onCheckedChange={(checked) =>
                            updateQualificationQuestion(idx, "required", checked)
                          }
                          data-testid={`switch-qual-required-${idx}`}
                        />
                        <Label className="text-sm">Required Question</Label>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeQualificationQuestion(idx)}
                      data-testid={`button-remove-qual-question-${idx}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Acceptable Responses (comma-separated)
                    </Label>
                    <Input
                      placeholder="e.g., yes, absolutely, interested, looking for solutions"
                      value={q.acceptable_responses.join(", ")}
                      onChange={(e) =>
                        updateQualificationQuestion(
                          idx,
                          "acceptable_responses",
                          e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                        )
                      }
                      data-testid={`input-qual-responses-${idx}`}
                    />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      {/* Next Button */}
      <div className="flex justify-end pt-4">
        <Button onClick={handleNext} size="lg" data-testid="button-next-step">
          Continue to Scheduling
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
