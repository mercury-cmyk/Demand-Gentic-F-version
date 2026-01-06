import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload, FileText, ArrowLeft, CheckCircle2, AlertCircle, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function VerificationSuppressionUploadPage() {
  const { campaignId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [isGlobal, setIsGlobal] = useState(!campaignId);

  const { data: campaign } = useQuery({
    queryKey: ["/api/verification-campaigns", campaignId],
    enabled: !!campaignId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (csvData: string) => {
      const endpoint = isGlobal 
        ? `/api/verification-suppression/global/upload`
        : `/api/verification-campaigns/${campaignId}/suppression/upload`;
      
      const res = await apiRequest("POST", endpoint, { csvData });
      return res.json();
    },
    onSuccess: (data) => {
      setUploadResult(data);
      queryClient.invalidateQueries({ 
        queryKey: ["/api/verification-campaigns", campaignId, "suppression"] 
      });
      toast({
        title: "Upload Complete",
        description: `Added ${data.added} suppression entries, skipped ${data.skipped}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload suppression file",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        toast({
          title: "Invalid File",
          description: "Please select a CSV file",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvData = e.target?.result as string;
      uploadMutation.mutate(csvData);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(campaignId ? `/verification/campaigns/${campaignId}` : "/verification/campaigns")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <ShieldX className="h-8 w-8 text-destructive" />
            Upload Suppression List
          </h1>
          <p className="text-muted-foreground mt-1" data-testid="text-campaign-name">
            {isGlobal ? "Global Suppression (all campaigns)" : `Campaign: ${(campaign as any)?.name || 'Loading...'}`}
          </p>
        </div>
      </div>

      {campaignId && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="global-toggle" className="text-base font-medium">
                  Global Suppression
                </Label>
                <p className="text-sm text-muted-foreground">
                  Apply this suppression list to all campaigns (not just this one)
                </p>
              </div>
              <Switch
                id="global-toggle"
                checked={isGlobal}
                onCheckedChange={setIsGlobal}
                data-testid="switch-global-suppression"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>CSV Format Guidelines</CardTitle>
          <CardDescription>Accepted column headers for suppression matching</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Matching Methods:</strong> The system will suppress contacts that match on any of these fields:
                Email, CAV ID, CAV User ID, or Name+Company combination.
              </AlertDescription>
            </Alert>

            <div>
              <h4 className="font-medium mb-2">Suppression Fields (at least one required)</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• <strong>email or emailAddress</strong> - Email address to suppress</p>
                <p>• <strong>cavId</strong> - CAV ID for suppression matching</p>
                <p>• <strong>cavUserId</strong> - CAV User ID for suppression matching</p>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Name+Company Suppression (all fields required for this method)</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• <strong>firstName</strong> - Contact first name</p>
                <p>• <strong>lastName</strong> - Contact last name</p>
                <p>• <strong>companyName or company or accountName</strong> - Company name</p>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium mb-2">Example CSV Format</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs">
                <div>Email,CAV ID,First Name,Last Name,Company Name</div>
                <div>spam@example.com,,,,</div>
                <div>,CAV12345,,,</div>
                <div>bad@email.com,CAV67890,John,Doe,Acme Corp</div>
                <div>,,,Jane,Smith,TechCo Inc</div>
              </div>
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                <strong>Note:</strong> Column headers are case-insensitive and spaces/special characters are ignored.
                Each row must have at least one valid suppression field (email, CAV ID, CAV User ID, or all three name/company fields).
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload File</CardTitle>
          <CardDescription>Select and upload your suppression CSV file</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <label
              htmlFor="csv-file"
              className="flex items-center gap-2 px-4 py-2 bg-secondary hover-elevate active-elevate-2 rounded-md cursor-pointer"
              data-testid="button-select-file"
            >
              <FileText className="h-4 w-4" />
              <span>Select CSV File</span>
              <input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-csv-file"
              />
            </label>
            
            {file && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm" data-testid="text-selected-file">{file.name}</span>
              </div>
            )}
          </div>

          {file && (
            <Button
              onClick={handleUpload}
              disabled={uploadMutation.isPending}
              className="w-full"
              data-testid="button-upload-csv"
            >
              {uploadMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Suppression List
                </>
              )}
            </Button>
          )}

          {uploadMutation.isPending && (
            <Progress value={undefined} className="w-full" />
          )}
        </CardContent>
      </Card>

      {uploadResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Upload Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Rows</p>
                <p className="text-2xl font-bold" data-testid="text-result-total">{uploadResult.total}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Added</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-result-added">{uploadResult.added}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Skipped</p>
                <p className="text-2xl font-bold text-amber-600" data-testid="text-result-skipped">{uploadResult.skipped}</p>
              </div>
            </div>

            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  Errors
                </h4>
                <div className="bg-muted rounded-md p-3 max-h-48 overflow-y-auto">
                  {uploadResult.errors.map((error: string, idx: number) => (
                    <p key={idx} className="text-xs text-muted-foreground mb-1" data-testid={`text-error-${idx}`}>
                      {error}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => navigate(campaignId ? `/verification/campaigns/${campaignId}` : "/verification/campaigns")}
                data-testid="button-view-campaign"
              >
                Back to Campaign
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
