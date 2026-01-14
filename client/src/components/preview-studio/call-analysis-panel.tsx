import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Brain,
  Heart,
  Lightbulb,
  MessageSquare,
  Target,
  Clock,
  Phone,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  Sparkles,
  Shield,
} from "lucide-react";
import type { EvaluationReport } from "@/types/call-analysis";

interface CallAnalysisPanelProps {
  report: EvaluationReport | null;
  source: 'phone' | 'text' | null;
  isLoading?: boolean;
}

function VerdictBadge({ verdict }: { verdict: 'approve' | 'needs-edits' | 'reject' }) {
  const config = {
    approve: { label: 'Approved', variant: 'default' as const, className: 'bg-green-600 hover:bg-green-700' },
    'needs-edits': { label: 'Needs Edits', variant: 'secondary' as const, className: 'bg-yellow-600 hover:bg-yellow-700 text-white' },
    reject: { label: 'Rejected', variant: 'destructive' as const, className: '' },
  };
  const { label, variant, className } = config[verdict];
  return <Badge variant={variant} className={className}>{label}</Badge>;
}

function ScoreBar({ score, max, label }: { score: number; max: number; label: string }) {
  const percentage = (score / max) * 100;
  const color = percentage >= 80 ? 'bg-green-500' : percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{score}/{max}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function TurnTagBadge({ tag }: { tag: string }) {
  const config: Record<string, { label: string; className: string }> = {
    'good-move': { label: 'Good', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    'missed-opportunity': { label: 'Missed', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    'risk': { label: 'Risk', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    'unclear': { label: 'Unclear', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
  };
  const { label, className } = config[tag] || config['unclear'];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

export function CallAnalysisPanel({ report, source, isLoading }: CallAnalysisPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-muted" />
            <div className="h-4 w-48 bg-muted rounded" />
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Analysis Available</h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Complete a phone test or text simulation to generate an intelligent call analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { executiveSummary, scorecard, voicemailDiscipline, humanityReport, intelligenceReport, timelineHighlights, objectionReview, promptImprovements } = report;

  return (
    <ScrollArea className="h-[calc(100vh-280px)]">
      <div className="space-y-6 pr-4">
        {/* Header with Verdict */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Call Analysis Report</CardTitle>
                  <CardDescription>
                    {source === 'phone' ? 'Phone Test' : source === 'text' ? 'Text Simulation' : 'Analysis'} - 135-point evaluation
                  </CardDescription>
                </div>
              </div>
              <VerdictBadge verdict={executiveSummary.verdict} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-4xl font-bold">{scorecard.total}</div>
                <div className="text-sm text-muted-foreground">/135 points</div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium mb-1">
                    <ThumbsUp className="h-4 w-4" />
                    What Went Well
                  </div>
                  <ul className="space-y-1">
                    {executiveSummary.whatWentWell.map((item, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-green-500 shrink-0" />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium mb-1">
                    <ThumbsDown className="h-4 w-4" />
                    What Hurt
                  </div>
                  <ul className="space-y-1">
                    {executiveSummary.whatHurtConversation.map((item, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <XCircle className="h-3.5 w-3.5 mt-0.5 text-red-500 shrink-0" />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                    {executiveSummary.whatHurtConversation.length === 0 && (
                      <li className="text-muted-foreground">Nothing significant</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Voicemail Discipline - Critical */}
        <Card className={voicemailDiscipline.passed ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Phone className="h-5 w-5" />
                Voicemail Discipline
              </CardTitle>
              <Badge variant={voicemailDiscipline.passed ? 'default' : 'destructive'} className={voicemailDiscipline.passed ? 'bg-green-600' : ''}>
                {voicemailDiscipline.passed ? 'PASSED' : 'FAILED'}
              </Badge>
            </div>
            <CardDescription>
              Critical compliance check - agents must never leave voicemail
            </CardDescription>
          </CardHeader>
          {!voicemailDiscipline.passed && voicemailDiscipline.violations.length > 0 && (
            <CardContent className="pt-0">
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
                <div className="font-medium text-red-700 dark:text-red-400 mb-2">Violations:</div>
                <ul className="space-y-1 text-sm">
                  {voicemailDiscipline.violations.map((v, i) => (
                    <li key={i} className="flex items-start gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Scorecard */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5" />
              Scorecard
            </CardTitle>
            <CardDescription>
              Detailed breakdown of 8 evaluation metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <ScoreBar score={scorecard.clarity} max={20} label="Clarity" />
              <ScoreBar score={scorecard.authority} max={20} label="Authority" />
              <ScoreBar score={scorecard.brevity} max={15} label="Brevity" />
              <ScoreBar score={scorecard.questionQuality} max={15} label="Question Quality" />
              <ScoreBar score={scorecard.objectionHandling} max={15} label="Objection Handling" />
              <ScoreBar score={scorecard.compliance} max={15} label="Compliance" />
              <ScoreBar score={scorecard.humanity} max={20} label="Humanity" />
              <ScoreBar score={scorecard.intelligence} max={15} label="Intelligence" />
            </div>
          </CardContent>
        </Card>

        {/* Humanity & Intelligence Reports */}
        <div className="grid grid-cols-2 gap-4">
          <Card className={humanityReport.passed ? '' : 'border-yellow-200 dark:border-yellow-800'}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Heart className="h-4 w-4" />
                  Humanity Report
                </CardTitle>
                <Badge variant={humanityReport.passed ? 'outline' : 'secondary'} className={humanityReport.passed ? 'border-green-500 text-green-600' : 'bg-yellow-600 text-white'}>
                  {humanityReport.score}/{humanityReport.maxScore}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {humanityReport.issues.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {humanityReport.issues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2 text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-yellow-500 shrink-0" />
                      {issue}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Warm, professional tone maintained
                </p>
              )}
            </CardContent>
          </Card>

          <Card className={intelligenceReport.passed ? '' : 'border-yellow-200 dark:border-yellow-800'}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Brain className="h-4 w-4" />
                  Intelligence Report
                </CardTitle>
                <Badge variant={intelligenceReport.passed ? 'outline' : 'secondary'} className={intelligenceReport.passed ? 'border-green-500 text-green-600' : 'bg-yellow-600 text-white'}>
                  {intelligenceReport.score}/{intelligenceReport.maxScore}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {intelligenceReport.issues.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {intelligenceReport.issues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2 text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-yellow-500 shrink-0" />
                      {issue}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Good conversational intelligence
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Timeline Highlights */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Timeline Highlights
            </CardTitle>
            <CardDescription>
              Key moments from the conversation (first 10 turns)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {timelineHighlights.map((highlight, i) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono text-muted-foreground w-6">#{highlight.turn}</span>
                    <Badge variant="outline" className="text-xs">
                      {highlight.role === 'assistant' ? 'Agent' : 'User'}
                    </Badge>
                  </div>
                  <p className="text-sm flex-1 text-muted-foreground">{highlight.summary}</p>
                  <TurnTagBadge tag={highlight.tag} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Objection Review */}
        {objectionReview.detected.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5" />
                Objection Review
              </CardTitle>
              <CardDescription>
                {objectionReview.responseQuality}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium mb-1">Objections Detected:</div>
                  <div className="flex flex-wrap gap-2">
                    {objectionReview.detected.map((obj, i) => (
                      <Badge key={i} variant="outline">{obj}</Badge>
                    ))}
                  </div>
                </div>
                {objectionReview.betterAlternatives.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-1">Suggestions:</div>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {objectionReview.betterAlternatives.map((alt, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Lightbulb className="h-4 w-4 mt-0.5 text-yellow-500 shrink-0" />
                          {alt}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Prompt Improvements */}
        {promptImprovements.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="h-5 w-5" />
                Prompt Improvements
              </CardTitle>
              <CardDescription>
                Suggested changes to improve agent behavior
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {promptImprovements.map((improvement, i) => (
                  <AccordionItem key={i} value={`item-${i}`}>
                    <AccordionTrigger className="text-sm text-left">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="shrink-0">{i + 1}</Badge>
                        <span>{improvement.reason}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Issue: </span>
                          <span>{improvement.originalLine}</span>
                        </div>
                        <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                          <span className="font-medium text-green-700 dark:text-green-400">Suggestion: </span>
                          <span className="text-green-600 dark:text-green-400">{improvement.replacement}</span>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
