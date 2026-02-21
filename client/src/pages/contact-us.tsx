import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, MapPin, Send } from "lucide-react";
import { BRAND } from "@shared/brand-messaging";

export default function ContactUsPage() {
  const { toast } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    message: "",
  });

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitted(true);
    toast({
      title: "Message received",
      description: "Thanks for reaching out. Our team will follow up shortly.",
    });
    setFormData({ name: "", email: "", company: "", message: "" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/40">
      <div className="max-w-6xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-4">
          <Badge variant="outline" className="text-xs uppercase tracking-widest">Contact Us</Badge>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Let’s talk about your pipeline goals.</h1>
          <p className="text-muted-foreground max-w-2xl">
            Share a few details and we’ll connect you with the right specialist. We typically respond within one business day.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader>
              <CardTitle>Send a message</CardTitle>
              <CardDescription>Tell us what you’re building and how we can help.</CardDescription>
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
                <div>
                  <label className="text-sm font-medium">Company</label>
                  <Input
                    value={formData.company}
                    onChange={(e) => handleChange("company", e.target.value)}
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">How can we help?</label>
                  <Textarea
                    value={formData.message}
                    onChange={(e) => handleChange("message", e.target.value)}
                    placeholder="Tell us about your goals, timelines, or requirements."
                    rows={5}
                    required
                  />
                </div>
                <Button type="submit" className="gap-2">
                  <Send className="h-4 w-4" />
                  Send message
                </Button>
                {isSubmitted && (
                  <p className="text-sm text-emerald-600">Thanks! We’ll be in touch soon.</p>
                )}
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Reach us directly</CardTitle>
              <CardDescription>Prefer a quick call or email? We’re ready.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  <p className="font-medium">Email</p>
                  <a className="text-muted-foreground hover:text-foreground" href={`mailto:${BRAND.domains.email.contact}`}>
                    {BRAND.domains.email.contact}
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  <p className="font-medium">Phone</p>
                  <a className="text-muted-foreground hover:text-foreground" href={`tel:${BRAND.company.phone}`}>
                    {BRAND.company.phone}
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  <p className="font-medium">Headquarters</p>
                  <p className="text-muted-foreground">{BRAND.company.location}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
