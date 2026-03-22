import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload, FileText, ArrowLeft, CheckCircle2, AlertCircle, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function VerificationSuppressionUploadPage() {
  const { campaignId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [isGlobal, setIsGlobal] = useState(!campaignId);

  const { data: campaign } = useQuery({
    queryKey: ["/api/verification-campaigns", campaignId],
    enabled: !!campaignId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (csvData: string) => {
      const endpoint = isGlobal 
        ? `/api/verification-suppression/global/upload`
        : `/api/verification-campaigns/${campaignId}/suppression/upload`;
      
      const res = await apiRequest("POST", endpoint, { csvData });
      return res.json();
    },
    onSuccess: (data) => {
      setUploadResult(data);
      queryClient.invalidateQueries({ 
        queryKey: ["/api/verification-campaigns", campaignId, "suppression"] 
      });
      toast({
        title: "Upload Complete",
        description: `Added ${data.added} suppression entries, skipped ${data.skipped}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload suppression file",
        variant: "destructive",
      });
    },
  });

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
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvData = e.target?.result as string;
      uploadMutation.mutate(csvData);
    };
    reader.readAsText(file);
  };

  return (
    
      
         navigate(campaignId ? `/verification/campaigns/${campaignId}` : "/verification/campaigns")}
          data-testid="button-back"
        >
          
          Back
        
        
          
            
            Upload Suppression List
          
          
            {isGlobal ? "Global Suppression (all campaigns)" : `Campaign: ${(campaign as any)?.name || 'Loading...'}`}
          
        
      

      {campaignId && (
        
          
            
              
                
                  Global Suppression
                
                
                  Apply this suppression list to all campaigns (not just this one)
                
              
              
            
          
        
      )}

      
        
          CSV Format Guidelines
          Accepted column headers for suppression matching
        
        
          
            
              
              
                Matching Methods: The system will suppress contacts that match on any of these fields:
                Email, CAV ID, CAV User ID, or Name+Company combination.
              
            

            
              Suppression Fields (at least one required)
              
                • email or emailAddress - Email address to suppress
                • cavId - CAV ID for suppression matching
                • cavUserId - CAV User ID for suppression matching
              
            

            
              Name+Company Suppression (all fields required for this method)
              
                • firstName - Contact first name
                • lastName - Contact last name
                • companyName or company or accountName - Company name
              
            

            
              Example CSV Format
              
                Email,CAV ID,First Name,Last Name,Company Name
                spam@example.com,,,,
                ,CAV12345,,,
                bad@email.com,CAV67890,John,Doe,Acme Corp
                ,,,Jane,Smith,TechCo Inc
              
            

            
              
                Note: Column headers are case-insensitive and spaces/special characters are ignored.
                Each row must have at least one valid suppression field (email, CAV ID, CAV User ID, or all three name/company fields).
              
            
          
        
      

      
        
          Upload File
          Select and upload your suppression CSV file
        
        
          
            
              
              Select CSV File
              
            
            
            {file && (
              
                
                {file.name}
              
            )}
          

          {file && (
            
              {uploadMutation.isPending ? (
                <>
                  
                  Uploading...
                
              ) : (
                <>
                  
                  Upload Suppression List
                
              )}
            
          )}

          {uploadMutation.isPending && (
            
          )}
        
      

      {uploadResult && (
        
          
            
              
              Upload Results
            
          
          
            
              
                Total Rows
                {uploadResult.total}
              
              
                Added
                {uploadResult.added}
              
              
                Skipped
                {uploadResult.skipped}
              
            

            {uploadResult.errors && uploadResult.errors.length > 0 && (
              
                
                  
                  Errors
                
                
                  {uploadResult.errors.map((error: string, idx: number) => (
                    
                      {error}
                    
                  ))}
                
              
            )}

            
               navigate(campaignId ? `/verification/campaigns/${campaignId}` : "/verification/campaigns")}
                data-testid="button-view-campaign"
              >
                Back to Campaign
              
            
          
        
      )}
    
  );
}