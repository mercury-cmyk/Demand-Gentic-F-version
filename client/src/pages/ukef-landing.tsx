import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  CheckCircle2, 
  ArrowRight, 
  Download, 
  Phone, 
  FileText, 
  Globe, 
  ShieldCheck,
  Building2,
  TrendingUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function UkefLandingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    phone: "",
    consent: false,
    interestedInCall: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Parse query parameters to pre-fill form
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFormData(prev => ({
      ...prev,
      firstName: params.get("firstName") || "",
      lastName: params.get("lastName") || "",
      email: params.get("email") || "",
      company: params.get("company") || "",
      phone: params.get("phone") || "",
    }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.consent) {
      toast({
        title: "Consent Required",
        description: "Please consent to receive the white paper.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
      toast({
        title: "Success",
        description: "Thank you for your interest. The white paper will be sent to your email shortly.",
      });
    }, 1500);
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Simple Header */}
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 items-center">
            <div className="flex items-center gap-2 font-bold">
              <Building2 className="h-6 w-6 text-blue-700" />
              <span>UK Export Finance</span>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 bg-green-100 p-3 rounded-full w-fit">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl">Thank You!</CardTitle>
              <CardDescription>
                Your request has been received.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-muted-foreground">
                We've sent the "Leading with Finance" white paper to <strong>{formData.email}</strong>.
              </p>
              {formData.interestedInCall && (
                <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 border border-blue-100">
                  <p className="font-medium">Next Steps</p>
                  <p>One of our specialists will be in touch shortly to discuss your export finance needs.</p>
                </div>
              )}
              <Button 
                variant="outline" 
                className="w-full mt-4"
                onClick={() => setLocation("/")}
              >
                Return to Home
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl">
             <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-700 text-white">
                <Building2 className="h-5 w-5" />
             </div>
             <span>UK Export Finance</span>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-blue-900 to-blue-800 text-white py-20 px-4 md:px-8">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-sm font-medium text-blue-100">
                <Globe className="mr-2 h-4 w-4" />
                Global Growth Opportunities
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
                Minimize Risk. <br/>Maximize Growth.
              </h1>
              <p className="text-lg text-blue-100 max-w-lg">
                Discover how government-backed finance can help your UK business win contracts, 
                fulfill orders, and get paid. Get your free copy of the "Leading with Finance" white paper.
              </p>
              <div className="flex flex-wrap gap-4 pt-4">
                <div className="flex items-center gap-2 text-sm text-blue-200">
                  <CheckCircle2 className="h-5 w-5 text-green-400" /> Government Backed
                </div>
                <div className="flex items-center gap-2 text-sm text-blue-200">
                  <CheckCircle2 className="h-5 w-5 text-green-400" /> Export Support
                </div>
                <div className="flex items-center gap-2 text-sm text-blue-200">
                  <CheckCircle2 className="h-5 w-5 text-green-400" /> Financial Security
                </div>
              </div>
            </div>

            {/* Form Card */}
            <div className="relative">
              <Card className="shadow-2xl border-0">
                <CardHeader className="bg-slate-50 border-b pb-4">
                  <CardTitle className="text-xl text-slate-900">Get Your Free White Paper</CardTitle>
                  <CardDescription>
                    Verify your details below to receive the guide instantly.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input 
                          id="firstName" 
                          value={formData.firstName}
                          onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                          required 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input 
                          id="lastName" 
                          value={formData.lastName}
                          onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                          required 
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Work Email</Label>
                      <Input 
                        id="email" 
                        type="email" 
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        required 
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="company">Company Name</Label>
                      <Input 
                        id="company" 
                        value={formData.company}
                        onChange={(e) => setFormData({...formData, company: e.target.value})}
                        required 
                      />
                    </div>

                    <div className="pt-4 space-y-4">
                      <div className="flex items-start space-x-3">
                         <Checkbox 
                            id="consent" 
                            checked={formData.consent}
                            onCheckedChange={(checked) => setFormData({...formData, consent: checked as boolean})}
                         />
                         <div className="grid gap-1.5 leading-none">
                            <label
                                htmlFor="consent"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                                I consent to receive the "Leading with Finance" white paper via email.
                            </label>
                            <p className="text-xs text-muted-foreground">
                                You can unsubscribe at any time.
                            </p>
                         </div>
                      </div>

                      <div className="flex items-start space-x-3 p-3 bg-blue-50 rounded-md border border-blue-100">
                         <Checkbox 
                            id="call-interest" 
                            checked={formData.interestedInCall}
                            onCheckedChange={(checked) => setFormData({...formData, interestedInCall: checked as boolean})}
                         />
                         <div className="grid gap-1.5 leading-none">
                            <label
                                htmlFor="call-interest"
                                className="text-sm font-medium leading-none text-blue-900"
                            >
                                I am interested in a brief follow-up call to discuss export finance needs.
                            </label>
                         </div>
                      </div>
                    </div>

                    <Button type="submit" className="w-full bg-blue-700 hover:bg-blue-800" disabled={isSubmitting}>
                      {isSubmitting ? "Processing..." : "Send Me The White Paper"}
                      {!isSubmitting && <Download className="ml-2 h-4 w-4" />}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Key Talking Points Section */}
        <section className="py-20 px-4 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">What's Inside The Guide?</h2>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                Essential knowledge for UK businesses looking to expand internationally while managing financial risk.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <Card className="border-t-4 border-t-blue-600 shadow-lg bg-slate-50/50">
                <CardHeader>
                  <TrendingUp className="h-10 w-10 text-blue-600 mb-2" />
                  <CardTitle>Financing Options</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">
                    Explore comprehensive financing solutions designed to help you fulfill export contracts and manage working capital effectively.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-t-4 border-t-blue-600 shadow-lg bg-slate-50/50">
                <CardHeader>
                  <ShieldCheck className="h-10 w-10 text-blue-600 mb-2" />
                  <CardTitle>Contract Solutions</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">
                    Learn how to protect your business against non-payment and other risks associated with international trade contracts.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-t-4 border-t-blue-600 shadow-lg bg-slate-50/50">
                <CardHeader>
                  <FileText className="h-10 w-10 text-blue-600 mb-2" />
                  <CardTitle>Financial Resources</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">
                    Access government-backed financial resources and support systems available specifically for UK exporters like you.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
        
        {/* About Section */}
        <section className="py-16 bg-slate-100">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">About UK Export Finance</h2>
            <p className="text-lg text-slate-700 mb-8">
                We are the UK's export credit agency. We help UK companies to:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                <div className="flex items-start gap-3">
                    <div className="bg-white p-2 rounded shadow-sm">
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900">Win Contracts</h3>
                        <p className="text-sm text-slate-600">By providing attractive financing terms to your buyers.</p>
                    </div>
                </div>
                <div className="flex items-start gap-3">
                    <div className="bg-white p-2 rounded shadow-sm">
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900">Fulfill Orders</h3>
                        <p className="text-sm text-slate-600">By supporting working capital loans.</p>
                    </div>
                </div>
                <div className="flex items-start gap-3">
                    <div className="bg-white p-2 rounded shadow-sm">
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900">Get Paid</h3>
                        <p className="text-sm text-slate-600">By insuring against buyer default.</p>
                    </div>
                </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-slate-900 text-slate-400 py-8 px-4 text-center">
          <div className="max-w-6xl mx-auto flex flex-col items-center">
            <div className="flex items-center gap-2 font-bold text-white mb-4">
               <Building2 className="h-5 w-5" />
               <span>UK Export Finance</span>
            </div>
            <p className="text-sm mb-4">
              Helping UK businesses succeed in international markets.
            </p>
            <div className="text-xs text-slate-500">
              © {new Date().getFullYear()} ukexportfinance.gov.uk. All rights reserved.
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
