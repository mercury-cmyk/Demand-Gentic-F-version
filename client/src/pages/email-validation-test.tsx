
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertCircle, Mail, Loader2 } from "lucide-react";

interface ValidationResult {
  email: string;
  duration: string;
  result: {
    status: string;
    confidence: number;
    summary: {
      syntaxValid: boolean;
      hasMx: boolean;
      hasSmtp: boolean;
      smtpAccepted: boolean;
      isRole: boolean;
      isFree: boolean;
      isDisposable: boolean;
      deliverability: string;
      isDeliverable: boolean;
    };
    trace: any;
  };
  metadata: {
    skipSmtpValidation: boolean;
    dnsCacheTtl: string;
    dnsTimeout: string;
    smtpTimeout: string;
  };
}

export default function EmailValidationTest() {
  const [email, setEmail] = useState("");
  const [testResult, setTestResult] = useState<ValidationResult | null>(null);

  const validateMutation = useMutation({
    mutationFn: async (emailToTest: string) => {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/test/email-validation/single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: emailToTest,
          skipCache: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Validation failed' }));
        throw new Error(errorData.error || errorData.message || 'Validation failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setTestResult(data);
    },
  });

  const handleTest = () => {
    if (email) {
      validateMutation.mutate(email);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && email && !validateMutation.isPending) {
      handleTest();
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-primary rounded-2xl p-8 text-white shadow-smooth-lg">
        <h1 className="text-3xl font-bold">Email Validation Test</h1>
        <p className="mt-2 text-white/90">Test the email validation engine</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Test Email Address</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              type="email"
              placeholder="Enter email to test..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
              disabled={validateMutation.isPending}
            />
            <Button 
              onClick={handleTest} 
              disabled={!email || validateMutation.isPending}
            >
              {validateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Test Email
                </>
              )}
            </Button>
          </div>

          {validateMutation.isError && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive rounded-lg">
              <p className="text-sm text-destructive">
                Error: {validateMutation.error instanceof Error ? validateMutation.error.message : 'Validation failed'}
              </p>
            </div>
          )}

          {testResult && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">Validation Results</h3>
                <Badge variant={testResult.result.summary.isDeliverable ? "default" : "destructive"}>
                  {testResult.result.status}
                </Badge>
                <Badge variant="outline">
                  Confidence: {testResult.result.confidence}%
                </Badge>
                <Badge variant="outline">
                  {testResult.duration}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Format Valid</span>
                      {testResult.result.summary.syntaxValid ? (
                        <CheckCircle className="h-5 w-5 text-success" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive" />
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Domain Valid</span>
                      {testResult.result.summary.hasMx ? (
                        <CheckCircle className="h-5 w-5 text-success" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive" />
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">SMTP Responded</span>
                      {testResult.result.summary.hasSmtp ? (
                        <CheckCircle className="h-5 w-5 text-success" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">SMTP Accepted</span>
                      {testResult.result.summary.smtpAccepted ? (
                        <CheckCircle className="h-5 w-5 text-success" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive" />
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Role Account</span>
                      {testResult.result.summary.isRole ? (
                        <AlertCircle className="h-5 w-5 text-warning" />
                      ) : (
                        <CheckCircle className="h-5 w-5 text-success" />
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Free Provider</span>
                      {testResult.result.summary.isFree ? (
                        <AlertCircle className="h-5 w-5 text-warning" />
                      ) : (
                        <CheckCircle className="h-5 w-5 text-success" />
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Disposable</span>
                      {testResult.result.summary.isDisposable ? (
                        <XCircle className="h-5 w-5 text-destructive" />
                      ) : (
                        <CheckCircle className="h-5 w-5 text-success" />
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Deliverability</span>
                      <Badge variant={testResult.result.summary.isDeliverable ? "default" : "destructive"}>
                        {testResult.result.summary.deliverability}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {testResult.metadata && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Configuration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SMTP Validation:</span>
                        <span>{testResult.metadata.skipSmtpValidation ? 'Disabled' : 'Enabled'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">DNS Cache TTL:</span>
                        <span>{testResult.metadata.dnsCacheTtl}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">DNS Timeout:</span>
                        <span>{testResult.metadata.dnsTimeout}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SMTP Timeout:</span>
                        <span>{testResult.metadata.smtpTimeout}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
