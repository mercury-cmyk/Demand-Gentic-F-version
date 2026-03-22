import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, Download, AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  parseCSV,
  validateAccountRow,
  csvRowToAccount,
  type ValidationError,
  downloadCSV,
  generateAccountsTemplate,
} from "@/lib/csv-utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CSVImportAccountsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

type ImportStage = "upload" | "validate" | "preview" | "importing" | "complete";

export function CSVImportAccountsDialog({
  open,
  onOpenChange,
  onImportComplete,
}: CSVImportAccountsDialogProps) {
  const [stage, setStage] = useState("upload");
  const [file, setFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState({ success: 0, created: 0, updated: 0, failed: 0 });
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        const parsed = parseCSV(content);
        
        if (parsed.length > 0) {
          setHeaders(parsed[0]);
          setCsvData(parsed.slice(1));
          validateData(parsed);
        }
      };
      reader.readAsText(selectedFile);
    }
  };

  const validateData = (parsed: string[][]) => {
    const dataRows = parsed.slice(1);
    const headerRow = parsed[0];
    const validationErrors: ValidationError[] = [];

    dataRows.forEach((row, index) => {
      const rowErrors = validateAccountRow(row, headerRow, index + 2);
      validationErrors.push(...rowErrors);
    });

    setErrors(validationErrors);

    if (validationErrors.length === 0) {
      setStage("preview");
    } else {
      setStage("validate");
    }
  };

  const handleImport = async () => {
    setStage("importing");
    setImportProgress(0);

    let successCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    try {
      const BATCH_SIZE = 100;
      const totalBatches = Math.ceil(csvData.length / BATCH_SIZE);
      
      for (let batchIndex = 0; batchIndex  csvRowToAccount(row, headers));

          const result = (await apiRequest(
            "POST",
            "/api/accounts/batch-import",
            { accounts }
          )) as unknown as {
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

          if (result.errors && result.errors.length > 0) {
            result.errors.forEach((err: { index: number; error: string }) => {
              console.error(`Row ${start + err.index + 2}: ${err.error}`);
            });
          }
        } catch (error) {
          failedCount += batchRows.length;
          console.error(`Failed to import batch ${batchIndex + 1}:`, error);
        }

        setImportProgress(Math.round(((end) / csvData.length) * 100));
      }

      setImportResults({ success: successCount, created: createdCount, updated: updatedCount, failed: failedCount });
      
      // Auto-register any discovered custom fields
      try {
        const accounts = csvData.map((row) => csvRowToAccount(row, headers));
        const allCustomFieldKeys = new Set();
        
        accounts.forEach((account: any) => {
          if (account.customFields && typeof account.customFields === 'object') {
            Object.keys(account.customFields).forEach(key => allCustomFieldKeys.add(key));
          }
        });

        if (allCustomFieldKeys.size > 0) {
          await apiRequest('POST', '/api/custom-fields/auto-register', {
            entityType: 'account',
            fieldKeys: Array.from(allCustomFieldKeys)
          });
        }
      } catch (error) {
        console.error('Failed to auto-register custom fields:', error);
        // Don't fail the whole import if custom field registration fails
      }

      setStage("complete");

      const messageParts = [];
      if (createdCount > 0) messageParts.push(`${createdCount} new account(s) created`);
      if (updatedCount > 0) messageParts.push(`${updatedCount} existing account(s) updated`);
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

  const downloadTemplate = () => {
    const template = generateAccountsTemplate();
    downloadCSV(
      template,
      `accounts_template_${new Date().toISOString().split("T")[0]}.csv`
    );

    toast({
      title: "Template Downloaded",
      description: "Accounts CSV template has been downloaded",
    });
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
      `account_import_errors_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const handleClose = () => {
    setStage("upload");
    setFile(null);
    setCsvData([]);
    setHeaders([]);
    setErrors([]);
    setImportProgress(0);
    setImportResults({ success: 0, created: 0, updated: 0, failed: 0 });
    onOpenChange(false);
  };

  return (
    
      
        
          Import Accounts from CSV
          
            Upload a CSV file to bulk import accounts.
          
        

        
          {stage === "upload" && (
            
              
                
                
                  Select a CSV file to import
                
                
                
                  
                    
                      
                      Select CSV File
                    
                  
                
              

              
                
                
                  Need a template? Download a sample CSV file
                  
                    
                    Download Template
                  
                
              
            
          )}

          {stage === "validate" && errors.length > 0 && (
            
              
                
                
                  Found {errors.length} validation error(s) in your CSV file.
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

          {stage === "preview" && (
            
              
                
                
                  Validation passed! Ready to import {csvData.length} account(s).
                
              

              
                Preview (first 5 rows)
                
                  
                    
                      
                        {headers.slice(0, 6).map((header, idx) => (
                          
                            {header}
                          
                        ))}
                      
                    
                    
                      {csvData.slice(0, 5).map((row, rowIdx) => (
                        
                          {row.slice(0, 6).map((cell, cellIdx) => (
                            
                              {cell || "-"}
                            
                          ))}
                        
                      ))}
                    
                  
                
              
            
          )}

          {stage === "importing" && (
            
              
                
                  Importing accounts... Please wait.
                
                
                
                  {importProgress}% complete
                
              
            
          )}

          {stage === "complete" && (
            
              
                
                
                  
                    Import completed!
                    {importResults.created > 0 && (
                      ✓ {importResults.created} new account(s) created
                    )}
                    {importResults.updated > 0 && (
                      ↻ {importResults.updated} existing account(s) updated
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
              
              
                Import {csvData.length} Account(s)
              
            
          )}

          {stage === "complete" && (
            Close
          )}
        
      
    
  );
}