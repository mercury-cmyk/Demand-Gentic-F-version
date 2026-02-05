import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, 
  Loader2, 
  Copy, 
  Check, 
  RefreshCw,
  Save
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PageNav } from "@/components/layout/page-nav";

export default function AIContentGeneratorPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [contentType, setContentType] = useState("email_template");
  const [targetAudience, setTargetAudience] = useState("");
  const [industry, setIndustry] = useState("");
  const [valueProp, setValueProp] = useState("");
  const [tone, setTone] = useState("professional");
  const [ctaGoal, setCtaGoal] = useState("");
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string[]>([]);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [isCopied, setIsCopied] = useState(false);

  const handleGenerate = async () => {
    if (!targetAudience || !valueProp) {
      toast({
        title: "Missing Information",
        description: "Please fill in target audience and value proposition",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      // Simulate AI generation (replace with real API call)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const variants = [
        generateMockContent(contentType, "variant1"),
        generateMockContent(contentType, "variant2"),
        generateMockContent(contentType, "variant3"),
      ];
      
      setGeneratedContent(variants);
      setSelectedVariant(0);
      
      toast({
        title: "Content Generated!",
        description: `Generated ${variants.length} variations for you to choose from`,
      });
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Failed to generate content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateMockContent = (type: string, variant: string) => {
    const templates: Record<string, string> = {
      email_template: `Subject: ${valueProp} - Transform Your ${industry} Strategy

Hi {{contact.first_name}},

Are you looking to ${valueProp.toLowerCase()}? Our solution is specifically designed for ${targetAudience}.

Key Benefits:
• Increase efficiency by 40%
• Reduce costs significantly
• Scale your operations seamlessly

${ctaGoal ? `Ready to get started? ${ctaGoal}` : 'Schedule a demo today!'}

Best regards,
Your Team`,
      
      landing_page: `<h1>${valueProp}</h1>
<p>Designed specifically for ${targetAudience} in the ${industry} industry</p>

<h2>Why Choose Us?</h2>
<ul>
  <li>Proven track record</li>
  <li>Industry-leading support</li>
  <li>Scalable solutions</li>
</ul>

<button>${ctaGoal || 'Get Started'}</button>`,

      social_post: `🚀 Exciting news for ${targetAudience}!

${valueProp}

Perfect for ${industry} professionals looking to:
✅ Save time
✅ Boost productivity  
✅ Drive results

${ctaGoal || 'Learn more'} 👇

#${industry.replace(/\s/g, '')} #Innovation #B2B`,
    };

    return templates[type] || templates.email_template;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent[selectedVariant]);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    toast({
      title: "Copied!",
      description: "Content copied to clipboard",
    });
  };

  const handleSaveAsAsset = async () => {
    try {
      await apiRequest("POST", "/api/content-assets", {
        assetType: contentType,
        title: `${contentType.replace('_', ' ')} - ${new Date().toLocaleDateString()}`,
        description: `AI-generated content for ${targetAudience}`,
        content: generatedContent[selectedVariant],
        tone,
        targetAudience,
        ctaGoal,
        approvalStatus: "draft",
      });

      toast({
        title: "Asset Saved!",
        description: "Content saved to your library",
      });
      
      setLocation("/content-studio");
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to save asset. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header with Navigation */}
      <div className="p-6 border-b border-border/60 bg-card/70 backdrop-blur-sm">
        <PageNav 
          breadcrumbs={[
            { label: "Content Studio", href: "/content-studio" },
            { label: "AI Generator" }
          ]}
          showBack={true}
          className="mb-4"
        />
        <div>
          <h1 className="text-2xl font-bold">AI Content Generator</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create high-quality content powered by AI
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input Panel */}
            <Card className="bg-card/70 border border-border/60">
              <CardHeader>
                <CardTitle>Content Parameters</CardTitle>
                <CardDescription>Define your content requirements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Content Type</Label>
                  <Select value={contentType} onValueChange={setContentType}>
                    <SelectTrigger data-testid="select-content-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email_template">Email Template</SelectItem>
                      <SelectItem value="landing_page">Landing Page</SelectItem>
                      <SelectItem value="social_post">Social Media Post</SelectItem>
                      <SelectItem value="ad_creative">Ad Copy</SelectItem>
                      <SelectItem value="blog_post">Blog Post</SelectItem>
                      <SelectItem value="call_script">Call Script</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Target Audience Persona</Label>
                  <Input
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="e.g., B2B Marketing Directors"
                    data-testid="input-audience"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Industry / Product Info</Label>
                  <Input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g., SaaS, Healthcare, Finance"
                    data-testid="input-industry"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Key Value Proposition</Label>
                  <Textarea
                    value={valueProp}
                    onChange={(e) => setValueProp(e.target.value)}
                    placeholder="What makes your offering unique?"
                    rows={3}
                    data-testid="textarea-value-prop"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tone of Voice</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger data-testid="select-tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="conversational">Conversational</SelectItem>
                      <SelectItem value="insightful">Insightful</SelectItem>
                      <SelectItem value="persuasive">Persuasive</SelectItem>
                      <SelectItem value="technical">Technical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>CTA Goal (Optional)</Label>
                  <Input
                    value={ctaGoal}
                    onChange={(e) => setCtaGoal(e.target.value)}
                    placeholder="e.g., Download eBook, Schedule Demo"
                    data-testid="input-cta"
                  />
                </div>

                <Button 
                  onClick={handleGenerate} 
                  disabled={isGenerating}
                  className="w-full"
                  size="lg"
                  data-testid="button-generate"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Content
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Output Panel */}
            <Card className="bg-card/70 border border-border/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Generated Content</CardTitle>
                    <CardDescription>Review and refine AI-generated variations</CardDescription>
                  </div>
                  {generatedContent.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleCopy}>
                        {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleGenerate}>
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {generatedContent.length > 0 ? (
                  <div className="space-y-4">
                    <Tabs value={`variant-${selectedVariant}`} onValueChange={(v) => setSelectedVariant(parseInt(v.split('-')[1]))}>
                        <TabsList className="w-full">
                          {generatedContent.map((_, i) => (
                            <TabsTrigger key={i} value={`variant-${i}`} className="flex-1">
                              Variant {i + 1}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      {generatedContent.map((content, i) => (
                        <TabsContent key={i} value={`variant-${i}`} className="mt-4">
                          <div className="p-4 bg-muted/40 rounded-lg font-mono text-sm whitespace-pre-wrap border border-border/60">
                            {content}
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>

                    <div className="flex gap-2">
                      <Button onClick={handleSaveAsAsset} className="flex-1" data-testid="button-save-asset">
                        <Save className="w-4 h-4 mr-2" />
                        Save as Asset
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setLocation(`/content-studio/create?content=${encodeURIComponent(generatedContent[selectedVariant])}`)}
                        className="flex-1"
                      >
                        Edit & Customize
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-center text-muted-foreground">
                    <div>
                      <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Fill in the parameters and click Generate to create content</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* AI Insights */}
          {generatedContent.length > 0 && (
            <Card className="bg-card/70 border border-border/60">
              <CardHeader>
                <CardTitle>AI Content Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-muted/40 rounded-lg border border-border/60">
                    <div className="text-sm text-muted-foreground">Readability Score</div>
                    <div className="text-2xl font-bold mt-1">85/100</div>
                    <Badge className="mt-2 bg-success/10 text-success border-success/20">Excellent</Badge>
                  </div>
                  <div className="p-4 bg-muted/40 rounded-lg border border-border/60">
                    <div className="text-sm text-muted-foreground">Tone Match</div>
                    <div className="text-2xl font-bold mt-1 capitalize">{tone}</div>
                    <Badge className="mt-2 bg-info/10 text-info border-info/20">Matched</Badge>
                  </div>
                  <div className="p-4 bg-muted/40 rounded-lg border border-border/60">
                    <div className="text-sm text-muted-foreground">Estimated Engagement</div>
                    <div className="text-2xl font-bold mt-1">High</div>
                    <Badge className="mt-2 bg-primary/10 text-primary border-primary/20">Optimized</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
