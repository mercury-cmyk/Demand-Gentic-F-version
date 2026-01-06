import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function CompanyProfileForm() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSave = () => {
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      toast({
        title: "Profile Updated",
        description: "Company intelligence has been saved successfully.",
      });
    }, 1000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Identity</CardTitle>
        <CardDescription>
          Define your organization's core identity to ground AI decision making.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input id="companyName" placeholder="Acme Corp" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" placeholder="SaaS, Healthcare, etc." />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="vision">Vision Statement</Label>
          <Textarea 
            id="vision" 
            placeholder="To be the world's leading provider of..." 
            className="min-h-[80px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mission">Mission Statement</Label>
          <Textarea 
            id="mission" 
            placeholder="We empower businesses to..." 
            className="min-h-[80px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="valueProps">Core Value Propositions</Label>
          <Textarea 
            id="valueProps" 
            placeholder="- 24/7 Support&#10;- AI-Driven Insights&#10;- Enterprise Security" 
            className="min-h-[120px]"
          />
          <p className="text-xs text-muted-foreground">List your key differentiators.</p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            {loading ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
