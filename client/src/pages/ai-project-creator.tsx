import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Sparkles, AlertCircle, CheckCircle, Info, Loader2, Edit } from 'lucide-react';
import { PageShell } from '@/components/patterns/page-shell';
import { apiRequest } from '@/lib/queryClient';

interface ExtractedData {
  projectName?: string;
  clientName?: string;
  targetAudience?: {
    jobTitles?: string[];
    industries?: string[];
    companySize?: { min?: number; max?: number };
    geography?: string[];
  };
  channels?: string[];
  volume?: number;
  costPerLead?: number;
  timeline?: { start?: string; end?: string };
  deliveryMethods?: string[];
  specialRequirements?: string[];
}

interface ExtractionResult {
  intentId: string;
  extractedData: ExtractedData;
  confidenceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  validationErrors: string[];
  validationWarnings: string[];
  status: string;
  processingTime: number;
}

export default function AIProjectCreatorPage() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [editedData, setEditedData] = useState<ExtractedData | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const extractMutation = useMutation({
    mutationFn: async (prompt: string): Promise<ExtractionResult> => {
      const response = await apiRequest('POST', '/api/ai/extract-project', { prompt });
      return response.json();
    },
    onSuccess: (data: ExtractionResult) => {
      setResult(data);
      setEditedData(data.extractedData);
      setIsEditing(false);
    },
  });

  const handleExtract = () => {
    if (prompt.length < 10) {
      return;
    }
    extractMutation.mutate(prompt);
  };

  const getConfidenceBadge = (level: 'high' | 'medium' | 'low', score: number) => {
    const variants = {
      high: 'default',
      medium: 'secondary',
      low: 'destructive',
    } as const;

    return (
      <Badge variant={variants[level]} className="ml-2">
        {level.toUpperCase()} ({score}%)
      </Badge>
    );
  };

  return (
    <PageShell title="AI Project Creator">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Natural Language Input
              </CardTitle>
              <CardDescription>
                Describe your project in plain English. Include details about the client, target audience, channels, volume, and timeline.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                data-testid="input-prompt"
                placeholder="Example: We need 500 CFOs from manufacturing companies in the UK for a telemarketing campaign. The campaign should start next week and run for 2 months. We'll deliver leads via API."
                className="min-h-[300px] font-mono text-sm"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={extractMutation.isPending}
              />

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {prompt.length} / 5000 characters
                </div>
                <Button
                  data-testid="button-extract"
                  onClick={handleExtract}
                  disabled={prompt.length < 10 || extractMutation.isPending}
                >
                  {extractMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Extract Project Data
                    </>
                  )}
                </Button>
              </div>

              {extractMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Failed to extract project data. Please try again.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  Extraction Quality
                  {getConfidenceBadge(result.confidenceLevel, result.confidenceScore)}
                </CardTitle>
                <CardDescription>
                  Processed in {result.processingTime}ms
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.validationErrors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-semibold mb-2">Validation Errors:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {result.validationErrors.map((error, i) => (
                          <li key={i} className="text-sm">{error}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {result.validationWarnings.length > 0 && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-semibold mb-2">Warnings:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {result.validationWarnings.map((warning, i) => (
                          <li key={i} className="text-sm">{warning}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {result.validationErrors.length === 0 && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Extraction successful! Ready for review.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          {result ? (
            <Card>
              <CardHeader>
                <CardTitle>Extracted Project Data</CardTitle>
                <CardDescription>
                  Review and edit the extracted information before creating the project
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.extractedData.projectName && (
                  <div data-testid="text-projectname">
                    <label className="text-sm font-medium">Project Name</label>
                    <p className="text-sm text-muted-foreground">{result.extractedData.projectName}</p>
                  </div>
                )}

                {result.extractedData.clientName && (
                  <div data-testid="text-clientname">
                    <label className="text-sm font-medium">Client Name</label>
                    <p className="text-sm text-muted-foreground">{result.extractedData.clientName}</p>
                  </div>
                )}

                <Separator />

                {result.extractedData.targetAudience && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Target Audience</h4>
                    
                    {result.extractedData.targetAudience.jobTitles && result.extractedData.targetAudience.jobTitles.length > 0 && (
                      <div>
                        <label className="text-sm font-medium">Job Titles</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {result.extractedData.targetAudience.jobTitles.map((title, i) => (
                            <Badge key={i} variant="secondary" data-testid={`badge-jobtitle-${i}`}>
                              {title}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.extractedData.targetAudience.industries && result.extractedData.targetAudience.industries.length > 0 && (
                      <div>
                        <label className="text-sm font-medium">Industries</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {result.extractedData.targetAudience.industries.map((industry, i) => (
                            <Badge key={i} variant="secondary" data-testid={`badge-industry-${i}`}>
                              {industry}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.extractedData.targetAudience.geography && result.extractedData.targetAudience.geography.length > 0 && (
                      <div>
                        <label className="text-sm font-medium">Geography</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {result.extractedData.targetAudience.geography.map((geo, i) => (
                            <Badge key={i} variant="secondary" data-testid={`badge-geography-${i}`}>
                              {geo}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.extractedData.targetAudience.companySize && (
                      <div>
                        <label className="text-sm font-medium">Company Size</label>
                        <p className="text-sm text-muted-foreground">
                          {result.extractedData.targetAudience.companySize.min || 0} - {result.extractedData.targetAudience.companySize.max || '∞'} employees
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <Separator />

                {result.extractedData.channels && result.extractedData.channels.length > 0 && (
                  <div>
                    <label className="text-sm font-medium">Channels</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {result.extractedData.channels.map((channel, i) => (
                        <Badge key={i} data-testid={`badge-channel-${i}`}>
                          {channel}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {result.extractedData.volume && (
                  <div data-testid="text-volume">
                    <label className="text-sm font-medium">Target Volume</label>
                    <p className="text-sm text-muted-foreground">{result.extractedData.volume.toLocaleString()} leads</p>
                  </div>
                )}

                {result.extractedData.costPerLead && (
                  <div data-testid="text-costperlead">
                    <label className="text-sm font-medium">Cost Per Lead</label>
                    <p className="text-sm text-muted-foreground">${result.extractedData.costPerLead.toFixed(2)}</p>
                  </div>
                )}

                {result.extractedData.timeline && (
                  <div>
                    <label className="text-sm font-medium">Timeline</label>
                    <p className="text-sm text-muted-foreground">
                      {result.extractedData.timeline.start || 'Not specified'} → {result.extractedData.timeline.end || 'Not specified'}
                    </p>
                  </div>
                )}

                {result.extractedData.deliveryMethods && result.extractedData.deliveryMethods.length > 0 && (
                  <div>
                    <label className="text-sm font-medium">Delivery Methods</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {result.extractedData.deliveryMethods.map((method, i) => (
                        <Badge key={i} variant="outline" data-testid={`badge-delivery-${i}`}>
                          {method}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {result.extractedData.specialRequirements && result.extractedData.specialRequirements.length > 0 && (
                  <div>
                    <label className="text-sm font-medium">Special Requirements</label>
                    <ul className="list-disc list-inside space-y-1 mt-1">
                      {result.extractedData.specialRequirements.map((req, i) => (
                        <li key={i} className="text-sm text-muted-foreground">{req}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button 
                    className="flex-1" 
                    data-testid="button-create-project"
                    disabled={result.validationErrors.length > 0}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Create Project
                  </Button>
                  <Button variant="outline" onClick={() => setResult(null)} data-testid="button-reset">
                    Start Over
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Sparkles className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Data Yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Enter a project description and click "Extract Project Data" to see the AI-extracted information here.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}
