import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, Loader2, Download } from "lucide-react";

interface LeadForm {
  id: string;
  name: string;
  description?: string;
  requiredFields: string[];
  thankYouMessage?: string;
  redirectUrl?: string;
  assetUrl?: string;
  active: boolean;
}

export default function LeadFormPublicPage() {
  const { id } = useParams();
  const [submitted, setSubmitted] = useState(false);

  // Fetch form configuration
  const { data: leadForm, isLoading, error } = useQuery({
    queryKey: ["/api/lead-forms", id],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/public/lead-forms/${id}`);
      return await response.json();
    },
  });

  // Build dynamic schema based on required fields
  const getFormSchema = () => {
    const schemaFields: Record = {};
    
    if (!leadForm) return z.object({});

    leadForm.requiredFields.forEach((field) => {
      if (field === "email") {
        schemaFields[field] = z.string().email("Invalid email address");
      } else if (field === "redirectUrl" || field === "assetUrl") {
        schemaFields[field] = z.string().url().optional().or(z.literal(""));
      } else {
        schemaFields[field] = z.string().min(1, `${field} is required`);
      }
    });

    return z.object(schemaFields);
  };

  const formHandler = useForm({
    resolver: leadForm ? zodResolver(getFormSchema()) : undefined,
    defaultValues: leadForm?.requiredFields.reduce((acc, field) => {
      acc[field] = "";
      return acc;
    }, {} as Record) || {},
  });

  // Reset form when leadForm data loads
  useEffect(() => {
    if (leadForm) {
      const defaultValues = leadForm.requiredFields.reduce((acc, field) => {
        acc[field] = "";
        return acc;
      }, {} as Record);
      formHandler.reset(defaultValues);
    }
  }, [leadForm, formHandler]);

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: Record) => {
      const response = await apiRequest("POST", `/api/public/lead-forms/${id}/submit`, data);
      return await response.json();
    },
    onSuccess: (data) => {
      setSubmitted(true);
      
      // Redirect if URL is provided
      if (data.redirectUrl) {
        setTimeout(() => {
          window.location.href = data.redirectUrl;
        }, 2000);
      }
    },
  });

  const onSubmit = (data: Record) => {
    submitMutation.mutate(data);
  };

  const getFieldLabel = (fieldId: string) => {
    const labels: Record = {
      leadName: "Full Name",
      email: "Email Address",
      jobTitle: "Job Title",
      companyName: "Company Name",
      phone: "Phone Number",
      industry: "Industry",
      companySize: "Company Size",
      country: "Country",
      message: "Message",
    };
    return labels[fieldId] || fieldId;
  };

  const getFieldPlaceholder = (fieldId: string) => {
    const placeholders: Record = {
      leadName: "John Doe",
      email: "john@example.com",
      jobTitle: "Marketing Director",
      companyName: "Acme Corp",
      phone: "+1 (555) 123-4567",
      industry: "Technology",
      companySize: "50-200 employees",
      country: "United States",
      message: "Tell us more about your needs...",
    };
    return placeholders[fieldId] || "";
  };

  if (isLoading) {
    return (
      
        
      
    );
  }

  if (error || !leadForm) {
    return (
      
        
          
            Form Not Found
            
              This form does not exist or is no longer available.
            
          
        
      
    );
  }

  if (!leadForm.active) {
    return (
      
        
          
            Form Inactive
            
              This form is currently not accepting submissions.
            
          
        
      
    );
  }

  if (submitted) {
    return (
      
        
          
            
              
              
                Thank You!
                Your submission has been received
              
            
          
          
            {submitMutation.data?.thankYouMessage && (
              
                {submitMutation.data.thankYouMessage}
              
            )}
            
            {submitMutation.data?.assetUrl && (
              
                 window.open(submitMutation.data.assetUrl, '_blank')}
                  data-testid="button-download-asset"
                >
                  
                  Download Resource
                
              
            )}

            {submitMutation.data?.redirectUrl && (
              
                Redirecting you shortly...
              
            )}
          
        
      
    );
  }

  return (
    
      
        
          {leadForm.name}
          {leadForm.description && (
            {leadForm.description}
          )}
        
        
          
            
              {leadForm.requiredFields.map((fieldId) => (
                 (
                    
                      {getFieldLabel(fieldId)}
                      
                        {fieldId === "message" ? (
                          
                        ) : (
                          
                        )}
                      
                      
                    
                  )}
                />
              ))}

              
                {submitMutation.isPending && (
                  
                )}
                Submit
              

              {submitMutation.isError && (
                
                  Failed to submit form. Please try again.
                
              )}
            
          
        
      
    
  );
}