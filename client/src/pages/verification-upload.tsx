import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload, FileText, ArrowLeft, CheckCircle2, AlertCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { parseCSV } from "@/lib/csv-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { CustomFieldDefinition } from "@shared/schema";

interface FieldMapping {
  csvColumn: string;
  targetField: string | null;
  targetEntity: "contact" | "account" | null;
}

type UploadStage = "select" | "map" | "upload" | "complete";

// Auto-map verification column names
function autoMapVerificationColumn(header: string): string | null {
  const normalized = header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const mappings: Record<string, string> = {
    'fullname': 'fullName',
    'name': 'fullName',
    'firstname': 'firstName',
    'lastname': 'lastName',
    'jobtitle': 'title',
    'title': 'title',
    'emailaddress': 'email',
    'email': 'email',
    'phonenumber': 'phone',
    'phone': 'phone',
    'mobilenumber': 'mobile',
    'mobile': 'mobile',
    'linkedin': 'linkedinUrl',
    'linkedinurl': 'linkedinUrl',
    'contactaddress1': 'contactAddress1',
    'contactaddress2': 'contactAddress2',
    'contactaddress3': 'contactAddress3',
    'address1': 'contactAddress1',
    'address2': 'contactAddress2',
    'address3': 'contactAddress3',
    'street1': 'contactAddress1',
    'street2': 'contactAddress2',
    'street3': 'contactAddress3',
    'contactcity': 'contactCity',
    'city': 'contactCity',
    'contactstate': 'contactState',
    'state': 'contactState',
    'contactcountry': 'contactCountry',
    'country': 'contactCountry',
    'contactpostalcode': 'contactPostal',
    'contactpostal': 'contactPostal',
    'postalcode': 'contactPostal',
    'postal': 'contactPostal',
    'zip': 'contactPostal',
    'zipcode': 'contactPostal',
    'companyname': 'account_name',
    'company': 'account_name',
    'accountname': 'account_name',
    'companydomain': 'domain',
    'domain': 'domain',
    'hqaddress1': 'hqAddress1',
    'hqaddress2': 'hqAddress2',
    'hqaddress3': 'hqAddress3',
    'companyaddress1': 'hqAddress1',
    'companyaddress2': 'hqAddress2',
    'companyaddress3': 'hqAddress3',
    'hqstreet1': 'hqAddress1',
    'hqstreet2': 'hqAddress2',
    'hqstreet3': 'hqAddress3',
    'hqcity': 'hqCity',
    'hqstate': 'hqState',
    'hqpostalcode': 'hqPostal',
    'hqpostal': 'hqPostal',
    'hqzip': 'hqPostal',
    'companypostalcode': 'hqPostal',
    'companypostal': 'hqPostal',
    'hqcountry': 'hqCountry',
    'companycountry': 'hqCountry',
    'hqphone': 'hqPhone',
    'companyphone': 'hqPhone',
    'mainphone': 'hqPhone',
    'companyphonenumber': 'hqPhone',
    'cavid': 'cavId',
    'cavuserid': 'cavUserId',
    'sourcetype': 'sourceType',
    'source': 'sourceType',
  };

  return mappings[normalized] || null;
}

function getTargetEntity(fieldName: string): "contact" | "account" | null {
  const accountFields = ['account_name', 'domain', 'hqPhone', 'hqAddress1', 'hqAddress2', 'hqAddress3', 'hqCity', 'hqState', 'hqPostal', 'hqCountry'];
  return accountFields.includes(fieldName) ? 'account' : 'contact';
}

export default function VerificationUploadPage() {
  const { campaignId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [stage, setStage] = useState<UploadStage>("select");
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [rawCSVContent, setRawCSVContent] = useState<string>("");
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [updateMode, setUpdateMode] = useState<boolean>(false);
  const [uploadJobId, setUploadJobId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<string>("idle");
  const [loadedTemplate, setLoadedTemplate] = useState<any>(null);
  const [mappingSource, setMappingSource] = useState<"auto" | "template" | "manual" | "ai">("auto");
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, { targetField: string | null; targetEntity: "contact" | "account" | null; confidence: number; rationale: string }>>({});
  const [isLoadingAiSuggestions, setIsLoadingAiSuggestions] = useState(false);
  
  // Custom field creation state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createFieldForColumn, setCreateFieldForColumn] = useState<string | null>(null);
  const [createFieldEntity, setCreateFieldEntity] = useState<"contact" | "account" | null>(null);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number" | "date" | "boolean">("text");
  const [isCreating, setIsCreating] = useState(false);

  const { data: campaign } = useQuery({
    queryKey: ["/api/verification-campaigns", campaignId],
  });

  // Fetch custom fields
  const { data: customFields } = useQuery<CustomFieldDefinition[]>({
    queryKey: ['/api/custom-fields'],
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, fieldMappings, updateMode }: { file: File; fieldMappings: FieldMapping[]; updateMode: boolean }) => {
      // Use FormData for large file uploads to avoid JSON string truncation
      // This handles files up to 50MB without browser memory issues
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fieldMappings', JSON.stringify(fieldMappings));
      formData.append('updateMode', String(updateMode));
      
      const token = localStorage.getItem("authToken");
      const res = await fetch(`/api/verification-campaigns/${campaignId}/upload-multipart`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: async (data) => {
      setUploadJobId(data.uploadJobId);
      setUploadStatus("processing");
      
      // Save mapping template BEFORE navigation (optimistically)
      if (fieldMappings.length > 0 && csvHeaders.length > 0) {
        try {
          if (loadedTemplate) {
            // Update existing template (only send fields accepted by updateCsvMappingTemplateSchema)
            await apiRequest("PUT", `/api/csv-mapping-templates/${loadedTemplate.id}`, {
              mappings: fieldMappings.map(m => ({
                csvColumn: m.csvColumn,
                targetField: m.targetField,
                targetEntity: m.targetEntity,
              })),
            });
            console.log(`[CSV Mapping] Updated template "${loadedTemplate.name}"`);
          } else {
            // Create new template
            const templateName = `Auto-saved ${new Date().toLocaleDateString()}`;
            await apiRequest("POST", "/api/csv-mapping-templates", {
              name: templateName,
              entityType: "verification_contact",
              csvHeaders,
              mappings: fieldMappings.map(m => ({
                csvColumn: m.csvColumn,
                targetField: m.targetField,
                targetEntity: m.targetEntity,
              })),
            });
            console.log("[CSV Mapping] Saved new mapping template");
          }
        } catch (error) {
          console.error("[CSV Mapping] Error saving template:", error);
          toast({
            title: "Template Save Failed",
            description: "Mappings couldn't be saved for reuse, but upload will continue.",
            variant: "default",
          });
        }
      }
      
      // Show success toast and navigate away immediately
      toast({
        title: "High-Performance Upload Started",
        description: `Processing ${data.totalRows?.toLocaleString() || 'your'} contacts in background with optimized pipeline. You'll be notified when complete.`,
      });
      
      // Navigate to console immediately - don't wait for completion
      setTimeout(() => {
        navigate(`/verification/${campaignId}/console`);
      }, 1500);
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload CSV",
        variant: "destructive",
      });
    },
  });

  // Auto-load CSV mapping template when headers are detected
  useEffect(() => {
    if (csvHeaders.length === 0) return;

    const loadMappings = async () => {
      // Try to load template first
      try {
        const response = await apiRequest("POST", "/api/csv-mapping-templates/find-best-match", {
          csvHeaders,
        });
        const data = await response.json();

        if (data.template && data.matchScore >= 50) {
          // Apply template mappings
          const templateMappings: FieldMapping[] = (data.template.mappings as any[]).map((m: any) => ({
            csvColumn: m.csvColumn,
            targetField: m.targetField,
            targetEntity: m.targetEntity,
          }));
          
          setFieldMappings(templateMappings);
          setLoadedTemplate(data.template);
          setMappingSource("template");
          
          console.log(`[CSV Mapping] Applied template "${data.template.name}" (${data.matchScore}% match)`);
        } else {
          setMappingSource("auto");
        }
      } catch (error) {
        console.error("[CSV Mapping] Error loading template:", error);
        setMappingSource("auto");
      }

      // Fetch AI-powered suggestions in parallel
      if (csvData.length > 0) {
        setIsLoadingAiSuggestions(true);
        try {
          const aiResponse = await apiRequest("POST", "/api/csv-ai-mapping/suggest", {
            csvHeaders,
            csvData: csvData.slice(0, 20), // Send first 20 rows for analysis
          });
          
          const aiData = await aiResponse.json();
          
          if (aiData.suggestions && Array.isArray(aiData.suggestions)) {
            // Convert to lookup object
            const suggestionsMap: Record<string, any> = {};
            aiData.suggestions.forEach((s: any) => {
              suggestionsMap[s.csvColumn] = {
                targetField: s.targetField,
                targetEntity: s.targetEntity,
                confidence: s.confidence,
                rationale: s.rationale,
              };
            });
            
            setAiSuggestions(suggestionsMap);
            
            // If no template was loaded and AI has high-confidence suggestions, apply them
            // Use functional setState to get current mapping source
            setMappingSource(currentSource => {
              if (currentSource === "auto" && loadedTemplate === null) {
                const highConfidenceMappings: FieldMapping[] = aiData.suggestions
                  .filter((s: any) => s.confidence >= 0.8 && s.targetField)
                  .map((s: any) => ({
                    csvColumn: s.csvColumn,
                    targetField: s.targetField,
                    targetEntity: s.targetEntity,
                  }));
                
                if (highConfidenceMappings.length > 0) {
                  setFieldMappings(highConfidenceMappings);
                  console.log(`[AI Mapping] Applied ${highConfidenceMappings.length} high-confidence AI suggestions`);
                  return "ai";
                }
              }
              return currentSource;
            });
          }
        } catch (error: any) {
          console.error("[AI Mapping] Error loading AI suggestions:", error);
          // Graceful degradation - AI is optional enhancement
        } finally {
          setIsLoadingAiSuggestions(false);
        }
      }
    };

    loadMappings();
  }, [csvHeaders, csvData]);

  // Background polling for completion notifications (works even after navigation)
  useEffect(() => {
    if (!uploadJobId || (uploadStatus !== "processing" && uploadStatus !== "pending")) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const res = await apiRequest("GET", `/api/verification-upload-jobs/${uploadJobId}`);
        const data = await res.json();

        setUploadProgress(data.progress || 0);
        setUploadStatus(data.status);

        if (data.status === "completed") {
          clearInterval(pollInterval);
          
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
          queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
          
          // Show completion notification
          toast({
            title: "Upload Complete ✓",
            description: `${data.successCount} contacts processed successfully${data.errorCount > 0 ? `, ${data.errorCount} errors` : ''}`,
          });
        } else if (data.status === "failed") {
          clearInterval(pollInterval);
          toast({
            variant: "destructive",
            title: "Upload Failed",
            description: data.errors?.[0]?.message || "Upload processing failed",
          });
        }
      } catch (error: any) {
        console.error("Error polling upload status:", error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [uploadJobId, uploadStatus, campaignId, queryClient, toast]);

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
      
      // Parse CSV to extract headers
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setRawCSVContent(content);
        const parsed = parseCSV(content);
        
        if (parsed.length > 0) {
          setCsvHeaders(parsed[0]);
          setCsvData(parsed.slice(1));
          setStage("map");
        }
      };
      reader.readAsText(selectedFile);
    }
  };

  const openCreateDialog = (csvColumn: string, entity: "contact" | "account") => {
    setCreateFieldForColumn(csvColumn);
    setCreateFieldEntity(entity);
    // Auto-suggest field key from CSV column name
    const suggestedKey = csvColumn.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setNewFieldKey(suggestedKey);
    setNewFieldLabel(csvColumn);
    setShowCreateDialog(true);
  };

  const handleCreateCustomField = async () => {
    if (!newFieldKey || !newFieldLabel || !createFieldEntity) return;

    setIsCreating(true);
    try {
      const response = await apiRequest("POST", "/api/custom-fields", {
        entityType: createFieldEntity,
        fieldKey: newFieldKey,
        displayLabel: newFieldLabel,
        fieldType: newFieldType,
        active: true,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to create custom field");
      }

      // Refresh custom fields
      await queryClient.invalidateQueries({ queryKey: ['/api/custom-fields'] });

      // Auto-map the column to the newly created field
      if (createFieldForColumn) {
        const customFieldValue = `custom_${newFieldKey}`;
        const newMappings = fieldMappings.filter(m => m.csvColumn !== createFieldForColumn);
        newMappings.push({
          csvColumn: createFieldForColumn,
          targetField: customFieldValue,
          targetEntity: createFieldEntity,
        });
        setFieldMappings(newMappings);
        // Mark as manual when user creates custom field
        if (mappingSource !== "manual") {
          setMappingSource("manual");
        }
      }

      toast({
        title: "Custom Field Created",
        description: `Created "${newFieldLabel}" and mapped it to column "${createFieldForColumn}"`,
      });

      // Reset dialog state
      setShowCreateDialog(false);
      setCreateFieldForColumn(null);
      setCreateFieldEntity(null);
      setNewFieldKey("");
      setNewFieldLabel("");
      setNewFieldType("text");
    } catch (error) {
      console.error("Failed to create custom field:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create custom field",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleMappingComplete = (mappings: FieldMapping[]) => {
    setFieldMappings(mappings);
    setStage("upload");
  };

  const handleUpload = async () => {
    if (!file) return;

    uploadMutation.mutate({ file, fieldMappings, updateMode });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/verification/campaigns")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Upload Contacts
          </h1>
          <p className="text-muted-foreground mt-1" data-testid="text-campaign-name">
            Campaign: {(campaign as any)?.name}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CSV Format Guidelines</CardTitle>
          <CardDescription>Accepted column headers and data requirements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Contact Information (at least name required)</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• <strong>fullName or name</strong> - Full contact name</p>
                <p>• <strong>firstName</strong> - First name</p>
                <p>• <strong>lastName</strong> - Last name</p>
                <p>• <strong>title or jobTitle</strong> - Job title</p>
                <p>• <strong>email or emailAddress</strong> - Email address</p>
                <p>• <strong>phone or phoneNumber</strong> - Phone number</p>
                <p>• <strong>mobile or mobileNumber</strong> - Mobile number</p>
                <p>• <strong>linkedin or linkedinUrl</strong> - LinkedIn profile URL</p>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Contact Location</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• <strong>city</strong> - Contact city</p>
                <p>• <strong>state</strong> - Contact state</p>
                <p>• <strong>country</strong> - Contact country</p>
                <p>• <strong>postalCode or zip</strong> - Postal/ZIP code</p>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Company/Account Information</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• <strong>companyName or company or accountName</strong> - Company name</p>
                <p>• <strong>domain or companyDomain</strong> - Company website domain</p>
                <p>• <strong>hqCity</strong> - Company HQ city</p>
                <p>• <strong>hqState</strong> - Company HQ state</p>
                <p>• <strong>hqCountry</strong> - Company HQ country</p>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Additional Fields</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• <strong>cavId</strong> - CAV ID for suppression matching</p>
                <p>• <strong>cavUserId</strong> - CAV User ID for suppression matching</p>
                <p>• <strong>sourceType or source</strong> - "Client_Provided" or "New_Sourced"</p>
              </div>
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                <strong>Note:</strong> Column headers are case-insensitive and spaces/special characters are ignored. 
                After upload, contacts are automatically evaluated for eligibility and checked against suppression lists.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>

      {stage === "select" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>Select your CSV file to begin</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
                <Checkbox
                  id="update-mode"
                  checked={updateMode}
                  onCheckedChange={(checked) => setUpdateMode(checked === true)}
                  data-testid="checkbox-update-mode"
                />
                <Label htmlFor="update-mode" className="cursor-pointer flex-1">
                  <div className="font-medium">Update Existing Contacts</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Match by Name + Country + Company and update CAV IDs or other fields
                  </div>
                </Label>
              </div>

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
                    data-testid="input-file"
                  />
                </label>
              </div>
            </div>
            
            <Alert>
              <AlertDescription className="text-xs space-y-2">
                {updateMode ? (
                  <>
                    <p><strong>Update Mode:</strong> Matching criteria (in order):</p>
                    <ol className="list-decimal list-inside pl-2 space-y-1">
                      <li>Exact email match (strongest signal)</li>
                      <li>Name + Country + Company (all three required)</li>
                      <li>If multiple matches found, will create new instead of updating</li>
                    </ol>
                    <p className="mt-2"><strong>Update rules (strict):</strong></p>
                    <ul className="list-disc list-inside pl-2 space-y-1">
                      <li><strong>CSV has CAV IDs?</strong> → ONLY CAV ID fields updated</li>
                      <li><strong>DB has CAV IDs (CSV doesn't)?</strong> → ALL non-CAV fields updated</li>
                      <li><strong>Neither has CAV IDs?</strong> → ALL fields updated</li>
                      <li>Empty CSV values never overwrite existing data</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <strong>Next Step:</strong> After selecting a file, you'll be able to map CSV columns to contact fields manually.
                  </>
                )}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {stage === "map" && file && (
        <Card>
          <CardHeader>
            <CardTitle>Map CSV Columns to Fields</CardTitle>
            <CardDescription>
              Match your CSV columns to verification contact fields. Auto-mapping has been applied based on column names.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingAiSuggestions && (
              <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <AlertDescription className="text-xs flex items-center gap-2">
                  <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span><strong>AI Analysis:</strong> Analyzing your CSV data to suggest intelligent field mappings...</span>
                </AlertDescription>
              </Alert>
            )}
            
            {mappingSource === "ai" && !isLoadingAiSuggestions && (
              <Alert className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 border-violet-200 dark:border-violet-800">
                <CheckCircle2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <AlertDescription className="text-xs">
                  <strong>AI-Powered Mapping:</strong> High-confidence field mappings applied using AI analysis of your data. Hover over confidence badges to see reasoning. You can still adjust any mappings below.
                </AlertDescription>
              </Alert>
            )}
            
            {mappingSource === "template" && loadedTemplate && (
              <Alert className="bg-primary/5 border-primary/20">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertDescription className="text-xs">
                  <strong>Template Applied:</strong> Using saved mapping "{loadedTemplate.name}" - matching columns have been automatically mapped. You can still adjust any mappings below.
                </AlertDescription>
              </Alert>
            )}
            
            {mappingSource === "auto" && !isLoadingAiSuggestions && (
              <Alert>
                <AlertDescription className="text-xs">
                  <strong>Auto-Mapping:</strong> Fields marked in <strong className="text-primary">blue</strong> were auto-mapped based on column names. 
                  {Object.keys(aiSuggestions).length > 0 && " AI suggestions are available - check confidence scores below."}
                  {" "}You can change any mapping, skip unmapped columns, or create custom fields.
                </AlertDescription>
              </Alert>
            )}
            
            {mappingSource === "manual" && (
              <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <AlertDescription className="text-xs">
                  <strong>Manual Mapping:</strong> You've customized the mappings. These changes will be saved as a new template for future uploads.
                </AlertDescription>
              </Alert>
            )}

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {csvHeaders.map((header, index) => {
                  const autoMapped = autoMapVerificationColumn(header);
                  const contactCustomFields = customFields?.filter(f => f.entityType === 'contact' && f.active) || [];
                  const accountCustomFields = customFields?.filter(f => f.entityType === 'account' && f.active) || [];
                  const aiSuggestion = aiSuggestions[header];
                  
                  // Determine confidence color and label
                  const getConfidenceBadge = (confidence: number) => {
                    if (confidence >= 0.9) return { color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', label: 'High' };
                    if (confidence >= 0.7) return { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', label: 'Good' };
                    if (confidence >= 0.5) return { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', label: 'Medium' };
                    return { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300', label: 'Low' };
                  };
                  
                  return (
                    <div key={index} className="flex items-center gap-4 p-3 border rounded-md">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className={`font-medium text-sm ${autoMapped ? 'text-primary' : ''}`}>
                            {header}
                          </div>
                          {aiSuggestion && aiSuggestion.confidence > 0 && (
                            <div
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${getConfidenceBadge(aiSuggestion.confidence).color}`}
                              title={`AI Confidence: ${Math.round(aiSuggestion.confidence * 100)}%\n${aiSuggestion.rationale}`}
                            >
                              {getConfidenceBadge(aiSuggestion.confidence).label} {Math.round(aiSuggestion.confidence * 100)}%
                            </div>
                          )}
                        </div>
                        {csvData.length > 0 && csvData[0][index] && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Sample: {csvData[0][index]?.slice(0, 40)}...
                          </div>
                        )}
                        {aiSuggestion && aiSuggestion.rationale && (
                          <div className="text-xs text-muted-foreground mt-1 italic">
                            💡 AI: {aiSuggestion.rationale.slice(0, 80)}...
                          </div>
                        )}
                      </div>
                      <div className="w-64">
                        <Select
                          value={fieldMappings.find(m => m.csvColumn === header)?.targetField || autoMapped || "skip"}
                          onValueChange={(value) => {
                            if (value === "__CREATE_CONTACT__") {
                              openCreateDialog(header, "contact");
                            } else if (value === "__CREATE_ACCOUNT__") {
                              openCreateDialog(header, "account");
                            } else {
                              const newMappings = fieldMappings.filter(m => m.csvColumn !== header);
                              if (value !== "skip") {
                                newMappings.push({
                                  csvColumn: header,
                                  targetField: value,
                                  targetEntity: getTargetEntity(value),
                                });
                              }
                              setFieldMappings(newMappings);
                              // Mark as manual when user changes a mapping
                              if (mappingSource !== "manual") {
                                setMappingSource("manual");
                              }
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Skip this column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Skip Column</SelectItem>
                            
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                              Contact Info
                            </div>
                            <SelectItem value="fullName">Full Name</SelectItem>
                            <SelectItem value="firstName">First Name</SelectItem>
                            <SelectItem value="lastName">Last Name</SelectItem>
                            <SelectItem value="title">Job Title</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="phone">Phone</SelectItem>
                            <SelectItem value="mobile">Mobile</SelectItem>
                            <SelectItem value="linkedinUrl">LinkedIn URL</SelectItem>
                            
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                              Contact Address
                            </div>
                            <SelectItem value="contactAddress1">Address Line 1</SelectItem>
                            <SelectItem value="contactAddress2">Address Line 2</SelectItem>
                            <SelectItem value="contactAddress3">Address Line 3</SelectItem>
                            <SelectItem value="contactCity">City</SelectItem>
                            <SelectItem value="contactState">State</SelectItem>
                            <SelectItem value="contactCountry">Country</SelectItem>
                            <SelectItem value="contactPostal">Postal Code</SelectItem>
                            
                            {contactCustomFields.length > 0 && (
                              <>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                                  Contact Custom Fields
                                </div>
                                {contactCustomFields.map(field => (
                                  <SelectItem key={field.id} value={`custom_${field.fieldKey}`}>
                                    {field.displayLabel}
                                  </SelectItem>
                                ))}
                              </>
                            )}
                            
                            <SelectItem value="__CREATE_CONTACT__" className="font-medium text-primary">
                              <div className="flex items-center gap-2">
                                <Plus className="h-3 w-3" />
                                <span>Create Contact Custom Field</span>
                              </div>
                            </SelectItem>
                            
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                              Company Info
                            </div>
                            <SelectItem value="account_name">Company Name</SelectItem>
                            <SelectItem value="domain">Domain</SelectItem>
                            <SelectItem value="hqPhone">HQ Phone</SelectItem>
                            <SelectItem value="hqAddress1">HQ Address 1</SelectItem>
                            <SelectItem value="hqAddress2">HQ Address 2</SelectItem>
                            <SelectItem value="hqAddress3">HQ Address 3</SelectItem>
                            <SelectItem value="hqCity">HQ City</SelectItem>
                            <SelectItem value="hqState">HQ State</SelectItem>
                            <SelectItem value="hqPostal">HQ Postal Code</SelectItem>
                            <SelectItem value="hqCountry">HQ Country</SelectItem>
                            
                            {accountCustomFields.length > 0 && (
                              <>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                                  Account Custom Fields
                                </div>
                                {accountCustomFields.map(field => (
                                  <SelectItem key={field.id} value={`custom_${field.fieldKey}`}>
                                    {field.displayLabel}
                                  </SelectItem>
                                ))}
                              </>
                            )}
                            
                            <SelectItem value="__CREATE_ACCOUNT__" className="font-medium text-primary">
                              <div className="flex items-center gap-2">
                                <Plus className="h-3 w-3" />
                                <span>Create Account Custom Field</span>
                              </div>
                            </SelectItem>
                            
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                              Other
                            </div>
                            <SelectItem value="cavId">CAV ID</SelectItem>
                            <SelectItem value="cavUserId">CAV User ID</SelectItem>
                            <SelectItem value="sourceType">Source Type</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={() => handleMappingComplete(fieldMappings)}>
                Continue to Upload
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStage("select");
                  setFile(null);
                  setCsvHeaders([]);
                  setCsvData([]);
                  setFieldMappings([]);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "upload" && file && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to Upload</CardTitle>
            <CardDescription>Review and confirm your upload</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm mb-4" data-testid="text-selected-file">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="font-medium">{file.name}</span>
              <span className="text-muted-foreground">
                ({(file.size / 1024).toFixed(1)} KB)
              </span>
            </div>

            <Alert>
              <AlertDescription>
                <strong>{csvData.length} rows</strong> will be uploaded with your custom field mappings.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
                data-testid="button-upload"
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadMutation.isPending ? "Uploading..." : "Upload and Process"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStage("map")}
                disabled={uploadMutation.isPending}
              >
                Back to Mapping
              </Button>
            </div>

            {(uploadMutation.isPending || uploadStatus === "processing" || uploadStatus === "pending") && (
              <div className="space-y-2">
                <Progress value={uploadProgress} data-testid="progress-upload" />
                <p className="text-sm text-muted-foreground" data-testid="text-processing">
                  Processing contacts... {uploadProgress}% complete
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {uploadResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Upload Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`grid ${updateMode ? 'grid-cols-4' : 'grid-cols-3'} gap-4 mb-4`}>
              <div className="p-4 bg-secondary rounded-md">
                <div className="text-sm text-muted-foreground">Total Rows</div>
                <div className="text-2xl font-bold" data-testid="text-total">
                  {uploadResult.total}
                </div>
              </div>
              <div className="p-4 bg-primary/10 rounded-md">
                <div className="text-sm text-muted-foreground">Created</div>
                <div className="text-2xl font-bold text-primary" data-testid="text-created">
                  {uploadResult.created || 0}
                </div>
              </div>
              {updateMode && (
                <div className="p-4 bg-green-500/10 rounded-md">
                  <div className="text-sm text-muted-foreground">Updated</div>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-updated">
                    {uploadResult.updated || 0}
                  </div>
                </div>
              )}
              <div className="p-4 bg-destructive/10 rounded-md">
                <div className="text-sm text-muted-foreground">Skipped</div>
                <div className="text-2xl font-bold text-destructive" data-testid="text-skipped">
                  {uploadResult.skipped || 0}
                </div>
              </div>
            </div>

            {uploadResult.updatedContacts && uploadResult.updatedContacts.length > 0 && (
              <div className="space-y-2 mb-4">
                <h4 className="font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Updated Contacts ({uploadResult.updatedContacts.length})
                </h4>
                <div className="max-h-60 overflow-y-auto space-y-1 border rounded-md p-2" data-testid="container-updated-contacts">
                  {uploadResult.updatedContacts.map((contact: any, i: number) => (
                    <div key={i} className="text-sm bg-green-500/10 p-2 rounded border border-green-500/20">
                      <div className="font-medium">{contact.fullName}</div>
                      {contact.email && (
                        <div className="text-xs text-muted-foreground">{contact.email}</div>
                      )}
                      {contact.accountName && (
                        <div className="text-xs text-muted-foreground">Company: {contact.accountName}</div>
                      )}
                      <div className="text-xs text-green-700 mt-1">
                        Updated: {contact.fieldsUpdated.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Errors ({uploadResult.errors.length})
                </h4>
                <div className="max-h-60 overflow-y-auto space-y-1" data-testid="container-errors">
                  {uploadResult.errors.map((error: string, i: number) => (
                    <div key={i} className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => navigate(`/verification/${campaignId}/console`)}
                data-testid="button-start-verification"
              >
                Start Verification
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFile(null);
                  setUploadResult(null);
                  setStage("select");
                  setCsvHeaders([]);
                  setCsvData([]);
                  setFieldMappings([]);
                }}
                data-testid="button-upload-more"
              >
                Upload More
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Custom Field Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Custom Field</DialogTitle>
            <DialogDescription>
              Create a new custom {createFieldEntity} field and map column "{createFieldForColumn}" to it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="field-key">Field Key*</Label>
              <Input
                id="field-key"
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="e.g., custom_field_name"
                data-testid="input-field-key"
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier for this field (lowercase, numbers, underscores only)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="field-label">Display Label*</Label>
              <Input
                id="field-label"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                placeholder="e.g., Custom Field Name"
                data-testid="input-field-label"
              />
              <p className="text-xs text-muted-foreground">
                Human-readable name shown in the UI
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="field-type">Field Type*</Label>
              <Select value={newFieldType} onValueChange={(value: any) => setNewFieldType(value)}>
                <SelectTrigger id="field-type" data-testid="select-field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateCustomField}
              disabled={!newFieldKey || !newFieldLabel || isCreating}
              data-testid="button-create-field"
            >
              {isCreating ? "Creating..." : "Create & Map"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
