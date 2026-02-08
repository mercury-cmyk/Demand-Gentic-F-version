import { useState } from "react";
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
import { apiRequest } from "@/lib/queryClient";
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

export function CSVImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: CSVImportDialogProps) {
  const [stage, setStage] = useState<ImportStage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState({ success: 0, created: 0, updated: 0, failed: 0 });
  const { toast } = useToast();

  // List selection state
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [isCreatingNewList, setIsCreatingNewList] = useState(false);
  const [newListName, setNewListName] = useState("");

  // Fetch available lists for selection
  const { data: existingLists = [] } = useQuery<ListType[]>({
    queryKey: ['/api/lists'],
    enabled: open,
  });

  // Filter to only show contact lists
  const contactLists = existingLists.filter(list => list.entityType === 'contact');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        const parsed = parseCSV(content);
        
        if (parsed.length > 0) {
          const headers = parsed[0];
          setHeaders(headers);
          setCsvData(parsed.slice(1));
          
          // Always go to mapping stage first - let user review/confirm field mappings
          setStage("mapping");
        }
      };
      reader.readAsText(selectedFile);
    }
  };

  // Helper function to correctly apply field mappings to a CSV row
  const applyFieldMappings = (row: string[], mappings: FieldMapping[]): { mappedRow: string[]; mappedHeaders: string[] } => {
    // Create a map from CSV column name to its index in the original row
    const csvColumnIndexMap = new Map<string, number>();
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
    const csvColumnIndexMap = new Map<string, number>();
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

  const handleImport = async () => {
    setStage("importing");
    setImportProgress(0);

    let successCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    let targetListId: string | null = null;
    let targetListName: string | null = null;

    try {
      // Step 0: Handle list creation/selection
      if (isCreatingNewList && newListName.trim()) {
        // Create a new list first
        console.log('[CSV-IMPORT] Creating new list:', newListName);
        const createListResponse = await apiRequest("POST", "/api/lists", {
          name: newListName.trim(),
          entityType: 'contact',
          sourceType: 'manual_upload',
          recordIds: [],
        });
        const newList = await createListResponse.json();
        targetListId = newList.id;
        targetListName = newListName.trim();
        console.log('[CSV-IMPORT] Created list:', targetListId);
      } else if (selectedListId && selectedListId !== "__none__") {
        targetListId = selectedListId;
        const foundList = contactLists.find(l => l.id === selectedListId);
        targetListName = foundList?.name || null;
        console.log('[CSV-IMPORT] Using existing list:', targetListId);
      }

      console.log('[CSV-IMPORT] Starting import with', csvData.length, 'rows');
      console.log('[CSV-IMPORT] Field mappings:', fieldMappings);

      // Check if we have account fields in the mapping
      const hasAccountFields = fieldMappings.some(m => m.targetEntity === "account");
      const isUnifiedFormat = hasAccountFields;

      console.log('[CSV-IMPORT] Is unified format:', isUnifiedFormat);

      // Process in batches for better performance with large files
      // Increased from 50 to 2500 to avoid production timeouts on large imports
      const BATCH_SIZE = 2500;
      const totalBatches = Math.ceil(csvData.length / BATCH_SIZE);
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, csvData.length);
        const batchRows = csvData.slice(start, end);

        console.log(`[CSV-IMPORT] Processing batch ${batchIndex + 1}/${totalBatches} (${batchRows.length} rows)`);

        try {
          if (isUnifiedFormat) {
            // Unified format with account data
            // Create a map from CSV column name to its index (case-insensitive, trimmed)
            const csvColumnIndexMap = new Map<string, number>();
            headers.forEach((header, idx) => {
              csvColumnIndexMap.set(header.trim().toLowerCase(), idx);
            });

            const mappedHeaders = fieldMappings.map(m => {
              if (!m.targetField || !m.targetEntity) return "";
              return m.targetEntity === "account" ? `account_${m.targetField}` : m.targetField;
            });

            // Debug: Log first row mapping
            if (batchIndex === 0) {
              console.log('[CSV-IMPORT] Field mappings:', fieldMappings.map(m => ({ csv: m.csvColumn, target: m.targetField, entity: m.targetEntity })));
              console.log('[CSV-IMPORT] Mapped headers:', mappedHeaders);
              console.log('[CSV-IMPORT] CSV column index map:', Array.from(csvColumnIndexMap.entries()));
              console.log('[CSV-IMPORT] First row raw:', batchRows[0]);
            }

            const records = batchRows
              .map((row, idx) => {
                // Map row data by getting values from correct CSV column positions
                const mappedRow = fieldMappings.map(mapping => {
                  if (!mapping.csvColumn) return "";
                  const csvColumnIndex = csvColumnIndexMap.get(mapping.csvColumn.trim().toLowerCase());
                  return csvColumnIndex !== undefined ? (row[csvColumnIndex] || "") : "";
                });

                // Debug: Log first row mapping details
                if (batchIndex === 0 && idx === 0) {
                  console.log('[CSV-IMPORT] First mapped row:', mappedRow);
                  // Find email mapping
                  const emailMappingIdx = mappedHeaders.findIndex(h => h === 'email');
                  console.log('[CSV-IMPORT] Email mapping index:', emailMappingIdx, 'value:', mappedRow[emailMappingIdx]);
                }

                const contactData = csvRowToContactFromUnified(mappedRow, mappedHeaders);
                const accountData = csvRowToAccountFromUnified(mappedRow, mappedHeaders);

                // Debug: Log first contact
                if (batchIndex === 0 && idx === 0) {
                  console.log('[CSV-IMPORT] First contact data:', contactData);
                }

                return {
                  contact: contactData,
                  account: accountData,
                  rowIndex: start + idx + 2
                };
              })
              .filter((record) => {
                // Filter out records with empty emails
                if (!record.contact.email || !record.contact.email.trim()) {
                  failedCount++;
                  console.error(`Row ${record.rowIndex}: Skipped - Email is required`);
                  return false;
                }
                return true;
              });

            console.log('[CSV-IMPORT] Filtered records:', records.length);

            if (records.length > 0) {
              const response = await apiRequest(
                "POST",
                "/api/contacts/batch-import",
                { 
                  records: records.map(r => ({ contact: r.contact, account: r.account })),
                  listId: targetListId,
                }
              );
              
              const result = await response.json() as {
                success: number;
                created: number;
                updated: number;
                failed: number;
                errors: Array<{ index: number; error: string }>;
              };
              
              console.log('[CSV-IMPORT] Batch result:', result);
              
              successCount += result.success;
              createdCount += result.created || 0;
              updatedCount += result.updated || 0;
              failedCount += result.failed;

              if (result.errors.length > 0) {
                result.errors.forEach((err: { index: number; error: string }) => {
                  const actualRowIndex = records[err.index]?.rowIndex || (start + err.index + 2);
                  console.error(`Row ${actualRowIndex}: ${err.error}`);
                });
              }
            }
          } else {
            // Contacts-only format with mapping - use batch import for efficiency
            const csvColumnIndexMap = new Map<string, number>();
            headers.forEach((header, idx) => {
              csvColumnIndexMap.set(header.trim().toLowerCase(), idx);
            });

            const mappedHeaders = fieldMappings.map(m => m.targetField || "");

            // Debug: Log first row mapping
            if (batchIndex === 0) {
              console.log('[CSV-IMPORT] Contacts-only - Field mappings:', fieldMappings.map(m => ({ csv: m.csvColumn, target: m.targetField })));
              console.log('[CSV-IMPORT] Contacts-only - Mapped headers:', mappedHeaders);
              console.log('[CSV-IMPORT] Contacts-only - CSV column index map:', Array.from(csvColumnIndexMap.entries()));
            }

            const records = batchRows
              .map((row, idx) => {
                const mappedRow = fieldMappings.map(mapping => {
                  if (!mapping.csvColumn) return "";
                  const csvColumnIndex = csvColumnIndexMap.get(mapping.csvColumn.trim().toLowerCase());
                  return csvColumnIndex !== undefined ? (row[csvColumnIndex] || "") : "";
                });

                // Debug: Log first row
                if (batchIndex === 0 && idx === 0) {
                  console.log('[CSV-IMPORT] Contacts-only - First mapped row:', mappedRow);
                  const emailIdx = mappedHeaders.findIndex(h => h === 'email');
                  console.log('[CSV-IMPORT] Contacts-only - Email index:', emailIdx, 'value:', mappedRow[emailIdx]);
                }

                const contactData = csvRowToContact(mappedRow, mappedHeaders);

                if (batchIndex === 0 && idx === 0) {
                  console.log('[CSV-IMPORT] Contacts-only - First contact:', contactData);
                }

                return {
                  contact: contactData,
                  account: null,
                  rowIndex: start + idx + 2
                };
              })
              .filter((record) => {
                if (!record.contact.email || !record.contact.email.trim()) {
                  failedCount++;
                  console.error(`Row ${record.rowIndex}: Skipped - Email is required`);
                  return false;
                }
                return true;
              });

            console.log('[CSV-IMPORT] Contacts to import:', records.length);

            if (records.length > 0) {
              const response = await apiRequest(
                "POST",
                "/api/contacts/batch-import",
                { 
                  records: records.map(r => ({ contact: r.contact, account: r.account })),
                  listId: targetListId,
                }
              );
              
              const result = await response.json() as {
                success: number;
                created: number;
                updated: number;
                failed: number;
                errors: Array<{ index: number; error: string }>;
              };
              
              console.log('[CSV-IMPORT] Batch result:', result);
              
              successCount += result.success;
              createdCount += result.created || 0;
              updatedCount += result.updated || 0;
              failedCount += result.failed;

              if (result.errors.length > 0) {
                result.errors.forEach((err: { index: number; error: string }) => {
                  const actualRowIndex = records[err.index]?.rowIndex || (start + err.index + 2);
                  console.error(`Row ${actualRowIndex}: ${err.error}`);
                });
              }
            }
          }
        } catch (error) {
          failedCount += batchRows.length;
          console.error(`Failed to import batch ${batchIndex + 1}:`, error);
        }

        setImportProgress(Math.round(((end) / csvData.length) * 100));
      }

      console.log('[CSV-IMPORT] Import complete - Created:', createdCount, 'Updated:', updatedCount, 'Failed:', failedCount);

      setImportResults({ success: successCount, created: createdCount, updated: updatedCount, failed: failedCount });
      
      // Auto-register any discovered custom fields for contacts and accounts
      try {
        const allContactFields = new Set<string>();
        const allAccountFields = new Set<string>();
        
        // Create a map from CSV column name to its index
        const csvColumnIndexMap = new Map<string, number>();
        headers.forEach((header, idx) => {
          csvColumnIndexMap.set(header, idx);
        });
        
        const mappedHeaders = fieldMappings.map(m => {
          if (!m.targetField || !m.targetEntity) return "";
          return m.targetEntity === "account" ? `account_${m.targetField}` : m.targetField;
        });
        
        // Process all rows to collect custom field keys
        for (const row of csvData) {
          const mappedRow = fieldMappings.map(mapping => {
            if (!mapping.csvColumn) return "";
            const csvColumnIndex = csvColumnIndexMap.get(mapping.csvColumn);
            return csvColumnIndex !== undefined ? (row[csvColumnIndex] || "") : "";
          });
          
          const contactData = csvRowToContactFromUnified(mappedRow, mappedHeaders);
          const accountData = csvRowToAccountFromUnified(mappedRow, mappedHeaders);
          
          if (contactData.customFields && typeof contactData.customFields === 'object') {
            Object.keys(contactData.customFields).forEach(key => allContactFields.add(key));
          }
          
          if (accountData && accountData.customFields && typeof accountData.customFields === 'object') {
            Object.keys(accountData.customFields).forEach(key => allAccountFields.add(key));
          }
        }

        // Register contact custom fields
        if (allContactFields.size > 0) {
          await apiRequest('POST', '/api/custom-fields/auto-register', {
            entityType: 'contact',
            fieldKeys: Array.from(allContactFields)
          });
        }

        // Register account custom fields
        if (allAccountFields.size > 0) {
          await apiRequest('POST', '/api/custom-fields/auto-register', {
            entityType: 'account',
            fieldKeys: Array.from(allAccountFields)
          });
        }
      } catch (error) {
        console.error('Failed to auto-register custom fields:', error);
        // Don't fail the whole import if custom field registration fails
      }

      setStage("complete");

      const messageParts = [];
      if (createdCount > 0) messageParts.push(`${createdCount} new contact(s) created`);
      if (updatedCount > 0) messageParts.push(`${updatedCount} existing contact(s) updated`);
      if (failedCount > 0) messageParts.push(`${failedCount} failed`);
      
      const message = messageParts.length > 0 ? messageParts.join(', ') : 'Import complete';

      toast({
        title: "Import Complete",
        description: message,
      });

      onImportComplete();
    } catch (error) {
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

      const contactCustomFields = await contactFieldsRes.json() as Array<{ name: string; type: string }>;
      const accountCustomFields = await accountFieldsRes.json() as Array<{ name: string; type: string }>;

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
      const contactCustomFields = await contactFieldsRes.json() as Array<{ name: string; type: string }>;

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
    setSelectedListId("");
    setIsCreatingNewList(false);
    setNewListName("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Import Contacts from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk import contacts. Supports both contacts-only format and unified contacts+accounts format.
            The system will automatically detect the format and handle account linking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Stage */}
          {stage === "upload" && (
            <div className="space-y-4">
              {/* List Selection */}
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <List className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-medium">Add to List (Optional)</Label>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Organize your imported contacts by adding them to a list for easy filtering and tracking.
                </p>
                
                {!isCreatingNewList ? (
                  <div className="flex gap-2">
                    <Select
                      value={selectedListId}
                      onValueChange={(value) => {
                        if (value === "__create_new__") {
                          setIsCreatingNewList(true);
                          setSelectedListId("");
                        } else {
                          setSelectedListId(value);
                        }
                      }}
                    >
                      <SelectTrigger className="flex-1" data-testid="select-import-list">
                        <SelectValue placeholder="Select a list or skip" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No list (skip)</SelectItem>
                        {contactLists.map((list) => (
                          <SelectItem key={list.id} value={list.id}>
                            {list.name} ({(list.recordIds?.length || 0).toLocaleString()} contacts)
                          </SelectItem>
                        ))}
                        <SelectItem value="__create_new__" className="text-primary">
                          <div className="flex items-center gap-2">
                            <Plus className="h-3 w-3" />
                            Create new list
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter list name..."
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      className="flex-1"
                      data-testid="input-new-list-name"
                      autoFocus
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsCreatingNewList(false);
                        setNewListName("");
                      }}
                      data-testid="button-cancel-new-list"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  Select a CSV file to import
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="csv-upload"
                  data-testid="input-csv-upload"
                />
                <label htmlFor="csv-upload">
                  <Button variant="outline" asChild data-testid="button-select-csv">
                    <span>
                      <FileText className="mr-2 h-4 w-4" />
                      Select CSV File
                    </span>
                  </Button>
                </label>
              </div>

              <div className="space-y-2">
                <Alert>
                  <Download className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-3">
                      <p className="font-medium">Download a sample template to see the exact format:</p>
                      <p className="text-xs text-muted-foreground">
                        Templates include all your custom fields from Settings with sample data
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={downloadContactsOnlyTemplate}
                          data-testid="button-download-contacts-template"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Contacts Only
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={downloadTemplate}
                          data-testid="button-download-unified-template"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Contacts + Accounts
                        </Button>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          )}

          {/* Mapping Stage */}
          {stage === "mapping" && headers.length > 0 && (
            <div className="space-y-4">
              <CSVFieldMapper
                csvHeaders={headers}
                sampleData={csvData.slice(0, 3)}
                onMappingComplete={handleMappingComplete}
                onCancel={handleClose}
              />
            </div>
          )}

          {/* Validation Stage */}
          {stage === "validate" && errors.length > 0 && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Found {errors.length} validation error(s) in your CSV file.
                  Please fix these errors and try again.
                </AlertDescription>
              </Alert>

              <ScrollArea className="h-[300px] border rounded-lg p-4">
                <div className="space-y-2">
                  {errors.map((error, idx) => (
                    <div key={idx} className="p-3 border rounded-md bg-destructive/5">
                      <div className="flex items-start gap-2">
                        <Badge variant="destructive">Row {error.row}</Badge>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{error.field}</p>
                          <p className="text-sm text-muted-foreground">
                            {error.error}
                          </p>
                          {error.value && (
                            <p className="text-xs text-muted-foreground mt-1 font-mono">
                              Value: "{error.value}"
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={downloadErrorReport}
                  data-testid="button-download-errors"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Error Report
                </Button>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Preview Stage */}
          {stage === "preview" && (
            <div className="space-y-4">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Validation passed! Ready to import {csvData.length} record(s).
                </AlertDescription>
              </Alert>

              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Preview (first 5 rows)</h4>
                <ScrollArea className="h-[200px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {headers.slice(0, 6).map((header, idx) => (
                          <th key={idx} className="text-left p-2 font-medium">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(0, 5).map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-b">
                          {row.slice(0, 6).map((cell, cellIdx) => (
                            <td key={cellIdx} className="p-2">
                              {cell || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            </div>
          )}

          {/* Importing Stage */}
          {stage === "importing" && (
            <div className="space-y-4">
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-4">
                  Importing records... Please wait.
                </p>
                <Progress value={importProgress} className="w-full" />
                <p className="text-sm text-muted-foreground mt-2">
                  {importProgress}% complete
                </p>
              </div>
            </div>
          )}

          {/* Complete Stage */}
          {stage === "complete" && (
            <div className="space-y-4">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-medium">Import completed!</p>
                    {importResults.created > 0 && (
                      <p className="text-sm">✓ {importResults.created} new contact(s) created</p>
                    )}
                    {importResults.updated > 0 && (
                      <p className="text-sm">↻ {importResults.updated} existing contact(s) updated</p>
                    )}
                    {importResults.failed > 0 && (
                      <p className="text-sm text-destructive">✗ {importResults.failed} record(s) failed</p>
                    )}
                    {importResults.success === 0 && importResults.failed === 0 && (
                      <p className="text-sm">No records processed</p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        <DialogFooter>
          {stage === "preview" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleImport} data-testid="button-start-import">
                Import {csvData.length} Record(s)
              </Button>
            </>
          )}

          {stage === "complete" && (
            <Button onClick={handleClose} data-testid="button-close-import">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
