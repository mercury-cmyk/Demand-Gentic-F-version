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
  const [selectedFile, setSelectedFile] = useState(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: imports = [], isLoading } = useQuery({
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

  const handleFileChange = (e: React.ChangeEvent) => {
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
        return ;
      case 'failed':
        return ;
      case 'processing':
        return ;
      default:
        return ;
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record = {
      processing: { variant: "default", label: "Processing" },
      completed: { variant: "outline", label: "Completed" },
      failed: { variant: "destructive", label: "Failed" },
    };
    const { variant, label } = config[status] || config.processing;
    return {label};
  };

  if (isLoading) {
    return (
      
        
          
            
            
          
          
        
        
          {[1, 2, 3].map((i) => (
            
              
                
              
              
                
              
            
          ))}
        
      
    );
  }

  return (
    
      
        
          Bulk Imports
          
            Upload and track bulk contact/account imports with validation
          
        
         setUploadDialogOpen(true)} data-testid="button-upload-import">
          
          Upload CSV
        
      

      
        
          Import Guidelines
        
        
          • CSV files should include headers: email, firstName, lastName, jobTitle, company, phone
          • Phone numbers will be validated against E.164 format
          • Email addresses will be verified for DNS validity
          • Maximum file size: 100MB (supports 100k+ records)
          • Processing happens in chunks to ensure system stability
          • Failed records will be available for download with error details
        
      

      {imports.length === 0 ? (
         setUploadDialogOpen(true)} data-testid="button-upload-first">
              
              Upload CSV
            
          }
        />
      ) : (
        
          
            
              
                
                File Name
                Status
                Total Rows
                Success
                Errors
                Uploaded
                Actions
              
            
            
              {imports.map((imp) => {
                const successRate = imp.totalRows ? 
                  Math.round((imp.successRows || 0) / imp.totalRows * 100) : 0;
                
                return (
                  
                    {getStatusIcon(imp.status)}
                    
                      
                        
                        
                          {imp.fileName}
                        
                      
                    
                    {getStatusBadge(imp.status)}
                    
                      {imp.totalRows ? imp.totalRows.toLocaleString() : '-'}
                    
                    
                      
                        {imp.successRows?.toLocaleString() || 0}
                      
                    
                    
                      
                        {imp.errorRows?.toLocaleString() || 0}
                      
                    
                    
                      {new Date(imp.createdAt).toLocaleDateString()}
                    
                    
                      
                        {imp.status === 'processing' && imp.totalRows && (
                          
                            
                            
                              {successRate}%
                            
                          
                        )}
                        {imp.errorFileUrl && (
                          
                            
                          
                        )}
                      
                    
                  
                );
              })}
            
          
        
      )}

      
        
          
            Upload Bulk Import File
            
              Select a CSV file to import contacts or accounts
            
          

          
            
              
              
                
                
                  {selectedFile ? selectedFile.name : 'Click to select CSV file'}
                
                
                  Maximum 100MB • CSV format only
                
              
            

            {selectedFile && (
              
                
                  
                    
                    {selectedFile.name}
                  
                  
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  
                
              
            )}
          

          
             {
                setUploadDialogOpen(false);
                setSelectedFile(null);
              }}
              data-testid="button-cancel-upload"
            >
              Cancel
            
            
              {uploadMutation.isPending && (
                
              )}
              Upload & Process
            
          
        
      
    
  );
}