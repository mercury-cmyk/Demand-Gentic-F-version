import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Sparkles, AlertCircle, CheckCircle, Info, Loader2, Edit } from 'lucide-react';
import { PageShell } from '@/components/patterns/page-shell';
import { apiRequest } from '@/lib/queryClient';

interface ExtractedData {
  projectName?: string;
  clientName?: string;
  targetAudience?: {
    jobTitles?: string[];
    industries?: string[];
    companySize?: { min?: number; max?: number };
    geography?: string[];
  };
  channels?: string[];
  volume?: number;
  costPerLead?: number;
  timeline?: { start?: string; end?: string };
  deliveryMethods?: string[];
  specialRequirements?: string[];
}

interface ExtractionResult {
  intentId: string;
  extractedData: ExtractedData;
  confidenceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  validationErrors: string[];
  validationWarnings: string[];
  status: string;
  processingTime: number;
}

export default function AIProjectCreatorPage() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [editedData, setEditedData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const extractMutation = useMutation({
    mutationFn: async (prompt: string): Promise => {
      const response = await apiRequest('POST', '/api/ai/extract-project', { prompt });
      return response.json();
    },
    onSuccess: (data: ExtractionResult) => {
      setResult(data);
      setEditedData(data.extractedData);
      setIsEditing(false);
    },
  });

  const handleExtract = () => {
    if (prompt.length  {
    const variants = {
      high: 'default',
      medium: 'secondary',
      low: 'destructive',
    } as const;

    return (
      
        {level.toUpperCase()} ({score}%)
      
    );
  };

  return (
    
      
        
          
            
              
                
                Natural Language Input
              
              
                Describe your project in plain English. Include details about the client, target audience, channels, volume, and timeline.
              
            
            
               setPrompt(e.target.value)}
                disabled={extractMutation.isPending}
              />

              
                
                  {prompt.length} / 5000 characters
                
                
                  {extractMutation.isPending ? (
                    <>
                      
                      Extracting...
                    
                  ) : (
                    <>
                      
                      Extract Project Data
                    
                  )}
                
              

              {extractMutation.isError && (
                
                  
                  
                    Failed to extract project data. Please try again.
                  
                
              )}
            
          

          {result && (
            
              
                
                  Extraction Quality
                  {getConfidenceBadge(result.confidenceLevel, result.confidenceScore)}
                
                
                  Processed in {result.processingTime}ms
                
              
              
                {result.validationErrors.length > 0 && (
                  
                    
                    
                      Validation Errors:
                      
                        {result.validationErrors.map((error, i) => (
                          {error}
                        ))}
                      
                    
                  
                )}

                {result.validationWarnings.length > 0 && (
                  
                    
                    
                      Warnings:
                      
                        {result.validationWarnings.map((warning, i) => (
                          {warning}
                        ))}
                      
                    
                  
                )}

                {result.validationErrors.length === 0 && (
                  
                    
                    
                      Extraction successful! Ready for review.
                    
                  
                )}
              
            
          )}
        

        
          {result ? (
            
              
                Extracted Project Data
                
                  Review and edit the extracted information before creating the project
                
              
              
                {result.extractedData.projectName && (
                  
                    Project Name
                    {result.extractedData.projectName}
                  
                )}

                {result.extractedData.clientName && (
                  
                    Client Name
                    {result.extractedData.clientName}
                  
                )}

                

                {result.extractedData.targetAudience && (
                  
                    Target Audience
                    
                    {result.extractedData.targetAudience.jobTitles && result.extractedData.targetAudience.jobTitles.length > 0 && (
                      
                        Job Titles
                        
                          {result.extractedData.targetAudience.jobTitles.map((title, i) => (
                            
                              {title}
                            
                          ))}
                        
                      
                    )}

                    {result.extractedData.targetAudience.industries && result.extractedData.targetAudience.industries.length > 0 && (
                      
                        Industries
                        
                          {result.extractedData.targetAudience.industries.map((industry, i) => (
                            
                              {industry}
                            
                          ))}
                        
                      
                    )}

                    {result.extractedData.targetAudience.geography && result.extractedData.targetAudience.geography.length > 0 && (
                      
                        Geography
                        
                          {result.extractedData.targetAudience.geography.map((geo, i) => (
                            
                              {geo}
                            
                          ))}
                        
                      
                    )}

                    {result.extractedData.targetAudience.companySize && (
                      
                        Company Size
                        
                          {result.extractedData.targetAudience.companySize.min || 0} - {result.extractedData.targetAudience.companySize.max || '∞'} employees
                        
                      
                    )}
                  
                )}

                

                {result.extractedData.channels && result.extractedData.channels.length > 0 && (
                  
                    Channels
                    
                      {result.extractedData.channels.map((channel, i) => (
                        
                          {channel}
                        
                      ))}
                    
                  
                )}

                {result.extractedData.volume && (
                  
                    Target Volume
                    {result.extractedData.volume.toLocaleString()} leads
                  
                )}

                {result.extractedData.costPerLead && (
                  
                    Cost Per Lead
                    ${result.extractedData.costPerLead.toFixed(2)}
                  
                )}

                {result.extractedData.timeline && (
                  
                    Timeline
                    
                      {result.extractedData.timeline.start || 'Not specified'} → {result.extractedData.timeline.end || 'Not specified'}
                    
                  
                )}

                {result.extractedData.deliveryMethods && result.extractedData.deliveryMethods.length > 0 && (
                  
                    Delivery Methods
                    
                      {result.extractedData.deliveryMethods.map((method, i) => (
                        
                          {method}
                        
                      ))}
                    
                  
                )}

                {result.extractedData.specialRequirements && result.extractedData.specialRequirements.length > 0 && (
                  
                    Special Requirements
                    
                      {result.extractedData.specialRequirements.map((req, i) => (
                        {req}
                      ))}
                    
                  
                )}

                
                   0}
                  >
                    
                    Create Project
                  
                   setResult(null)} data-testid="button-reset">
                    Start Over
                  
                
              
            
          ) : (
            
              
                
                No Data Yet
                
                  Enter a project description and click "Extract Project Data" to see the AI-extracted information here.
                
              
            
          )}
        
      
    
  );
}