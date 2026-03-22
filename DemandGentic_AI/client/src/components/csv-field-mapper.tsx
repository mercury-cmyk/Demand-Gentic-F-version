import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Sparkles, ArrowRight, CheckCircle2, AlertTriangle, Plus, Save, BookmarkCheck, Trash2, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CustomFieldDefinition, CsvMappingTemplate } from "@shared/schema";
import { ACCOUNT_FIELD_LABELS, ACCOUNT_ADDRESS_LABELS, CONTACT_FIELD_LABELS, CONTACT_ADDRESS_LABELS } from "@shared/field-labels";

interface FieldMapping {
  csvColumn: string;
  targetField: string | null;
  targetEntity: "contact" | "account" | null;
}

interface CSVFieldMapperProps {
  csvHeaders: string[];
  sampleData: string[][];
  onMappingComplete: (mapping: FieldMapping[]) => void;
  onCancel: () => void;
}

interface AiMappingSuggestion {
  csvColumn: string;
  targetField: string | null;
  targetEntity: "contact" | "account" | null;
  confidence: number;
  rationale: string;
}

// Define base/standard fields for Contact and Account (Pivotal B2B Standard Template Compatible)
const BASE_CONTACT_FIELDS = [
  { value: "researchDate", label: CONTACT_FIELD_LABELS.researchDate },
  { value: "fullName", label: CONTACT_FIELD_LABELS.fullName },
  { value: "firstName", label: CONTACT_FIELD_LABELS.firstName },
  { value: "lastName", label: CONTACT_FIELD_LABELS.lastName },
  { value: "jobTitle", label: CONTACT_FIELD_LABELS.jobTitle },
  { value: "department", label: CONTACT_FIELD_LABELS.department },
  { value: "seniorityLevel", label: CONTACT_FIELD_LABELS.seniorityLevel },
  { value: "list", label: CONTACT_FIELD_LABELS.list },
  { value: "linkedinUrl", label: CONTACT_FIELD_LABELS.linkedinUrl },
  { value: "email", label: CONTACT_FIELD_LABELS.email },
  { value: "emailVerificationStatus", label: CONTACT_FIELD_LABELS.emailVerificationStatus },
  { value: "emailAiConfidence", label: CONTACT_FIELD_LABELS.emailAiConfidence },
  { value: "directPhone", label: CONTACT_FIELD_LABELS.directPhone },
  { value: "phoneAiConfidence", label: CONTACT_FIELD_LABELS.phoneAiConfidence },
  { value: "mobilePhone", label: CONTACT_FIELD_LABELS.mobilePhone },
  { value: "city", label: CONTACT_ADDRESS_LABELS.city },
  { value: "state", label: CONTACT_ADDRESS_LABELS.state },
  { value: "stateAbbr", label: CONTACT_ADDRESS_LABELS.stateAbbr },
  { value: "postalCode", label: CONTACT_ADDRESS_LABELS.postalCode },
  { value: "country", label: CONTACT_ADDRESS_LABELS.country },
  { value: "contactLocation", label: CONTACT_ADDRESS_LABELS.contactLocation },
  { value: "formerPosition", label: CONTACT_FIELD_LABELS.formerPosition },
  { value: "timeInCurrentPosition", label: CONTACT_FIELD_LABELS.timeInCurrentPosition },
  { value: "timeInCurrentCompany", label: CONTACT_FIELD_LABELS.timeInCurrentCompany },
  { value: "phoneExtension", label: CONTACT_FIELD_LABELS.phoneExtension },
  { value: "address", label: CONTACT_ADDRESS_LABELS.address },
  { value: "consentBasis", label: CONTACT_FIELD_LABELS.consentBasis },
  { value: "consentSource", label: CONTACT_FIELD_LABELS.consentSource },
  { value: "emailStatus", label: CONTACT_FIELD_LABELS.emailStatus },
  { value: "phoneStatus", label: CONTACT_FIELD_LABELS.phoneStatus },
];

const BASE_ACCOUNT_FIELDS = [
  { value: "name", label: ACCOUNT_FIELD_LABELS.name },
  { value: "companyLocation", label: ACCOUNT_ADDRESS_LABELS.companyLocation },
  { value: "hqStreet1", label: ACCOUNT_ADDRESS_LABELS.hqStreet1 },
  { value: "hqStreet2", label: ACCOUNT_ADDRESS_LABELS.hqStreet2 },
  { value: "hqStreet3", label: ACCOUNT_ADDRESS_LABELS.hqStreet3 },
  { value: "hqCity", label: ACCOUNT_ADDRESS_LABELS.hqCity },
  { value: "hqState", label: ACCOUNT_ADDRESS_LABELS.hqState },
  { value: "hqStateAbbr", label: ACCOUNT_ADDRESS_LABELS.hqStateAbbr },
  { value: "hqPostalCode", label: ACCOUNT_ADDRESS_LABELS.hqPostalCode },
  { value: "hqCountry", label: ACCOUNT_ADDRESS_LABELS.hqCountry },
  { value: "annualRevenue", label: ACCOUNT_FIELD_LABELS.annualRevenue },
  { value: "minAnnualRevenue", label: ACCOUNT_FIELD_LABELS.minAnnualRevenue },
  { value: "maxAnnualRevenue", label: ACCOUNT_FIELD_LABELS.maxAnnualRevenue },
  { value: "revenueRange", label: ACCOUNT_FIELD_LABELS.revenueRange },
  { value: "employeesSizeRange", label: ACCOUNT_FIELD_LABELS.employeesSizeRange },
  { value: "staffCount", label: ACCOUNT_FIELD_LABELS.staffCount },
  { value: "minEmployeesSize", label: ACCOUNT_FIELD_LABELS.minEmployeesSize },
  { value: "maxEmployeesSize", label: ACCOUNT_FIELD_LABELS.maxEmployeesSize },
  { value: "description", label: ACCOUNT_FIELD_LABELS.description },
  { value: "list", label: ACCOUNT_FIELD_LABELS.list },
  { value: "domain", label: ACCOUNT_FIELD_LABELS.domain },
  { value: "yearFounded", label: ACCOUNT_FIELD_LABELS.yearFounded },
  { value: "industryStandardized", label: ACCOUNT_FIELD_LABELS.industryStandardized },
  { value: "linkedinUrl", label: ACCOUNT_FIELD_LABELS.linkedinUrl },
  { value: "linkedinId", label: ACCOUNT_FIELD_LABELS.linkedinId },
  { value: "techStack", label: ACCOUNT_FIELD_LABELS.techStack },
  { value: "sicCode", label: ACCOUNT_FIELD_LABELS.sicCode },
  { value: "naicsCode", label: ACCOUNT_FIELD_LABELS.naicsCode },
  { value: "mainPhone", label: ACCOUNT_FIELD_LABELS.mainPhone },
  { value: "mainPhoneExtension", label: ACCOUNT_FIELD_LABELS.mainPhoneExtension },
  { value: "hqAddress", label: ACCOUNT_ADDRESS_LABELS.hqAddress },
];

export function CSVFieldMapper({
  csvHeaders,
  sampleData,
  onMappingComplete,
  onCancel,
}: CSVFieldMapperProps) {
  const [mappings, setMappings] = useState([]);
  const [autoMapped, setAutoMapped] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createFieldForColumn, setCreateFieldForColumn] = useState(null);
  const [createFieldEntity, setCreateFieldEntity] = useState(null);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [isCreating, setIsCreating] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [autoMatchedTemplate, setAutoMatchedTemplate] = useState(null);
  const [hasInitializedMappings, setHasInitializedMappings] = useState(false);
  const [aiAutoApplied, setAiAutoApplied] = useState(false);
  const { toast } = useToast();

  // Fetch custom fields
  const { data: customFields, isLoading: customFieldsLoading } = useQuery({
    queryKey: ['/api/custom-fields'],
  });

  // Fetch CSV mapping templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/csv-mapping-templates'],
  });

  // Debug log for templates
  console.log('[CSVFieldMapper] Templates loaded:', templates.length, 'templates:', templates.map(t => t.name), 'loading:', templatesLoading);

  // Auto-match best template for current CSV headers
  const { data: bestMatch } = useQuery({
    queryKey: ['/api/csv-mapping-templates/find-best-match', csvHeaders],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/csv-mapping-templates/find-best-match', { csvHeaders });
      return res.json();
    },
    enabled: csvHeaders.length > 0,
  });

  const { data: aiMappingData, isLoading: aiSuggestionsLoading } = useQuery({
    queryKey: ['/api/csv-ai-mapping/suggest', csvHeaders, sampleData.slice(0, 20)],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/csv-ai-mapping/suggest', {
        csvHeaders,
        csvData: sampleData.slice(0, 20),
      });
      return res.json();
    },
    enabled: csvHeaders.length > 0 && sampleData.length > 0,
    retry: false,
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest('POST', '/api/csv-mapping-templates', {
        name,
        csvHeaders,
        mappings: mappings.map(m => ({
          csvColumn: m.csvColumn,
          targetField: m.targetField,
          targetEntity: m.targetEntity,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/csv-mapping-templates'] });
      toast({
        title: "Template saved",
        description: "Your CSV mapping template has been saved successfully.",
      });
      setShowSaveTemplateDialog(false);
      setTemplateName("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save template",
        variant: "destructive",
      });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/csv-mapping-templates/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/csv-mapping-templates'] });
      toast({
        title: "Template deleted",
        description: "The template has been removed.",
      });
    },
  });

  // Record template usage mutation
  const recordTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/csv-mapping-templates/${id}/use`);
      return res.json();
    },
  });

  // Build complete field lists with custom fields
  const CONTACT_FIELDS = [
    ...BASE_CONTACT_FIELDS,
    ...(customFields?.filter(f => f.entityType === 'contact' && f.active).map(f => ({
      value: `custom_${f.fieldKey}`,
      label: `${f.displayLabel} (Custom)`,
    })) || []),
  ];

  const ACCOUNT_FIELDS = [
    ...BASE_ACCOUNT_FIELDS,
    ...(customFields?.filter(f => f.entityType === 'account' && f.active).map(f => ({
      value: `custom_${f.fieldKey}`,
      label: `${f.displayLabel} (Custom)`,
    })) || []),
  ];

  const aiSuggestionLookup = Object.fromEntries(
    (aiMappingData?.suggestions || []).map((suggestion) => [suggestion.csvColumn, suggestion])
  ) as Record;

  // Auto-mapping logic based on column name similarity
  const autoMapColumn = (csvColumn: string): FieldMapping => {
    const normalized = csvColumn.toLowerCase().replace(/[_\s-]/g, "");

    // Check for account fields (account_ prefix)
    if (csvColumn.toLowerCase().startsWith("account_")) {
      const fieldName = csvColumn.substring(8); // Remove "account_" prefix
      const normalizedField = fieldName.toLowerCase().replace(/[_\s-]/g, "");

      for (const field of ACCOUNT_FIELDS) {
        const fieldNormalized = field.value.toLowerCase();
        if (normalizedField === fieldNormalized || normalizedField.includes(fieldNormalized) || fieldNormalized.includes(normalizedField)) {
          return {
            csvColumn,
            targetField: field.value,
            targetEntity: "account",
          };
        }
      }
    }

    // Check for contact fields
    for (const field of CONTACT_FIELDS) {
      const fieldNormalized = field.value.toLowerCase();
      if (normalized === fieldNormalized || normalized.includes(fieldNormalized) || fieldNormalized.includes(normalized)) {
        return {
          csvColumn,
          targetField: field.value,
          targetEntity: "contact",
        };
      }
    }

    // Special case mappings for Pivotal B2B Standard Template + Common variations
    const specialMappings: Record = {
      // Contact Pivotal Template Exact Matches
      "researchdate": { csvColumn, targetField: "researchDate", targetEntity: "contact" },
      "contactfullname": { csvColumn, targetField: "fullName", targetEntity: "contact" },
      "firstname": { csvColumn, targetField: "firstName", targetEntity: "contact" },
      "lastname": { csvColumn, targetField: "lastName", targetEntity: "contact" },
      "contactliprofileurl": { csvColumn, targetField: "linkedinUrl", targetEntity: "contact" },
      "email1": { csvColumn, targetField: "email", targetEntity: "contact" },
      "email": { csvColumn, targetField: "email", targetEntity: "contact" },
      "email1validation": { csvColumn, targetField: "emailVerificationStatus", targetEntity: "contact" },
      "email1totalai": { csvColumn, targetField: "emailAiConfidence", targetEntity: "contact" },
      "contactphone1": { csvColumn, targetField: "directPhone", targetEntity: "contact" },
      "contactphone1totalai": { csvColumn, targetField: "phoneAiConfidence", targetEntity: "contact" },
      "contactmobilephone": { csvColumn, targetField: "mobilePhone", targetEntity: "contact" },
      "contactcity": { csvColumn, targetField: "city", targetEntity: "contact" },
      "contactstate": { csvColumn, targetField: "state", targetEntity: "contact" },
      "contactstateabbr": { csvColumn, targetField: "stateAbbr", targetEntity: "contact" },
      "contactpostcode": { csvColumn, targetField: "postalCode", targetEntity: "contact" },
      "contactcountry": { csvColumn, targetField: "country", targetEntity: "contact" },
      "contactlocation": { csvColumn, targetField: "contactLocation", targetEntity: "contact" },
      "formerposition": { csvColumn, targetField: "formerPosition", targetEntity: "contact" },
      "timeincurrentposition": { csvColumn, targetField: "timeInCurrentPosition", targetEntity: "contact" },
      "timeincurrentcompany": { csvColumn, targetField: "timeInCurrentCompany", targetEntity: "contact" },
      "title": { csvColumn, targetField: "jobTitle", targetEntity: "contact" },
      "jobtitle": { csvColumn, targetField: "jobTitle", targetEntity: "contact" },
      "department": { csvColumn, targetField: "department", targetEntity: "contact" },
      "seniority": { csvColumn, targetField: "seniorityLevel", targetEntity: "contact" },

      // Account Pivotal Template Exact Matches
      "companynamecleaned": { csvColumn, targetField: "name", targetEntity: "account" },
      "companyname": { csvColumn, targetField: "name", targetEntity: "account" },
      "company": { csvColumn, targetField: "name", targetEntity: "account" },
      "companylocation": { csvColumn, targetField: "companyLocation", targetEntity: "account" },
      "companystreet1": { csvColumn, targetField: "hqStreet1", targetEntity: "account" },
      "companystreet2": { csvColumn, targetField: "hqStreet2", targetEntity: "account" },
      "companystreet3": { csvColumn, targetField: "hqStreet3", targetEntity: "account" },
      "companycity": { csvColumn, targetField: "hqCity", targetEntity: "account" },
      "companystate": { csvColumn, targetField: "hqState", targetEntity: "account" },
      "companystateabbr": { csvColumn, targetField: "hqStateAbbr", targetEntity: "account" },
      "companypostcode": { csvColumn, targetField: "hqPostalCode", targetEntity: "account" },
      "companycountry": { csvColumn, targetField: "hqCountry", targetEntity: "account" },
      "companyannualrevenue": { csvColumn, targetField: "annualRevenue", targetEntity: "account" },
      "companyrevenuerange": { csvColumn, targetField: "revenueRange", targetEntity: "account" },
      "companystaffcountrange": { csvColumn, targetField: "employeesSizeRange", targetEntity: "account" },
      "staffcount": { csvColumn, targetField: "staffCount", targetEntity: "account" },
      "companydescription": { csvColumn, targetField: "description", targetEntity: "account" },
      "companywebsitedomain": { csvColumn, targetField: "domain", targetEntity: "account" },
      "companyfoundeddate": { csvColumn, targetField: "yearFounded", targetEntity: "account" },
      "companyindustry": { csvColumn, targetField: "industryStandardized", targetEntity: "account" },
      "companyliprofileurl": { csvColumn, targetField: "linkedinUrl", targetEntity: "account" },
      "companylinkedinid": { csvColumn, targetField: "linkedinId", targetEntity: "account" },
      "webtechnologies": { csvColumn, targetField: "techStack", targetEntity: "account" },
      "mainphone": { csvColumn, targetField: "mainPhone", targetEntity: "account" },
      "siccode": { csvColumn, targetField: "sicCode", targetEntity: "account" },
      "naicscode": { csvColumn, targetField: "naicsCode", targetEntity: "account" },

      // Missing aliases requested by user
      "companyphone1": { csvColumn, targetField: "mainPhone", targetEntity: "account" },
      "accountphone": { csvColumn, targetField: "mainPhone", targetEntity: "account" },
      "accounthqphone": { csvColumn, targetField: "mainPhone", targetEntity: "account" }, 
      "hqphone": { csvColumn, targetField: "mainPhone", targetEntity: "account" },  
      "companystaffcount": { csvColumn, targetField: "staffCount", targetEntity: "account" },
      "pastjob": { csvColumn, targetField: "formerPosition", targetEntity: "contact" },
      "timeinrole": { csvColumn, targetField: "timeInCurrentPosition", targetEntity: "contact" },
      "timeatcompany": { csvColumn, targetField: "timeInCurrentCompany", targetEntity: "contact" },

      // Generic fallbacks
      "name": { csvColumn, targetField: "fullName", targetEntity: "contact" },
      "organization": { csvColumn, targetField: "name", targetEntity: "account" },
      "phone": { csvColumn, targetField: "directPhone", targetEntity: "contact" },
      "mobile": { csvColumn, targetField: "mobilePhone", targetEntity: "contact" },
      "cell": { csvColumn, targetField: "mobilePhone", targetEntity: "contact" },
      "position": { csvColumn, targetField: "jobTitle", targetEntity: "contact" },
      "role": { csvColumn, targetField: "jobTitle", targetEntity: "contact" },
      "city": { csvColumn, targetField: "city", targetEntity: "contact" },
      "state": { csvColumn, targetField: "state", targetEntity: "contact" },
      "country": { csvColumn, targetField: "country", targetEntity: "contact" },
      "website": { csvColumn, targetField: "domain", targetEntity: "account" },
      "url": { csvColumn, targetField: "domain", targetEntity: "account" },
      "domain": { csvColumn, targetField: "domain", targetEntity: "account" },
    };

    if (specialMappings[normalized]) {
      return specialMappings[normalized];
    }

    return {
      csvColumn,
      targetField: null,
      targetEntity: null,
    };
  };

  useEffect(() => {
    if (customFields === undefined || hasInitializedMappings || bestMatch === undefined || aiSuggestionsLoading) {
      return;
    }

    // Auto-apply best matched template if available
    if (bestMatch.template) {
      const template = bestMatch.template;
      setAutoMatchedTemplate(template);
      
      // Apply template mappings
      const templateMappings = csvHeaders.map(csvColumn => {
        // Normalize column name for matching (case-insensitive, trimmed)
        const normalizedCsvColumn = csvColumn.trim().toLowerCase();
        const templateMapping = (template.mappings as any[]).find(
          (m: any) => m.csvColumn.trim().toLowerCase() === normalizedCsvColumn
        );
        if (templateMapping) {
          return {
            csvColumn,
            targetField: templateMapping.targetField,
            targetEntity: templateMapping.targetEntity,
          };
        }
        // Fall back to auto-mapping if no template match
        return autoMapColumn(csvColumn);
      });
      
      setMappings(templateMappings);
      setAutoMapped(true);
      setAiAutoApplied(false);
      setHasInitializedMappings(true);
      
      // Record usage
      recordTemplateMutation.mutate(template.id);
      
      toast({
        title: "Template applied",
        description: `Auto-applied mapping template "${template.name}" (${bestMatch.matchScore}% match)`,
      });
      return;
    }

    const initialMappings = csvHeaders.map(csvColumn => {
      const autoMapping = autoMapColumn(csvColumn);
      const aiSuggestion = aiSuggestionLookup[csvColumn];

      if (
        autoMapping.targetField === null &&
        aiSuggestion?.targetField &&
        aiSuggestion.targetEntity &&
        aiSuggestion.confidence >= 0.75
      ) {
        return {
          csvColumn,
          targetField: aiSuggestion.targetField,
          targetEntity: aiSuggestion.targetEntity,
        };
      }

      return autoMapping;
    });

    const appliedAi = initialMappings.some(mapping => {
      const autoMapping = autoMapColumn(mapping.csvColumn);
      const aiSuggestion = aiSuggestionLookup[mapping.csvColumn];
      return (
        autoMapping.targetField === null &&
        aiSuggestion?.targetField === mapping.targetField &&
        aiSuggestion.targetEntity === mapping.targetEntity &&
        aiSuggestion.confidence >= 0.75
      );
    });

    setMappings(initialMappings);
    setAutoMapped(initialMappings.some(m => m.targetField !== null));
    setAiAutoApplied(appliedAi);
    setHasInitializedMappings(true);
  }, [aiSuggestionLookup, aiSuggestionsLoading, bestMatch, csvHeaders, customFields, hasInitializedMappings]);

  // Show loading state while custom fields are being fetched
  if (customFieldsLoading) {
    return (
      
        Loading field mappings...
      
    );
  }

  const updateMapping = (csvColumn: string, targetField: string | null, targetEntity: "contact" | "account" | null) => {
    setMappings(prev =>
      prev.map(m =>
        m.csvColumn === csvColumn
          ? { ...m, targetField, targetEntity }
          : m
      )
    );
  };

  // Manually apply a saved template
  const applyTemplate = (template: CsvMappingTemplate) => {
    const templateMappings = csvHeaders.map(csvColumn => {
      const normalizedCsvColumn = csvColumn.trim().toLowerCase();
      const templateMapping = (template.mappings as any[]).find(
        (m: any) => m.csvColumn.trim().toLowerCase() === normalizedCsvColumn
      );
      if (templateMapping) {
        return {
          csvColumn,
          targetField: templateMapping.targetField,
          targetEntity: templateMapping.targetEntity,
        };
      }
      return autoMapColumn(csvColumn);
    });

    setMappings(templateMappings);
    setAutoMatchedTemplate(template);
    recordTemplateMutation.mutate(template.id);

    toast({
      title: "Template applied",
      description: `Applied mapping template "${template.name}"`,
    });
  };

  const handleApplyMapping = () => {
    onMappingComplete(mappings);
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
        updateMapping(createFieldForColumn, `custom_${newFieldKey}`, createFieldEntity);
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

  const mappedCount = mappings.filter(m => m.targetField !== null).length;
  const unmappedCount = mappings.length - mappedCount;
  const unmappedColumns = mappings.filter(m => m.targetField === null).map(m => m.csvColumn);
  const hasAnyAiSuggestions = (aiMappingData?.suggestions?.length || 0) > 0;
  const getAiConfidenceAppearance = (confidence: number) => {
    if (confidence >= 0.9) {
      return "bg-emerald-100 text-emerald-800";
    }
    if (confidence >= 0.75) {
      return "bg-sky-100 text-sky-800";
    }
    if (confidence >= 0.5) {
      return "bg-amber-100 text-amber-800";
    }
    return "bg-slate-100 text-slate-700";
  };

  return (
    
      {aiSuggestionsLoading && (
        
          
          
            AI is analyzing your sample rows to improve field matching.
          
        
      )}

      {autoMatchedTemplate && (
        
          
          
            Applied saved mapping template "{autoMatchedTemplate.name}" ({bestMatch?.matchScore}% match). Review and adjust as needed.
          
        
      )}

      {aiAutoApplied && !autoMatchedTemplate && (
        
          
          
            AI reasoning filled in low-confidence or previously unmapped columns. Review the confidence badges before importing.
          
        
      )}
      
      {autoMapped && !autoMatchedTemplate && (
        
          
          
            We automatically mapped {mappedCount} field(s) based on column names. Please review and adjust as needed.
          
        
      )}

      {hasAnyAiSuggestions && !aiAutoApplied && !autoMatchedTemplate && !aiSuggestionsLoading && (
        
          
          
            AI suggestions are available on individual columns as confidence badges and rationale.
          
        
      )}
      
      {unmappedCount > 0 && (
        
          
          Warning: {unmappedCount} Unmapped Column{unmappedCount > 1 ? 's' : ''}
          
            The following CSV columns are not mapped and will be skipped during import:
            
              {unmappedColumns.map(col => (
                
                  {col}
                
              ))}
            
            Map them above or select "Skip Column" to dismiss this warning.
          
        
      )}

      {/* Template selector */}
      {templates.length > 0 && (
        
          
          Apply saved template:
          
            
              
                Select a template...
                
              
            
            
              {templates.map((template) => (
                 applyTemplate(template)}
                >
                  {template.name}
                
              ))}
            
          
        
      )}

      
        
          Map CSV Columns to Fields
          
            Map each CSV column to the corresponding Contact or Account field
          
        
        
          
            {mappedCount} mapped
          
          {unmappedCount > 0 && (
            
              {unmappedCount} unmapped
            
          )}
        
      

      
        
          {mappings.map((mapping, idx) => {
            const aiSuggestion = aiSuggestionLookup[mapping.csvColumn];

            return (
            
              
                
                  
                    {mapping.csvColumn}
                  
                  {aiSuggestion?.targetField && (
                    
                      AI {Math.round(aiSuggestion.confidence * 100)}%
                    
                  )}
                  {sampleData[0] && (
                    
                      e.g., "{sampleData[0][idx]}"
                    
                  )}
                

                {aiSuggestion?.rationale && (
                  
                    AI: {aiSuggestion.rationale}
                  
                )}

                
                  

                   {
                      if (value === "skip") {
                        updateMapping(mapping.csvColumn, null, null);
                      } else {
                        updateMapping(mapping.csvColumn, mapping.targetField, value as "contact" | "account");
                      }
                    }}
                  >
                    
                      
                    
                    
                      Contact
                      Account
                      Skip Column
                    
                  

                  {mapping.targetEntity && (mapping.targetEntity === "contact" || mapping.targetEntity === "account") && (
                     {
                        if (value === "__CREATE_NEW__") {
                          openCreateDialog(mapping.csvColumn, mapping.targetEntity!);
                        } else {
                          updateMapping(mapping.csvColumn, value, mapping.targetEntity);
                        }
                      }}
                    >
                      
                        
                      
                      
                        
                          
                            
                            Create New Custom Field
                          
                        
                        
                        {(mapping.targetEntity === "contact" ? CONTACT_FIELDS : ACCOUNT_FIELDS).map((field) => (
                          
                            {field.label}
                          
                        ))}
                      
                    
                  )}
                
              

              {mapping.targetField && (
                
              )}
            
          )})}
        
      

      
        
          
            Cancel
          
           setShowSaveTemplateDialog(true)}
            disabled={mappedCount === 0}
            data-testid="button-save-template"
          >
            
            Save as Template
          
        
        
          Continue with Mapping
        
      

      {/* Save Template Dialog */}
      
        
          
            Save Mapping Template
            
              Save your current column mappings as a template for future use. The template will automatically be applied when you upload CSV files with similar headers.
            
          

          
            
              Template Name*
               setTemplateName(e.target.value)}
                placeholder="e.g., Standard Import Format"
                data-testid="input-template-name"
              />
              
                A descriptive name to help you identify this template later
              
            

            
              Current Mappings
              
                
                  {mappings
                    .filter(m => m.targetField !== null)
                    .map(m => (
                      
                        {m.csvColumn}
                        
                        
                          {m.targetEntity === "contact" 
                            ? CONTACT_FIELDS.find(f => f.value === m.targetField)?.label
                            : ACCOUNT_FIELDS.find(f => f.value === m.targetField)?.label
                          }
                        
                      
                    ))}
                
              
            
          

          
             {
                setShowSaveTemplateDialog(false);
                setTemplateName("");
              }}
              disabled={saveTemplateMutation.isPending}
            >
              Cancel
            
             saveTemplateMutation.mutate(templateName)}
              disabled={!templateName || saveTemplateMutation.isPending}
              data-testid="button-save-template-confirm"
            >
              {saveTemplateMutation.isPending ? "Saving..." : "Save Template"}
            
          
        
      

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