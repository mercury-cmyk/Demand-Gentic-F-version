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
  const { id } = useParams<{ id: string }>();
  const [submitted, setSubmitted] = useState(false);

  // Fetch form configuration
  const { data: leadForm, isLoading, error } = useQuery<LeadForm>({
    queryKey: ["/api/lead-forms", id],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/public/lead-forms/${id}`);
      return await response.json();
    },
  });

  // Build dynamic schema based on required fields
  const getFormSchema = () => {
    const schemaFields: Record<string, z.ZodString> = {};
    
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
    }, {} as Record<string, string>) || {},
  });

  // Reset form when leadForm data loads
  useEffect(() => {
    if (leadForm) {
      const defaultValues = leadForm.requiredFields.reduce((acc, field) => {
        acc[field] = "";
        return acc;
      }, {} as Record<string, string>);
      formHandler.reset(defaultValues);
    }
  }, [leadForm, formHandler]);

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
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

  const onSubmit = (data: Record<string, string>) => {
    submitMutation.mutate(data);
  };

  const getFieldLabel = (fieldId: string) => {
    const labels: Record<string, string> = {
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
    const placeholders: Record<string, string> = {
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !leadForm) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Form Not Found</CardTitle>
            <CardDescription>
              This form does not exist or is no longer available.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!leadForm.active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Form Inactive</CardTitle>
            <CardDescription>
              This form is currently not accepting submissions.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div>
                <CardTitle>Thank You!</CardTitle>
                <CardDescription>Your submission has been received</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {submitMutation.data?.thankYouMessage && (
              <p className="text-sm text-muted-foreground">
                {submitMutation.data.thankYouMessage}
              </p>
            )}
            
            {submitMutation.data?.assetUrl && (
              <div>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => window.open(submitMutation.data.assetUrl, '_blank')}
                  data-testid="button-download-asset"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Resource
                </Button>
              </div>
            )}

            {submitMutation.data?.redirectUrl && (
              <p className="text-xs text-muted-foreground text-center">
                Redirecting you shortly...
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle>{leadForm.name}</CardTitle>
          {leadForm.description && (
            <CardDescription>{leadForm.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <Form {...formHandler}>
            <form onSubmit={formHandler.handleSubmit(onSubmit)} className="space-y-4">
              {leadForm.requiredFields.map((fieldId) => (
                <FormField
                  key={fieldId}
                  control={formHandler.control}
                  name={fieldId}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{getFieldLabel(fieldId)}</FormLabel>
                      <FormControl>
                        {fieldId === "message" ? (
                          <Textarea
                            placeholder={getFieldPlaceholder(fieldId)}
                            {...field}
                            data-testid={`input-${fieldId}`}
                          />
                        ) : (
                          <Input
                            type={fieldId === "email" ? "email" : "text"}
                            placeholder={getFieldPlaceholder(fieldId)}
                            {...field}
                            data-testid={`input-${fieldId}`}
                          />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}

              <Button 
                type="submit" 
                className="w-full"
                disabled={submitMutation.isPending}
                data-testid="button-submit-form"
              >
                {submitMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Submit
              </Button>

              {submitMutation.isError && (
                <p className="text-sm text-destructive text-center">
                  Failed to submit form. Please try again.
                </p>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
