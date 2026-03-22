import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, Download, AlertCircle, CheckCircle2, FileText, Plus, List } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  parseCSV,
  validateContactWithAccountRow,
  validateContactRow,
  csvRowToContactFromUnified,
  csvRowToAccountFromUnified,
  csvRowToContact,
  type ValidationError,
  downloadCSV,
  generateContactsWithAccountTemplate,
} from "@/lib/csv-utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CSVFieldMapper } from "@/components/csv-field-mapper";
import type { List as ListType } from "@shared/schema";

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

interface FieldMapping {
  csvColumn: string;
  targetField: string | null;
  targetEntity: "contact" | "account" | null;
}

type ImportStage = "upload" | "mapping" | "validate" | "preview" | "importing" | "complete";
type ImportExecutionMode = "background" | "browser_direct" | null;

const LARGE_FILE_THRESHOLD_BYTES = 5 * 1024 * 1024;
const PREVIEW_READ_BYTES = 2 * 1024 * 1024;
const PREVIEW_ROW_LIMIT = 25;

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export function CSVImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: CSVImportDialogProps) {
  const [stage, setStage] = useState("upload");
  const [file, setFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fieldMappings, setFieldMappings] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState({ success: 0, created: 0, updated: 0, failed: 0 });
  const [isPreviewOnly, setIsPreviewOnly] = useState(false);
  const [backgroundJobId, setBackgroundJobId] = useState(null);
  const [importStatusMessage, setImportStatusMessage] = useState("Preparing import...");
  const [importExecutionMode, setImportExecutionMode] = useState(null);
  const { toast } = useToast();

  // List selection state
  const [selectedListId, setSelectedListId] = useState("");
  const [isCreatingNewList, setIsCreatingNewList] = useState(false);
  const [newListName, setNewListName] = useState("");

  // Fetch available lists for selection
  const { data: existingLists = [], isLoading: listsLoading, error: listsError, refetch: refetchLists } = useQuery({
    queryKey: ['/api/lists'],
    enabled: open,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/lists");
      return res.json();
    },
  });

  // Filter to only show contact lists
  const contactLists = existingLists.filter(list => list.entityType === 'contact');

  const getEffectiveFieldMappings = () =>
    fieldMappings.filter(
      (mapping): mapping is FieldMapping & { targetField: string; targetEntity: "contact" | "account" } =>
        Boolean(mapping.targetField && mapping.targetEntity),
    );

  const loadParsedCSVFromFile = async (selectedFile: File): Promise => {
    const previewOnly = selectedFile.size > LARGE_FILE_THRESHOLD_BYTES;
    const rawContent = previewOnly
      ? await selectedFile.slice(0, PREVIEW_READ_BYTES).text()
      : await selectedFile.text();

    let parsed = parseCSV(rawContent);

    // Drop the trailing partial row when the preview only reads a file slice.
    if (previewOnly && selectedFile.size > PREVIEW_READ_BYTES && parsed.length > 2) {
      parsed = parsed.slice(0, -1);
    }

    if (parsed.length === 0) {
      throw new Error("The selected CSV file appears to be empty.");
    }

    return {
      parsedHeaders: parsed[0],
      parsedRows: parsed
        .slice(1)
        .filter(row => row.some(cell => Boolean(cell?.trim())))
        .slice(0, previewOnly ? PREVIEW_ROW_LIMIT : Number.MAX_SAFE_INTEGER),
      previewOnly,
    };
  };

  const loadAllRowsForDirectImport = async (): Promise => {
    if (!file) {
      throw new Error("No CSV file selected.");
    }

    const parsed = parseCSV(await file.text());
    if (parsed.length === 0) {
      throw new Error("The selected CSV file appears to be empty.");
    }

    return {
      parsedHeaders: parsed[0],
      parsedRows: parsed.slice(1).filter(row => row.some(cell => Boolean(cell?.trim()))),
    };
  };

  const autoRegisterMappedCustomFields = async () => {
    const effectiveMappings = getEffectiveFieldMappings();
    const contactCustomFieldKeys = Array.from(
      new Set(
        effectiveMappings
          .filter(mapping => mapping.targetEntity === "contact" && mapping.targetField.startsWith("custom_"))
          .map(mapping => mapping.targetField.replace(/^custom_/, "")),
      ),
    );
    const accountCustomFieldKeys = Array.from(
      new Set(
        effectiveMappings
          .filter(mapping => mapping.targetEntity === "account" && mapping.targetField.startsWith("custom_"))
          .map(mapping => mapping.targetField.replace(/^custom_/, "")),
      ),
    );

    try {
      if (contactCustomFieldKeys.length > 0) {
        await apiRequest("POST", "/api/custom-fields/auto-register", {
          entityType: "contact",
          fieldKeys: contactCustomFieldKeys,
        });
      }

      if (accountCustomFieldKeys.length > 0) {
        await apiRequest("POST", "/api/custom-fields/auto-register", {
          entityType: "account",
          fieldKeys: accountCustomFieldKeys,
        });
      }
    } catch (error) {
      console.error("Failed to auto-register mapped custom fields:", error);
    }
  };

  const resolveTargetList = async (): Promise => {
    if (isCreatingNewList && newListName.trim()) {
      const createListResponse = await apiRequest("POST", "/api/lists", {
        name: newListName.trim(),
        entityType: "contact",
        sourceType: "manual_upload",
        recordIds: [],
      });
      const newList = await createListResponse.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
      return { id: newList.id, name: newListName.trim() };
    }

    if (selectedListId && selectedListId !== "__none__") {
      const foundList = contactLists.find(list => list.id === selectedListId);
      return { id: selectedListId, name: foundList?.name || null };
    }

    return { id: null, name: null };
  };

  const handleFileChange = async (e: React.ChangeEvent) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    try {
      setFile(selectedFile);
      setErrors([]);
      setFieldMappings([]);
      setImportProgress(0);
      setImportResults({ success: 0, created: 0, updated: 0, failed: 0 });
      setBackgroundJobId(null);
      setImportStatusMessage("Preparing import...");
      setImportExecutionMode(null);

      const { parsedHeaders, parsedRows, previewOnly } = await loadParsedCSVFromFile(selectedFile);
      setHeaders(parsedHeaders);
      setCsvData(parsedRows);
      setIsPreviewOnly(previewOnly);
      setStage("mapping");

      if (previewOnly) {
        toast({
          title: "Large CSV detected",
          description: `Loaded a fast preview from ${formatFileSize(selectedFile.size)}. The full file will import in the background.`,
        });
      }
    } catch (error) {
      console.error("Failed to read CSV file:", error);
      toast({
        title: "File Read Failed",
        description: error instanceof Error ? error.message : "Unable to read the selected CSV file.",
        variant: "destructive",
      });
    }
  };

  // Helper function to correctly apply field mappings to a CSV row
  const applyFieldMappings = (row: string[], mappings: FieldMapping[]): { mappedRow: string[]; mappedHeaders: string[] } => {
    // Create a map from CSV column name to its index in the original row
    const csvColumnIndexMap = new Map();
    headers.forEach((header, idx) => {
      csvColumnIndexMap.set(header, idx);
    });
    
    // Apply mappings: get value from original CSV column position
    const mappedRow = mappings.map(mapping => {
      if (!mapping.csvColumn) return "";
      const csvColumnIndex = csvColumnIndexMap.get(mapping.csvColumn);
      return csvColumnIndex !== undefined ? (row[csvColumnIndex] || "") : "";
    });
    
    // Create mapped headers based on target fields
    const mappedHeaders = mappings.map(m => m.targetField || "");
    
    return { mappedRow, mappedHeaders };
  };

  const handleMappingComplete = (mappings: FieldMapping[]) => {
    setFieldMappings(mappings);
    
    // Check if this is unified format (has account fields) or contacts-only
    const hasAccountFields = mappings.some(m => m.targetEntity === "account");
    
    // Validate that critical fields are mapped
    const contactEmailMapped = mappings.some(m => m.targetEntity === "contact" && m.targetField === "email");
    const accountNameMapped = hasAccountFields ? mappings.some(m => m.targetEntity === "account" && m.targetField === "name") : true;
    
    // Email is ALWAYS required for contact imports (both contact-only and unified)
    if (!contactEmailMapped) {
      toast({
        title: "Required Field Missing",
        description: "The 'email' field must be mapped for contact imports. Please map a CSV column to the email field.",
        variant: "destructive",
      });
      return;
    }
    
    // For unified imports with accounts, account name is required
    if (hasAccountFields && !accountNameMapped) {
      toast({
        title: "Required Field Missing",
        description: "The 'name' field must be mapped for account imports. Please map a CSV column to the account name field.",
        variant: "destructive",
      });
      return;
    }
    
    if (hasAccountFields) {
      // Unified format - validate with mapping
      setStage("validate");
      validateDataWithMapping(mappings);
    } else {
      // Contacts-only format - validate contacts only
      setStage("validate");
      validateContactsOnlyWithMapping(mappings);
    }
  };

  const validateContactsOnlyWithMapping = (mappings: FieldMapping[]) => {
    const validationErrors: ValidationError[] = [];

    csvData.forEach((row, index) => {
      // Map the row data to match the expected contact format
      const { mappedRow, mappedHeaders } = applyFieldMappings(row, mappings);
      
      const rowErrors = validateContactRow(mappedRow, mappedHeaders, index + 2);
      validationErrors.push(...rowErrors);
    });

    setErrors(validationErrors);

    if (validationErrors.length === 0) {
      setStage("preview");
    }
  };

  const validateContactsOnlyData = (parsed: string[][]) => {
    const dataRows = parsed.slice(1);
    const headerRow = parsed[0];
    const validationErrors: ValidationError[] = [];

    dataRows.forEach((row, index) => {
      const rowErrors = validateContactRow(row, headerRow, index + 2);
      validationErrors.push(...rowErrors);
    });

    setErrors(validationErrors);

    if (validationErrors.length === 0) {
      setStage("preview");
    } else {
      setStage("validate");
    }
  };

  const validateDataWithMapping = (mappings: FieldMapping[]) => {
    // Create a map from CSV column name to its index in the original row
    const csvColumnIndexMap = new Map();
    headers.forEach((header, idx) => {
      csvColumnIndexMap.set(header, idx);
    });
    
    // Create mapped headers with account_ prefix for account fields
    const mappedHeaders = mappings.map(m => {
      if (!m.targetField || !m.targetEntity) return "";
      return m.targetEntity === "account" ? `account_${m.targetField}` : m.targetField;
    });
    
    const validationErrors: ValidationError[] = [];

    csvData.forEach((row, index) => {
      // Map the row data by getting values from correct CSV column positions
      const mappedRow = mappings.map(mapping => {
        if (!mapping.csvColumn) return "";
        const csvColumnIndex = csvColumnIndexMap.get(mapping.csvColumn);
        return csvColumnIndex !== undefined ? (row[csvColumnIndex] || "") : "";
      });
      
      const rowErrors = validateContactWithAccountRow(mappedRow, mappedHeaders, index + 2);
      validationErrors.push(...rowErrors);
    });

    setErrors(validationErrors);

    if (validationErrors.length === 0) {
      setStage("preview");
    }
  };

  const validateData = (parsed: string[][]) => {
    const dataRows = parsed.slice(1);
    const headerRow = parsed[0];
    const validationErrors: ValidationError[] = [];

    dataRows.forEach((row, index) => {
      const rowErrors = validateContactWithAccountRow(row, headerRow, index + 2); // +2 for header and 1-based
      validationErrors.push(...rowErrors);
    });

    setErrors(validationErrors);

    if (validationErrors.length === 0) {
      setStage("preview");
    }
  };

  useEffect(() => {
    if (!backgroundJobId || stage !== "importing") {
      return;
    }

    let cancelled = false;

    const pollJob = async () => {
      try {
        const response = await apiRequest("GET", `/api/contacts-csv-import/${backgroundJobId}`);
        const payload = await response.json() as {
          state: string;
          progress?: Record;
          result?: {
            successRows?: number;
            createdRows?: number;
            updatedRows?: number;
            failedRows?: number;
          };
          error?: string;
        };

        if (cancelled) {
          return;
        }

        const progress = payload.progress || {};
        const nextProgress =
          typeof progress.percent === "number"
            ? progress.percent
            : typeof progress.totalRows === "number" && progress.totalRows > 0
            ? Math.min(
                99,
                Math.round(
                  ((((progress.successRows as number | undefined) ?? 0) + ((progress.failedRows as number | undefined) ?? 0)) /
                    progress.totalRows) *
                    100,
                ),
              )
            : null;

        setImportProgress(prev => (typeof nextProgress === "number" ? nextProgress : prev));

        const processedRows =
          typeof progress.processed === "number"
            ? progress.processed
            : typeof progress.totalRows === "number"
            ? progress.totalRows
            : null;

        if (payload.state === "completed") {
          const result = payload.result || {};
          const created = result.createdRows ?? 0;
          const updated = result.updatedRows ?? 0;
          const failed = result.failedRows ?? 0;
          const success = result.successRows ?? created + updated;

          setImportProgress(100);
          setImportStatusMessage("Background import complete.");
          setImportResults({ success, created, updated, failed });
          await queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
          setStage("complete");

          const parts = [];
          if (created > 0) parts.push(`${created} new contact(s) created`);
          if (updated > 0) parts.push(`${updated} existing contact(s) updated`);
          if (failed > 0) parts.push(`${failed} failed`);

          toast({
            title: "Import Complete",
            description: parts.length > 0 ? parts.join(", ") : "Background import finished.",
          });

          onImportComplete();
          return;
        }

        if (payload.state === "failed") {
          throw new Error(payload.error || "Background import failed.");
        }

        setImportStatusMessage(
          processedRows !== null
            ? `Processed ${processedRows.toLocaleString()} row(s) in background...`
            : "Queued for background processing...",
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("Failed to poll contacts CSV import job:", error);
        setStage("upload");
        toast({
          title: "Import Failed",
          description: error instanceof Error ? error.message : "Failed to monitor the import job.",
          variant: "destructive",
        });
      }
    };

    void pollJob();
    const intervalId = window.setInterval(() => {
      void pollJob();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [backgroundJobId, onImportComplete, stage, toast]);

  const runDirectImport = async (targetListId: string | null) => {
    setImportExecutionMode("browser_direct");
    const effectiveMappings = getEffectiveFieldMappings();
    const { parsedHeaders, parsedRows } = isPreviewOnly
      ? await loadAllRowsForDirectImport()
      : { parsedHeaders: headers, parsedRows: csvData };

    let successCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    const hasAccountFields = effectiveMappings.some(mapping => mapping.targetEntity === "account");
    const mappedHeaders = effectiveMappings.map(mapping =>
      mapping.targetEntity === "account" ? `account_${mapping.targetField}` : mapping.targetField,
    );
    const csvColumnIndexMap = new Map();
    parsedHeaders.forEach((header, idx) => {
      csvColumnIndexMap.set(header.trim().toLowerCase(), idx);
    });

    const batchSize = 500;
    const totalBatches = Math.max(1, Math.ceil(parsedRows.length / batchSize));

    for (let batchIndex = 0; batchIndex  {
            const mappedRow = effectiveMappings.map(mapping => {
              const csvColumnIndex = csvColumnIndexMap.get(mapping.csvColumn.trim().toLowerCase());
              return csvColumnIndex !== undefined ? (row[csvColumnIndex] || "") : "";
            });

            return {
              contact: hasAccountFields
                ? csvRowToContactFromUnified(mappedRow, mappedHeaders)
                : csvRowToContact(mappedRow, mappedHeaders.map(header => header.replace(/^account_/, ""))),
              account: hasAccountFields ? csvRowToAccountFromUnified(mappedRow, mappedHeaders) : null,
              rowIndex: start + idx + 2,
            };
          })
          .filter(record => {
            if (!record.contact.email || !record.contact.email.trim()) {
              failedCount++;
              console.error(`Row ${record.rowIndex}: Skipped - Email is required`);
              return false;
            }
            return true;
          });

        if (records.length > 0) {
          const response = await apiRequest(
            "POST",
            "/api/contacts/batch-import",
            {
              records: records.map(record => ({ contact: record.contact, account: record.account })),
              listId: targetListId,
            },
            { timeout: 120000 },
          );

          const result = await response.json() as {
            success: number;
            created: number;
            updated: number;
            failed: number;
            errors: Array;
          };

          successCount += result.success;
          createdCount += result.created || 0;
          updatedCount += result.updated || 0;
          failedCount += result.failed;

          result.errors.forEach(err => {
            const actualRowIndex = records[err.index]?.rowIndex || (start + err.index + 2);
            console.error(`Row ${actualRowIndex}: ${err.error}`);
          });
        }
      } catch (error) {
        failedCount += batchRows.length;
        console.error(`Failed to import batch ${batchIndex + 1}:`, error);
      }

      setImportProgress(Math.round((end / Math.max(parsedRows.length, 1)) * 100));
      setImportStatusMessage(`Processed batch ${batchIndex + 1} of ${totalBatches}...`);
    }

    setImportResults({ success: successCount, created: createdCount, updated: updatedCount, failed: failedCount });
    await queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
    setStage("complete");

    const parts = [];
    if (createdCount > 0) parts.push(`${createdCount} new contact(s) created`);
    if (updatedCount > 0) parts.push(`${updatedCount} existing contact(s) updated`);
    if (failedCount > 0) parts.push(`${failedCount} failed`);

    toast({
      title: "Import Complete",
      description: parts.length > 0 ? parts.join(", ") : "Import complete",
    });

    onImportComplete();
  };

  const handleImport = async () => {
    if (!file) {
      return;
    }

    setStage("importing");
    setImportProgress(0);
    setBackgroundJobId(null);
    setImportStatusMessage("Preparing import...");
    setImportExecutionMode(null);

    let resolvedTargetListId: string | null = null;
    let resolvedTargetListName: string | null = null;

    try {
      const { id: targetListId, name: targetListName } = await resolveTargetList();
      resolvedTargetListId = targetListId;
      resolvedTargetListName = targetListName;
      await autoRegisterMappedCustomFields();

      const effectiveMappings = getEffectiveFieldMappings();
      const isUnifiedFormat = effectiveMappings.some(mapping => mapping.targetEntity === "account");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("isUnifiedFormat", String(isUnifiedFormat));
      formData.append("fieldMappings", JSON.stringify(effectiveMappings));
      formData.append("headers", JSON.stringify(headers));
      formData.append("batchSize", String(file.size > LARGE_FILE_THRESHOLD_BYTES ? 5000 : 2000));
      if (resolvedTargetListId) {
        formData.append("listId", resolvedTargetListId);
      }

      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/contacts-csv-import", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: formData,
      });

      const payload = await response.json().catch(async () => ({ message: await response.text() }));

      if (!response.ok) {
        const error = new Error(payload?.message || payload?.error || "Failed to start background import.");
        (error as Error & { useDirectProcessing?: boolean }).useDirectProcessing = Boolean(payload?.useDirectProcessing);
        throw error;
      }

      setBackgroundJobId(payload.jobId);
      setImportExecutionMode("background");
      setImportProgress(5);
      setImportStatusMessage(
        resolvedTargetListName
          ? `Queued background import and will add imported contacts to "${resolvedTargetListName}".`
          : "Queued background import.",
      );
    } catch (error) {
      const shouldFallback =
        Boolean((error as Error & { useDirectProcessing?: boolean }).useDirectProcessing) ||
        (error instanceof Error && error.message.includes("Redis"));

      if (shouldFallback) {
        setImportExecutionMode("browser_direct");
        setImportStatusMessage("Background queue unavailable. Running import directly in this browser session...");
        toast({
          title: "Background queue unavailable",
          description: "This import is running in your browser. Keep this tab open until it finishes.",
          variant: "destructive",
        });
        await runDirectImport(resolvedTargetListId);
        return;
      }

      console.error("Import failed:", error);
      setStage("upload");
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "An error occurred during import",
        variant: "destructive",
      });
    }
  };

  const downloadTemplate = async () => {
    try {
      // Fetch current custom fields configuration
      const [contactFieldsRes, accountFieldsRes] = await Promise.all([
        apiRequest("GET", "/api/custom-fields/contact"),
        apiRequest("GET", "/api/custom-fields/account"),
      ]);

      const contactCustomFields = await contactFieldsRes.json() as Array;
      const accountCustomFields = await accountFieldsRes.json() as Array;

      // Build headers with custom fields
      const headers = [
        // Contact fields
        "firstName",
        "lastName", 
        "fullName",
        "email",
        "directPhone",
        "jobTitle",
        "department",
        "seniorityLevel",
        "linkedinUrl",
        "consentBasis",
        "consentSource",
        "tags",
        // Contact custom fields (dynamic)
        ...contactCustomFields.map(f => `custom_${f.name}`),
        // Account fields (prefixed with account_)
        "account_name",
        "account_domain",
        "account_industry",
        "account_employeesSize",
        "account_revenue",
        "account_hqStreet1",
        "account_hqStreet2",
        "account_hqStreet3",
        "account_hqCity",
        "account_hqState",
        "account_hqPostalCode",
        "account_hqCountry",
        "account_companyLocation",
        "account_phone",
        "account_linkedinUrl",
        "account_description",
        "account_techStack",
        "account_tags",
        // Account custom fields (dynamic)
        ...accountCustomFields.map(f => `account_custom_${f.name}`),
      ];

      // Build sample row with examples
      const sampleRow = [
        // Contact data
        "John",
        "Doe",
        "John Doe",
        "john.doe@example.com",
        "+14155551234",
        "VP of Sales",
        "Sales",
        "Executive",
        "https://linkedin.com/in/johndoe",
        "legitimate_interest",
        "Website Form",
        "enterprise,vip",
        // Contact custom fields examples
        ...contactCustomFields.map(f => {
          if (f.type === 'number') return "100";
          if (f.type === 'date') return "2024-01-15";
          if (f.type === 'boolean') return "true";
          return `Sample ${f.name}`;
        }),
        // Account data
        "Acme Corporation",
        "acme.com",
        "Technology",
        "1000-5000",
        "$50M-$100M",
        "123 Main Street",
        "Suite 400",
        "",
        "San Francisco",
        "CA",
        "94105",
        "United States",
        "123 Main Street, Suite 400, San Francisco, CA 94105",
        "+14155559999",
        "https://linkedin.com/company/acme",
        "Leading technology company",
        "Salesforce,HubSpot,AWS",
        "Enterprise,Hot Lead",
        // Account custom fields examples
        ...accountCustomFields.map(f => {
          if (f.type === 'number') return "250";
          if (f.type === 'date') return "2024-06-01";
          if (f.type === 'boolean') return "false";
          return `Sample ${f.name}`;
        }),
      ];

      const csv = [headers.join(","), sampleRow.join(",")].join("\n");
      
      downloadCSV(
        csv,
        `contacts_accounts_template_${new Date().toISOString().split("T")[0]}.csv`
      );

      toast({
        title: "Template Downloaded",
        description: `Template includes ${contactCustomFields.length} contact custom fields and ${accountCustomFields.length} account custom fields`,
      });
    } catch (error) {
      console.error("Failed to generate template:", error);
      // Fallback to basic template
      const template = generateContactsWithAccountTemplate();
      downloadCSV(
        template,
        `contacts_accounts_template_${new Date().toISOString().split("T")[0]}.csv`
      );
      
      toast({
        title: "Template Downloaded",
        description: "Basic template downloaded (custom fields not included)",
      });
    }
  };

  const downloadContactsOnlyTemplate = async () => {
    try {
      // Fetch current custom fields configuration
      const contactFieldsRes = await apiRequest("GET", "/api/custom-fields/contact");
      const contactCustomFields = await contactFieldsRes.json() as Array;

      const headers = [
        "firstName",
        "lastName", 
        "fullName",
        "email",
        "directPhone",
        "jobTitle",
        "department",
        "seniorityLevel",
        "linkedinUrl",
        "consentBasis",
        "consentSource",
        "tags",
        // Dynamic custom fields
        ...contactCustomFields.map(f => `custom_${f.name}`),
      ];

      const sampleRow = [
        "John",
        "Doe",
        "John Doe",
        "john.doe@example.com",
        "+14155551234",
        "VP of Sales",
        "Sales",
        "Executive",
        "https://linkedin.com/in/johndoe",
        "legitimate_interest",
        "Website Form",
        "enterprise,vip",
        // Custom fields examples
        ...contactCustomFields.map(f => {
          if (f.type === 'number') return "100";
          if (f.type === 'date') return "2024-01-15";
          if (f.type === 'boolean') return "true";
          return `Sample ${f.name}`;
        }),
      ];

      const csv = [headers.join(","), sampleRow.join(",")].join("\n");
      
      downloadCSV(
        csv,
        `contacts_only_template_${new Date().toISOString().split("T")[0]}.csv`
      );

      toast({
        title: "Template Downloaded",
        description: `Template includes ${contactCustomFields.length} custom fields from your settings`,
      });
    } catch (error) {
      console.error("Failed to generate template:", error);
      // Fallback to basic template
      const headers = [
        "firstName", "lastName", "fullName", "email", "directPhone",
        "jobTitle", "department", "seniorityLevel", "linkedinUrl",
        "consentBasis", "consentSource", "tags",
      ];
      const sampleRow = [
        "John", "Doe", "John Doe", "john.doe@example.com", "+14155551234",
        "VP of Sales", "Sales", "Executive", "https://linkedin.com/in/johndoe",
        "legitimate_interest", "Website Form", "enterprise,vip",
      ];
      const csv = [headers.join(","), sampleRow.join(",")].join("\n");
      
      downloadCSV(csv, `contacts_only_template_${new Date().toISOString().split("T")[0]}.csv`);
      
      toast({
        title: "Template Downloaded",
        description: "Basic template downloaded (custom fields not included)",
      });
    }
  };

  const downloadErrorReport = () => {
    const errorReport = [
      ["Row", "Field", "Value", "Error"],
      ...errors.map((err) => [
        err.row.toString(),
        err.field,
        err.value,
        err.error,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    downloadCSV(
      errorReport,
      `contact_import_errors_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const handleClose = () => {
    setStage("upload");
    setFile(null);
    setCsvData([]);
    setHeaders([]);
    setFieldMappings([]);
    setErrors([]);
    setImportProgress(0);
    setImportResults({ success: 0, created: 0, updated: 0, failed: 0 });
    setIsPreviewOnly(false);
    setBackgroundJobId(null);
    setImportStatusMessage("Preparing import...");
    setImportExecutionMode(null);
    setSelectedListId("");
    setIsCreatingNewList(false);
    setNewListName("");
    onOpenChange(false);
  };

  return (
    
      
        
          
            Import Contacts from CSV
          
          
            Upload a CSV file to bulk import contacts. Supports both contacts-only format and unified contacts+accounts format.
            The system will automatically detect the format and handle account linking.
          
        

        
          {/* Upload Stage */}
          {stage === "upload" && (
            
              {/* List Selection */}
              
                
                  
                  Add to List (Optional)
                
                
                  Organize your imported contacts by adding them to a list for easy filtering and tracking.
                
                
                  {listsLoading
                    ? "Loading contact lists..."
                    : listsError
                    ? "Could not load existing lists. You can retry or create a new list."
                    : contactLists.length > 0
                    ? `${contactLists.length} contact list(s) available.`
                    : "No existing contact lists found yet."}
                
                
                {!isCreatingNewList ? (
                  
                     {
                        if (value === "__create_new__") {
                          setIsCreatingNewList(true);
                          setSelectedListId("");
                        } else {
                          setSelectedListId(value);
                        }
                      }}
                    >
                      
                        
                      
                      
                        No list (skip)
                        {contactLists.map((list) => (
                          
                            {list.name} ({(list.recordIds?.length || 0).toLocaleString()} contacts)
                          
                        ))}
                        
                          
                            
                            Create new list
                          
                        
                      
                    
                    {listsError && (
                       void refetchLists()}>
                        Retry
                      
                    )}
                  
                ) : (
                  
                     setNewListName(e.target.value)}
                      className="flex-1"
                      data-testid="input-new-list-name"
                      autoFocus
                    />
                     {
                        setIsCreatingNewList(false);
                        setNewListName("");
                      }}
                      data-testid="button-cancel-new-list"
                    >
                      Cancel
                    
                  
                )}
              

              
                
                
                  Select a CSV file to import
                
                
                
                  
                    
                      
                      Select CSV File
                    
                  
                
              

              
                
                  
                  
                    
                      Download a sample template to see the exact format:
                      
                        Templates include all your custom fields from Settings with sample data
                      
                      
                        
                          
                          Contacts Only
                        
                        
                          
                          Contacts + Accounts
                        
                      
                    
                  
                
              
            
          )}

          {/* Mapping Stage */}
          {stage === "mapping" && headers.length > 0 && (
            
              
            
          )}

          {/* Validation Stage */}
          {stage === "validate" && errors.length > 0 && (
            
              
                
                
                  Found {errors.length} validation error(s) in your CSV {isPreviewOnly ? "preview" : "file"}.
                  Please fix these errors and try again.
                
              

              
                
                  {errors.map((error, idx) => (
                    
                      
                        Row {error.row}
                        
                          {error.field}
                          
                            {error.error}
                          
                          {error.value && (
                            
                              Value: "{error.value}"
                            
                          )}
                        
                      
                    
                  ))}
                
              

              
                
                  
                  Download Error Report
                
                
                  Cancel
                
              
            
          )}

          {/* Preview Stage */}
          {stage === "preview" && (
            
              
                
                
                  {isPreviewOnly && file
                    ? `Preview validation passed. Ready to import ${file.name} (${formatFileSize(file.size)}).`
                    : `Validation passed! Ready to import ${csvData.length} record(s).`}
                
              

              
                Preview (first 5 row{csvData.length === 1 ? "" : "s"})
                {isPreviewOnly && (
                  
                    Large files are previewed from the first {PREVIEW_ROW_LIMIT} rows only. The complete CSV will be processed after you start the import.
                  
                )}
                
                  
                    
                      
                        {headers.slice(0, 6).map((header, idx) => (
                          
                            {header}
                          
                        ))}
                      
                    
                    
                      {csvData.slice(0, 5).map((row, rowIdx) => (
                        
                          {row.slice(0, 6).map((cell, cellIdx) => (
                            
                              {cell || "-"}
                            
                          ))}
                        
                      ))}
                    
                  
                
              
            
          )}

          {/* Importing Stage */}
          {stage === "importing" && (
            
              {importExecutionMode === "browser_direct" && (
                
                  
                  
                    Background queue is unavailable. This import is running in your browser session only.
                    Keep this tab open and do not refresh or navigate away until the import finishes.
                  
                
              )}
              
                
                  {importStatusMessage}
                
                
                
                  {importProgress}% complete
                
                {importExecutionMode === "background" ? (
                  
                    You can close this dialog. The import will continue on the server.
                  
                ) : (
                  
                    Do not close this dialog or browser tab while this import is running.
                  
                )}
              
            
          )}

          {/* Complete Stage */}
          {stage === "complete" && (
            
              
                
                
                  
                    Import completed!
                    {importResults.created > 0 && (
                      ✓ {importResults.created} new contact(s) created
                    )}
                    {importResults.updated > 0 && (
                      ↻ {importResults.updated} existing contact(s) updated
                    )}
                    {importResults.failed > 0 && (
                      ✗ {importResults.failed} record(s) failed
                    )}
                    {importResults.success === 0 && importResults.failed === 0 && (
                      No records processed
                    )}
                  
                
              
            
          )}
        

        
          {stage === "preview" && (
            <>
              
                Cancel
              
              
                Start Import
              
            
          )}

          {stage === "complete" && (
            
              Close
            
          )}
        
      
    
  );
}