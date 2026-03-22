import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Check, AlertCircle, Download, Info } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import Papa from "papaparse";
import type { PipelineImportRow } from "@shared/schema";

interface Pipeline {
  id: string;
  name: string;
  stageOrder: string[];
  defaultCurrency: string;
}

interface ParsedRow extends PipelineImportRow {
  _rowIndex: number;
  firstName?: string;
  lastName?: string;
}

interface ColumnMapping {
  original: string;
  mapped: string;
}

// Convert internal field names to user-friendly labels
const getFieldLabel = (fieldName: string): string => {
  const labels: Record = {
    'leadName': 'Lead Name',
    'firstName': 'First Name',
    'lastName': 'Last Name',
    'jobTitle': 'Job Title',
    'email': 'Email',
    'companyName': 'Company Name',
    'industry': 'Industry',
    'companyDescription': 'Company Description',
    'hqLocation': 'HQ Location',
    'sourceAsset': 'Source Asset',
    'dateCaptured': 'Date Captured',
    'opportunityName': 'Opportunity Name',
    'amount': 'Amount',
    'probability': 'Probability',
  };
  return labels[fieldName] || fieldName;
};

export default function PipelineImportPage() {
  const { toast } = useToast();
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [selectedStage, setSelectedStage] = useState("");
  const [csvData, setCsvData] = useState("");
  const [parsedRows, setParsedRows] = useState([]);
  const [createMissingAccounts, setCreateMissingAccounts] = useState(true);
  const [createMissingContacts, setCreateMissingContacts] = useState(true);
  const [columnMappings, setColumnMappings] = useState([]);
  const [selectedFileName, setSelectedFileName] = useState("");

  const { data: pipelines = [], isLoading: pipelinesLoading } = useQuery({
    queryKey: ["/api/pipelines"],
  });

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);

  const importMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/pipelines/import", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to import");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      
      const { results } = data;
      toast({
        title: "Import successful",
        description: `Created ${results.opportunitiesCreated} opportunities (${results.accountsCreated} new accounts, ${results.contactsCreated} new contacts)`,
      });

      if (results.errors.length > 0) {
        toast({
          title: `${results.errors.length} rows had errors`,
          description: "Check the results for details",
          variant: "destructive",
        });
      }

      // Reset form
      setCsvData("");
      setParsedRows([]);
      setSelectedStage("");
      setSelectedFileName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvData(text);
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    // Reset state at the start of each parse
    setColumnMappings([]);
    const detectedMappings: ColumnMapping[] = [];
    
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => {
        // Normalize headers to match expected format
        const normalized = header.trim().toLowerCase().replace(/\s+/g, '');
        const mapping: Record = {
          'leadname': 'leadName',
          'firstname': 'firstName',
          'lastname': 'lastName',
          'jobtitle': 'jobTitle',
          'title': 'jobTitle',
          'email': 'email',
          'companyname': 'companyName',
          'company': 'companyName',
          'industry': 'industry',
          'companydescription': 'companyDescription',
          'hqlocation': 'hqLocation',
          'sourceasset': 'sourceAsset',
          'asset': 'sourceAsset',
          'datecaptured': 'dateCaptured',
          'date': 'dateCaptured',
          'opportunityname': 'opportunityName',
          'amount': 'amount',
          'probability': 'probability',
        };
        
        const mappedValue = mapping[normalized] || header;
        if (mapping[normalized]) {
          detectedMappings.push({ original: header, mapped: mappedValue });
        }
        
        return mappedValue;
      },
      complete: (results) => {
        const rows = results.data.map((row: any, index: number) => {
          // Combine First Name and Last Name into Lead Name if available
          let leadName = row.leadName || '';
          if (!leadName && (row.firstName || row.lastName)) {
            leadName = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
          }

          return {
            ...row,
            leadName,
            _rowIndex: index + 1,
            probability: row.probability ? parseInt(row.probability) : undefined,
          };
        }) as ParsedRow[];
        
        const validRows = rows.filter(row => row.email && row.companyName);
        setParsedRows(validRows);
        setColumnMappings(detectedMappings);
        
        if (validRows.length > 0) {
          toast({
            title: "CSV parsed successfully",
            description: `Found ${validRows.length} valid rows ready to import`,
          });
        } else if (rows.length > 0) {
          toast({
            title: "No valid rows found",
            description: "Rows must have at least an email and company name",
            variant: "destructive",
          });
        }
      },
      error: (error: Error) => {
        toast({
          title: "Parse error",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  const handleTextParse = () => {
    parseCSV(csvData);
  };

  const handleImport = () => {
    if (!selectedPipelineId || !selectedStage || parsedRows.length === 0) {
      toast({
        title: "Validation error",
        description: "Please select a pipeline, stage, and provide data to import",
        variant: "destructive",
      });
      return;
    }

    const rows = parsedRows.map(({ _rowIndex, ...row }) => row);

    importMutation.mutate({
      pipelineId: selectedPipelineId,
      stage: selectedStage,
      rows,
      createMissingAccounts,
      createMissingContacts,
    });
  };

  const downloadTemplate = () => {
    const template = `Lead Name,Job Title,Email,Company Name,Industry,Company Description,HQ Location,Source Asset,Date Captured
John Doe,CEO,john@example.com,Example Corp,Technology,Example company description,New York,ABM Guide,2025-01-15

First Name,Last Name,Email,Company,Title,Asset,Date
Danielle,van der Ende,dvanderende@visualfabriq.com,Visualfabriq,Director of Product Marketing,The Executive Guide to ABM-Driven Growth,2025-10-28`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pipeline_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    
      
        
          
            Pipeline Import
          
          
            Bulk import leads and create pipeline opportunities
          
        
        
          
          Download Template
        
      

      
        
          
            Pipeline Configuration
            Select the pipeline and stage for your opportunities
          
          
            
              Pipeline
              
                
                  
                
                
                  {pipelinesLoading ? (
                    Loading...
                  ) : (
                    pipelines.map((pipeline) => (
                      
                        {pipeline.name}
                      
                    ))
                  )}
                
              
            

            {selectedPipeline && (
              
                Stage
                
                  
                    
                  
                  
                    {selectedPipeline.stageOrder.map((stage) => (
                      
                        {stage}
                      
                    ))}
                  
                
              
            )}

            
               setCreateMissingAccounts(checked as boolean)}
                data-testid="checkbox-create-accounts"
              />
              
                Create missing accounts
              
            

            
               setCreateMissingContacts(checked as boolean)}
                data-testid="checkbox-create-contacts"
              />
              
                Create missing contacts
              
            
          
        

        
          
            Data Input
            Upload a CSV file or paste data directly
          
          
            
              Upload CSV File
              
                 document.getElementById('file-upload')?.click()}
                  className="w-full justify-start"
                  data-testid="button-choose-file"
                >
                  
                  {selectedFileName || 'Choose CSV file...'}
                
                
              
              {selectedFileName && (
                
                  
                  File will be automatically processed when selected
                
              )}
            

            
              
                
              
              
                Or
              
            

            
              Paste CSV Data
               setCsvData(e.target.value)}
                rows={6}
                data-testid="textarea-csv-data"
              />
              
                Parse Data
              
            
          
        
      

      {columnMappings.length > 0 && (
        
          
            
              
              
                Column Mapping Detected
                Automatically mapped {columnMappings.length} CSV columns
              
            
          
          
            
              {columnMappings.map((mapping, index) => (
                
                  {mapping.original}
                  →
                  {getFieldLabel(mapping.mapped)}
                
              ))}
              {parsedRows.length > 0 && (parsedRows[0].firstName || parsedRows[0].lastName) && (
                
                  First + Last Name
                  →
                  {getFieldLabel('leadName')}
                
              )}
            
          
        
      )}

      {parsedRows.length > 0 && (
        
          
            
              
                Preview
                {parsedRows.length} rows ready to import
              
              
                {importMutation.isPending ? (
                  <>
                    
                    Importing...
                  
                ) : (
                  <>
                    
                    Import {parsedRows.length} Opportunities
                  
                )}
              
            
          
          
            
              
                
                  
                    Row
                    Lead Name
                    Email
                    Company
                    Job Title
                    Source Asset
                    Date
                  
                
                
                  {parsedRows.slice(0, 50).map((row) => (
                    
                      {row._rowIndex}
                      {row.leadName}
                      {row.email}
                      {row.companyName}
                      {row.jobTitle || '-'}
                      {row.sourceAsset || '-'}
                      {row.dateCaptured || '-'}
                    
                  ))}
                
              
              {parsedRows.length > 50 && (
                
                  Showing first 50 of {parsedRows.length} rows
                
              )}
            
          
        
      )}

      {parsedRows.length === 0 && csvData && (
        
          
            
              
              No valid rows found. Please check your data format.
            
          
        
      )}
    
  );
}