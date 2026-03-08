import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  buildCallFlowPromptSection,
  createCampaignTypeCallFlowPreset,
  getEnabledCallFlowSteps,
  normalizeCampaignCallFlow,
  type CampaignCallFlow,
  type CampaignCallFlowStep,
} from "@shared/call-flow";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  CircleOff,
  GripVertical,
  ListOrdered,
  Plus,
  RotateCcw,
  Trash2,
  Workflow,
} from "lucide-react";

interface CallFlowEditorProps {
  campaignType?: string | null;
  value?: CampaignCallFlow | null;
  onChange: (next: CampaignCallFlow) => void;
  title?: string;
  description?: string;
}

function reorderSteps(
  steps: CampaignCallFlowStep[],
  fromIndex: number,
  toIndex: number,
): CampaignCallFlowStep[] {
  if (toIndex < 0 || toIndex >= steps.length) return steps;
  const next = [...steps];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function CallFlowEditor({
  campaignType,
  value,
  onChange,
  title = "Call Flow Builder",
  description = "Define the exact sequence the agent should follow for this campaign, including which stages are active and which ones must be completed before moving on.",
}: CallFlowEditorProps) {
  const flow = normalizeCampaignCallFlow(value, campaignType);
  const enabledSteps = getEnabledCallFlowSteps(flow);
  const requiredSteps = enabledSteps.filter((step) => step.required);
  const customStepCount = flow.steps.filter((step) => step.key === "custom").length;
  const enabledOrder = new Map(enabledSteps.map((step, index) => [step.id, index + 1]));

  const updateFlow = (steps: CampaignCallFlowStep[]) => {
    onChange({
      ...flow,
      source: "customized",
      campaignType: campaignType || flow.campaignType || null,
      steps,
    });
  };

  const updateStep = (index: number, updates: Partial<CampaignCallFlowStep>) => {
    const nextSteps = flow.steps.map((step, stepIndex) =>
      stepIndex === index
        ? {
            ...step,
            ...updates,
          }
        : step,
    );
    updateFlow(nextSteps);
  };

  const updateIncluded = (index: number, enabled: boolean) => {
    const step = flow.steps[index];
    updateStep(index, {
      enabled,
      required: enabled ? step.required : false,
    });
  };

  const updateRequired = (index: number, required: boolean) => {
    updateStep(index, {
      enabled: required ? true : flow.steps[index].enabled,
      required,
    });
  };

  const addCustomStep = () => {
    updateFlow([
      ...flow.steps,
      {
        id: `custom-${Date.now()}`,
        key: "custom",
        label: "Custom Step",
        description: "Additional stage for this campaign.",
        instructions: "Describe exactly what the agent should achieve in this stage before moving forward.",
        enabled: true,
        required: false,
      },
    ]);
  };

  const resetToPreset = () => {
    onChange(createCampaignTypeCallFlowPreset(campaignType || null));
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {campaignType ? (
              <Badge variant="outline" className="capitalize">
                {campaignType.replace(/_/g, " ")}
              </Badge>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={resetToPreset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Apply Recommended Preset
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-background/90 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Runtime Stages</p>
            <p className="mt-2 text-2xl font-semibold">{enabledSteps.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Stages currently injected into the live prompt.</p>
          </div>
          <div className="rounded-xl border bg-background/90 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Required Stages</p>
            <p className="mt-2 text-2xl font-semibold">{requiredSteps.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Required stages cannot be skipped once enabled.</p>
          </div>
          <div className="rounded-xl border bg-background/90 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Custom Stages</p>
            <p className="mt-2 text-2xl font-semibold">{customStepCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Extra steps added on top of the campaign preset.</p>
          </div>
        </div>

        <div className="rounded-xl border bg-background/85 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium">Active Runtime Sequence</p>
              <p className="text-xs text-muted-foreground">
                SIP and TeXML prompts follow this order. Required stages are forced into the flow automatically.
              </p>
            </div>
            <Badge variant="secondary" className="w-fit">
              Highest priority at runtime
            </Badge>
          </div>

          {enabledSteps.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {enabledSteps.map((step, index) => (
                <div key={step.id} className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="font-medium">{step.label}</span>
                    {step.required ? <Badge variant="secondary">Required</Badge> : null}
                  </div>
                  {index < enabledSteps.length - 1 ? <ArrowRight className="h-4 w-4 text-muted-foreground" /> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              No runtime stages are enabled yet. Turn on at least one stage to generate a live call sequence.
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {flow.steps.map((step, index) => {
          const runtimePosition = enabledOrder.get(step.id);

          return (
            <div
              key={step.id}
              className={cn(
                "rounded-xl border p-4 transition-all",
                step.enabled
                  ? "border-primary/25 bg-background shadow-sm"
                  : "border-dashed border-muted-foreground/25 bg-muted/20",
              )}
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex flex-1 items-start gap-4">
                  <div className="hidden h-11 w-11 items-center justify-center rounded-2xl border bg-background text-muted-foreground sm:flex">
                    <GripVertical className="h-4 w-4" />
                  </div>

                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold",
                      step.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {runtimePosition || index + 1}
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                          <Input
                            value={step.label}
                            onChange={(event) => updateStep(index, { label: event.target.value })}
                            className="h-10 max-w-lg text-sm font-medium"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="capitalize">
                              {step.key === "custom" ? "custom" : step.key.replace(/_/g, " ")}
                            </Badge>
                            {step.enabled ? (
                              <Badge variant="secondary" className="gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {runtimePosition ? `Live Step ${runtimePosition}` : "Live"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 text-muted-foreground">
                                <CircleOff className="h-3.5 w-3.5" />
                                Disabled
                              </Badge>
                            )}
                            {step.required ? <Badge variant="secondary">Required</Badge> : <Badge variant="outline">Optional</Badge>}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                          {step.enabled
                            ? "This stage is part of the live runtime sequence and will be injected into the system prompt in this order."
                            : "Disabled stages stay editable here but are omitted from the runtime prompt until re-enabled."}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 xl:flex-col xl:items-stretch">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => updateFlow(reorderSteps(flow.steps, index, index - 1))}
                          disabled={index === 0}
                          title="Move stage up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => updateFlow(reorderSteps(flow.steps, index, index + 1))}
                          disabled={index === flow.steps.length - 1}
                          title="Move stage down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        {step.key === "custom" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => updateFlow(flow.steps.filter((candidate) => candidate.id !== step.id))}
                            title="Delete custom stage"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border bg-background px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Switch checked={step.enabled} onCheckedChange={(checked) => updateIncluded(index, checked)} />
                          <div>
                            <Label>Include In Flow</Label>
                            <p className="text-xs text-muted-foreground">
                              Controls whether this stage appears in the runtime call sequence.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border bg-background px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Switch checked={step.required} onCheckedChange={(checked) => updateRequired(index, checked)} />
                          <div>
                            <Label>Mark As Required</Label>
                            <p className="text-xs text-muted-foreground">
                              Required stages are auto-included and must be completed before moving on.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Stage Guidance</Label>
                      <Textarea
                        value={step.instructions}
                        onChange={(event) => updateStep(index, { instructions: event.target.value })}
                        rows={4}
                        placeholder="Describe what the agent should accomplish during this stage."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-background/80 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4 text-primary" />
              <p className="font-medium">Add a campaign-specific stage</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Use a custom stage for service-specific instructions that are not covered by the default preset.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={addCustomStep}>
            <Plus className="mr-2 h-4 w-4" />
            Add Custom Stage
          </Button>
        </div>

        <div className="rounded-xl border bg-background/85 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium">Prompt Preview</p>
              <p className="text-xs text-muted-foreground">
                This is the stage-order block that gets injected into the live agent prompt.
              </p>
            </div>
            <Badge variant="outline">Runtime output</Badge>
          </div>
          <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-muted/30 p-4 text-xs text-muted-foreground">
            {buildCallFlowPromptSection(flow) || "Enable at least one stage to generate a runtime prompt preview."}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

export default CallFlowEditor;
