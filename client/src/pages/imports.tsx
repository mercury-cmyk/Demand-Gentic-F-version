import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileText, Download, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { BulkImport } from "@shared/schema";

export default function ImportsPage() {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: imports = [], isLoading } = useQuery<BulkImport[]>({
    queryKey: ['/api/imports'],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user?.id) throw new Error("User not authenticated");
      
      // Read the CSV file to count rows
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const totalRows = Math.max(0, lines.length - 1); // Subtract header row
      
      // Create the import record
      const importData = {
        fileName: file.name,
        fileUrl: null, // Would be S3 URL in production
        status: 'processing' as const,
        totalRows,
        uploadedById: user.id,
      };

      return await apiRequest('POST', '/api/imports', importData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/imports'], refetchType: 'active' });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      toast({
        title: "Success",
        description: "Import job created and processing started",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start import",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast({
          title: "Invalid file",
          description: "Please upload a CSV file",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      processing: { variant: "default", label: "Processing" },
      completed: { variant: "outline", label: "Completed" },
      failed: { variant: "destructive", label: "Failed" },
    };
    const { variant, label } = config[status] || config.processing;
    return <Badge variant={variant}>{label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-8 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-imports">Bulk Imports</h1>
          <p className="text-muted-foreground mt-1">
            Upload and track bulk contact/account imports with validation
          </p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-import">
          <Upload className="mr-2 h-4 w-4" />
          Upload CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import Guidelines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• CSV files should include headers: email, firstName, lastName, jobTitle, company, phone</p>
          <p>• Phone numbers will be validated against E.164 format</p>
          <p>• Email addresses will be verified for DNS validity</p>
          <p>• Maximum file size: 100MB (supports 100k+ records)</p>
          <p>• Processing happens in chunks to ensure system stability</p>
          <p>• Failed records will be available for download with error details</p>
        </CardContent>
      </Card>

      {imports.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="No imports yet"
          description="Upload your first CSV file to begin bulk importing contacts"
          action={
            <Button onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-first">
              <Upload className="mr-2 h-4 w-4" />
              Upload CSV
            </Button>
          }
        />
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>File Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total Rows</TableHead>
                <TableHead>Success</TableHead>
                <TableHead>Errors</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((imp) => {
                const successRate = imp.totalRows ? 
                  Math.round((imp.successRows || 0) / imp.totalRows * 100) : 0;
                
                return (
                  <TableRow key={imp.id} data-testid={`row-import-${imp.id}`}>
                    <TableCell>{getStatusIcon(imp.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium font-mono text-sm" data-testid={`text-filename-${imp.id}`}>
                          {imp.fileName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(imp.status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {imp.totalRows ? imp.totalRows.toLocaleString() : '-'}
                    </TableCell>
                    <TableCell>
                      <span className="text-green-600 font-medium">
                        {imp.successRows?.toLocaleString() || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-red-600 font-medium">
                        {imp.errorRows?.toLocaleString() || 0}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(imp.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {imp.status === 'processing' && imp.totalRows && (
                          <div className="flex-1">
                            <Progress value={successRate} className="h-2" />
                            <p className="text-xs text-muted-foreground mt-1">
                              {successRate}%
                            </p>
                          </div>
                        )}
                        {imp.errorFileUrl && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            data-testid={`button-download-errors-${imp.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent data-testid="dialog-upload-import">
          <DialogHeader>
            <DialogTitle>Upload Bulk Import File</DialogTitle>
            <DialogDescription>
              Select a CSV file to import contacts or accounts
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
                data-testid="input-file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {selectedFile ? selectedFile.name : 'Click to select CSV file'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Maximum 100MB • CSV format only
                </p>
              </label>
            </div>

            {selectedFile && (
              <div className="bg-muted p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm font-medium">{selectedFile.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setUploadDialogOpen(false);
                setSelectedFile(null);
              }}
              data-testid="button-cancel-upload"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploadMutation.isPending}
              data-testid="button-confirm-upload"
            >
              {uploadMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Upload & Process
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
