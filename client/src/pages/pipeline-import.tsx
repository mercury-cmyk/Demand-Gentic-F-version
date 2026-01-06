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
  const labels: Record<string, string> = {
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
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [csvData, setCsvData] = useState<string>("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [createMissingAccounts, setCreateMissingAccounts] = useState(true);
  const [createMissingContacts, setCreateMissingContacts] = useState(true);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [selectedFileName, setSelectedFileName] = useState<string>("");

  const { data: pipelines = [], isLoading: pipelinesLoading } = useQuery<Pipeline[]>({
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const mapping: Record<string, string> = {
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Pipeline Import
          </h1>
          <p className="text-muted-foreground mt-1" data-testid="text-page-description">
            Bulk import leads and create pipeline opportunities
          </p>
        </div>
        <Button variant="outline" onClick={downloadTemplate} data-testid="button-download-template">
          <Download className="mr-2 h-4 w-4" />
          Download Template
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Configuration</CardTitle>
            <CardDescription>Select the pipeline and stage for your opportunities</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pipeline" data-testid="label-pipeline">Pipeline</Label>
              <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
                <SelectTrigger id="pipeline" data-testid="select-pipeline">
                  <SelectValue placeholder="Select pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelinesLoading ? (
                    <SelectItem value="loading" disabled>Loading...</SelectItem>
                  ) : (
                    pipelines.map((pipeline) => (
                      <SelectItem key={pipeline.id} value={pipeline.id} data-testid={`option-pipeline-${pipeline.id}`}>
                        {pipeline.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedPipeline && (
              <div className="space-y-2">
                <Label htmlFor="stage" data-testid="label-stage">Stage</Label>
                <Select value={selectedStage} onValueChange={setSelectedStage}>
                  <SelectTrigger id="stage" data-testid="select-stage">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedPipeline.stageOrder.map((stage) => (
                      <SelectItem key={stage} value={stage} data-testid={`option-stage-${stage}`}>
                        {stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Checkbox
                id="createAccounts"
                checked={createMissingAccounts}
                onCheckedChange={(checked) => setCreateMissingAccounts(checked as boolean)}
                data-testid="checkbox-create-accounts"
              />
              <Label htmlFor="createAccounts" className="text-sm font-normal">
                Create missing accounts
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="createContacts"
                checked={createMissingContacts}
                onCheckedChange={(checked) => setCreateMissingContacts(checked as boolean)}
                data-testid="checkbox-create-contacts"
              />
              <Label htmlFor="createContacts" className="text-sm font-normal">
                Create missing contacts
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Input</CardTitle>
            <CardDescription>Upload a CSV file or paste data directly</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file-upload" data-testid="label-file-upload">Upload CSV File</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="w-full justify-start"
                  data-testid="button-choose-file"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {selectedFileName || 'Choose CSV file...'}
                </Button>
                <input
                  id="file-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-file-upload"
                />
              </div>
              {selectedFileName && (
                <p className="text-xs text-muted-foreground" data-testid="text-file-selected">
                  <Check className="inline h-3 w-3 mr-1 text-green-600" />
                  File will be automatically processed when selected
                </p>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="csv-text" data-testid="label-csv-text">Paste CSV Data</Label>
              <Textarea
                id="csv-text"
                placeholder="Lead Name,Job Title,Email,Company Name,Industry..."
                value={csvData}
                onChange={(e) => setCsvData(e.target.value)}
                rows={6}
                data-testid="textarea-csv-data"
              />
              <Button onClick={handleTextParse} variant="outline" size="sm" data-testid="button-parse">
                Parse Data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {columnMappings.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Column Mapping Detected</CardTitle>
                <CardDescription>Automatically mapped {columnMappings.length} CSV columns</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {columnMappings.map((mapping, index) => (
                <div key={index} className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50" data-testid={`mapping-${index}`}>
                  <Badge variant="outline" className="text-xs">{mapping.original}</Badge>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{getFieldLabel(mapping.mapped)}</span>
                </div>
              ))}
              {parsedRows.length > 0 && (parsedRows[0].firstName || parsedRows[0].lastName) && (
                <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-primary/10" data-testid="mapping-combined">
                  <Badge variant="outline" className="text-xs">First + Last Name</Badge>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{getFieldLabel('leadName')}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {parsedRows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Preview</CardTitle>
                <CardDescription>{parsedRows.length} rows ready to import</CardDescription>
              </div>
              <Button 
                onClick={handleImport} 
                disabled={!selectedPipelineId || !selectedStage || importMutation.isPending}
                data-testid="button-import"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import {parsedRows.length} Opportunities
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Lead Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Source Asset</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 50).map((row) => (
                    <TableRow key={row._rowIndex} data-testid={`row-preview-${row._rowIndex}`}>
                      <TableCell data-testid={`text-row-number-${row._rowIndex}`}>{row._rowIndex}</TableCell>
                      <TableCell data-testid={`text-lead-name-${row._rowIndex}`} className="font-medium">{row.leadName}</TableCell>
                      <TableCell data-testid={`text-email-${row._rowIndex}`} className="text-xs">{row.email}</TableCell>
                      <TableCell data-testid={`text-company-${row._rowIndex}`}>{row.companyName}</TableCell>
                      <TableCell data-testid={`text-job-title-${row._rowIndex}`} className="text-sm text-muted-foreground">{row.jobTitle || '-'}</TableCell>
                      <TableCell data-testid={`text-source-asset-${row._rowIndex}`} className="text-xs text-muted-foreground max-w-xs truncate">{row.sourceAsset || '-'}</TableCell>
                      <TableCell data-testid={`text-date-${row._rowIndex}`} className="text-sm">{row.dateCaptured || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsedRows.length > 50 && (
                <p className="text-sm text-muted-foreground mt-2 text-center" data-testid="text-preview-limit">
                  Showing first 50 of {parsedRows.length} rows
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {parsedRows.length === 0 && csvData && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <AlertCircle className="mx-auto h-12 w-12 mb-2" />
              <p data-testid="text-no-valid-rows">No valid rows found. Please check your data format.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
