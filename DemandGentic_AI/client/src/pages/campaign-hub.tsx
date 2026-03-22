import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CampaignsPage from "@/pages/campaigns";
import EmailCampaignsPage from "@/pages/email-campaigns";
// We will create this component in the next step
import PhoneCampaignsPage from "@/pages/phone-campaigns";

export default function CampaignsHub() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const tabFromUrl = searchParams.get('tab') || 'unified';

  const [activeTab, setActiveTab] = useState(tabFromUrl);
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(`/campaigns?tab=${activeTab}`);
  }, [activeTab, setLocation]);

  return (
    
      
        Unified
        Phone
        Email
      
      
        
      
      
        
      
      
        
      
    
  );
}