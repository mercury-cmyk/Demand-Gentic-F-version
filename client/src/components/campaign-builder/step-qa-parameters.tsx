import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Bot, Sparkles, Target, CheckCircle2, ChevronRight, ListChecks } from "lucide-react";
import { QueueIntelligenceConfig } from "@/components/campaigns/queue-intelligence-config";

interface QAParametersStepProps {
  data: any;
  onChange: (data: any) => void;
  onNext: (data: any) => void;
}

export function StepQAParameters({ data, onChange, onNext }: QAParametersStepProps) {
  const [qaParameters, setQaParameters] = useState<any>(data.qaParameters || {});
  const [minScore, setMinScore] = useState(data.qaParameters?.min_score || 70);

  useEffect(() => {
    setQaParameters(data.qaParameters || {});
    setMinScore(data.qaParameters?.min_score || 70);
  }, [data.qaParameters]);

  // Get campaign context from previous steps
  const campaignObjective = data.campaignObjective || "";
  const productServiceInfo = data.productServiceInfo || "";
  const talkingPoints = data.talkingPoints || [];
  const targetAudienceDescription = data.targetAudienceDescription || "";
  const successCriteria = data.successCriteria || "";

  const handleNext = () => {
    const mergedQa = {
      ...(qaParameters || {}),
      min_score: minScore,
      use_campaign_context: true,
    };

    onNext({
      ...data,
      qaParameters: mergedQa,
    });
  };

  const hasContext = campaignObjective || productServiceInfo || talkingPoints.length > 0 || targetAudienceDescription || successCriteria;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">AI Quality Assessment</h2>
        <p className="text-sm text-muted-foreground mt-1">
          AI automatically evaluates lead quality based on your campaign context
        </p>
      </div>

      {/* AI-Powered Quality Banner */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Intelligent Lead Qualification
              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                AI analyzes each conversation against your campaign context to determine if a lead
                is qualified. No manual configuration needed - the AI understands your goals,
                product information, and success criteria automatically.
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Conversation Analysis
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Intent Detection
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Objection Tracking
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Outcome Classification
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Campaign Context Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Your Campaign Context
          </CardTitle>
          <CardDescription>
            AI will use this context to evaluate lead qualification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasContext ? (
            <>
              {campaignObjective && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Campaign Objective</Label>
                  <p className="text-sm bg-muted p-3 rounded-lg">{campaignObjective}</p>
                </div>
              )}

              {successCriteria && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Success Criteria</Label>
                  <p className="text-sm bg-muted p-3 rounded-lg">{successCriteria}</p>
                </div>
              )}

              {targetAudienceDescription && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Target Audience</Label>
                  <p className="text-sm bg-muted p-3 rounded-lg">{targetAudienceDescription}</p>
                </div>
              )}

              {talkingPoints.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <ListChecks className="h-3 w-3" />
                    Key Talking Points
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {talkingPoints.map((point: string, idx: number) => (
                      <Badge key={idx} variant="outline">{point}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {productServiceInfo && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Product/Service</Label>
                  <p className="text-sm bg-muted p-3 rounded-lg line-clamp-3">{productServiceInfo}</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No campaign context defined</p>
              <p className="text-sm mt-1">Go back to the Messaging step to add campaign context for better AI qualification.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <QueueIntelligenceConfig
        qaParameters={qaParameters}
        campaignContext={{
          campaignObjective,
          productServiceInfo,
          targetAudienceDescription,
          successCriteria,
          talkingPoints,
        }}
        onChange={(nextQa) => {
          setQaParameters(nextQa);
          onChange({
            ...data,
            qaParameters: nextQa,
          });
        }}
      />

      {/* Qualification Threshold */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qualification Threshold</CardTitle>
          <CardDescription>
            Set the minimum confidence score for AI to mark a lead as "Qualified"
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
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
              ≥{minScore}% = Qualified
            </Badge>
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
              40-{minScore - 1}% = Needs Review
            </Badge>
            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
              &lt;40% = Not Qualified
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* How AI Evaluates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How AI Evaluates Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm">
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">1</div>
              <div>
                <p className="font-medium">Conversation Analysis</p>
                <p className="text-muted-foreground">AI reviews the full call transcript to understand prospect responses and engagement level</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">2</div>
              <div>
                <p className="font-medium">Context Matching</p>
                <p className="text-muted-foreground">Compares conversation outcomes against your campaign objective and success criteria</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">3</div>
              <div>
                <p className="font-medium">Score Generation</p>
                <p className="text-muted-foreground">Generates a confidence score based on how well the outcome matches your success criteria</p>
              </div>
            </div>
          </div>
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
