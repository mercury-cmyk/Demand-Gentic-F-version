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
  ArrowLeft,
  Save
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
  const [generatedContent, setGeneratedContent] = useState([]);
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
    const templates: Record = {
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
      
      landing_page: `${valueProp}
Designed specifically for ${targetAudience} in the ${industry} industry

Why Choose Us?

  Proven track record
  Industry-leading support
  Scalable solutions


${ctaGoal || 'Get Started'}`,

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
    
      {/* Header */}
      
        
           setLocation("/content-studio")}>
            
          
          
            AI Content Generator
            
              Create high-quality content powered by AI
            
          
        
      

      
        
          
            {/* Input Panel */}
            
              
                Content Parameters
                Define your content requirements
              
              
                
                  Content Type
                  
                    
                      
                    
                    
                      Email Template
                      Landing Page
                      Social Media Post
                      Ad Copy
                      Blog Post
                      Call Script
                    
                  
                

                
                  Target Audience Persona
                   setTargetAudience(e.target.value)}
                    placeholder="e.g., B2B Marketing Directors"
                    data-testid="input-audience"
                  />
                

                
                  Industry / Product Info
                   setIndustry(e.target.value)}
                    placeholder="e.g., SaaS, Healthcare, Finance"
                    data-testid="input-industry"
                  />
                

                
                  Key Value Proposition
                   setValueProp(e.target.value)}
                    placeholder="What makes your offering unique?"
                    rows={3}
                    data-testid="textarea-value-prop"
                  />
                

                
                  Tone of Voice
                  
                    
                      
                    
                    
                      Formal
                      Conversational
                      Insightful
                      Persuasive
                      Technical
                    
                  
                

                
                  CTA Goal (Optional)
                   setCtaGoal(e.target.value)}
                    placeholder="e.g., Download eBook, Schedule Demo"
                    data-testid="input-cta"
                  />
                

                
                  {isGenerating ? (
                    <>
                      
                      Generating...
                    
                  ) : (
                    <>
                      
                      Generate Content
                    
                  )}
                
              
            

            {/* Output Panel */}
            
              
                
                  
                    Generated Content
                    Review and refine AI-generated variations
                  
                  {generatedContent.length > 0 && (
                    
                      
                        {isCopied ?  : }
                      
                      
                        
                      
                    
                  )}
                
              
              
                {generatedContent.length > 0 ? (
                  
                     setSelectedVariant(parseInt(v.split('-')[1]))}>
                        
                          {generatedContent.map((_, i) => (
                            
                              Variant {i + 1}
                            
                          ))}
                        
                      {generatedContent.map((content, i) => (
                        
                          
                            {content}
                          
                        
                      ))}
                    

                    
                      
                        
                        Save as Asset
                      
                       setLocation(`/content-studio/create?content=${encodeURIComponent(generatedContent[selectedVariant])}`)}
                        className="flex-1"
                      >
                        Edit & Customize
                      
                    
                  
                ) : (
                  
                    
                      
                      Fill in the parameters and click Generate to create content
                    
                  
                )}
              
            
          

          {/* AI Insights */}
          {generatedContent.length > 0 && (
            
              
                AI Content Insights
              
              
                
                  
                    Readability Score
                    85/100
                    Excellent
                  
                  
                    Tone Match
                    {tone}
                    Matched
                  
                  
                    Estimated Engagement
                    High
                    Optimized
                  
                
              
            
          )}
        
      
    
  );
}