import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, CalendarDays, FileText } from "lucide-react";

export default function ProposalRequestPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    timeline: "",
    budget: "",
    details: "",
  });

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    toast({
      title: "Proposal request received",
      description: "We’ll review your details and respond with next steps.",
    });
    setFormData({
      name: "",
      email: "",
      company: "",
      role: "",
      timeline: "",
      budget: "",
      details: "",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/40">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-4">
          <Badge variant="outline" className="text-xs uppercase tracking-widest">Proposal Request</Badge>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Request a tailored proposal.</h1>
          <p className="text-muted-foreground max-w-2xl">
            Tell us about your goals, timeline, and success criteria. We’ll craft a proposal that matches your ABM objectives.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader>
              <CardTitle>Project details</CardTitle>
              <CardDescription>Share the essentials so we can scope accurately.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Full Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      placeholder="Jane Doe"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Work Email</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      placeholder="jane@company.com"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Company</label>
                    <Input
                      value={formData.company}
                      onChange={(e) => handleChange("company", e.target.value)}
                      placeholder="Company name"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Role / Title</label>
                    <Input
                      value={formData.role}
                      onChange={(e) => handleChange("role", e.target.value)}
                      placeholder="VP Demand Gen"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Desired timeline</label>
                    <Input
                      value={formData.timeline}
                      onChange={(e) => handleChange("timeline", e.target.value)}
                      placeholder="Launch in 6-8 weeks"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Budget range</label>
                    <Input
                      value={formData.budget}
                      onChange={(e) => handleChange("budget", e.target.value)}
                      placeholder="$25k - $50k / quarter"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Goals & success criteria</label>
                  <Textarea
                    value={formData.details}
                    onChange={(e) => handleChange("details", e.target.value)}
                    placeholder="Describe campaign goals, target accounts, lead volume, or any constraints."
                    rows={5}
                    required
                  />
                </div>
                <Button type="submit" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Request proposal
                </Button>
                {submitted && (
                  <p className="text-sm text-emerald-600">Thanks! We’ll follow up within one business day.</p>
                )}
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>What happens next</CardTitle>
              <CardDescription>We’ll align quickly and move fast.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  <p className="font-medium">Review & scope</p>
                  <p className="text-muted-foreground">We confirm goals, target accounts, and success metrics.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CalendarDays className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  <p className="font-medium">Timeline alignment</p>
                  <p className="text-muted-foreground">Expect a tailored proposal and delivery plan.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  <p className="font-medium">Proposal delivery</p>
                  <p className="text-muted-foreground">We provide clear scope, pricing, and next steps.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
