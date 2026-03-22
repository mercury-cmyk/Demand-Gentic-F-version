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
  
  const mappings: Record = {
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
  const [stage, setStage] = useState("select");
  const [file, setFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvData, setCsvData] = useState([]);
  const [rawCSVContent, setRawCSVContent] = useState("");
  const [fieldMappings, setFieldMappings] = useState([]);
  const [uploadResult, setUploadResult] = useState(null);
  const [updateMode, setUpdateMode] = useState(false);
  const [uploadJobId, setUploadJobId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [loadedTemplate, setLoadedTemplate] = useState(null);
  const [mappingSource, setMappingSource] = useState("auto");
  const [aiSuggestions, setAiSuggestions] = useState>({});
  const [isLoadingAiSuggestions, setIsLoadingAiSuggestions] = useState(false);
  
  // Custom field creation state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createFieldForColumn, setCreateFieldForColumn] = useState(null);
  const [createFieldEntity, setCreateFieldEntity] = useState(null);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [isCreating, setIsCreating] = useState(false);

  const { data: campaign } = useQuery({
    queryKey: ["/api/verification-campaigns", campaignId],
  });

  // Fetch custom fields
  const { data: customFields } = useQuery({
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
            const suggestionsMap: Record = {};
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

  const handleFileSelect = (e: React.ChangeEvent) => {
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
    
      
         navigate("/verification/campaigns")}
          data-testid="button-back"
        >
          
          Back
        
        
          
            Upload Contacts
          
          
            Campaign: {(campaign as any)?.name}
          
        
      

      
        
          CSV Format Guidelines
          Accepted column headers and data requirements
        
        
          
            
              Contact Information (at least name required)
              
                • fullName or name - Full contact name
                • firstName - First name
                • lastName - Last name
                • title or jobTitle - Job title
                • email or emailAddress - Email address
                • phone or phoneNumber - Phone number
                • mobile or mobileNumber - Mobile number
                • linkedin or linkedinUrl - LinkedIn profile URL
              
            

            
              Contact Location
              
                • city - Contact city
                • state - Contact state
                • country - Contact country
                • postalCode or zip - Postal/ZIP code
              
            

            
              Company/Account Information
              
                • companyName or company or accountName - Company name
                • domain or companyDomain - Company website domain
                • hqCity - Company HQ city
                • hqState - Company HQ state
                • hqCountry - Company HQ country
              
            

            
              Additional Fields
              
                • cavId - CAV ID for suppression matching
                • cavUserId - CAV User ID for suppression matching
                • sourceType or source - "Client_Provided" or "New_Sourced"
              
            

            
              
                Note: Column headers are case-insensitive and spaces/special characters are ignored. 
                After upload, contacts are automatically evaluated for eligibility and checked against suppression lists.
              
            
          
        
      

      {stage === "select" && (
        
          
            Upload File
            Select your CSV file to begin
          
          
            
              
                 setUpdateMode(checked === true)}
                  data-testid="checkbox-update-mode"
                />
                
                  Update Existing Contacts
                  
                    Match by Name + Country + Company and update CAV IDs or other fields
                  
                
              

              
                
                  
                  Select CSV File
                  
                
              
            
            
            
              
                {updateMode ? (
                  <>
                    Update Mode: Matching criteria (in order):
                    
                      Exact email match (strongest signal)
                      Name + Country + Company (all three required)
                      If multiple matches found, will create new instead of updating
                    
                    Update rules (strict):
                    
                      CSV has CAV IDs? → ONLY CAV ID fields updated
                      DB has CAV IDs (CSV doesn't)? → ALL non-CAV fields updated
                      Neither has CAV IDs? → ALL fields updated
                      Empty CSV values never overwrite existing data
                    
                  
                ) : (
                  <>
                    Next Step: After selecting a file, you'll be able to map CSV columns to contact fields manually.
                  
                )}
              
            
          
        
      )}

      {stage === "map" && file && (
        
          
            Map CSV Columns to Fields
            
              Match your CSV columns to verification contact fields. Auto-mapping has been applied based on column names.
            
          
          
            {isLoadingAiSuggestions && (
              
                
                  
                  AI Analysis: Analyzing your CSV data to suggest intelligent field mappings...
                
              
            )}
            
            {mappingSource === "ai" && !isLoadingAiSuggestions && (
              
                
                
                  AI-Powered Mapping: High-confidence field mappings applied using AI analysis of your data. Hover over confidence badges to see reasoning. You can still adjust any mappings below.
                
              
            )}
            
            {mappingSource === "template" && loadedTemplate && (
              
                
                
                  Template Applied: Using saved mapping "{loadedTemplate.name}" - matching columns have been automatically mapped. You can still adjust any mappings below.
                
              
            )}
            
            {mappingSource === "auto" && !isLoadingAiSuggestions && (
              
                
                  Auto-Mapping: Fields marked in blue were auto-mapped based on column names. 
                  {Object.keys(aiSuggestions).length > 0 && " AI suggestions are available - check confidence scores below."}
                  {" "}You can change any mapping, skip unmapped columns, or create custom fields.
                
              
            )}
            
            {mappingSource === "manual" && (
              
                
                  Manual Mapping: You've customized the mappings. These changes will be saved as a new template for future uploads.
                
              
            )}

            
              
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
                    
                      
                        
                          
                            {header}
                          
                          {aiSuggestion && aiSuggestion.confidence > 0 && (
                            
                              {getConfidenceBadge(aiSuggestion.confidence).label} {Math.round(aiSuggestion.confidence * 100)}%
                            
                          )}
                        
                        {csvData.length > 0 && csvData[0][index] && (
                          
                            Sample: {csvData[0][index]?.slice(0, 40)}...
                          
                        )}
                        {aiSuggestion && aiSuggestion.rationale && (
                          
                            💡 AI: {aiSuggestion.rationale.slice(0, 80)}...
                          
                        )}
                      
                      
                         m.csvColumn === header)?.targetField || autoMapped || "skip"}
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
                          
                            
                          
                          
                            Skip Column
                            
                            
                              Contact Info
                            
                            Full Name
                            First Name
                            Last Name
                            Job Title
                            Email
                            Phone
                            Mobile
                            LinkedIn URL
                            
                            
                              Contact Address
                            
                            Address Line 1
                            Address Line 2
                            Address Line 3
                            City
                            State
                            Country
                            Postal Code
                            
                            {contactCustomFields.length > 0 && (
                              <>
                                
                                  Contact Custom Fields
                                
                                {contactCustomFields.map(field => (
                                  
                                    {field.displayLabel}
                                  
                                ))}
                              
                            )}
                            
                            
                              
                                
                                Create Contact Custom Field
                              
                            
                            
                            
                              Company Info
                            
                            Company Name
                            Domain
                            HQ Phone
                            HQ Address 1
                            HQ Address 2
                            HQ Address 3
                            HQ City
                            HQ State
                            HQ Postal Code
                            HQ Country
                            
                            {accountCustomFields.length > 0 && (
                              <>
                                
                                  Account Custom Fields
                                
                                {accountCustomFields.map(field => (
                                  
                                    {field.displayLabel}
                                  
                                ))}
                              
                            )}
                            
                            
                              
                                
                                Create Account Custom Field
                              
                            
                            
                            
                              Other
                            
                            CAV ID
                            CAV User ID
                            Source Type
                          
                        
                      
                    
                  );
                })}
              
            

            
               handleMappingComplete(fieldMappings)}>
                Continue to Upload
              
               {
                  setStage("select");
                  setFile(null);
                  setCsvHeaders([]);
                  setCsvData([]);
                  setFieldMappings([]);
                }}
              >
                Cancel
              
            
          
        
      )}

      {stage === "upload" && file && (
        
          
            Ready to Upload
            Review and confirm your upload
          
          
            
              
              {file.name}
              
                ({(file.size / 1024).toFixed(1)} KB)
              
            

            
              
                {csvData.length} rows will be uploaded with your custom field mappings.
              
            

            
              
                
                {uploadMutation.isPending ? "Uploading..." : "Upload and Process"}
              
               setStage("map")}
                disabled={uploadMutation.isPending}
              >
                Back to Mapping
              
            

            {(uploadMutation.isPending || uploadStatus === "processing" || uploadStatus === "pending") && (
              
                
                
                  Processing contacts... {uploadProgress}% complete
                
              
            )}
          
        
      )}

      {uploadResult && (
        
          
            
              
              Upload Results
            
          
          
            
              
                Total Rows
                
                  {uploadResult.total}
                
              
              
                Created
                
                  {uploadResult.created || 0}
                
              
              {updateMode && (
                
                  Updated
                  
                    {uploadResult.updated || 0}
                  
                
              )}
              
                Skipped
                
                  {uploadResult.skipped || 0}
                
              
            

            {uploadResult.updatedContacts && uploadResult.updatedContacts.length > 0 && (
              
                
                  
                  Updated Contacts ({uploadResult.updatedContacts.length})
                
                
                  {uploadResult.updatedContacts.map((contact: any, i: number) => (
                    
                      {contact.fullName}
                      {contact.email && (
                        {contact.email}
                      )}
                      {contact.accountName && (
                        Company: {contact.accountName}
                      )}
                      
                        Updated: {contact.fieldsUpdated.join(', ')}
                      
                    
                  ))}
                
              
            )}

            {uploadResult.errors && uploadResult.errors.length > 0 && (
              
                
                  
                  Errors ({uploadResult.errors.length})
                
                
                  {uploadResult.errors.map((error: string, i: number) => (
                    
                      {error}
                    
                  ))}
                
              
            )}

            
               navigate(`/verification/${campaignId}/console`)}
                data-testid="button-start-verification"
              >
                Start Verification
              
               {
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
              
            
          
        
      )}

      {/* Create Custom Field Dialog */}
      
        
          
            Create Custom Field
            
              Create a new custom {createFieldEntity} field and map column "{createFieldForColumn}" to it.
            
          

          
            
              Field Key*
               setNewFieldKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="e.g., custom_field_name"
                data-testid="input-field-key"
              />
              
                Unique identifier for this field (lowercase, numbers, underscores only)
              
            

            
              Display Label*
               setNewFieldLabel(e.target.value)}
                placeholder="e.g., Custom Field Name"
                data-testid="input-field-label"
              />
              
                Human-readable name shown in the UI
              
            

            
              Field Type*
               setNewFieldType(value)}>
                
                  
                
                
                  Text
                  Number
                  Date
                  Boolean
                
              
            
          

          
             setShowCreateDialog(false)}
              disabled={isCreating}
            >
              Cancel
            
            
              {isCreating ? "Creating..." : "Create & Map"}
            
          
        
      
    
  );
}